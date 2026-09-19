"""Seed a representative dataset and pre-authenticated sessions for the T10.4 load test.

This exists because the load harness cannot create its own working conditions. Two obstacles
make an out-of-band seeder the only honest option:

⚠️ **The harness must never call `/auth/login`.** `auth_anon` is 10/15m per IP and
`auth_identity` is 5/15m per identifier (`settings/base.py`). A load generator is a single IP,
so a harness that logs in would spend its run measuring the throttle instead of the
application — and "fixing" that by relaxing the auth buckets would make the measurement
meaningless for the thing T10.1 exists to verify. Sessions are therefore minted here, written
to a CSV, and replayed as cookies.

⚠️ **No view calls `ensure_csrf_cookie`**, so the harness has no way to fetch a CSRF token
either. One secret per identity is generated here and carried in the CSV.

Deliberate deviations, both matching precedent elsewhere in the repo:

⚠️ **Bypasses `create_report()`** and `bulk_create`s instead — the same reasoning `ReportFactory`
records: routing thousands of fixtures through the service turns one validation bug into a
failure in unrelated suites, and the service's per-call overhead is not what T10.4 measures.
Boundary containment is still honoured (see `_hotspots`), because reports outside the city
would make every bbox and `ST_DWithin` measurement meaningless.

⚠️ **Does not import `factory_boy`** — that is dev-only and absent from `base.txt`, so a
factory-based seeder would not run in the runtime image. Plain ORM only.

⚠️ **Reports are written pre-triaged** (`classified_at` set, `severity_signal`, `category`,
`classification_source=fallback`). This is what keeps a 2000-report seed from spending real LLM
budget, and it is correct per the `is_classified` rule: the key is `classified_at`, not
`category`, so a seeded report is not re-queued by the T3.5 worker.

⚠️ **`--reports` is a target, not an increment.** Re-running tops the dataset up to that number
and adds nothing once it is met, and existing Issues are reused rather than duplicated. The
additive reading is the intuitive one and it defeats the point of `RANDOM_SEED`: two runs are
meant to produce the same geography so their p95 numbers are comparable, which they are not if
the second run silently doubled the row count. Shrinking is deliberately not supported — see
`_seed_reports_and_issues`.

⚠️ **The Issue count is derived from the report target, not fixed** (`REPORTS_PER_ISSUE`). The
authority triage queue is one of the three groups T10.4 measures and its cost tracks Issues, not
Reports — a fixed handful of hotspots put 2000 reports into 24 Issues, so every status filter fit
in one page and the queue read measured nothing.
"""

from __future__ import annotations

import csv
import json
import os
import random
from argparse import ArgumentParser
from datetime import timedelta
from importlib import import_module
from pathlib import Path
from typing import Any

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.http import HttpRequest
from django.middleware.csrf import CSRF_ALLOWED_CHARS
from django.utils import timezone
from django.utils.crypto import get_random_string

from urbenmend.classification.models import Category, CategoryStatus
from urbenmend.geo.selectors import BoundaryUnavailable, active_city_boundary
from urbenmend.identity.models import Language, Role, User, UserStatus
from urbenmend.identity.services import start_session
from urbenmend.issues.models import Issue, IssueStatus
from urbenmend.reporting.models import (
    ClassificationSource,
    Report,
    ReportStatus,
    SeveritySignal,
)

# Accounts are created under this domain so a re-run finds and reuses them rather than
# multiplying identities. `.invalid` is reserved by RFC 2606 — it can never route mail, which
# matters because these accounts are `active` and therefore notifiable (BR-30).
LOADTEST_EMAIL_DOMAIN = "urbanmend.invalid"
LOADTEST_EMAIL_PREFIX = "loadtest"

# The seed is fixed so two runs produce the same geography and the same p95 is comparable
# across them. A load measurement whose dataset moves between runs cannot show a regression.
RANDOM_SEED = 20260823

# Reports cluster around a handful of centres rather than spreading uniformly, because uniform
# noise is the easy case for a spatial index: every bbox returns a similar small count. Real
# civic reporting is hotspotted (one broken road generates twenty reports), and that skew is
# what makes clustering and the map bbox do real work.
HOTSPOT_JITTER_DEG = 0.004  # ~450 m at this latitude — a plausible "same problem" radius.

