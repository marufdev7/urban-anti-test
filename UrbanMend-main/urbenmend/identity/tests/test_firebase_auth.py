"""
Tests for Firebase Authentication & Google SSO login (API /auth/firebase-login).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.test import Client
from django.urls import reverse

from urbenmend.identity import services
from urbenmend.identity.models import Role, User, UserStatus

pytestmark = pytest.mark.django_db


def test_authenticate_or_create_firebase_user_provisions_new_citizen() -> None:
    payload = {
        "email": "new.citizen@example.com",
        "email_verified": True,
        "name": "New Citizen",
        "sub": "firebase-uid-12345",
    }
    with patch("google.oauth2.id_token.verify_firebase_token", return_value=payload):
        user = services.authenticate_or_create_firebase_user(id_token="valid_mock_token")

    assert user is not None
    assert user.email == "new.citizen@example.com"
    assert user.role == Role.CITIZEN
    assert user.status == UserStatus.VERIFIED
    assert user.email_verified_at is not None


def test_authenticate_or_create_firebase_user_logs_in_existing_user() -> None:
    existing = User.objects.create_user(
        email="existing@example.com",
        role=Role.CITIZEN,
        status=UserStatus.REGISTERED,
    )
    payload = {
        "email": "Existing@example.com",  # mixed case to verify normalization
        "email_verified": True,
        "sub": "firebase-uid-99999",
    }
    with patch("google.oauth2.id_token.verify_firebase_token", return_value=payload):
        user = services.authenticate_or_create_firebase_user(id_token="valid_mock_token")

    assert user.id == existing.id
    existing.refresh_from_db()
    assert existing.status == UserStatus.VERIFIED
    assert existing.email_verified_at is not None


def test_authenticate_or_create_firebase_user_rejects_suspended_user() -> None:
    User.objects.create_user(
        email="suspended@example.com",
        role=Role.CITIZEN,
        status=UserStatus.SUSPENDED,
    )
    payload = {
        "email": "suspended@example.com",
        "email_verified": True,
        "sub": "firebase-uid-suspended",
    }
    with patch("google.oauth2.id_token.verify_firebase_token", return_value=payload):
        with pytest.raises(services.AccountLockedError):
            services.authenticate_or_create_firebase_user(id_token="valid_mock_token")


def test_authenticate_or_create_firebase_user_rejects_invalid_token() -> None:
    with patch(
        "google.oauth2.id_token.verify_firebase_token",
        side_effect=ValueError("Token expired"),
    ):
        with pytest.raises(services.AuthenticationError):
            services.authenticate_or_create_firebase_user(id_token="expired_token")


def test_firebase_login_view_success(client: Client) -> None:
    payload = {
        "email": "citizen.api@example.com",
        "email_verified": True,
        "sub": "firebase-uid-api",
    }
    with patch("google.oauth2.id_token.verify_firebase_token", return_value=payload):
        response = client.post(
            reverse("api:auth-firebase-login"),
            data={"idToken": "valid_api_token"},
            content_type="application/json",
        )

    assert response.status_code == 200
    data = response.json()
    assert "user" in data
    assert data["user"]["role"] == "citizen"
    assert data["requires2fa"] is False
    assert client.session.get("_auth_user_id") is not None


def test_firebase_login_view_invalid_token_returns_401(client: Client) -> None:
    with patch(
        "google.oauth2.id_token.verify_firebase_token",
        side_effect=ValueError("Signature verification failed"),
    ):
        with patch("requests.post") as mock_post:
            mock_post.return_value.ok = False
            mock_post.return_value.status_code = 400
            mock_post.return_value.text = '{"error": "INVALID_ID_TOKEN"}'
            response = client.post(
                reverse("api:auth-firebase-login"),
                data={"idToken": "bad_token"},
                content_type="application/json",
            )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_authenticate_or_create_firebase_user_rest_fallback(client: Client) -> None:
    with patch(
        "google.oauth2.id_token.verify_firebase_token",
        side_effect=ImportError("No module named 'google'"),
    ):
        with patch("requests.post") as mock_post:
            mock_post.return_value.ok = True
            mock_post.return_value.json.return_value = {
                "users": [
                    {
                        "email": "rest.fallback@example.com",
                        "emailVerified": True,
                        "localId": "rest-uid-123",
                    }
                ]
            }
            user = services.authenticate_or_create_firebase_user(id_token="token_for_rest")

    assert user is not None
    assert user.email == "rest.fallback@example.com"
    assert user.role == Role.CITIZEN
    assert user.status == UserStatus.VERIFIED
