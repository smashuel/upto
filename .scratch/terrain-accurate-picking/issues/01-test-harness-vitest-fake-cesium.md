# 01 — Test harness: Vitest + fake `window.Cesium` (prefactor)

Status: ready-for-agent

## Parent

.scratch/terrain-accurate-picking/PRD.md

## What to build

The repo's first automated tests. Add Vitest (the project is Vite-based; no build
changes expected) and a minimal, purpose-built fake of the `window.Cesium` global —
just enough for the track-drawing manager's paths: cartesian/cartographic
conversions and distance/midpoint math, a stub viewer with an entity collection, a
capturing screen-space input-handler class (so tests can fire LEFT_CLICK /
LEFT_DOUBLE_CLICK programmatically), and a controllable `sampleTerrainMostDetailed`
whose resolution timing and fixture heights the test drives. Do not attempt a
general Cesium mock.

With the harness in place, write characterization tests of the track drawer's
**current** external behaviour at its public boundary (clicks in →
stats/serialized-route callbacks out): drawing two points and finishing emits a
serialized route with the expected waypoints; live drawing stats emit distance and
point count; undo/redo adjust the emitted stats. These tests pin today's behaviour
so the following slices change it deliberately.

Tests assert on callback payloads only — never private fields or internal call
order.

## Acceptance criteria

- [ ] `npm test` (or equivalent script wired into package.json) runs Vitest and passes
- [ ] A fake `window.Cesium` test double exists, minimal and local to the tests
- [ ] Characterization test: click → click → double-click finish emits exactly one serialized route through the route-created callback
- [ ] Characterization test: live drawing stats callback reports point count and distance as points are added
- [ ] Characterization test: undo removes the last point from emitted stats; redo restores it
- [ ] Terrain sampling in tests is controllable (resolve later / resolve with fixture heights / reject)
- [ ] `tsc --noEmit` and `npm run lint` stay green

## Blocked by

None - can start immediately.

## Comments

**2026-07-02 (agent):** Shipped in commit `93c398a`. All acceptance criteria met —
`npm test` chains node:test + Vitest (7 tests), fake supports auto / manual-deferred /
provider-unavailable / sample-reject terrain modes, tsc + lint green. Two-axis review
findings addressed in the same commit: CLAUDE.md + status.md test-framework claims
updated, ADR 013 written, sample-level reject mode added, unused fake members trimmed.
