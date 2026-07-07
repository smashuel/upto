---
type: project
status: in-progress
tags: [roadmap, planning, sequencing]
---

# Roadmap

**This file answers: what do we do next, and why in that order.** Sequenced 2026-07-03
(grilling session). Detail on any item lives in [features/](../features/) and
[plans/](../plans/); history lives in the compressed [Shipped](#shipped-highlights)
section at the bottom. If this file and the repo disagree, this file is broken — fix it.

> **Direction ([ADR 010](../decisions/010-product-direction-safety-first-social-leash.md),
> reconfirmed 2026-07-03):** safety-first, social-curious. Macro order:
> **(1) harden the safety core → (2) live GPS → (3) social invite/accept/join.**
> The full Anti-Strava network is rejected; a "squad feed" is parked for its own session.

**Safety core** is defined in [CONTEXT.md](../../CONTEXT.md): the stored plan is
*truthful*, watchers see that same truth, and an overdue trip *actually reaches a human*.

---

## Now — Phase 1: harden the safety core

**Exit criterion (agreed 2026-07-03):** truthful trip data (terrain stream complete) **+**
a real human provably receives an overdue email in production **+** the watcher view
verified end-to-end **+** the leaked DB password rotated. Check-in reminders and GuidePace
are deliberately *not* in this gate — they're growth, not hardening (see Fast-follows).

Two parallel lanes, then a capstone:

**Ops lane — start immediately (user-driven, independent of code):**
- [ ] **Alerts go live** — verify `upto.world` in Resend (DNS set, pending), then run one
      throwaway prod trip past `expected_return_time` and confirm the overdue email lands
      in a real inbox. Transport is already shipped ([features/notification-transport.md](../features/notification-transport.md)).
- [ ] **Rotate the Linode DB password** — the old value is in git history
      (follow-up from [ADR 009](../decisions/009-native-auth-capability-share-tokens.md)). ~15 min.

**Dev lane — terrain-accurate picking: DONE, all 5 slices shipped.** Depth picking +
draw-time sampling (`0834976`), finish-settlement
([journal 07-02](../journal/2026-07-02-finish-settlement-race.md)), settle-window
hardening + route upsert ([journal 07-03a](../journal/2026-07-03-settle-window-hardening.md),
[ADR 014](../decisions/014-settle-window-is-a-real-state.md)), waypoint elevation
backfill ([journal 07-03b](../journal/2026-07-03-waypoint-elevation-backfill.md)),
honest degradation when terrain is unavailable
([journal 07-03c](../journal/2026-07-03-honest-degradation.md)). Nothing left in
this lane — the dev lane is now idle until the capstone walkthrough below.

**Capstone = phase sign-off:**
- [ ] **One full end-to-end walkthrough** — create → draw/edit route → share →
      PublicAdventureView renders the truth → start (watchers notified) → check-in →
      overdue → email received → complete. This closes the long-standing
      "PublicAdventureView not E2E verified" item and doubles as the phase-1 exit test.

---

## Bridge — before phase 2 map work starts

- [x] **npm Cesium + official TS types** — bundled from npm via `vite-plugin-cesium`,
      CDN gone, `window.Cesium` global removed, `@types/cesium` dropped for the package's
      own bundled types ([ADR 015](../decisions/015-cesium-npm-bundled-not-cdn.md),
      shipped 2026-07-04). Real types now flow and immediately caught three latent bugs.
      **Remaining:** the map stack still carries file-level `eslint-disable no-explicit-any`
      because typing `CesiumManager.viewer` cascades into subclasses — a tracked de-any
      follow-up ([issue 04](../../.scratch/npm-cesium-typed/issues/04-de-any-map-stack.md)),
      not a phase-2 blocker.

---

## Next — Phase 2: live GPS ([ADR 010](../decisions/010-product-direction-safety-first-social-leash.md) / [ADR 011](../decisions/011-capacitor-mobile-shell.md))

Stream the traveller's *current* position to watchers on the TripLink map. Framed as
safety, not social. **Kickoff done (2026-07-05):** [plans/live-location.md](../plans/live-location.md)
written; Stage 1 PRD ([.scratch/live-location/PRD.md](../../.scratch/live-location/PRD.md))
written + grilled. Next: cut implementation issues, build slice 1. The shape below (agreed
2026-07-03):

- [ ] **Stage 1 — web foreground pipeline, SHIPPABLE** — geolocation → SSE position
      channel → live marker. Ships to users as honest *"live while the traveller has the
      page open"* (real value on day walks; real users validate the plumbing before
      Capacitor money is spent). **The per-trip privacy model (with-trip / owner-only /
      off) is designed in stage 1** — watchers see positions from day one.
      Natural rider: persist the chosen basemap (+ camera framing) on the TripLink so the
      live marker renders on the planner's canvas — the unshipped half of
      [features/triplink-route-persistence.md](../features/triplink-route-persistence.md).
- [ ] **Stage 2 — Capacitor shell** — reliable iOS background location + push.
      Battery-aware sampling lands here, where backgrounding makes it acute.
      (The old "Capacitor vs React Native eval" is resolved: Capacitor, per ADR 011.)

**Fast-follow lane (interleave during phase 2 — wizard/backend work, no collision with
GPS map work):**
- [ ] **Wire GuidePace into TripDetailsStep** — calculator + UI components long shipped;
      the terrain stream exists so these estimates are grounded in true ascent.
- [ ] **Check-in reminder schedule** — nudge the traveller *before*
      `expected_return_time`; completes the loop plan → estimate → nudge → escalate.

