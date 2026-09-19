# UrbanMend: Project Deep Dive

This document explains the implemented UrbanMend system as it exists in the repository. It is intended as a study reference for a viva: it separates product intent from implementation, and it does not treat planned or optional work as completed functionality.

## 1. Project Overview

UrbanMend is a civic issue-reporting web API for a single city. A signed-in citizen submits a description, location and optionally photographs of a public problem such as a pothole, broken light, drainage fault or waste problem. The platform validates and stores the submission, classifies it asynchronously, groups nearby related submissions into one operational `Issue`, and gives authorities a queue and lifecycle tools.

The problem is not merely collecting complaints. Municipal staff receive noisy, duplicated and inconsistently described reports. UrbanMend makes those reports actionable by applying a controlled category taxonomy, a four-level severity label, duplicate clustering, map context, corroboration counts and an auditable workflow. This matters because scarce public-maintenance capacity should be directed to the most urgent and credible problems, while citizens should be able to see progress.

Users are represented by `identity.User` roles:

- Citizens register, verify their account, submit and edit pre-triage reports, attach media, confirm an issue, comment, and read their own notifications.
- Authorities are provisioned by an admin, may be scoped to categories, see their work queue, assign issues, change status, merge/split clusters, override severity with a reason, and view operational data.
- Admins manage users and reference data, moderate reports/issues/media/comments, provision authorities, and read audit events. Django admin is also used for some reference-data and moderation operations.

The project is explicitly a prototype for one city. It is not an emergency service, repair-dispatch system, payment system, native mobile app, or live integration with municipal back offices.

## 2. Architecture Overview

### Style and rationale

UrbanMend is a **modular monolith**: one Django deployment and one database, split into bounded Django apps. This keeps transactions and domain rules simple for a capstone while preserving module boundaries. It avoids the operational overhead of microservices, yet allows classification, media, notification and export workers to run asynchronously.

### Major components

- **Django + Django REST Framework** expose versioned endpoints under `/api/v1/`; serializers validate input and views call domain services/selectors.
- **PostgreSQL/PostGIS** stores relational data and geography. Spatial fields use WGS84 geography and GiST indexes for containment, proximity, clustering and map queries.
- **Redis** is the Celery broker (database 1) and Django cache/idempotency store (cache database 0).
- **Celery workers/beat** run classification, media derivatives, export generation and notification outbox relay.
- **Object storage** (S3-compatible configuration, with MinIO in local deployment) stores sanitized photo masters and thumbnails and export files.
- **Email and in-app notifications** are produced from an outbox; SMS is deliberately removed from the implemented prototype.
- **OpenAPI/Swagger** is generated through drf-spectacular. Prometheus metrics and structured JSON logging are provided by platform configuration.

### Request lifecycle

1. A request reaches Django through the URL router and middleware (request ID/tracing, sessions and CSRF where applicable).
2. DRF authenticates the session, applies permissions and endpoint-specific throttles, parses the camelCase JSON body, and validates it with a serializer.
3. The view invokes a service inside a database transaction. Services enforce business rules such as city-boundary checks, ownership and state transitions.
4. The service commits durable domain state. Expensive work is registered with `transaction.on_commit`, so a worker cannot read a row before it exists.
5. The API returns a documented envelope, commonly `202` for report/media intake or `409/422` for conflicts/validation failures.
6. Celery workers reload rows by UUID, perform classification or processing, update domain state, and create further events/outbox rows. Consumers are designed for at-least-once delivery.

## 3. Folder and File Structure

Top-level infrastructure files are `manage.py` (Django command entry point), `Dockerfile`, `docker-compose*.yml` (development/production services), `requirements/` (locked input/output dependency sets), `pyproject.toml` (lint/type/test configuration), `deploy/` (Kubernetes migration job, Caddy and MinIO setup), `scripts/` (backup, restore-check, deploy and rollback), and `docs/` (requirements, architecture, API, operations, diagrams and evaluation material). `artifacts/backup-rehearsal/` contains rehearsal database/media backups, not application code. `.env.production.example` documents deployment settings. `conftest.py` configures the test environment.

The Python package is `urbenmend/`:

