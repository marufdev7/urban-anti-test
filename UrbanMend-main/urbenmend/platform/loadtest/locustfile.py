"""The T10.4 representative load profile, and the NFR-2 gate that makes it a release check.

Run it against the seeded dataset (`manage.py seed_load_dataset`), never against real data:

    docker compose --profile loadtest run --rm loadgen \\
      locust -f urbenmend/platform/loadtest/locustfile.py --headless \\
      -u 25 -r 5 -t 5m --csv .loadtest/a7

**What makes this a gate rather than a report.** Locust's own exit code only reflects whether it
ran, so a run that blew through every latency budget still exits 0. The `quitting` hook below
sets `environment.process_exit_code = 1` when p95 breaches `LOADTEST_P95_MS` or when requests
failed. That hook is the entire reason this can gate a release — it is what replaces k6's native
`thresholds`, which was the one real advantage k6 had here.

**Why sessions come from a CSV.** ⚠️ The harness never calls `/auth/login`. `auth_anon` is
10/15m per IP and `auth_identity` 5/15m per identifier, and a load generator is one IP — a
logging-in harness would measure the throttle within seconds. Relaxing those buckets to work
around it would also destroy the thing T10.1 exists to verify, so sessions are minted
out-of-band by `seed_load_dataset` and replayed as cookies here.

**What must be raised for the run.** Only the submission buckets, and only for this run:
`SUBMISSION_THROTTLE_RATE_REPORT`, `_MEDIA`, `_IP`. `submit_ip` at its default 120/1h would cap
the whole generator at two writes a minute. ⚠️ These overrides are never deployed and never
committed to any settings file — see `docs/09-operations.md` § T10.4.

**Coordinates and slugs are read, never hardcoded** — from `.loadtest/geography.json`, written
by the seeder. Baked-in coordinates would survive a boundary change and turn every submission
into `422 OUT_OF_CITY`, which a load test happily reports as a very fast write path.
"""

from __future__ import annotations

import csv
import json
import os
import random
import uuid
from collections.abc import Iterator
from itertools import cycle
from pathlib import Path
from typing import Any, ClassVar

from locust import HttpUser, between, events, task

# NFR-2 [doc: prd §NFR-2]: "interactive pages respond in under 2 seconds at prototype scale".
# The only numeric latency target any doc states, so it is the only one asserted. Overridable
# so the ramp run can be recorded without the gate firing, and so the gate itself can be
# proven to fail (set it to 1).
P95_BUDGET_MS = float(os.environ.get("LOADTEST_P95_MS", "2000"))

# Failure tolerance is zero by default: at A7 scale, on seeded data, with throttles raised for
# the run, there is no legitimate source of 4xx/5xx. A non-zero value here would let a
# systematically failing endpoint hide behind a passing latency number.
MAX_FAILURE_RATIO = float(os.environ.get("LOADTEST_MAX_FAILURE_RATIO", "0.0"))

SESSIONS_PATH = Path(os.environ.get("LOADTEST_SESSIONS", ".loadtest/sessions.csv"))
GEOGRAPHY_PATH = Path(os.environ.get("LOADTEST_GEOGRAPHY", ".loadtest/geography.json"))

API = "/api/v1"

# The published `?sort=` spellings (API §6.5), exercised so the queue's ORDER BY is measured
# rather than assumed — `severity` and `corroborationCount` sort on annotated aggregates, which
# is the expensive case and the one FR-19 puts in front of an Authority.
#
# ⚠️ Literals, not an import from `urbenmend.issues.pagination`: this module is imported by
# locust under gevent in the `loadgen` container and must not pull Django in. The cost of that
# is drift, so `test_loadtest_profile.py` asserts every token here is still in the real
# `SORT_CHOICES` — a sort the API rejects turns this group into a fast wall of `400`s, which a
# load run reports as an excellent p95 for a query it never ran. (Observed: `-severity`, the
# spelling this plan was drafted against, is not a valid choice.)
QUEUE_SORTS: tuple[str, ...] = ("severity", "age", "-createdAt", "corroborationCount")


class SeedDataMissingError(RuntimeError):
    """Raised at import time when the seeded handoff files are absent.

    Failing at import is deliberate: a harness that started anyway would report a wall of
    401s and 422s as "results", and someone would read the p95 off it.
    """


def _load_sessions() -> list[dict[str, str]]:
    if not SESSIONS_PATH.exists():
        raise SeedDataMissingError(
            f"{SESSIONS_PATH} not found. Run:\n"
            "  LOADTEST_SEED_ENABLED=1 python manage.py seed_load_dataset\n"
            "The load profile authenticates by replaying seeded session cookies; it "
            "deliberately cannot log in (auth throttles are left at production rates)."
        )
    with SESSIONS_PATH.open(newline="", encoding="utf-8") as handle:
        rows = [dict(row) for row in csv.DictReader(handle)]
    if not rows:
        raise SeedDataMissingError(f"{SESSIONS_PATH} has no session rows.")
    return rows


