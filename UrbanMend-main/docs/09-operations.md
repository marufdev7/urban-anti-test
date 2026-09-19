# UrbanMend — Operations (DC-1)

> **DC-1** [doc: Plan §8.2] — environment/setup notes, runbook skeleton, migration guide.
> Written at the end of P0 (2026-08-05). This is the **M0 gate's** documentation deliverable.

| | |
|---|---|
| **Audience** | Anyone setting the backend up locally, or operating it once deployed |
| **Scope** | Backend only (API process + Worker process + backing services) |
| **Status** | §1 and §3 describe **what exists and has been run**. §2 is a **skeleton** — see the warning there. |

⚠️ **What this document is not.** DC-1 is the *first* of seven documentation checkpoints. The full
deployment runbook, rollback, restore and on-call guide is **DC-6, at the end of P10**. §2 below is
deliberately a skeleton: no environment has been deployed, so a detailed runbook would be fiction.
Sections marked **(DC-6)** are placeholders with the questions they must answer, not procedures to
follow.

Related: [06-devops-guide.md](06-devops-guide.md) is the *design* (containers, CI, K8s,
observability); this document is the *operator's* view of what was actually built.

---

## 1. Environment & setup

### 1.1 Prerequisites

Only **Docker Desktop** (or Docker Engine + Compose v2) and **git**.

⚠️ **A native Python install is not a supported path, and is not merely inconvenient.** GeoDjango
`dlopen()`s GDAL/GEOS/PROJ at runtime, which is awkward to install natively on Windows — this
team's platform. Compose is therefore the **mandated** local environment
[doc: DevOps §3.1, Plan P0], not a convenience. Every command below runs inside a container.

Python 3.13 / Django 5.2.16 LTS / DRF 3.17.1 are pinned in the image; you do not install them.
⚠️ Python 3.13 is a **ceiling, not a preference** — `djangorestframework-gis` 1.2.1 caps there.

### 1.2 First run

```bash
git clone <repo> && cd <repo>
cp .env.example .env.local          # placeholders only; see §1.3
docker compose up -d --build        # db, redis, storage, api, worker
docker compose run --rm api python manage.py migrate
```

⚠️ **`migrate` is a separate step and always will be.** It is never in the Dockerfile or the
container entrypoint [doc: DevOps §7, database.md] — N replicas would race each other on rollout.
Deployed, it is a **pre-deploy Job**. See §3.

Verify:

```bash
curl -s localhost:8080/api/v1/health   # {"status":"ok","dependencies":{...}}
```

### 1.3 Configuration

Config is environment variables via `django-environ`. `.env.local` is git-ignored; `.env.example`
holds **placeholders only**. ⚠️ **Never commit a real secret.**

**Required — no fallback in `base`/`prod`:**

| Variable | Notes |
|---|---|
| `DJANGO_SECRET_KEY` | Missing ⇒ startup failure, by design |
| `DATABASE_URL` | ⚠️ **`postgis://` scheme, not `postgres://`** |

⚠️ The `postgis://` scheme is what selects `django.contrib.gis.db.backends.postgis`. `base.py`
asserts the resolved engine and raises immediately if it is wrong — without that check, the wrong
scheme surfaces much later as a confusing "unknown field type" error.

⚠️ **`dev.py` supplies local-only fallbacks for both**, so a fresh clone can lint and test without
provisioning a secret. **`prod.py` deliberately has none — never add one.** A deployment with a
missing secret must fail to boot rather than run on a publicly-known key.