- `settings/` contains shared (`base.py`) and environment-specific `dev.py`, `prod.py` and `build.py` settings. Important choices include PostGIS database configuration, Redis cache/broker separation, Celery time limits, JSON logging, upload limits, throttling and idempotency TTLs.
- `__init__.py`, `wsgi.py` and `asgi.py` are package, WSGI and ASGI entry points; `celery.py` creates the Celery application and loads tasks; `urls.py` mounts OpenAPI, `/api/v1`, admin and metrics.
- `api/` is cross-cutting HTTP infrastructure: URL registration, exception-to-envelope conversion, camelCase serializers, pagination, idempotency reservation/replay and custom rate throttles.
- `identity/` owns the custom user model, registration/verification, sessions, password reset, two-factor enrollment/verification, profiles, authority provisioning and RBAC-related services/selectors.
- `reporting/` owns the citizen-submission `Report` model, report serializers/views/selectors and the intake/edit service. A report contains text, location, classification signals and a nullable link to an issue.
- `classification/` owns the flat category taxonomy and severity-keyword reference models, classifier contracts, the hosted LLM adapter, bilingual deterministic fallback, classification orchestration/tasks and admin APIs.
- `issues/` owns the operational aggregate: `Issue`, clustering rules, assignments, confirmations, comments, status events, merge/split and analytics/map selectors/services.
- `media/` owns uploaded image metadata/state, privacy-safe imaging, storage association and the derivative worker.
- `geo/` owns the seeded city boundary and points of interest, PostGIS selectors and reference-data APIs. POIs provide display context, not a numeric priority score.
- `notifications/` owns notification preferences, notification rows, transactional outbox events, selectors and Celery relay/delivery tasks.
- `audit/` owns append-only audit events and the audit read API.
- `moderation/` owns moderation state changes and reasoned services for reports, issues, media and comments.
- `export/` owns authority/admin export requests, asynchronous CSV generation and short-lived scoped download links.
- `platform/` contains health/readiness views, middleware, tracing, enums, admin glue, performance smoke/load-test commands and operational services.

Every feature app follows a similar separation: `models.py` persistence, `serializers.py` HTTP validation/representation, `views.py` transport, `services.py` mutations/transactions, `selectors.py` read queries, `tasks.py` background work, `reference_services.py` for admin-managed configuration, `admin.py` Django admin, `migrations/` schema history, and `tests/` executable behavior documentation.

## 4. Core Features

### Report submission

`POST /api/v1/reports` validates an authenticated author, required WGS84 location inside the active city boundary, language and the rule “adequate description or at least one owned media item.” `reporting.services.submit_report` reserves an optional idempotency key, resolves media ownership, creates the row, attaches media, marks it `processing`, and enqueues classification after commit. It returns an acknowledgement before triage completes. This design keeps the user-facing request fast and prevents a broker worker from observing uncommitted data.

### Classification

The `classification.contracts` interface isolates classifiers from Django. The LLM adapter (`llm.py`) requests structured category/severity/confidence/rationale and records provider/model information. `KeywordFallbackClassifier` (`keywords.py`) normalizes text and applies admin-managed bilingual severity rules when the LLM is unavailable, times out or returns an invalid result. `classification.tasks` reloads the report and persists category, severity signal, confidence, source, rationale, model and timestamp. The fallback is deliberately deterministic and explainable, but it is less semantically capable than an LLM and has no claim of production-level accuracy.

### Clustering and issues

An `Issue` is the operational representation of one real-world problem; many `Report` rows may point to it. Clustering uses configurable spatial/category/time rules and concurrency protection (including row locks/unique constraints tested in `issues/tests`). A report starts unattached, then is attached to an existing or newly created issue. The issue carries authoritative severity (highest member signal unless overridden), status, assignment and lifecycle history. Authorities can merge or split clusters, reopen issues, assign work, and add public/internal comments.

### Authority workflows and analytics

Issue endpoints implement status transitions, assignment, severity override with mandatory reason, confirmations, comments, map filtering and summary analytics. Authority visibility is category-scope constrained; admins have broader access. There is no weighted 0–100 priority score: severity is the primary triage label, while age, reporter count and nearby POIs are context for human judgment.

### Media

`media.services.upload_media` validates type/size, strips EXIF synchronously, stores a sanitized master and queues `process_media`. The worker creates a downscaled master and thumbnail and moves state to `ready`; failures become durable `failed` state rather than endlessly retrying bad input. Moderation can remove media without hard-deleting historical rows.

### Notifications