---

## Later — Phase 3: social invite/accept/join

Invite contacts to accept or join a trip, replacing the pre-mission group chat.
Plan exists as a draft — [plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md) —
**kickoff act: grill that draft.** Nothing pulls forward; phase 1's contacts/auth work
already laid its foundations. (Private recap card survives from the rejected squad
vision; squad feed still parked for its own session.)

---

## Opportunistic (grab when blocked — small, no sequencing weight)

- [ ] NoteModal wiring — replace `window.prompt()` in `NoteManager`
- [ ] Note-mode shouldn't drop an in-progress route (auto-finish on mode switch)
- [ ] Re-integrate `AdventureScheduleStep` into the wizard
- [ ] Location-step tidy — collapse stacked cards ([features/location-step-tidy.md](../features/location-step-tidy.md))
- [ ] `requestRenderMode` sanity check on a real device (failure mode invisible to tsc/lint)

## Parked (deliberately not now — each needs its own project/plan when picked up)

- **Valhalla + Meili routing** — real OSM snapping, replaces DOC-only ad-hoc snap
- **PWA offline** — shell + pre-downloaded region tile cache (merged: old "PWA shell",
  "offline tile cache", "offline map caching" items were one project in three lines)
- **Strava sync** — teased on the completion screen; `/trips` is the attach surface
- **SAR-friendly overdue summary** — printable/shareable escalation packet
- **Audit trail on lifecycle transitions** — low priority, from ADR 009
- **Map future phases** — waypoint insertion mid-route, CalTopo-style slope overlay
  (`GroundPrimitive`), surface-type indicators, GPX *import* (export exists)
- **Data expansion** — other AU state topos (VIC/QLD/TAS/WA/SA — `AusMapService` is
  ready for BOUNDS/URL/ATTRIBUTION triplets), TrailForks, Hiking Project, MapTiler

---

## Shipped highlights

One line per area — detail in the linked files.

- **TripLink product surface** — 5-step wizard, My Trips, lifecycle (`/start`/`/checkin`/`/complete`) + SSE + 60s overdue sweep, completion screen, RecipientPicker with Emergency Circle. [features/triplink-wizard.md](../features/triplink-wizard.md), [plans/my-trips-and-persistence-tieup.md](../plans/my-trips-and-persistence-tieup.md)
- **Persistence & auth** — Linode Postgres (single source of truth; localStorage demoted to offline-read cache), scrypt auth + sessions, Google OAuth, contacts CRUD, capability-token endpoints hardened. [plans/persistence-and-auth.md](../plans/persistence-and-auth.md), [ADR 009](../decisions/009-native-auth-capability-share-tokens.md)
- **Notification transport** — email-first (Resend) with Twilio SMS scaffolded off; start + overdue notices; stub-mode when creds unset. [features/notification-transport.md](../features/notification-transport.md)
- **Map core** — Cesium 3D globe, 2D↔3D toggle, LINZ Topo50 + AU basemaps with viewport auto-switch, waypoints, route drawing with live stats + elevation profile, trail snapping, trail discovery layer, notes, flyover, fullscreen, device-tier performance, `requestRenderMode`. [features/3d-map.md](../features/3d-map.md), [plans/map-ux-overhaul.md](../plans/map-ux-overhaul.md) (all 5 phases), [plans/compass_artifact.md](../plans/compass_artifact.md)
- **Terrain truth (Stream 1, phase-1 core) — DONE, all 5 slices shipped** — depth-buffer picking, draw-time sampling, finish/edit settlement, settle-window hardening, wizard route upsert, waypoint elevation backfill, honest degradation (elevation absent-not-zero + dismissible notice) when terrain is unavailable; route + check-in pin render read-only on view pages. [ADR 014](../decisions/014-settle-window-is-a-real-state.md), journals [06-17](../journal/2026-06-17-map-runthrough-issues.md) / [07-02](../journal/2026-07-02-finish-settlement-race.md) / [07-03a](../journal/2026-07-03-settle-window-hardening.md) / [07-03b](../journal/2026-07-03-waypoint-elevation-backfill.md) / [07-03c](../journal/2026-07-03-honest-degradation.md)
- **Data integrations** — DOC (tracks/huts/campsites cached, alerts never cached, weekly sync), bbox trail query, OSM Overpass, Nominatim, what3words. [features/doc-integration.md](../features/doc-integration.md)
- **GuidePace** — Munter/Chauvin/Technical calculators + UI components built (wiring is in the Fast-follow lane). [features/guidepace.md](../features/guidepace.md)
- **Test harness** — Vitest + fake `window.Cesium`, map services tested at the public boundary. [ADR 013](../decisions/013-vitest-alongside-node-test.md)
- **Deployment** — Vercel frontend (`upto.world`) + Linode Express/PM2/Nginx backend; `/build-check`, `/deploy`, `/check-backend` skills. [project/deployment.md](deployment.md)
- ~~**Squad social vision**~~ — **rejected** ([ADR 010](../decisions/010-product-direction-safety-first-social-leash.md)); survivors noted in phases 2–3.

---

## How to use this file

- Work top-down: the first unticked box in the highest active section is the default next task.
- A phase's exit criterion is the *only* thing that closes it — don't slide new items into a phase; new safety-adjacent ideas go to Fast-follows, Opportunistic, or Parked.
- When shipping: tick here, update [status.md](status.md), and move detail to features/plans.
- When a Parked item is picked up, its first act is a plan file + grilling, not code.
