# UrbanMend — Build Status Ledger

> **Living document.** The authoritative record of what is implemented and what is pending, tracked
> against the 78 tasks in `docs/05-project-plan.md` §5. `CLAUDE.md` points here rather than carrying
> an inline summary, because that summary went stale.

| | |
|---|---|
| **Document** | `docs/13-build-status.md` |
| **Purpose** | Implementation ledger + open-work queue. Not a plan — `05-project-plan.md` is the plan. |
| **Last full audit** | 2026-08-23 (T10.4 accepted at prototype scale) |
| **Headline** | **76 / 78 tasks complete (97%)** · P0–P9 feature work 69/70 · P10 hardening 7/8 |

## Update protocol — read this before editing

1. **Never mark a task done from a commit message or from memory.** Cite a file path or a test that
   proves it. The `Evidence` column is the point of this document.
2. When a task closes, move it in the ledger *and* delete its entry from §3 Open Work. A task listed
   in both places means the ledger was updated and the queue was not.
3. Re-run the gate table in §1 after any slice and update the date. A stale gate row is worse than no
   gate row — it reads as verification that did not happen.
4. **⚠️ Partial ≠ done.** Three P10 items and T6.8 are partial: the mechanism exists but does not meet
   its DoD. Do not let "the file exists" close them; §3 states the acceptance criterion for each.
5. New work that is not in `05-project-plan.md` goes in §5, not the ledger. The ledger tracks the
   plan; §5 records deliberate additions so they are not mistaken for scope creep later.

---

## 1. Verification snapshot

All gates run inside the api container (`docker compose exec -T api sh -c "…"`) on **2026-08-25**:

| Gate | Command | Result |
|---|---|---|
| Tests | `pytest -q` | ⚠️ **1410 passed, 1 failed** — the failure is a test-isolation bug diagnosed in §4.5(a), not a product defect |
| Types | `mypy` | ✅ clean — 237 source files |
| Lint | `ruff check && ruff format --check` | ✅ clean — 245 files formatted |
| Model drift | `manage.py makemigrations --check --dry-run` | ✅ "No changes detected" |
| Deploy config | `manage.py check --deploy --fail-level WARNING` | ✅ CI stage 3 |

⚠️ Do not add `-n`/`pytest-xdist`: several concurrency tests share Redis and real transaction
boundaries (see `09-operations.md` §1.6).

**API surface:** every endpoint in `04-api-specification.md` §6 is routed. The four absent ones are
deliberate exclusions, not gaps — `POST /issues` (clustering only), `POST /issues/bulk-status`
(deferred, plan §12), `DELETE /users/{id}` (deletion anonymizes, C-14), and the presigned
`POST /media/upload-url` + `/media/{id}/complete` pair the spec marks "not required at prototype
scale".

---

## 2. Task ledger

Status key: ✅ complete · ⚠️ partial (see §3) · 🔴 not started

### P0 Foundation — 10/10 ✅

| Task | St | Evidence |
|---|---|---|
| T0.1 Monorepo layout, `services.py`/`selectors.py` from day one | ✅ | 12 apps under `urbenmend/`; enforced by `platform/tests/test_app_skeleton.py` |
| T0.2 PostgreSQL+PostGIS, Redis, S3-compatible store | ✅ | `docker-compose.yml` (`postgis/postgis:17-3.5`, `redis:8`, `minio`) |
| T0.3 Config/secrets, environment profiles | ✅ | `settings/{base,dev,prod,build}.py` + `django-environ` |
| T0.4 Migration tooling + baseline; PostGIS extension first | ✅ | `identity/migrations/0001_initial.py` (`CreateExtension("postgis")`) |
| T0.5 CI pipeline | ✅ | `.github/workflows/ci.yml` — 7 stages (lint→drift→deploy-check→unit→integration→build+scan→push) |
| T0.6 Base API: routing, envelope, validation harness | ✅ | `api/urls.py`, `api/exceptions.py`, `api/pagination.py`, `api/serializers.py` (camelCase layer) |
| T0.7 Base Worker | ✅ | `urbenmend/celery.py`; `worker` service runs `celery -A urbenmend worker -B` |
| T0.8 `GET /health` with dependency degradation | ✅ | `platform/views.py`, `platform/tests/test_health.py` |
| T0.9 Structured logging, trace IDs, error tracking | ✅ | `platform/tracing.py`, `middleware.py`, `celery_tracing.py`, `tests/test_tracing.py` |
| T0.10 Baseline schema for core entities | ✅ | `identity/0001`, `classification/0001`, `reporting/0001`, `issues/0001`, `media/0001` |

