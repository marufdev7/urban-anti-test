"""
Render / Cloud Free Deployment settings (ADR-001, DevOps §2).

Designed for zero-configuration container deployments on platforms like
Render, Koyeb, or Fly.io connected to managed PostgreSQL + PostGIS (e.g. Supabase).
"""

from .base import *  # noqa: F401, F403
from .base import LOGGING, env  # explicit: mypy/ruff can't see star-imports

DEBUG = env.bool("DJANGO_DEBUG", default=False)

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

# --------------------------------------------------------------------------------------
# TLS / Reverse proxy headers (Render terminates TLS at edge)
# --------------------------------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=False)

SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=True)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=True)
SESSION_COOKIE_SAMESITE = "None"
CSRF_COOKIE_SAMESITE = "None"

CSRF_TRUSTED_ORIGINS = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default=["https://*.vercel.app", "https://*.onrender.com"],
)

# --------------------------------------------------------------------------------------
# Database (Supabase PostgreSQL with PostGIS)
# --------------------------------------------------------------------------------------
DATABASES["default"].setdefault("OPTIONS", {})  # noqa: F405
DATABASES["default"]["OPTIONS"]["sslmode"] = env(  # noqa: F405
    "DATABASE_SSLMODE", default="require"
)

# --------------------------------------------------------------------------------------
# Object storage fallback
# --------------------------------------------------------------------------------------
if env("STORAGE_ACCESS_KEY", default=""):
    AWS_ACCESS_KEY_ID = env("STORAGE_ACCESS_KEY")
    AWS_SECRET_ACCESS_KEY = env("STORAGE_SECRET_KEY")
    AWS_S3_ADDRESSING_STYLE = "path"

# --------------------------------------------------------------------------------------
# Email fallback
# --------------------------------------------------------------------------------------
if env("EMAIL_HOST", default=""):
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = env("EMAIL_HOST")
    EMAIL_PORT = env.int("EMAIL_PORT", default=587)
    EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
    EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="UrbanMend <noreply@urbanmend.org>")