Issue status changes write an `OutboxEvent` in the same transaction. Celery beat calls `relay_outbox`, which claims rows with `SELECT ... FOR UPDATE SKIP LOCKED` and publishes event UUIDs. Consumers idempotently create in-app/email notifications; email delivery updates pending/sent timestamps. This avoids losing notifications when a database commit succeeds but a broker call fails, at the cost of possible duplicate publication that consumers must tolerate.

### Moderation and audit

Moderation services mark content hidden/removed and require a reason; reads preserve the row and can return `410` rather than pretending it never existed. Audit events record actor, action, target, before/after and reason. The moderation migration includes an immutable database trigger, reinforcing append-only audit/history expectations.

### Exports

Authorities/admins request an export; `export.tasks.generate_export` builds a scoped CSV asynchronously and stores it. Only the requester can poll it, and ready exports return a short-lived signed link. Citizens cannot request exports.

## 5. End-to-End Data Flow: A Pothole Report

1. A verified citizen uploads a photo (optional) to `/media`. The API checks ownership and limits, strips EXIF, stores the file as `uploaded`, and queues derivative processing.
2. The citizen submits text, coordinates and the media UUID to `/reports`. Authentication, per-account/per-IP throttles and optional idempotency are checked. The serializer accepts a category as a hint, not as trusted final classification.
3. The service verifies that the point lies inside the active `CityBoundary`, confirms the media belongs to the citizen and is not already attached, creates `Report(status=submitted)`, attaches media, changes status to `processing`, and schedules `classify_report` on commit. The response is `202` with the report UUID.
4. The classification worker reloads the report, calls the configured LLM adapter, validates the returned category against active taxonomy, and stores category, severity signal, confidence, source, rationale and model. If the provider fails, keyword rules produce a fallback result instead.
5. The worker/orchestration path runs clustering. It searches spatially and temporally compatible reports with matching category/rules, using database locking to avoid two workers creating competing issues. The report receives `report.issue_id`; a new `Issue` is created when no match exists.
6. Issue severity is derived from member report signals (the highest band) unless an authority/admin override exists. The issue enters the configured lifecycle and status events are recorded.
7. The issue can be displayed with distinct reporter confirmations and nearby seeded POIs. These values are context, not inputs to a hidden score.
8. On each status transition, an outbox row is committed. Beat/worker relay publishes it, consumers create in-app/email notifications for affected reporters, and delivery state is persisted.

The Report/Issue split is intentional. A report is immutable evidence from one reporter and retains submission-specific text, media, location and classifier provenance. An issue is the shared operational case that authorities assign and resolve. Keeping status and assignment only on Issue prevents ten duplicate reports from having ten conflicting “resolved” states while still allowing each citizen to track their own evidence through the relationship.

## 6. Technical Stack Justification

- Python: productive ecosystem and strong support for web, geospatial and asynchronous libraries.
- Django: mature ORM, migrations, sessions, admin and security defaults; a good fit for a transaction-heavy modular monolith.
- Django REST Framework: serializers, permissions, throttling, browsable APIs and consistent API views.
- PostgreSQL: transactional relational integrity, constraints and indexing. PostGIS adds point-in-polygon, `ST_DWithin`, bounding boxes and nearest-neighbor GiST queries; a document database would make these relational/spatial invariants harder.
- Redis: low-latency broker/cache for Celery, throttling and idempotency; separate logical databases reduce accidental queue/cache flushing.
- Celery: established task queue for LLM calls, image processing, exports and notification relay; asynchronous work keeps API latency predictable.
- Hosted LLM API: handles multilingual/code-mixed language without training and hosting a custom model. It is external, cost- and privacy-sensitive, so the adapter is non-load-bearing and the keyword fallback exists.
- Pillow/image processing: server-side sanitization, resizing and thumbnails; avoids serving untrusted originals directly.
- S3-compatible storage/MinIO: binary object storage is cheaper and more suitable than database BLOBs, with signed links for exports.
- drf-spectacular/OpenAPI: machine-readable contract and Swagger UI.
- structlog and Prometheus/Django Prometheus: structured operational logs, request tracing and metrics.
- pytest/factory tooling and Locust: regression coverage, concurrency/security tests and load-smoke profiles.

## 7. Security and Reliability

Authentication uses the custom Django user model with verification, password hashing, session login/logout, password reset and optional 2FA routes. Permissions enforce role and ownership on the server; tests include an explicit mutation matrix. Authorities are admin-provisioned and can be category-scoped. Public serializers intentionally omit contact fields and internal comments/override reasons.

