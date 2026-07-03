---
type: decision
id: 014
status: accepted
date: 2026-07-03
tags: [map, cesium, trackdrawer, async, race, safety]
---

# 014 — The settle window is a real state: strand-by-epoch + honest phase

## Context

Finishing a route (double-click) or committing an edit awaits a whole-route
terrain-elevation pass — up to 8 s on slow terrain — before the settled route is
emitted to the wizard (ADR context: issue 02 / journal 2026-07-02). A high-effort
code review of that work found ten confirmed defects with one root cause: this
*settle window* was a real state the code was in, but nothing represented it.
Stats could only say drawing/editing/finished, the finishing track wasn't in the
committed list yet, and each of the two stranding epochs covered only a subset of
teardown paths. Worst case: submitting the wizard inside the window persisted a
TripLink **without the route the user just drew** — a silent safety defect.

## Decision

Two mechanisms, not ten patches:

1. **Strand-by-epoch covers every teardown path and every await.**
   `drawingEpoch` is bumped by finish, cancel, clearAll AND destroy, and is
   re-checked after *every* await in the click path (snap lookup and elevation
   backfill). `settleEpoch` (bumped by clearAll/destroy) strands settlements.
   Async work that wakes into a dead epoch returns without touching the viewer
   or emitting. Committed tracks hold per-point snapshots, so stragglers can
   only mutate orphaned objects.
2. **The window is represented, not hidden.** `DrawingStats.phase` is
   `'drawing' | 'editing' | 'settling' | 'finished'` (replacing two booleans).
   Finish/Done emit `settling` immediately, so the UI can disable Undo/Edit
   honestly and drop edit chrome at once. Every emission records its backing
   points, so chart hover always resolves against exactly what the panel shows.
   A late settlement still commits its route but never emits over a newer
   drawing's live panel.

The wizard side gets a module-level `RouteSettlement` registry
(begin/end around every settlement); `CreateAdventure.onSubmit` awaits
`routesSettled()` and re-reads form routes before persisting.

## Alternatives

- **One generation counter for everything** (the review's first suggestion) —
  rejected: cancelling an unrelated new drawing would strand a legitimate
  pending commit of the previous route, losing it.
- **Flush synchronously with picked heights on submit** — rejected: reintroduces
  the lying elevations issue 02 exists to prevent.
- **Plumb pending-settle state through props** (map → step → wizard) — rejected
  for a 3-layer drill through a lazy-mounted component; the registry is one
  module with a test seam (`resetRouteSettlement`).

## Consequences

- Any new async path inside a map manager MUST re-check its epoch after every
  await, and any new teardown path MUST bump the epochs it invalidates.
- UI code gates on `phase`, never on inferred combinations of booleans.
- The wizard submit is bounded: settle itself is time-bounded (8 s) and the
  registry await has a 12 s safety net — submit can be delayed, never hung.

## Reconsider if

- Settlement grows beyond TrackDrawer (waypoint backfill is slice 04) and the
  per-drawer epochs start being duplicated — then consider folding the pattern
  into `CesiumManager`.
