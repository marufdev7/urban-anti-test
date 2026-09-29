"""Tests for Super Admin provisioning other administrators (`POST /users/admins`)."""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from urbenmend.identity.models import Role, User, UserStatus
from urbenmend.identity.services import provision_admin, require_superadmin, AuthorizationError

pytestmark = pytest.mark.django_db


@pytest.fixture
def superadmin() -> User:
    return User.objects.create_superuser(
        email="super@urbanmend.test",
        password="super-secure-pass-1",
    )


@pytest.fixture
def regular_admin() -> User:
    return User.objects.create_user(
        email="regular.admin@urbanmend.test",
        password="regular-pass-1",
        role=Role.ADMIN,
        status=UserStatus.ACTIVE,
        is_staff=True,
        is_superuser=False,
    )


@pytest.fixture
def citizen() -> User:
    return User.objects.create_user(
        email="citizen@example.test",
        password="citizen-pass-1",
        role=Role.CITIZEN,
        status=UserStatus.ACTIVE,
    )


class TestProvisionAdminEndpoint:
    @pytest.fixture
    def url(self) -> str:
        return reverse("api:users-admins")

    def _client(self, user: User | None = None) -> APIClient:
        client = APIClient()
        if user is not None:
            client.force_authenticate(user=user)
        return client

    def test_superadmin_can_provision_new_admin(self, superadmin: User, url: str) -> None:
        response = self._client(superadmin).post(
            url,
            {
                "email": "new.admin@urbanmend.test",
                "password": "new-admin-pass-1",
                "assignedArea": "North City Sector",
                "requireTwoFactor": False,
                "isSuperuser": False,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["role"] == "admin"
        assert response.data["email"] == "new.admin@urbanmend.test"
        assert response.data["status"] == "active"

        created = User.objects.get(email="new.admin@urbanmend.test")
        assert created.role == Role.ADMIN
        assert created.is_staff is True
        assert created.is_superuser is False
        assert created.assigned_area == "North City Sector"

    def test_superadmin_can_provision_another_superadmin(self, superadmin: User, url: str) -> None:
        response = self._client(superadmin).post(
            url,
            {
                "email": "another.super@urbanmend.test",
                "password": "super-pass-2",
                "isSuperuser": True,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["role"] == "admin"
        assert response.data.get("isSuperuser") is True

        created = User.objects.get(email="another.super@urbanmend.test")
        assert created.is_superuser is True

    def test_regular_admin_cannot_provision_admin(self, regular_admin: User, url: str) -> None:
        """Regular admins must be denied with 403 when trying to create another admin."""
        response = self._client(regular_admin).post(
            url,
            {
                "email": "forbidden.admin@urbanmend.test",
                "password": "password-12345",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not User.objects.filter(email="forbidden.admin@urbanmend.test").exists()

    def test_regular_admin_can_still_provision_authority(self, regular_admin: User) -> None:
        """Regular admin cannot create admins, but can create authorities like before."""
        auth_url = reverse("api:users-authorities")
        response = self._client(regular_admin).post(
            auth_url,
            {
                "email": "new.authority@urbanmend.test",
                "categoryScope": [],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["role"] == "authority"

    def test_citizen_cannot_provision_admin(self, citizen: User, url: str) -> None:
        response = self._client(citizen).post(
            url,
            {"email": "citizen.escalation@urbanmend.test"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_gets_401(self, url: str) -> None:
        response = self._client().post(url, {"email": "unauth@urbanmend.test"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_duplicate_email_returns_409(self, superadmin: User, url: str) -> None:
        response = self._client(superadmin).post(
            url,
            {"email": superadmin.email, "password": "some-password-1"},
            format="json",
        )
        assert response.status_code == status.HTTP_409_CONFLICT
