# UrbanMend Client — Build Plan

Frontend for the UrbanMend backend (`../UrbanMend-main`), implementing
`../FRONTEND_PLAN.md` (routes, screens, design system) against the Django/DRF
API spec (`../UrbanMend-main/docs/04-api-specification.md`).

**Stack:** React 18 (JavaScript) · Vite · react-router-dom v6 ·
@tanstack/react-query v5 · Tailwind CSS v3 · lucide-react · Docker (dev server
in container, `/api` proxied to the Django backend).

**Auth model:** server-side session via `HttpOnly` cookie + CSRF token +
`Idempotency-Key` header on submit. No JWT, no tokens in JS. The Vite proxy
makes the API same-origin, so cookies work unchanged.

## How to run

```powershell
# Backend (first time only, then whenever you need the API):
cd ..\"UrbanMend-main"
Copy-Item .env.example .env.local   # if .env.local does not exist yet
docker compose up -d
docker compose exec api python manage.py migrate
docker compose logs api             # verification codes are printed here (console email)

# Frontend:
cd ..\client
docker compose up --build
# -> http://localhost:5173  (API requests proxy to localhost:8080)
```

## Working agreement

- One task at a time. I finish a task, you test it in the browser, you say OK,
  we move to the next. Checkboxes below track progress.
- Desktop first (screenshots are desktop); a responsive pass is Phase 5.
- Reference screenshots in the repo root are the visual source of truth.

---

## Phase 0 — Scaffold ⬅ (current)

- [x] `client/` folder: Vite + React + Tailwind + Router + Query skeleton.
- [x] Dockerfile + docker-compose for the dev server with `/api` proxy to the
      backend (`host.docker.internal:8080`).
- [ ] **YOU TEST:** `docker compose up --build` in `client/`, open
      http://localhost:5173 → you should see "UrbanMend Client" placeholder
      with Tailwind styling.

## Phase 1 — Foundation (shell + auth)

- [x] 1.1 Design tokens: finalized colors/typography in `tailwind.config.js`
      against the screenshots; base styles + focus ring in `src/index.css`.
- [x] 1.2 `src/lib/api.js` — fetch wrapper (JSON, `X-CSRFToken` from cookie on
      unsafe methods, camelCase pass-through, `{error:{code,message,details}}`
      envelope → typed `ApiError`).
- [x] 1.3 `src/auth/` — `AuthContext` (session via GET /users/me), login /
      2FA-verify / logout mutations, role-aware redirects per FRONTEND_PLAN §2.
- [x] 1.4 Base components: Button, Input, Select, Card, StatusBadge, Spinner,
      EmptyState, Dialog, PageHeader. (DataTable/MapPanel/etc. come with their
      feature.)
- [x] 1.5 Route tree (all FRONTEND_PLAN §2 routes as stubs) +
      `RequireAuth` / `RequireRole` guards, 403/404 pages.
- [x] 1.6 `AppShell`: sidebar (role-aware nav + account card), topbar (search,
      notification bell, user menu with sign-out), footer links per screenshots.
- [x] Verified end-to-end: `vite build` passes; login → session →
      CSRF-protected logout round-trip confirmed over the Vite proxy with curl.
      Demo accounts (password `Dev!Passw0rd2026`): citizen@urbanmend.test /
      unverified@urbanmend.test / authority@urbanmend.test /
      admin@urbanmend.test.
- [ ] **YOU TEST:** log in as citizen / authority / admin at
      http://localhost:5173/auth/login → each lands on their own dashboard stub;
      visiting another role's URL shows 403; Sign out returns to /auth/login;
      closing and reopening the tab keeps you signed in (server session).

## Phase 2 — Citizen MVP

- [x] 2.1 Citizen dashboard (`citizen-dashboard.png`): KPI cards (Processing /
      High Priority / Triaged), "Notice an issue?" CTA panel, recent-reports
      grid with photos + badges + age, "View all on Map" link, empty/loading/
      error states. Polls every 30 s.
- [x] 2.2 Report wizard steps 1–2: category grid from GET /categories (icon per
      slug), Leaflet map picker using OSM tiles with draggable pin + city
      boundary polygon (from GET /meta/city-boundary), optional address text,
      photo upload to POST /media with previews, per-file state (uploading /
      ready / error incl. 413/415/422 messages), EXIF/privacy notice, BR-3
      validation (min description OR photo).
- [x] 2.3 Review step: per-section Edit links, photo thumbnails, submit with a
      UUID Idempotency-Key (safe double-click), 202 confirmation screen with
      short + full report ID and link to tracking; OUT_OF_CITY and other API
      errors shown inline.
- [x] 2.4 Report tracking page (`citizen-report-status-tracking.png`): header
      with back link + status badge, category/location cards, description,
      photo with EXIF caption, AI Triage card (severity + confidence, polls
      every 4 s until classified), mini map, Status Timeline that follows the
      Issue once the report is clustered (polls /issues/{id}).
      Plus: full "My Reports" page (`/citizen/reports`) with text search,
      status filter, cursor-paginated Load more.
- [x] Verified: `vite build` passes with all new pages wired.
- [ ] **YOU TEST:** sign in as citizen@urbanmend.test, hit "Report a Problem",
      pick a category, drag the pin inside the boundary, add a photo, review
      and submit → confirmation screen → "Track this report" shows the live
      page that fills in AI classification on its own. Also try a pin outside
      the city (expect the OUT_OF_CITY message).

