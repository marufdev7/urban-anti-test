"""Production settings contract: the variables that must be present for `prod` to import."""

from __future__ import annotations

import os
import subprocess
import sys


def _production_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment.update(
        {
            "DJANGO_SECRET_KEY": "prod-settings-test-secret",
            "DJANGO_ALLOWED_HOSTS": "api.example.test",
            "DATABASE_URL": "postgis://user:password@db:5432/urbenmend",
            "EMAIL_HOST": "smtp.example.test",
            "EMAIL_HOST_USER": "smtp-user",
            "EMAIL_HOST_PASSWORD": "smtp-password",
            "DEFAULT_FROM_EMAIL": "UrbanMend <noreply@example.test>",
            # Required by prod.py, which overrides base.py's `default=""`. Not inherited from
            # os.environ — the api container does not carry these under dev settings.
            "STORAGE_ACCESS_KEY": "prod-settings-test-access-key",
            "STORAGE_SECRET_KEY": "prod-settings-test-secret-key",
        }
    )
    return environment


def _run_settings_import(environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from urbenmend.settings import prod; "
                "print(prod.EMAIL_BACKEND, prod.EMAIL_HOST, prod.EMAIL_PORT, "
                "prod.EMAIL_USE_TLS, prod.EMAIL_USE_SSL, prod.DEFAULT_FROM_EMAIL)"
            ),
        ],
        check=False,
        capture_output=True,
        text=True,
        env=environment,
    )


def test_production_email_settings_are_environment_driven() -> None:
    result = _run_settings_import(_production_environment())

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == (
        "django.core.mail.backends.smtp.EmailBackend smtp.example.test 587 "
        "True False UrbanMend <noreply@example.test>"
    )


def test_production_email_rejects_tls_and_ssl_together() -> None:
    environment = _production_environment()
    environment.update({"EMAIL_USE_TLS": "true", "EMAIL_USE_SSL": "true"})

    result = _run_settings_import(environment)

    assert result.returncode != 0
    assert "EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be enabled" in result.stderr


def test_production_requires_object_storage_credentials() -> None:
    """⚠️ A missing storage key must fail at import, not at the first photo upload.

    `base.py` defaults both to `""`, which boots cleanly and reports `/api/v1/health` "ok" —
    that endpoint probes database and cache only. The deployment then looks live right up until
    a citizen's upload 403s against MinIO. Same fail-fast reasoning as SECRET_KEY/DATABASE_URL,
    so it is asserted the same way: reintroducing a default here breaks this test.
    """
    for missing in ("STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"):
        environment = _production_environment()
        del environment[missing]

        result = _run_settings_import(environment)

        assert result.returncode != 0, f"{missing} was absent yet prod settings imported"
        assert missing in result.stderr
