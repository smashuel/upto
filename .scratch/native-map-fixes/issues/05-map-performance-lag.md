# 05 — Map is sluggish on the native device when panning / zooming

Status: done (2026-07-31) — verified on device; no longer lags
Surfaced: on-device (iPhone), 2026-07-31
Area: src/services/MapPerformance.ts (device-tier profile), TripPlanningMap.tsx (render mode)

## What to build

On the iPhone, zooming in/out and panning the Cesium map lags/janks — "not nice to use."
Investigate and tune the mobile performance profile for the actual device, and reduce the work
done during interaction so pan/zoom feels smooth.

Levers to investigate:
- `MapPerformance.ts` device-tier profile (resolution scale, maximum screen-space error / SSE,
  MSAA samples, atmosphere/fog) — the mobile tiers may still be too aggressive for a real
  iPhone; measure and relax.
- `useBrowserRecommendedResolution = false` (native-resolution rendering) is expensive on
  retina — consider honouring device-recommended resolution on the mobile tier.
- `requestRenderMode` is flipped to continuous during interaction; confirm it returns to
  on-demand promptly and that continuous frames aren't doing avoidable work (imagery LOD, terrain).
- Interplay with issue 01: if Ion satellite/terrain aren't loading, the perf picture on a
  fully-working build will differ — re-measure once 01 is resolved.

## Acceptance criteria

- [x] Pan and pinch-zoom feel smooth on a mid-range iPhone (no obvious jank / dropped frames).
- [x] Mobile-tier performance profile tuned with a before/after measurement (FPS or subjective
      pass on-device).
- [x] No regression to render quality when the map is at rest.
- [x] Re-verified after issue 01 lands (satellite/terrain actually rendering).

## Blocked by

- None. Related to issue 01 (measure again once Ion renders).

## Verified on device — 2026-07-31

No longer lags. This never got the dedicated profiling pass the issue asked for — it resolved as
a side-effect of the other map work, most directly the device-tier performance preset and the
scene-mode-aware screen-space-error fix (`d54928e`, issue 09), which stopped the globe refining
its quadtree harder than the view justified.

Worth being clear that no before/after measurement was taken, so this is a subjective pass on
device, not a proven fix. If the lag returns, `resolveScreenSpaceError`'s `FLAT_SSE_FACTOR` is
the first dial (it deliberately trades fill rate for sharpness in 2D) and `PERF_PROFILES` in
[MapPerformance.ts](../../../src/services/MapPerformance.ts) is the second.
