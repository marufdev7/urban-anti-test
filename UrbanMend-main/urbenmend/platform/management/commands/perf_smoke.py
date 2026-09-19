"""Read-only P10 latency smoke checks for representative API query paths.

`--explain` is a second **mode** covering T10.4 acceptance criterion (d) — "validates geospatial
query plans under that data". It replaces the latency pass rather than adding to it, for two
reasons: reading a plan needs no accounts (the latency pass refuses to run without an active
citizen), and one command per verification step keeps the runbook readable.

⚠️ **The latency mode cannot be exercised from a test.** Its request loop drives both `APIClient`
and `Client` and calls `response.close()`, which fires `request_finished` and closes the connection
the surrounding test transaction is holding — the next request then dies with "the connection is
closed". Run as a real management command under autocommit, that close is harmless. So
`test_perf_smoke.py` covers argument validation and the `--explain` mode only; that is a property
of the test transaction, not a gap to be patched by rewriting the loop.
"""

from __future__ import annotations

import re
import time
from typing import Final

from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import Distance
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from urbenmend.geo.models import POI
from urbenmend.geo.selectors import BoundaryUnavailable, active_city_boundary
from urbenmend.identity.models import User
from urbenmend.issues.models import Issue
from urbenmend.reporting.models import Report

# Every geometry column the application queries, and the GiST index that must serve it.
# ⚠️ This mapping is the machine-readable form of the T2.1 rule "`GistIndex`, never
# `models.Index`, on a geometry column". A B-tree cannot answer `&&` or `ST_DWithin`, so swapping
# the index type leaves the migration reading as indexed while every spatial query degrades to a
# sequential scan — silently, and only at volume.
GEOMETRY_COLUMNS: Final[tuple[tuple[str, str], ...]] = (
    ("reporting_report", "location"),
    ("issues_issue", "representative_location"),
    ("geo_poi", "location"),
    ("geo_city_boundary", "area"),
)

# Radius for the `ST_DWithin` probes. 500 m is the order of magnitude clustering works at, and well
# inside `REPORT_SEARCH_MAX_RADIUS_M`; the probe is about which access path the planner picks, so
# the exact value only has to be selective.
PROBE_RADIUS_M: Final = 500.0


