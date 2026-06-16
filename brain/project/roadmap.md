---
type: project
status: in-progress
tags: [roadmap, planning]
---

# Roadmap

Snapshot of what's **shipped**, **in-progress**, and **planned** across the Upto scaffold. Keep this honest — move items through the statuses as they land. See individual files in [features/](../features/) and [plans/](../plans/) for detail.

## Shipped (in `main`, working)

### Product surface
- [x] **TripLink creation wizard** — 5-step form: overview → location → details → contacts → review. See [features/triplink-wizard.md](../features/triplink-wizard.md)
- [x] **Landing + routing** — Home, CreateAdventure, ViewAdventure, PublicAdventureView, Profile, ActiveTrip, Login, 404
- [x] **Linode Postgres persistence** — `users`, `contacts`, `triplinks` (JSONB), `check_ins` tables. Idempotent `initDB()`. TripLinks save via `api.createTripLink` (localStorage kept as offline fallback — pending demotion)
- [x] **Native auth** — scrypt password hashing + session tokens, `requireAuth` middleware. `POST /api/auth/{register,login,logout}` + `GET /api/auth/me`. Session persisted in localStorage via [useAuth.ts](../../src/hooks/useAuth.ts)
- [x] **Google OAuth** — redirect + callback find-or-create flow
- [x] **Contacts CRUD** — all four endpoints protected, wired to [Profile.tsx](../../src/pages/Profile.tsx)
- [x] **TripLink lifecycle + SSE** — `/start`, `/checkin`, `/complete` endpoints; real-time SSE stream with 25s heartbeat broadcasts `status`/`checkin`/`overdue`
- [x] **Overdue checker** — 60s interval, 15-minute grace past `expected_return_time`, flips status and broadcasts

### Map (Cesium)
- [x] **3D globe with satellite + terrain** — Cesium Ion (Sentinel-2 + world terrain), WebGL v1.132
- [x] **2D ↔ 3D toggle** — `morphTo2D/3D`, persisted to `upto_scene_mode`. Wizard defaults to 2D topo. See [features/3d-map.md](../features/3d-map.md)
- [x] **LINZ Topo50 overlay** — NZ-only, backend-proxied tiles, CC BY 4.0 attribution. See [features/linz-topo.md](../features/linz-topo.md)
- [x] **AU basemap toggle** — GA National (AU-wide) + NSW Topo (1:25k–1:100k); key-less ArcGIS tiles, no proxy; viewport auto-switch with durable user override. See [features/basemap-toggle.md](../features/basemap-toggle.md)
- [x] **Sat/Topo toggle** — grouped thumbs popover (NZ / AU), persisted to `upto_map_layer`
- [x] **Cesium manager base class** — each manager owns its own `ScreenSpaceEventHandler` to avoid click-handler collisions
- [x] **Waypoint placement** — click-to-place typed markers (bed, flag, mountain, triangle). See [features/waypoints.md](../features/waypoints.md)
- [x] **Route drawing** — click points, live preview, undo/redo, double-click to finish. Stats: distance, ascent/descent, time. See [features/trail-drawing.md](../features/trail-drawing.md)
- [x] **Trail snapping** — route points snap to nearby DOC/OSM tracks when snap toggle enabled
- [x] **Trail discovery layer** — nearby DOC tracks render in viewport, dashed brown polylines, click to highlight. See [features/trail-discovery-layer.md](../features/trail-discovery-layer.md)
- [x] **Map notes** — click-to-place notes on map (still uses `window.prompt()` → planned NoteModal). See [features/map-notes.md](../features/map-notes.md)
- [x] **Route flyover** — animated chase-cam along finished route, HermitePolynomial smoothing. See [features/route-flyover.md](../features/route-flyover.md)
- [x] **Fullscreen map mode** — Maximize button on the map header, Fullscreen API with CSS overlay fallback. See [features/map-fullscreen.md](../features/map-fullscreen.md)

