"""T10.4 load-profile tests.

⚠️ **The point of these tests is the gate, not the traffic shape.** Locust exits 0 for any run
that completed, however bad the numbers, so `_assert_nfr_targets` is the only thing that turns a
load run into a release check. A gate that has never been observed to fail is not known to be a
gate — so the breach cases here are the ones that matter, and they run against locust's real
`Environment`/`RequestStats` rather than stubs, so a change in the percentile API surfaces here.

The module reads its seeded handoff files at import time, which is why every test imports it
through `_load_profile()` with the environment pointed at a tmp dir.
"""

from __future__ import annotations

import csv
import importlib
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from locust.env import Environment

from urbenmend.issues.pagination import SORT_CHOICES

MODULE = "urbenmend.platform.loadtest.locustfile"


def _write_seed_files(tmp_path: Path, *, authorities: int = 1) -> None:
    sessions = tmp_path / "sessions.csv"
    with sessions.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(("role", "email", "session_key", "csrf_token"))
        writer.writerow(("citizen", "c0@urbanmend.invalid", "sess-c0", "x" * 32))
        for index in range(authorities):
            writer.writerow(
                (
                    "authority",
                    f"a{index}@urbanmend.invalid",
                    f"sess-a{index}",
                    "y" * 32,
                )
            )
    (tmp_path / "geography.json").write_text(
        json.dumps(
            {
                "boundary": "Test City",
                "bbox": [90.35, 23.72, 90.47, 23.85],
                "hotspots": [{"lng": 90.40, "lat": 23.78}],
                "categorySlugs": ["roads", "water_drainage"],
            }
        ),
        encoding="utf-8",
    )


def _load_profile(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, **env: str) -> ModuleType:
    """Import the locustfile fresh with the environment it will see under `loadgen`.

    Writes a default pair of seed files unless the test already wrote its own, so a test that
    only cares about the gate does not have to restate the dataset.
    """
    if not (tmp_path / "sessions.csv").exists():
        _write_seed_files(tmp_path)
    monkeypatch.setenv("LOADTEST_SESSIONS", str(tmp_path / "sessions.csv"))
    monkeypatch.setenv("LOADTEST_GEOGRAPHY", str(tmp_path / "geography.json"))
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    sys.modules.pop(MODULE, None)
    return importlib.import_module(MODULE)


# -- fail-fast on missing seed data ------------------------------------------------------


def test_import_fails_loudly_when_sessions_are_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """⚠️ Better to refuse to start than to report a wall of 401s as results.

    Without seeded sessions every authenticated request is anonymous, which shows up as a very
    fast 401 — a passing-looking latency number for a run that measured nothing.
    """
    monkeypatch.setenv("LOADTEST_SESSIONS", str(tmp_path / "absent.csv"))
    monkeypatch.setenv("LOADTEST_GEOGRAPHY", str(tmp_path / "geography.json"))
    sys.modules.pop(MODULE, None)
    with pytest.raises(RuntimeError, match="seed_load_dataset"):
        importlib.import_module(MODULE)


def test_import_fails_loudly_when_geography_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_seed_files(tmp_path)
    (tmp_path / "geography.json").unlink()
    monkeypatch.setenv("LOADTEST_SESSIONS", str(tmp_path / "sessions.csv"))
    monkeypatch.setenv("LOADTEST_GEOGRAPHY", str(tmp_path / "geography.json"))
    sys.modules.pop(MODULE, None)
    with pytest.raises(RuntimeError, match="seed_load_dataset"):
        importlib.import_module(MODULE)


# -- the NFR-2 gate ----------------------------------------------------------------------


def _run_gate(profile: ModuleType, samples: dict[str, list[int]], failures: int = 0) -> int:
    """Feed response times through locust's real stats, then run the gate hook."""
    environment = Environment()
    for name, times in samples.items():
        for response_time in times:
            environment.stats.log_request("GET", name, response_time, 0)
    for _ in range(failures):
        environment.stats.log_request("GET", "GET /issues", 10, 0)
        environment.stats.log_error("GET", "GET /issues", Exception("boom"))
    profile._assert_nfr_targets(environment)
    return int(environment.process_exit_code)