# ⚠️ **The issue count is derived from the report target, not fixed.** The Issue queue is one of
# the three groups T10.4 measures, and its cost is driven by how many Issues exist, not how many
# Reports do. A fixed handful of hotspots gave 2000 reports across 24 Issues — so
# `GET /issues?status=triaged&limit=20` returned 7 rows with no next cursor, and reported an
# excellent p95 for a query that never filtered, sorted or paginated anything. A7's "tens of
# concurrent authority users" are browsing a real queue, so the seeded one has to be real.
#
# 15 reports per Issue is the corroboration ratio being modelled (FR-16): hotspotted reporting,
# where one problem draws repeat submissions. It is seed shaping, not a business rule — nothing
# reads it as policy, and clustering (T4.4) decides the real ratio in production.
REPORTS_PER_ISSUE = 15
# Two Issues per hotspot = two different problems at one junction (a broken road and a blocked
# drain), which is also what keeps `primary_category` varied within a geohash cell.
ISSUES_PER_HOTSPOT = 2
# A floor so a small `--reports` still gets geographically varied data instead of one cluster.
MIN_HOTSPOTS = 12

# The severity mix is weighted toward the middle bands so the queue's severity-DESC sort has
# ties to break and its filters have a non-trivial working set. Not a business rule: severity
# here is seed data, and nothing reads these weights as policy.
SEVERITY_WEIGHTS: tuple[tuple[str, int], ...] = (
    (SeveritySignal.CRITICAL, 1),
    (SeveritySignal.HIGH, 3),
    (SeveritySignal.MEDIUM, 5),
    (SeveritySignal.LOW, 3),
)

# Issue statuses spread across the workflow so `GET /issues?status=…` filters select real
# subsets. Terminal and moderation states are included but rare, matching a live queue.
ISSUE_STATUS_WEIGHTS: tuple[tuple[str, int], ...] = (
    (IssueStatus.SUBMITTED, 3),
    (IssueStatus.TRIAGED, 4),
    (IssueStatus.ACKNOWLEDGED, 3),
    (IssueStatus.IN_PROGRESS, 3),
    (IssueStatus.RESOLVED, 2),
    (IssueStatus.CLOSED, 1),
)

SESSION_CSV_HEADER = ("role", "email", "session_key", "csrf_token")

# ⚠️ These two strings are how a re-run recognises its own previous output, which is what makes
# `--reports` a **target** rather than an increment (see `_seed_reports_and_issues`). They are
# matched exactly, so editing either one orphans every row already seeded and the next run
# silently doubles the dataset — comparing p95 across runs then compares two different datasets,
# which is exactly what the fixed RANDOM_SEED exists to prevent. Change them only together with a
# deliberate decision to abandon the existing seed.
#
# Rationale text is the marker rather than the author's email, because a load run's *own* API
# submissions are authored by the same seeded citizens; keying on the author would count them and
# report the target as already met.
REPORT_MARKER = "Seeded for T10.4 load testing."
ISSUE_MARKER = "Seeded by seed_load_dataset for T10.4 load testing; not a classifier output."


