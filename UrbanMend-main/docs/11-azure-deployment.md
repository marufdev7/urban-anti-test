# UrbanMend - Simple Azure Deployment

This is the lowest-complexity production deployment: one Ubuntu Azure VM runs the same Docker
Compose services used locally. No managed database, managed Redis, Azure Blob Storage, Kubernetes,
or Container Apps are required.

## Architecture

```text
Internet
  |
Azure public IP + Network Security Group (22 from your IP, 80/443 public)
  |
  Caddy (automatic HTTPS)
    |-- API -> api:8080
    `-- MinIO S3 API -> storage:9000

Private Docker networks
  |-- api
  |-- worker
  |-- beat (exactly one)
  |-- PostgreSQL/PostGIS
  |-- Redis
  `-- MinIO (persistent named volumes)
```

Keep PostgreSQL, Redis, and MinIO private; only Caddy publishes ports 80 and 443. The MinIO console
(9001), database (5432), Redis (6379), and API (8080) must not be allowed by the Azure NSG.

## Azure resources

Create only:

1. A resource group.
2. An Ubuntu 24.04 LTS VM, starting at 2 vCPU and 4-8 GB RAM.
3. A static public IP and Network Security Group.
4. Optional: an Azure managed data disk mounted for Docker volumes.

Assign a DNS record for both `api.<domain>` and `storage.<domain>` to the static public IP. Caddy
will obtain and renew certificates automatically after DNS and ports 80/443 are working.

## VM bootstrap

SSH to the VM with an administrative account, install Docker Engine and the Compose plugin, then
clone this repository. Create a non-root deployment user, disable password SSH login, enable the
Azure NSG and host firewall, and enable Docker at boot. Keep the repository and `.env.production`
outside public web directories.

```bash
git clone <repository-url> urbanmend
cd urbanmend
cp .env.production.example .env.production
chmod 600 .env.production
```

## Production environment

Edit `.env.production`. Use the same internal service names as local Compose:

```dotenv
APP_IMAGE=ghcr.io/<owner>/<repository>:<immutable-git-sha>
API_DOMAIN=api.example.com
STORAGE_DOMAIN=storage.example.com
ACME_EMAIL=ops@example.com

DJANGO_SETTINGS_MODULE=urbenmend.settings.prod
DJANGO_ALLOWED_HOSTS=api.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.example.com

POSTGRES_DB=urbenmend
POSTGRES_USER=urbenmend
POSTGRES_PASSWORD=<unique-password>
DATABASE_URL=postgis://urbenmend:<url-encoded-password>@db:5432/urbenmend
DATABASE_SSLMODE=disable

REDIS_PASSWORD=<unique-password>
REDIS_URL=redis://:<password>@redis:6379/0
CELERY_BROKER_URL=redis://:<password>@redis:6379/1

STORAGE_ENDPOINT=https://storage.example.com
STORAGE_BUCKET=urbenmend-media
STORAGE_ACCESS_KEY=<unique-access-key>
STORAGE_SECRET_KEY=<unique-secret-key>
```

Keep the remaining application settings from `.env.production.example`. `DATABASE_SSLMODE=disable`
is correct because PostgreSQL is on the same private Docker network. MinIO remains the S3-compatible
media backend; do not change Django storage settings to Azure Blob Storage.

`STORAGE_ENDPOINT` is the one value that must **not** copy the local setup. Locally it is
`http://storage:9000`; here it must be the public `https://storage.<domain>`. Django mints a
presigned URL from this endpoint and returns it to a phone, so an internal Docker name is
unreachable for the client. Caddy's storage vhost forwards `Host` unchanged, which is what keeps
the SigV4 signature valid across the proxy. Two related traps: `STORAGE_ACCESS_KEY` and
`STORAGE_SECRET_KEY` must equal the MinIO root credentials the `storage` service starts with (they
are the same two variables, so this holds by construction), and `AWS_S3_CUSTOM_DOMAIN` must stay
unset — django-storages returns an *unsigned* URL on that code path, and the bucket denies
anonymous reads, so every photo would 403.

Generate new production values for every secret. Never commit `.env.production` or reuse local
development credentials.