### P1 Identity & Access — 9/9 ✅

| Task | St | Evidence |
|---|---|---|
| T1.1 User entity + roles + status states | ✅ | `identity/models.py`, `tests/test_models.py` |
| T1.2 Registration + verification (OTP) | ✅ | `tests/test_registration.py`; codes Argon2-hashed |
| T1.3 Server-validated sessions + revocation | ✅ | `tests/test_sessions.py` (`cached_db`, `SessionStore().delete()`) |
| T1.4 CSRF on state-changing requests | ✅ | `tests/test_csrf.py` |
| T1.5 RBAC layer (role + category scope) | ✅ | `identity/services.py`, `tests/test_rbac.py` |
| T1.6 Admin provisions authorities + scope | ✅ | `tests/test_provisioning.py` |
| T1.7 2FA for authority/admin | ✅ | `tests/test_two_factor.py` (partial-session design) |
| T1.8 Login/OTP rate limiting + lockout | ✅ | `api/throttling.py`, `tests/test_rate_limiting.py` |
| T1.9 Profile read/update, deletion → anonymization | ✅ | `tests/test_profile.py` |

### P2 Reporting & Media — 9/9 ✅

| Task | St | Evidence |
|---|---|---|
| T2.1 Report entity + validation (location/boundary/content) | ✅ | `reporting/models.py`, `tests/test_models.py`, `geo/tests/test_city_boundary.py` |
| T2.2 `POST /reports` → `202`, enqueue on commit | ✅ | `tests/test_submission.py` (`transaction.on_commit` asserted from failing side) |
| T2.3 `Idempotency-Key` handling | ✅ | `api/idempotency.py`, `api/tests/test_idempotency.py` (8-thread barrier race) |
| T2.4 Media upload + size/type limits | ✅ | `media/views.py`, `tests/test_upload.py` (413/415/422 split) |
| T2.5 EXIF/GPS strip + compress + thumbnail | ✅ | `media/imaging.py` (transpose→strip), `tests/test_imaging.py` |
| T2.6 Attach media to report; lifecycle states | ✅ | `media/models.py`, `migrations/0002_alter_media_state.py` |
| T2.7 `GET /reports/{id}` + `GET /reports` | ✅ | `tests/test_detail.py`, `tests/test_list.py` |
| T2.8 Pre-triage edit; edit-lock after triage | ✅ | `tests/test_edit.py` |
| T2.9 Submission rate limiting | ✅ | `api/tests/test_submission_throttling.py` |

### P3 Classification — 6/7 ⚠️

| Task | St | Evidence |
|---|---|---|
| T3.1 `ClassificationService` interface (no Django imports) | ✅ | `classification/contracts.py` (ABC), `tests/test_contracts.py` |
| T3.2 Hosted LLM adapter, PII-minimized prompts | ✅ | `classification/llm.py`, `tests/test_llm.py` — provider-agnostic seam; two built-in providers (`google_ai_studio` native Gemini, `openai_compatible`) |
| T3.3 Deterministic bilingual keyword fallback | ✅ | `classification/keywords.py`, `migrations/0003_severity_keyword.py` |
| T3.4 Cost/rate cap + graceful degradation | ✅ | `services.py` `_reserve_llm_call`, `_reserve_daily_budget`, `tests/test_orchestration.py` |
| T3.5 Classification worker job | ✅ | `classification/tasks.py`, `tests/test_tasks.py` |
| T3.6 Timeout/retry/circuit breaker | ✅ | `services.py` `_ensure_circuit_closed` / `_record_llm_success` |
| T3.7 Confidence + low-confidence flagging | ⚠️ | Mechanism is implemented, but no validated held-out accuracy bar exists; smoke evaluation is recorded in §4.3. |

### P4 Clustering & Issues — 8/8 ✅

