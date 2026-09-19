# UrbanMend Client — Frontend Build Plan

**Target:** React 19 + Vite + TypeScript + Tailwind, three roles (Citizen / Authority / Admin), talking to the existing Django/DRF backend in `UrbanMend-main`.

**Written against:** the real backend source (`urbenmend/api/urls.py` and every app's `serializers.py` / `views.py`), not the API spec document. Where the two disagree, this plan follows the code, because the code is what your browser will hit. Disagreements are noted where they matter.

**How to read this:** Sections 1–3 are constraints you cannot design around — read them before anything else. Section 10 is the list of places where your screenshots ask for data the API does not return; that section decides scope, so read it second. Everything in between is the build itself.

---

## 1. Three constraints that shape everything

### 1.1 Auth is a session cookie, not a token — and there is no CORS

The backend uses Django session cookies (`sessionid`, `HttpOnly`, `SameSite=Lax`) plus a double-submit CSRF cookie (`csrftoken`, readable by JS, sent back as the `X-CSRFToken` header). There is no JWT and there never will be — immediate revocation is a hard requirement (Arch §8), and blocking a user's status revokes their live sessions on the spot.

The consequence that matters: **`django-cors-headers` is not installed, is not in `INSTALLED_APPS`, and is not in either requirements file.** A Vite dev server on `localhost:5173` calling `localhost:8080` directly will fail — first on the missing `Access-Control-Allow-Origin`, then on the cookie, which `SameSite=Lax` will not send cross-site anyway.

**Decision: proxy through Vite. Do not add CORS to the backend.**

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
})
```

`changeOrigin: false` is deliberate — the backend's `ALLOWED_HOSTS` defaults to `["localhost","127.0.0.1","api"]`, and rewriting the Host header risks a 400. With this proxy the browser sees one origin, `SameSite=Lax` is satisfied, no CORS is involved, and no backend change is needed. It also mirrors production, where the SPA and API sit behind one ingress.

The alternative — installing `django-cors-headers` — needs seven coordinated changes (middleware order, `CORS_ALLOW_CREDENTIALS`, an origin allowlist, `x-csrftoken` and `idempotency-key` in `CORS_ALLOW_HEADERS`, all five custom response headers in `CORS_EXPOSE_HEADERS`, `CSRF_TRUSTED_ORIGINS` in `dev.py`, and `SameSite=None` + HTTPS locally). It is also a spec-affecting change, and your `CLAUDE.md` says the spec gets amended first. Not worth it.

### 1.2 Getting the CSRF token — the one real gap

**No view calls `ensure_csrf_cookie`.** There is no CSRF bootstrap endpoint. The `csrftoken` cookie is planted only as a side effect of `django.contrib.auth.login()`, which rotates the token.

So the flow is: log in → the login response sets `csrftoken` → read it from `document.cookie` → send it as `X-CSRFToken` on every unsafe method.

```ts
const csrfToken = () =>
  document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/)?.[1] ?? null
```

Two details:

- Pre-session routes (`register`, `verify`, `login`, `password/forgot`, `password/reset`) set `authentication_classes = []`, so CSRF is not enforced on them. You can call them with no token. The 2FA routes need no token on the partial-session path either.
- CSRF is enforced *only* on authenticated requests — DRF's `SessionAuthentication` skips the check for anonymous users. A missing token on an authenticated write returns `403` with `"CSRF"` in the message.

There is a cold-start edge: if the SPA reloads holding a live `sessionid` but no `csrftoken`, nothing can mint one. In practice `CSRF_COOKIE_AGE` defaults to one year against a 24-hour `SESSION_COOKIE_AGE`, so the CSRF cookie outlives the session and this shouldn't fire. If it ever does, the only recovery is re-login. **Worth asking the backend owner for an `ensure_csrf_cookie` endpoint** — it's a four-line view and removes the sharp edge permanently.

### 1.3 Cursor pagination, and `meta.count` is a lie you will believe

Every collection returns:

```json
{ "data": [ ... ],
  "page": { "nextCursor": "cD0yMDI2...", "prevCursor": null, "limit": 20 },
  "meta": { "count": 20 } }
```

**`meta.count` is the number of rows in this page, not a total.** There is no total anywhere in the API — the paginator's own comment says a real total would need a second `COUNT(*)`.

This directly contradicts two of your designs. `authority-queue.png` reads *"Showing 1 to 4 of 97 results"* with numbered pages `1 2 3 …`, and `admin-authority-provisioning.png` reads *"Showing 1-4 of 128 Authorities"* with Prev/Next. **Neither is buildable.** See §10.

Design for "Load more" or infinite scroll. Next page is `?cursor=<page.nextCursor>` verbatim plus the same filters — `nextCursor` is a bare token, not a URL. An invalid cursor returns `404`, not `400`. `page.limit` echoes the *clamped* value (ask for 500, get 100), so trust the response over your request.

Two exceptions to the envelope: `GET /categories` returns a **bare array** with no envelope at all, and `GET /issues/{id}/comments` returns `"page": {}` — an empty object. Generic unwrapping code breaks on both.

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 6 + React 19 + TypeScript (strict) | Fast, and the proxy config above is the whole backend integration story |
| Routing | React Router 7 (data router) | `loader`-free; guards as layout routes |
| Server state | TanStack Query v5 | Cursor pagination maps onto `useInfiniteQuery` exactly |
| Forms | React Hook Form + Zod | Zod schemas double as the parse layer for API responses |
| Styling | Tailwind v4 with a `@theme` token block | Matches the utility-class look of the screenshots |
| Icons | Lucide React | The screenshots already use Lucide-style line icons |
| Map | MapLibre GL JS + `react-map-gl` | Open source, GeoJSON-native; the API returns raw FeatureCollections |
| Charts | Recharts | Only two charts exist (§9.7); don't pull in more |
| Dates | `date-fns` | `formatDistanceToNow` for the "2h ago" / "14h 22m" labels |
| Tests | Vitest + Testing Library + MSW | MSW handlers are written from §4's response shapes |

Deliberately excluded: no Redux (TanStack Query plus a tiny auth context covers it), no component library (the screenshots have a specific look; shadcn/ui would fight it), no i18n framework at first (see §11 phase 6 — the backend is bilingual, so this is a real future requirement, but not a phase-1 one).

---

## 3. Project structure

```
src/
  main.tsx
  App.tsx
  api/
    client.ts            # fetch wrapper: credentials, CSRF, error envelope
    errors.ts            # ApiError class, code constants
    queryKeys.ts         # single source of cache keys
    endpoints/
      auth.ts  users.ts  reports.ts  issues.ts  media.ts
      notifications.ts   analytics.ts  moderation.ts  audit.ts
      exports.ts  reference.ts  geo.ts  meta.ts
  types/
    api.ts               # hand-written from the real serializers
    enums.ts             # wire values, hardcoded where /meta/enums omits them
  auth/
    AuthProvider.tsx  useAuth.ts  RequireAuth.tsx  RequireRole.tsx
  components/
    layout/    AppShell  Sidebar  TopBar  PageHeader  Footer
    data/      CursorList  DataTable  EmptyState  ErrorState  Skeleton
    display/   StatCard  SeverityBadge  StatusPill  Timeline  MediaThumb
    form/      Field  TextInput  Select  Textarea  FileDrop  Wizard
    feedback/  Toast  ConfirmDialog  RateLimitNotice
    map/       MapCanvas  IssueMarkers  LocationPicker  BoundaryLayer
  features/
    dashboard/  reports/  issues/  queue/  map/  notifications/
    settings/   admin/    moderation/  analytics/  audit/  exports/
  routes/
    index.tsx            # route table, role guards
  lib/
    cn.ts  format.ts  useDebounce.ts  csrf.ts
