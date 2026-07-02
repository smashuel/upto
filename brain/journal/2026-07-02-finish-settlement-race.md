---
type: journal
date: 2026-07-02
tags: [map, cesium, trackdrawer, elevation, race, safety]
---

# 2026-07-02 — Finished routes now wait for settled terrain heights

**Symptom:** the route persisted to a TripLink routinely carried ~0 elevation on its
last point(s), and gain/loss/difficulty computed from them — even though the live
stats on screen self-corrected. GuidePace inputs and watcher-visible climb figures
were silently wrong. ([issue 02](../../.scratch/terrain-accurate-picking/issues/02-finish-waits-for-settled-heights.md))

**Root cause:** `finishDrawing` (double-click) serialized and emitted synchronously
while the last click's `sampleTerrainMostDetailed` enrichment was still in flight —
and the last click always immediately precedes the finishing double-click, so the
final segment was near-always stale at emit time.

**Fix (commit on main):** finish and edit-commit are now *settlement points* — they
await a whole-route elevation pass (bounded by an 8 s timeout so a dead terrain
service can't hang the wizard), recompute metadata from settled heights, then render
and emit exactly once. Review of the async design surfaced and fixed three more
hazards, all now regression-tested:

- **Epoch guard** (`settleEpoch`): `clearAll()`/`destroy()` strand in-flight
  settlements — a cleared route can't resurrect, an unmounted wizard gets no emit.
- **Per-point snapshots at commit:** straggling samples (timeout path, late
  per-click enrichment) mutate only orphaned working points, never a committed
  track — GPX/metadata can't diverge post-emit.
- **Drop-handler guard:** the async edit `LEFT_UP` handler now bails if edit mode
  ended while it awaited the trail snap (was a latent undefined-deref).

Edit mode is also blocked (`enterEditMode` → false) while a settlement is pending,
so an edit can't grab half-committed state.

**Invariant worth remembering:** *a route emitted to the wizard is immutable — any
async work that outlives finish/clear/destroy must either be stranded by the epoch
or write only to orphaned objects.* If this pattern spreads beyond TrackDrawer
(WaypointManager backfill is next, slice 04), consider promoting it to an ADR.

## Follow-up (same day): phantom "2 pts · 0.00 km" panel after finish

User's browser run-through caught it: after the finishing double-click, the stats
panel cleared then repainted with `2 pts · 0.00 km · 0 m`. Root cause: a
double-click fires two LEFT_CLICKs *before* LEFT_DOUBLE_CLICK, and every click's
`addPoint` awaits the trail-snap call before pushing — so on **every** finish, two
straggler clicks landed after the drawing was cleared, repopulated `currentPoints`,
and re-emitted garbage stats. Fixed with a `drawingEpoch` (same stranding pattern):
finish/cancel bump it; a click that awakes into a dead session is discarded.

**Known behaviour, unchanged:** the double-click's own position has never become a
route point (its clicks were always still snapping at finish). If we ever want
"double-click adds the final point", that's a deliberate UX change — finish would
have to await pending adds, not discard them.