| Task | St | Evidence |
|---|---|---|
| T4.1 Issue entity + Report↔Issue relationship | ✅ | `issues/models.py`, `reporting/migrations/0003_report_issue.py` |
| T4.2 Geospatial: geography(Point,4326), GiST, `ST_DWithin` | ✅ | `issues/migrations/0002_..._location_gist.py`, `geo/selectors.py` |
| T4.3 Clustering rules (per-category radius/window) | ✅ | `migrations/0003_clusteringrule.py`, `tests/test_clustering_rules.py` |
| T4.4 Concurrency-safe find-or-create | ✅ | `tests/test_clustering_concurrency.py` — two real parallel transactions, xfail removed |
| T4.5 Clustering runs after classification | ✅ | `classification/tasks.py` chain |
| T4.6 Issue severity = max of members | ✅ | `issues/services.py:813` (`max()` with stable tie-break) |
| T4.7 Confirmations, one per citizen, revocable | ✅ | `migrations/0004_confirmation.py`, `tests/test_confirmations.py` |
| T4.8 Proximity context, display-only | ✅ | `issues/selectors.py` `attach_proximity`, `geo/selectors.py` `nearby_pois` |

### P5 Issue Triage Workflow — 8/8 ✅

| Task | St | Evidence |
|---|---|---|
| T5.1 Status state machine; reopen = new linked Issue | ✅ | `tests/test_status_transitions.py`, `migrations/0005_issue_reopened_from.py` |
| T5.2 `PATCH /issues/{id}/status` + mandatory reason | ✅ | `tests/test_status_mutation.py` |
| T5.3 Status Event emission (append-only) | ✅ | `migrations/0006_statusevent.py`, `tests/test_status_events.py` |
| T5.4 Assignment, scope-validated | ✅ | `tests/test_assignment.py` |
| T5.5 Severity override, retains computed | ✅ | `tests/test_severity_override.py` |
| T5.6 Merge issues | ✅ | `tests/test_merge.py` |
| T5.7 Split issues | ✅ | `tests/test_split.py` |
| T5.8 Internal vs public comments | ✅ | `migrations/0007_comment.py`, `tests/test_comment_parent_binding.py` |

### P6 Notifications & Outbox — 7/7 ✅

| Task | St | Evidence |
|---|---|---|
| T6.1 Transactional outbox, same tx as state change | ✅ | `notifications/models.py` `OutboxEvent`, `services.record_issue_status_changed` |
| T6.2 Dispatcher, at-least-once, idempotent | ✅ | `notifications/tasks.py`, `tests/test_outbox.py`, `tests/test_tasks.py` (crash-boundary cases) |
| T6.3 Notification entity + generation | ✅ | `migrations/0002_notification.py`, `tests/test_generation.py` |
| T6.4 In-app delivery + `GET /notifications` + mark-read | ✅ | `notifications/views.py`, `tests/test_api.py` |
| T6.5 Email channel adapter | ✅ | `settings/prod.py` SMTP (provider-neutral; env templates configure Mailjet), `platform/tests/test_prod_email_settings.py` |
| T6.7 Notification preferences | ✅ | `migrations/0003_notificationpreference.py`, `tests/test_preferences.py` |
| **T6.8 SSE stream for real-time** | **✅** | `notifications/views.py` — bounded polling stream emits existing and newly created caller-owned notifications; connect-then-create test in `notifications/tests/test_api.py`. |

### P7 Read Paths — 5/5 ✅

| Task | St | Evidence |
|---|---|---|
| T7.1 Authority queue, severity DESC then age, cursor | ✅ | `issues/views.py` `IssueCollectionView`, `tests/test_queue_annotations.py` |
| T7.2 Filter/sort/search allowlists | ✅ | `issues/pagination.py` `SORT_DEFAULT`, `api/tests/test_keyset_pagination.py` |
| T7.3 Issue detail + paged member reports | ✅ | `IssueDetailView`, `IssueReportsView` |
| T7.4 Map GeoJSON + low-zoom aggregation | ✅ | `IssueMapView`, `tests/test_map.py` |
| T7.5 Analytics summary | ✅ | `AnalyticsSummaryView`, `tests/test_analytics.py` |

### P8 Moderation, Audit & Reference Data — 5/5 ✅

