"""T10.2 regression matrix: anonymous callers cannot reach state-changing APIs."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from urbenmend.identity.tests.factories import AuthorityFactory, UserFactory
from urbenmend.issues.tests.factories import IssueFactory
from urbenmend.reporting.tests.factories import ReportFactory

pytestmark = pytest.mark.django_db


def test_anonymous_mutations_require_authentication() -> None:
    issue = IssueFactory.create()
    report = ReportFactory.create()
    client = APIClient(enforce_csrf_checks=False)

    requests = [
        ("post", reverse("api:reports"), {"description": "new", "location": {}}),
        (
            "patch",
            reverse("api:reports-detail", kwargs={"report_id": report.pk}),
            {"description": "changed"},
        ),
        ("post", reverse("api:issues-comments", kwargs={"issue_id": issue.pk}), {"body": "note"}),
        ("post", reverse("api:issues-confirmations", kwargs={"issue_id": issue.pk}), {}),
        ("patch", reverse("api:notification-preferences"), {"email": False}),
    ]

    for method, url, payload in requests:
        response = getattr(client, method)(url, payload, format="json")
        assert response.status_code == 401, (method, url, response.status_code)


def test_authenticated_citizen_cannot_use_authority_mutations() -> None:
    citizen = UserFactory.create()
    issue = IssueFactory.create()
    client = APIClient(enforce_csrf_checks=False)
    client.force_authenticate(citizen)

    response = client.patch(
        reverse("api:issues-severity", kwargs={"issue_id": issue.pk}),
        {"severity": "high", "reason": "security matrix"},
        format="json",
    )
    assert response.status_code == 403


def test_authenticated_citizen_cannot_reach_any_authority_or_admin_mutation() -> None:
    """Permission checks run before payload validation on every privileged route."""
    citizen = UserFactory.create()
    issue = IssueFactory.create()
    other_issue = IssueFactory.create()
    report = ReportFactory.create()
    client = APIClient(enforce_csrf_checks=False)
    client.force_authenticate(citizen)

    routes = [
        (
            "patch",
            reverse("api:issues-status", kwargs={"issue_id": issue.pk}),
            {"toStatus": "acknowledged", "reason": "security matrix"},
        ),
        (
            "patch",
            reverse("api:issues-assignment", kwargs={"issue_id": issue.pk}),
            {"assigneeId": None},
        ),
        (
            "post",
            reverse("api:issues-merge", kwargs={"issue_id": issue.pk}),
            {"mergeWithIssueId": str(other_issue.pk)},
        ),
        (
            "post",
            reverse("api:issues-split", kwargs={"issue_id": issue.pk}),
            {"reportIds": []},
        ),
        (
            "post",
            reverse("api:reports-moderation", kwargs={"pk": report.pk}),
            {"action": "hide", "reason": "security matrix"},
        ),
        (
            "post",
            reverse("api:issues-moderation", kwargs={"pk": issue.pk}),
            {"action": "hide", "reason": "security matrix"},
        ),
        (
            "post",
            reverse("api:users-authorities"),
            {"email": "new-authority@example.test", "categoryScope": ["roads"]},
        ),
        ("post", reverse("api:exports"), {"resource": "issues", "format": "csv"}),
    ]

    for method, url, payload in routes:
        response = getattr(client, method)(url, payload, format="json")
        assert response.status_code == 403, (method, url, response.status_code)


def test_out_of_scope_authority_cannot_mutate_issue() -> None:
    authority = AuthorityFactory.create()
    issue = IssueFactory.create()
    client = APIClient(enforce_csrf_checks=False)
    client.force_authenticate(authority)

    response = client.patch(
        reverse("api:issues-status", kwargs={"issue_id": issue.pk}),
        {"toStatus": "acknowledged", "reason": "security matrix"},
        format="json",
    )

    assert response.status_code == 403
