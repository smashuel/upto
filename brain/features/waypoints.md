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

## Persistence

Currently held in React state on the wizard step; serialised into the TripLink at submit time. Same localStorage-only caveat as the rest of the wizard.
