---
type: journal
date: 2026-07-07
tags: [live-location, cesium, map, bug, 2d]
related: [src/components/map/TripPlanningMap.tsx, brain/plans/live-location.md]
---

# Clamped `point` markers don't render in Cesium SCENE2D

Found during the live-location Slice 01 two-window verify.

## Symptom

On the watcher view (`PublicAdventureView`, which opens in 2D topo), the live-position
marker's **label** ("Live") rendered and moved correctly with the SSE stream, but the
**blue dot itself was invisible**. Same latent bug in the "Last check-in" pin — its label
would show but the green dot wouldn't, on any 2D view page.

## Root cause

Both markers used `point: { heightReference: CLAMP_TO_GROUND, disableDepthTestDistance:
Infinity, … }`. In `SceneMode.SCENE2D`, a **clamped `point` graphic is not drawn** — ground
clamping for points goes through a primitive path that doesn't render in 2D — while
**labels clamp via a different mechanism that does** render in 2D. Hence label-visible /
point-invisible. In 3D both showed, which is why it was never noticed (legacy call sites
defaulted to 3D; the wizard/view pages now default to 2D topo).

## Fix

Drop `heightReference: CLAMP_TO_GROUND` from both marker points and rely on
`disableDepthTestDistance: Number.POSITIVE_INFINITY` (already set) to keep them on top in
both 2D and 3D. One-line removal on each of the live marker and the check-in pin in
`TripPlanningMap.tsx`.

## Invariant (for future map markers)

**A `point` graphic that must be visible on the 2D view pages must not use
`CLAMP_TO_GROUND`.** Use `disableDepthTestDistance: Infinity` for always-on-top instead.
Labels/billboards are unaffected. If a future marker needs true ground-clamping in 3D *and*
2D visibility, use a billboard (image) rather than a point.

## Follow-ups surfaced (not bugs — logged to slices)

- **Over-water contrast**: a blue dot on light-blue sea is hard to spot → fold a contrast
  tweak into Slice 02's marker-styling work (alongside the stale/greyed treatment).
- **Camera chases every fix**: Slice 01 feeds the live position in as the map `center`, so
  the camera hard-recenters every ~3 min sample → smooth in Slice 04 (frame to *include* the
  live point without yanking on each update).
