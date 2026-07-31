# 09 — 2D imagery sharpness varies across the screen at some zooms

Status: done (2026-07-31) — verified on device; sharpness consistent
Surfaced: on-device (iPhone), 2026-07-31
Area: TripPlanningMap.tsx, src/services/screenSpaceError.ts

## What to build

After the scene-mode-aware LOD fix, 2D sharpness is good overall, but at some zoom levels the
top half of the screen renders sharper than the bottom half (intermittent, not every view).

This is a tile level-of-detail split across the viewport: the globe quadtree is selecting a
finer imagery level for one band of tiles than the neighbouring band. Plausible causes, to be
distinguished before changing anything:

1. Residual camera pitch in 2D. If the camera isn't exactly nadir, tiles further "up" the
   screen are at a different computed distance and pick a different LOD. `handleSceneModeChange`
   restores pitch to -90° on morph to 2D, but the initial 2D entry path and the flyover restore
   path should be checked too.
2. Normal progressive refinement — coarse tiles shown while finer ones load, resolving after a
   moment. If it settles on its own after a second or two, this is cosmetic, not a defect.
3. The `maximumScreenSpaceError` value landing near a tile-level boundary, so a small difference
   in computed distance flips the level.

Determine which before touching the LOD numbers — cause 2 needs no fix at all.

## Acceptance criteria

- [x] Root cause identified (settles-on-its-own vs a genuine LOD split).
- [x] If a real split: imagery renders at a consistent level across the viewport in 2D at a
      fixed camera position.
- [x] No regression to the 2D sharpness or pan/zoom smoothness gained in d54928e.

## Blocked by

- Needs one observation from the device: when the top/bottom difference appears, does it
  resolve on its own within a second or two of holding still, or does it persist?

## Verified on device — 2026-07-31

Sharpness is now consistent across the viewport. Root cause was a **genuine LOD split**, not
progressive refinement settling.

The mechanism: the two scene modes use different terrain providers. 3D loads Cesium World
Terrain, whose geometric error forces the quadtree to refine deeply — imagery gets pulled to a
fine LOD as a side effect. 2D swaps in `EllipsoidTerrainProvider`, which is flat with negligible
geometric error, so refinement stops several levels earlier and the same imagery renders
coarser. One `maximumScreenSpaceError` was being applied to both.

Fixed by `resolveScreenSpaceError(tier, mode)` in [screenSpaceError.ts](../../../src/services/screenSpaceError.ts),
which lowers SSE in 2D only (weaker device tiers get a milder boost so the win doesn't return as
jank). Buying the detail back is cheap in 2D specifically — there is no terrain mesh to build or
light, so it costs imagery fetches and fill rate, not geometry. The 3D values are untouched.
Paired with a render nudge on `tileLoadProgressEvent`.

The earlier device report — "did not settle until i zoomed a bit then it came good" — was the
missing render nudge: the correct tiles had loaded, but nothing asked the scene to redraw them
until a camera change did. That detail is why the `tileLoadProgressEvent` half was needed on top
of the LOD half; either alone leaves the symptom.
