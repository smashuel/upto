# 06 — Settle-window hardening (code-review findings)

Status: done

## Parent

.scratch/terrain-accurate-picking/PRD.md

## Origin

High-effort /code-review of the slice 01/02 work (commits 6cb0a1a..5ae9530), 2026-07-03.
Ten confirmed findings, one common root cause: the **settle window** (double-click
finish → settled emit, up to 8 s on slow terrain) is a real state the code now has,
but nothing represents it — `DrawingStats` can only say drawing/editing/finished,
the finishing track isn't in `this.tracks` yet, and the two epochs each cover only
a subset of teardown paths.

## Recommended shape of the fix

Two mechanisms, not ten patches:

1. **One generation counter** per drawer, bumped by finish, cancel, clearAll AND
   destroy alike, checked after **every** await (replaces the settleEpoch/drawingEpoch
   split — or keep both but make clearAll/destroy bump drawingEpoch too and re-check
   after the enrichElevation await in addPoint).
2. **A `settling` phase in DrawingStats** (e.g. `phase: 'drawing' | 'editing' |
   'settling' | 'finished'` replacing the editing/finished booleans), emitted by
   finishDrawing/exitEditMode immediately, so the UI can represent the window
   (disable Undo/Edit honestly, keep edit UI from sticking) — plus record the
   stats-backing points alongside each emission so chart hover can't diverge.

## Confirmed findings (severity order)

1. **TrackDrawer.ts:411 — TripLink can be persisted without its route (safety-critical).**
   onCreated is deferred behind settlement; user double-clicks finish then clicks
   Create within the window → `data.routes` is empty, trip shared routeless, silently.
   Fix: expose settlement pending state; wizard submit must await/blok on pending
   settles (or drawer flushes synchronously with picked heights on demand).
2. **TrackDrawer.ts:245 — destroy()/clearAll() don't strand in-flight clicks.**
   They bump only settleEpoch; an addPoint mid-snap-await passes the drawingEpoch
   guard and touches a destroyed viewer / repaints a phantom panel after Clear.
   Same class as the 1f6872b phantom-stats bug, on the two paths it didn't cover.
3. **TrackDrawer.ts:295 — straggling per-click enrichment wipes the Saved panel.**
   The second await in addPoint (`enrichElevation`) has no epoch re-check before
   `emitDrawingStats()`; resolving after finish emits null (currentPoints empty).
4. **TrackDrawer.ts:449 — cancelDrawing unconditionally emits null,** wiping the
   committed route's reference panel (Route-tool toggle on/off; also the <2-point
   finish path). Nothing re-emits settled stats after a cancel — cancel should
   re-emit the latest committed track's settled stats if one exists.
5. **TrackDrawer.ts:412 — late settlement clobbers a new drawing's live stats.**
   emitSettledStats guarded only by settleEpoch; starting route 2 during route 1's
   settlement gets its panel overwritten with finished:true stats (also disables Undo).
6. **TrackDrawer.ts:852 — edit UI sticks for up to 8 s after Done** (or forever if
   the settlement is stranded): exitEditMode removes handles instantly but the last
   stats emission keeps editing:true until settleEdit lands.
7. **TrackDrawer.ts:711 — chart hover resolves against the wrong route during the
   window:** finished track not yet pushed, so statsPoints() falls back to the
   PREVIOUS committed track while the panel shows the new route's stats.
8. **TripPlanningMap.tsx:1440 — Undo renders enabled but no-ops during the window**
   (stale live stats: finished:false, pointCount≥2, but drawing already false).
9. **TripPlanningMap.tsx:902 — Edit pencil click silently swallowed during
   settlement:** handleEditRoute discards enterEditMode's false; no disabled state.
10. **TrackDrawer.ts:790 — read-only views now grow the wizard's stats panel:**
    loadRoutes emits unconditionally and the panel isn't gated on readOnly;
    PublicAdventureView + ActiveTrip pass readOnly + initialRoutes. Decide
    deliberately: suppress, or style as a read-only stats card.

## Cleanup (confirmed, apply opportunistically while in the file)

