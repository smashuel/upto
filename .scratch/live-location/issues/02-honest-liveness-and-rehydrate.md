# Slice 2 — Honest liveness + mid-trip rehydrate

Status: ready-for-agent
Parent: [.scratch/live-location/PRD.md](../PRD.md)
Covers user stories: 3, 4, 5, 8, 11, 17, 22, 25

## What to build

The safety layer on top of Slice 1: **a stale or absent position can never masquerade as a
current one.** This is the live-location echo of Phase 1's terrain absent-not-zero decision.

A watcher now always sees an honest liveness label, and a watcher who opens the link mid-trip
sees the last-known position (with its age) immediately, before any live event arrives.

Introduce the pure classifier (from the grilled PRD):

```
describeLiveness(tripLink, now) → 'fresh' | 'stale' | 'not-shared' | 'unavailable'
```

Driven by `liveSharing`, the presence/age of `livePosition`, and its `sharing` marker. It
runs on a local display tick (like the active-trip countdown clock) so "updated Nm ago" /
"paused Xm ago" stays live between events. `fresh → stale` at ~10 min (≈ 3 missed samples);
constant is named/tunable.

Watcher treatment (the complete state set — closed):

| State | When | Marker | Copy |
|---|---|---|---|
| fresh | with-trip, position < 10 min old | pulsing | "Live · updated 3m ago" |
| stale | with-trip, position ≥ 10 min old | **greyed, still shown** | "Live tracking paused — last known 14m ago, may not be current" |
| unavailable | with-trip, latest signal was the `unavailable` beacon | none (fall back to check-in pin) | "Live tracking unavailable — showing last check-in" |
| not-shared | owner-only / off / never started | none (check-in pin only) | "Live tracking not enabled for this trip — last check-in may not be their current location" |

Edges: `planned` → no live UI; `completed` → live marker **removed**, no liveness notice.
Safety invariant: every degraded state (stale/unavailable/not-shared) carries the "may not be
their current location" qualifier — a static pin is never shown bare.

Also add: the `sharing: 'unavailable'` handling in `applyLifecycleEvent` (mark the position
not-current while retaining last-known coordinates); the traveller-side beacons that produce
it; and the coarse persist so mid-trip loads rehydrate.

## Acceptance criteria

- [ ] `describeLiveness` returns the four states per the table; unit-tested under
      `node --test`. Cases: off/owner-only → not-shared; with-trip recent → fresh; with-trip
      old → stale; latest signal `unavailable` → unavailable; with-trip no position yet →
      not-shared; a `completed` trip is never `fresh` regardless of position age.
- [ ] `applyLifecycleEvent` `position` branch handles `sharing: 'unavailable'`: marks the
      position not-current, retains last-known coordinates, leaves lifecycle state untouched.
- [ ] Backend persists `livePosition` to the JSONB `data` **coarsely — at most ~once per
      10 min** (newest kept in memory between writes; overwrite, not append — no breadcrumb
      history). `GET /api/triplinks/:token` returns `livePosition` so a mid-trip load
      rehydrates the last-known point.
- [ ] On geolocation permission denial or a `getCurrentPosition` error, ActiveTrip POSTs a
      single `sharing: 'unavailable'` beacon; watchers flip to the honest state.
- [ ] On tab close, a best-effort `navigator.sendBeacon('…/position', { sharing:
      'unavailable' })` fires on `pagehide` / `visibilitychange → hidden` — never relied on;
      the ~10-min stale threshold is the honest floor if it doesn't land.
- [ ] Watcher view shows the correct notice + marker treatment for each state, with the
      "may not be their current location" qualifier on every degraded state; stale marker is
      greyed, not hidden.
- [ ] `completed` removes the live marker; `planned` shows no live UI.
- [ ] Marker contrast holds over water as well as land (Slice 01 verify found a blue dot on
      light-blue sea hard to spot) — tune fill/outline/halo alongside the greyed-stale styling.
- [ ] Demoable: background/close the traveller tab → watcher flips to "paused, last known
      Xm ago"; deny permission → "unavailable"; reload the watcher mid-trip → last-known with
      age is shown.

## Blocked by

- Slice 1 (01-live-marker-end-to-end) — needs the reducer `position` kind, the endpoint, and
  the live marker in place.
