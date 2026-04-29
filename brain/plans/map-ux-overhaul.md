---
type: plan
status: complete
related: [src/components/map/TripPlanningMap.tsx, src/services/TrackDrawer.ts, src/services/TrailLayerManager.ts, src/services/MapCamera.ts, src/services/RouteFlyover.ts, brain/research/map-routing-competitor-patterns.md]
tags: [map, ux, cesium]
---

# Map UX Overhaul

Phased plan to close the UX gap between Upto's Cesium map and the polish of AllTrails / Strava Route Builder / Komoot / Gaia GPS / CalTopo. Phases 1–5 shipped in `main` as of 2026-04-20; Phase 6 (visual refresh) landed 2026-04-21 after user feedback that routes still read as "messy and pixelated" and auto-zoom overshoots.

## Baseline (pre-Phase 1 pain)

- Controls crammed into a Bootstrap `Card.Header` — 14+ buttons in one row
- Route line was flat `Cesium.Color.BLUE`, disappeared against dark terrain
- Elevation profile was 72 px, non-interactive, 2 axis labels
- No drag-to-reroute, no redo
- Camera transitions were instant (jarring)
- NoteManager used `window.prompt()` (still a gap — see below)

## Phase 1 — Visual foundation ✅

| # | Change | Files |
|---|--------|-------|
| 1.1 | Route glow via `PolylineGlowMaterialProperty` (finished: dodgerblue width 10, preview: orange width 8) | `TrackDrawer.ts` |
| 1.2 | Smooth camera — `flyTo` with `duration: 1.0–1.5` everywhere; `morphTo2D/3D` with `1.5` | `TripPlanningMap.tsx` |
| 1.3 | Trail layer loading indicator — pulsing dot during fetch; `onLoadingChange` callback | `TrailLayerManager.ts` |
| 1.4 | Elevation chart — 140 px, horizontal grid lines, more axis labels, 10 px font | `TripPlanningMap.tsx` (ElevationChart) |

## Phase 2 — Controls overhaul ✅

| # | Change | Files |
|---|--------|-------|
| 2.1 | Controls moved to floating overlays (top-left mode pill, top-right layers, bottom-right export/flyover, bottom-center route controls) | `TripPlanningMap.tsx`, `globals.css` |
| 2.2 | `NoteModal.tsx` scaffolded as Bootstrap modal with title/content/type — **still needs wiring into `NoteManager`** | `src/components/map/NoteModal.tsx` |
| 2.3 | Mobile breakpoints — 44 px touch targets, FAB collapse at `max-width: 640px` | `globals.css` |

## Phase 3 — Interaction depth ✅

| # | Change | Files |
|---|--------|-------|
| 3.1 | Interactive elevation profile — hover crosshair + tooltip + pulsing dot on map; two-way hover sync | `TripPlanningMap.tsx`, `TrackDrawer.ts` |
| 3.2 | Undo/redo stack — redo button, Ctrl+Z / Ctrl+Shift+Z | `TrackDrawer.ts`, `TripPlanningMap.tsx` |
| 3.3 | Waypoint billboards — SVG icons per type, 24–32 px, `disableDepthTestDistance: Infinity` | `WaypointManager.ts` |

## Phase 4 — Route editing power ✅

| # | Change | Files |
|---|--------|-------|
| 4.1 | **Drag-to-reroute** (biggest gap vs competitors) — midpoint handles on segments, drag inserts new point, drag existing to reposition, re-snaps via `TrailSnapService` | `TrackDrawer.ts`, `TripPlanningMap.tsx` |
| 4.2 | Steepness-gradient route line — per-segment colouring (green<5%, yellow 5-10%, orange 10-15%, red >15%; blue-purple descents) via `CustomDataSource` | `TrackDrawer.ts` |

## Phase 5 — Polish ✅

