# 01 — Bundle Cesium & bootstrap it onto the global (CDN gone, assets self-hosted)

Status: ready-for-agent

## Parent

.scratch/npm-cesium-typed/PRD.md

## What to build

The prefactor that makes the whole migration safe: switch the *runtime source* of Cesium
from the CDN to the pinned `cesium` npm package **without touching any consumer**.

Wire Vite so Cesium's static payload (`Assets`, `Workers`, `ThirdParty`, `Widgets`) is
served from the app's own origin and `CESIUM_BASE_URL` points at it (a Cesium-aware Vite
plugin or an explicit static-copy + `define` are both acceptable — the criterion is "no CDN
request"). Import Cesium's widgets CSS through the bundler. Delete the CDN `<script>` and
widget-CSS `<link>` from `index.html`.

Then, in the app entry, import the package once and assign it to the global that every map
module already reads: `import * as Cesium from 'cesium'; window.Cesium = Cesium`. This is a
deliberate, temporary bridge — it lets subsequent slices migrate consumers to module imports
one at a time while both access styles resolve to the *same* object. Nothing about the map's
behaviour changes; the only observable difference is that Cesium now loads from the bundle,
not `cesium.com`.

Stay on the current 1.132 line — this is a loader swap, not a version upgrade.

## Acceptance criteria

- [ ] `cesium` (1.132 line) is imported at app entry and assigned to `window.Cesium`; all existing map modules keep working unchanged
- [ ] The CDN `<script>` and widget-CSS `<link>` are removed from `index.html`
- [ ] Cesium's `Assets`/`Workers`/`ThirdParty`/`Widgets` are served locally and `CESIUM_BASE_URL` resolves to them
- [ ] Widgets CSS is imported through the bundler (no CDN stylesheet)
- [ ] Manual verify on `npm run dev` **and** on `vite build` + `npm run preview`: the wizard map initialises with **zero** requests to `cesium.com`; terrain, imagery, and web-worker features work; 2D↔3D morph, sat↔topo switch, draw a route (non-zero elevation profile), place a waypoint all behave as before
- [ ] Ion-token path (`VITE_CESIUM_ION_TOKEN`) and the no-token OSM fallback both still work
- [ ] `npm test` and `npm run build` (`tsc && vite build`) pass
- [ ] No backend / Nginx / PM2 / deploy-script change

## Blocked by

None - can start immediately.