| Task | St | Evidence |
|---|---|---|
| T8.1 Append-only audit log + `GET /audit-events` | ✅ | `audit/migrations/0001_initial.py` (DB trigger), `tests/test_events.py` — ⚠️ deviation, §4.1 |
| T8.2 Moderation actions → `410` | ✅ | `moderation/`, `migrations/0002_immutable_trigger.py`, `tests/test_api.py` |
| T8.3 Reference data CRUD | ✅ | `/categories`, `/severity-keywords`, `/clustering-rules`, `/pois` + Django admin |
| T8.4 City boundary management | ✅ | `geo/views.py` `CityBoundaryView` (GET/PUT), `tests/test_city_boundary_api.py` |
| T8.5 `GET /meta/enums` | ✅ | `platform/views.py` `EnumMetadataView`, `tests/test_enums.py` |

### P9 Export — 2/2 ✅

| Task | St | Evidence |
|---|---|---|
| T9.1 Async export jobs, CSV/GeoJSON | ✅ | `export/tasks.py`, `export/views.py`, `tests/test_api.py` |
| T9.2 Short-lived signed download URLs | ✅ | `AWS_QUERYSTRING_AUTH=True`, `AWS_QUERYSTRING_EXPIRE=3600`, s3v4; `export/serializers.py:50` |

### P10 Hardening, Security, Performance & Deployment — 7/8

| Task | St | Note |
|---|---|---|
| T10.1 Global rate limiting + LLM cost-cap **under load** | ✅ | Ten concurrent users verified by `test_ten_concurrent_users_respect_global_cap_and_fallback`; five-call global cap enforced and remaining users persisted via keyword fallback. |
| T10.2 Security review (authZ, IDOR, enumeration, TLS/HSTS) | ✅ | `api/tests/test_security_mutation_matrix.py` plus focused auth, RBAC, ownership, export, notification, media, and report suites; 154 passed. TLS/HSTS and deploy checks verified in CI settings. |
| T10.3 Privacy review (EXIF, PII to LLM, anonymization, responses) | ✅ | Focused privacy suite passed 145 tests; serializer, EXIF/storage, LLM prompt, broker payload, logging, and anonymization boundaries reviewed in §3.4. |
| T10.4 Performance/load test vs NFR-1/2/3 | ✅ | Locust harness, seeded A7 dataset, populated GiST plan checks and recorded run in `docs/14-load-test-results.md`; prototype-scale deviations accepted. |
| T10.5 Failure-mode drills | ✅ | Live Compose drills completed for LLM fallback, outbox crash boundary, Redis, Postgres, and worker restart; recovery evidence recorded in §3.5. |
| T10.6 Observability: metrics, alerts on SLA/cost/queue-depth | ⚠️ | Custom Prometheus gauges now exposed and tested; Azure alert rules/destinations and staging fault tests remain deployment work. **§3.6** |
| T10.7 Deployment automation + rollback + migration-on-deploy | ✅ | `scripts/deploy.ps1`, `rollback.ps1`, `deploy/migration-job.yaml`, `docker-compose.prod.yml`, CI stage 7 (SHA-tagged) |
| T10.8 Backup/restore drill (DB + object store) | ✅ | `scripts/backup.ps1`, `restore-check.ps1`; rehearsal artifacts in `artifacts/backup-rehearsal/` (2026-08-20, 2026-08-22) |

---

## 3. Open work queue

Ordered by dependency. §3.1 unblocks §3.2, and together they close the largest DoD gap.

### 3.3 ✅ T10.2 — Security review completed (2026-08-23)

The review covered anonymous mutation rejection, citizen denial on privileged mutations, and an
out-of-scope Authority attempting an issue status change. Cross-owner reads and mutations were
checked for reports, issues, media, comments, exports, and notifications; UUID routing prevents
non-UUID probing. Registration, verification, login, password reset, and authority provisioning
were checked for account-enumeration differences. The focused review command passed **154 tests**:

```bash
docker compose exec -T api pytest urbenmend/api/tests/test_security_mutation_matrix.py urbenmend/identity/tests/test_password_reset.py urbenmend/identity/tests/test_registration.py urbenmend/identity/tests/test_sessions.py urbenmend/identity/tests/test_rbac.py urbenmend/issues/tests/test_status_mutation.py urbenmend/export/tests/test_api.py urbenmend/notifications/tests/test_api.py urbenmend/media/tests/test_detail.py urbenmend/reporting/tests/test_detail.py -q
```

