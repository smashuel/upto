---
type: project
status: in-progress
tags: [status, current]
---

# Status — 2026-06-29

Always-true snapshot of the project. Bump this whenever a phase ships or priorities shift.

## Direction (set 2026-06-29 — see [ADR 010](../decisions/010-product-direction-safety-first-social-leash.md))

Upto is **safety-first, social-curious**. Committed sequence, one set of hands:
1. **Harden the safety core** ← *current focus*
2. **Live GPS** (next major bet, framed as safety, via a Capacitor shell — [ADR 011](../decisions/011-capacitor-mobile-shell.md))
3. **Social invite/accept/join** ([social-triplink-sharing.md](../plans/social-triplink-sharing.md))

Rejected/parked: the full Anti-Strava social network (feed, streaks, leaderboards). The
"squad feed" idea is parked for its own design session. See ADR 010.

## Current focus

**Harden the safety core** before any new bets. Capability-endpoint hardening already
shipped (2026-06-18, see [decisions/009-native-auth-capability-share-tokens.md](../decisions/009-native-auth-capability-share-tokens.md)). What's left to make the existing safety promise solid:

- **Terrain-accurate picking — DONE, all 5 slices shipped 2026-07-02–03.** `pickEllipsoid` → `scene.pickPosition` / `sampleTerrainMostDetailed` (commit `0834976`); finish/edit-commit settle heights before emit ([journal 07-02](../journal/2026-07-02-finish-settlement-race.md)); settle window hardened + wizard route-upsert ([journal 07-03a](../journal/2026-07-03-settle-window-hardening.md) / [ADR 014](../decisions/014-settle-window-is-a-real-state.md)); waypoint elevation backfill ([journal 07-03b](../journal/2026-07-03-waypoint-elevation-backfill.md)); **honest degradation when terrain is unavailable** (2026-07-03 — elevation absent-not-zero end to end: serialized route/waypoint, stats/profile chart, GPX export, plus a dismissible on-map notice; see [journal 07-03c](../journal/2026-07-03-honest-degradation.md)). Stream 1 closed — see [.scratch/terrain-accurate-picking/](../../.scratch/terrain-accurate-picking/PRD.md) for the full slice history.
- **Verify overdue→email escalation end-to-end** in prod.
- **Close danglers** — GuidePace wiring into `TripDetailsStep`, NoteModal, route persistence on view pages.

Escalation stays **email-only for now** (Twilio SMS scaffolded but off) — so don't make
hard safety guarantees in marketing yet (ADR 010).

**Just shipped (2026-06-16): My Trips + Persistence Phase 4.** `/trips` page lists trips grouped by status (new `GET /api/triplinks` endpoint); Profile preview; completion CTA retargeted; localStorage demoted to a bounded offline-read cache; stale-session 401 signs out. Backend is now the single source of truth. See [plans/my-trips-and-persistence-tieup.md](../plans/my-trips-and-persistence-tieup.md).

**Done and live:** notification transport is fully shipped and **email is verified on Resend** — real personalised emails go out on Start. Twilio remains scaffolded — set `TWILIO_*` to add SMS, no code change.

## Recent shipped (last ~30 days)

