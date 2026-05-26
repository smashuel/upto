---
type: project
status: in-progress
tags: [status, current]
---

# Status — 2026-05-04

Always-true snapshot of the project. Bump this whenever a phase ships or priorities shift.

## Current focus

**Persistence + auth — Phase 3 next: email transport for overdue alerts.** Phases 1 (security hardening, DB password rotated) and 2 (account-level emergency contacts) are shipped. Phase 3 picks a transport (Resend vs SES) and hooks it into the existing 60s overdue checker so a human actually gets notified when a trip goes overdue. After Phase 3 the safety story is complete end-to-end. See [plans/persistence-and-auth.md](../plans/persistence-and-auth.md).

## Recent shipped (last ~30 days)

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
3. **Overdue → no human** — DB flips `status = 'overdue'` and SSE broadcasts, but there's no email/SMS transport yet. Phase 3.
4. **GuidePace not wired** — calculator + UI both exist; just needs integration in `TripDetailsStep`.
5. **NoteManager still uses `window.prompt()`** — broken on mobile. NoteModal scaffolded but not wired.
6. **`CreateAdventure.tsx` writes to both API and localStorage on every save** — the two paths will drift. Demote localStorage to offline-write fallback (Phase 4).

## Environment health

- **Frontend**: `upto.world` + `upto-six.vercel.app`, deploys on push to `main`
- **Backend**: Linode `172.105.178.48`, PM2-managed Express, Nginx proxy on port 80
- **DOC cache**: auto-syncs Monday 3 AM; 7-day TTL; run `node doc-sync.js` to refresh manually
- **Test suite**: none (no framework set up — rely on `tsc --noEmit` + `npm run lint` via `/build-check`)

## Uncommitted state on `main` (as of this writing)

Several files have local edits (see `git status`). Don't assume `main` HEAD reflects what's live in the editor — read the diff before acting.
