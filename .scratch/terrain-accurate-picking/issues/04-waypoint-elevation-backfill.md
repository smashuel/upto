# 04 — Waypoint elevation backfill

Status: done

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

## Comments

**2026-07-03 (agent):** Implemented. `getSamplingTerrain`/`enrichElevation` hoisted
from `TrackDrawer` (private) to `CesiumManager` (protected, shared `ElevationPoint`
interface) — a pure move, no logic change; TrackDrawer's own suite stays green
unchanged, confirming the hoist didn't disturb route-point behaviour.
`WaypointManager.addWaypoint` fires-and-forgets a `backfillElevation` pass on fresh
placement (default `backfill = true`); `loadWaypoints` opts out (`backfill = false`)
since rehydrated waypoints are trusted as already-settled, matching
`TrackDrawer.loadRoutes`'s equivalent choice. On resolution, the waypoint's
elevation, position and infobox description update in place, with `requestRender()`
under `requestRenderMode`.

Two-axis /review caught one real gap before commit: no guard against the manager
being destroyed mid-backfill (ADR 014 names this exact case in its "Reconsider if"
clause). Fixed with a `destroyed` flag checked alongside the existing
delete/clear-safety check — scaled down from TrackDrawer's epoch mechanism since
waypoints have no drawing *session* to strand, just independent per-object async
work to abandon on teardown. Caught the fix's own test being a false negative on
the first pass (flushed terrain before the sample was even queued); fixed the test
timing and re-confirmed red before the fix, green after.

**Scope note:** the settled elevation reaches `getWaypoints()` (used by the map's
Export-data button) but not the wizard's form state — `onWaypointAdded` normalizes
to `{lat, lng, name}` and nothing in `AdventureLocationStep`/`CreateAdventure`
writes waypoint elevation into `data.waypoints`. Pre-existing gap, not introduced
here, and not asked for by this issue's acceptance criteria (unlike issue 03, which
was explicitly the wizard-wiring issue for routes). See
[brain/features/waypoints.md](../../../brain/features/waypoints.md).

7 new WaypointManager Vitest tests (fake Cesium extended with `VerticalOrigin`/
`NearFarScalar`/`LabelStyle` — a pre-existing gap in the fake, not previously
exercised since no WaypointManager suite existed) + 25 TrackDrawer tests unchanged;
node:test, tsc, lint green. **Outstanding:** the "Manual verify" checkbox — drop a
waypoint on a NZ peak in the default 2D wizard view and confirm the infobox shows a
plausible altitude.
