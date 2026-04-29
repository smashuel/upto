---
type: feature
status: shipped
related: [src/services/LinzMapService.ts, src/components/map/TripPlanningMap.tsx, backend-server.js]
tags: [map, linz, topo, nz]
---

# LINZ Topo50 Layer

Classic NZ paper-map aesthetic — contour lines, hut symbols, track markings — as a Cesium imagery layer.

## Source

- **Provider**: Land Information New Zealand (LINZ) LDS
- **Layer ID**: `767` (NZ Topo50 raster tiles)
- **Tile URL**: `https://data.linz.govt.nz/services;key={LINZ_LDS_API_KEY}/tiles/v4/layer=767/EPSG:3857/{z}/{x}/{y}.png`
- **Coverage**: NZ bounds only (`165.8°E–178.6°E, 33.9°S–47.5°S`). Outside NZ, the satellite base layer shows through.
- **License**: CC BY 4.0 → `© LINZ CC BY 4.0` shown in map header whenever Topo is active

## Proxy (security + rate limit)

The LINZ key stays server-side. Backend endpoint `GET /api/tiles/topo/:z/:x/:y` fetches the tile from LINZ with the `LINZ_LDS_API_KEY` env var, then forwards the PNG (binary `arrayBuffer` — see commit `58e4f84`).

Frontend can also fall back to `VITE_LINZ_LDS_API_KEY` if the proxy is unreachable, but the proxy is preferred.

## Cesium integration

- Added as a `UrlTemplateImageryProvider` on top of the satellite base layer
- **`maximumLevel: 19`** (raised from 16 during the Phase 5 topo-blur fix)
- `globe.maximumScreenSpaceError = 1.333` + `msaaSamples = 4` to sharpen the bottom-half of the 3D view
- Toggle button ("Sat | Topo") in the map header, persisted to `localStorage['upto_map_layer']`
- Wizard defaults to **Topo**; other entry points default to **Sat**

## Get an API key

[data.linz.govt.nz](https://data.linz.govt.nz) → Account → API Keys. Free tier works for dev; prod traffic should use a dedicated key with usage caps.

## Known gaps

- No fallback message when outside NZ bounds — user sees satellite and may wonder why Topo isn't "working"
- No other LINZ layers surfaced (aerial imagery, parcels, waterways) — only Topo50
