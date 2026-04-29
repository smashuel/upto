---
type: feature
status: shipped
related: [src/components/map/TripPlanningMap.tsx, src/services/CesiumManager.ts]
tags: [map, cesium, 3d]
---

# 3D Map

Cesium-based 2D/3D map that anchors the Location step of the wizard. Also used standalone by ViewAdventure.

## Cesium setup

- Loaded **via CDN** (not npm) from `cesium.com/downloads/cesiumjs/releases/1.132/` in `index.html`
- Accessed globally as `window.Cesium` — all managers use `any` types
- Asset IDs: `2` (Sentinel-2 satellite imagery), `1` (world terrain)
- Falls back to OpenStreetMap tiles if `VITE_CESIUM_ION_TOKEN` is missing
- `scene3DOnly` is **NOT** set — required for `morphTo2D` to work

## Scene modes

- 2D / 3D toggle via `morphTo2D(1.5)` / `morphTo3D(1.5)` — smooth transitions (Phase 1 of map UX overhaul)
- Persisted to `localStorage['upto_scene_mode']`
- Wizard opens in **2D with LINZ Topo50** by default; standalone viewers open in 3D satellite

## Imagery layers

- **Sat** — Cesium Ion Sentinel-2
- **Topo** — LINZ Topo50 (NZ only; see [linz-topo.md](linz-topo.md))
- Toggle in the layers popover, persisted to `localStorage['upto_map_layer']`
- Quality tuning: `globe.maximumScreenSpaceError = 1.333`, `msaaSamples = 4`, LINZ `maximumLevel: 19`

## Manager pattern

`CesiumManager` is the abstract base for all map interaction modules. Each subclass:
- Owns its own `ScreenSpaceEventHandler` (so click handlers don't overwrite each other)
- Retries `init()` up to 50× over 5 s while waiting for the viewer
- Exposes a narrow imperative API the React component can call

### Managers

| Manager | Responsibility |
|---------|----------------|
| [WaypointManager](waypoints.md) | Click-to-place typed markers |
| [TrackDrawer](trail-drawing.md) | Route drawing, stats, GPX export, edit mode |
| [NoteManager](map-notes.md) | Map annotations (accommodation/warning/info/photo) |
| [TrailLayerManager](trail-discovery-layer.md) | DOC track discovery layer |
| [RouteFlyover](route-flyover.md) | Chase-cam animation |

## Controls (post Phase 2)

- **Top-left**: mode pill (view / waypoint / route / note)
- **Top-right**: layers popover (Sat/Topo + 2D/3D + track discovery opacity)
- **Top-center**: mode instruction chip
- **Bottom-left**: locate-me + reset view
- **Bottom-right**: export + play/stop flyover
- **Bottom-center**: route controls (undo/redo/clear/finish), route mode only
- All overlays use `backdrop-filter: blur(8px)`, semi-transparent bg, `z-index: 10`

## Default camera

NZ overview: `lng=172.0, lat=-41.5, height=2,500,000 m`

## Known quirks

- Cesium types are `any` everywhere — no first-party TS types since we load via CDN
- Terrain samples for elevation profiles are async — stats recompute after `sampleTerrainMostDetailed` resolves
- Lazy-mounting via `ExpandSection.hasOpened` means you'll see "map not ready" logs if a manager method is called pre-mount
