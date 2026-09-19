"""T10.4 seeder tests.

These assert the *guards* far more than the data shape. The seeder mints live session keys and
inserts thousands of rows, so the properties worth pinning are the ones that stop it running
where it should not, and the two correctness traps that would silently invalidate a load run:
reports seeded outside the city, and reports that read as unclassified.
"""

from __future__ import annotations

import csv
import json
from io import StringIO
from pathlib import Path
from typing import Any

import pytest
from django.contrib.gis.geos import Point
from django.core import management
from django.core.management.base import CommandError
from django.db.models import Count

from urbenmend.classification.models import Category
from urbenmend.geo.models import CityBoundary
from urbenmend.identity.models import Role, User
from urbenmend.issues.models import Issue
from urbenmend.platform.management.commands.seed_load_dataset import (
    ISSUE_STATUS_WEIGHTS,
    ISSUES_PER_HOTSPOT,
    REPORTS_PER_ISSUE,
    Command,
)
from urbenmend.reporting.models import ClassificationSource, Report

pytestmark = pytest.mark.django_db


@pytest.fixture
def boundary() -> CityBoundary:
    """The migration-seeded active boundary (`geo/0002_seed_city_boundary`).

    ⚠️ Deliberately *not* a fixture-created polygon. `active_city_boundary()` raises when two
    rows are active, so creating one here would make every test fail on the second boundary —
    and the seeder is meant to work against the real seeded geography anyway.
    """
    return CityBoundary.objects.get(is_active=True)


@pytest.fixture
def enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOADTEST_SEED_ENABLED", "1")


def _seed(tmp_path: Path, **kwargs: Any) -> str:
    out = StringIO()
    management.call_command(
        "seed_load_dataset",
        out=str(tmp_path / "sessions.csv"),
        stdout=out,
        **kwargs,
    )
    return out.getvalue()


def test_refuses_to_run_without_the_env_gate(
    tmp_path: Path, boundary: CityBoundary, monkeypatch: pytest.MonkeyPatch
) -> None:
    """⚠️ The gate is the only thing standing between this command and real data.

    It must be checked before anything is read or written, so a missing gate cannot leave a
    half-seeded database behind.
    """
    monkeypatch.delenv("LOADTEST_SEED_ENABLED", raising=False)
    with pytest.raises(CommandError, match="LOADTEST_SEED_ENABLED=1"):
        _seed(tmp_path, reports=1, citizens=1, authorities=0)
    assert Report.objects.count() == 0
    assert User.objects.count() == 0


