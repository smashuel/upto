# 09 — 2D imagery sharpness varies across the screen at some zooms

Status: fix attempted (2026-07-31) — confirmed a real LOD stall, not progressive refinement
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

- [ ] Root cause identified (settles-on-its-own vs a genuine LOD split).
- [ ] If a real split: imagery renders at a consistent level across the viewport in 2D at a
      fixed camera position.
- [ ] No regression to the 2D sharpness or pan/zoom smoothness gained in d54928e.

## Blocked by

- Needs one observation from the device: when the top/bottom difference appears, does it
  resolve on its own within a second or two of holding still, or does it persist?