**Optional (defaults in `base.py`):** `REDIS_URL` (`redis://redis:6379/0`), `CELERY_BROKER_URL`
(`…/1`), `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`,
`AWS_REGION`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`.

**Production-only:** `DJANGO_ALLOWED_HOSTS` (**required, no default**),
`DJANGO_CSRF_TRUSTED_ORIGINS`, `DJANGO_HSTS_SECONDS`, `DJANGO_LOG_LEVEL`, `DATABASE_SSLMODE`.

### 1.4 Settings modules

`base` → `dev` → `prod`, plus `build`. ⚠️ **There is no `settings.local`** — DevOps §3.2's naming
was amended to `dev` in A1. Do not reintroduce it.

| Module | Used by |
|---|---|
| `urbenmend.settings.dev` | Local Compose and `manage.py` default. **Never deployed.** |
| `urbenmend.settings.prod` | Every deployed environment. No secret fallbacks; strict cookies/HSTS. |
| `urbenmend.settings.build` | Build-time `collectstatic` only — injects throwaway values so the image build needs no secrets. |

### 1.5 Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `db` | `postgis/postgis:17-3.5` | 5432 | ⚠️ **Not plain `postgres`** — the extension must exist before the first migration enables it |
| `redis` | `redis:8-alpine` | 6379 | Cache, **sessions**, rate-limit store (db 0); Celery broker (db 1) |
| `storage` | `minio/minio` | 9000/9001 | S3-compatible photo storage |
| `api` | built here | 8080 | uvicorn/ASGI |
| `worker` | built here | — | Celery worker + beat |

⚠️ **`worker` runs beat in-process (`-B`) LOCALLY ONLY.** Deployed, beat is a **separate
single-replica Deployment, `strategy: Recreate`, never autoscaled** — two schedulers double-fire the
outbox relay (T6.2) and every periodic job [doc: DevOps §3.1/§6.1, async-worker.md].

`docker-compose.override.yml` applies automatically and is local-only: it swaps both processes to
the `dev` image target, bind-mounts source, and adds `--reload`. ⚠️ Celery has **no** reloader — a
worker code change needs `docker compose restart worker`.

### 1.6 Everyday commands

All gates run **inside the `dev` image**, which is what CI does — see §1.7.

```bash
docker compose exec api ruff check
docker compose exec api ruff format --check
docker compose exec api mypy                                 # strict
docker compose exec api pytest
docker compose exec api python manage.py makemigrations --check --dry-run
docker compose exec \
  -e DJANGO_SETTINGS_MODULE=urbenmend.settings.prod \
  -e DJANGO_SECRET_KEY=local-deploy-check-only-0123456789abcdefghijklmnopqrstuv \
  -e DJANGO_ALLOWED_HOSTS=urbenmend.example \
  api python manage.py check --deploy --fail-level WARNING
docker compose exec api python manage.py createsuperuser      # Django admin (FR-30/31)
```

If a previous interrupted pytest process leaves Django's disposable database behind, remove only
that database before retrying a clean run:

```bash
docker compose exec db dropdb --if-exists -U urbenmend test_urbenmend
docker compose exec api pytest
```

Do not use `--reuse-db` to diagnose migration or seed-data failures: it deliberately preserves a
possibly stale schema and can hide whether the category/reference-data migrations work from zero.

For a read-only local/staging performance smoke check, run:

```bash
docker compose exec api python manage.py perf_smoke \
  --iterations 10 --max-ms 2000 --max-queries 100
```

It measures report list, issue queue, and low-zoom map responses over existing data, reporting
HTTP status, average/max latency, and SQL count. The command exits non-zero if a response is not
successful or exceeds either budget. It creates no rows and is **not** a substitute for a
representative load test — that is **§4**, and `perf_smoke --explain` is step 3 of it. Record this
command's output with the deployment's dataset size before release.

The integration suite is intentionally run serially. Do not add `-n`/`pytest-xdist` to the command:
several concurrency tests deliberately share Redis and exercise database transaction boundaries;
parallel workers would use the same cache namespace and produce false failures.

Before release, verify the NFR-13 LLM controls against the real Redis cache:

```bash
docker compose exec api pytest \
  urbenmend/classification/tests/test_orchestration.py \
  -k "call_limit or spend_guard or circuit_opens" -vv
```

This covers per-user and cross-user global call ceilings, the daily estimated-token budget, and the
circuit breaker. Every exhausted or unavailable path must persist a keyword-fallback classification;
the provider call count must stop at the configured limit rather than merely logging a warning.

Verify the outbox worker-crash recovery boundary before release:

```bash
docker compose exec api pytest \
  urbenmend/notifications/tests/test_tasks.py \
  -k "publish_failure or crash_after_publish or does_not_republish" -vv