```

One rule worth holding: **`features/` owns screens, `components/` owns things with no domain knowledge.** A `SeverityBadge` takes a severity string and renders a pill; it does not know what an Issue is.

---

## 4. Design tokens

Sampled directly from your nine PNGs. The palette is a deep teal on a faintly blue-tinted white — cooler and more clinical than a standard grey dashboard, which suits a public-safety tool. Keep it.

```css
@theme {
  /* Brand — teal. Two weights appear in the screenshots; use 700 for
     primary buttons and the active nav rail, 600 for the darker hero panel. */
  --color-brand-600: #008378;   /* buttons, active nav, links */
  --color-brand-700: #00685F;   /* hero panel, pressed state */
  --color-brand-800: #006A61;
  --color-brand-50:  #F2F7F7;   /* tinted row hover */

  /* Surfaces */
  --color-canvas:  #F8F9FF;     /* page background — note the blue tint */
  --color-surface: #FFFFFF;     /* cards, table body */
  --color-raised:  #EFF4FF;     /* card headers, selected table row */

  /* Ink */
  --color-ink:      #0B1C30;    /* headings */
  --color-ink-body: #41474B;    /* body copy */
  --color-ink-mute: #6B7280;    /* labels, metadata */

  /* Lines */
  --color-line:        #F1F3F4; /* default hairline */
  --color-line-strong: #DDDEE0; /* table header underline */
  --color-line-accent: #D3E4FE; /* info panel border */

  /* Severity — these are semantic, not decorative. Four bands, always. */
  --color-critical:    #DC2626;  --color-critical-bg: #FEF2F2;
  --color-high:        #EA580C;  --color-high-bg:     #FFF7ED;
  --color-medium:      #D97706;  --color-medium-bg:   #FFFBEB;
  --color-low:         #059669;  --color-low-bg:      #F0FDF4;

  /* Informational (status pills, tinted panels) */
  --color-info:    #2563EB;  --color-info-bg: #E5EEFF;

  --radius-card: 8px;
  --radius-pill: 9999px;

  /* The screenshots use hairline borders, not shadows. Keep shadows nearly
     absent — one soft shadow for overlays only. */
  --shadow-overlay: 0 4px 16px rgb(11 28 48 / 0.08);
}
```

**Typography.** The screenshots use a single humanist sans throughout at four sizes: page title ~28px/600, card title ~15px/600, body ~14px/400, and an uppercase 11px/600 tracked label for stat-card captions (`PROCESSING`, `HIGH PRIORITY`, `CATEGORY`). That uppercase micro-label is the most characteristic type move in the whole design — it is what makes the stat cards read as instrument panel rather than marketing. Keep it and use it consistently for every field label.

Set Inter with `font-variant-numeric: tabular-nums` on all numbers. The queue's elapsed-time column (`12m`, `1h 45m`, `14h 22m`) and the stat cards will shimmer on refresh without it.

**Density.** Cards use 16–20px padding, table rows ~52px, the sidebar is 200–220px with a 3px teal active rail on the left edge. Page gutter is 24px.

**The one thing to preserve above all:** severity colour is load-bearing information, not decoration. Never use red for anything that isn't Critical, and never let a hover or focus state borrow a severity colour.

---

## 5. The API client

```ts
// api/client.ts
const BASE = '/api/v1'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { field?: string; issue: string; message: string }[] = [],
    readonly traceId?: string,
    readonly retryAfter?: number,
  ) { super(message) }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = csrfToken()
    if (token) headers.set('X-CSRFToken', token)
    if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(BASE + path, { ...init, headers, credentials: 'same-origin' })

  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)

  if (!res.ok) {
    // 500s do NOT carry the envelope — DRF returns None for unhandled
    // exceptions so DEBUG still shows a traceback. Tolerate a null body.
    const e = body?.error
    throw new ApiError(
      res.status,
      e?.code ?? 'INTERNAL',
      e?.message ?? 'Something went wrong.',
      e?.details ?? [],
      e?.traceId,
      Number(res.headers.get('Retry-After')) || undefined,
    )
  }
  return body as T
}
```

Five things this wrapper has to get right, each of which is a real trap:

**`credentials: 'same-origin'`** — with the Vite proxy the request *is* same-origin. Using `'include'` also works but signals cross-origin intent you don't have.

**`details` is omitted, never `[]`.** Guard with `error.details?.length`, and default to `[]` as above.

**`400` and `422` both carry `code: "VALIDATION_FAILED"`.** The code alone cannot distinguish "your JSON is malformed" from "business rule rejected this". Branch on `status`. This matters most on report submission, where `400` means fix the form and `422 OUT_OF_CITY` means the user is outside the service area — a completely different message.

**`410 Gone` is distinct from `404`.** Moderated content (hidden or removed) returns `410` by id and simply vanishes from lists. Render "This content was removed by a moderator", not "Not found". This applies to reports, issues, media and comments.

**Rate-limit headers.** `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` appear on *every* response from a throttled view, not just 429s. `RateLimit-Reset` is an absolute Unix timestamp, not a delta. When a view has several buckets, the one reported is whichever has least headroom — so the numbers jump between requests. Don't treat them as one monotonic counter; just read them when you need to show a cooldown.

### Error-to-message mapping

Build one function and use it everywhere. The backend deliberately returns generic messages on auth paths (anti-enumeration), so don't try to be more specific than it is.

| Status + code | UI treatment |
|---|---|
| `401 UNAUTHENTICATED` | Clear auth state, redirect to `/login` with a `?next=` |
| `403 FORBIDDEN` | Inline "You don't have permission for this" — never name the required role |
| `403 ACCOUNT_LOCKED` | Login page: "This account is not permitted to sign in." Contact support link |
| `404 NOT_FOUND` | Not-found state. **Never** say "permission denied" — an out-of-scope Authority gets 404 by design, and saying otherwise leaks existence |
| `410 GONE` | "Removed by a moderator" |
| `422 OUT_OF_CITY` | Submission form: "UrbanMend doesn't cover this location yet" with the boundary drawn on the map |
| `409 IDEMPOTENCY_IN_PROGRESS` | Silent retry after ~1s, then a spinner |
| `409 IDEMPOTENCY_KEY_REUSED` | "This looks like a different report — start a new submission" |
| `409 NOT_EDITABLE` | "This report has been triaged and can no longer be edited" |
| `409 INVALID_TRANSITION` | Refetch the issue and re-render available actions — the state moved under you |
| `429 RATE_LIMITED` | Countdown from `RateLimit-Reset`, disable submit |

---

## 6. Auth flow

```
POST /auth/register  {email?, phone?, password, preferredLanguage?}
     → 201 {userId, verificationRequired, channels:["email"]}
POST /auth/verify    {channel, code, identifier}
     → 200 {verified:true}
POST /auth/login     {identifier, password}
     → 200 {user:{id,role,preferredLanguage}, requires2fa:false}  + Set-Cookie ×2
     → 200 {requires2fa:true}                                      + partial session
POST /auth/2fa/enroll  (no body, accepts partial session)
     → 201 {secret, otpauthUri, confirmed:false}
POST /auth/2fa/verify  {code}
     → 200 {user:{...}, confirmed:true}  + full session + fresh csrftoken
