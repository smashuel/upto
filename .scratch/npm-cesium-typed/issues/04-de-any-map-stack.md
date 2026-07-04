# 04 — De-`any` the map stack: type `viewer`/entities, remove the file-level eslint-disable headers

Status: ready-for-agent

## Parent

.scratch/npm-cesium-typed/PRD.md

## What to build

Slices 01–03 bundled Cesium from npm with real types and proved they flow (the
type-checker caught three latent bugs). But the map files still carry a file-level
`/* eslint-disable @typescript-eslint/no-explicit-any */` because the load-bearing
`any` — `CesiumManager.viewer` — cannot be typed in isolation: typing it as
`Cesium.Viewer` cascades type-checking into every subclass's entity/scene calls
(`entities.add({...})` against strict `Entity.ConstructorOptions`, `scene.*`,
material/property construction), which is a genuine multi-file effort, not a
one-line change. It was deliberately deferred from slice 03 to protect the
"no behavioural change" guarantee.

This issue finishes the PRD's headline goal: type the map stack so the blanket
`eslint-disable no-explicit-any` headers can come off, keeping only narrowly-scoped,
commented `any`s for genuinely awkward Cesium shapes.

Do it file-by-file, tests green at each step:
- Type `CesiumManager.viewer` as `Cesium.Viewer` and `pickPosition`'s param/return
  (`Cesium.Cartesian2` → `Cesium.Cartesian3 | undefined`), then fix the fallout in
  each subclass (`TrackDrawer`, `WaypointManager`, `NoteManager`, `TrailLayerManager`,
  `RouteFlyover`, `MapCamera`) and `TripPlanningMap`.
- Type the entity/marker refs and Cesium option bags where reasonable; where a
  Cesium `ConstructorOptions` shape is genuinely painful, a scoped `any` with a
  reason comment is acceptable.
- Remove each file's blanket `eslint-disable no-explicit-any` header once that file
  is clean (lint runs with `--report-unused-disable-directives`, so a header left on
  a now-clean file fails lint — the two must move together).

## Acceptance criteria

- [ ] `CesiumManager.viewer` is typed `Cesium.Viewer`; `pickPosition` is fully typed
- [ ] Each map file that no longer needs it has its file-level `eslint-disable no-explicit-any` removed; remaining `any`s are line-scoped with a reason comment
- [ ] No behavioural change — the ADR-013 boundary suites and full map run-through are unchanged
- [ ] `tsc --noEmit`, `npm run lint`, and `npm test` all green

## Blocked by

- .scratch/npm-cesium-typed/issues/03-migrate-trippanningmap-remove-global.md (shipped)