## Phase 3 — Authority workspace

- [x] 3.1 Authority dashboard (`authority-dashboard.png`): Total Active /
      High Priority / Median Resolution KPI cards from GET /analytics/summary
      (groupBy=status + groupBy=severity), queue-status breakdown panel,
      nearby-activity list linking to incident details, scope note in the
      subtitle.
- [x] 3.2 Queue table (`authority-queue.png`): search (Enter/blur), category /
      severity / status / "assigned to me" filters, sort select (severity,
      age, newest, corroboration — the §6.5 allowlist), clear-all, selectable
      rows, cursor pagination (Next/First page), loading/error/empty states.
      **Filters live in URL search params** (bookmarkable, FRONTEND_PLAN §8),
      20 s live refetch.
- [x] 3.3 Incident details (`authority-issu-details.png`): boundary-aware
      incident map, bundled citizen reports with photos + severities,
      lifecycle panel (status select with mandatory reason for
      rejected/duplicate/insufficient_info, assign-to-me with optimistic
      update + rollback, severity override with mandatory reason), internal
      notes (POST /issues/{id}/comments, visibility=internal), audit trail
      from GET /issues/{id}/status-events. Errors inline; 409 transitions
      explained.
- [x] Demo data: 2 seeded reports → 2 triaged issues; demo authority scoped
      to all 7 categories (BR-26 — unscoped authorities see an empty queue).
- [ ] **YOU TEST:** sign in as authority, dashboard shows 2 active cases;
      queue lists them (try filters/sort); open one, assign to me, change
      status to in_progress (then resolved), override severity with a reason,
      post an internal note; audit trail updates.

## Phase 4 — Admin workspace

- [x] 4.1 Analytics dashboard (`admin-dashboard.png`): date-range selector
      (all/7/30 days) → GET /analytics/summary, KPI cards, Reports-by-Category
      bars, Severity donut, Queue-status bars, Export card (POST /exports →
      poll → presigned download link).
- [x] 4.2 Moderation (`admin-queue.png` **adapted to real API §6.13** — no flag
      queue exists server-side, only hide/remove): Reports/Issues tabs,
      per-row Hide & Remove with mandatory reason dialog, server-audited.
- [x] 4.3 Authority provisioning (`admin-authority-provisioning.png`): KPI
      summary, searchable table, Provision form (email + scope + require-2FA →
      POST /users/authorities), detail page (status change w/ confirm, scope
      editor → PATCH /users/{id}).
- [x] 4.4 Admin audit log: filterable paginated append-only table from
      GET /audit-events.
- [x] Verified end-to-end via proxy as admin (analytics, authorities, audit).
      `vite build` passes.
- [ ] **YOU TEST:** sign in as admin → dashboard analytics + CSV export;
      Authorities → open demo authority → toggle scope / suspend; Moderation →
      hide a report (reason required); Audit Log reflects those actions.

## Phase 5 — Full Coverage & Quality
 
- [x] 5.1 Responsive layouts (tablet/mobile per FRONTEND_PLAN §7):
      shell drawer sidebar was already in place; added mobile stacked report
      cards for the queue / authorities / audit-log tables (full table from
      `md:` up, queue filter bar sticky on tablet+), 2-col KPI grids on
      mobile, sticky wizard action bar (Continue/Submit) on mobile, wrapping
      moderation rows + always-visible search, wrapping detail-page headers,
      full-width export controls, tighter StepIndicator gap. `vite build`
      passes.
- [x] 5.2 All 8 remaining placeholder screens built and wired into `App.jsx`:
      - `/citizen/map` (`CitizenMapPage.jsx`) — public safety map with filters, bounds & pin preview
      - `/citizen/settings` (`CitizenSettingsPage.jsx`) — profile, phone/language update, notification prefs & delete account
      - `/authority/map` (`AuthorityMapPage.jsx`) — scoped jurisdiction incident map
      - `/authority/reports` (`AuthorityReportsPage.jsx`) — scoped citizen reports table with search and filters
      - `/authority/settings` (`AuthoritySettingsPage.jsx`) — scope tags, language & 2FA TOTP setup
      - `/admin/map` (`AdminMapPage.jsx`) — city-wide incident overview with hotspot tally
      - `/admin/reports` (`AdminReportsPage.jsx`) — global reports explorer with moderation link
      - `/admin/settings` (`AdminSettingsPage.jsx`) — system reference data, health & admin 2FA
- [x] 5.3 Shared infrastructure enhancements:
      - `InteractiveMap.jsx` with GeoJSON feature rendering, colored severity pins, cluster zoom & popups
      - `NotificationBell.jsx` with live unread badge, popover dropdown & mark-as-read mutations
      - Topbar global search forwards query parameter `?q=...`
      - Report wizard autosaves and restores draft state to `localStorage`
- [ ] 5.4 Accessibility pass (focus styles, labels, keyboard nav, contrast).
- [ ] 5.5 Visual diff pass against the 9 reference screenshots.
- [ ] 5.6 Production Dockerfile verification (`Dockerfile.prod`, `nginx.prod.conf`).

## Open questions (raise when we get there)

- Map provider: screenshots show map panels. Backend has geo endpoints; we need
  a tile source (OSM raster tiles via react-leaflet is the zero-cost option).
- Some FRONTEND_PLAN pages (admin analytics charts, moderation) expose data the
  backend may or may not already serve — we'll align UI to
  `docs/04-api-specification.md` §6 endpoints when we reach those phases.