POST /auth/logout    → 204
```

The critical detail: **when `requires2fa` is true, the `user` key is absent from the response entirely** — popped, not set to `null`, because `null` would leak the same distinction by shape. So:

```ts
if ('user' in res) { /* logged in */ } else { /* go to /2fa */ }
```

Never `res.user === null`.

The partial session works by *not* calling `django_login()` — `SESSION_KEY` stays unset, so every authenticated endpoint 401s automatically. `/auth/2fa/enroll` and `/auth/2fa/verify` are the only two routes in the entire API that accept it. **The partial session expires in 5 minutes** (`PARTIAL_SESSION_TTL_SECONDS = 300`), so the 2FA screen needs a visible countdown and a graceful "start over" path.

Two more:

`secret` is base32 (correct for manual entry) and `otpauthUri` is the QR payload. Render both — a user without a camera needs the string. It is returned exactly once and is never readable again, so warn before navigating away.

2FA code attempts land in the `auth_anon` bucket (10 per 15 minutes per IP), because the partial session is unauthenticated. On shared NAT a few fumbled TOTP codes can lock out registration for everyone behind that IP. Show a clear, calm "too many attempts, try again in N minutes" state rather than a generic error.

### Session bootstrap

There is no "am I logged in" endpoint. On app load, call `GET /users/me`: a 200 hydrates the auth context, a 401 means anonymous. Do this once in `AuthProvider` and gate the router on the result — otherwise every screen flashes its logged-out state first.

```ts
const { data: user, isPending } = useQuery({
  queryKey: ['me'], queryFn: () => api<User>('/users/me'),
  retry: false, staleTime: 5 * 60_000,
})
```

---

## 7. Routing and role guards

Nav in your screenshots is identical for all three roles: Dashboard, Queue, Map, Reports, Settings. That's a clean shell — but "Queue" means three different things, and for a citizen it means nothing at all. See §10.4.

```
/login  /register  /verify  /2fa  /forgot-password  /reset-password
/                             → redirect by role
/dashboard                    → citizen | authority | admin variant
/reports                      → citizen: own · authority: in-scope · admin: all
/reports/new                  → citizen only
/reports/:id
/issues/:id
/queue                        → authority: work queue · admin: moderation
/map
/notifications
/settings/profile
/settings/notifications
/settings/security            → 2FA enrolment
/admin/authorities            → provisioning
/admin/categories
/admin/severity-keywords
/admin/clustering-rules
/admin/pois
/admin/boundary
/admin/audit                  → authority sees own events only
/exports
```

Guards are layout routes, not per-screen checks:

```tsx
<Route element={<RequireAuth />}>
  <Route element={<AppShell />}>
    <Route path="dashboard" element={<Dashboard />} />
    <Route element={<RequireRole roles={['citizen']} />}>
      <Route path="reports/new" element={<SubmitReport />} />
    </Route>
    <Route element={<RequireRole roles={['authority','admin']} />}>
      <Route path="queue" element={<Queue />} />
    </Route>
    <Route element={<RequireRole roles={['admin']} />}>
      <Route path="admin/*" element={<AdminRoutes />} />
    </Route>
  </Route>
</Route>
```

**Client-side guards are navigation ergonomics, not security.** Every one of these is enforced in the backend's service layer. The guard exists so a citizen doesn't see a menu item that 403s.

### The `categoryScope` trap

`GET /users/me` returns `categoryScope` as an array of slugs for every role. An **Admin's `[]` means unrestricted; an Authority's `[]` means permitted nothing.** Identical JSON, opposite meanings. `role` is the only disambiguator.

```ts
function scopeFor(user: User): 'all' | string[] {
  if (user.role === 'admin') return 'all'
  if (user.role === 'authority') return user.categoryScope  // [] = nothing
  return 'all'  // citizens aren't scoped; the field is meaningless
}
```

Never write `if (categoryScope.length === 0) { /* full access */ }`. And an Authority with an empty scope needs a real empty state — *"Your account hasn't been assigned any categories yet. An administrator needs to grant access before you can see the queue."* — not a spinner or a blank table. New authorities start in exactly this state (`status: registered`, scope `[]`), so it will be the first thing many of them see.

### 403 vs 404

The backend returns **403 to act, 404 to see**. An Authority following a link to an out-of-scope issue gets `404`, deliberately — a 403 would confirm the id exists. So on detail routes, render "not found" for a 404 and never guess that it might be a permissions problem.

---

## 8. Data layer

### Query keys

```ts
export const qk = {
  me: ['me'] as const,
  enums: ['meta','enums'] as const,
  categories: ['categories'] as const,
  reports: (f: ReportFilters) => ['reports', f] as const,
  report: (id: string) => ['reports', id] as const,
  issues: (f: IssueFilters) => ['issues', f] as const,
  issue: (id: string) => ['issues', id] as const,
  issueReports: (id: string) => ['issues', id, 'reports'] as const,
  issueEvents: (id: string) => ['issues', id, 'status-events'] as const,
  issueComments: (id: string) => ['issues', id, 'comments'] as const,
  notifications: (f: NotifFilters) => ['notifications', f] as const,
  analytics: (f: AnalyticsFilters) => ['analytics', f] as const,
  users: (f: UserFilters) => ['users', f] as const,
  audit: (f: AuditFilters) => ['audit', f] as const,
}
```

### Cursor pagination helper

```ts
export function useCursorList<T>(key: readonly unknown[], path: string, params: URLSearchParams) {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params)
      if (pageParam) p.set('cursor', pageParam)
      return api<Paginated<T>>(`${path}?${p}`)
    },
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  })
}
```

### Boot-time reference data

Call `GET /meta/enums` once at app start and cache it forever (`staleTime: Infinity`). It returns `severities`, `issueStatuses`, `reportStatuses`, `notificationTypes`, `notificationChannels` as `[{value, label}]`, plus `categories` as `[{key, label:{en,bn}, active}]`.

Note the inconsistency: categories use `key`, not `value`, and their `label` is an object, not a string. And retired categories are included with `"active": false` — filter them out of submission forms but keep them in filter dropdowns, since historical reports still carry retired slugs.

`/meta/enums` does **not** expose user roles, user statuses, classification sources, media states, comment visibility, POI types, export states, or moderation actions. Hardcode those in `types/enums.ts` from this list:

```ts
export const ROLE = ['citizen','authority','admin'] as const
export const USER_STATUS = ['registered','verified','active','suspended','deprovisioned','deleted'] as const
export const SEVERITY = ['critical','high','medium','low'] as const
export const REPORT_STATUS = ['submitted','processing','triaged','hidden','removed'] as const
export const ISSUE_STATUS = ['submitted','triaged','acknowledged','in_progress','resolved',
                             'closed','rejected','duplicate','insufficient_info','hidden','removed'] as const