Accepted scope: this is an application-level regression review for the prototype deployment. TLS,
HSTS, secure cookies, and Django deploy checks remain configuration/CI controls; a third-party
penetration test is outside this task.

### 3.4 ✅ T10.3 — Privacy review completed (2026-08-23)

Reviewed boundaries and evidence:

- Public report, issue, media, notification, and export serializers expose opaque identifiers but
  not citizen email/phone, decoder failure text, internal comments, or severity-override reasons.
- `media/imaging.py` transposes and re-encodes uploads without EXIF, including GPS, before the first
  object-store write. Decoder errors are reduced to an exception type in request-path logs.
- Classification prompts contain report title/description and taxonomy only; account email, phone,
  password/session data, and media bytes are not included. Report text is intentionally sent to the
  configured provider because it is the material being classified; deployments must use a provider
  contract that forbids training/retention beyond the chosen policy. ⚠️ **This became a concrete,
  unmet condition when ❓Q9 resolved to Google AI Studio on 2026-08-25**: Google's *unpaid* tier may
  use submitted prompts to improve its products, so a free API key here would put real citizen report
  text into that pipeline. A deployment carrying real submissions needs a **billing-enabled** key, and
  no code path can detect which tier a key is on — see §3.8 and P7.
- Celery enqueue assertions show only opaque report/media/export/event IDs cross the broker. Task
  logs record those IDs and operational states, not contact fields or report descriptions.
- Account deletion clears contact fields and credentials while retaining the user/report rows for
  referential and audit integrity. Deleted users are excluded from later notification generation.

Focused command: `pytest api/tests/test_privacy_responses.py media/tests/test_privacy.py
media/tests/test_imaging.py identity/tests/test_profile.py classification/tests/test_llm.py
classification/tests/test_orchestration.py classification/tests/test_tasks.py -q` — **145 passed**.

Accepted limitation: free-text reports can themselves contain personal information entered by a
citizen. The application minimizes system-owned identity data sent to the classifier but does not
perform named-entity redaction of user-authored text.

### 3.5 ✅ T10.5 — Failure-mode drills completed (2026-08-23)

Live local Compose observations:

- LLM unavailable/over-budget/circuit-open fallback tests: **4 passed**; classification remains
  available through keyword fallback.
- Outbox crash-boundary tests: **3 passed**; pending rows remain relayable and notification
  generation is idempotent.
- Redis stop/start: recovered in **1.13 s**; `redis-cli ping` returned `PONG`.
- Postgres/PostGIS stop/start: recovered in **1.19 s**; `pg_isready` accepted connections.
- Celery worker stop/start: recovered in **4.90 s**; `outbox_status` reported `pending=0`.

The final checks left the stack healthy and the focused failure suites green. The Django deploy
check was also run; its five warnings are expected for the local development environment (secure
cookies/HSTS/SSL redirect and development secret), while production settings and CI retain the
deployment gate. This is a local Compose recovery drill, not a production replica-promotion test.

### 3.6 ⚠️ T10.6 — Observability

**In place:** structured JSON logs, correlation/trace IDs propagated into Celery headers,
`/metrics` via `django_prometheus` (deliberately not public — Caddy `404`s it), `outbox_status`
management command reporting backlog count and oldest-pending age, and custom gauges from
`platform/metrics.py`: outbox pending/oldest age, Celery Redis queue depth, LLM daily tokens and
budget ratio, and classification fallback rate.

**Missing:** Azure alert rules, destinations/owners, and staging fault tests are not configured in
this repository. Request/SLA latency remains available through django-prometheus request metrics;
the custom collector focuses on the explicit queue, cost, fallback, and outbox signals.

**Acceptance status:** the gauge export is implemented and tested. The alert-table portion remains
open until deployment owners configure and fault-test Azure alerts; this local task does not invent
an alert destination or claim production alerting.

### 3.7 ✅ T6.8 — SSE bounded live stream

**State:** `notifications/views.py` emits existing notifications, polls for caller-owned rows
created after the cursor, sends heartbeats, and closes after a bounded lifetime. The stream is
deliberately database-polled for this prototype.

