"""
The contract between `docker-compose.prod.yml`'s api healthcheck and prod's request handling.

⚠️ Why this file exists: the healthcheck shipped probing `http://127.0.0.1:8080/api/v1/health`
with no headers, which under production settings can never return 200 — and Caddy is gated on it
with `depends_on: api: condition: service_healthy`. Caddy is the only service publishing 80/443,
so the whole deployment served nothing while every container ran. Nothing caught it, because a
Compose healthcheck is not exercised by any other test.

Two halves, and both are needed:
  - the behavioural half pins *why* the two headers are required, through real middleware;
  - the structural half pins that the healthcheck still sends them.
Either one alone rots: the behaviour can hold while the YAML regresses, and the YAML can look
right while a settings change moves the goalposts.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest import mock

import pytest
import yaml
from django.test import Client, override_settings

from urbenmend.platform import views
from urbenmend.platform.selectors import DependencyHealth

HEALTH_PATH = "/api/v1/health"
PROD_HOST = "api.example.test"

HEALTHY = [
    DependencyHealth(name="database", status="ok", required=True),
    DependencyHealth(name="cache", status="ok", required=True),
]

# The three settings that together make the probe's shape matter. Mirrors settings/prod.py; the
# dependency probes are patched out because what is under test is request handling, not Postgres.
production_transport = override_settings(
    ALLOWED_HOSTS=[PROD_HOST],
    SECURE_SSL_REDIRECT=True,
    SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
)


@pytest.fixture
def prod_client(client: Client) -> Any:
    """A test client under prod-like transport settings with healthy dependencies."""
    with production_transport, mock.patch.object(views, "check_all", return_value=HEALTHY):
        yield client


# ------------------------------------------------------------------------------------------
# Behavioural: what the probe must send, and what happens when it doesn't
# ------------------------------------------------------------------------------------------
def test_loopback_without_a_host_header_is_rejected(prod_client: Client) -> None:
    """⚠️ Failure #1. `127.0.0.1` is not in ALLOWED_HOSTS, so this never reaches the view.

    `SecurityMiddleware.process_request` calls `request.get_host()` to build its redirect, and
    that raises `DisallowedHost` first — which is why the original healthcheck's real error was
    a confusing SSL one and not a 400.
    """
    response = prod_client.get(HEALTH_PATH, headers={"host": "127.0.0.1:8080"})

    assert response.status_code == 400


def test_a_correct_host_without_forwarded_proto_is_redirected(prod_client: Client) -> None:
    """⚠️ Failure #2, and the one that produced the misleading error.

    `SECURE_SSL_REDIRECT` sends a 301 to https://, and `urllib` follows redirects by default —
    into a container port serving plain HTTP. The result is
    `[SSL: WRONG_VERSION_NUMBER]`, which reads like a TLS misconfiguration and is not one.
    """
    response = prod_client.get(HEALTH_PATH, headers={"host": PROD_HOST})

    assert response.status_code == 301
    assert response["Location"] == f"https://{PROD_HOST}{HEALTH_PATH}"


def test_host_plus_forwarded_proto_returns_200(prod_client: Client) -> None:
    """The real serving path. Exactly the two headers deploy/Caddyfile sets via `header_up`."""
    response = prod_client.get(
        HEALTH_PATH,
        headers={"host": PROD_HOST, "x-forwarded-proto": "https"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ------------------------------------------------------------------------------------------
# Structural: the deployed healthcheck still sends both headers
# ------------------------------------------------------------------------------------------
def _prod_compose() -> dict[str, Any]:
    path = Path(__file__).resolve().parents[3] / "docker-compose.prod.yml"
    # safe_load resolves the `<<: *app` merge keys, so `services.api` arrives fully populated.
    loaded: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    return loaded


def _api_healthcheck_command() -> str:
    return " ".join(_prod_compose()["services"]["api"]["healthcheck"]["test"])


def test_the_compose_healthcheck_sends_both_headers() -> None:
    """⚠️ Drop either header and the deployment silently serves nothing.

    Asserted against the YAML rather than the behaviour above, because the behaviour cannot see
    what the container is actually configured to run.
    """
    command = _api_healthcheck_command()

    assert "Host" in command, "healthcheck must set Host or ALLOWED_HOSTS rejects it (400)"
    assert "X-Forwarded-Proto" in command, (
        "healthcheck must set X-Forwarded-Proto or SECURE_SSL_REDIRECT 301s it to https"
    )


def test_the_healthcheck_host_comes_from_deployment_configuration() -> None:
    """The Host value must be read from the environment, never hardcoded to one domain."""
    command = _api_healthcheck_command()

    assert "API_DOMAIN" in command or "DJANGO_ALLOWED_HOSTS" in command


def test_caddy_is_gated_on_the_api_healthcheck() -> None:
    """The coupling that turns a failing probe into a total outage.

    Caddy is the only service publishing 80/443. If this dependency is ever removed the
    healthcheck stops being load-bearing — and the tests above stop being urgent — so the
    relationship is asserted rather than left in a comment.
    """
    caddy = _prod_compose()["services"]["caddy"]

    assert caddy["depends_on"]["api"]["condition"] == "service_healthy"
    assert "443:443" in caddy["ports"]