```

The critical case is a worker loss after the broker accepted the task but before the database
transaction marked the outbox row published. The row must remain pending for relay, and duplicate
consumer delivery must still create exactly one in-app notification per event and recipient.

⚠️ One command per line, deliberately. `docker compose exec api ruff check && ruff format --check`
runs the **second command on the host**, where ruff is not installed — it either fails confusingly
or silently checks nothing. To chain inside the container, quote the whole thing:
`docker compose exec api sh -c 'ruff check && ruff format --check'`.

Verified again 2026-08-14 against the running stack: ruff clean, strict mypy clean, `pytest`
**997 passed**, `makemigrations --check` "No changes detected",
`GET /api/v1/health` → `200 {"status":"ok","dependencies":{"database":{"status":"ok"},"cache":{"status":"ok"}}}`.

✅ T4.4 removed the deliberate clustering xfail. `test_clustering_concurrency.py` now exercises
two real parallel database transactions and must pass; a failure indicates the geohash+category
advisory locking no longer prevents duplicate Issues.

### 1.7 Why everything runs in a container

⚠️ Not stylistic. The runtime library package names are **Debian 13 (trixie)** specific
(`libgdal36`, `libgeos-c1t64`, `libproj25`). CI's `ubuntu-latest` is Ubuntu noble, where the same
libraries are named differently (`libgdal34`, `libgeos-c1v5`). Installing them by hand on the
runner would fork the dependency set the deployed image actually uses. Running every gate inside
the image keeps CI, local and production identical.

Dockerfile stages: `deps` → `runtime` → `dev`. ⚠️ **`dev` is deliberately last** so
`--target runtime` can never pick up pytest/ruff/mypy.

### 1.8 Dependency changes

Dependencies are compiled with `pip-compile`; **never hand-edit a `.txt`**.

```bash
# edit requirements/base.in or dev.in, then:
pip-compile --generate-hashes requirements/base.in
pip-compile --generate-hashes --allow-unsafe requirements/dev.in   # ⚠️ dev needs --allow-unsafe
docker compose build
```

---

## 2. Runbook skeleton

⚠️ **SKELETON — nothing here has been executed against a deployed environment, because none
exists.** Every subsection marked **(DC-6)** states the questions it must answer rather than a
procedure. Do not follow it as if it were verified. It is completed at **DC-6, end of P10**
[doc: Plan §8.2].

### 2.1 What runs

Deployed, **four workloads run the same image**, differing only in `command` [doc: DevOps §6.1]:

| Workload | Replicas | Command |
|---|---|---|
| `api` | 2+ (HPA on CPU/RPS) | `uvicorn urbenmend.asgi:application --host 0.0.0.0 --port 8080` |
| `worker` | 1–2, scaled on **queue depth** (not CPU) | `celery -A urbenmend worker --loglevel=info` |
| `beat` | ⚠️ **EXACTLY 1**, `strategy: Recreate`, never autoscaled | `celery -A urbenmend beat --loglevel=info` |
| `migrate-<sha>` | run-once Job, pre-deploy | `python manage.py migrate` |

⚠️ **Note the worker command drops `-B`.** Locally, `docker-compose.yml` runs
`celery -A urbenmend worker -B` — beat in-process. Deployed, beat is its own Deployment and the
worker must **not** carry `-B`, or every worker replica becomes a scheduler. Two schedulers
double-fire the outbox relay (T6.2) and every periodic job [doc: DevOps §3.1/§6.1,
async-worker.md]. `strategy: Recreate` matters too — a rolling update would briefly run two.

⚠️ ASGI is **required, not a preference**: the SSE notification stream (T6.8) needs it. Under WSGI
each open stream pins a worker thread.

⚠️ **The worker deployment must be rolled with the API**, never left behind [doc: DevOps §5.2].

⚠️ **`readOnlyRootFilesystem: true` needs an `emptyDir` at `/tmp`** or Django file uploads break
(mandatory on the worker; `TMPDIR` may point at the mounted volume).

### 2.2 Health and readiness

`GET /api/v1/health` — unauthenticated by design (a probe whose credential expired would mark
healthy pods not-ready). Returns a three-state verdict:

| `status` | HTTP | Meaning |
|---|---|---|
| `ok` | 200 | All dependencies reachable |
| `degraded` | **200** | An *optional* dependency failed — a feature is degraded (NFR-4 working as designed) |
| `unavailable` | 503 | A *required* dependency failed — pod cannot serve |

⚠️ **Only a required failure returns 503**, and a 503 pulls the pod from the load balancer
[doc: DevOps §8.4]. Marking an optional dependency required would take the deployment offline for a
failure NFR-4 says must merely degrade. Currently required: **database** and **cache** (cache is
required *because sessions live in it*). LLM and geocoder probes land here in P2/P3 as optional.

⚠️ Failure `detail` is deliberately generic. Driver errors carry host, database name and user from
the DSN, and this endpoint is public — **never widen it to include the exception text.**

### 2.3 Logs

Structured JSON to stdout/stderr, never to files in the container. Every line carries `timestamp`,
`level`, `traceId`, `service`, `message`.

Correlate a request with the work it queued using `traceId`: the API stamps it, and it propagates
into Celery task **headers** and is re-bound in the worker.

⚠️ **`request.path` is logged, never the query string.** Filters carry `?q=` search text, and
NFR-12/P6 treat report content as personal data.

⚠️ Inbound `X-Trace-Id` values are **rejected, not escaped**, when they contain CRLF/NUL/whitespace
or exceed 128 chars — the value is echoed into a response header and written to logs.

### 2.4 Metrics

`/metrics` (Prometheus, via `django-prometheus`). ⚠️ **Must NOT be reachable through the Ingress** —
exposing it publishes the operational picture of the deployment [doc: DevOps §8.2/§9]. Django
cannot enforce this; it is an Ingress/proxy concern. Pod-port scrape only.

### 2.5 Deploy **(DC-6)**

For a Kubernetes environment whose `app-config` ConfigMap and `app-secrets` Secret already exist:

```powershell
.\scripts\deploy.ps1 `
  -ImageSha <git-sha> `
  -Namespace urbenmend-staging `
  -ImageRepository ghcr.io/<owner>/<repository>
```