- **npm Cesium + real TS types (bridge task)** (2026-07-04) — Cesium bundled from the npm `cesium` package (`~1.133.0`) via `vite-plugin-cesium`; CDN `<script>`/`<link>` gone, `window.Cesium` global removed, `@types/cesium` dropped for the package's own bundled types. All map code now `import * as Cesium from 'cesium'`; the ADR-013 test seam moved to `vi.mock('cesium', …)`. Real types immediately caught three latent bugs (`OpenStreetMapImageryProvider.fromUrl`, null `Viewer` container). Shipped in 3 green-throughout slices (`0ad6aab`/`a10ef2a`/`2733e3b`). **Remaining:** map stack still carries file-level `eslint-disable no-explicit-any` (typing `CesiumManager.viewer` cascades into subclasses) — tracked de-any follow-up ([.scratch/npm-cesium-typed/issues/04-de-any-map-stack.md](../../.scratch/npm-cesium-typed/issues/04-de-any-map-stack.md)). See [ADR 015](../decisions/015-cesium-npm-bundled-not-cdn.md).
- **Persistence Phase 3 v3 — RecipientPicker + visible Start confirmation** (2026-06-05) — Post-`/critique` redesign. Wizard's Emergency Contacts ExpandSection removed; new [RecipientPicker](../../src/components/forms/RecipientPicker.tsx) on the post-create success screen shows Emergency Circle (pre-checked) → Favourites → Other contacts → ad-hoc, with channel hints. `PATCH /start` now accepts contacts in body, dispatches synchronously, returns `{ notified, skipped }`. Toast confirms `"Notified N watchers (S SMS, E email)"`. ActiveTrip gained a Watchers panel showing who was notified. Confirm-modal blocks silent zero-watcher starts. See [features/notification-transport.md](../features/notification-transport.md) and [journal/2026-06-05-recipient-picker-redesign.md](../journal/2026-06-05-recipient-picker-redesign.md).
- **Persistence Phase 3 v2 — Resend email primary, Twilio scaffolded** (2026-05-27, second pass) — extended [notifications.js](../../notifications.js) with a Resend adapter alongside the existing Twilio one. New per-contact `dispatchToContact` picks SMS-when-Twilio-set, falls back to email, then SMS-stub. Both adapters stub cleanly without creds. Dispatchers now log `[notify] start trip=… → sms=N email=N stubbed=N failed=N skipped=N` summary. Wizard warning relaxed: shows only when a contact has *neither* phone nor email. `deploy.sh` adds `RESEND_API_KEY` + `RESEND_FROM` conditional pass-through. Gmail-send-as-user investigated and rejected (Google "restricted scope" verification overhead). See [features/notification-transport.md](../features/notification-transport.md).
- **Persistence Phase 3 v1 — SMS notification scaffold (Twilio, stub mode)** (2026-05-27, first pass) — initial `notifications.js` with `sendSms` + `notifyTripStart` + `notifyTripOverdue` hooked into `PATCH /start` and the 60s overdue checker as fire-and-forget. `isEmergency` snapshot added to embedded Contact type at wizard save time.
- **Vercel→Linode HTTPS proxy fix** (2026-05-27) — `vercel.json` had always proxied to `https://api.upto.world` but the Linode never had a port-443 listener. Every `deploy.sh` was overwriting any hand-added HTTPS config. Added a 443 server block to [nginx-config](../../nginx-config) using the existing Let's Encrypt cert. Google sign-in unblocked. See [journal/2026-05-27-https-on-linode.md](../journal/2026-05-27-https-on-linode.md).
- **Persistence hardening Phase 2 — account-level emergency contacts** (2026-05-04) — added `is_emergency BOOLEAN` column to `contacts` via idempotent `ALTER`. Shield toggle on Profile contact rows. Wizard step now auto-populates from the user's emergency circle with per-trip opt-out checkboxes + an Edit-on-Profile link; ad-hoc contacts remain as a "for this trip only" subsection. TripLink schema unchanged — `emergencyContacts` snapshot embedded at save-time for audit-trail integrity. Side-fix: contacts API was destructuring `isFavourite` (camelCase) while the frontend sent `is_favourite` — favourites never actually persisted via the API. Backend now reads both casings.
- **Fullscreen map mode** (2026-04-22) — `Maximize2` button at top-right of [TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx) using the Fullscreen API; `:fullscreen` CSS handles the resize, Cesium's internal `ResizeObserver` reflows the canvas. CSS-overlay fallback (`.map-viewport-fullscreen-fallback`) for browsers where the API rejects. Esc / browser exit gesture / button click all exit cleanly.
- **Persistence hardening Phase 1** (2026-04-22) — removed plaintext DB password fallback (required `DATABASE_URL` now throws on startup); added `requireAuth` + ownership check to `POST /api/triplinks` (`user_id` now derived from session, not body); wired `sessionToken` through `api.createTripLink` and [CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx) — unauthenticated submits redirect to `/login`. Decision captured in [decisions/009-native-auth-capability-share-tokens.md](../decisions/009-native-auth-capability-share-tokens.md).
- **Persistence + auth audit** (2026-04-22) — confirmed the DB, native scrypt auth, Google OAuth, contacts CRUD, TripLink lifecycle, SSE stream, and overdue checker are all already live on Linode. Rewrote [plans/persistence-and-auth.md](../plans/persistence-and-auth.md) from greenfield to hardening.
- **AU basemap toggle** (2026-04-21) — GA National (AU-wide) + NSW Topo (1:25k–1:100k) ArcGIS layers, key-less direct fetch (no backend proxy). Viewport-driven auto-switch with 500 ms debounce; durable override respects "panned out of region" by falling through to auto, resumes on return. Grouped thumbs UI (Satellite / NZ / AU). Silent localStorage migration `'topo'` → `'topo-linz'`.
- **Map UX overhaul Phase 6** (2026-04-21) — casing+core finished routes, lighter preview, tight `flyToRouteBounds` auto-zoom, opt-in Steepness overlay, thin solid green trail discovery line with casing+core selection, zoom-responsive polyline widths. Addresses "messy and pixelated" + "too far out" feedback.
- **Map UX overhaul Phase 1–5** (all phases complete in `main`)
  - Phase 4: drag-to-reroute edit mode, steepness-gradient route line
  - Phase 5: trail discovery dashed styling, layers popover with opacity slider, route flyover