class Command(BaseCommand):
    help = "Measure representative read-path latency and SQL counts without creating data."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--iterations", type=int, default=5)
        parser.add_argument(
            "--max-ms",
            type=float,
            default=2000.0,
            help="Fail if any representative request exceeds this latency (default: 2000 ms).",
        )
        parser.add_argument(
            "--max-queries",
            type=int,
            default=100,
            help="Fail if any representative request exceeds this SQL count (default: 100).",
        )
        parser.add_argument(
            "--explain",
            action="store_true",
            help=(
                "Plan mode: instead of measuring latency, assert the GiST indexes exist and read "
                "EXPLAIN (ANALYZE, BUFFERS) plans for the bbox and ST_DWithin predicates (NFR-1). "
                "Run it against a seeded dataset — plans on an empty table mean nothing."
            ),
        )
        parser.add_argument(
            "--explain-min-rows",
            type=int,
            default=500,
            help=(
                "Row count above which a Seq Scan on a geometry table is treated as a failure "
                "rather than reported (default: 500, the low end of A7's 'hundreds')."
            ),
        )

    def handle(self, *args, **options) -> None:
        iterations = max(1, options["iterations"])
        max_ms = options["max_ms"]
        max_queries = options["max_queries"]
        if max_ms <= 0 or max_queries < 1:
            raise CommandError("--max-ms must be positive and --max-queries must be at least 1")
        if options["explain_min_rows"] < 1:
            raise CommandError("--explain-min-rows must be at least 1")
        if options["explain"]:
            self._check_spatial_plans(min_rows=options["explain_min_rows"])
            return
        public_client = Client(HTTP_HOST="localhost")
        authenticated_client = APIClient(HTTP_HOST="localhost")
        user = User.objects.filter(
            role="citizen", status__in=["registered", "verified", "active"]
        ).first()
        if user is None:
            raise CommandError("perf_smoke requires at least one active citizen account")
        authenticated_client.force_authenticate(user)
        paths = {
            "reports": (authenticated_client, reverse("api:reports")),
            "issues": (public_client, reverse("api:issues")),
            "map": (
                public_client,
                f"{reverse('api:map-issues')}?bbox=90.40,23.80,90.43,23.83&zoom=8",
            ),
        }
        for name, (client, path) in paths.items():
            elapsed: list[float] = []
            query_counts: list[int] = []
            for _ in range(iterations):
                started = time.perf_counter()
                with CaptureQueriesContext(connection) as queries:
                    response = client.get(path)
                    response.close()
                elapsed.append((time.perf_counter() - started) * 1000)
                query_counts.append(len(queries))
            max_elapsed = max(elapsed)
            max_query_count = max(query_counts)
            self.stdout.write(
                f"{name}: status={response.status_code} "
                f"avg_ms={sum(elapsed) / len(elapsed):.1f} "
                f"max_ms={max_elapsed:.1f} "
                f"avg_queries={sum(query_counts) / len(query_counts):.1f} "
                f"max_queries={max_query_count}"
            )
            if response.status_code != 200:
                raise CommandError(f"{name} returned HTTP {response.status_code}")
            if max_elapsed > max_ms:
                raise CommandError(
                    f"{name} exceeded latency budget: {max_elapsed:.1f} ms > {max_ms:.1f} ms"
                )
            if max_query_count > max_queries:
                raise CommandError(
                    f"{name} exceeded SQL budget: {max_query_count} > {max_queries} queries"
                )

    # -- --explain -----------------------------------------------------------------------

    def _check_spatial_plans(self, *, min_rows: int) -> None:
        """Assert the GiST indexes exist, then read the plans the planner actually chose.

        Two checks with different characters, and the split is deliberate:

        **The index assertion is deterministic** — it fails the moment someone replaces a
        `GistIndex` with a `models.Index`, at any table size, on any machine.

        ⚠️ **The plan check cannot be**, because PostgreSQL is right to sequentially scan a small
        table: reading thirty pages beats descending an index. So a `Seq Scan` is only an error
        above `--explain-min-rows`; below it the plan is printed and labelled informational. A
        check that failed on an empty database would be turned off within a week, and one that
        passed on an empty database would prove nothing — hence neither.
        """
        self._assert_gist_indexes()
        bbox, centre, centre_source = self._probe_geometry()
        self.stdout.write(f"probe centre: {centre_source} ({centre.x:.5f}, {centre.y:.5f})")
        probes = (
            # Each mirrors a real call site rather than inventing a query shape.
            (
                "issues_issue",
                "bbox && (map, issues/selectors.py:344)",
                Issue.objects.filter(representative_location__bboverlaps=bbox),
            ),
            (
                "issues_issue",
                "ST_DWithin (clustering, issues/selectors.py:112)",
                Issue.objects.filter(
                    representative_location__dwithin=(centre, Distance(m=PROBE_RADIUS_M))
                ),
            ),
            (
                "reporting_report",
                "ST_DWithin (?nearLng, reporting/selectors.py:175)",
                Report.objects.filter(location__dwithin=(centre, Distance(m=PROBE_RADIUS_M))),
            ),
            (
                "geo_poi",
                "ST_DWithin (proximity, geo/selectors.py:108)",
                POI.objects.filter(location__dwithin=(centre, Distance(m=PROBE_RADIUS_M))),
            ),
        )
        # ⚠️ Bare spatial predicates, not the selectors themselves. `list_issues()` layers
        # corroboration subqueries and a visibility filter over the geometry, and a Seq Scan
        # appearing anywhere in that plan says nothing about whether the GiST index is usable —
        # which is the only thing NFR-1 asserts. Endpoint-level cost is what the latency checks
        # above and the T10.4 load run measure.
        failures: list[str] = []
        for table, label, queryset in probes:
            rows = self._row_count(table)
            plan = queryset.explain(analyze=True, buffers=True)
            scan = self._scan_kind(plan, table)
            matched = queryset.count()
            self.stdout.write(f"plan {table} {label}: rows={rows} matched={matched} access={scan}")
            # ⚠️ A probe that matches nothing is not evidence. The planner reaches for the index
            # trivially when the predicate excludes every row, so a zero-match probe over a
            # populated table means the probe geometry is wrong — not that the index is healthy.
            if rows > 0 and matched == 0:
                self.stdout.write(
                    f"  warning: probe matched 0 of {rows} rows, so this plan says little. "
                    f"Widen PROBE_RADIUS_M or check that the probe centre sits near seeded data."
                )
            if not re.search(rf"\bSeq Scan on {re.escape(table)}\b", plan):
                continue
            if rows < min_rows:
                self.stdout.write(
                    f"  informational: Seq Scan on {table} with only {rows} rows — below "
                    f"--explain-min-rows={min_rows}, so the planner is entitled to it. Seed a "
                    f"representative dataset before reading this as a result."
                )
                continue
            failures.append(
                f"{table} ({label}): sequential scan over {rows} rows — the GiST index was not "
                f"used. Plan:\n{plan}"
            )
        if failures:
            raise CommandError(
                "geospatial query plans regressed (NFR-1):\n" + "\n\n".join(failures)
            )

    def _assert_gist_indexes(self) -> None:
        """Fail if any queried geometry column lacks a GiST index."""
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = current_schema()"
            )
            definitions = cursor.fetchall()
        missing: list[str] = []
        for table, column in GEOMETRY_COLUMNS:
            found = any(
                name == table and "USING gist" in definition and column in definition
                for name, definition in definitions
            )
            if not found:
                missing.append(f"{table}.{column}")
        if missing:
            raise CommandError(
                "no GiST index found for: "
                + ", ".join(missing)
                + ". A B-tree cannot serve `&&` or `ST_DWithin`, so every spatial query degrades "
                "to a sequential scan while the migration still reads as indexed (T2.1)."
            )
        self.stdout.write(f"gist indexes: {len(GEOMETRY_COLUMNS)} geometry columns covered")

    def _probe_geometry(self) -> tuple[Polygon, Point, str]:
        """Derive the probe bbox and centre from live data, never from constants.

        ⚠️ Hardcoded coordinates would keep passing after a boundary change while matching zero
        rows — and a spatial query that matches nothing gets an excellent plan.

        ⚠️ **The centre comes from a real row, not the boundary centroid**, for that same reason.
        The centroid of a city polygon is a geometric artefact: nothing is seeded there, so a 500 m
        probe around it matched `rows=0` on a fully seeded 2000-report database. It still chose the
        GiST index — an empty result is the easiest possible case for the planner — so the check
        passed while demonstrating nothing about behaviour at volume. Probing from a row's own
        location puts the probe inside a hotspot, where the neighbours are.
        """
        try:
            boundary = active_city_boundary()
        except BoundaryUnavailable as exc:
            raise CommandError(
                f"--explain needs exactly one active city boundary to probe against ({exc})."
            ) from exc
        bbox = Polygon.from_bbox(boundary.area.extent)
        bbox.srid = 4326
        centre: Point | None = (
            Report.objects.order_by("created_at").values_list("location", flat=True).first()
        )
        source = "a report location"
        if centre is None:
            centre = (
                Issue.objects.order_by("opened_at")
                .values_list("representative_location", flat=True)
                .first()
            )
            source = "an issue representative location"
        if centre is None:
            centre = boundary.area.centroid
            source = "the boundary centroid (no report or issue rows to probe from)"
        centre.srid = 4326
        return bbox, centre, source

    @staticmethod
    def _row_count(table: str) -> int:
        with connection.cursor() as cursor:
            # Table names come from GEOMETRY_COLUMNS, a module constant — no user input reaches here.
            cursor.execute(f"SELECT count(*) FROM {connection.ops.quote_name(table)}")  # noqa: S608
            return int(cursor.fetchone()[0])

    @staticmethod
    def _scan_kind(plan: str, table: str) -> str:
        """The access method the planner chose for `table`, for the one-line summary.

        ⚠️ **`using <index>` has to be optional in the middle.** PostgreSQL prints an index scan as
        `Index Scan using reporting_report_location_gist on reporting_report`, so a pattern
        demanding `Index Scan on <table>` matches nothing and this reports "not scanned" for the
        single best outcome — read as "the probe queried nothing", which is a much more alarming
        thing than what happened. The `Seq Scan` failure check is a separate pattern and was never
        affected, so the bug was invisible in the exit code and lived only in the summary line.
        """
        match = re.search(
            rf"((?:Parallel )?(?:Bitmap Heap|Index Only|Index|Seq) Scan)"
            rf"(?: using \S+)? on {re.escape(table)}\b",
            plan,
        )
        if match is None:
            return "not scanned"
        kind = match.group(1)
        if "Bitmap Heap" in kind and "Bitmap Index Scan" in plan:
            return f"{kind} + Bitmap Index Scan"
        return kind