The script renders `deploy/migration-job.yaml` with the exact SHA image, waits for migrations to
complete, then rolls API, worker, and beat and waits for each workload's readiness. ⚠️ **Never deploy
`latest`** — a moving tag makes the deployed revision unknowable and rollback unrepeatable.

### 2.6 Rollback **(DC-6)**

Roll code back to the previously recorded SHA without reversing the schema by default:

```powershell
.\scripts\rollback.ps1 `
  -PreviousImageSha <previous-git-sha> `
  -Namespace urbenmend-staging `
  -ImageRepository ghcr.io/<owner>/<repository>
```

This is why migrations must be backward-compatible: the previous image must run against the newer
schema. Reverse a migration only after confirming its reverse operation is safe and data-preserving;
otherwise fix forward.

### 2.7 Backup & restore **(DC-6)**

The repository provides provider-neutral local rehearsal scripts. In production, run the equivalent
commands through the managed Postgres/S3 backup systems with the same retention policy:

```powershell
.\scripts\backup.ps1 -OutputDirectory .\artifacts\backup
.\scripts\restore-check.ps1 `
  -DumpPath .\artifacts\backup\urbenmend-<timestamp>.dump `
  -MediaDirectory .\artifacts\backup\media-<timestamp>
```

The backup captures a PostgreSQL custom-format dump, an object manifest, and the complete media
bucket. The restore check uses a dedicated database and temporary bucket, validates that the schema
restores, and compares media object counts. Schedule daily database snapshots plus continuous WAL
archiving (30-day retention), and versioned/replicated object storage (90-day retention); rehearse a
database restore monthly and media restore quarterly. ⚠️ Untested backups are not backups.

### 2.8 On-call **(DC-6)**

Must answer: alert thresholds (HTTP p99 > 500 ms per NFR-2, queue depth, LLM cost caps per NFR-13),
escalation, and per-alert first response.

### 2.9 Common operations

⚠️ Unlike the rest of §2, this table is **not** a placeholder — it is condensed from
[06-devops-guide.md](06-devops-guide.md) §9.1, which already specifies these. It is still
**unrehearsed**: no environment exists to have practised them against. DC-6 turns each row into a
step-by-step procedure.

| Situation | First response |
|---|---|
| Deploy to production | Pull SHA tag → `migrate` pre-deploy Job → rolling update → smoke test → verify metrics |
| Rollback | Re-deploy previous SHA tag → reverse schema **only if reversible** (§3) → verify health → investigate |
| LLM outage | ⚠️ **No manual action.** Keyword fallback activates automatically; intake and the queue must never block, and the API still returns `202`. Monitor the classification-source metric; act only if the fallback also fails |
| Worker crash / queue backlog | Check pod logs, restart pod, watch queue depth drain. ⚠️ **Check beat is alive first** (outbox backlog metric) — a stalled beat is silent: no queue grows and no error is logged, notifications simply stop |
| DB failover | Promote replica → update the `DATABASE_URL` secret → rolling restart of api **+ worker + beat** |
| High error rate | Group logs by `traceId`; check DB/Redis health; check the LLM cost cap |
| Security incident | ⚠️ Revoke sessions server-side by deleting `django_session` rows — this is why sessions are used and **not JWT** (BR-25/33, Arch §8). Rotate secrets including `DJANGO_SECRET_KEY`; review the audit log |
| Beat scaled past 1 replica | Duplicate Issues / double-fired outbox. Scale back to exactly 1 (§2.1) |

Inspect the same outbox signal directly from a pod or scheduled monitor:

```bash
docker compose exec api python manage.py outbox_status
# pending=3 oldest_age_seconds=412
```

Alert when `oldest_age_seconds > 300` while `pending > 0`, matching the five-minute threshold in
the deployment guide. ⚠️ **The outbox backlog metric — age of the oldest unrelayed row — is the only signal that
distinguishes "nothing to send" from "the relay is dead."** Queue depth will not tell you.

---

## 3. Migration guide

### 3.1 The rules

- **Migrations are code** — committed, reviewed in PRs, ⚠️ **never applied manually in production**.
- A generated migration is a **draft to be reviewed**, not an artifact to trust. Check operation
  order [doc: DevOps §7].
- ⚠️ **Never edit a migration already applied to a shared environment.**
- ⚠️ **Never run `migrate` in the Dockerfile or entrypoint.** Pre-deploy Job only.
- `makemigrations --check --dry-run` is a **CI gate** (stage 2). It catches a model edited without
  its migration — which passes locally against an already-migrated dev DB and then fails on a fresh
  deploy.
- Keep every migration reversible; CI tests both directions.
- ⚠️ `RunPython` is **not** reversible unless you supply a reverse callable, and data migrations
  **must** use `apps.get_model(...)` and **must not** import application code — including
  `services.py`/`selectors.py`. They receive historical model states.

### 3.2 Zero-downtime

⚠️ **Backward-compatible migrations only.** During a rolling update, old and new code run against
one schema simultaneously. A rename is therefore **always three deploys** — add → dual-write and
backfill → drop — never one.

⚠️ **Long-lived locks are the real hazard.** Adding an index to a populated table (the GiST spatial
indexes of T4.2 especially) locks writes for the duration. Use `AddIndexConcurrently` in a
non-atomic migration (`atomic = False`) so the deploy does not block report submission. Split
`ADD CONSTRAINT` from `VALIDATE CONSTRAINT` likewise.

### 3.3 Applying

```bash
docker compose run --rm api python manage.py migrate     # local
```

Deployed: a **pre-deploy Job**, not an init container — an init container runs once per pod, so N
replicas race. Old pods keep serving until new pods pass readiness.

### 3.4 The PostGIS baseline ⚠️

`identity/0001_initial.py` leads with `CreateExtension("postgis")`, then creates `User`.

- ⚠️ **It must stay the first operation of the first migration.** It lives in `identity` — not
  `geo`/`reporting`, which will own the geometry — because Django orders by the **dependency
  graph**, not app name, and `identity.0001` is the earliest project-owned node (`AUTH_USER_MODEL`
  points at it). A geometry-bearing app must name it in `dependencies` if it has no other path.
- ⚠️ **`identity/0001` is frozen.** It has been applied. It was hand-edited before that (the
  documented posture: a generated migration is a draft).
- ⚠️ **Reversing it DROPs the extension** — destructive on any database holding geometry.
  Deployment is **forward-only**.
- The database role running the first migration must be able to `CREATE EXTENSION`.

⚠️ **`postgis/postgis` pre-creates the extension, so `migrate` against the Compose DB cannot fail
and proves nothing** — `sqlmigrate` shows the operation as `-- (no-op)` there. Verify on a fresh
`CREATE DATABASE` holding only `plpgsql`. CI does this (stage 5, `migration_probe`).

### 3.5 The CI role ⚠️

The CI database user is a **superuser** and is deliberately **not** the runtime application role.
The test database is built from zero every run and must `CREATE EXTENSION`; separately, T8.1
enforces the append-only rule on status/audit events by **revoking `UPDATE`/`DELETE` from the
application role** — if CI ran as that role, the revoke script itself would be untestable
[doc: testing.md, database.md].

### 3.6 Deletion

⚠️ **No hard deletes.** Categories, POIs and severity keywords use `Active → Retired`. Issues are
never hard-deleted; moderation hides content (FR-31). Deleting a user **anonymizes** — it must not
orphan or destroy public Issue history (C-14, BR-33).

⚠️ The `identity_user_has_contact_or_anonymized` constraint has a `status=deleted` escape hatch.
**Without it the C-14 anonymization would be impossible — do not tighten it.** Absence of a contact
is **`NULL`, never `""`**: Postgres allows many NULLs under UNIQUE but only one `""`.

---

## 4. Load testing (T10.4)

The representative load test. `perf_smoke` (§1.6) is a single-threaded read-only check and explicitly
**not** this; the load run is what evidence for Plan §9's "Load test meets NFR-1/2/3 targets" comes
from. Recorded results live in [`14-load-test-results.md`](14-load-test-results.md).

**What it measures.** NFR-2 — interactive pages under **2 s** — at A7's prototype scale. The
2026-08-23 run completed with zero request failures; map and later-page queue p95 exceeded 2 s, and
the project accepted that deviation for the academic prototype. NFR-1 is covered by
`perf_smoke --explain` (step 3); NFR-3 remains an operational follow-up measurement (step 7).

⚠️ **Locust exits 0 for any run that completed**, however bad the numbers. The `quitting` hook in
`urbenmend/platform/loadtest/locustfile.py` is what sets a non-zero exit code on a p95 breach or on
request failures — that hook is the entire reason this is a gate and not a report. Step 6 proves it
still fires.

⚠️ **Never run this against real data.** It writes thousands of reports and mints live sessions.

### 4.1 Why sessions are seeded out-of-band

The harness never calls `/auth/login`. `auth_anon` is 10/15m per IP and `auth_identity` 5/15m per
identifier, and a load generator is a single IP — a logging-in harness measures the throttle within
seconds. Relaxing the auth buckets to work around that would destroy the thing **T10.1** exists to
verify, so `seed_load_dataset` mints sessions through the real `identity.services.start_session()` and
the harness replays them as cookies.

⚠️ **`.loadtest/sessions.csv` holds live session keys — bearer credentials for the seeded accounts
until they expire (BR-33).** That is why `.loadtest/` is git-ignored. Delete it after the run.

### 4.2 The procedure

**1. Seed the dataset.** The env gate is deliberate: it is the only thing standing between this
command and a real database.

```bash
docker compose exec -T api sh -c "LOADTEST_SEED_ENABLED=1 python manage.py seed_load_dataset --reports 2000 --citizens 30 --authorities 5"
```

`--reports` is a **target, not an increment** — re-running with the same number adds nothing, so two
runs stay comparable. Raising it tops up; lowering it is a no-op (Issues are never hard-deleted and
`Report.author` is `PROTECT`). ⚠️ Changing the dataset *shape* rather than its size — the constants
governing reports-per-issue or hotspot density — needs a **fresh database**, or the top-up leaves
Issues holding no Reports:

```bash
docker compose stop api worker
docker compose exec -T db psql -U urbenmend -d postgres -c "DROP DATABASE IF EXISTS urbenmend WITH (FORCE);" -c "CREATE DATABASE urbenmend OWNER urbenmend;"
docker compose exec -T redis redis-cli FLUSHALL
docker compose start api worker
docker compose exec -T api python manage.py migrate
```

The seeder writes two handoff files the harness reads instead of carrying its own constants:
`.loadtest/sessions.csv` and `.loadtest/geography.json` (bbox, hotspot centres, active category
slugs). ⚠️ Baked-in coordinates would survive a boundary change and turn every submission into
`422 OUT_OF_CITY`, which a load run reports as a very fast write path.

**2. Raise the submission throttles — for the run only.** At their real defaults (20/1h per account,
120/1h per IP) the generator measures the throttle, not the application. Add to `.env.local`:

```
SUBMISSION_THROTTLE_RATE_REPORT=1000000/1h
SUBMISSION_THROTTLE_RATE_MEDIA=1000000/1h
SUBMISSION_THROTTLE_RATE_IP=1000000/1h
```

⚠️ **`env_file` is read at container creation**, so the values only take effect after a recreate —
editing `.env.local` and restarting is not enough:

```bash
docker compose up -d --force-recreate api worker
docker compose exec -T api python manage.py shell -c "from django.conf import settings; print(settings.SUBMISSION_THROTTLE_RATES)"
```

⚠️ **Only the submission buckets, never the auth buckets, and never in any settings file or deployed
environment.** T10.1 is the task that verifies these limits at their real values.

⚠️ `DJANGO_ALLOWED_HOSTS` must include `api` — the generator reaches the API by its compose service
name. Without it every request is a `400`, which a load run reports as a fast failure rather than a
misconfiguration.

**3. Validate the query plans (NFR-1).** Against the seeded data, not an empty database:

```bash
docker compose exec -T api python manage.py perf_smoke --explain
```

It asserts a GiST index on every queried geometry column — deterministic, and the check that catches
`GistIndex` → `models.Index` — then reads `EXPLAIN (ANALYZE, BUFFERS)` plans for the bbox and
`ST_DWithin` predicates. Read `matched=` alongside `access=`: a probe that matches nothing gets an
index scan trivially and proves nothing, so a zero-match probe over a populated table prints a
warning. A `Seq Scan` is an error only above `--explain-min-rows` (default 500) — PostgreSQL is right
to scan a small table, and a check that failed on an empty database would be switched off within a
week.

**4. Run the gate at A7 scale.** This is the deliverable; it must exit **0**.

```bash
docker compose --profile loadtest run --rm -T loadgen --headless -u 25 -r 5 -t 5m --csv .loadtest/a7
```

**5. Ramp past A7 to find the knee.** Recorded, not gated — raise the budget so the gate does not
fire on a run whose purpose is to breach it:

```bash
docker compose --profile loadtest run --rm -T -e LOADTEST_P95_MS=100000 loadgen \
  --headless -u 200 -r 2 -t 10m --csv .loadtest/ramp --csv-full-history
