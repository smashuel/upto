---
type: plan
status: shipped
created: 2026-06-16
shipped: 2026-06-16
related: [src/pages/MyTrips.tsx, src/components/trips/TripRow.tsx, src/pages/Profile.tsx, src/pages/ActiveTrip.tsx, src/pages/CreateAdventure.tsx, src/config/api.ts, backend-server.js, brain/plans/persistence-and-auth.md]
tags: [my-trips, persistence, phase-4, backend, frontend]
---

# Plan — My Trips + Persistence Phase 4 tie-up

> **SHIPPED 2026-06-16.** All 5 phases landed in one pass. Backend smoke-tested (401 guard + authed projection). See "What shipped" at the bottom.

## Why now

We shipped a trip-completion success screen (2026-06-05) whose **"View my account"** CTA links to `/profile` — but `/profile` only shows saved contacts. There is **no in-app list of a user's trips anywhere**. This session created that dangling link; this plan closes it.

It also forces the last open item of [persistence-and-auth.md](persistence-and-auth.md) — **Phase 4: demote the localStorage dual-write**. Building a trips list properly means reading trips from the backend via a real list endpoint, which makes the Linode Postgres row the single source of truth. The two pieces of work reinforce each other, so they ship together.

Downstream, "My Trips" is also where the teased **Strava sync** eventually lands.

## Current state (verified 2026-06-16)

- **No list endpoint.** `backend-server.js` only has `GET /api/triplinks/:token` (single, by share_token). There is no "list trips for the logged-in user."
- **No frontend list method.** `api.ts` has `createTripLink`, `getTripLink`, `startTrip`, `completeTrip` — no `listMyTrips`.
- **Dual-write lives at** [CreateAdventure.tsx:208-211](../../src/pages/CreateAdventure.tsx#L208-L211): every save writes the API *and* appends to `localStorage['triplinks']`. `ActiveTrip.tsx` already prefers the backend and only falls back to localStorage (good — done in the v3 work).
- **Profile is section-based** (`<section className="profile-section">`), so a "Your trips" section or a dedicated `/trips` route both fit the existing shell.
- `triplinks` table has `user_id`, `status`, `share_token`, `created_at`, `started_at`, `expected_return_time`, `data` (JSONB), `overdue_since`, `last_check_in`.

## Decisions to lock before building

1. **Dedicated `/trips` route vs a Profile section.** → **Dedicated `/trips` page**, with a "Your trips" preview (most recent 3) on Profile linking to it. Trips deserve their own surface and it's where Strava will hang off later.
2. **Auth model for the list.** → `requireAuth`; `user_id` from session. A user only ever sees their own trips. (Individual trip *viewing* by watchers stays capability-based via share_token — unchanged.)
3. **localStorage demotion, not deletion.** → Keep it as an **offline-read fallback only**; stop treating it as a write target of record. The API write is authoritative; the localStorage write becomes a best-effort cache refreshed from server responses.

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Backend: `GET /api/triplinks` (list mine) | ✅ shipped |
| 2 | Frontend: `api.listMyTrips()` + `/trips` page | ✅ shipped |
| 3 | Profile "Your trips" preview + completion-screen CTA retarget | ✅ shipped |
| 4 | Demote localStorage dual-write to offline fallback | ✅ shipped |
| 5 | Stale-session hygiene + e2e verify | ✅ shipped |

---

### Phase 1 — Backend list endpoint

`GET /api/triplinks` (note: no `:token`) — **must be registered before** `GET /api/triplinks/:token` or Express will treat a bare GET oddly; in practice they don't collide (one has a param, one doesn't) but keep the list route declared adjacent for clarity.

- `requireAuth`; `user_id` from `req.user`.
- Returns a **lightweight projection**, not full JSONB blobs — the list view doesn't need route geometry:
  ```sql
  SELECT id, share_token, status, created_at, started_at,
         expected_return_time, overdue_since, last_check_in,
         data->>'title'         AS title,
         data->>'activityType'  AS activity_type,
         data->'location'->>'name' AS location_name,
         jsonb_array_length(COALESCE(data->'emergencyContacts','[]'::jsonb)) AS watcher_count
  FROM triplinks
  WHERE user_id = $1
  ORDER BY
    CASE status WHEN 'overdue' THEN 0 WHEN 'active' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
    created_at DESC
  ```
  (overdue + active surface first; completed/old sink.)
- Optional `?status=active` filter for future use; default returns all.
- Response shape: `{ trips: [...] }`.

### Phase 2 — Frontend list + `/trips` page

- `api.listMyTrips(sessionToken): Promise<TripSummary[]>` in `api.ts`. New `TripSummary` type (the projection above).
- New page `src/pages/MyTrips.tsx`, route `/trips` (add to `App.tsx`).
- Sections by status with a small count: **Needs attention** (overdue), **Active now**, **Planned**, **Completed**.
- Each row: title, activity pill, location, relative time, status badge, watcher count. Tap → for active/overdue go to `/my-trip/:id?token=…` (creator view); for planned go to the resume/share view; for completed go to a read-only summary.
- Empty state: "No trips yet — plan your first" → `/create`.
- Reuse existing tokens/classes (`activity-pill`, `create-*`, the status colours already used on ActiveTrip) — do not invent a new visual language. Run `/polish` after.

### Phase 3 — Profile preview + CTA retarget

