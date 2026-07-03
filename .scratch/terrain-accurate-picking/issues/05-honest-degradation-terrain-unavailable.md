# 05 — Honest degradation when terrain is unavailable

Status: done

## Parent

.scratch/terrain-accurate-picking/PRD.md

## What to build

When Cesium World Terrain can't load (no Ion token, offline), elevation silently
reads 0 everywhere — indistinguishable from a genuinely flat route. For a safety
app, an unknown number presented as a measurement is worse than an admitted gap.

Two parts:

1. **Data honesty.** Make per-point elevation in the serialized route (and the
   serialized waypoint) optional-when-unknown instead of defaulting to 0. When
   terrain sampling is unavailable at finish, the route is stored with elevations
   absent and elevation-derived metadata absent or clearly unknown — never zeros
   masquerading as sea level. Downstream consumers treat absent as "unknown", not
   zero: the stats display, the elevation profile chart, difficulty, and GPX export
   (omit elevation tags rather than writing 0).
2. **Visible notice.** When terrain sampling is unavailable, the map shows a small,
   dismissible, non-blocking notice — e.g. "Elevation data unavailable — route
   stats shown without climb." It must not interrupt drawing.

A later re-open of a route stored with absent elevations, with terrain available,
should be able to distinguish "unknown" from "sea level" (no re-sampling required
in this slice — just don't destroy the distinction).

## Acceptance criteria

- [ ] Terrain-unavailable test: finish emits a serialized route whose points carry no elevation values and whose gain/loss/difficulty are absent or explicitly unknown — not 0
- [ ] Stats display and profile chart render an "unknown" state rather than a flat-0 profile when elevations are absent
- [ ] GPX export omits elevation tags for points with unknown elevation
- [ ] A dismissible on-map notice appears when terrain sampling is unavailable, and never appears when sampling works
- [ ] Loading a stored route without elevations renders the route line normally (geometry unaffected)
- [ ] With terrain available, behaviour is byte-for-byte identical to slice 02/04 output (no regression to the happy path)
- [ ] `tsc --noEmit`, `npm run lint`, and prior suites stay green

## Blocked by

- .scratch/terrain-accurate-picking/issues/02-finish-waits-for-settled-heights.md

## Comments

**2026-07-03 (agent):** Implemented. Per-point `elevationKnown: boolean` added
alongside `TrackPoint.elevation`/`Waypoint.metadata.elevation` — the number stays
real always (distance/rendering math never special-cases it), the flag alone
decides whether it's presented as a measurement. `computeStats`'s
`elevationKnown = points.every(p => p.elevationKnown)` collapses a route to fully
unknown if even one point was never confirmed (a gain/loss partly computed from a
fake delta is worse than an admitted gap); `serializeTrack`/`exportGPX` still key
off each point's OWN flag, so a genuinely mixed route degrades gracefully even
though the only tested scenario (and the realistic one, since `getSamplingTerrain`
caches its result for the manager's lifetime) is fully-known or fully-unknown.
Distance and the opt-in Steepness overlay are untouched — the PRD singles out
elevation-derived figures, not geometry.

**Notice semantics:** `CesiumManager.getSamplingTerrain()` fires a new
`onTerrainAvailability` callback once, only on a provider-construction failure
(no Ion token / offline) — not on a per-call `sampleTerrainMostDetailed` rejection
(tile-fetch hiccup), which is a narrower, transient failure that per-point honesty
already covers without needing a session-wide banner. Both `TrackDrawer` and
`WaypointManager` wire it into one shared `terrainUnavailable` React state in
`TripPlanningMap` (monotonic — never resets false once true, dismissible via the
existing `.map-btn-inline` X pattern).

**Reopen distinguishes unknown from sea level:** `loadRoutes`/`loadWaypoints` read
`elevationKnown` straight off whether the persisted point carried an `elevation`
key at all (no `?? 0` default on `Track.metadata.elevationGain/elevationLoss`,
`hasOwnProperty` check in `WaypointManager.addWaypoint` to tell "no value given"
from "explicitly unknown") — and never re-sample, per the issue's explicit "no
re-sampling required in this slice."

Two-axis /review caught one real gap before commit: the new `onTerrainAvailability`
call in `getSamplingTerrain()` didn't re-check any teardown signal after its await
— ADR 014 requires every new async path in this class hierarchy to do so. Fixed by
promoting a `destroyed` flag from `WaypointManager` up into `CesiumManager` (both
subclasses now share it instead of `WaypointManager` keeping its own copy), guarding
the new callback with it. Caught via a dedicated race test — extended the fake with
a `setProviderManual`/`flushProvider` pair (mirroring the existing terrain-sampling
manual mode) since the provider construction itself had no controllable delay
before this. Fixed red-first.

41 Vitest tests (TrackDrawer 28, WaypointManager 9, routeUpsert 4 — up from 36);
node:test, tsc, lint green. **Outstanding:** the acceptance criteria's manual-verify
spirit — a browser run-through with Cesium Ion misconfigured, confirming the notice
appears, the stats panel shows "Climb: unavailable", and a finished route persists
with elevation genuinely absent from the network payload.
