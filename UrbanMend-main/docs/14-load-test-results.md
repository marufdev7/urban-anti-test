# UrbanMend — Load test results (T10.4)

> **Recorded run.** This document is the evidence behind T10.4. The measured A7-scale results were
> accepted for the academic prototype while the original NFR comparison remains visible. Numbers
> without their dataset size are not evidence, so the dataset is stated first. Procedure:
> `09-operations.md` §4.

| | |
|---|---|
| **Date** | 2026-08-23 |
| **Task** | T10.4 — performance/load test against NFR-1/2/3 |
| **Verdict** | ✅ T10.4 complete by accepted prototype-scale evidence; NFR-2 deviations are documented below. |
| **Harness** | `urbenmend/platform/loadtest/locustfile.py`, seeded by `manage.py seed_load_dataset` |

---

## 1. What was measured, and against what

| Source | Target | How it is checked |
|---|---|---|
| **NFR-2** (`01-prd.md:230`) | interactive paths **< 2 s** | the locustfile's `quitting` hook fails the run non-zero if any group's p95 exceeds `LOADTEST_P95_MS` (default 2000) |
| **A7** (`01-prd.md:83`) | hundreds–low thousands of reports, **tens** of concurrent authority users | 25 concurrent users over the dataset in §2 |
| **NFR-1** (`01-prd.md:229`) | spatial queries GiST-assisted, not sequential scans | `manage.py perf_smoke --explain` against the same dataset (§5) |
| **NFR-3** (`01-prd.md:231`) | classification lands **within a few seconds** | §6 |

NFR-2's 2000 ms is the only numeric threshold in the PRD. Everything else here is a recorded
observation, not a pass/fail line — inventing thresholds the PRD does not state would make future
runs fail against numbers nobody agreed to.

## 2. Environment and dataset

| | |
|---|---|
| **Image** | `urbenmend:dev`, `sha256:f171e7325c99b665825fbf8925e0aca25b2be94929d868a4705d9ea366a9ad1f` |
| **Git HEAD** | `1c79c39209bb5916c94a28a61157a7015ee6742b` + the working tree described in §4 |
| **Runtime** | Django 5.2.16, DRF 3.17.1, Python 3.13, uvicorn (single process, `--reload` on) |
| **Database** | PostgreSQL 17.5, PostGIS 3.5 (`USE_GEOS=1 USE_PROJ=1 USE_STATS=1`) |
| **Generator** | locust 2.46.3 on gevent 26.8.0, headless, in-network (`http://api:8080`) |
| **Host** | Docker Compose on one Windows 11 machine — API, worker, database, Redis and generator all sharing the same CPU |

**Dataset at the start of the run:** **2 996 reports**, **878 issues**, 0 unlinked reports, 35 users,
all reports classified and inside the active city boundary. 0 POIs (❓Q3 unresolved — see §7).

That sits at the top of A7's "hundreds–low thousands of reports". 2 000 reports came from
`seed_load_dataset` at clustered hotspot density (~15 reports/issue); the remainder are real
submissions from an earlier run of this same harness, which is why the issue count is higher and the
per-issue density lower than a fresh seed would give.

⚠️ **`DJANGO_DEBUG=false` for the run.** An earlier pass was measured with `DEBUG=true`, which makes
Django record every SQL statement on the connection while `CONN_MAX_AGE=60` keeps that connection
alive — the query log grows for the length of the run, so latency drifts upward and the measurement
is partly of Django's debug instrumentation. That pass also passed the gate (aggregated p95 920 ms),
so it stands as a conservative check, but the numbers below are the representative ones.

⚠️ **Single-process API on a shared machine.** These figures are a floor on headroom, not a capacity
model for a deployed cluster: the generator, four services and the database contend for the same
cores, and one uvicorn process serialises what replicas would parallelise.

## 3. Results — gated run at A7 scale

`docker compose --profile loadtest run --rm -T loadgen --headless -u 25 -r 5 -t 5m --csv .loadtest/a7`

The completed run produced 2,457 requests with zero failures:

| Path | Requests | p95 | Result |
|---|---:|---:|---|
| `GET /issues (public)` | 112 | 320 ms | pass |
| `GET /issues (queue)` | 266 | 2,000 ms | at the limit |
| `GET /issues (queue page 2)` | 266 | 3,900 ms | **fail** |
| `GET /issues/{id}` | 189 | 160 ms | pass |
| `GET /map/issues` | 353 | 4,800 ms | **fail** |
| `GET /reports` | 351 | 130 ms | pass |
| `POST /reports` | 920 | 180 ms | pass |

The Locust gate exited non-zero. This is an implementation finding, not a harness failure: every
request completed successfully and the failure ratio remained 0.0.

## 4. The defect this run found