The four `EMAIL_*` variables (`EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
`DEFAULT_FROM_EMAIL`) are **required, not optional**: `urbenmend.settings.prod` reads them with no
default, so the API, worker and Beat containers crash-loop on startup without them. The same is true
of `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`. LLM settings *are* optional for initial bring-up —
leave `UnconfiguredLLMProvider` in place and the deterministic keyword fallback remains available.

⚠️ **When you do turn the LLM on, the provider is Google AI Studio** (❓Q9, decided 2026-08-25):
`CLASSIFICATION_LLM_PROVIDER=google_ai_studio` with the endpoint/model/key triple from
`.env.production.example`. Two conditions that are easy to miss because neither fails loudly:

- **The key must be billing-enabled.** Google's unpaid tier may use submitted prompts to improve its
  products, and what this sends is citizen report text (P7). Nothing in the API distinguishes a free
  key from a paid one, so no code path can enforce this — verify it in the Google console before
  pointing production at a key.
- **`CLASSIFICATION_LLM_THINKING_BUDGET=0` is load-bearing, not tuning.** Gemini 2.5 bills reasoning
  against the same output cap that NFR-13 sizes for a short JSON answer, so leaving thinking enabled
  returns an empty candidate on *every* report — triage silently degrades to the keyword fallback while
  the invoice shows real spend.

A wrong key or endpoint also fails quietly by design: submission still returns `202` and the keyword
fallback classifies. Confirm the provider is actually being used by watching for
`classification.llm.attempt_failed` and `classification.fallback_selected` in the worker logs, and by
running the smoke evaluation in `docs/10-llm-deployment-evaluation.md`.

Note that `docker compose ... config` cannot catch a missing one of these. The `db`, `redis`,
`storage` and `caddy` services declare variables with Compose's `${VAR:?}` required syntax, so
Compose validates them; the application services receive everything through `env_file`, which
Compose does not inspect. A successful `config` means the Compose file resolves, not that the
application can boot.

## First deployment

From the repository directory on the VM:

```bash
docker login ghcr.io
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api python manage.py migrate --noinput
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

The Compose file starts API, worker, one Beat, PostgreSQL/PostGIS, Redis, MinIO, bucket
initialization, static-file initialization, and Caddy. Do not run a second Beat instance.

Verify:

```bash
curl https://api.example.com/api/v1/health
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 api worker beat caddy
```

## Updates and rollback

Build and push a new immutable SHA-tagged image in CI. On the VM, update `APP_IMAGE`, then run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api python manage.py migrate --noinput
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

To roll back, set `APP_IMAGE` to the previous SHA and repeat the same commands. Do not reverse
migrations automatically; migrations must remain backward-compatible.

## Persistence and backups

The named volumes in `docker-compose.prod.yml` preserve database, Redis, MinIO, static, and Caddy
state across container replacement. Never run `docker compose down -v` on the production VM.

Back up PostgreSQL and MinIO outside the VM. An Azure Storage account is suitable for backup files,
but is not required as the application's media backend. Rehearse restoration with the existing
`scripts/backup.ps1` and `scripts/restore-check.ps1` procedures adapted to the VM shell.

## Launch checklist

- DNS resolves both public hostnames to the VM static IP.
- NSG/host firewall allows only SSH (restricted), 80, and 443.
- `.env.production` is present with unique secrets and mode 600.
- `docker compose ... config` succeeds without missing variables.
- Health endpoint returns successfully over HTTPS.
- Image upload/download, asynchronous processing, notifications, and exports work.
- Database and media backups have completed and a restore has been tested.

## Monitoring and alerts

The image emits JSON logs to stdout/stderr and exposes Prometheus metrics at `/metrics`. Caddy
returns `404` for that path deliberately; do not publish it through the public API hostname.
Collect logs and metrics from the VM with Azure Monitor Agent (or an equivalent private collector):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --no-color --since=5m api worker beat caddy
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T api \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8080/metrics').read().decode())"
```

Create alerts for these release gates:

| Signal | Initial alert | Response |
|---|---:|---|
| API 5xx rate | >2% for 5 minutes | Inspect `trace_id` logs and dependency health |
| API request latency | p95 >2 seconds for 10 minutes | Check DB plans, worker backlog, and VM CPU/memory |
| Health endpoint | Any `503` for 2 minutes | Remove host from traffic and inspect Postgres/Redis |
| Celery queue depth | >500 for 10 minutes | Check worker health and scale/restart workers |
| Outbox oldest pending age | >60 seconds | Check beat, broker, and notification dispatch |
| Classification fallback rate | >20% for 15 minutes | Check provider availability and spend limits |
| LLM daily token budget | >80% | Reduce provider traffic or investigate prompt growth |
| Disk usage | >80% | Expand/clean Docker, database, and media volumes |

Record the alert destination, owner, and on-call escalation in the Azure resource group. Test each
alert with a staging fault before enabling public traffic; a dashboard without a tested response is
not an operational control.