def test_env_gate_must_be_exactly_one(
    tmp_path: Path, boundary: CityBoundary, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A truthy-looking value is not the gate. `"0"`, `"true"`, `""` must all refuse."""
    for value in ("0", "true", "yes", ""):
        monkeypatch.setenv("LOADTEST_SEED_ENABLED", value)
        with pytest.raises(CommandError, match="LOADTEST_SEED_ENABLED=1"):
            _seed(tmp_path, reports=1, citizens=1, authorities=0)


@pytest.mark.usefixtures("enabled")
def test_refuses_without_an_active_boundary_rather_than_inventing_one(tmp_path: Path) -> None:
    """⚠️ The seeder must not paper over T2.1's fail-closed rule.

    With no boundary, `create_report()` rejects every submission, so a seeder that invented a
    polygon would produce a dataset the API itself considers out-of-city — and the load run
    would measure an empty map.
    """
    # Retire the seeded boundary rather than deleting it: reference data is retired, never
    # hard-deleted, and that is also the state an operator would actually be in.
    CityBoundary.objects.update(is_active=False)
    assert not CityBoundary.objects.filter(is_active=True).exists()
    with pytest.raises(CommandError, match="No usable active city boundary"):
        _seed(tmp_path, reports=1, citizens=1, authorities=0)
    assert Report.objects.count() == 0


@pytest.mark.usefixtures("enabled")
def test_refuses_when_two_boundaries_are_active(tmp_path: Path, boundary: CityBoundary) -> None:
    """Two active boundaries disagree about where the city ends; picking one is not allowed."""
    CityBoundary.objects.create(name="Second", area=boundary.area, is_active=True)
    with pytest.raises(CommandError, match="No usable active city boundary"):
        _seed(tmp_path, reports=1, citizens=1, authorities=0)


@pytest.mark.usefixtures("enabled", "boundary")
def test_every_seeded_report_is_inside_the_city(tmp_path: Path) -> None:
    """⚠️ The single most important property of the dataset.

    A report outside the boundary is invisible to the map bbox and to `ST_DWithin`, so a run
    over out-of-city data reports excellent latency for queries that match nothing.
    """
    _seed(tmp_path, reports=60, citizens=3, authorities=1)
    total = Report.objects.count()
    assert total == 60
    inside = Report.objects.filter(location__within=CityBoundary.objects.get().area).count()
    assert inside == total


@pytest.mark.usefixtures("enabled", "boundary")
def test_seeded_reports_read_as_classified(tmp_path: Path) -> None:
    """⚠️ `is_classified` keys on `classified_at`, not `category`.

    If seeded rows read as unclassified, the T3.5 worker re-queues all of them the moment a
    worker is running — which spends real LLM budget and changes the load profile mid-run.
    """
    _seed(tmp_path, reports=20, citizens=2, authorities=1)
    reports = list(Report.objects.all())
    assert reports
    assert all(r.classified_at is not None for r in reports)
    assert all(r.is_classified for r in reports)
    # Never labelled as model output — nothing here consulted an LLM.
    assert {r.classification_source for r in reports} == {ClassificationSource.FALLBACK}
    assert all(r.classification_model == "" for r in reports)


@pytest.mark.usefixtures("enabled", "boundary")
def test_reports_are_attached_to_issues_with_matching_category(tmp_path: Path) -> None:
    """Report ≠ Issue: severity lives on the Issue, and the link must be coherent."""
    _seed(tmp_path, reports=40, citizens=2, authorities=1)
    assert Issue.objects.exists()
    for report in Report.objects.select_related("issue", "category"):
        assert report.issue is not None
        assert report.category_id == report.issue.primary_category_id
        assert report.issue.computed_severity_rationale != ""


@pytest.mark.usefixtures("enabled", "boundary")
def test_sessions_csv_is_written_with_one_row_per_identity(tmp_path: Path) -> None:
    _seed(tmp_path, reports=5, citizens=4, authorities=2)
    path = tmp_path / "sessions.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 6
    assert sum(1 for r in rows if r["role"] == Role.CITIZEN) == 4
    assert sum(1 for r in rows if r["role"] == Role.AUTHORITY) == 2
    for row in rows:
        # A real, saved session key — not a placeholder.
        assert row["session_key"]
        # ⚠️ 32 chars: Django's CSRF check compares an unmasked token to the cookie secret
        # directly. A different length would be rejected as a malformed token.
        assert len(row["csrf_token"]) == 32


@pytest.mark.usefixtures("enabled", "boundary")
def test_minted_sessions_actually_authenticate(tmp_path: Path, client: Any) -> None:
    """⚠️ The whole harness rests on this.

    `start_session()` wraps `django.contrib.auth.login()` for `cycle_key()` and an explicit
    `backend=`. A hand-rolled session row would omit `_auth_user_backend`/`_auth_user_hash`,
    and every harness request would be silently anonymous — a very fast 401, easily misread as
    a passing latency number.
    """
    _seed(tmp_path, reports=5, citizens=1, authorities=0)
    with (tmp_path / "sessions.csv").open(newline="", encoding="utf-8") as handle:
        row = next(iter(csv.DictReader(handle)))
    client.cookies["sessionid"] = row["session_key"]
    response = client.get("/api/v1/users/me")
    assert response.status_code == 200, response.content
    assert response.json()["email"] == row["email"]


@pytest.mark.usefixtures("enabled", "boundary")
def test_geography_handoff_lists_seeded_hotspots_and_active_slugs(tmp_path: Path) -> None:
    """⚠️ The harness reads coordinates from here rather than carrying its own.

    Baked-in coordinates would survive a boundary change and turn every submission into
    `422 OUT_OF_CITY`, which a load run reports as a very fast write path.
    """
    _seed(tmp_path, reports=10, citizens=2, authorities=1)
    payload = json.loads((tmp_path / "geography.json").read_text(encoding="utf-8"))
    seeded = CityBoundary.objects.get(is_active=True)
    assert payload["boundary"] == seeded.name
    assert len(payload["bbox"]) == 4
    assert payload["hotspots"]
    for hotspot in payload["hotspots"]:
        point = Point(hotspot["lng"], hotspot["lat"], srid=4326)
        assert seeded.area.contains(point), f"hotspot {hotspot} is outside the boundary"
    expected = set(Category.objects.filter(status="active").values_list("slug", flat=True))
    assert set(payload["categorySlugs"]) == expected


@pytest.mark.usefixtures("enabled", "boundary")
def test_rerunning_reuses_identities_instead_of_multiplying_them(tmp_path: Path) -> None:
    """Idempotent by email, so a repeated run does not leave a drift of stale accounts."""
    _seed(tmp_path, reports=5, citizens=3, authorities=2)
    first = set(User.objects.values_list("pk", flat=True))
    _seed(tmp_path, reports=5, citizens=3, authorities=2)
    assert set(User.objects.values_list("pk", flat=True)) == first


@pytest.mark.usefixtures("enabled", "boundary")
def test_reports_is_a_target_so_a_rerun_adds_nothing(tmp_path: Path) -> None:
    """⚠️ The trap: `--reports 2000` twice must not leave 4000 rows.

    `RANDOM_SEED` is fixed so two runs produce the same geography and therefore comparable p95
    numbers. A second run that doubled the dataset would look like a repeat and measure
    something else entirely — and the operator would have no signal that it had.
    """
    first_out = _seed(tmp_path, reports=30, citizens=3, authorities=1)
    assert Report.objects.count() == 30
    assert "30 added" in first_out
    issue_pks = set(Issue.objects.values_list("pk", flat=True))

    second_out = _seed(tmp_path, reports=30, citizens=3, authorities=1)
    assert Report.objects.count() == 30
    assert "0 added" in second_out
    # ⚠️ Issues too. Creating them unconditionally would leave a second generation of clusters
    # holding no reports, and `GET /issues` would page through them.
    assert set(Issue.objects.values_list("pk", flat=True)) == issue_pks


@pytest.mark.usefixtures("enabled", "boundary")
def test_raising_the_target_tops_up_without_reusing_timestamps(tmp_path: Path) -> None:
    """A larger target adds only the shortfall, on `created_at` values not already taken.

    ⚠️ Restarting the index at zero would give the top-up rows timestamps the first run already
    used, collapsing the distinct sort keys cursor pagination pages by.
    """
    _seed(tmp_path, reports=10, citizens=2, authorities=0)
    out = _seed(tmp_path, reports=25, citizens=2, authorities=0)
    assert Report.objects.count() == 25
    assert "10 already present, 15 added" in out
    timestamps = list(Report.objects.values_list("created_at", flat=True))
    assert len(set(timestamps)) == 25


@pytest.mark.usefixtures("enabled", "boundary")
def test_a_lower_target_leaves_the_dataset_alone(tmp_path: Path) -> None:
    """Shrinking is not supported, and must be a no-op rather than a deletion.

    ⚠️ Issues are never hard-deleted (C-9) and `Report.author` is `PROTECT` so that a hard
    delete fails loudly instead of erasing FR-16's corroboration count. A seeder that "tidied
    up" to hit a smaller number would be reaching for exactly the operation those rules forbid.
    """
    _seed(tmp_path, reports=20, citizens=2, authorities=0)
    _seed(tmp_path, reports=5, citizens=2, authorities=0)
    assert Report.objects.count() == 20


# -- queue density (the Issue count is what the authority group actually measures) --------


@pytest.mark.parametrize(
    ("reports", "expected_hotspots"),
    [
        (10, 12),  # floor binds: a tiny seed still gets varied geography
        (180, 12),  # 12 issues wanted, floor still binds
        (450, 15),  # 30 issues / 2 per hotspot
        (2000, 67),  # 133 issues / 2 per hotspot, rounded up
    ],
)
def test_hotspot_count_scales_with_the_report_target(reports: int, expected_hotspots: int) -> None:
    """⚠️ A fixed hotspot count is the bug this replaces.

    With 12 fixed centres, `--reports 2000` produced 24 Issues, so
    `GET /issues?status=triaged&limit=20` returned 7 rows and no cursor — it filtered, sorted
    and paginated nothing, and reported an excellent p95 for doing so. The Issue queue is one of
    the three groups T10.4 measures; its cost tracks the number of Issues, not Reports.
    """
    categories = [None] * 7  # only `len()` is read
    assert (
        Command._hotspot_count(reports_wanted=reports, categories=categories)  # type: ignore[arg-type]
        == expected_hotspots
    )


@pytest.mark.usefixtures("enabled", "boundary")
def test_issue_count_follows_the_derivation_end_to_end(tmp_path: Path) -> None:
    """The arithmetic above, actually seeded: 450 reports → 15 hotspots → 30 Issues."""
    _seed(tmp_path, reports=450, citizens=5, authorities=1)
    assert Issue.objects.count() == 15 * ISSUES_PER_HOTSPOT
    # Reports spread evenly across them, so no Issue is left holding the whole dataset.
    per_issue = list(
        Issue.objects.annotate(seeded=Count("reports")).values_list("seeded", flat=True)
    )
    assert min(per_issue) >= REPORTS_PER_ISSUE - 1


def test_default_target_gives_every_queried_status_more_than_one_page() -> None:
    """⚠️ The property the derivation exists for, checked at the target that ships.

    Asserting this by seeding would mean inserting 2000 rows in a unit test, so it is checked as
    arithmetic over the same constants the seeder uses. The three statuses are the ones
    `AuthorityUser.browse_queue` filters by; if any of them fits inside one page of 20, that
    task never requests a cursor and the run reports a p95 for pagination it never exercised.
    """
    issues = Command._hotspot_count(reports_wanted=2000, categories=[None] * 7) * (  # type: ignore[arg-type]
        ISSUES_PER_HOTSPOT
    )
    total_weight = sum(weight for _, weight in ISSUE_STATUS_WEIGHTS)
    for status in ("triaged", "acknowledged", "in_progress"):
        weight = next(w for s, w in ISSUE_STATUS_WEIGHTS if s == status)
        expected = issues * weight / total_weight
        assert expected > 20, f"{status}: ~{expected:.0f} issues fits in a single page of 20"


@pytest.mark.usefixtures("enabled", "boundary")
def test_seeded_authorities_are_scoped_or_they_would_see_nothing(tmp_path: Path) -> None:
    """⚠️ An empty `category_scope` grants nothing (BR-26).

    An unscoped Authority reads an empty queue, so the authority load profile would measure
    an access-denied path rather than the triage queue.
    """
    _seed(tmp_path, reports=5, citizens=1, authorities=2)
    active = Category.objects.filter(status="active").count()
    for authority in User.objects.filter(role=Role.AUTHORITY):
        assert authority.category_scope.count() == active


@pytest.mark.usefixtures("enabled", "boundary")
def test_rejects_nonsensical_counts(tmp_path: Path) -> None:
    with pytest.raises(CommandError, match="--reports must be at least 1"):
        _seed(tmp_path, reports=0, citizens=1, authorities=0)
    with pytest.raises(CommandError, match="--citizens must be at least 1"):
        _seed(tmp_path, reports=1, citizens=0, authorities=0)
