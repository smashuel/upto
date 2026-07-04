# 03 — Migrate `TripPlanningMap`, remove the global + `@types/cesium` + blanket `any`

Status: shipped (2733e3b, 2026-07-04) — type-tightening carved out to issue 04

## Parent

.scratch/npm-cesium-typed/PRD.md

## What to build

The capstone that removes the last of the old surface. Migrate `TripPlanningMap.tsx` — the
viewer bootstrap and the `Ion.defaultAccessToken` flow — from `window.Cesium` to the module
import, using the same import style slice 02 established. Type the refs and Cesium objects
this file leans on (`viewerRef`, the manager refs, entity/marker handles) wherever real types
now flow.

With the final consumer migrated, tear out the transition scaffolding:

- Delete the `window.Cesium = Cesium` bootstrap assignment from the app entry.
- Delete the `Cesium: any` ambient declaration on the `Window` interface.
- Remove `@types/cesium@1.70` from `package.json` (stale vs the 1.132 runtime; Cesium ships
  its own bundled `.d.ts`) — remove, do not upgrade.
- Remove the blanket `eslint-disable @typescript-eslint/no-explicit-any` headers and inline
  `: any` on Cesium objects across the map stack wherever real types now flow (keep only
  narrowly-scoped, commented `any`s for genuinely awkward shapes).
- Rewrite the CLAUDE.md "Known Quirks" line that says *"Cesium is loaded via CDN (not npm)
  and accessed through `window.Cesium` global — all map services use `any` types"* — it is now
  false.

After this, there is exactly one source of Cesium (the bundled package), no `window.Cesium`
anywhere, and the map stack is typed by default.

## Acceptance criteria

- [ ] `TripPlanningMap.tsx` resolves Cesium via the module import; the Ion-token flow works unchanged
- [ ] No `window.Cesium` reference remains anywhere in `src/`; the `window.Cesium = Cesium` bootstrap and the `Cesium: any` ambient `Window` decl are gone
- [ ] `@types/cesium` is removed from `package.json`; `tsc && vite build` passes on Cesium's bundled types alone
- [ ] Blanket `eslint-disable no-explicit-any` headers removed from map files where real types now flow; `npm run lint` green
- [ ] CLAUDE.md "Known Quirks" CDN/`any` line is rewritten to match reality
- [ ] Full manual run-through passes on `vite build` + `npm run preview`: 2D and 3D, sat↔topo, viewport auto-switch, draw route with live stats + non-zero elevation profile, place waypoint, notes, trail discovery/snapping, flyover, fullscreen, Ion-token path **and** no-token OSM fallback
- [ ] `npm test` passes (ADR-013 suites still green)
- [ ] After merge: tick the "npm Cesium + official TS types" bridge box in brain/project/roadmap.md and note it in status.md

## Blocked by

- .scratch/npm-cesium-typed/issues/02-migrate-services-move-test-seam.md
