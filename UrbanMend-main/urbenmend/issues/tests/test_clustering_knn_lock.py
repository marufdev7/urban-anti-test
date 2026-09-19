"""Regression: `cluster_report()` must not row-lock through the KNN `<->` ordering (T4.5).

The T10.4 load run found this. `cluster_report()` used to resolve its candidate Issue with

    matching_open_issues(...).select_for_update().first()

which reads as the obvious spelling and passed the entire suite. `matching_open_issues()` orders by
the PostGIS KNN operator, so PostgreSQL answers it with an ordered GiST index scan and puts the
`LockRows` node above it — and locking a tuple produced by a KNN index scan aborts the transaction
with `InternalError: attempted to lock invisible tuple`.

⚠️ **It is plan-dependent, and that is the whole reason it survived to P10.** On a table small
enough for a Seq Scan the lock is fine, so every existing test passed; PostgreSQL switches to the
KNN index scan at a few hundred Issues. Past that point every Report that *finds* a candidate fails
to cluster, while the first Report in a fresh neighbourhood still succeeds (no candidate, nothing to
lock) — so the pipeline keeps producing Issues and looks alive. The observed damage at 878 Issues:
252 of 965 submissions (26%) committed their classification and then raised, leaving Reports with no
Issue at all, invisible to every Authority queue (BR-6). Measurements in
`docs/14-load-test-results.md`.

⚠️ **The abort itself is not reproducible at test scale, and this file does not pretend to
reproduce it.** Forcing the production *plan* is easy (`enable_seqscan`/`enable_sort` off, below) and
`test_clustering_under_the_knn_index_scan_plan` does that. But the abort also needs the Issue's
severity `UPDATE` to have been committed by a *different* transaction: that update leaves
`representative_location` untouched, so PostgreSQL performs it as a HOT update and the GiST entry
keeps pointing at the superseded tuple version. Neither pytest's shared transaction nor a
`transaction=True` test reproduced that (both were tried; with real commits the lock still
succeeded), and `serialized_rollback=True` is not honoured here because pytest-django builds the
test databases unserialized — so a transactional test also flushes the taxonomy that
`classification/0001` seeds and breaks every later test resolving a Category by slug.

Hence two guards that *are* deterministic: the shipped path works under the real plan, and the
rejected spelling cannot come back by inspection.
"""

from __future__ import annotations

import inspect
from datetime import timedelta

import pytest
from django.contrib.gis.geos import Point
from django.db import connection

from urbenmend.classification.models import Category
from urbenmend.issues.models import Issue
from urbenmend.issues.selectors import matching_open_issues
from urbenmend.issues.services import OPEN_ISSUE_STATUSES, active_clustering_rule, cluster_report
from urbenmend.reporting.models import Report, SeveritySignal
from urbenmend.reporting.tests.factories import ClassifiedReportFactory

# Dhaka, and both Reports share the coordinate so they match under any radius a category could be
# configured with — the same reasoning as `test_clustering_concurrency.py`.
LOCATION = Point(90.4125, 23.8103, srid=4326)


def _force_index_scans() -> None:
    """Make the planner choose the KNN index scan on a table too small to justify it.

    ⚠️ **Both flags, and `enable_sort` is the one that matters.** With only `enable_seqscan` off,
    PostgreSQL still scans and then sorts by distance in a separate node — and `LockRows` above a
    plain `Sort` is not the production plan at all. Discouraging the sort is what forces the
    ordering to come from the GiST index itself (`Index Scan ... Order By: <->`), which is the plan
    real volume produces.

    ⚠️ `SET LOCAL`, not `SET`: the flags must die with this test's transaction, or every later test
    in the session runs without sequential scans and sorts.
    """
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL enable_seqscan = off")
        cursor.execute("SET LOCAL enable_sort = off")


def _classified_report(index: int) -> Report:
    from urbenmend.identity.tests.factories import UserFactory

    return ClassifiedReportFactory.create(
        category=Category.objects.get(slug="roads"),
        location=LOCATION,
        author=UserFactory.create(email=f"knn-citizen-{index}@example.test"),
        severity_signal=SeveritySignal.MEDIUM,
    )


@pytest.mark.django_db
def test_clustering_under_the_knn_index_scan_plan() -> None:
    """The shipped path, exercised against the plan production actually gets.

    Report 1 opens the Issue (no candidate, which is why the old code never locked anything on a
    first submission and looked healthy). Report 2 is the one that finds a candidate and has to
    lock it — the step that failed for every Report once the dataset was large enough.

    The plan is asserted, not assumed: without that, a future change to `matching_open_issues()`
    could drop the KNN ordering and this test would keep passing while covering a plan nobody runs.
    """
    first = _classified_report(0)
    second = _classified_report(1)
    first_issue_id = cluster_report(first.id)

    _force_index_scans()
    rule = active_clustering_rule(category_id=second.category_id)
    plan = matching_open_issues(
        category_id=second.category_id,
        point=second.location,
        radius_m=rule.radius_m,
        opened_after=second.created_at - timedelta(hours=rule.time_window_hours),
        statuses=OPEN_ISSUE_STATUSES,
    ).explain()
    assert "Index Scan using issues_issue_location_gist" in plan, (
        f"the candidate lookup is no longer answered by the GiST KNN index scan, so this test has "
        f"stopped covering the plan the load run breaks on. Plan:\n{plan}"
    )
    assert "Order By" in plan

    second_issue_id = cluster_report(second.id)

    assert second_issue_id == first_issue_id, (
        "the second Report opened its own Issue instead of joining the first — the candidate "
        "lookup did not see the existing Issue under the index-scan plan"
    )
    assert Issue.objects.count() == 1
    assert Issue.objects.get().reports.count() == 2


def test_the_candidate_lookup_never_row_locks_through_the_knn_ordering() -> None:
    """⚠️ The guard that actually prevents the regression, by inspection rather than execution.

    The one-statement spelling is shorter, reads better, and is what anyone would write; the only
    thing standing between this codebase and it coming back is that collapsing the two statements
    has to fail something. Runtime cannot be that something — see the module docstring — so this
    reads the source.

    Source inspection is used elsewhere in this suite for exactly this class of invariant (the ones
    that are true of the *shape* of a call and invisible to mypy). It is deliberately narrow: it
    objects only to `select_for_update` applied to the `matching_open_issues(...)` expression, and
    says nothing about locking the candidate by primary key, which is what the fix does.

    ⚠️ Comments are stripped first. The comment above the call necessarily *names* the rejected
    spelling in order to warn about it, and without this the guard fails on its own explanation.
    """
    source = "\n".join(
        line
        for line in inspect.getsource(cluster_report).splitlines()
        if not line.strip().startswith("#")
    )
    candidate_lookup = source.split("matching_open_issues(", 1)[1].split(".first()", 1)[0]
    assert "select_for_update" not in candidate_lookup, (
        "`select_for_update()` is back on the KNN-ordered candidate queryset. PostgreSQL aborts "
        "that with `attempted to lock invisible tuple` once the planner switches to the GiST KNN "
        "index scan (a few hundred Issues), which silently stops 1-in-4 Reports from ever reaching "
        "an Issue. Resolve the id first, then lock it by primary key."
    )
    assert "select_for_update" in source, (
        "the candidate Issue is no longer locked at all — resolve the id under the KNN ordering, "
        "then `Issue.objects.select_for_update().filter(pk=...)`."
    )