**Evidence:** `notifications/tests/test_api.py` connects first, creates a notification second, and
asserts that it arrives on the open stream. The notification API suite passed **11 tests**.

**Operational note:** clients reconnect after the configured maximum lifetime; polling interval and
heartbeat are environment-configurable.

### 3.8 ⚠️ Remaining deployment/evaluation work

Three acceptance items cannot be completed from this repository alone:

- **T3.7/Q10:** a real held-out, human-reviewed dataset (at least 100 examples) is not committed.
  The 8-case smoke result is recorded in §4.3 and must not be presented as production accuracy.
- **T10.6:** Azure Monitor alert resources, destinations/owners, and a staging environment for
  induced-fault tests are not present. The application metrics are implemented and tested; an
  operator with Azure access must create and test the alert rules in `docs/11-azure-deployment.md`.
- **P7 / ❓Q9's tier half:** ❓Q9's *vendor* half closed on 2026-08-25 (Google AI Studio), but the
  privacy condition it inherits did not. Google's unpaid tier may train on submitted prompts, so the
  production key must have **billing enabled**, verified in the Google console. ⚠️ This is
  unverifiable from the codebase by construction — the API returns nothing that distinguishes a free
  key from a paid one — so it is an operator sign-off, not a test. Until it is signed off, point
  production at `UnconfiguredLLMProvider` (as `.env.production.example` ships) and let the FR-13a
  keyword fallback triage; reports are still classified and submission is unaffected.

---

## 4. Flagged items

### 4.1 T8.1 deviates from the plan — arguably upward

`05-project-plan.md` T8.1 mandates append-only "at the database level by revoking UPDATE/DELETE from
the application role". The implementation instead installs a `BEFORE UPDATE OR DELETE` trigger
(`audit/migrations/0001_initial.py`, same pattern for `moderation_action` in
`moderation/migrations/0002_immutable_trigger.py`), verified by
`audit/tests/test_events.py:63`.

The trigger is stronger in one respect — it survives a role-grant mistake, which REVOKE does not.
**Action:** this is an accepted deviation, but no doc records it. Note it in `06-devops-guide.md` §9
or amend T8.1 so the next reader does not "fix" it back to REVOKE.

### 4.2 The §9 deployment-readiness checklist is entirely unchecked

All 14 boxes in `05-project-plan.md:332-345` are `[ ]`, including several the code demonstrably
satisfies: migrations reversible from zero, TLS/HSTS enforced with `check --deploy` in CI, rate
limiting active on auth and submission paths, geospatial GiST indexes present, health endpoint
reflecting dependency degradation, and backups rehearsed with artifacts on disk.

**Action:** tick what is genuinely done. Part of the apparent P10 gap is bookkeeping, and leaving
verified controls unticked makes the real gaps (§3.1, §3.6) harder to see.

### 4.3 ❓Q10 (accuracy bar) remains open — the last unresolved gate

T3.7 is built: `classification_needs_review` flags low-confidence results, and
`CLASSIFICATION_FALLBACK_MATCHED_CONFIDENCE` / `_UNMATCHED_CONFIDENCE` are env-overridable. But the
thresholds are chosen defaults, not a validated accuracy bar. The committed 8-case smoke set was
run against the deterministic fallback on 2026-08-23: category accuracy **0.75** and severity
agreement **0.375**, below the illustrative targets (0.85/0.80). This is not a release benchmark;
the documented gate requires a held-out, human-reviewed dataset of at least 100 examples.
`docs/10-llm-deployment-evaluation.md`
plus `management/commands/evaluate_classifier.py` and `docs/evaluation/classification-sample.jsonl`
give the measurement harness; nobody has set the bar.

**Do not invent a number.** Other open questions per `CLAUDE.md`: ❓Q3 (POI source), ❓Q5
(notification channels — resolved in practice to in-app + email), ❓Q6 (EXIF — resolved: strip
always).

### 4.4 Documentation drift

- `CLAUDE.md` "Build state" was stale by four phases before the 2026-08-23 audit (claimed T5.8 was
  the last slice; P6–P9 and the Azure deployment were already built). It now points here. **Keep the
  pointer; do not reintroduce an inline task summary that can rot.**
