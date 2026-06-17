---
type: plan
status: in-progress
created: 2026-06-17
related: [src/components/map/TripPlanningMap.tsx, src/services/TrackDrawer.ts, src/services/CesiumManager.ts, src/services/MapPerformance.ts, src/services/TrailSnapService.ts]
tags: [map, cesium, performance, routing, offline, plan]
---

# Cesium map polish — grounded plan

> **History:** the lower half of this file is the original strategy brief (research on CesiumJS rendering, Valhalla routing, offline). It was written from *symptoms* without reading the code. On 2026-06-17 the codebase was audited against it — and **most of it was already implemented.** This top section is the corrected, code-grounded version. Trust this; treat the brief below as background research.

## Ground-truth audit (2026-06-17)

| Brief recommendation | Reality in code |
|---|---|
| Clamp tracks to terrain (the "#1 glitchy-feel fix") | ✅ **Done.** Every polyline in [TrackDrawer.ts](../../src/services/TrackDrawer.ts) sets `clampToGround: true` (preview, casing, core, slope overlay, edit polyline). |
| Commit dynamic geometry to static on drag-end | ✅ **Done.** Edit mode uses a `CallbackProperty` polyline during drag, then `exitEditMode()` → `renderTrack()` commits static entities. |
| `depthFailMaterial` for occlusion | **N/A.** Moot — terrain-clamped lines drape on the surface and can't clip through it. The brief's depthFail advice applies to *elevated* polylines, which this app doesn't use. |
| Casing + core outline look | ✅ **Done.** White casing under a colored core. |
| Hover-synced elevation profile (brief's "highest-impact UX add") | ✅ **Done.** `ElevationChart` in [TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx) + `handleProfileHover` driving a `CLAMP_TO_GROUND` point entity. |
| Slope/steepness gradient coloring | ✅ **Done.** `slopeColor` + the Steepness overlay. |
| 2D/3D morph, flyover chase-cam | ✅ **Done.** `handleSceneModeChange` (morphTo2D/3D), `RouteFlyover`. |
| `depthTestAgainstTerrain = true`, FXAA off, MSAA on, native resolution | ✅ **Already set** in viewer init. |
| Government basemaps (LINZ/AU), viewport auto-switch | ✅ **Done.** |

**Conclusion:** the map is far more polished than the brief assumed. The brief's Stage 1.2 (track rendering) and most of Stage 2 (UX polish) were already shipped. The genuinely unbuilt, high-leverage items are narrower than the brief implies.

## Remaining work — re-scoped

| # | Item | Leverage | Risk / blocker | Status |
|---|------|----------|----------------|--------|
| 1 | Device-tier performance preset | High (mobile FPS) | Low — visual-only, desktop unchanged | ✅ **SHIPPED 2026-06-17** |
| 2 | `requestRenderMode` (on-demand rendering) | **Highest** (CPU 25%→3%, battery) | Medium — subtle "controls don't update till camera moves"; needs device verification | Planned, turnkey (call-sites mapped below) |
| 3 | npm-bundle Cesium + official TS types | Medium (kills the all-`any` surface) | Medium — build change can break asset loading; do as its own isolated PR | Planned |
| 4 | Valhalla + Meili real trail routing/snapping | Medium-High (routing quality) | High — self-host infra; `TrailSnapService` is DOC-only ad-hoc today | Backlog (own project) |
| 5 | PWA offline tile cache | High (safety: backcountry) | High — SW + IndexedDB infra; storage limits | Backlog (own project) |

### ✅ #1 — Device-tier performance preset (SHIPPED 2026-06-17)

New module [MapPerformance.ts](../../src/services/MapPerformance.ts): `detectDeviceTier()` (desktop = `high`; mobile splits `low`/`mid` on Device Memory API + core count) and `applyPerformanceProfile(viewer, tier)`. Wired into the viewer init in [TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx), replacing the previously-hardcoded quality lines.

- `high` tier = the exact prior settings (resolutionScale 1.0, SSE 1.333, MSAA 4×, atmosphere on) → **zero desktop regression**.
- `mid`/`low` (mobile) → resolutionScale 0.9/0.75, SSE 1.6/2.0, MSAA off, sky+ground atmosphere off (the latter also dodges a known Android black-globe bug). Fog kept on all tiers (cheap, aids depth).
- All numbers live in one file for empirical tuning. Logs the chosen tier to console.
- **Verify on a real phone**: pan should feel smoother; if topo tiles look too soft on mobile, nudge `low.resolutionScale` toward 0.85 and `low.maximumScreenSpaceError` toward 1.6 in `PERF_PROFILES`.

### #2 — requestRenderMode (next; turnkey)

The single biggest CPU/battery win. Switches Cesium from continuous 60 FPS to render-on-demand. The catch: scene mutations only appear when something calls `scene.requestRender()`. This codebase is **Entity-API-heavy** (`viewer.entities.add` everywhere), and the Entity/DataSource layer auto-requests renders on add/remove/modify — so it's much safer here than the generic warning suggests. The audit found exactly these spots that need an explicit `scene.requestRender()` after enabling `requestRenderMode: true` in the `Viewer` options:

1. **[TrackDrawer.ts](../../src/services/TrackDrawer.ts) edit-drag** — the `MOUSE_MOVE` handler mutates `editPoints`, and the live polyline/handles are `CallbackProperty(fn, false)` (non-constant). Under render-on-demand these won't repaint mid-drag. Add `this.viewer.scene.requestRender()` at the end of the `MOUSE_MOVE` and `LEFT_UP` handlers (and after `renderEditHandles()`).
2. **[TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx) `applyBasemap`** — imagery add/remove usually auto-renders, but call `requestRender()` after the swap to be safe.
3. **`handleProfileHover`** — adds/removes the highlight point entity (Entity API auto-renders, but add one `requestRender()` belt-and-braces).
4. **`setOpacity` / slope-overlay toggles** — material changes; request a render after.
5. **RouteFlyover** — drives the camera each tick (camera moves auto-render), so likely fine; verify the replay still animates.

**Verification checklist (needs a human on a device):** draw a route, drag a control point — line must follow the cursor live; toggle Steepness — colors change immediately; swap basemap — tiles change without needing a pan; run flyover — camera animates. If any of those only update *after* you nudge the camera, a `requestRender()` is missing there.

### #3 — npm Cesium bundle (isolated PR)

Move from the CDN `window.Cesium` global ([index.html](../../index.html)) to `import * as Cesium from 'cesium'` with `vite-plugin-cesium`. Recovers compile-time types across all 9 managers (removing the file-wide `eslint-disable no-explicit-any`). Do it **alone**, not bundled with rendering changes — if Cesium asset loading (`CESIUM_BASE_URL`, workers) breaks, the cause must be unambiguous. `@types/cesium` becomes unnecessary (Cesium ships official types since 1.114). Big, finicky, needs `npm run dev` visual confirmation the map still loads.

### #4 / #5 — Routing & offline (own projects)

- **Valhalla + Meili**: replace `TrailSnapService`'s DOC-only ad-hoc snapping with real OSM map-matching (`trace_route`, returns OSM way IDs). Start on openrouteservice/GraphHopper free tier, then self-host Valhalla in Docker for NZ/AU extracts (cheap per-region, aligns with the existing LINZ/AusMap regional focus). Each its own multi-day effort.
- **PWA offline**: service worker (stale-while-revalidate for tiles, cache-first shell) + IndexedDB tile blobs + a "download this area before your trip" flow. A real safety feature, but web storage is regional/partial — be honest about coverage.

## Other findings from the audit (not in the brief)

- **`pickPosition` picks the ellipsoid, not terrain.** [CesiumManager.ts](../../src/services/CesiumManager.ts) `pickPosition` uses `camera.pickEllipsoid`, so drawn points land at sea-level height (~0), and elevation gain/loss + the profile chart are computed from ellipsoid heights, not real terrain. For an alpine safety app this undercounts elevation. Consider `scene.pickPosition` (depth-buffer, real terrain) or sampling `sampleTerrainMostDetailed` along the route at finish. **This is arguably higher safety-value than any rendering polish** — flag for its own task.
- **9 managers each own a `ScreenSpaceEventHandler`.** The brief worried about "input fighting." In practice each gates on a mode flag so they don't truly conflict — leave as-is unless real conflicts surface. Not worth a refactor now.
- **Cesium ion licensing** still needs a commercial-use decision (brief §5) before any paid launch — unchanged, still open.

## Recommended order from here

1. ✅ Performance preset (done) — verify on your phone, tune `PERF_PROFILES` if needed.
2. **requestRenderMode** — small, turnkey, biggest battery win; the call-sites are mapped above. Ship + verify with the checklist.
3. **Terrain-accurate picking** (the `pickEllipsoid` finding) — real safety value for elevation numbers.
4. npm Cesium bundle — isolated PR, when you want the type safety.
5. Valhalla routing, then PWA offline — each its own project when prioritised.

---
---

# (Original research brief — background only; superseded by the audit above)

# Polishing "upto" (upto.world): A CesiumJS-Native Plan for Smoother Routing & Track-Highlighting UX

## TL;DR
- **Build on Cesium, don't rebuild.** Nearly every "glitchy" symptom (tracks clipping through hills, flicker, jagged lines, battery drain) maps to known CesiumJS settings and APIs — clamp-to-ground ground primitives, `depthFailMaterial`, `requestRenderMode`, `resolutionScale`, and `maximumScreenSpaceError` — not to fundamental engine limits. Ayvri, the gold-standard 3D flyover app, is itself built on CesiumJS + Cesium ion, which proves the stack can deliver the target polish.
- **Highest-leverage fixes, in order:** (1) render tracks as clamped `GroundPolylinePrimitive`s in a `PolylineCollection` with a glow/outline material and a `depthFailMaterial`; (2) ship a "mobile preset" (`requestRenderMode`, lower `resolutionScale`, higher globe SSE, atmosphere/fog/shadows off); (3) add a linked, hover-synced elevation profile chart; (4) bundle Cesium via npm + Vite to recover TypeScript safety; (5) add a service-worker/IndexedDB offline tile cache for backcountry safety.
- **Routing/snapping:** use **Valhalla** (pedestrian/bike costing, elevation, and the **Meili** map-matching/trail-snapping service in one engine, MIT-licensed) — self-host for production, with **openrouteservice** or **GraphHopper** free tiers as a fast start. Keep Cesium World Terrain (Cesium ion free tier) for 3D terrain, with MapTiler quantized-mesh terrain as the paid/self-host fallback.

## Key Findings

### 1. The stack is correct; the problems are configuration, not architecture
CesiumJS is the right engine and migrating away would be a strategic error. The decisive evidence: **Ayvri** — the app whose 3D flyover the brief holds up as a benchmark — is, per Cesium's own September 14, 2018 case study, an app whose "3D visualizations are built with CesiumJS, with terrain powered by Cesium ion," and which "serves sporting events, from the Tor des Géants ultramarathon to the Ultra Trail du Mont Blanc to the Wings for Life World Run." The features upto wants are the features Cesium was built to deliver. The user's instinct to build on Cesium is correct.

The competitors split into two camps:
- **2D/2.5D raster-vector camp (Strava, AllTrails, Komoot):** these are **Mapbox GL JS / WebGL2 vector-tile** apps over OpenStreetMap data, not 3D globe engines. AllTrails throws a "MapboxGL error" if WebGL2 is unavailable. Strava historically used Mapbox and, per its official press release (San Francisco, March 6, 2025), "unveiled a major upgrade to its maps... Powered by the company's proprietary Map Rendering Engine (MRE), Strava's maps now utilize technology from FATMAP, an outdoor adventure platform acquired in 2022," reaching "more than 150 million users." These are not directly comparable to a Cesium globe — they are a different rendering paradigm — so copying their *look* is more useful than copying their *tech*.
- **True-3D camp (Ayvri, FATMAP, Google Earth):** Ayvri = CesiumJS. FATMAP built proprietary 3D terrain from tri-stereo satellite imagery at ~2 m grid resolution; Strava acquired it (announced Jan 24, 2023; FATMAP had raised ~$30M) and rebuilt it into the MRE. upto sits squarely in this camp and CesiumJS is the only mature open engine in it.

### 2. Track rendering: the #1 source of "glitchy" feel, fully fixable
Cesium gives several polyline paths, and the right choices eliminate the common glitches:

- **Clamp tracks to terrain** so they never clip through hills. The Entity API supports `polyline.clampToGround: true`; the Primitive API uses `GroundPolylineGeometry` + `GroundPolylinePrimitive` with `PolylineColorAppearance`, added to `scene.groundPrimitives`. This is the single biggest visual-correctness fix for a terrain app and is the same "polylines on terrain" feature Cesium shipped specifically for draping vector data. (Requires the `WEBGL_depth_texture` extension, universally available on modern mobile WebGL2.)
- **Glow/highlight look:** `PolylineGlowMaterialProperty` (params `color`, `glowPower`, `taperPower`) gives the soft neon highlight; `PolylineOutlineMaterialProperty` (`color`, `outlineWidth`, `outlineColor`) gives a crisp contrasting border that reads well against busy satellite imagery. Note a known limitation discussed repeatedly on the Cesium forum: the glow color defaults toward white and is awkward to fully recolor — test before committing to a brand color.
- **Clipping/occlusion glitches (track disappears or shows through terrain):** this is governed by `scene.globe.depthTestAgainstTerrain`. With it on, sloped/elevated polylines can vanish at certain camera angles; the fix is a `depthFailMaterial` (render the occluded portion in a faded style) — Cesium's intended "show-through" mechanism. **Important gotcha for upto's TrackDrawer:** `depthFailMaterial` does **not** work for dynamic polylines driven by `CallbackProperty` (the pattern used during drag-to-reroute) — only for static polyline geometry (CesiumGS issue #5333 and forum confirmations). So commit the geometry to a static primitive once the drag ends.
- **Performance — Entity vs Primitive:** Entities are convenient but each is individually managed. For many static tracks, batch them into a few `PolylineCollection`s — Cesium's docs state: "prefer a few collections, each with many polylines, to many collections with only a few polylines each," and group by update frequency (static in one collection, frequently-changing in another). The Cesium team's own guidance: dynamic polylines are expensive because the geometry is re-curved to the globe and re-uploaded to the GPU every change; one user reported going from 3 FPS to 60 FPS by avoiding the per-frame `PolylineCollection.update` loop. **Recommendation:** Entities for the one or two actively-edited tracks; batched `PolylineCollection` / `GroundPolylinePrimitive` for the many read-only tracks.
- **Version-specific flicker:** there are open CesiumGS issues describing depth-test/z-fighting (#12337, a regression around 1.123 fixable by setting `depthTestAgainstTerrain = true`) and "Polyline and Globe Rendering Flicker" (#12371, around 1.124). Since upto is on **1.132**, validate tracks against these issues and be prepared to pin a known-good version or apply the documented workaround.

### 3. Mobile performance: a concrete "mobile preset"
Cesium is heavy on low-end phones, but a well-known set of levers recovers smoothness. The single most important is **`requestRenderMode: true`** (since Cesium 1.42), which switches from continuous 60 FPS to on-demand rendering. Cesium's own measurement in its "Improving Performance with Explicit Rendering" blog: "using Chrome developer tools, CPU usage in an idle Cesium scene averaged 25.1%, but after enabling the performance improvement, it now averages 3.0%" (measured on an Intel i7 laptop in Chrome). The key gotcha matching upto's manager architecture: **Entity/Primitive changes that aren't camera moves or tile loads won't appear until you call `scene.requestRender()`** — so each of the 9 managers that mutates the scene must explicitly request a render after committing changes. Also, per cesium-dev issue #6631, "if I create an entity and I set a CallbackProperty to change the position the GPU consumption goes to 100%... when you start drawing a line consumption skyrockets even if you do not move the mouse" — so prefer explicit `requestRender()` over callback-driven geometry for infrequent updates.

The community-consensus mobile preset (assembled from the cesium-dev "Performance optimization on old hardware" thread and Cesium docs; note Cesium publishes no official mobile preset):
- `viewer.resolutionScale = 0.5–0.75` — the biggest single FPS win (renders fewer pixels); roughly doubled framerate in community testing.
- `viewer.scene.globe.maximumScreenSpaceError = 4` to `16` (default is 2) — higher = fewer/lower-res terrain & imagery tiles loaded.
- `viewer.scene.globe.tileCacheSize` — default 100 (a tile count, not MB); raise for smoother zoom-out/in at the cost of memory, lower on low-RAM phones.
- `viewer.scene.fog.enabled = false`, `viewer.scene.skyAtmosphere.show = false`, `viewer.scene.globe.showGroundAtmosphere = false` — each removes a per-frame cost; disabling ground atmosphere also fixes a known black-globe bug on some Android devices (CesiumGS #10442).
- `viewer.scene.msaaSamples = 1` (MSAA off) and FXAA off (`postProcessStages.fxaa.enabled = false`, already default since PR #8057) on low-end devices; MSAA (2/4/8, WebGL2 only) can be enabled on capable devices for crisp edges.
- Shadows/lighting off: `viewer.shadows = false`, `viewer.scene.shadowMap.enabled = false`, `globe.enableLighting = false`, sun/moon/stars hidden.

**Recommendation:** implement a device-tier detector that applies the aggressive preset on low-end mobile and a higher-quality preset on desktop, with `requestRenderMode` on everywhere.

### 4. Routing & trail-snapping: Valhalla is the best fit
For OSM-based hiking/alpine routing the open options are Valhalla, GraphHopper, OSRM, BRouter, and openrouteservice (ORS, built on GraphHopper). Assessment for an alpine/ski/hiking app:

- **Valhalla (MIT license) — recommended primary.** It has pedestrian and bicycle costing, elevation sampling, isochrones, and — uniquely valuable for upto — built-in **map-matching via Meili** (`trace_route` to snap a drawn/recorded track to OSM ways and return a clean route; `trace_attributes` to return per-edge attributes including `way_id`). Meili uses a Hidden-Markov-Model + Viterbi matcher; default matching handles up to ~200 km traces (configurable). Tile-based, low memory at serve time (4–8 GB RAM typical), runs offline/onboard. This single engine covers both "route me along trails" and "snap my GPS track to trails." Mapbox's Map Matching API is literally Valhalla under the hood, which validates the choice. (Notably, Tesla chose Valhalla for in-car navigation for its runtime flexibility.)
- **GraphHopper (Apache 2.0)** — strong middle option; supports a `hike` profile, exposes OSM `sac_scale` as `hike_rating` and `mtb_rating` path details plus `max_slope`, plus elevation and snap-to-road. Note its matrix and truck code is closed-source. Good if you prefer Java.
- **openrouteservice** — ORS is built on GraphHopper, offers foot/hiking/wheelchair profiles, elevation, and a free hosted tier; good for a fast start before self-hosting.
- **OSRM** — fastest raw routing but rigid: no native elevation, profile changes require rebuilding the whole graph, and it needs huge RAM to preprocess (300+ GB for the planet). Weak fit for hiking; community tests show its foot routing is less accurate than Valhalla/GraphHopper.
- **BRouter** — bike/foot focused, extremely customizable per-request profiles via its own scripting language; great for offline and niche profile tuning, smaller ecosystem.

**Free hosted tiers / limits to know:** openrouteservice's Standard (free) plan defaults to **2,000 directions requests/day** with a sliding-window cap of **~40 directions requests/minute** (returns HTTP 429 when exceeded), and per-request caps including foot/cycling/driving max distance **6,000 km** and **50 route waypoints**. For map-matching at scale, self-host Valhalla in Docker (gis-ops images) — building planet tiles is disk/CPU-heavy (use SSD), but per-region extracts (e.g. New Zealand, Australia) are cheap and align with upto's existing LINZ/AusMap regional focus.

**Map-matching options summary:** Valhalla Meili (self-host, free, MIT); OSRM `/match` (fast, no elevation); Mapbox Map Matching API (paid, = Valhalla). For upto, Meili is the clear pick — same engine as routing, OSM way IDs returned, and the trail-snapping the TrailSnapService needs.

### 5. Terrain & basemap sources
- **Cesium World Terrain via Cesium ion (recommended, keep).** Quantized-mesh, global, with optional vertex normals (lighting) and water mask. **Free tier = Cesium ion "Community" plan, free for individual/non-commercial and evaluation.** Commercial use requires a paid plan: per Vendr's 2025 marketplace listing, the Commercial plan is **$149/month for individuals and $524/month for teams** (≈$6,288/year for teams), with streaming/storage quotas. **Action item:** upto must confirm whether its usage is "commercial" under Cesium ion's Plan FAQ (the threshold references ~$50K revenue/funding) and budget for a paid tier if so. (Note: Bentley Systems acquired Cesium in 2024; CesiumJS itself remains Apache-2.0 and free.)
- **MapTiler quantized-mesh terrain** — drop-in `CesiumTerrainProvider` alternative, free tier on MapTiler Cloud, and available for on-prem/self-host (GeoPackage, derived from SRTM/ASTER/EU-DEM/ArcticDEM open data). Good paid/independence fallback if Cesium ion costs or limits bite.
- **Open elevation APIs for the elevation profile chart** (separate from 3D terrain mesh): **OpenTopoData** public API (free; max 100 locations/request, 1 call/sec, 1,000 calls/day — self-host for production), **Open-Elevation** (free, ~1 req/sec etiquette), and **OpenTopography** (API-key, 50 calls/day non-academic, higher with OpenTopography Plus). For production, query terrain heights client-side with Cesium's `sampleTerrainMostDetailed` along the track instead of an external API — no rate limits, and consistent with the rendered terrain.
- **Basemap imagery/topo (free/open):** OpenStreetMap raster, **OpenTopoMap** (CC-BY-SA; tile.opentopomap.org, contact for heavy use; the openmaps.fr mirror allows <500k tiles/month free for non-commercial with attribution), ESRI free tiers, Bing (free <10k transactions/month via the ion default). upto's existing **LINZ (New Zealand)** and **Australian government** basemaps are excellent open-government sources — keep and extend that pattern country-by-country.

### 6. UI/UX patterns that create "polish"
The gap between a glitchy custom app and Strava/AllTrails is mostly interaction polish, not raw graphics:
- **Linked elevation profile with hover sync** — the highest-impact UX addition. Hovering the chart highlights the matching point on the 3D track (and vice versa). Proven pattern: D3/Chart.js area chart, bisect the distance axis on `mousemove`, render a "blip"/marker entity at the corresponding Cartesian on the map. Mature references: Leaflet.Elevation / leaflet-elevation (D3), and bikerouter's profile (tooltip always highlights the map point, data-simplification for long routes with a visible warning when active, draggable chart height saved between visits). For upto, drive a Cesium billboard/point entity from chart hover.
- **Cinematic flyover / chase-cam** — Cesium's `camera.flyTo` uses great-arc interpolation with easing (`EasingFunction.CUBIC_IN_OUT`, `QUADRATIC_IN_OUT`); for a smooth chase-cam along a track, drive the camera each tick from a `SampledPositionProperty` and orient with `VelocityOrientationProperty` (the standard flight-tracker pattern). Use `pitchAdjustHeight`/`flyOverLongitude` for arcs, and `cancelFlight` before starting a new one. This is exactly the Ayvri-style replay; upto's RouteFlyover already does this — refine easing and avoid the known "camera bounces near the ground" issue by keeping a minimum altitude offset.
- **Draggable waypoint rerouting** — keep the active edited segment as an Entity with a `CallbackProperty`, re-query the routing engine on drag-end (not every mouse-move), then commit to a static clamped primitive (so `depthFailMaterial` works and the GPU idles under `requestRenderMode`).
- **Color-by-gradient/steepness** — upto already has this; align the palette to a recognizable safety standard (Strava's MRE uses an "Avalanche Gradient" layer that "shows only the slope gradients where an avalanche is likely to release, from 25° to 45°+," plus a general gradient layer from 0°–90°) so the coloring carries meaning, not just decoration.
- **Clean control layout, 2D/3D toggle, smooth transitions** — Cesium's scene-mode morph handles 2D↔3D; gate it behind a clear toggle and animate. Consolidate the per-manager controls into one minimal, mobile-first control cluster; the proliferation of 9 managers each owning a `ScreenSpaceEventHandler` is a likely source of input "fighting" (multiple handlers reacting to the same gesture) — centralize input handling.

### 7. PWA & offline caching (a safety feature, not a nicety)
For a backcountry app, offline maps are a safety requirement (FATMAP explicitly offered offline maps; the Strava community thread shows users canceling subscriptions when offline FATMAP downloads were dropped in the integration). The realistic web approach:
- **Service worker** intercepts tile requests; use **stale-while-revalidate** for tiles (the strategy the Google Maps PWA uses for map tiles) and **cache-first** for the app shell, **network-first** for user/route data.
- **IndexedDB** (via a wrapper like Dexie or idb) stores tile blobs and structured route data; the Cache Storage API stores app assets. Per web.dev, Chrome allows an origin up to ~60% of total disk and the browser up to 80%, with quota shared across all storage. This is enough for meaningful regional caches of terrain + imagery tiles, but **full offline 3D terrain for a large region is large** — be honest with users about coverage and let them pre-download a bounding box before a trip.
- **Limits to flag honestly:** iOS Safari has tighter storage caps and evicts more aggressively; clearing browser data wipes everything; quantized-mesh terrain tiles plus high-res imagery add up fast. A web PWA can deliver "most of the route you pre-loaded works offline," not "the whole globe in your pocket." Native wrappers remain the future-backlog path for guaranteed offline.

### 8. TypeScript safety: bundle Cesium via Vite
The all-`any` problem comes from loading Cesium as a CDN global. The fix is well-trodden:
- **Install `cesium` via npm and import it** (`import * as Cesium from "cesium"` — not a default import). Since CesiumJS 1.114 the Vite setup no longer needs the old `rollupOptions.external: ["http","https","url","zlib"]` hack. Cesium ships **official TypeScript definitions** in the package — so `@types/cesium` is no longer needed (and is in fact discouraged; Resium's docs confirm "@types/cesium is no longer needed because [Cesium] supports Cesium official type definition").
- **Two required steps** beyond `npm i`: import the Widgets CSS, and copy Cesium's static assets (workers, Assets, Widgets) into the build, setting `window.CESIUM_BASE_URL`. The official `cesium-vite-example` repo and community plugins (`vite-plugin-cesium`, and the newer `vite-plugin-cesium-engine` for the lean `@cesium/engine` core without the default Viewer UI) automate this.
- **Tradeoffs:** bundling increases build complexity slightly and Cesium is large, but you gain compile-time type safety across all 9 managers, tree-shaking (especially with `@cesium/engine`), versioned/locked dependencies, and Vite's caching — versus the CDN's shared-cache benefit and zero build cost. For a TypeScript codebase with the stated "everything is any-typed" pain, **bundling is the right call.** A facade/wrapper layer typing each manager's Cesium surface area adds further safety without converting everything at once.

## Details: Build-on vs Rebuild, per subsystem
- **TrackDrawer** — *Build on.* Switch read-only tracks to batched clamped `GroundPolylinePrimitive`s; keep the active edit as an Entity; commit-to-static on drag-end. Add `depthFailMaterial`. This resolves clipping + flicker + the dynamic-polyline `depthFailMaterial` limitation.
- **CesiumManager base + 9 managers** — *Build on, but centralize input.* Consolidate the multiple `ScreenSpaceEventHandler`s into one dispatcher to stop gesture conflicts, and ensure every scene mutation calls `scene.requestRender()`.
- **RouteFlyover** — *Build on.* Refine easing + sampled-position chase-cam; fix near-ground bounce.
- **TrailSnapService** — *Build on, swap backend.* Back it with Valhalla Meili (`trace_route`) for real OSM trail snapping rather than ad-hoc geometry snapping.
- **MapCamera** — *Build on.* Standardize `flyTo` easing and a minimum-altitude guard.
- **LinzMapService / AusMapService / BasemapSuggest** — *Build on.* Strong pattern already; extend to more open-government basemaps and add the offline tile cache layer here.
- **WaypointManager / NoteManager** — *Build on.* No engine reason to rebuild.
- **Build system / typing** — *Rebuild (the loader only).* Move from CDN global to npm + Vite bundling with official types. This is the one "rebuild" worth doing now because it de-risks every other change.

## Recommendations (staged)

**Stage 1 — Stop the "glitchy" feeling (1–2 weeks, highest leverage):**
1. Migrate Cesium from CDN global to npm + Vite bundle with official TS types (`vite-plugin-cesium` or the official example). Recover type safety first so the rest is safer.
2. Re-implement track rendering: clamped `GroundPolylinePrimitive` in batched `PolylineCollection`s, `PolylineOutlineMaterialProperty` for the base line and `PolylineGlowMaterialProperty` for selection/hover, `depthFailMaterial` on static tracks.
3. Ship the mobile preset behind a device-tier check: `requestRenderMode` everywhere, `resolutionScale` 0.5–0.75 on mobile, globe SSE 4–16, fog/atmosphere/shadows off. Audit every manager to call `scene.requestRender()` after mutations.
*Benchmark to hit:* steady 30+ FPS while panning on a mid-range Android; tracks never clip through terrain at any camera angle.

**Stage 2 — Match the competitor polish (2–4 weeks):**
4. Add the linked, hover-synced elevation profile chart (D3 or Chart.js) driving a Cesium marker; pull heights via `sampleTerrainMostDetailed`.
5. Centralize input handling into one dispatcher; refine `flyTo` easing and the flyover chase-cam.
6. Wire drag-to-reroute and trail snapping to Valhalla + Meili (start on openrouteservice/GraphHopper free tier, then self-host Valhalla in Docker for NZ/AU extracts).
*Benchmark:* hovering the chart highlights the exact track point smoothly; rerouting feels instant (<300 ms perceived).

**Stage 3 — Backcountry-grade & cost control (4+ weeks):**
7. Add the PWA service worker + IndexedDB tile cache with a "download this area" pre-trip flow; be explicit about coverage limits.
8. Resolve Cesium ion commercial licensing; if cost/limits bite, evaluate MapTiler quantized-mesh terrain (free tier or self-host).
*Benchmark:* a pre-downloaded region renders terrain + tracks with the network disabled.

**Triggers that change the plan:**
- If 1.132 polyline flicker (issues #12337/#12371) proves unfixable by config, pin to a known-good Cesium version rather than rebuilding.
- If Cesium ion streaming quotas or commercial pricing ($149/mo individual, $524/mo team) exceed budget, switch terrain to MapTiler/self-hosted quantized mesh.
- If self-hosting Valhalla proves too heavy, stay on openrouteservice (≤2,000 directions/day, ~40/min) or GraphHopper hosted free tiers until volume justifies infra.
- Native wrapper (Capacitor/PWA→native) only becomes worthwhile if guaranteed full-region offline becomes a hard product requirement.

## Caveats
- **Source quality:** competitor internals are partly inferred from support docs, press releases, and a Strava community engineering post; Strava's MRE internals (beyond "built on FATMAP, moved off third-party providers") are not publicly documented in depth. Treat exact rendering-tech claims about closed apps as best-available, not authoritative.
- **No official Cesium mobile preset exists** — the preset here is community-synthesized from forum threads and docs; values (especially `resolutionScale`, globe SSE, `tileCacheSize`) must be tuned empirically on target devices.
- **Cesium version risk:** several polyline rendering regressions are tied to specific 1.12x releases; upgrades should be validated against your track-rendering test scenes, not assumed safe.
- **Licensing must be verified, not assumed:** Cesium ion free-tier eligibility, OpenTopoMap/openmaps.fr volume rules, and OSM/ODbL attribution obligations all carry conditions; confirm against the live terms before launch. Note Bing/Google imagery accessed via ion may not be used for routing/asset-tracking under their third-party terms.
- **Offline 3D has hard physical limits:** browser storage quotas and quantized-mesh + imagery size mean web offline is regional and partial, not global.
