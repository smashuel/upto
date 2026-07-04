# 02 — Migrate map services to `import from 'cesium'` + move the test seam to `vi.mock`

Status: shipped (a10ef2a, 2026-07-04)

## Parent

.scratch/npm-cesium-typed/PRD.md

## What to build

Convert every map **service** consumer of Cesium from the `window.Cesium` global to a module
import of `cesium`, so the service layer gains real compile-time types. The files:
`CesiumManager` (base), `TrackDrawer`, `WaypointManager`, `NoteManager`, `TrailLayerManager`,
`RouteFlyover`, `MapCamera`. Use a single, consistent import style across them (namespace vs
named is the implementer's call, but pick one and make it the documented default for new map
files). Type the high-value surfaces the global was hiding — `CesiumManager`'s protected
`viewer`/`handler`/`samplingTerrain` and `ElevationPoint.position`/`cartographic` are the
best targets — and drop the blanket `eslint-disable no-explicit-any` / inline `: any` on
Cesium objects **wherever real types now flow**. A few narrowly-scoped, commented `any`s for
genuinely awkward Cesium shapes are fine — the goal is "typed by default", not zero-`any`.

The coupled change: the ADR-013 boundary tests currently inject the fake by setting
`globalThis.window.Cesium` (`installFakeCesium`). Once these services import the `cesium`
module they no longer read the global, so the fake must be registered as the `cesium`
**module mock** (`vi.mock('cesium', …)`) returning the **existing** fake object. Preserve the
fake's spherical-math implementation and its four terrain modes (auto / manual / unavailable /
sample-reject) verbatim — only the injection mechanism moves. This is the single seam that
changes in the whole migration.

`TripPlanningMap` is intentionally **not** migrated here — it keeps reading the bootstrapped
global (from slice 01), so the app stays fully working while the service layer moves.

## Acceptance criteria

- [ ] All seven service files resolve Cesium via a module import, not `window.Cesium`
- [ ] `installFakeCesium` registers the fake through `vi.mock('cesium', …)`; the fake's math and its four terrain modes are unchanged
- [ ] The pre-existing `TrackDrawer`, `WaypointManager`, and `routeUpsert` suites pass **unchanged** (same cases: finish-before-enrichment race, terrain-unavailable degradation, elevation backfill, distance math) — not weakened into import/smoke tests
- [ ] `CesiumManager`'s protected fields and `ElevationPoint`'s Cesium fields carry real types; blanket `eslint-disable no-explicit-any` headers are removed from these files where types now flow
- [ ] App still runs end-to-end (TripPlanningMap via the still-bootstrapped global): draw route, waypoint, elevation, flyover, notes, trail discovery all behave as before
- [ ] `npm test` and `npm run build` (`tsc && vite build`) pass

## Blocked by

- .scratch/npm-cesium-typed/issues/01-bundle-cesium-bootstrap-global.md
