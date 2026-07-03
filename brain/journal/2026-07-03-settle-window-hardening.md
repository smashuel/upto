---
type: journal
date: 2026-07-03
status: done
tags: [map, cesium, trackdrawer, elevation, race, safety, wizard]
---

# 2026-07-03 — Settle-window hardening (10 review findings, 2 mechanisms)

**Symptom (class, not one bug):** a high-effort code review of the finish-settlement
work (6cb0a1a..5ae9530) confirmed ten defects sharing one root cause — the *settle
window* (double-click finish → settled emit, up to 8 s) was a real state nothing
represented. Worst finding was safety-critical: clicking **Create** inside the
window persisted the TripLink **without the route** (`onCreated` deferred behind
settlement; form state still empty). Others: clearAll/destroy didn't strand
in-flight clicks; straggling per-click enrichment wiped the Saved panel; cancel
unconditionally nulled the committed route's panel; a late settlement clobbered a
new drawing's stats; edit chrome stuck for the window's length; chart hover
resolved against the *previous* route; Undo rendered enabled but no-op'd; the Edit
pencil silently swallowed clicks; read-only views grew the wizard's stats panel.
([issue 06](../../.scratch/terrain-accurate-picking/issues/06-settle-window-hardening.md))

**Fix — two mechanisms, not ten patches** (see [ADR 014](../decisions/014-settle-window-is-a-real-state.md)):

1. `drawingEpoch` bumped by **every** teardown path (finish, cancel, clearAll,
   destroy) and re-checked after **every** await in the click path.
2. `DrawingStats.phase: 'drawing' | 'editing' | 'settling' | 'finished'` replaces
   the editing/finished booleans; finish/Done emit `settling` immediately; every
   emission records its backing points (hover can't diverge); a late settlement
   commits silently if a newer drawing owns the panel; cancel re-emits the
   committed route's settled stats.

Wizard side: a module-level `RouteSettlement` registry; `CreateAdventure.onSubmit`
awaits `routesSettled()` (with a "Finalising route elevations…" toast) and re-reads
form routes before building the TripLink. Undo/Edit are disabled (not dead) during
settlement; the panel meta shows "Saving · " for the window.

**Folded in:** issue 03 — the wizard now **upserts routes by id**
(`src/services/routeUpsert.ts`), so edit-commits replace the stored copy instead of
accumulating duplicates.

**Read-only decision (finding 10):** view pages keep the stats card + profile — a
watcher seeing the planner's numbers is PRD user story 4/13, not a leak. Only the
"Saved · " wizard framing is suppressed under `readOnly`.

Cleanups landed with it: one `emitStats` emitter (Naismith ×3 gone), route-metric
math consolidated into `computeStats` (GuidePace inputs can't drift), shared
`runSettlement` protocol, shared edit-mode teardown, `clearAll` emits its own null.

**Review round:** the two-axis /review of this work caught two defects in the fix
itself, both then fixed red-first: (1) `destroy()` didn't strand an in-flight
edit-drag elevation backfill — the drag handler's re-checks tested `editingTrack`,
which destroy never cleared (and the separate edit `ScreenSpaceEventHandler`
leaked); destroy now tears down edit mode and the drag handler re-checks
`drawingEpoch` too. (2) Cancelling inside a settle window restored the *previous*
committed route's panel as `finished` (the settling track isn't in `tracks` yet) —
re-enabling Edit dishonestly; cancel now restores the settling panel via a
`settlingPoints` reference.

25 TrackDrawer Vitest tests (11 new race tests, each red first) + 4 upsert tests;
tsc/lint/node:test green.
