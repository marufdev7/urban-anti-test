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

# When running on serverless / connection-pooled infrastructure (e.g. Supabase pooler):
# 1. Close connections after each request to avoid pool starvation
DATABASES["default"]["CONN_MAX_AGE"] = 0

# 2. If connecting to Supabase pooler, automatically route to port 6543 (Transaction Mode)
# instead of port 5432 (Session Mode which is capped at 15 concurrent clients).
db_host = str(DATABASES["default"].get("HOST", ""))
if "pooler.supabase.com" in db_host:
    current_port = str(DATABASES["default"].get("PORT", ""))
    if current_port in ("5432", ""):
        DATABASES["default"]["PORT"] = 6543


# --------------------------------------------------------------------------------------
# Cache & Sessions (Use LocMemCache & DB sessions when Redis is not provided)
# --------------------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        }
    }
    SESSION_ENGINE = "django.contrib.sessions.backends.cached_db"
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "urbanmend-locmem-cache",
        }
    }
    SESSION_ENGINE = "django.contrib.sessions.backends.db"

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
