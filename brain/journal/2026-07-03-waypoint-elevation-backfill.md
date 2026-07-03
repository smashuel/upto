---
type: journal
date: 2026-07-03
status: done
tags: [map, cesium, waypoints, elevation, terrain]
---

# 2026-07-03 — Waypoint elevation backfill (terrain-accurate-picking slice 04)

**Symptom:** waypoints placed on the map (huts, summits, hazards) stored the picked
height — flat ellipsoid in the wizard's default 2D view — so the infobox reported
"0m" on a mountainside and the serialized waypoint carried a false elevation.
([issue 04](../../.scratch/terrain-accurate-picking/issues/04-waypoint-elevation-backfill.md))

**Fix:** hoisted the terrain-sampling helper (`getSamplingTerrain` +
`enrichElevation`, previously private to `TrackDrawer`) up into the shared
`CesiumManager` base as protected members, keyed on a small `ElevationPoint`
interface (`position` + `cartographic` + `elevation`) that both `TrackPoint` and
`Waypoint` satisfy structurally. `WaypointManager.addWaypoint` now fires a
fire-and-forget `backfillElevation` pass on fresh placement — pin appears
instantly, height corrects a moment later, same contract as route points.
Rehydrated waypoints (`loadWaypoints`) opt out: trusted as already-settled, no
re-sampling on every view-page mount.

**Review caught a real gap:** ADR 014 (settle-window hardening, landed the day
before) explicitly named "waypoint backfill is slice 04" as the next place its
epoch-guard pattern would need to show up. It was right — `WaypointManager` had no
guard against being destroyed mid-backfill; a stray resolution would still find the
waypoint in the (never-cleared) array and repaint its entity against a torn-down
viewer. Fixed with a `destroyed` flag, checked alongside the existing
delete/clear-safety check. Scaled down from `TrackDrawer`'s epoch mechanism
deliberately — waypoints have no drawing *session* to strand, just independent
per-object async work to abandon on teardown.

**Process note worth remembering:** the first version of the destroy-guard test
passed *before* the fix existed — a false green. `flushTerrain()` ran before the
backfill's `sampleTerrainMostDetailed` call had even been queued (it was still
awaiting the async terrain-provider construction), so the assertion never
exercised the race at all. Traced it with a throwaway debug test writing to a
tmpfile (console.log is swallowed by this vitest config) before trusting the
green. **Lesson:** in manual-terrain-mode tests, always let a tick pass
(`setTimeout(20)`) between triggering the async work and calling `flushTerrain()`
— the same pattern already used in the settle-window test suite for exactly this
reason.

Also surfaced (documented in [features/waypoints.md](../features/waypoints.md), not
fixed — out of this issue's acceptance criteria): the settled elevation reaches
`getWaypoints()` (used by the Export-data button) but never reaches the wizard's
form state. `onWaypointAdded` strips the callback down to `{lat, lng, name}` before
`AdventureLocationStep` sees it. Pre-existing, small, would need its own issue.

7 new WaypointManager Vitest tests; TrackDrawer's 25 unchanged (confirms the hoist
didn't disturb route-point behaviour); node:test/tsc/lint green.
