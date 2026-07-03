---
type: feature
status: shipped
related: [src/services/WaypointManager.ts]
tags: [map, waypoints]
---

# Waypoints

Click-to-place typed markers on the map — huts, summits, landmarks, hazards.

## Types

| Type | Icon | Use |
|------|------|-----|
| `hut` | bed | Accommodation / shelter |
| `summit` | mountain | Peak bagged / objective |
| `waypoint` | flag | Generic marker |
| `hazard` | triangle | Danger / avoidance note |

## Rendering (Phase 3.3)

Each waypoint is a Cesium `Billboard` entity:
- SVG icon, 24–32 px
- `disableDepthTestDistance: Infinity` so it doesn't vanish behind terrain
- Positioned via `HeightReference.CLAMP_TO_GROUND`

## Interaction

- **Place**: switch to Waypoint mode, click on map → type picker → marker dropped
- **Delete**: click existing marker while in waypoint mode → confirm
- **Move**: not yet implemented (planned alongside drag-to-reroute extension)

## Elevation backfill (2026-07-03, terrain-accurate-picking slice 04)

A placed waypoint's elevation instantly reflects the picked height (0m on the
flat 2D ellipsoid), then corrects to the true terrain height a moment later —
same mechanism and UX contract as `TrackDrawer`'s route points. The
terrain-sampling helper (`getSamplingTerrain` / `enrichElevation`) lives on the
shared `CesiumManager` base so both managers use it; `WaypointManager` mutates
`waypoint.metadata.elevation` + the entity's position/infobox description in
place once sampling resolves. Guarded against a waypoint deleted, or the
manager destroyed, while the sample is in flight (`destroyed` flag +
`waypoints.includes()` check — the same class of hazard
[ADR 014](../decisions/014-settle-window-is-a-real-state.md) covers for
`TrackDrawer`, scaled down since waypoints have no drawing session to strand).
Rehydrated waypoints (`loadWaypoints`) are trusted as already-settled and
**not** re-backfilled. If terrain is unavailable, the picked height is kept
silently (honest absence-marking is slice 05).

**Known gap:** the settled elevation lives on `WaypointManager`'s own
`getWaypoints()` (used by the map's Export-data button) but never reaches the
wizard's form state — `TripPlanningMap`'s `onWaypointAdded` callback strips
elevation down to `{lat, lng, name}` before `AdventureLocationStep` even sees
it, and nothing there writes into `data.waypoints`. Pre-existing, not caused by
this slice; would need its own small issue if a waypoint's elevation should
ever persist on the TripLink.

## Persistence

Currently held in React state on the wizard step; serialised into the TripLink at submit time. Same localStorage-only caveat as the rest of the wizard.