- `08-coding-workflow.md` build records are detailed through §C3 (P2) but §C4–C8 (P3–P10) are marked
  "brief". The ⚠️ traps in `CLAUDE.md` for those phases have no backing record, so the reasoning
  behind them lives only in commit history.
- `09-operations.md:190` records "997 passed" as of 2026-08-14. Current count is 1410. Same rot risk.
- **❓Q9's record was swept on 2026-08-25** when the provider was chosen; the sweep was deliberately
  partial and the boundary matters. Updated: `CLAUDE.md`, `.claude/rules/async-worker.md`, the three
  env templates, `settings/base.py`, `classification/{llm,services,contracts}.py`,
  `reporting/models.py`, `platform/selectors.py`, the affected tests, `09-operations.md`,
  `06-devops-guide.md`, `10-llm-deployment-evaluation.md`, and `05-project-plan.md` (a dated addendum
  under the §P3 gate). ⚠️ **Left as-is on purpose:** `01-prd.md` §15/§16, `02-architecture.md`
  ASSUMP-7, and the dated build records in `08-coding-workflow.md`. Those record that the gate was
  resolved *as a deferral* at planning time, which was true then and is the decision history; the
  vendor is deployment configuration, not a requirement, so rewriting them would destroy the record
  without changing a single binding constraint. Do not "finish" that sweep.

### 4.5 One red test, not a product defect (2026-08-25)

The suite had two failures when the Google AI Studio provider work landed. Both predate that work and
were confirmed against a clean tree (`git stash` → full suite → 6 failed / 1391 passed, i.e. strictly
worse before). **(b) has since been fixed**; (a) is open and is a test-isolation bug, not reachable from
application code.

**a. ⚠️ OPEN — `test_clustering_concurrency.py::test_concurrent_reports_of_one_real_world_issue_create_exactly_one_issue`
— a real test-isolation bug, introduced with T10.1 on 2026-08-23.** Reproduces in a two-test run:

```bash
pytest urbenmend/classification/tests/test_orchestration.py::test_ten_concurrent_users_respect_global_cap_and_fallback \
       urbenmend/issues/tests/test_clustering_concurrency.py -p no:randomly
```

The first test carries `@pytest.mark.django_db(transaction=True)`, which teardown-flushes the database
instead of rolling back — and the flush takes the **migration-seeded taxonomy** with it, because seeded
reference data lives in `RunPython` migrations, not fixtures. The next `transaction=True` test therefore
starts with an empty `Category` table and dies on `Category.DoesNotExist`. Each test passes alone, and
the whole of `urbenmend/issues` passes alone (232), which is why it survived review: it is only visible
when both `transaction=True` tests run in the same session. Order-independent — it fails under random
ordering too.

**Action:** the victims are not the bug. Either add `serialized_rollback=True` to every
`django_db(transaction=True)` mark that depends on seeded reference data, or give the affected tests an
explicit `CategoryFactory` row so they stop depending on the seed. ⚠️ Do not "fix" it by deleting the
`transaction=True` marks — those tests exist to exercise real commit boundaries, which is the one thing
a rollback-per-test cannot do.

**b. ✅ FIXED (2026-08-25) — `test_services.py::test_the_default_provider_is_the_unconfigured_one`.**
It was environmental, on a configured dev box only: the test asserts the *shipped* default is
`UnconfiguredLLMProvider`, `.env.local` now sets `CLASSIFICATION_LLM_PROVIDER=google_ai_studio`, and
compose injects it into the container — so the test read a configured provider and failed with nothing
wrong. CI was green throughout, having no `.env.local`, which is precisely what made it worth fixing
rather than tolerating: a test that is red only on a *correctly configured* machine trains developers to
ignore red.

The fix moves the assertion onto the literal in `settings/base.py`, where it always belonged, by
re-reading it in a **subprocess with the four `CLASSIFICATION_LLM_*` variables scrubbed** from the
environment, against `urbenmend.settings.build`. Two paths were rejected deliberately, and the docstring
records why: ⚠️ **`override_settings(CLASSIFICATION_LLM_PROVIDER=<the default>)` would feed the test its
own expected answer** and stop guarding the default that FR-13a/NFR-4 rest on; and an in-process
re-import cannot substitute for the subprocess, because importing `settings/base.py` runs
`structlog.configure()` and would reconfigure logging for every later test in the session.

