from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from urbenmend.audit.models import AuditEvent
from urbenmend.identity.tests.factories import AdminFactory, AuthorityFactory, UserFactory
from urbenmend.issues.models import IssueStatus
from urbenmend.issues.tests.factories import IssueFactory
from urbenmend.media.models import MediaState
from urbenmend.media.tests.factories import MediaFactory
from urbenmend.moderation.models import ModerationAction
from urbenmend.reporting.models import ReportStatus
from urbenmend.reporting.tests.factories import ReportFactory

pytestmark = pytest.mark.django_db


def _client(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.parametrize(
    ("route", "factory", "field", "expected"),
    [
        ("api:reports-moderation", ReportFactory, "status", ReportStatus.HIDDEN),
        ("api:issues-moderation", IssueFactory, "status", IssueStatus.HIDDEN),
        ("api:media-moderation", MediaFactory, "state", MediaState.HIDDEN),
    ],
)
def test_admin_can_hide_supported_resources(route, factory, field, expected) -> None:
    admin = AdminFactory()
    target = factory()
    response = _client(admin).post(
        reverse(route, kwargs={"pk": target.pk}),
        {"action": "hide", "reason": "Privacy violation"},
        format="json",
    )
    target.refresh_from_db()
    assert response.status_code == 200
    assert getattr(target, field) == expected
    assert ModerationAction.objects.get().reason == "Privacy violation"
    assert AuditEvent.objects.get(action="moderation.hide").target == target


def test_remove_comment_sets_tombstone() -> None:
    from urbenmend.issues.models import Comment

    issue = IssueFactory()
    comment = Comment.objects.create(issue=issue, author=UserFactory(), body="abusive")
    response = _client(AdminFactory()).post(
        reverse("api:comments-moderation", kwargs={"pk": issue.pk, "comment_id": comment.pk}),
        {"action": "remove", "reason": "Abuse"},
        format="json",
    )
    comment.refresh_from_db()
    assert response.status_code == 200
    assert comment.removed_at is not None


def test_non_admin_and_invalid_requests_are_rejected_without_mutation() -> None:
    report = ReportFactory()
    url = reverse("api:reports-moderation", kwargs={"pk": report.pk})
    assert (
        _client(AuthorityFactory())
        .post(url, {"action": "hide", "reason": "x"}, format="json")
        .status_code
        == 403
    )
    assert (
        _client(AdminFactory())
        .post(url, {"action": "hide", "reason": " "}, format="json")
        .status_code
        == 400
    )
    report.refresh_from_db()
    assert report.status == ReportStatus.SUBMITTED
    assert ModerationAction.objects.count() == 0


def test_admin_can_reopen_or_restore_removed_report() -> None:
    admin = AdminFactory()
    authority = AuthorityFactory()
    report = ReportFactory(status=ReportStatus.REMOVED)
    url = reverse("api:reports-moderation", kwargs={"pk": report.pk})

    # Non-admin cannot reopen
    assert (
        _client(authority)
        .post(url, {"action": "reopen", "reason": "Attempt by authority"}, format="json")
        .status_code
        == 403
    )

    # Admin reopens successfully
    res = _client(admin).post(
        url, {"action": "reopen", "reason": "Verified authentic upon re-investigation"}, format="json"
    )
    assert res.status_code == 200
    report.refresh_from_db()
    assert report.status not in (ReportStatus.REMOVED, ReportStatus.HIDDEN)
    assert ModerationAction.objects.filter(action="reopen").exists()
    assert AuditEvent.objects.filter(action="moderation.reopen").exists()


@pytest.mark.django_db
def test_admin_can_list_and_unhide_hidden_issue():
    admin = AdminFactory()
    citizen = UserFactory()
    issue = IssueFactory(status=IssueStatus.HIDDEN)

    # Citizen cannot list hidden issues
    assert _client(citizen).get(reverse("api:issues") + "?status=hidden").status_code == 400

    # Admin CAN list hidden issues
    res = _client(admin).get(reverse("api:issues") + "?status=hidden")
    assert res.status_code == 200
    assert any(item["id"] == str(issue.pk) for item in res.json()["data"])

    # Admin unhides / restores the issue
    unhide_url = reverse("api:issues-moderation", kwargs={"pk": issue.pk})
    unhide_res = _client(admin).post(
        unhide_url, {"action": "restore", "reason": "Restored to active queue by admin"}, format="json"
    )
    assert unhide_res.status_code == 200
    issue.refresh_from_db()
    assert issue.status not in (IssueStatus.HIDDEN, IssueStatus.REMOVED)
    assert issue.status == IssueStatus.SUBMITTED
