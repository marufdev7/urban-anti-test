"""
Production settings (A4, T0.3).

Everything here is a deployment hardening step. `manage.py check --deploy` runs in CI
(A9 / T0.5) and must pass with zero warnings against this module [doc: DevOps §4.1, §8.1].

No defaults for anything security-relevant: DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS and
DATABASE_URL all fail startup if absent. A pod that cannot boot is a visible incident; a
pod running on a fallback secret is a silent one.
"""

from .base import *  # noqa: F401, F403
from .base import LOGGING, env  # explicit: mypy/ruff can't see star-imports

# ⚠️ Never read from the environment. DEBUG renders settings and query params on error
# pages and its SQL log grows unbounded per request [doc: DevOps §8.2].
DEBUG = False

# Required — no default. Also drives CSRF's host check.
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")

# --------------------------------------------------------------------------------------
# TLS / transport
# --------------------------------------------------------------------------------------
# Requests arrive from the Ingress over plain HTTP with X-Forwarded-Proto set. Without
# this header mapping Django sees http, SECURE_SSL_REDIRECT loops, and `Secure` cookies
# are never set. ⚠️ Only safe because the only route to the pod is through that proxy —
# a client-supplied X-Forwarded-Proto would otherwise be trusted verbatim.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True

# HSTS. Ramp SECURE_HSTS_SECONDS up from a low value on a new domain — while it is live a
# browser refuses plain HTTP for the whole max-age and preload is hard to reverse.
SECURE_HSTS_SECONDS = env.int("DJANGO_HSTS_SECONDS", default=31536000)  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("DJANGO_HSTS_INCLUDE_SUBDOMAINS", default=True)
SECURE_HSTS_PRELOAD = env.bool("DJANGO_HSTS_PRELOAD", default=True)

# --------------------------------------------------------------------------------------
# Cookies
# --------------------------------------------------------------------------------------
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Required when the browser client is served from a different origin than the API —
# Django rejects the CSRF token otherwise. Scheme is mandatory: https://app.example.org
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])

# --------------------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------------------
# Require TLS to the managed database. `require` encrypts but does not verify the server
# certificate; move to verify-full once the CA bundle is mounted in the image.
DATABASES["default"].setdefault("OPTIONS", {})  # noqa: F405
DATABASES["default"]["OPTIONS"]["sslmode"] = env(  # noqa: F405
    "DATABASE_SSLMODE", default="require"
)

# --------------------------------------------------------------------------------------
# Object storage
# --------------------------------------------------------------------------------------
# ⚠️ Required here, overriding base.py's `default=""`. An empty credential is the worst
# failure shape available: the container boots, /api/v1/health reports "ok" (it probes only
# database and cache), and the deployment looks live right up until the first citizen photo
# upload 403s. Fail at import instead — same reasoning as SECRET_KEY and DATABASE_URL.
#
# The names are django-storages/boto3's, not Amazon's. This deployment points them at the
# MinIO container via STORAGE_ENDPOINT; nothing here contacts AWS.
AWS_ACCESS_KEY_ID = env("STORAGE_ACCESS_KEY")
AWS_SECRET_ACCESS_KEY = env("STORAGE_SECRET_KEY")

# Path-style (host/bucket), matching dev.py. MinIO does not serve virtual-host-style
# (bucket.host) without extra DNS work. ⚠️ Set explicitly because dev.py's rationale for
# leaving it unset here — "prod is real S3, which accepts either" — is not true of this
# deployment: prod runs the same MinIO container. botocore's "auto" already resolves to
# path-style whenever endpoint_url is set, so this changes no URL today; it pins the
# behaviour the storage server actually requires instead of relying on that default.
AWS_S3_ADDRESSING_STYLE = "path"

# ⚠️ STORAGE_ENDPOINT must be the PUBLIC storage hostname (https://storage.<domain>), not
# http://storage:9000 as locally. `Media.url` mints a presigned URL from this endpoint and
# hands it to a phone, so an internal Docker name is unreachable for the client. Caddy's
# storage vhost sends `header_up Host {host}`, which preserves the host the SigV4 signature
# covers — rewriting it there would invalidate every signature.
#
# ⚠️ Do NOT "fix" the resulting internal round-trip with AWS_S3_CUSTOM_DOMAIN: in this
# django-storages version `url()` returns an UNSIGNED url on the custom-domain branch unless a
# CloudFront signer is configured, and minio-init.sh sets `anonymous set none` — so every photo
# would 403 while the setting looks like a pure optimization.

# --------------------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------------------
# Production must never inherit Django's localhost:25 SMTP defaults. Transactional providers
# expose the same SMTP interface, so provider changes remain deployment configuration rather
# than application code changes.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT_SECONDS", default=10)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")
SERVER_EMAIL = env("SERVER_EMAIL", default=DEFAULT_FROM_EMAIL)

if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ValueError("EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be enabled.")

# --------------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------------
LOGGING["root"]["level"] = env("DJANGO_LOG_LEVEL", default="INFO")