export const CLASSIFICATION_SOURCE = ['llm','fallback','citizen','authority'] as const
export const MEDIA_STATE = ['uploaded','processing','ready','failed','hidden','removed'] as const
export const COMMENT_VISIBILITY = ['public','internal'] as const
export const POI_TYPE = ['hospital','school','highway','market'] as const
export const EXPORT_STATE = ['processing','ready','failed'] as const
export const MODERATION_ACTION = ['hide','remove'] as const
```

The seven seeded category slugs are `roads`, `street_lighting`, `water_drainage`, `sanitation_waste`, `electrical`, `public_structures`, `other`. Fetch them rather than hardcoding, but know that `other` is a required sink for off-taxonomy classifier output and must never be hidden from a filter list.

### Mutation responses don't return the updated object

Every Issue mutation (status, assignment, severity, merge, split) returns a compact 2–7 field acknowledgement, not the refreshed Issue. After any of them you must invalidate `qk.issue(id)` and `qk.issues(...)`. Don't try to patch the cache from the response — it doesn't have enough fields.

---

## 9. Screens

Nine are designed; the rest are gaps this plan fills in. Each spec names the endpoints it calls.

### 9.1 Citizen dashboard — `citizen-dashboard.png`

Three stat cards (Processing / High Priority / Resolved), a teal call-to-action panel, and a "Nearby Activity" row of three photo cards.

**The stat cards have no endpoint.** `/analytics/summary` is Authority/Admin only — a citizen calling it gets 403. Options, in order of preference:

1. Derive them client-side from `GET /reports?limit=100` (the citizen's own reports, since the list is session-scoped by role). "Processing" = `status` in `submitted|processing`; "Resolved" needs the parent Issue, which the report doesn't carry a status for — so this only half-works.
2. Reframe the cards as *"Your reports"*: Submitted / Awaiting triage / Triaged. Honest, buildable today, and arguably more useful to a citizen than city-wide counts.
3. Ask the backend for a citizen-scoped summary endpoint.

**Recommendation: option 2 for phase 1.** City-wide numbers on a citizen dashboard are vanity metrics; their own reports are what they came for.

"Nearby Activity" maps cleanly to `GET /issues?nearLng=&nearLat=&radiusM=&limit=3` using the browser's geolocation, falling back to the city-boundary centroid. The card image comes from the issue's member reports — but note the Issue list item carries **no media and no title**. See §10.2.

### 9.2 Submit report — `citizen-submit-new-issue.png`

Three-step wizard (Category → Details → Review) beside a live map picker. Good design; a few corrections.

Flow:

1. **Category** — from `/meta/enums` `categories`, filtered to `active: true`. Your mock shows two large tiles (Infrastructure Hazard / Environmental); the real taxonomy has seven. Use a 2-column grid of seven tiles, or a grid of six plus "Something else" mapping to `other`. **Category is optional and is only a hint** — an unknown or retired slug is a `400`, never coerced.
2. **Details** — description (`textarea`) and photos.
3. **Review** — then submit.

**Media upload is a separate, prior call.** `POST /media` is `multipart/form-data` with a single part named `file`, one file per request, and returns `202 {id, state:'processing', url, thumbnailUrl:null}`. You collect the ids and pass them as `mediaIds` on the report.

```
POST /media (file)  → {id}   ×N, in parallel
POST /reports {description, location:{lng,lat}, category?, mediaIds:[...], language?}
   with header Idempotency-Key: <uuid v4, generated once when the wizard opens>
   → 202 {reportId, status:'processing', issueId:null, classification:{state:'pending'}}
