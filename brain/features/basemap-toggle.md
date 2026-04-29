---
type: feature
status: shipped
related: [src/services/LinzMapService.ts, src/services/AusMapService.ts, src/services/BasemapSuggest.ts, src/components/map/TripPlanningMap.tsx]
tags: [map, basemap, topo, nz, au, nsw]
---

# Basemap Toggle

Picks the right topographic basemap for the current viewport and honours the user's manual choice without stranding them on a layer that has no tiles.

## Layers

| Layer | Source | Coverage | Zoom | Key? | Proxy? |
|-------|--------|----------|------|------|--------|
| Satellite | Cesium Ion (Sentinel-2) or OSM fallback | Global | — | Ion token (optional) | No |
| LINZ Topo50 (`topo-linz`) | LINZ LDS layer 767 | NZ (165.8–178.6°E, 33.9–47.5°S) | 5–19 | Yes (server-side) | Yes — `/api/tiles/topo/:z/:x/:y` |
| GA National (`topo-ga`) | Geoscience Australia ArcGIS REST | AU-wide (1:250k) | 4–14 | No | No — direct |
| NSW Topo (`topo-nsw`) | NSW Spatial Services ArcGIS REST | NSW (+ ACT enclave) (1:25k–1:100k) | 7–16 | No | No — direct |

GA and NSW are key-less, public, CORS-open ArcGIS REST tile services. They bypass the Linode backend entirely — Cesium's `UrlTemplateImageryProvider` fetches them straight from the browser. LINZ still goes through the backend proxy so the API key stays server-side.

**ArcGIS URL quirk**: GA/NSW use `{z}/{y}/{x}` (row/column), not `{z}/{x}/{y}`. Cesium recognises both tokens, so placement in the template is all that matters.

## Auto-switch model

The picker resolution lives in [BasemapSuggest.ts](../../src/services/BasemapSuggest.ts) — a Cesium-free module so it's trivial to unit-test:

- `suggestBasemap(lat, lng)` — most-specific region wins: NSW > AU > NZ > satellite.
- `resolveBasemap(lat, lng, override)` — durable user intent layered on top of the suggestion:
  - No override → use the suggestion.
  - Override is `satellite` → always honoured (no region constraint).
  - Override is a topo layer → honoured only while the centre is still inside that layer's native region; otherwise fall through to the auto-suggestion. **The override is not cleared** — panning back into the region resumes the user's preference without needing a re-click.

[TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx) listens on `camera.moveEnd` with a 500 ms debounce, computes `resolveBasemap`, and swaps layers only if the target differs from what's currently painted. A single `basemapLayerRef` holds whichever topo overlay is active (at most one at a time); satellite is the absence of any overlay (Cesium base layer is always satellite/OSM).

## State & persistence

| Key | Value |
|-----|-------|
| `localStorage.upto_map_layer` | `'satellite'` \| `'topo-linz'` \| `'topo-ga'` \| `'topo-nsw'` |

Legacy `'topo'` values are silently migrated to `'topo-linz'` on load (pre-AU build-up wrote plain `'topo'`).

React holds two related pieces of state:
- `userOverride: MapLayer | null` — durable preference; `null` means "let auto-detect decide".
- `mapLayer: MapLayer` — what's currently rendering. Diverges from `userOverride` during auto-switch (e.g. you picked NSW Topo but panned into Victoria → `userOverride='topo-nsw'`, `mapLayer='topo-ga'`).

## UI

Layers popover groups the four thumbs by country:

```
Basemap
  [Satellite]
  NEW ZEALAND
  [LINZ Topo]
  AUSTRALIA
  [GA National] [NSW Topo]
```

Attribution renders per active layer (CC BY 4.0 compliance):
- `topo-linz` → `© LINZ CC BY 4.0`
- `topo-ga` → `© Commonwealth of Australia (Geoscience Australia), CC BY 4.0`
- `topo-nsw` → `Contains NSW Spatial Services data © State of NSW (DCS), CC BY 4.0`

## Extending to other AU states

`AusMapService.ts` is deliberately structured as paired BOUNDS / URL / ATTRIBUTION triplets, so VIC/QLD/TAS/WA/SA layers slot in without touching the resolver. To add a state:

1. Add `XXX_BOUNDS`, `XXX_TOPO_URL`, `XXX_ATTRIBUTION`, `isWithinXxxBounds` to [AusMapService.ts](../../src/services/AusMapService.ts)
2. Extend `MapLayer` in [BasemapSuggest.ts](../../src/services/BasemapSuggest.ts) with `'topo-xxx'`
3. Insert into the priority chain in `suggestBasemap` (most-specific first) and the override-validity check in `resolveBasemap`
4. Add the branch in `applyBasemap` (provider construction) in [TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx)
5. Add the thumb button under the AU sublabel and a CSS swatch (`map-layer-thumb-xxx`)
6. Add per-layer attribution render

## Known gaps

- No cluster/opacity control per basemap (satellite is either all-on or hidden behind a topo)
- No fallback UX when LINZ key is missing — the LINZ thumb is just disabled
- No OSM-based topo (e.g. OpenTopoMap) as a global fallback for regions outside NZ/AU