def _load_geography() -> dict[str, Any]:
    if not GEOGRAPHY_PATH.exists():
        raise SeedDataMissingError(
            f"{GEOGRAPHY_PATH} not found. Run seed_load_dataset first — it publishes the "
            "bbox, hotspots and category slugs that were actually seeded, so the harness "
            "cannot submit coordinates outside the served city."
        )
    return json.loads(GEOGRAPHY_PATH.read_text(encoding="utf-8"))


_SESSIONS = _load_sessions()
_GEOGRAPHY = _load_geography()

# ⚠️ Identities are handed out round-robin from a shared iterator rather than picked at random,
# so N Locust users occupy N distinct sessions. Random assignment collides, and colliding users
# share a `submit_report` bucket (that throttle is per-user), so part of the fleet would be
# measuring the throttle again by a different route.
_CITIZEN_POOL: Iterator[dict[str, str]] = cycle(
    [row for row in _SESSIONS if row["role"] == "citizen"]
)
_AUTHORITY_ROWS = [row for row in _SESSIONS if row["role"] == "authority"]
# An empty dict stands in when no Authority was seeded, so `on_start` can raise a message that
# names the cause rather than a bare StopIteration from an exhausted `cycle([])`.
_AUTHORITY_POOL: Iterator[dict[str, str]] = cycle(_AUTHORITY_ROWS or [{}])

_HOTSPOTS: list[dict[str, float]] = _GEOGRAPHY["hotspots"]
_CATEGORY_SLUGS: list[str] = _GEOGRAPHY["categorySlugs"]
_BBOX: list[float] = _GEOGRAPHY["bbox"]


class _SessionUser(HttpUser):
    """Shared cookie/CSRF wiring. Abstract — Locust must not instantiate it directly."""

    abstract = True
    pool: ClassVar[Iterator[dict[str, str]] | None] = None

    def on_start(self) -> None:
        if self.pool is None:  # pragma: no cover — every concrete subclass sets one.
            raise SeedDataMissingError(f"{type(self).__name__} declared no session pool")
        identity = next(self.pool)
        if not identity:
            raise SeedDataMissingError(
                f"{type(self).__name__} found no seeded identity for its role. Re-run "
                "seed_load_dataset with a non-zero count for that role."
            )
        self.identity = identity
        session_cookie = os.environ.get("DJANGO_SESSION_COOKIE_NAME", "sessionid")
        self.client.cookies.set(session_cookie, identity["session_key"])
        # ⚠️ The same 32-char secret in the cookie and the header. Django's double-submit check
        # unmasks a 64-char token but compares a 32-char one directly, so an unmasked pair
        # matches — the seeder verifies this against `csrf._does_token_match`. There is no
        # `ensure_csrf_cookie` view to fetch a token from, which is why the harness carries one.
        self.client.cookies.set("csrftoken", identity["csrf_token"])
        self.client.headers.update({"X-CSRFToken": identity["csrf_token"]})


class CitizenUser(_SessionUser):
    """FR-1 submission plus own-report tracking — the write path under concurrency."""

    weight = 3
    wait_time = between(1, 4)
    pool = _CITIZEN_POOL

    @task(3)
    def submit_report(self) -> None:
        hotspot = random.choice(_HOTSPOTS)  # noqa: S311 — load shaping, not a security choice.
        self.client.post(
            f"{API}/reports",
            json={
                "description": (
                    "Load-test submission: surface damage reported near a known hotspot."
                ),
                "location": {
                    # Jitter keeps submissions from stacking on one coordinate while staying
                    # well inside the ~450 m the seeder used, so they remain in the city.
                    "lng": hotspot["lng"] + random.uniform(-0.002, 0.002),  # noqa: S311
                    "lat": hotspot["lat"] + random.uniform(-0.002, 0.002),  # noqa: S311
                },
                "category": random.choice(_CATEGORY_SLUGS),  # noqa: S311
                "language": "en",
            },
            headers={
                # ⚠️ A fresh key per submission. Reusing one would be served from the Redis
                # idempotency record on every call after the first, so the run would measure
                # the cache instead of the write path — and report an excellent p95 for a
                # pipeline that never ran.
                "Idempotency-Key": str(uuid.uuid4()),
            },
            # One name for the group, so p95 is computed per endpoint rather than per URL.
            name="POST /reports",
        )

    @task(1)
    def list_own_reports(self) -> None:
        self.client.get(f"{API}/reports?limit=20", name="GET /reports")