```

Upload rules, and the order of rejection is observable: over 10 MiB → `413`; empty part → `400`; format not JPEG/PNG/WebP (detected from decoded bytes, *not* Content-Type or filename) → `415`; undecodable → `422`. Max **5 photos per report** (`MEDIA_MAX_PER_REPORT`) — but note that limit is enforced at *report submit* time, not at upload, so a user can upload six and only find out on Submit. Enforce the cap client-side in the picker.

`thumbnailUrl` is `null` until the Celery worker builds derivatives, but `url` is already a working presigned URL to the full-size sanitised original. **Render the full image immediately; don't gate on `state === 'ready'`.** Both URLs are presigned and regenerated per response — never cache or persist them.

If any `mediaIds` entry is unusable the whole submission fails with one deliberately vague message ("One or more photos are unavailable. Upload them again.") — you cannot tell the user *which*. Mitigate by validating each upload's `202` before enabling Submit.

**Content rule (BR-3):** with zero usable photos, `description.trim()` must be at least **15 characters**. Validate client-side and say so in the helper text.

**Location.** `{lng, lat}` — **lng first**. Transposed, every submission reads as out-of-city. There is no `address` field on submission; the backend reverse-geocodes. Draw the city boundary from `GET /meta/city-boundary` (a GeoJSON Feature, always `MultiPolygon`) and disable Submit when the pin falls outside — a client-side check that turns a `422 OUT_OF_CITY` into a preventable mistake.

**Idempotency.** Generate one UUID when the wizard mounts, keep it for every retry of the *same* submission. Same key + same normalised body replays the original `202` byte-identical with an `Idempotency-Replayed: true` header. Same key + different body → `409 IDEMPOTENCY_KEY_REUSED`. Concurrent double-tap → `409 IDEMPOTENCY_IN_PROGRESS` (retry after ~1s). A *failed* request does not consume its key, so the user can fix the form and resubmit with the same one.

**The EXIF copy in your mock is correct** — all EXIF is stripped, always (❓Q6 was resolved that way). Keep the panel; it's a genuine trust signal.

After `202`, route to `/reports/:reportId`. The acknowledgement is a frozen snapshot — `issueId` is *always* null and `classification.state` is *always* `'pending'` in that body. Poll the detail route for real state.

### 9.3 Report detail — `citizen-report-status-tracking.png`

Description, photo, location map, AI triage assessment, and a four-step status timeline.

`GET /reports/{id}` is public and returns nine keys: `id`, `authorId`, `description`, `location {lng,lat,address}`, `media[]`, `classification {category, severitySignal, confidence, source}`, `issueId`, `status`, `createdAt`.

**The timeline is the problem.** Your mock shows Report Submitted → AI Classification → Assigned to Authority → Issue Resolved. But a Report's own status is only `submitted | processing | triaged` — the workflow lives on the **Issue**. Status events come from `GET /issues/{issueId}/status-events`, which only exists once `issueId` is non-null.

Build it as two joined segments:

- **From the report:** "Submitted" at `createdAt`; "Classified" when `classification.category` is non-null (poll while `status === 'processing'`).
- **From the issue,** once `issueId` appears: fetch `GET /issues/{issueId}/status-events` and render each event. Items use bare `from` / `to` keys (renamed in `to_representation`), plus `actorRole`, `reason`, `at`. `to` can be the literal string `"reopen"`.

Poll `GET /reports/{id}` every 5s while `status === 'processing'`, then stop. Classification typically completes in seconds, but there's no push channel for it.

`classification.confidence` is a float — your mock doesn't show it, and I'd keep it hidden from citizens. Showing "87% confident" invites arguments about a number that has no validated accuracy bar behind it (❓Q10 is still open). Authorities can see it; citizens see the band only.

### 9.4 Authority dashboard — `authority-dashboard.png`

Four stat cards, a Queue Status breakdown, a map thumbnail, and a Nearby Activity feed.

`GET /analytics/summary?groupBy=status` gives `metrics: {total, open, resolved, medianTimeToResolutionSeconds}` and `groups: [{key, count}]`. That covers:

- **Total Active Cases** → `metrics.open`
- **Avg Resolution** → `metrics.medianTimeToResolutionSeconds` — but relabel the card **"Median resolution"**. The API returns a median; calling it an average is wrong, and it's `null` when nothing is resolved.
- **Queue Status** rows → `groups` with `groupBy=status`
- **High Priority** → a second call, `groupBy=severity`, summing critical + high

**"Hotspot Density: High / Downtown Core" has no backing.** `groupBy=area` returns a single group keyed `"all"` — it's a stub. Either drop the card or replace it with something real, e.g. count of `critical` issues from the severity grouping. Don't invent a hotspot label.

The `↓4%` / `↑2` trend deltas also have no backing — `trend` in the response is just `{open, resolved}` for the current window, with no prior-period comparison. To show deltas you'd make a second call with a shifted `fromDate`/`toDate` and diff client-side. Worth doing for two or three cards; not worth it for all four.

**Query params are `fromDate` and `toDate`, not `from`/`to`.** The spec document says `from`/`to`; the implementation rejects those with a `400`. Confusingly, `/audit-events` accepts *both*. Use `fromDate`/`toDate` on analytics.

### 9.5 Authority queue — `authority-queue.png`

The core working screen: a filterable table of issues.

`GET /issues` with `category`, `severity`, `status`, `assignedTo=me`, `bbox` *or* (`nearLng`+`nearLat`+`radiusM`), `openedAfter`, `q`, `sort`, `limit`, `cursor`.

Sort options are exactly four: `severity` (default, rank descending), `age` (oldest first), `-createdAt` (newest — actually orders by `opened_at`; Issues have no `created_at`), `corroborationCount`.

Columns, mapped to real fields:

| Your column | Field | Note |
|---|---|---|
| Severity | `severity.current` | Four bands. `severity.overridden` non-null means an authority changed it — worth a small marker |
| Issue Title & ID | — | **No title field exists.** See §10.2 |
| Location | `representativeLocation {lng,lat}` | **No address.** See §10.2 |
| Status | `status` | Eleven values; `hidden`/`removed` never appear in lists |
| Assigned To | `assignedTo` | **A bare UUID. No name.** See §10.1 |
| Time Elapsed | `ageSeconds` | Format with `date-fns`; this is what the `12m` / `14h 22m` column shows |

`assignedTo` filter accepts **only the literal `me`** — there is no `?assignedTo=<userId>`, so an admin cannot filter by another authority's workload. Sending `assignedTo=me` without a session is a `400`, not an empty page.

Two more filter rules that will bite: **`bbox` and the `nearLng`/`nearLat`/`radiusM` triple are mutually exclusive** (sending both is a `400`), and the triple is all-or-nothing. And `status=hidden` or `status=removed` is rejected with a specific `400` rather than returning nothing — so build the status filter from the nine public values only.

The `Manual Entry` button in your mock implies a create action. **There is no `POST /issues` and never will be** — Issues form only via async clustering. Either remove the button or repoint it at `/reports/new`.

`q` is a plain `icontains` over member reports' description and address. No ranking, no highlighting, no stemming. Label the input "Filter" rather than "Search" to set expectations honestly.

### 9.6 Issue detail — `authority-issu-details.png`

The richest screen: map, bundled citizen reports, internal notes, lifecycle actions, audit trail.

Composed from five calls:

```
GET /issues/{id}                    → detail + comments[] + memberReports URL
GET /issues/{id}/reports            → the bundled reports (paginated)
GET /issues/{id}/status-events      → the audit trail panel
GET /audit-events?targetType=issue  → richer trail, admin/authority-own only
GET /categories                     → to label primaryCategory
```

The detail body is the queue item plus `comments[]` (a plain unpaginated array) and `memberReports` (an absolute URL — ignore it and build the path yourself; it carries whatever Host the request arrived on).

**Lifecycle Actions panel:**

- **Status** — `PATCH /issues/{id}/status {toStatus, reason?, publicNote?, duplicateOfIssueId?}`. The transition graph is strict: `submitted→triaged`; `triaged→{acknowledged, rejected, duplicate, insufficient_info}`; `acknowledged→in_progress`; `in_progress→resolved`; `resolved→closed`. Everything else is terminal. **Render only the legal next states** — encode the graph client-side and let the server be the backstop. `reason` is required for `rejected`, `duplicate`, `insufficient_info` and `reopen`. `duplicateOfIssueId` is required for `duplicate` and must be *omitted* otherwise. `toStatus: "reopen"` is legal only from `resolved`/`closed` and creates a **new linked Issue** rather than mutating this one — surface that clearly, it's surprising. Reopening an already-reopened issue is a `409`, so the button needs to disappear after the first use.
- **Assigned Unit** — `PATCH /issues/{id}/assignment {assigneeId}`, `null` unassigns. The assignee must be in scope for the issue's category. **You cannot populate this dropdown** — see §10.1.
- **Manual Severity Override** — `PATCH /issues/{id}/severity {severity, reason}`. Your mock marks the reason Required, which is right. `severity: null` clears the override. This response is the *only* place `overrideReason`, `overriddenBy` and `overriddenAt` are exposed; the public issue payload deliberately never shows them.
- **Merge / Split** — `POST /issues/{id}/merge {mergeWithIssueId, reason}` (the **path** issue survives) and `POST /issues/{id}/split {reportIds:[], reason}` (returns `201` with both `original` and `created`). Not in your mock; both need UI eventually.

**Bundled Citizen Reports** — from `GET /issues/{id}/reports`, full Report objects, so description, photos and per-report severity are all available. Your mock's "Anonymous Citizen" / "Citizen ID: 8829" labels are honest given only `authorId` exists; keep that framing.

**Internal Notes** — `POST /issues/{id}/comments {body, visibility:'internal'}`. A citizen sending `internal` gets a `403`, not a silent downgrade. Public and internal comments both arrive in `comments[]`; filter on `visibility` and style internal ones distinctly (your mock's tinted panel is right). **Comments carry no `id`** — see §10.3.

After any mutation, invalidate and refetch. The responses are compact acknowledgements, not the updated issue.

### 9.7 Admin analytics — `admin-dashboard.png`

Stat cards, a Reports-by-Category bar chart, a Severity Distribution chart, and a CSV export panel.

- Category bars → `GET /analytics/summary?groupBy=category`
- Severity distribution → `groupBy=severity`
- Cards → `metrics`
- The `Last 7 Days` picker → `fromDate` / `toDate`

**The export panel needs rework.** `POST /exports {resource, format, filters}` accepts only `from`, `category` and `bbox` inside `filters` — and **`from` and `bbox` are silently ignored**; only `category` is honoured. Your mock offers Start Date and End Date pickers that would do nothing. Remove them, or wire them and accept that they're inert (bad — silent no-ops erode trust).

The real flow is async: `POST /exports` → `202 {exportId, state:'processing'}` → poll `GET /exports/{id}` until `state` is `ready` → follow `downloadUrl` (a presigned S3 URL, one-hour expiry). Format is `csv` or `geojson`; resource is `issues` or `reports`. Output caps at **10,000 rows** with no indication of truncation — say so in the UI. There is no `GET /exports` list, so the client must remember its own export ids (keep them in component state or `sessionStorage`).

`+12%` / `-4%` deltas: same story as §9.4 — no prior-period data. Second call with shifted dates, or drop them.

### 9.8 Admin moderation queue — `admin-queue.png`

**This screen cannot be built. There is no data source.**

I verified four independent ways: no moderation list route in `api/urls.py` (only the four `POST` action routes); `moderation/selectors.py` contains a docstring and zero functions; `moderation/admin.py` registers nothing; and a repo-wide grep for `flagged` / `moderation_queue` / `ReportFlag` finds only the service's `.create()` and test assertions.

Worse, the upstream half is missing too: **there is no citizen-facing "report this content" endpoint**, so nothing ever enters a pending-review state. Nothing populates a queue because nothing can flag.

What *does* exist: `POST /{reports|issues|media}/{id}/moderation` and `POST /issues/{id}/comments/{commentId}/moderation`, body `{action: 'hide'|'remove', reason: string}`, Admin only. `reason` is free text, not an enum — your mock's "PII Detected" / "Inappropriate" flag taxonomy doesn't exist in the backend.

Also missing: the mock shows auto-flagging ("Auto-flagged (Vision API)", "Auto-flagged (Text Filter)") and PII highlighting in text. There is no vision moderation, no text filter, and no PII detection in this backend. The `[REDACTED]` and highlighted licence plate are aspirational.

**Three options:**

1. **Build the moderation *action* only** — no queue. Add a "Hide / Remove" control on the existing report and issue detail screens, visible to Admins. Fully buildable today, ships in an afternoon.
2. **Ask for the backend work** — a `GET /moderation/queue` list endpoint plus a citizen `POST /reports/{id}/flag`. That's a real feature, not a small one: a new model, a new queue state, and probably a `ModerationFlag` table.
3. **Repurpose the screen** as an Admin "all reports" view with moderation actions inline, driven by `GET /reports` (admins see everything). Keeps the visual design, drops the flag taxonomy.

**Recommendation: option 1 now, option 2 raised as a backend ticket.** Don't build a queue UI against a data source that doesn't exist — you'd be mocking it, and a mocked screen in a defence demo is a question you don't want.

### 9.9 Admin authority provisioning — `admin-authority-provisioning.png`

Table of authorities with role, category scope and status; a System Access Overview panel; Role Distribution bars.

`GET /users?role=authority` returns the standard envelope of `UserSerializer` objects: `id`, `email`, `phone`, `role`, `status`, `preferredLanguage`, `verified {email, phone}`, `categoryScope[]`, `dateJoined`.

`POST /users/authorities {email, phone?, categoryScope[], requireTwoFactor}` → `201`. Email is **required** — it's how the first password gets set, via the reset flow. There is no `password` and no `role` field; the account is created `role: authority`, `status: registered`, with an unusable password.

`PATCH /users/{id} {role?, status?, categoryScope?, requireTwoFactor?}`. **`categoryScope` replaces, never merges** — always send the complete desired list; `[]` legitimately revokes everything. Setting `status` to `suspended`, `deprovisioned` or `deleted` revokes the target's live sessions immediately.

Errors worth handling: a `409` on a taken email carries a **specific** message here (unlike registration's deliberately generic one — the admin needs to know); an unknown or retired category slug is a `422` that names the offending slugs.

Mismatches with your mock:

- **Names.** "Elena Rodriguez", "Marcus Kim" — the API has no name field at all. See §10.1.
- **Roles.** "Field Supervisor", "Triage Specialist", "DPW Liaison", "Auditor" — there are exactly three roles: `citizen`, `authority`, `admin`. Sub-roles don't exist. Show the real role plus `categoryScope` as the differentiator, which is genuinely what distinguishes one authority from another here.
- **"112 Active / 16 Revoked" and "Role Distribution" counts.** No totals endpoint. See §10.5.
- **"Revoked" status.** The real values are `registered`, `verified`, `active`, `suspended`, `deprovisioned`, `deleted`. Map "Revoked" → `deprovisioned`.
- **"Read-Only" scope chip.** Not a thing — scope is a list of category slugs.

### 9.10 Map — not designed

`GET /map/issues?bbox=minLng,minLat,maxLng,maxLat&zoom=` returns a bare GeoJSON `FeatureCollection` — no envelope, no pagination. Public.

Two shapes depending on zoom:

- **zoom ≥ 12** — individual issues, `properties: {severity, status, corroborationCount, count:1}`, `id` is the issue UUID. **Hard-capped at 1000 features with no truncation flag** — silent. Show a "zoom in for detail" hint when you receive exactly 1000.
- **zoom < 12** — aggregated grid cells, `properties: {count, corroborationCount}` only. **No severity, no status**, and `id` is the string `cluster-<zoom>-<x>-<y>`, not a UUID. Don't route to a detail page from a cluster, and switch the legend below zoom 12 — a severity-coloured map cannot work there.

Coordinates are `[lng, lat]` (GeoJSON order). Also draw the city boundary from `GET /meta/city-boundary`, and optionally POIs from `GET /pois?bbox=` (note: `location` is `{lng, lat}`, *not* GeoJSON, and retired POIs come back with no `active` filter param — filter client-side).

Refetch on `moveend`, debounced ~300ms.

### 9.11 Reports list — partially designed

`GET /reports` is session-scoped by role: a citizen sees their own, an authority sees in-scope, an admin sees all. Filters: `status` (CSV), `category` (CSV), `q`, `nearLng`+`nearLat`+`radiusM` (all three or none; radius max 50,000m), `sort` (`-createdAt` or `createdAt` only), `limit`, `cursor`.

A citizen's moderated report **vanishes from the list with no explanation** and returns `410` by id. That's intentional, but it means a user can lose a report from their own list silently. Consider a footnote in the empty state.

`PATCH /reports/{id} {description?, category?}` — author-only while `submitted`/`processing`, else `409 NOT_EDITABLE`. Authority/Admin may change `category` at any time, but if they send `description` they get a `403`. Not both fields absent (empty body → `400`).

### 9.12 Notifications — not designed

`GET /notifications?unread=&type=&limit=&cursor=`. Items: `{id, type, issueId, body, channel, read, createdAt}`. Only one type exists (`issue_status_changed`), so the type filter is currently decorative.

`PATCH /notifications/{id} {read: true}` → 200 with the bare object. `{read: false}` is a `400` — this endpoint only marks *as read*. `POST /notifications/read-all` (body must be `{}`) → `204`.

`GET /notifications/stream` is **SSE**. Events are `event: notification` with `data: {"notificationId": "<uuid>"}` — the id only, so you fetch the notification separately. Heartbeat frames are SSE comments (`: heartbeat`) every 15s, which `EventSource` ignores.

Three behaviours to handle:

- The stream **closes after ~60 seconds** (`NOTIFICATION_STREAM_MAX_SECONDS`, checked at the top of each poll so it can overrun slightly). `EventSource` auto-reconnects, which is fine.
- **Every connect replays the oldest 100 notifications**, ascending by `created_at` — not the newest 100. There is no `Last-Event-ID` support and no `id:` field on events. **Dedupe by `notificationId`** or the bell re-fires on every reconnect, which at 60-second intervals is once a minute forever. And note the ordering: a user with more than 100 notifications gets their *oldest* ones first and pages forward on subsequent polls, so the stream is a poor source for "what's new" — treat it purely as a signal to refetch `GET /notifications`, and never render its replay directly.
- No error or close frame.

The bell badge count: see §10.6.

`GET /notification-preferences` → `{inApp, email}`; `PATCH` accepts either or both. No SMS channel exists.

### 9.13 Settings — partially designed

**Profile** (`/settings/profile`): `GET /users/me`, `PATCH /users/me`. Only **two** fields are updatable: `phone` and `preferredLanguage`. Unknown fields are rejected with a `400`, not dropped — `{"role":"admin"}` is an error, not a silent no-op. Email cannot be changed here (it's the password-reset address). Empty body → `400`. `""` clears the phone; `null` is refused. **Any submitted `phone` clears `phone_verified_at` even if unchanged**, and re-sends a verification code — tell the user that before they save. Clearing the last remaining contact channel is a `422`.

`DELETE /users/me` is **Citizen-only** (authority/admin get `403`) and returns `202` with no body. The session is already destroyed when the response arrives — redirect straight to a logged-out confirmation and make no further authenticated calls. It anonymises rather than deletes: the row is retained with PII nulled so public issue history keeps a stable author reference. Irreversible, no undo. This needs a serious confirmation dialog with typed confirmation.

**Security** (`/settings/security`): 2FA enrolment via `POST /auth/2fa/enroll` then `POST /auth/2fa/verify`. Note `GET /users/me` does **not** expose `requireTwoFactor`, so the screen cannot show current enrolment state — it can only offer to enrol and read the `409` if a device already exists. Clumsy. Worth asking for that field to be added.

**Notifications** (`/settings/notifications`): the preferences endpoint above.

### 9.14 Admin reference data — not designed

Five small CRUD screens, all Admin-only for writes:

- **Categories** — `GET /categories` (bare array, no envelope, public), `PATCH /categories/{key}`. Note **`GET /categories/{key}` does not exist** — the view defines only `patch`, so a GET is a `405`. Look up from the list client-side. Lifecycle is `active → retired`, never deleted.
- **Severity keywords** — `GET`/`POST /severity-keywords`, `PATCH`/`DELETE /severity-keywords/{int id}`. Integer ids, not UUIDs. Authority can **read** but not write. `DELETE` returns **`200` with the retired body**, not `204` — a UI that removes the row on `204` will never fire. The list includes retired rows with no filter param.
- **Clustering rules** — `GET`/`POST /clustering-rules`, `PATCH /clustering-rules/{int id}`. **Admin-only even for reads**, unlike severity keywords. No `DELETE`.
- **POIs** — `GET`/`POST /pois`, `PATCH /pois/{uuid}`. Retired POIs returned with no filter param.
- **City boundary** — `GET`/`PUT /meta/city-boundary`. Replacement is add-and-retire; a duplicate name is `409`, and it's `409` if the active-boundary count isn't exactly 1.

### 9.15 Audit log — not designed

`GET /audit-events` → `{actorId, action, targetType, targetId, before, after, at}`. Filters: `fromDate`/`toDate` (**or** `from`/`to` — this endpoint accepts both, unlike analytics), `actorId`, `action`, `targetType`.

Admin sees everything. **An Authority is silently scoped to their own events** — passing `actorId` is ignored rather than rejected, which is a quiet surprise worth a UI note.

No enum endpoint exposes the action vocabulary. The values found in source: `authority.provisioned`, `authority.scope_changed`, `identity.user_updated`, `issue.assignment_changed`, `issue.severity_overridden`, `issue.merged`, `issue.split`, `issue.status_changed`, `issue.reopened`, `reference.*` (category, severity_keyword, clustering_rule, poi, city_boundary), `moderation.hide`, `moderation.remove`.

`before`/`after` are free-form JSON. A collapsible diff view is the right treatment.

---

## 10. Where the designs and the API disagree

These are the decisions that need your input. Each is a real blocker, not a nitpick.

### 10.1 There are no human names anywhere — **blocking**

`authorId`, `assignedTo` and comment `authorId` are all opaque UUIDs. **The user model has no name field**, and there is no endpoint that resolves a UUID to a display name for a citizen or an authority. Only `GET /users` (Admin-only) and `GET /users/me` exist, and even those return email, not a name.

This breaks: "Assigned To: Team Alpha / D. Powell" (`authority-queue.png`), "Dispatcher Pierson" on internal notes and "Unit 4 (Heavy Repair)" in the assignment dropdown (`authority-issu-details.png`), and every name in `admin-authority-provisioning.png`.

**Options:**

1. Add `firstName`/`lastName` or `displayName` to the user model and serializer, plus a scoped lookup endpoint. The correct fix; it's a migration plus a serializer change plus a new route.
2. Show email instead, and make the assignment dropdown Admin-only (Admins can call `GET /users?role=authority`). Authorities can self-assign via a "Assign to me" button, which needs no lookup at all. **Buildable today.**
3. Show truncated UUIDs (`#8492`). Honest but hostile.