class Command(BaseCommand):
    help = (
        "Seed a representative report/issue dataset plus pre-authenticated sessions for the "
        "T10.4 load test. Refuses to run unless LOADTEST_SEED_ENABLED=1."
    )

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument(
            "--reports",
            type=int,
            default=2000,
            help=(
                "Target number of seeded reports — a ceiling, not an increment. A re-run tops "
                "the dataset up to this number and adds nothing if it is already met. Default "
                "2000, the top of A7's 'hundreds to low thousands' prototype scale [doc: prd A7]."
            ),
        )
        parser.add_argument(
            "--citizens",
            type=int,
            default=30,
            help="Citizen identities to mint sessions for (default: 30).",
        )
        parser.add_argument(
            "--authorities",
            type=int,
            default=5,
            help=(
                "Authority identities to mint sessions for (default: 5). A7 says 'tens of "
                "concurrent authority users'; each session drives many requests."
            ),
        )
        parser.add_argument(
            "--out",
            default=".loadtest/sessions.csv",
            help=(
                "Where to write the sessions CSV (default: .loadtest/sessions.csv, which is "
                "gitignored — the file contains live session keys)."
            ),
        )

    def handle(self, *args: Any, **options: Any) -> None:
        # ⚠️ Guard first, before anything is read or written. Env-gated rather than
        # DEBUG-gated: `DEBUG` is False in the compose dev stack too, so gating on it would
        # make the command unusable exactly where it is meant to run, and a `--force` flag is
        # the kind of thing that ends up in a runbook copy-paste. An env var has to be set
        # deliberately by the operator for this one invocation.
        if os.environ.get("LOADTEST_SEED_ENABLED") != "1":
            raise CommandError(
                "Refusing to seed: set LOADTEST_SEED_ENABLED=1 to confirm this is a "
                "throwaway load-test environment. This command creates accounts with live "
                "sessions and thousands of reports; it must never run against real data."
            )

        reports_wanted: int = options["reports"]
        citizens_wanted: int = options["citizens"]
        authorities_wanted: int = options["authorities"]
        if reports_wanted < 1:
            raise CommandError("--reports must be at least 1")
        if citizens_wanted < 1:
            raise CommandError("--citizens must be at least 1 (reports need an author)")
        if authorities_wanted < 0:
            raise CommandError("--authorities cannot be negative")

        # ⚠️ Let `BoundaryUnavailable` become a CommandError rather than inventing a polygon.
        # T2.1's rule is that intake fails closed with no boundary, so a seeder that supplied
        # its own would seed reports the API itself would reject — and the load test would
        # measure a geography that does not exist. Seeding a boundary is a separate, deliberate
        # act: `geo.reference_services.replace_city_boundary()`.
        try:
            boundary = active_city_boundary()
        except BoundaryUnavailable as exc:
            raise CommandError(
                f"No usable active city boundary ({exc}). Seed one deliberately with "
                "geo.reference_services.replace_city_boundary() before load testing; this "
                "command will not invent one, because reports outside the served city are "
                "rejected at intake (BR-35) and would make the measurement meaningless."
            ) from exc

        categories = list(Category.objects.filter(status=CategoryStatus.ACTIVE).order_by("slug"))
        if not categories:
            raise CommandError(
                "No active categories. Run migrations so the T0.10 taxonomy is seeded."
            )

        # ⚠️ Seeded, not the global `random` module state: this command must not perturb
        # anything else in the process, and a fixed seed is what makes two runs comparable.
        rng = random.Random(RANDOM_SEED)  # noqa: S311 — seed geography, not a security decision.

        citizens = self._ensure_users(
            role=Role.CITIZEN, count=citizens_wanted, categories=categories
        )
        authorities = self._ensure_users(
            role=Role.AUTHORITY, count=authorities_wanted, categories=categories
        )
        self.stdout.write(
            f"identities: {len(citizens)} citizen, {len(authorities)} authority "
            f"(reused where they already existed)"
        )

        hotspots = self._hotspots(
            boundary=boundary,
            rng=rng,
            count=self._hotspot_count(reports_wanted=reports_wanted, categories=categories),
        )
        self.stdout.write(f"hotspots: {len(hotspots)} centres inside '{boundary.name}'")

        issue_count, existing_reports, added_reports = self._seed_reports_and_issues(
            reports_wanted=reports_wanted,
            citizens=citizens,
            categories=categories,
            hotspots=hotspots,
            boundary_area=boundary.area,
            rng=rng,
        )
        self.stdout.write(
            f"seeded: {existing_reports + added_reports} reports across {issue_count} issues "
            f"({existing_reports} already present, {added_reports} added; "
            f"target {reports_wanted})"
        )

        out_path = self._write_sessions(
            path=Path(options["out"]), identities=[*citizens, *authorities]
        )
        geography_path = self._write_geography(
            path=out_path.parent / "geography.json",
            boundary=boundary,
            hotspots=hotspots,
            categories=categories,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"sessions: {len(citizens) + len(authorities)} written to {out_path}"
            )
        )
        self.stdout.write(f"geography: {geography_path}")
        self.stdout.write(
            self.style.WARNING(
                "The sessions file contains live session keys — they authenticate as these "
                "accounts until they expire. Keep it out of version control and delete it "
                "after the run."
            )
        )

    # -- identities ---------------------------------------------------------------------

    def _ensure_users(self, *, role: str, count: int, categories: list[Category]) -> list[User]:
        """Create or reuse `count` load-test identities of `role`, idempotently by email."""
        users: list[User] = []
        for index in range(count):
            email = f"{LOADTEST_EMAIL_PREFIX}+{role}{index}@{LOADTEST_EMAIL_DOMAIN}"
            user = User.objects.filter(email=email).first()
            if user is None:
                # ⚠️ `get_random_string`, not a literal — a hard-coded password would trip
                # ruff's S106 and, worse, would be a real credential in a committed file. The
                # value is deliberately discarded: the harness authenticates by session
                # cookie, so nothing ever needs to know it.
                user = User.objects.create_user(
                    email=email,
                    password=get_random_string(32),
                    role=role,
                    # `active` because the harness must exercise the authenticated paths a
                    # real user hits; `registered` accounts are still allowed to submit
                    # (BR-30 gates notification, not intake) but would skip verified-channel
                    # code paths entirely.
                    status=UserStatus.ACTIVE,
                    preferred_language=Language.ENGLISH,
                    email_verified_at=timezone.now(),
                )
            if role == Role.AUTHORITY:
                # ⚠️ An empty `category_scope` grants nothing, so an unscoped Authority would
                # read an empty queue and the authority load profile would measure a 404 path.
                # Scope every seeded Authority across the whole active taxonomy — this is
                # load-test data, not a BR-26 demonstration.
                user.category_scope.set(categories)
            users.append(user)
        return users

    # -- geography ----------------------------------------------------------------------

    @staticmethod
    def _hotspot_count(*, reports_wanted: int, categories: list[Category]) -> int:
        """How many hotspot centres this dataset size needs.

        Derived rather than fixed so the Issue queue scales with the report target — see
        `REPORTS_PER_ISSUE`. At `--reports 2000` this is 67 centres and ~134 Issues, enough for
        every status filter to hold more than one page of 20.
        """
        issues_wanted = max(len(categories), reports_wanted // REPORTS_PER_ISSUE)
        return max(MIN_HOTSPOTS, -(-issues_wanted // ISSUES_PER_HOTSPOT))

    def _hotspots(self, *, boundary: Any, rng: random.Random, count: int) -> list[Point]:
        """Pick `count` hotspot centres that are genuinely inside the boundary.

        ⚠️ Containment is tested per candidate rather than assumed from the bounding box: a
        city outline is not a rectangle, so a point drawn from `extent` can easily fall
        outside it. Reports seeded outside the city would be invisible to every bbox query
        the load test measures, and the run would report suspiciously fast reads.
        """
        min_x, min_y, max_x, max_y = boundary.area.extent
        area = boundary.area
        centres: list[Point] = []
        # Bounded attempts: a pathological boundary (a thin sliver in a large bbox) must fail
        # loudly rather than spin forever inside a management command.
        attempts = 0
        max_attempts = count * 200
        while len(centres) < count and attempts < max_attempts:
            attempts += 1
            candidate = Point(
                rng.uniform(min_x, max_x),  # noqa: S311 — seed geography.
                rng.uniform(min_y, max_y),  # noqa: S311
                srid=4326,
            )
            if area.contains(candidate):
                centres.append(candidate)
        if not centres:
            raise CommandError(
                f"Could not place a single hotspot inside boundary '{boundary.name}' after "
                f"{attempts} attempts. Is the polygon valid?"
            )
        return centres

    def _jittered(self, *, centre: Point, rng: random.Random, area: Any) -> Point:
        """A point near `centre`, retried until it lands inside the city."""
        for _ in range(50):
            candidate = Point(
                centre.x + rng.uniform(-HOTSPOT_JITTER_DEG, HOTSPOT_JITTER_DEG),  # noqa: S311
                centre.y + rng.uniform(-HOTSPOT_JITTER_DEG, HOTSPOT_JITTER_DEG),  # noqa: S311
                srid=4326,
            )
            if area.contains(candidate):
                return candidate
        # The centre itself is known-inside, so it is always a valid fallback.
        return centre

    # -- dataset ------------------------------------------------------------------------

    def _seed_reports_and_issues(
        self,
        *,
        reports_wanted: int,
        citizens: list[User],
        categories: list[Category],
        hotspots: list[Point],
        boundary_area: Any,
        rng: random.Random,
    ) -> tuple[int, int, int]:
        """Top the dataset up to `reports_wanted`, reusing anything already seeded.

        ⚠️ **`--reports` is a target, not an increment**, and that distinction is the whole
        reason this method looks up existing rows first. The additive reading is the intuitive
        one and it is wrong: `RANDOM_SEED` is fixed precisely so two runs produce the same
        geography and therefore comparable p95 numbers, and a second `--reports 2000` that left
        4000 rows behind would compare two different datasets while looking like a repeat.

        ⚠️ **Topping up, never deleting.** Reaching a smaller target by removing rows is not an
        option here — Issues are never hard-deleted (C-9), and `Report.author` is `PROTECT`
        specifically so a hard delete fails loudly rather than erasing FR-16's corroboration
        count. To shrink a dataset, recreate the database.

        Returns `(issue_count, existing_reports, added_reports)`.
        """
        issues = self._ensure_issues(hotspots=hotspots, categories=categories, rng=rng)

        existing_reports = Report.objects.filter(classification_rationale=REPORT_MARKER).count()
        to_create = max(0, reports_wanted - existing_reports)
        if to_create == 0:
            return len(issues), existing_reports, 0

        now = timezone.now()
        reports: list[Report] = []
        for offset in range(to_create):
            # ⚠️ Numbered from the existing total, not from zero. `created_at` is derived from
            # this, and restarting the sequence would land a top-up run's rows on timestamps
            # already taken — collapsing the distinct sort keys that cursor pagination needs.
            index = existing_reports + offset
            issue = issues[index % len(issues)]
            author = citizens[index % len(citizens)]
            # Spread `created_at` backwards so the default `-createdAt` ordering and cursor
            # pagination have distinct sort keys to page through. Identical timestamps would
            # let the cursor tie-break do work no real dataset asks of it.
            created = now - timedelta(minutes=index)
            reports.append(
                Report(
                    author=author,
                    description=(
                        f"Load-test report {index} near hotspot "
                        f"{issue.representative_location.y:.4f},"
                        f"{issue.representative_location.x:.4f}."
                    ),
                    category=issue.primary_category,
                    location=self._jittered(
                        centre=issue.representative_location, rng=rng, area=boundary_area
                    ),
                    address="",
                    language=Language.ENGLISH,
                    status=ReportStatus.TRIAGED,
                    severity_signal=issue.computed_severity,
                    confidence=0.9,
                    # ⚠️ `FALLBACK`, not `LLM`: nothing here consulted a model, and labelling
                    # seeded rows as LLM output would corrupt any later query that measures
                    # classifier behaviour or cost.
                    classification_source=ClassificationSource.FALLBACK,
                    classification_model="",
                    classification_rationale=REPORT_MARKER,
                    # ⚠️ This is the field that keeps the T3.5 worker from re-queuing every
                    # seeded report: `is_classified` keys on `classified_at`, not `category`.
                    classified_at=created,
                    classification_needs_review=False,
                    issue=issue,
                    created_at=created,
                )
            )

        with transaction.atomic():
            Report.objects.bulk_create(reports, batch_size=500)
        return len(issues), existing_reports, len(reports)

    def _ensure_issues(
        self, *, hotspots: list[Point], categories: list[Category], rng: random.Random
    ) -> list[Issue]:
        """Top the Issue set up to what `hotspots` implies, reusing what a previous run created.

        ⚠️ **Every candidate is built, and only the surplus is inserted.** Skipping the rng draws
        for the hotspots already covered would be the obvious optimisation and it would break
        determinism: severity and status come off the same seeded generator, so a top-up run must
        consume it in exactly the order a fresh run would, or the two datasets diverge past the
        point where `RANDOM_SEED` makes their p95 comparable.

        A shrinking target is a no-op here, for the same reason it is for Reports — Issues are
        never hard-deleted (C-9).

        ⚠️ Growing the target only produces a coherent dataset when the report target grows with
        it: reports are round-robined across the whole Issue list, so raising `--reports` fills
        the new clusters, while raising it alone would leave them empty. Changing dataset *shape*
        rather than size means starting from a fresh database.
        """
        existing = list(
            Issue.objects.filter(computed_severity_rationale=ISSUE_MARKER).order_by("pk")
        )

        severity_choices = [s for s, weight in SEVERITY_WEIGHTS for _ in range(weight)]
        status_choices = [s for s, weight in ISSUE_STATUS_WEIGHTS for _ in range(weight)]

        # `ISSUES_PER_HOTSPOT` Issues per hotspot, each in a different category, is the shape
        # clustering would produce anyway (T4.4 keys on geohash-cell + category), so the read
        # paths see a realistic issues-to-reports ratio without this command reimplementing the
        # clustering rule.
        candidates: list[Issue] = []
        for centre in hotspots:
            sampled = rng.sample(categories, k=min(ISSUES_PER_HOTSPOT, len(categories)))
            for category in sampled:
                severity = rng.choice(severity_choices)  # noqa: S311
                candidates.append(
                    Issue(
                        primary_category=category,
                        representative_location=centre,
                        computed_severity=severity,
                        # Non-blank TextField: FR-15 requires severity to be explainable, so
                        # there is no such thing as an Issue with no rationale — including a
                        # seeded one, which says plainly where it came from.
                        computed_severity_rationale=ISSUE_MARKER,
                        status=rng.choice(status_choices),  # noqa: S311
                    )
                )

        missing = candidates[len(existing) :]
        if missing:
            Issue.objects.bulk_create(missing)
        return existing + missing

    # -- sessions -----------------------------------------------------------------------

    def _write_sessions(self, *, path: Path, identities: list[User]) -> Path:
        """Mint one real session per identity and write the CSV the locustfile reads."""
        # ⚠️ Resolved from `settings.SESSION_ENGINE`, never imported as `...backends.db`.
        # This project runs `cached_db`; a hard-coded db SessionStore would write rows the
        # deployed backend never reads from cache, so the harness would authenticate against
        # a different mechanism than production uses.
        engine = import_module(settings.SESSION_ENGINE)

        path.parent.mkdir(parents=True, exist_ok=True)
        rows: list[tuple[str, str, str, str]] = []
        for user in identities:
            # ⚠️ A synthetic request through the real `start_session()`, rather than writing a
            # session key by hand. That function wraps `django.contrib.auth.login()`
            # specifically for `cycle_key()` and the explicit `backend=`; a hand-rolled
            # session would omit `_auth_user_backend` and `_auth_user_hash`, and every
            # request the harness made would be silently anonymous — which reads as a very
            # fast 401 rather than an error.
            request = HttpRequest()
            request.session = engine.SessionStore()
            start_session(request=request, user=user)
            request.session.save()
            session_key = request.session.session_key
            if not session_key:
                raise CommandError(f"Failed to mint a session for {user.email}")
            # The same 32-char secret goes in the cookie and the header. Django's
            # double-submit check unmasks a 64-char token but compares a 32-char one
            # directly, so an unmasked pair matches — verified against
            # `django.middleware.csrf._does_token_match`.
            rows.append(
                (
                    str(user.role),
                    user.email or "",
                    session_key,
                    get_random_string(32, CSRF_ALLOWED_CHARS),
                )
            )

        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(SESSION_CSV_HEADER)
            writer.writerows(rows)
        return path

    # -- geography handoff ---------------------------------------------------------------

    def _write_geography(
        self,
        *,
        path: Path,
        boundary: Any,
        hotspots: list[Point],
        categories: list[Category],
    ) -> Path:
        """Publish the coordinates and slugs the locustfile must submit against.

        ⚠️ **The harness must not carry its own coordinates.** Hardcoded lat/lngs in the
        locustfile would keep passing shape validation after a boundary change and come back
        `422 OUT_OF_CITY` on every submission — which a load test reads as "the write path is
        very fast" rather than "nothing was written". Same trap `LocationSerializer` records for
        transposed coordinates. Publishing the geography that was actually seeded means the two
        cannot drift.

        Category slugs travel for the same reason: an off-taxonomy hint is refused `400` (a
        citizen hint is not LLM output, so BR-7's coercion to `Other` does not apply here).
        """
        min_x, min_y, max_x, max_y = boundary.area.extent
        payload = {
            "boundary": boundary.name,
            # The full extent, for the low-zoom map read that is the expensive bbox case.
            "bbox": [
                round(min_x, 6),
                round(min_y, 6),
                round(max_x, 6),
                round(max_y, 6),
            ],
            "hotspots": [{"lng": round(p.x, 6), "lat": round(p.y, 6)} for p in hotspots],
            "categorySlugs": [c.slug for c in categories],
        }
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return path