- Route-metric math triplicated: buildTrack (~457), recomputeTrackMetadata (~906),
  computeStats (~656); Naismith `distance/4 + gain/600` copy-pasted at ~681/699/1126.
  Consolidate into computeStats (units all reconcile to km) — these numbers feed
  GuidePace, drift is a safety concern.
- settleAndCommit (~398) / settleEdit (~864) duplicate the settlement protocol
  line-for-line → one shared helper taking an apply callback.
- exitEditMode / abortEditMode share a five-statement teardown block → extract.
- clearAll should emit onDrawingUpdate(null) itself instead of relying on
  handleClearRoute's companion setDrawingStats(null).
- `!this.drawing` in addPoint's guard is redundant once the generation counter
  covers all teardown paths (today it's redundant AND insufficient — see finding 2).

## Not in scope here

- Duplicate route on edit-commit (wizard appends same id) — pre-existing, tracked
  as issue 03 (wizard upserts routes by id). Fixing 03 first may simplify finding 1.
- Whole-route re-sampling at finish (efficiency, PLAUSIBLE only) — defensible as a
  retry for silently-failed per-click samples; revisit only if terrain traffic hurts.

## Acceptance criteria

- [ ] Race tests (fake-Cesium harness, manual terrain mode) for findings 1–5 and 7:
      each red first, then green
- [ ] Submitting the wizard during a settle window cannot persist a routeless
      TripLink when a finished route exists
- [ ] Clear/destroy/cancel/finish all strand every in-flight await (clicks AND
      settlements); no emit after destroy
- [ ] Saved reference panel survives: mode toggle, cancel, straggling enrichment
- [ ] Edit UI reflects reality within one emission of Done; Undo/Edit controls
      disabled (not dead) during settlement
- [ ] Read-only views: deliberate decision on the stats panel, implemented
- [ ] `npm test`, `tsc --noEmit`, `npm run lint` green

## Blocked by

Nothing hard. Consider landing 03 (route upsert) first or together — finding 1's fix
touches the same wizard callback.

## Comments

**2026-07-03 (agent):** Implemented with the recommended two-mechanism shape
(issue 03 folded in — same wizard callback):

1. **Epochs cover every teardown path/await** — kept the settleEpoch/drawingEpoch
   split (the alternative to the single counter: a single one would let cancelling
   an unrelated new drawing strand a legitimate pending commit). clearAll/destroy
   now bump `drawingEpoch`; both awaits in `addPoint` and both in the edit LEFT_UP
   handler re-check.
2. **`phase: 'drawing' | 'editing' | 'settling' | 'finished'`** replaces the
   editing/finished booleans; finish/Done emit `settling` immediately; every
   emission records its backing points (`statsBackingPoints`) so chart hover
   can't diverge; a late settlement commits its route but never emits over a
   newer drawing's panel; cancel restores the settling panel (if a settle is
   pending) or the committed route's reference panel.

Finding 1 (safety-critical): module-level `RouteSettlement` registry;
`CreateAdventure.onSubmit` awaits `routesSettled()` (12 s net over the 8 s settle
bound, "Finalising route elevations…" toast) and re-reads form routes post-await.
Finding 10 decision: read-only views **keep** the stats card + profile (PRD
stories 4/13 — watchers see the planner's numbers); only the "Saved · " wizard
framing is suppressed. All cleanup items applied (metric math → `computeStats`,
shared `runSettlement`, shared edit teardown, `clearAll` emits its own null,
redundant `!this.drawing` guard dropped).

Race tests for findings 1–5 & 7 written red-first (12 red before implementation),
then green. Two-axis /review then caught two implementation defects, both fixed
red-first: destroy() didn't strand an in-flight edit-drag backfill (edit teardown
+ epoch re-check added), and cancel inside a settle window restored the *previous*
route's panel as finished (now restores the settling panel via `settlingPoints`).
25 TrackDrawer + 4 upsert Vitest tests green; node:test suites, tsc, lint green.
See [ADR 014](../../../brain/decisions/014-settle-window-is-a-real-state.md) and
[journal](../../../brain/journal/2026-07-03-settle-window-hardening.md).