**Recommendation: option 2 for phase 1, option 1 as a backend ticket.** "Assign to me" plus an Admin-only reassignment dropdown covers the real workflow without a backend change.

### 10.2 Issues have no title and no address — **blocking**

The Issue payload has `primaryCategory` (a slug), `severity`, `status`, `assignedTo`, `corroborationCount`, `proximity`, `representativeLocation {lng,lat}`, `reportCount`, `openedAt`, `ageSeconds`. **No title. No address. No description. No media.**

Your queue design leads with "Main Transmission Line Failure" and "Grid Sector 4, North Substation". Neither exists.

**Options:**

1. Add a computed title and reverse-geocoded address to the Issue serializer. Backend work.
2. **Derive client-side:** fetch the first member report per issue and use its description (truncated) and `location.address`. Costs one extra request per row — bad for a 20-row table.
3. **Compose a label from what you have:** `"{CategoryLabel} · {reportCount} reports"` plus coordinates reverse-geocoded in the browser, or just coordinates. Ugly but honest.
4. **Change the table shape:** lead with severity and category, show `corroborationCount` and `ageSeconds` prominently, and let the operator open the issue for detail. Arguably a *better* triage table — an operator triages on severity and age, not on a title.

**Recommendation: option 4 for phase 1, option 1 as a backend ticket.** A triage queue that leads with severity, category, report count and elapsed time is defensible design, not a compromise.

