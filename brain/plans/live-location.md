---
type: plan
status: in-progress  # PRD written + grilled 2026-07-05; implementation not started
related: [.scratch/live-location/PRD.md, brain/features/triplink-route-persistence.md, src/utils/lifecycleReducer.ts, backend-server.js, src/pages/ActiveTrip.tsx, src/pages/PublicAdventureView.tsx]
tags: [live-gps, safety, phase-2, sse, privacy, battery]
---

# Live location — Phase 2 Stage 1 (web foreground pipeline)

Phase 2's kickoff act per [roadmap](../project/roadmap.md#L71). Stream the traveller's
*current* position to watchers, framed as safety, foreground-web only. Full spec +
grilling outcomes in [.scratch/live-location/PRD.md](../../.scratch/live-location/PRD.md);
this file is the durable plan (sequencing, seams, constraints).

## Shape (agreed 2026-07-03 roadmap, grilled 2026-07-05)

Web foreground pipeline: **`getCurrentPosition` timer → `POST /position` → SSE `position`
broadcast → live marker**, with a per-trip privacy toggle and honest liveness degradation.
Ships as honest *"live while the traveller has the page open"* — real value on day walks,
validates the whole pipeline before Stage 2 (Capacitor) spend. Bundles the unshipped
basemap half of [triplink-route-persistence.md](../features/triplink-route-persistence.md)
so the live marker renders on the planner's canvas.

## Seams (the tested boundaries — keep to these)

1. **`applyLifecycleEvent` + a `position` kind** — the one client funnel both views already
   use ([lifecycleReducer.ts](../../src/utils/lifecycleReducer.ts)). Sets `livePosition`,
   monotonic by timestamp, provably isolated from status/check-in/overdue. `node --test`.
2. **`shouldBroadcastPosition(liveSharing)`** — server privacy gate, defense in depth behind
   "enforce by not publishing". `node --test`.
3. **`describeLiveness(tripLink, now)` → `fresh | stale | not-shared | unavailable`** — the
   honest-degradation classifier, pure, local-clock, display-only. `node --test`.

Below the seams (manual-verify only, no harness added): geolocation timer + POST loop,
`sendBeacon`-on-hide, `EventSource` `onPosition` wiring, Cesium `liveMarker`, basemap
rehydrate.

## Cadence + battery constraint (grilled 2026-07-05 — carries into Stage 2)

**This runs on a phone.** Location services + radios are the biggest battery drain, and users
want their battery to last a multi-day trip. So the pipeline is deliberately coarse and the
device samples at the source rather than firehosing:

- **Sample ~3 min** via timed `getCurrentPosition` — **not** a continuous `watchPosition`
  (which fires every 1–3 s and drains battery). Coarse at the device.
- **Broadcast per sample (~3 min)** — in-memory SSE, cheap; watchers feel "live enough".
- **DB persist ~10 min** — coarse JSONB overwrite (last-known only, no breadcrumb history),
  newest kept in memory between writes. ~6 writes/hour/trip regardless of trip length.
- **fresh→stale ~10 min** (≈ 3 missed samples).

"Where were they in the last half hour" is the safety question, not second-by-second. All
four are single named, tunable constants. **Stage 2 (Capacitor background) inherits this
constraint hard** — battery-aware sampling is where backgrounding makes it acute; do not
raise the cadence just because native allows it.

## Privacy (default with-trip, mutable mid-trip)

`liveSharing: 'with-trip' | 'owner-only' | 'off'`, default `with-trip` (watchers see it from
day one). A **live toggle on ActiveTrip** (not a wizard field) — a runtime safety/privacy
choice. Enforced by *not publishing*: `off` = don't sample; `owner-only` = render locally,
never POST; `with-trip` = POST → broadcast. Server guard re-checks stored `liveSharing` on
every POST. A persistent "● Sharing live location with watchers" chip keeps the traveller
aware they're broadcasting; contextual permission prompt (not cold-on-load).

## Honest degradation (the safety point)

Consistent with Phase 1's terrain absent-not-zero decision
([journal 07-03c](../journal/2026-07-03-honest-degradation.md)): a stale pin must never
masquerade as current. `describeLiveness` + watcher copy guarantee every degraded state
carries "may not be their current location". Stale marker stays **greyed, not hidden**
(useful for SAR, clearly labelled). `completed` removes the marker; `planned` shows no live
UI. Best-effort `sendBeacon` on tab-close flips watchers to "paused" fast; staleness is the
honest floor if it doesn't land.

## Phase table

Vertical tracer-bullet slices (each cuts through every layer, demoable on its own). Issues
live in [.scratch/live-location/issues/](../../.scratch/live-location/issues/).

| Slice | What | Seam | Blocked by | State |
|---|---|---|---|---|
| [01](../../.scratch/live-location/issues/01-live-marker-end-to-end.md) | Live marker flows device → watcher (with-trip, both pages open) | reducer `position` kind | — | **DONE — verified end-to-end 2026-07-07** (two-window: SSE-driven blue marker tracks the route when data follows it, diverges when it doesn't). Fixed a real 2D-clamp marker bug en route ([journal 07-07](../journal/2026-07-07-live-marker-2d-clamp.md)). Follow-ups logged: over-water contrast → Slice 02; camera-chases-every-fix → Slice 04 |
| [02](../../.scratch/live-location/issues/02-honest-liveness-and-rehydrate.md) | Honest liveness + mid-trip rehydrate (stale/unavailable/not-shared, coarse persist, beacons) | `describeLiveness` | 01 | **DONE — verified end-to-end 2026-07-07** (all 4 states shown live + rehydrate). Seams TDD'd (9 cases). Honesty refinement: "not enabled" notice only for explicit off/owner-only, silent while awaiting first fix |
| [03](../../.scratch/live-location/issues/03-privacy-toggle-and-server-guard.md) | Privacy toggle + server guard (with-trip/owner-only/off, consent chip, contextual permission) | `shouldBroadcastPosition` | 01, 02 | not started |
| [04](../../.scratch/live-location/issues/04-basemap-persistence-rider.md) | Basemap persistence rider (`plannedBasemap` save/rehydrate, framing includes live point) | — | — | not started |

Deploy note: each slice's backend half ships first or same-deploy so watchers can receive
what travellers send; the reducer's `position` branch is inert until events arrive.

## Out of scope (Stage 2 / later)

Capacitor background location + push, breadcrumb/movement history, off-route alerting,
progress/late-running estimates, notifying watchers when sharing toggles/goes stale,
accuracy-radius circle, `plannedCamera`/persisted scene mode. Fast-follows (GuidePace
wiring, check-in reminders) are the roadmap's separate interleaved lane.

## Next action

Issues cut (2026-07-05). Implement **Slice 01** test-first (reducer `position` kind is pure —
red/green under `node --test` — then the endpoint, client handler, sampling loop, and marker).