| # | Change | Files |
|---|--------|-------|
| 5.1 | Trail discovery styling — dashed brown `PolylineDashMaterialProperty` default, glow-blue selected | `TrailLayerManager.ts` |
| 5.2 | Layer management panel — thumbnail buttons for Sat/Topo, 2D/3D toggle, discovery opacity slider | `TripPlanningMap.tsx`, `globals.css` |
| 5.3 | Animated route flyover — play button in bottom-right, `SampledPositionProperty` + `HermitePolynomialApproximation`, auto-switch to 3D | new `RouteFlyover.ts`, `TripPlanningMap.tsx` |
| Bonus | **Topo resolution fix** — `maximumLevel: 19`, `maximumScreenSpaceError = 1.333`, MSAA 4× (fixed blurry bottom of LINZ view) | `TripPlanningMap.tsx` |

## Phase 6 — Route visual refresh ✅ (shipped 2026-04-21)

User feedback: routes still look "messy and pixelated", preselect zoom is "too far out". Research in [research/map-routing-competitor-patterns.md](../research/map-routing-competitor-patterns.md) — Strava / AllTrails / Komoot all use casing+core (not glow) for the primary line, and auto-zoom via `flyToBoundingSphere` with pixel-scale padding, not raw `Rectangle`. Recipes in [`/map-ux` skill](../../.claude/skills/map-ux/SKILL.md).

| # | Change | Files |
|---|--------|-------|
| 6.1 ✅ | Finished-route **casing + core** (white below, dodgerblue `#2563eb` core above) — dropped `PolylineGlowMaterialProperty` as the default; preview keeps it | `TrackDrawer.ts` (`renderTrack`, `coreMaterial`) |
| 6.2 ✅ | Per-segment slope entities extracted into opt-in Steepness overlay; toggle lives in the layers popover's Overlays section; persisted to `upto_slope_overlay`; core dims to 0.3 alpha while overlay is on | `TrackDrawer.ts` (`addSlopeOverlay` / `toggleSlopeOverlay`), `TripPlanningMap.tsx` |
| 6.3 ✅ | Preview line lightened — `glowPower: 0.15`, width 6; edit-mode polyline matches | `TrackDrawer.ts` (`updatePreview`, `renderEditOverlay`) |
| 6.4 ✅ | Zoom-responsive polyline width — `camera.moveEnd` listener sets tier from `positionCartographic.height` (near<2 km: casing 10 / core 7; mid: 8/5; far>15 km: 5/3); matching tier applied to discovery entities | `TrackDrawer.ts`, `TrailLayerManager.ts` |
| 6.5 ✅ | Extracted `flyToRouteBounds` helper; replaced 3 overshooting fly-to sites (`preselect`, initial camera, center-prop effect) — `flyToBoundingSphere` + `HeadingPitchRange`, pitch −45° in 3D / −90° in 2D, 20% margin, 500 m radius floor, 8000 m for point-only flys | `MapCamera.ts` (new), `TrailLayerManager.ts`, `TripPlanningMap.tsx` |
| 6.6 ✅ | Trail discovery line: thin solid AllTrails-green (`rgba(95,173,65,0.85)` at 0.7 × opacity); selected trail rebuilt as casing+core to match user routes | `TrailLayerManager.ts` (`defaultMaterial`, `applyStyle`, `selectedCoreMaterial`) |

## Carry-over: still in the plan but not shipped

- **NoteModal wiring** — modal exists, `NoteManager` still uses `window.prompt()`. See [features/map-notes.md](../features/map-notes.md).

## Out of scope (future)

- Waypoint insertion mid-route
- Slope analysis overlay (CalTopo-style `GroundPrimitive`)
- Surface type indicators (Komoot, requires OSM surface tags)
- GPX import
- Offline map caching (Gaia GPS-style)

## Verification (per-phase)

1. Load `/create`, type trip name, expand Route & Map — map renders correctly
2. Route mode: click points → glow/preview, double-click to finish, elevation profile renders
3. Trail layer: toggle Tracks, zoom NZ, `[TrailLayer] fetched N trails` in console, click to select
4. Mobile: resize to 375 px, 44 px touch targets, usable controls
5. 2D/3D toggle: smooth morph, terrain in 3D, flat in 2D
6. `npx tsc --noEmit && npm run lint` passes clean (use `/build-check`)
