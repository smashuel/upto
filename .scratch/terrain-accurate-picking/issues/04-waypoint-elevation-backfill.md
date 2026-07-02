# 04 — Waypoint elevation backfill

Status: ready-for-agent

## Parent

.scratch/terrain-accurate-picking/PRD.md

## What to build

Waypoints placed on the map store the picked height — which in the wizard's default
2D view is the flat ellipsoid, so the waypoint infobox reports "0m" on a
mountainside and the serialized waypoint carries a false elevation.

Hoist the terrain-sampling helper currently private to the track drawer into the
shared Cesium manager base (or an equivalently shared home) so the waypoint manager
can use the same mechanism: on placement, backfill the waypoint's true terrain
height asynchronously, then refresh its stored elevation, its infobox description,
and anything serialized from it. Same UX contract as route points — the pin appears
instantly, the height corrects a moment later. Same failure contract — if terrain
is unavailable, keep the picked height silently (honest absence-marking is slice
05's job).

Refreshing the infobox/entity after the async correction must request a render
frame explicitly (requestRenderMode is on — see the `requestRender` note in the
shared Cesium manager base).

## Acceptance criteria

- [ ] Placing a waypoint in a flat (2D-style) pick yields a waypoint whose elevation settles to the fixture terrain height (harness test)
- [ ] The waypoint infobox description shows the settled height, not 0m
- [ ] The same spot picked in 2D and 3D reports the same settled elevation
- [ ] Terrain-failure path: waypoint placement still completes with the picked height, no throw
- [ ] Track-drawer behaviour is unchanged by the helper hoist (slice-01/02 suites stay green)
- [ ] Manual verify: drop a waypoint on a NZ peak in default 2D wizard view — infobox shows a plausible altitude
- [ ] `tsc --noEmit` and `npm run lint` stay green

## Blocked by

- .scratch/terrain-accurate-picking/issues/02-finish-waits-for-settled-heights.md
