---
type: journal
date: 2026-07-03
status: done
tags: [map, cesium, trackdrawer, waypoints, elevation, terrain, safety]
---

# 2026-07-03 — Honest degradation when terrain is unavailable (Stream 1 closer)

**Symptom:** when Cesium World Terrain can't load (no Ion token, offline), every
elevation quietly reads 0 — indistinguishable from a genuinely flat route. For a
safety app, an unknown number presented as a measurement is worse than an admitted
gap. ([issue 05](../../.scratch/terrain-accurate-picking/issues/05-honest-degradation-terrain-unavailable.md),
closing [PRD](../../.scratch/terrain-accurate-picking/PRD.md) Stream 1)

**Fix:** a per-point `elevationKnown: boolean` sits alongside `TrackPoint.elevation` /
`Waypoint.metadata.elevation`. The number itself never becomes optional — distance
math and rendering keep working off whatever value they have — only whether it's
*presented as a measurement* changes. `computeStats`'s `elevationKnown =
points.every(p => p.elevationKnown)` collapses a route to fully-unknown the moment
even one point was never confirmed (a gain/loss partly computed from a fake delta
is worse than an admitted gap); `serializeTrack`/`exportGPX` key off each point's
own flag independently, so a genuinely mixed route still degrades sensibly even
though the only realistic/tested scenario is fully-known or fully-unknown (terrain
availability is cached for the manager's whole lifetime once resolved).

Downstream: the stats panel shows "Climb: unavailable" instead of "0 m" and hides
the elevation chart entirely rather than plotting a flat lie; GPX omits `<ele>`
tags per-point; a route reopened without elevations renders its geometry normally
(clamp-to-ground, height is cosmetic there) and stays honestly unknown — no
re-sampling on load, matching the issue's explicit "no re-sampling required in this
slice, just don't destroy the distinction."

**New signal:** `CesiumManager.getSamplingTerrain()` gained an
`onTerrainAvailability` callback, fired once per manager instance the first time
terrain-provider construction resolves. Deliberately narrow: it fires false only on
a provider-construction failure (no token/offline), not on a per-call
`sampleTerrainMostDetailed` rejection (tile-fetch hiccup) — that transient case is
already covered by per-point honesty without needing a session-wide banner. Both
`TrackDrawer` and `WaypointManager` wire it into one shared, monotonic
`terrainUnavailable` state in `TripPlanningMap` — a small dismissible amber pill,
never interrupting drawing.

**Review caught a real gap:** the new `onTerrainAvailability` call didn't re-check
any teardown signal after its await — a fresh violation of the invariant
[ADR 014](../decisions/014-settle-window-is-a-real-state.md) had just written down
the day before ("any new async path in a map manager MUST re-check ... after every
await"). Fixed by promoting `WaypointManager`'s local `destroyed` flag up into
`CesiumManager` (both managers now share one flag instead of `WaypointManager`
keeping a private copy) and guarding the callback with it. Confirmed with a
dedicated race test — the fake had no way to control the terrain-*provider's own*
resolution timing (only sampling had a 'manual' mode), so extended it with a
`setProviderManual`/`flushProvider` pair mirroring the existing pattern. Red before
the fix, green after.

**Invariant reinforced:** ADR 014's stranding discipline isn't just a TrackDrawer
thing — it applies to anything added to the shared `CesiumManager` base too, and
the review process is what catches new code quietly breaking a day-old rule.

Stream 1 (terrain-accurate elevation) is now fully shipped: 5 slices, 41 Vitest
tests at the TrackDrawer/WaypointManager boundary, tsc/lint/node:test green
throughout.
