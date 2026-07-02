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