def test_gate_passes_when_every_group_is_inside_the_budget(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    profile = _load_profile(tmp_path, monkeypatch)
    exit_code = _run_gate(
        profile,
        {"GET /issues": [100] * 50, "POST /reports": [400] * 50},
    )
    assert exit_code == 0
    assert "NFR GATE PASSED" in capsys.readouterr().out


def test_gate_fails_when_p95_breaches_nfr2(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """⚠️ The breach case. NFR-2 is 2000 ms; 3000 ms must exit non-zero.

    Without this the harness would be a report, not a gate — a CSV nobody diffed.
    """
    profile = _load_profile(tmp_path, monkeypatch)
    exit_code = _run_gate(profile, {"GET /map/issues": [3000] * 50})
    assert exit_code == 1
    out = capsys.readouterr().out
    assert "NFR GATE FAILED" in out
    # The message must name the offending group and both numbers, or an operator cannot act.
    assert "GET /map/issues" in out
    assert "2000" in out


def test_gate_budget_is_overridable_so_the_gate_can_be_proven_to_fail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`LOADTEST_P95_MS=1` is the runbook's proof step — a fast run must still fail."""
    profile = _load_profile(tmp_path, monkeypatch, LOADTEST_P95_MS="1")
    assert _run_gate(profile, {"GET /issues": [5] * 50}) == 1


def test_gate_fails_on_request_failures_even_when_latency_is_fine(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """⚠️ Fast failures are the trap: a 401ing endpoint has excellent p95."""
    profile = _load_profile(tmp_path, monkeypatch)
    exit_code = _run_gate(profile, {"GET /issues": [50] * 10}, failures=5)
    assert exit_code == 1
    assert "failure ratio" in capsys.readouterr().out


def test_gate_fails_when_no_requests_were_made(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """An empty run is a misconfiguration, not a pass — nothing was measured."""
    profile = _load_profile(tmp_path, monkeypatch)
    assert _run_gate(profile, {}) == 1
    assert "no requests were made" in capsys.readouterr().out


# -- profile shape -----------------------------------------------------------------------


def test_budget_defaults_to_the_nfr2_target(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """2000 ms comes from NFR-2 and is the only numeric latency target any doc states."""
    monkeypatch.delenv("LOADTEST_P95_MS", raising=False)
    profile = _load_profile(tmp_path, monkeypatch)
    assert profile.P95_BUDGET_MS == 2000.0
    # Zero tolerance by default: on seeded data at A7 scale there is no legitimate 4xx/5xx.
    assert profile.MAX_FAILURE_RATIO == 0.0


def test_all_three_traffic_classes_are_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    profile = _load_profile(tmp_path, monkeypatch)
    assert profile.CitizenUser.weight == 3
    assert profile.AuthorityUser.weight == 2
    assert profile.AnonMapUser.weight == 2
    # ⚠️ The anonymous map user must NOT carry a session, or the public read path (Q7) is
    # silently measured as an authenticated one.
    assert not issubclass(profile.AnonMapUser, profile._SessionUser)
    assert issubclass(profile.CitizenUser, profile._SessionUser)


def test_session_pools_hand_out_distinct_identities(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """⚠️ Round-robin, not random: colliding users share a per-user `submit_report` bucket.

    Two Locust users on one identity would measure that throttle rather than the write path.
    """
    _write_seed_files(tmp_path, authorities=3)
    profile = _load_profile(tmp_path, monkeypatch)
    keys = [next(profile._AUTHORITY_POOL)["session_key"] for _ in range(3)]
    assert sorted(keys) == ["sess-a0", "sess-a1", "sess-a2"]
    # Cycles rather than exhausting, so more users than identities still runs.
    assert next(profile._AUTHORITY_POOL)["session_key"] == "sess-a0"


def test_authority_user_refuses_to_start_without_a_seeded_authority(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An unscoped/absent Authority would silently measure an access-denied path."""
    _write_seed_files(tmp_path, authorities=0)
    profile = _load_profile(tmp_path, monkeypatch)
    user = profile.AuthorityUser.__new__(profile.AuthorityUser)
    with pytest.raises(RuntimeError, match="no seeded identity"):
        user.on_start()


def test_queue_sorts_are_exactly_the_api_allowlist(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """⚠️ The harness carries `?sort=` tokens as literals; this is what stops them drifting.

    `IssueListQuerySerializer.sort` is a `ChoiceField` over `SORT_CHOICES`, so an unrecognised
    token is `400 VALIDATION_FAILED` — fast, uniform, and indistinguishable from a healthy p95 in
    a Locust summary. This is not hypothetical: `-severity`, the spelling the T10.4 plan was
    drafted against, is not a valid choice, and a harness that sent it would have measured a wall
    of validation errors as the triage queue.

    Equality, not a subset: a sort added to the API and not to `QUEUE_SORTS` is an ordering that
    ships unmeasured, which is the other half of the same drift.
    """
    profile = _load_profile(tmp_path, monkeypatch)
    assert set(profile.QUEUE_SORTS) == set(SORT_CHOICES)


def test_queue_page_two_reuses_the_sort_from_page_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """⚠️ A cursor encodes the keys it was cut on, so the sort must not change mid-walk.

    Re-sorting between pages is a client bug that reads as extra coverage: the second request
    would `400` (or silently re-page from a mismatched key), and `GET /issues (queue page 2)` —
    the group that exists specifically to measure keyset pagination — would report that.
    """
    profile = _load_profile(tmp_path, monkeypatch)

    requested: list[str] = []

    class _Response:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {"data": [{"id": "abc"}], "page": {"nextCursor": "cur-1"}}

        def failure(self, _message: str) -> None: ...

        def success(self) -> None: ...

        def __enter__(self) -> _Response:
            return self

        def __exit__(self, *_exc: object) -> bool:
            return False

    class _RecordingClient:
        cookies: dict[str, str] = {}

        def get(self, path: str, **_kwargs: Any) -> _Response:
            requested.append(path)
            return _Response()

    user = profile.AuthorityUser.__new__(profile.AuthorityUser)
    user.client = _RecordingClient()  # type: ignore[assignment]
    profile.AuthorityUser.browse_queue(user)

    assert len(requested) == 2, requested
    first, second = requested
    sort = first.split("sort=")[1].split("&")[0]
    assert sort in SORT_CHOICES
    assert f"sort={sort}" in second
    assert "cursor=cur-1" in second
    # The status filter travels with it for the same reason.
    status = first.split("status=")[1].split("&")[0]
    assert f"status={status}" in second


def test_submissions_carry_a_fresh_idempotency_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """⚠️ A reused key would be served from the Redis idempotency record after the first call.

    The run would then measure the cache, not the write path, and report an excellent p95 for
    a pipeline that never ran. Asserted by capturing what the task actually sends.
    """
    _write_seed_files(tmp_path)
    profile = _load_profile(tmp_path, monkeypatch)

    sent: list[dict[str, Any]] = []

    class _RecordingClient:
        cookies: dict[str, str] = {}

        def post(self, path: str, **kwargs: Any) -> None:
            sent.append(kwargs)

    user = profile.CitizenUser.__new__(profile.CitizenUser)
    user.client = _RecordingClient()  # type: ignore[assignment]
    profile.CitizenUser.submit_report(user)
    profile.CitizenUser.submit_report(user)

    keys = [call["headers"]["Idempotency-Key"] for call in sent]
    assert len(keys) == 2
    assert keys[0] != keys[1]

    # And the body must stay inside the seeded city, or every submission is a 422.
    for call in sent:
        location = call["json"]["location"]
        assert 90.35 <= location["lng"] <= 90.47
        assert 23.72 <= location["lat"] <= 23.85
        assert call["json"]["category"] in {"roads", "water_drainage"}
