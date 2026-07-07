# Slice 1 — Live marker flows device → watcher (with-trip, both pages open)

Status: done (verified end-to-end 2026-07-07)
Parent: [.scratch/live-location/PRD.md](../PRD.md)
Covers user stories: 1, 2, 7, 9, 16, 20, 21

> Verified via two-window run: SSE-driven blue "Live" marker tracks the planned route when
> positions follow it and diverges when they don't. Reducer TDD'd (4 cases). Caught + fixed a
> real 2D `CLAMP_TO_GROUND` marker-rendering bug (also affected the check-in pin) — see
> [journal 2026-07-07](../../../brain/journal/2026-07-07-live-marker-2d-clamp.md). Follow-ups:
> over-water marker contrast → Slice 02; camera-chases-every-fix → Slice 04.

## What to build

The thinnest end-to-end tracer bullet for live location: while a traveller has an **active**
trip page open, their device samples its position every ~3 minutes and that position renders
as a **live marker** on any watcher's map, live over SSE — no refresh.

This slice assumes `liveSharing === 'with-trip'` for everyone (the privacy toggle and
owner-only/off arrive in Slice 3) and does **not** persist positions (broadcast-only; a
watcher who loads mid-trip sees the marker appear on the next sample — load-time rehydrate
arrives in Slice 2). Keep it deliberately narrow but complete through every layer.

Position joins the **one existing client reducer** (`applyLifecycleEvent`) as a new event
kind — not a parallel channel. It must be provably isolated from lifecycle state. Confirmed
shape (from the grilled PRD):

```
applyLifecycleEvent(prev, event:
  | …existing status/checkin/overdue…
  | { kind: 'position'; sharing: 'live' | 'unavailable'; timestamp; lat?; lng?; accuracy? }
)
```

Slice-1 rules for the `position` branch: on `sharing: 'live'` with coordinates, set
`livePosition = { lat, lng, timestamp, accuracy }` **only if `timestamp` is newer than the
current `livePosition.timestamp`** (monotonic — drop out-of-order/duplicate broadcasts). A
`position` event **never** touches `status`, `overdueSince`, `startedAt`, `lastCheckIn`, or
`checkIns`. (The `sharing: 'unavailable'` handling is exercised in Slice 2.)

Sampling uses a **timed `getCurrentPosition` every ~3 min**, NOT a continuous
`watchPosition` firehose (battery — see the PRD cadence constraint). Cadence values are
single named constants.

## Acceptance criteria

- [ ] `applyLifecycleEvent` handles a `position` event: sets `livePosition` from a `live` fix.
- [ ] A newer-timestamp position replaces an older one; an older/duplicate-timestamp position
      is ignored (monotonic). Covered by `node --test`.
- [ ] A `position` event leaves `status`, `overdueSince`, `startedAt`, `lastCheckIn`, and
      `checkIns` unchanged — isolation invariant, unit-tested.
- [ ] `POST /api/triplinks/:token/position` accepts `{ lat, lng, accuracy? }`, is
      capability-guarded by the share token and rate-limited like check-in, and broadcasts a
      `position` SSE event via the existing `broadcast` seam. (No DB persist in this slice.)
- [ ] The API client's `subscribeToEvents` gains an `onPosition` handler that normalises the
      payload into the tagged `position` event.
- [ ] `TripPlanningMap` accepts a `liveMarker` prop and renders it read-only, visually
      distinct from `checkInMarker` and the route (mirrors the existing `checkInMarker` path).
- [ ] ActiveTrip runs a ~3-min `getCurrentPosition` timer while the trip is `active`, POSTing
      each fix; the timer is torn down on unmount and on completion. The traveller sees their
      own live marker.
- [ ] PublicAdventureView wires `onPosition` → reducer → `liveMarker`.
- [ ] Demoable: active trip on one device + share link open on another → the live marker
      appears and updates roughly every 3 minutes as the traveller moves.
- [ ] No new test framework — reducer tests run under `node --test` (prior art
      `lifecycleReducer.test.ts`).

## Blocked by

None — can start immediately.