### Map UX overhaul (plans/map-ux-overhaul.md)
- [x] **Phase 1** — route line glow, smooth camera transitions, loading indicator, upgraded elevation chart
- [x] **Phase 2** — controls moved from header to floating overlays, NoteModal (partial — still needs wiring), mobile breakpoints
- [x] **Phase 3** — interactive elevation profile ↔ map sync, redo stack, waypoint icon billboards
- [x] **Phase 4** — drag-to-reroute edit mode, steepness-gradient route line
- [x] **Phase 5** — trail discovery dashed styling, layers popover with opacity slider, route flyover
- [x] **Topo resolution fix** — `maximumLevel: 19`, `maximumScreenSpaceError: 1.333`, MSAA 4× (Phase 5 side-quest)

### Data integrations
- [x] **DOC API integration** — ~3,200 tracks, ~890 huts, ~1,850 campsites cached as JSON; live alerts never cached. See [features/doc-integration.md](../features/doc-integration.md)
- [x] **Weekly DOC sync** — NZTM2000 → WGS84 conversion, cron Monday 3 AM
- [x] **Bbox trail query** — `/api/trails/bbox` serves viewport-limited tracks for discovery layer
- [x] **OSM Overpass trail search** — global fallback outside NZ. See [features/global-trails.md](../features/global-trails.md)
- [x] **Nominatim geocoding** — auto-extracts location from trip title, rate-limited 1 req/sec
- [x] **What3words integration** — 3m×3m precision for parking / primary / emergency-exit points. See [features/what3words.md](../features/what3words.md)

### GuidePace time estimation
- [x] **Calculator logic** — Munter Method, Chauvin System, Technical System implemented in `TimeCalculator.ts`
- [x] **GuidePace UI components** — estimator, pace-factor controls, route breakdown, time-estimate summary. See [features/guidepace.md](../features/guidepace.md)
- [ ] **Wizard wiring** — components exist but aren't yet called from `TripDetailsStep`

### Deployment
- [x] **Vercel frontend** — `upto.world` + `upto-six.vercel.app`, `/api/*` proxied via `vercel.json` rewrite to Linode
- [x] **Linode backend** — Express + PM2 + Nginx on `172.105.178.48`. See [project/deployment.md](deployment.md)
- [x] **Skills scaffolded** — `/build-check`, `/check-backend`, `/deploy`, `/review-map`, `/map-ux`

---

## In progress

- **Persistence + auth hardening** — DB + auth shipped, now closing four gaps: (1) plaintext DB password in source, (2) unprotected TripLink mutating endpoints, (3) account-level emergency contact linkage, (4) email transport for overdue alerts. See [plans/persistence-and-auth.md](../plans/persistence-and-auth.md). Unblocks social sharing once Phase 2 lands.

---

## Planned (scoped, not started)

### Persistence + accounts (hardening — see [plans/persistence-and-auth.md](../plans/persistence-and-auth.md))
- [x] **Remove plaintext DB password** — `DATABASE_URL` now required; throws on startup if missing. See [decisions/009-native-auth-capability-share-tokens.md](../decisions/009-native-auth-capability-share-tokens.md). **Follow-up**: rotate the Linode DB password since the old value is in git history.
- [x] **Protect `POST /api/triplinks`** — `requireAuth` + ownership check; `user_id` derived from session. `/start`/`/checkin`/`/complete` deliberately stay capability-guarded by share_token (traveller may hand URL to a partner). See the ADR for rationale.
- [ ] **Harden capability endpoints** — rate-limit `/start`/`/checkin`/`/complete` per share_token; idempotent transitions; never log share_tokens
- [x] **Account-level emergency contacts** — `is_emergency` flag on `contacts`, Shield toggle on Profile, wizard auto-populates from emergency circle with per-trip opt-out + Edit-on-Profile link. TripLink keeps embedding the snapshot at save time (audit-trail-friendly). See [features/emergency-contacts-account-level.md](../features/emergency-contacts-account-level.md)
- [ ] **Route persisted on TripLink** — serialise `SerializableTrack` + basemap into TripLink JSONB `data` at save time; rehydrate on view pages. See [features/triplink-route-persistence.md](../features/triplink-route-persistence.md)
- [ ] **Demote dual-write to fallback** — `CreateAdventure.tsx` currently writes both API and localStorage on every save; demote localStorage to offline-queue-only
- [ ] **Social TripLink sharing** — invite contacts/favourites to accept or join a trip, replacing the group-chat-before-every-mission friction. Multi-phase plan with competitor research + schema design. See [plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md)
- [ ] **Squad social vision (low priority — long-horizon)** — full "Anti-Strava" spec captured: network-effect positioning, squad feed, post-mission recap, quiet streaks, live GPS, PWA. Not the next phase; revisit after persistence Phase 3 (email transport). See [features/squad-social-vision.md](../features/squad-social-vision.md)