Same applies to the citizen dashboard's "Nearby Activity" cards, which show a title, a photo and a location — an Issue carries none of those. Point those cards at `GET /reports` instead, which has all three.

### 10.3 Comments have no `id`, and the comment serializer looks broken — **blocking**

Two problems, one of which is worse than a missing field.

**The missing id.** `CommentSerializer` extends a plain `serializers.Serializer` (via `CamelCaseSerializer`), so its `Meta.fields` — which does list `id` — is **completely inert**; plain serializers ignore `Meta`. The emitted object is `{authorId, visibility, body, createdAt, updatedAt}`. But `PATCH`/`DELETE /issues/{id}/comments/{commentId}` need an id in the path, so **you cannot build an edit or delete affordance from the data you're given.**

**The likely 500.** `urbenmend/issues/serializers.py:218` reads:

```python
author_id = serializers.UUIDField(source="author_id", read_only=True)
```

DRF's `Field.bind()` asserts `self.source != field_name`. The camelCase mixin renames output *keys* inside `to_representation`, never the bind-time field name — so both are `author_id` and the assertion should fire the first time the child field binds. Binding is lazy: `ListSerializer` only touches `.fields` when the iterable is **non-empty**. The one test that renders comments creates a single `internal` comment and fetches anonymously, so the public queryset is empty and the assertion never trips. If this reasoning holds, **`GET /issues/{id}` 500s for any issue that has a visible comment** — which is every issue in a real demo.

This is static reasoning, not an executed test. **Verify it first**: create an issue, post a public comment, then `GET /issues/{id}`. Takes two minutes and it determines whether §9.6's comment panel is buildable at all.

Both fixes are one line each in `urbenmend/issues/serializers.py`: add `id = serializers.UUIDField(read_only=True)`, and drop the redundant `source="author_id"`.

Until then, treat comments as append-only *and* unproven. Build the issue detail screen so the comments panel degrades to an error state rather than taking the whole page down with it.

### 10.4 "Queue" means three different things

The sidebar is identical across all three roles, but for an Authority it's the work queue, for an Admin it's the moderation queue, and for a Citizen it's… unclear. A citizen has no queue.

**Recommendation:** keep one shell, vary the labels.

| | Citizen | Authority | Admin |
|---|---|---|---|
| 1 | Dashboard | Dashboard | Analytics |
| 2 | **My reports** | **Queue** | **All reports** |
| 3 | Map | Map | Map |
| 4 | *(drop)* | Reports | Audit log |
| 5 | Settings | Settings | Settings |

A citizen having both "Queue" and "Reports" pointing at the same data is the clearest sign the nav was drawn once and reused.

### 10.5 No totals, anywhere

Cursor pagination with no `COUNT(*)`. This kills "Showing 1 to 4 of 97 results" with numbered pages (`authority-queue.png`), "Showing 1-4 of 128 Authorities" (`admin-authority-provisioning.png`), and the "112 Active / 16 Revoked" and "Role Distribution: 45 / 32 / 20" panels.

