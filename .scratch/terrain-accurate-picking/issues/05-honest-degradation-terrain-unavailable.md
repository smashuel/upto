# 05 — Honest degradation when terrain is unavailable

Status: ready-for-agent

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
