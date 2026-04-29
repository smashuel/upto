---
type: feature
status: shipped
related: [src/services/RouteFlyover.ts, src/components/map/TripPlanningMap.tsx]
tags: [map, animation, cesium]
---

# Route Flyover

Animated chase-cam flight along a finished route. User clicks Play in the bottom-right overlay → camera follows the route from start to end, then restores. Shipped in map UX Phase 5.3.

## How it works

- Builds a `SampledPositionProperty` with one sample per route point, interpolated with `HermitePolynomialApproximation` (degree 2) for smooth curves
- Adds an invisible tracked `Entity` carrying the position + a `VelocityOrientationProperty` so the camera heading auto-aligns with direction of travel
- `viewer.trackedEntity = entity` gives the default chase-cam (slightly above + behind, looking down along the velocity vector)
- Snapshots Cesium clock state (`startTime/stopTime/currentTime/multiplier/shouldAnimate/clockRange`) before the flight and restores it on stop — non-destructive

## Parameters

- `duration` — seconds, clamped to `[6, 60]`. Defaults to `max(10, positions.length * 1.2)`
- `altitude` — metres above each sample (lifts the camera clear of terrain), default 250 m
- `onStop` — callback fires on natural end OR user-triggered stop

## UI

Play/Stop button in the bottom-right overlay, visible when `hasFinishedRoute && !editMode`. Auto-switches scene to 3D before starting (`morphTo3D(1.5)`).

## Known gaps

- No easing at start/end of the flight — camera jerks to the first sample
- No UI for duration/altitude — fixed defaults
- Flyover doesn't adapt to pitch/zoom level from the current view before starting