- Add a "Your trips" `profile-section` showing the 3 most recent (`listMyTrips` sliced), each a compact row, with a "See all trips →" link to `/trips`.
- Retarget the completion screen CTA in [ActiveTrip.tsx](../../src/pages/ActiveTrip.tsx): **"View my account" → "View my trips"** pointing at `/trips` (closes this plan's founding dangling link). Keep "Plan another trip" → `/create`.

### Phase 4 — Demote the dual-write

- In [CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx#L208-L211): stop treating localStorage as a write of record. Options:
  - Keep a best-effort `localStorage` cache write wrapped in try/catch, clearly commented as offline-read fallback only; OR
  - Remove the write entirely and let `/trips` + `ActiveTrip` be backend-only, with localStorage used solely by the existing ActiveTrip offline fallback.
- **Recommended**: keep a thin cache write but rename/comment it as cache, and make the list page read backend-first with the cache only on fetch failure (mirror the pattern already in ActiveTrip v3).
- Goal: the backend row is the single source of truth; localStorage can never *disagree* in a way that misleads.

### Phase 5 — Stale-session hygiene + e2e verify

- On any `401` from an authed call (`listMyTrips`, etc.), clear the stored session in `useAuth` and redirect to `/login` — currently a stale token can wedge the UI. (This was already noted as a Phase 4 gap in persistence-and-auth.md.)
- E2E verify the loop on prod: create → appears in `/trips` as Planned → start → moves to Active + watcher email fires → complete → moves to Completed. Confirm `PublicAdventureView` (watcher view) still renders the DB-backed fetch.

## Out of scope (deliberate)

- **Strava sync** — separate long-horizon plan; `/trips` is the surface it will attach to.
- **Editing a TripLink after creation** — no edit flow yet; this plan is read + lifecycle only.
- **Deleting trips** — could add a soft-delete later; not now.
- **Watcher-side "trips I'm watching" list** — would need recipient accounts; out of scope (watchers are capability-link based today).
- **Capability-endpoint hardening** (rate-limit `/start`/`/checkin`/`/complete`, idempotent transitions) — the other open security item; slot it *after* this plan, not within it.

## Definition of done

- A logged-in user can see all their trips at `/trips`, grouped by status, overdue first.
- The completion screen routes there.
- The backend is the source of truth; localStorage is demoted to an offline-read cache that can't mislead.
- A stale session no longer wedges the UI.
- The full create→start→notify→complete loop verified on prod, with the watcher view confirmed.

---

## What shipped (2026-06-16)

- **Phase 1** — `GET /api/triplinks` ([backend-server.js](../../backend-server.js)). `requireAuth`, `user_id` from session, lightweight projection (title/activity/location/watcherCount, no route geometry), ordered overdue→active→planned→completed then `created_at DESC`. Optional `?status=` filter. Smoke-tested: 401 without auth, full projection with auth.
- **Phase 2** — `api.listMyTrips()` + new `TripSummary`/`TripStatus` types + an `ApiError` class carrying HTTP status ([api.ts](../../src/config/api.ts)). New page [MyTrips.tsx](../../src/pages/MyTrips.tsx) at `/trips` (registered in [App.tsx](../../src/App.tsx)), grouped sections (Needs attention / Active now / Planned / Completed), empty state → `/create`. Shared row component [TripRow.tsx](../../src/components/trips/TripRow.tsx) (status pill, activity icon, location, watcher count, relative time).
- **Phase 3** — "Your trips" preview section on [Profile.tsx](../../src/pages/Profile.tsx) (3 most recent + "See all" → `/trips`), reusing `TripRow`. Completion-screen CTA in [ActiveTrip.tsx](../../src/pages/ActiveTrip.tsx) retargeted "View my account" → **"View my trips"** → `/trips`.
- **Phase 4** — `cacheTripLinkOffline()` helper in [CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx): bounded (20 most recent), deduped by id, non-throwing (swallows quota/private-mode). Written *after* the authoritative API call so the cache can never contradict the server. ActiveTrip already reads it backend-first (from the v3 work).
- **Phase 5** — confirmed already covered: useAuth's on-mount `getMe` failure path calls `clearSession()` + nulls state (stale token on app load); MyTrips calls `logout()` + redirects to `/login` on an in-session `401` (detected via `ApiError.status`). No new global interceptor needed.

**Deferred / next**: capability-endpoint hardening (rate-limit `/start`/`/checkin`/`/complete`, idempotent transitions) — the remaining open security item, intentionally kept out of this plan. Strava sync attaches to `/trips` later.

## Future enhancement — per-trip row actions (not yet built)

Each saved trip on `/trips` (and the Profile preview) should grow inline actions. Down the road, not now:

- **Share** — re-surface the watcher share link / recipient picker for an existing trip (today you can only share at create time). Lets a user add a watcher after the fact or resend the link.
- **Delete** — soft-delete a trip (needs a `deleted_at` column + a `DELETE /api/triplinks/:id` owner-guarded endpoint; the list query filters out soft-deleted rows). Confirm-modal before destroying.
- **Add to Strava** — push a completed trip's route/summary to the user's Strava account. Depends on the larger Strava OAuth integration; this button is the entry point. Only meaningful for `completed` trips with route geometry.

UI shape: a small overflow/kebab menu on each `TripRow`, or a row of icon buttons revealed on the trip's own detail view. Keep it out of the way — the list's job is scanning status at a glance, not managing each trip. Likely pairs with building a proper read-only **trip detail page** for completed trips (currently completed trips reuse the ActiveTrip completed layout).
