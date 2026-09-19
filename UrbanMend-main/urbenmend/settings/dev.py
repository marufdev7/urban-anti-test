"""
Development settings (A4, T0.3) — LOCAL ONLY, never deployed.

`DJANGO_SETTINGS_MODULE=urbenmend.settings.dev` is the manage.py fallback and what
docker-compose injects from `.env.local`.
"""

import os
from pathlib import Path

import environ

# Load .env.local for native `python manage.py ...` runs on the host. Inside Compose the
# same variables already arrive via `env_file`, and read_env uses setdefault semantics —
# it never overrides what Compose injected. Must precede the base import, which reads
# DJANGO_SECRET_KEY and DATABASE_URL at module level.
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env.local"
if _ENV_FILE.exists():
    environ.Env.read_env(str(_ENV_FILE))

# Local-only fallbacks for the two variables base.py requires with no default. They exist
# so `pytest`, `mypy`, `ruff` and `manage.py check` run on a fresh clone with no .env.local
# — a contributor should not have to provision a secret to lint the code.
#
# ⚠️ Safe ONLY because this module is never deployed: prod.py deliberately has no fallback
# for either, so a deployment with a missing secret fails to boot instead of running on a
# publicly-known key. Do not copy this pattern into prod.py.
# Values match docker-compose.yml's db service so they are correct inside Compose too.
os.environ.setdefault("DJANGO_SECRET_KEY", "dev-only-insecure-not-for-deployment")
os.environ.setdefault("DATABASE_URL", "postgis://urbenmend:urbenmend@db:5432/urbenmend")

from .base import *  # noqa: E402, F401, F403
from .base import LOGGING, env  # noqa: E402  (explicit: mypy/ruff can't see star-imports)

DEBUG = env.bool("DJANGO_DEBUG", default=True)

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1", "api"])

# --------------------------------------------------------------------------------------
# Cookies — no TLS locally
# --------------------------------------------------------------------------------------
# Compose serves plain HTTP on :8080. `Secure` cookies would never be sent back, so login
# would appear to succeed and then silently fail. prod.py sets both to True.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# --------------------------------------------------------------------------------------
# Object storage — MinIO
# --------------------------------------------------------------------------------------
# MinIO does not do virtual-host-style addressing (bucket.host) without extra DNS work,
# so force path-style (host/bucket). Real S3 accepts either; prod.py leaves the default.
AWS_S3_ADDRESSING_STYLE = "path"

# --------------------------------------------------------------------------------------
# DRF — browsable API
# --------------------------------------------------------------------------------------
# Adds the HTML renderer for hand-testing endpoints in a browser. JSON stays first so
# content negotiation still defaults to JSON, matching the deployed behaviour (API §1.2).
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

# --------------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------------
LOGGING["root"]["level"] = "DEBUG"
LOGGING["loggers"]["django"]["level"] = "DEBUG"
# django.db.backends at DEBUG logs every SQL statement — far too noisy for normal work.
# Set it to DEBUG deliberately when investigating a query, not by default.
LOGGING["loggers"]["django.db.backends"] = {
    "handlers": ["console"],
    "level": "INFO",
    "propagate": False,
}

# --------------------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------------------
# Console by default — nothing leaves a dev box, so a verification code (FR-1) can never
# reach a real inbox by accident. ⚠️ The default is the safety property, not the switch:
# real sending must be an explicit, greppable opt-in in .env.local, never something that
# turns itself on because an SMTP password happened to be present in the environment.
#
# To actually send from a dev box (e.g. verifying a Mailjet key pair works before deploying):
#   DJANGO_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
# plus the EMAIL_* values below. Codes then go to whatever address you registered with.
EMAIL_BACKEND = env(
    "DJANGO_EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
)

# ⚠️ Read here as well as in prod.py, with defaults. Without these, flipping the backend
# above would fall through to Django's own defaults — localhost:25, no credentials — and
# every send would fail with ConnectionRefusedError while the configured provider values sat
# unread in .env.local. Same variable NAMES as prod.py deliberately: .env.local and
# .env.production stay the same shape, so a value proven locally transfers verbatim.
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT_SECONDS", default=10)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="urbanmend-dev@localhost")

# Same guard as prod.py: both enabled is not a stricter configuration, it is a broken one
# (smtplib negotiates STARTTLS on an already-wrapped socket and hangs until the timeout).
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ValueError("EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be enabled.")