**Options:** add a `?count=true` opt-in to the paginator (backend, and the paginator's comment explains why it was avoided); or redesign for "Load more" and drop the counts. Note that `GET /analytics/summary` *does* return real counts for issues — so the Authority dashboard's numbers are fine. It's only user counts and list totals that are missing.

**Recommendation: "Load more" everywhere, and drop the count panels from the provisioning screen.**

### 10.6 No unread notification count

For the bell badge. `meta.count` is page size. The only approach is `GET /notifications?unread=true&limit=100` and counting `data`, which saturates at 100 — so the badge reads "99+" beyond that and costs a full page fetch.

Cheap backend fix: add `unreadCount` to the notifications response `meta`. Worth asking for.

### 10.7 Your categories don't match the taxonomy

The screenshots show: Infrastructure Hazard, Environmental, Public Health, Traffic/Roads, Sanitation, Vandalism, Infrastructure.

The seeded taxonomy is: Roads & Transport (`roads`), Street Lighting (`street_lighting`), Water & Drainage (`water_drainage`), Sanitation & Waste (`sanitation_waste`), Electrical Hazards (`electrical`), Public Structures (`public_structures`), Other / Uncategorized (`other`).

Your thesis already captions the Appendix B screenshots as placeholder content whose categories don't match the delivered taxonomy, so this is a known gap. **Fetch categories from `/meta/enums` and never hardcode them** — the labels are bilingual (`{en, bn}`) and the set is admin-editable at runtime.

### 10.8 Smaller mismatches

| Design element | Reality |
|---|---|
| "Avg Resolution 3.4h" | The API returns a **median**. Relabel |
| "Hotspot Density: High" | `groupBy=area` is a stub returning one group keyed `"all"` |
| `+12%` / `↓4%` trend deltas | No prior-period data; needs a second call and client-side diffing |
| Export Start/End Date | `filters.from` is accepted and **silently ignored** |
| "Manual Entry" button | No `POST /issues` exists, by design |
| Report timeline "Assigned to Authority" | That's Issue state, not Report state — join the two |
| "Auto-flagged (Vision API)" | No vision moderation exists |
| "License plate ABC-1234" highlighted | No PII detection exists |
| Sub-roles (Field Supervisor, Auditor) | Three roles only; `categoryScope` is the real differentiator |
| "Read-Only" scope chip | Scope is a list of category slugs |
| Citizen dashboard city-wide stats | `/analytics/summary` is 403 for citizens |
| Confidence score display | Exists in the payload; hide from citizens (no validated accuracy bar — ❓Q10 open) |

---

## 11. Build order

**Phase 0 — Foundations (½ day).** Vite + TS + Tailwind with the §4 token block. The proxy config. `api/client.ts` with CSRF, the error envelope and the `ApiError` class. `types/api.ts` hand-written from §4's shapes. MSW handlers for every endpoint you'll touch. *Done when a smoke test hits `GET /health` through the proxy.*

**Phase 1 — Auth (1–2 days).** `AuthProvider` bootstrapping from `GET /users/me`. Login, register, verify, 2FA (with the 5-minute countdown), forgot/reset. `RequireAuth` and `RequireRole`. The role-based redirect at `/`. *Done when all three roles can log in and land somewhere different.*

**Phase 2 — Shell (1 day).** `AppShell`, sidebar with per-role nav from §10.4, top bar, notification bell, user menu, footer. `EmptyState`, `ErrorState`, `Skeleton`, `Toast`. The `CursorList` primitive. *Done when navigation works for all three roles with empty screens.*

**Phase 3 — Citizen (2–3 days).** Submit wizard with media upload, idempotency and the boundary check. Report detail with the joined timeline and the processing poll. My-reports list. Citizen dashboard using the §9.1 option-2 framing. *Done when a citizen can submit a report and watch it get classified.*

**Phase 4 — Authority (3–4 days).** Queue table with all filters and the four sorts. Issue detail with the full lifecycle panel, transition graph, comments and status events. Authority dashboard from `/analytics/summary`. *Done when an authority can triage an issue end to end.*

**Phase 5 — Map (1–2 days).** MapLibre with the zoom-12 cluster/detail switch, the boundary layer, POIs, and the debounced bbox refetch. Reuse it as the location picker in the submit wizard. *Done when the legend degrades correctly below zoom 12.*

**Phase 6 — Admin (3–4 days).** Analytics with both charts and the async export flow. Authority provisioning. The five reference-data CRUD screens. Audit log. Moderation *actions* per §9.8 option 1. *Done when an admin can provision an authority and run an export.*

**Phase 7 — Polish (2–3 days).** Notification SSE with dedupe. Settings screens. Rate-limit handling. Responsive down to mobile — the citizen flows especially, since people report potholes from a phone. Keyboard focus, `prefers-reduced-motion`, and colour-contrast checks on the severity palette. Bengali localisation if it's in scope (the backend is bilingual; the UI shouldn't be the thing that isn't).

Roughly 14–20 working days. Phases 3 and 4 are the ones that matter for a defence demo; phases 6 and 7 can be thin.

---

## 12. Verification

**Before you write any code — one two-minute check.** Bring up the backend, create an issue, post a **public** comment on it, and `GET /issues/{id}`. If it 500s, §10.3's serializer bug is real and the issue detail screen needs the backend fix before phase 4. The existing test suite structurally cannot catch this, so a green `pytest` run tells you nothing about it.

**Per phase:** MSW-backed component tests for anything with branching logic (the transition graph, the error mapper, the scope resolver). Type-check and lint clean.

**The five things most likely to break silently**, each of which deserves an explicit test:

1. `{lng, lat}` ordering — transposed, every submission reads out-of-city. Test with a real Dhaka coordinate.
2. `requires2fa` detection using `'user' in res`, not `res.user === null`.
3. `categoryScope: []` resolving to "nothing" for an Authority and "everything" for an Admin.
4. Cursor pagination not reading `meta.count` as a total.
5. Notification SSE deduping across a reconnect — the 60-second cycle replays the oldest 100 items every time.

**Before the defence:** run the whole app against the real backend in Docker Compose, not MSW. Seed data with `seed_load_dataset`. Walk each role's primary flow end to end and screenshot it — those screenshots replace the placeholder Appendix B images in your thesis, which are currently captioned as not matching the delivered taxonomy.

---

## 13. Open questions for you

1. **Names (§10.1)** — add a name field to the backend, or ship with email + "assign to me"?
2. **Issue titles (§10.2)** — backend-computed title, or restructure the queue table around severity and age?
3. **Moderation (§9.8)** — actions-only now, or build the queue endpoint first?
4. **Totals (§10.5)** — add an opt-in count to the paginator, or drop the count panels?
5. **Comments (§10.3)** — the two-line serializer fix. One line unblocks edit and delete; the other may be the difference between the issue detail screen working and 500ing. Run the two-minute check in §12 first.
6. **Bengali** — phase 1 or later? The backend is bilingual throughout, so the labels are already there.
7. **CSRF bootstrap (§1.2)** — worth asking for an `ensure_csrf_cookie` endpoint to close the cold-start edge?

Items 1, 2 and 5 are small backend changes that materially improve the UI. Items 3 and 4 are larger. If the defence timeline is tight, do 5 first (it may be a live bug, not a nicety), then 1, and design around the rest.

---

## Appendix — verification status

Every API claim in this document was checked against the backend source in `UrbanMend-main`, not against `docs/04-api-specification.md` and not against `CLAUDE.md`. Both of those are stale in at least one place that matters — `CLAUDE.md` still says `mediaIds` is refused with a `400`, which T2.4/T2.6 changed; the code accepts it, and §9.2 depends on that.

Twenty-five specific claims were re-verified line by line after drafting. Three findings changed the text: the SSE replay is the *oldest* 100 rather than the newest (§9.12), the `MEDIA_MAX_PER_REPORT` cap fires at submit rather than upload (§9.2), and the `CommentSerializer` bind bug in §10.3 — which was not in the first draft and is the single riskiest item in this plan.

Three places where the implementation and the spec document disagree, with the code treated as authoritative: analytics uses `fromDate`/`toDate` where the spec says `from`/`to`; the spec's authorization matrix cell for "me-too" confirmations doesn't match the service; and the spec implies an email-change path on `/users/me` that the serializer does not provide.
