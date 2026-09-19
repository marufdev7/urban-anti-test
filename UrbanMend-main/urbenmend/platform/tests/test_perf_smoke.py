"""`perf_smoke` tests.

⚠️ **Only argument validation and `--explain` are covered, deliberately.** The latency mode drives
the test client and calls `response.close()`, which fires `request_finished` and closes the
connection this test's transaction is holding — every following request then fails with "the
connection is closed". That is an artefact of running inside a transaction, not a bug in the
command (as a real management command it runs under autocommit, where the close is harmless), so
the fix is not to rewrite the request loop.
"""

from io import StringIO

import pytest
from django.contrib.gis.geos import Point
from django.core import management
from django.core.management.base import CommandError
from django.db import connection

from urbenmend.geo.tests.factories import POIFactory
from urbenmend.platform.management.commands.perf_smoke import Command
from urbenmend.reporting.tests.factories import ReportFactory


def test_perf_smoke_rejects_non_positive_latency_budget() -> None:
    with pytest.raises(CommandError, match="--max-ms must be positive"):
        management.call_command("perf_smoke", max_ms=0, stdout=StringIO())


def test_perf_smoke_rejects_zero_query_budget() -> None:
    with pytest.raises(CommandError, match="--max-queries must be at least 1"):
        management.call_command("perf_smoke", max_queries=0, stdout=StringIO())


def test_perf_smoke_rejects_zero_explain_row_floor() -> None:
    with pytest.raises(CommandError, match="--explain-min-rows must be at least 1"):
        management.call_command("perf_smoke", explain=True, explain_min_rows=0, stdout=StringIO())


# -- --explain (T10.4 acceptance criterion (d), NFR-1) -----------------------------------


@pytest.mark.django_db
def test_explain_reports_gist_coverage_and_a_plan_per_spatial_predicate() -> None:
    """The happy path: indexes present, one plan line per probed predicate."""
    out = StringIO()
    management.call_command("perf_smoke", explain=True, stdout=out)
    printed = out.getvalue()
    assert "gist indexes: 4 geometry columns covered" in printed
    # Each probe reports the access method it got, so a plan regression is readable at a glance.
    assert "plan issues_issue bbox &&" in printed
    assert "plan reporting_report ST_DWithin" in printed
    assert "plan geo_poi ST_DWithin" in printed


@pytest.mark.django_db
def test_explain_fails_when_a_geometry_column_loses_its_gist_index() -> None:
    """⚠️ The check that catches `GistIndex` → `models.Index`.

    Dropping the index inside the test transaction is safe — PostgreSQL DDL is transactional and
    pytest-django rolls the whole test back — and it is the only way to observe the failure that
    this assertion exists for.
    """
    with connection.cursor() as cursor:
        cursor.execute("DROP INDEX reporting_report_location_gist")
    with pytest.raises(CommandError, match=r"no GiST index found for: reporting_report\.location"):
        management.call_command("perf_smoke", explain=True, stdout=StringIO())


@pytest.mark.django_db
def test_explain_treats_a_seq_scan_on_a_small_table_as_informational() -> None:
    """⚠️ PostgreSQL is *right* to scan a small table, so this must not be an error.

    A check that failed on a nearly-empty database would be switched off within a week — and the
    load run is the only context in which these plans mean anything.
    """
    out = StringIO()
    management.call_command("perf_smoke", explain=True, stdout=out)
    printed = out.getvalue()
    if "Seq Scan" in printed:
        assert "informational" in printed


@pytest.mark.django_db
def test_explain_fails_on_a_seq_scan_once_the_table_is_big_enough() -> None:
    """The failure branch, forced deterministically rather than hoped for.

    ⚠️ `SET LOCAL`, not `SET`: the planner flags must die with this test's transaction, or every
    later test in the session runs without index scans.
    """
    ReportFactory.create()
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL enable_indexscan = off")
        cursor.execute("SET LOCAL enable_bitmapscan = off")
        cursor.execute("SET LOCAL enable_indexonlyscan = off")
    with pytest.raises(CommandError, match="geospatial query plans regressed"):
        management.call_command("perf_smoke", explain=True, explain_min_rows=1, stdout=StringIO())


# -- what the probe actually measures ----------------------------------------------------


@pytest.mark.parametrize(
    ("plan", "expected"),
    [
        # ⚠️ The regression this parametrisation exists for. PostgreSQL names the index in the
        # middle of the phrase, and a pattern without room for it reported "not scanned" for the
        # single best outcome — i.e. the summary line said the probe queried nothing at the exact
        # moment the GiST index was doing its job.
        ("Index Scan using reporting_report_location_gist on reporting_report", "Index Scan"),
        ("Index Only Scan using some_idx on reporting_report", "Index Only Scan"),
        ("Seq Scan on reporting_report  (cost=0.00..1.01 rows=1)", "Seq Scan"),
        ("Parallel Seq Scan on reporting_report", "Parallel Seq Scan"),
        # A plan that never touches the table at all is the one honest "not scanned".
        ("Nested Loop\n  ->  Result", "not scanned"),
    ],
)
def test_scan_kind_reads_the_access_method_including_the_index_name(
    plan: str, expected: str
) -> None:
    assert Command._scan_kind(plan, "reporting_report") == expected


def test_scan_kind_names_the_bitmap_index_behind_a_bitmap_heap_scan() -> None:
    """Two nodes, one access path — reporting only the heap scan hides that an index was used."""
    plan = (
        "Bitmap Heap Scan on reporting_report\n"
        "  ->  Bitmap Index Scan on reporting_report_location_gist"
    )
    assert Command._scan_kind(plan, "reporting_report") == "Bitmap Heap Scan + Bitmap Index Scan"


@pytest.mark.django_db
def test_explain_probes_from_a_report_location_not_the_boundary_centroid() -> None:
    """⚠️ The centroid of a city polygon is a geometric artefact with nothing seeded near it.

    Probing there matched `rows=0` on a fully seeded 2000-report database — and an empty result is
    the easiest case the planner ever gets, so the check passed while proving nothing about
    behaviour at volume. The probe centre must come from a row.
    """
    report = ReportFactory.create()
    out = StringIO()
    management.call_command("perf_smoke", explain=True, stdout=out)
    printed = out.getvalue()
    assert "probe centre: a report location" in printed
    assert f"({report.location.x:.5f}, {report.location.y:.5f})" in printed


@pytest.mark.django_db
def test_explain_falls_back_to_the_centroid_and_says_so_when_there_is_no_data() -> None:
    """The fallback stays available — `--explain` must run on a fresh database — but is labelled."""
    out = StringIO()
    management.call_command("perf_smoke", explain=True, stdout=out)
    assert "the boundary centroid (no report or issue rows to probe from)" in out.getvalue()


@pytest.mark.django_db
def test_explain_warns_when_a_probe_matches_nothing_on_a_populated_table() -> None:
    """⚠️ Silence here is what let the zero-match centroid probe look like a pass for so long.

    `matched=0` over a populated table means the probe geometry is wrong, not that the index is
    healthy — so it is called out in the output rather than left for the reader to infer from a
    number they have no baseline for.
    """
    report = ReportFactory.create()
    # ~11 km away: far outside PROBE_RADIUS_M, so `geo_poi` has a row and matches none of it.
    POIFactory.create(location=Point(report.location.x + 0.1, report.location.y + 0.1, srid=4326))
    out = StringIO()
    management.call_command("perf_smoke", explain=True, stdout=out)
    printed = out.getvalue()
    assert "plan geo_poi" in printed
    assert "probe matched 0 of 1 rows" in printed