class AuthorityUser(_SessionUser):
    """The BR-26-scoped triage queue — A7's 'tens of concurrent authority users'."""

    weight = 2
    wait_time = between(2, 6)
    pool = _AUTHORITY_POOL

    @task(3)
    def browse_queue(self) -> None:
        """Page the queue by cursor, because page 2+ is where pagination costs show up."""
        status = random.choice(["triaged", "acknowledged", "in_progress"])  # noqa: S311
        sort = random.choice(QUEUE_SORTS)  # noqa: S311
        with self.client.get(
            f"{API}/issues?status={status}&sort={sort}&limit=20",
            name="GET /issues (queue)",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")
                return
            response.success()
            try:
                body = response.json()
            except ValueError:
                return
            cursor = (body.get("page") or {}).get("nextCursor")
            if cursor:
                # ⚠️ The same `sort` as page 1. A cursor encodes the sort keys it was cut on, so
                # changing the sort mid-walk is a client bug, not extra coverage.
                self.client.get(
                    f"{API}/issues?status={status}&sort={sort}&limit=20&cursor={cursor}",
                    name="GET /issues (queue page 2)",
                )
            self._issue_ids = [row["id"] for row in body.get("data", []) if "id" in row]

    @task(2)
    def open_issue(self) -> None:
        ids = getattr(self, "_issue_ids", [])
        if not ids:
            return
        self.client.get(
            f"{API}/issues/{random.choice(ids)}",  # noqa: S311
            name="GET /issues/{id}",
        )


class AnonMapUser(HttpUser):
    """Public unauthenticated reads (Q7): the map bbox and the public issue list.

    Not a `_SessionUser` — these paths are anonymous by design, and sending a session cookie
    would quietly measure the authenticated path instead.
    """

    weight = 2
    wait_time = between(1, 3)

    @task(3)
    def map_bbox(self) -> None:
        # ⚠️ The full boundary extent at low zoom is the expensive case, and the one NFR-1 is
        # about: it is where a B-tree on `location` instead of the GiST index would show up as
        # a sequential scan. Sampling a small bbox would flatter the result.
        bbox = ",".join(str(v) for v in _BBOX)
        self.client.get(f"{API}/map/issues?bbox={bbox}&zoom=8", name="GET /map/issues")

    @task(1)
    def public_issues(self) -> None:
        self.client.get(f"{API}/issues?limit=20", name="GET /issues (public)")


@events.quitting.add_listener
def _assert_nfr_targets(environment: Any, **_kwargs: Any) -> None:
    """Fail the process when the run breached NFR-2 or saw failures.

    ⚠️ **This hook is what makes the run a gate.** Locust exits 0 for any run that completed,
    however bad the numbers, so without this a breach would be a line in a CSV that nobody
    diffed. Verify it works by running with `LOADTEST_P95_MS=1` and confirming a non-zero exit
    — a gate never observed to fail is not known to be a gate.
    """
    stats = environment.stats
    breaches: list[str] = []

    for entry in sorted(stats.entries.values(), key=lambda e: str(e.name)):
        if entry.num_requests == 0:
            continue
        p95 = entry.get_response_time_percentile(0.95)
        # ⚠️ Read the label off the entry, never off the dict key. `stats.entries` is keyed
        # `(name, method)`, so indexing `[1]` yields the HTTP verb — every breach line then reads
        # "GET: p95 …" and names no endpoint, which is a gate an operator cannot act on.
        # `entry.name` is the `name=` label each task sets, which already carries the verb.
        if p95 is not None and p95 > P95_BUDGET_MS:
            breaches.append(f"{entry.name}: p95 {p95:.0f} ms > {P95_BUDGET_MS:.0f} ms budget")

    total = stats.total
    if total.num_requests == 0:
        breaches.append("no requests were made — check the session cookies and target host")
    else:
        ratio = total.num_failures / total.num_requests
        if ratio > MAX_FAILURE_RATIO:
            breaches.append(
                f"failure ratio {ratio:.4f} > {MAX_FAILURE_RATIO:.4f} "
                f"({total.num_failures}/{total.num_requests} requests)"
            )

    if breaches:
        environment.process_exit_code = 1
        for breach in breaches:
            print(f"NFR GATE FAILED — {breach}")
    else:
        environment.process_exit_code = 0
        print(
            f"NFR GATE PASSED — all groups p95 <= {P95_BUDGET_MS:.0f} ms, "
            f"{total.num_failures}/{total.num_requests} failures"
        )