- **Topo map resolution fix** — `maximumLevel: 19`, lower MSSE, MSAA 4×. Fixed blurry bottom-half of LINZ Topo50 view
- **Vercel → Linode proxy** — `/api/*` rewritten via `vercel.json` (commits `b82fbba`, `6e0ee9e`)
- **Dead `/api/adventures` endpoints removed** — standardised on `/api/triplinks` (commit `5b9dbcd`)

## Known gaps blocking the next level

1. **Rotate the Linode DB password** — the plaintext fallback is out of the source but the old password still lives in git history. SSH to Linode, `ALTER USER upto_user WITH PASSWORD ...`, update `DATABASE_URL` in PM2 env, `pm2 restart`.
2. **Harden capability endpoints** — `/start`, `/checkin`, `/complete` remain capability-guarded by share_token (see [decisions/009-native-auth-capability-share-tokens.md](../decisions/009-native-auth-capability-share-tokens.md) for why). To reduce griefing surface: add per-token rate limit (1 req/sec), make `/start` and `/complete` idempotent, never log `share_token`.
3. **No trips list page** — Profile page shows contacts CRUD only. Users have no in-app view of their past/active TripLinks. The completion success screen CTAs link to `/profile` for now. A "My Trips" page is Phase 4.
4. **Strava sync** — teased on completion screen as "coming soon". Long-horizon backlog — needs OAuth + Strava API integration. See [features/squad-social-vision.md](../features/squad-social-vision.md) for related social roadmap thinking.
5. **GuidePace not wired** — calculator + UI both exist; just needs integration in `TripDetailsStep`.
6. **NoteManager still uses `window.prompt()`** — broken on mobile. NoteModal scaffolded but not wired.
7. **`CreateAdventure.tsx` writes to both API and localStorage on every save** — the two paths will drift. Demote localStorage to offline-write fallback (Phase 4).
8. **Completion notification** — when a trip completes, watchers are not notified. Deliberately out of scope for now (avoid fatigue). Revisit when there's a "My Trips" page for watchers too.

## Environment health

- **Frontend**: `upto.world` + `upto-six.vercel.app`, deploys on push to `main`
- **Backend**: Linode `172.105.178.48`, PM2-managed Express, Nginx proxy on port 80
- **DOC cache**: auto-syncs Monday 3 AM; 7-day TTL; run `node doc-sync.js` to refresh manually
- **Test suite**: `npm test` — node:test lifecycle suites + Vitest service tests (TrackDrawer boundary tests against a fake `cesium` module via `vi.mock('cesium', …)`, see [ADR 013](../decisions/013-vitest-alongside-node-test.md)); plus `tsc --noEmit` + `npm run lint` via `/build-check`

## Uncommitted state on `main` (as of this writing)

Several files have local edits (see `git status`). Don't assume `main` HEAD reflects what's live in the editor — read the diff before acting.