### Safety system (delivery layer)
- [x] **Notification transport (email-first, SMS-ready)** — [notifications.js](../../notifications.js) with two adapters (Resend + Twilio), per-contact channel picker, `notifyTripStart` on `/start`, `notifyTripOverdue` on the 60s overdue transition. Both adapters stub when their creds are unset; flipping providers on later is pure ops. See [features/notification-transport.md](../features/notification-transport.md). **To go live**: verify `upto.world` in Resend (DNS set, pending verification); `RESEND_API_KEY` already deployed to Linode.
- [x] **RecipientPicker + Start confirmation** — post-create success screen shows Emergency Circle (pre-checked), Favourites, Others, ad-hoc contacts. Start button reads "Notify N watchers". Toast confirms "Notified N watchers (S SMS, E email)" or shows skip/failure. Confirm-modal prevents silent zero-watcher starts. ActiveTrip Watchers panel shows who was told. See [journal/2026-06-05-recipient-picker-redesign.md](../journal/2026-06-05-recipient-picker-redesign.md).
- [x] **Trip completion success screen** — full-page "Trip complete — glad you're back safely." with trip title, duration, watcher note, View account + Plan another trip CTAs. Strava sync teased.
- [ ] **My Trips page** — in-app list of active/past TripLinks per account. Completion screen CTAs link to `/profile` for now. Phase 4 priority.
- [ ] **Strava sync** — OAuth + Strava API. Teased on completion screen. Long-horizon backlog.
- [ ] **Check-in reminder schedule** — cron to nudge the traveller before `expected_return_time` (separate from overdue)
- [ ] **Public shared adventure view — E2E verify** — `GET /api/triplinks/:shareToken` works; [PublicAdventureView.tsx](../../src/pages/PublicAdventureView.tsx) not confirmed end-to-end
- [ ] **SAR-friendly overdue summary** — eventually surface a printable/shareable escalation packet

### Wizard polish
- [ ] **Wire GuidePace into TripDetailsStep** — components + calculator already shipped
- [ ] **Re-integrate AdventureScheduleStep** — currently pulled out of wizard
- [ ] **NoteModal wiring** — replace `window.prompt()` in `NoteManager.onRequestNote`
- [ ] **Tidy under-map clutter in Location step** — collapse stacked `LocationDisplay` cards, drop the what3words explainer paragraph. See [features/location-step-tidy.md](../features/location-step-tidy.md)

### Map UX — future phases (not in current plan)
- [ ] **Waypoint insertion mid-route** — depends on drag-to-reroute (shipped)
- [ ] **Slope analysis overlay** — CalTopo-style `GroundPrimitive`
- [ ] **Surface type indicators** — Komoot-style; requires backend OSM surface tags
- [ ] **GPX import**
- [ ] **Offline map caching** — Gaia GPS-style

### Data expansion
- [ ] **Other AU state topos** — VIC, QLD, TAS, WA, SA. `AusMapService` structure is ready — each state is a BOUNDS / URL / ATTRIBUTION triplet plus a branch in `resolveBasemap` / `applyBasemap`
- [ ] **TrailForks integration** — MTB/hiking trail data; needs API credentials
- [ ] **Hiking Project integration** — US-only; needs API credentials
- [ ] **MapTiler fallback** — env var placeholder exists

### Mobile
- [ ] **PWA shell** — offline-first plan review, cached recent TripLinks
- [ ] **Native app eval** — Capacitor vs React Native (post-persistence)

---

## How to use this file

- Before starting work, read this top-to-bottom so you know what's in motion.
- When shipping, check the box and update [project/status.md](status.md).
- When proposing new work, add a `status: draft` or `status: planned` file under [features/](../features/) or [plans/](../plans/) and link it from here.
