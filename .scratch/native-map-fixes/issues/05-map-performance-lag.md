# 05 — Map is sluggish on the native device when panning / zooming

Status: needs-info
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

- [ ] Pan and pinch-zoom feel smooth on a mid-range iPhone (no obvious jank / dropped frames).
- [ ] Mobile-tier performance profile tuned with a before/after measurement (FPS or subjective
      pass on-device).
- [ ] No regression to render quality when the map is at rest.
- [ ] Re-verified after issue 01 lands (satellite/terrain actually rendering).

## Blocked by

- None. Related to issue 01 (measure again once Ion renders).