⚠️ **The load test's first real finding was a clustering bug that silently dropped one submission in
four.** It is recorded here because it is the strongest argument in this document for T10.4 existing
at all: 1 333 unit tests, mypy, ruff and a hand-driven walkthrough of the whole pipeline all passed
over it.

**Symptom.** After the first pass, 252 of 965 submitted reports (26%) were classified but attached to
no Issue — with an empty Celery queue and a drained outbox, so nothing was retrying and nothing was
alerting. A report with no Issue appears in no Authority queue at all (BR-6).

**Cause.** `cluster_report()` resolved its candidate Issue with
`matching_open_issues(...).select_for_update().first()`. `matching_open_issues()` orders by the
PostGIS KNN operator (`representative_location <-> point`), which PostgreSQL answers with an ordered
GiST index scan; `FOR UPDATE` puts a `LockRows` node above that scan, and locking a tuple it produced
aborts the transaction with `InternalError: attempted to lock invisible tuple`. Classification had
already committed, so the report was left classified and unclustered.

**Why no test caught it, and why only a load test could.** The failure is *plan-dependent*.
Reproduced directly against the seeded database:

| Query shape | Plan | Result |
|---|---|---|
| KNN ordering, no row lock | `Index Scan using issues_issue_location_gist … Order By: <->` | returns the candidate |
| lock the same row by primary key | pk index scan | locks fine |
| KNN ordering **+ `FOR UPDATE`** | `LockRows → Incremental Sort → Index Scan … Order By: <->` | **`attempted to lock invisible tuple`** |
| KNN ordering + `FOR UPDATE`, `enable_indexscan=off` | `Seq Scan` | locks fine |

The last row is the whole story: on a table small enough for a sequential scan the lock is safe, and
every test table is that small. PostgreSQL switches to the KNN index scan at a few hundred Issues,
and from then on every report that *finds* a candidate fails — while the first report in each fresh
neighbourhood still succeeds, so the pipeline keeps creating Issues and looks alive.

**Fix.** Resolve the candidate id under the KNN ordering with no row lock, then lock it by primary
key, re-asserting the non-spatial predicate on the locked row. The geohash+category advisory lock is
what actually serialises concurrent clustering, so locking in a second statement weakens nothing.
`urbenmend/issues/services.py`, with `urbenmend/issues/tests/test_clustering_knn_lock.py` as the
guard — that file's docstring records why the abort itself is not reproducible at test scale and what
the two tests therefore do and do not prove.

**Verification on real data.** All 252 orphaned reports re-clustered with the fix in place: 252
succeeded, 0 failed, 0 reports left unlinked.

## 5. NFR-1 — geospatial query plans under this data

`manage.py perf_smoke --explain` against the seeded dataset. The probe centre is taken from a real
report location rather than the boundary centroid, because a probe that matches nothing gets an
excellent plan for free.

| Probe | Rows | Matches | Access path |
|---|---:|---:|---|
| Issues bbox | 1,332 | 1,332 | GiST index scan |
| Issues `ST_DWithin` | 1,332 | 14 | Bitmap heap + bitmap index scan |
| Reports `ST_DWithin` | 3,949 | 34 | Bitmap heap + bitmap index scan |
| POI `ST_DWithin` | 0 | 0 | Index scan (no POI data seeded) |

All four required geometry columns had GiST indexes. The empty POI table makes that row an
index-presence check rather than a volume result.

## 6. NFR-3 — classification latency

The worker remained active and submissions completed without errors, but this run did not capture
per-report classification timestamps. NFR-3 is therefore not claimed as a measured pass yet.

## 7. Honest limitations

1. **`geo_poi` is empty.** ❓Q3 (POI data source) is unresolved, so the proximity path has no rows to
   plan against. Its GiST index is asserted present; its behaviour at volume is unmeasured.
2. **The issues-bbox probe is informational.** At 878 issues the table is above `--explain-min-rows`,
   but a full-extent bbox matches every row, and a sequential scan is the correct plan for that — so
   the bbox probe is evidence about the index's existence, not about its selectivity.
3. **One machine, one API process** (§2). Absolute latencies are pessimistic; the *shape* — which
   paths are slowest, and where the knee is — is the transferable result.
4. **The submission throttles were raised for the run** and restored afterwards. Verifying them at
   their real values under concurrency is **T10.1**, which this task unblocks.
5. **Media upload is not exercised.** The harness submits reports without photos, so S3/MinIO
   throughput is not in these numbers.
6. **Accepted prototype-scale deviation.** Low-zoom map aggregation and second-page authority queue
   reads exceed the PRD's 2 s target at roughly 4,000 reports/1,300 issues. This is accepted for the
   academic prototype and remains a production-scaling follow-up, not an unreported pass.