```

Read `.loadtest/ramp_stats_history.csv` for the concurrency at which p95 crosses 2000 ms.

**6. Prove the gate can fail.** A gate never observed to fail is not known to be a gate:

```bash
docker compose --profile loadtest run --rm -T -e LOADTEST_P95_MS=1 loadgen \
  --headless -u 5 -r 5 -t 30s --csv .loadtest/proof
```

This must exit **non-zero** with `NFR GATE FAILED` naming the offending group.

**7. NFR-3 spot check.** With the worker running, a submission's classification must land within a few
seconds and leave no backlog:

```bash
docker compose exec -T api python manage.py outbox_status
```

### 4.3 Restore afterwards

### 4.4 T10.1 ten-user verification

```bash
docker compose exec -T api pytest urbenmend/classification/tests/test_orchestration.py::test_ten_concurrent_users_respect_global_cap_and_fallback -q
```

This passed on 2026-08-23: ten concurrent reports reached `triaged`, the five-call global LLM
ceiling was respected, and capped operations were persisted via keyword fallback. This verifies the
prototype target of at least ten concurrent users.

### 4.5 T10.2 security review

The application-level security regression review passed 154 focused tests on 2026-08-23. It covers
anonymous and citizen mutation denial, out-of-scope Authority mutation denial, cross-owner access
for reports/issues/media/comments/exports/notifications, UUID enumeration resistance, and generic
registration, verification, login, password-reset, and provisioning responses. TLS/HSTS, secure
cookies, and deploy checks remain CI/configuration controls; no external penetration test is claimed.

### 4.6 T10.3 privacy review

The focused privacy review passed 145 tests on 2026-08-23. It checks public response serializers,
EXIF/GPS removal before object storage, report-only identifiers in Celery payloads, absence of
contact data in classification prompts and operational logs, and account anonymization/deletion
behaviour. User-authored free text is still sent to the configured classifier because it is the
classification input; the system does not claim automatic redaction of PII typed into that text.

### 4.7 T10.5 failure-mode drill record

On 2026-08-23 the live local Compose stack was exercised one dependency at a time. LLM fallback
checks passed (4 tests), outbox crash-boundary checks passed (3 tests), Redis recovered in 1.13 s,
Postgres/PostGIS in 1.19 s, and the Celery worker in 4.90 s. After each restart, health checks
passed and `manage.py outbox_status` reported `pending=0`. This demonstrates local recovery and
does not claim production replica promotion or data-loss behavior under a real host failure.

### 4.8 T10.6 observability metrics

`/metrics` now includes custom gauges for outbox pending count and oldest age, Celery Redis queue
depth, LLM daily token usage and budget ratio, and classification fallback rate. Verify them with:

```bash
docker compose exec -T api python manage.py shell -c "from prometheus_client import generate_latest; print('\n'.join(line for line in generate_latest().decode().splitlines() if line.startswith('urbenmend_')))"
```

The collector is intentionally read-only and fails closed when Redis or the database is unavailable.
Azure alert rules, destinations, and staging fault tests remain deployment-owner work; this
repository does not claim those alerts are configured.

Not optional — the raised throttles are a real weakening of the submission controls.

```bash
# Remove the three SUBMISSION_THROTTLE_RATE_* lines from .env.local, then:
docker compose up -d --force-recreate api worker
docker compose exec -T api python manage.py shell -c "from django.conf import settings; print(settings.SUBMISSION_THROTTLE_RATES)"
rm -rf .loadtest/                 # live session keys
docker compose exec -T api pytest
git status                        # no .loadtest/ artifacts staged
```

---

## 5. Open questions affecting operations

⚠️ **Unresolved. Do not invent answers — raise them** [doc: CLAUDE.md, Plan §10].

| ID | Question | Operational impact |
|---|---|---|
| — | **Cloud host** | Unpinned. Blocks §2.5–2.8 concretely. |
| Q3 | POI data source | Display-only, but an ingest job to operate |
| Q5 | Notification channels | Determines SMS provider and its cost/rate ceilings |
| Q6 | EXIF default | ⚠️ Privacy-affecting (BR-4: EXIF stripped by default) |
| Q10 | Accuracy bar | Sets the LLM-quality alert threshold |

**Resolved:** Q1 (taxonomy — confirmed 2026-08-07 as the seven-node PRD §6.2 draft; seeded in
`classification/0001`), Q2 (severity is Critical/High/Medium/Low), Q9 (**LLM provider is Google AI
Studio**, chosen 2026-08-25 — Gemini via the native `generateContent` API, selected in the environment
with `CLASSIFICATION_LLM_PROVIDER=google_ai_studio`; the adapter stays provider-agnostic and the
product never hard-depends on the external API, NFR-4).

⚠️ **One operational half of Q9 is NOT closed by that choice: the tier.** Google's unpaid tier may use
submitted prompts to improve its products, and what this sends is citizen report text (P7). A
deployment handling real submissions needs **billing enabled on the key**, and no code path can detect
which tier a key is on — so this is a decision to record and verify in the Google console, not a guard
the application can enforce. Setup and the smoke evaluation: `docs/10-llm-deployment-evaluation.md`.