Reliability and abuse controls include:

- Per-IP, per-identifier and per-account throttles for authentication; separate per-account and shared-IP submission/media buckets.
- Optional idempotency keys stored in Redis. A concurrent duplicate receives an in-progress conflict; a later identical request replays the original acknowledgement; reusing a key with a different fingerprint is rejected.
- `transaction.atomic` plus `on_commit` for worker enqueue and idempotency completion.
- Database constraints, `select_for_update`/`skip_locked` and tested clustering locks to control races.
- At-least-once Celery handling, explicit task names, retry policies for notification delivery, and durable failed media state.
- Consistent exception envelopes with machine-readable codes, `400/401/403/404/409/410/422/429` semantics, and generic password-forgot responses to reduce account enumeration.
- EXIF stripping, opaque UUID identifiers, ownership checks, signed export links, moderation states and append-only audit history.

Limitations are material: the LLM is a third-party dependency and may be unavailable, costly or privacy-sensitive; keyword fallback is simpler; no custom accuracy guarantee is encoded; offline PWA sync, image-assisted classification, SMS, multi-city tenancy and real municipal integrations are not implemented; and deployment-scale hardening beyond the documented prototype/load tests remains future work.

## 8. Likely Viva Questions and Honest Answers

1. **Why a modular monolith instead of microservices?** The prototype needs strong cross-entity transactions and modest scale. App boundaries provide modularity without distributed-transaction and deployment complexity. Services can be extracted later if a real bottleneck appears.
2. **Why separate Report and Issue?** Reports are individual evidence; Issues are shared operational cases. The split prevents duplicate submissions from having independent workflow state and preserves each citizen’s provenance.
3. **Why asynchronous classification?** LLM latency and failures must not block submission. The API durably records `processing` and workers update it later; the client can poll/read the report.
4. **What happens if the LLM is down?** The classifier contract catches unavailability/invalid responses and the bilingual keyword fallback assigns a category/severity with source `fallback`. This preserves triage but can be less accurate.
5. **Why use an LLM rather than train a classifier?** The requirements include Bangla, English and code-mixed text, while this academic prototype has no training/hosting pipeline. The trade-off is provider cost, latency and data exposure.
6. **Is severity a numeric priority score?** No. Four labels are ordered only for selecting the highest member severity. Reporter count, age and POI distance are displayed context and are not combined into a tunable score.
7. **How are duplicate reports detected?** Configurable spatial/category/time clustering rules search PostGIS data; concurrency locks prevent competing workers from creating inconsistent clusters. Text similarity is not the primary implemented invariant.
8. **How do you avoid enqueueing a task for a rolled-back report?** Celery dispatch is registered with `transaction.on_commit`, so Redis receives the task only after the database transaction succeeds.
9. **Why an outbox for notifications?** A status update and its notification intent commit together. A relay can safely retry publication; consumers use event identity/idempotent generation to tolerate duplicate delivery.
10. **What prevents duplicate form submissions?** Clients may send an idempotency key. Redis atomically reserves it, fingerprints the normalized payload, rejects concurrent in-progress reuse and replays a completed acknowledgement. Without a key, the API intentionally gives no de-duplication guarantee.
11. **How is authorization different for authorities and admins?** Both can perform workflow actions, but authority access is category-scope constrained and admin provisioning/moderation/reference-data powers are broader. Enforcement is in permissions/services, not only in UI.
12. **What data is public and what is private?** Public reads expose issue/report civic content but omit email/phone and internal moderation details. Ownership checks protect media, notifications, exports and citizen-scoped report views.
13. **What if image processing fails?** The sanitized upload and report remain valid; the media row becomes `failed` with an operator-facing reason and does not enter an infinite retry loop. An operator can investigate/retry as an operational action.
14. **What are the main scalability risks?** LLM cost/latency, image storage/processing, clustering query volume and notification throughput. Redis/Celery decouple expensive work, PostGIS indexes support spatial reads, and keyset pagination avoids deep offset scans, but the prototype is sized for hundreds to low thousands of reports rather than city-scale production.
15. **Which requirements are not implemented?** Native apps/offline sync, SMS, vision-assisted classification, live government integrations, multi-city tenancy, emergency response and a numeric scoring engine are explicitly out of scope or future work. The implementation should be defended as a working prototype, not as a completed municipal production platform.