---

## 5. Built beyond the plan's task list

Traceable to `04-api-specification.md` or `06-devops-guide.md`, so in-scope additions rather than
scope creep — but absent from `05-project-plan.md` §5 and therefore not in the ledger above.

| Addition | Traces to | Evidence |
|---|---|---|
| `POST /auth/password/forgot` + `/reset` (email-only, generic `202`) | API §6.1, FR-1 | `identity/tests/test_password_reset.py` |
| `GET /users`, `PATCH /users/{id}` (Admin list/search; audited role/scope/status/2FA changes; revokes live sessions on suspend) | API §6.2 | `identity/tests/test_admin_users_api.py` |
| OpenAPI schema + Swagger UI at `/api/schema/`, `/api/docs/` | NFR-9 | `drf-spectacular`; `api/tests/test_openapi.py` |
| Classifier evaluation harness | ❓Q10 groundwork | `evaluate_classifier.py`, `docs/10-llm-deployment-evaluation.md`, `docs/evaluation/classification-sample.jsonl` |
| Azure single-VM production path (Caddy TLS, prod compose, env template) | DevOps §5 | `docs/11-azure-deployment.md`, `deploy/Caddyfile`, `docker-compose.prod.yml` |
| ERD + system design diagrams | Handover | `docs/erd.png`, `docs/system-design.png`, `docs/urbanmend_erd.sql`, `docs/12-system-design-diagram.md` |
| Capstone presentation content | Defense prep | `docs/presentation_content.md` |

---

## 6. Audit log

| Date | Scope | Result |
|---|---|---|
| 2026-08-23 | Full codebase audit against all 78 plan tasks; every gate run | 71/78 complete. P0–P9 = 69/70 (T6.8 partial). P10 = 2/8. Ledger created; `CLAUDE.md` build state corrected. |
| 2026-08-23 | T10.1 ten-user concurrency verification | 72/78 complete. Ten concurrent classification operations completed; global LLM cap held at 5 calls and fallback persisted for capped operations. |
| 2026-08-23 | T10.2 security review | 73/78 complete. Mutation, out-of-scope role, IDOR/ownership, enumeration, and deployment-security regression suites passed (154 tests). |
| 2026-08-23 | T10.3 privacy review | 74/78 complete. Response, media/EXIF, LLM, broker payload, logging, and anonymization review passed (145 focused tests); free-text PII limitation documented. |
| 2026-08-23 | T10.5 failure-mode drills | 75/78 complete. Live Compose Redis, Postgres, and worker recovery succeeded; LLM fallback and outbox crash-boundary suites passed. |
| 2026-08-23 | T6.8 SSE stream | 76/78 complete. Bounded SSE stream emits notifications created after connection; notification API suite passed (11 tests). |
| 2026-08-23 | Classifier smoke evaluation | T3.7 remains partial. Fallback evaluation on the committed 8-case smoke set produced 0.75 category accuracy and 0.375 severity agreement; no held-out accuracy bar is established. |
| 2026-08-25 | Google AI Studio provider (native Gemini) + all gates | 76/78 at time of write (§2 sums to 76; an earlier draft of this row said 74 — a miscount, not a regression). `google_ai_studio` / `openai_compatible` built-in providers; thinking disabled by default (`CLASSIFICATION_LLM_THINKING_BUDGET`); 2 pre-existing test failures diagnosed §4.5. |
| 2026-08-25 | ❓Q9 closed to Google AI Studio + record sweep | 76/78. Vendor half of the gate resolved by the project owner; the tier/P7 half explicitly left open (§3.8). Q9's "deferred" wording swept from code, env templates, rules and live docs, with the planning-time gate records deliberately preserved (§4.4). §4.5(b) fixed — the default-provider guard now reads `settings/base.py` in a scrubbed subprocess, so it holds on a configured dev box. Gates: ruff ✅ 245 files, mypy ✅ 237 files, drift ✅ none, `pytest -q -p no:randomly` **1410 passed / 1 failed** (§4.5(a), pre-existing). |

---

*Update this document in the same commit as the work it describes. A ledger that lags the code is the
problem it was created to solve.*
