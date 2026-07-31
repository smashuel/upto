---
type: feature
status: shipped
related: [src/services/LinzMapService.ts, src/services/AusMapService.ts, src/services/BasemapSuggest.ts, src/components/map/TripPlanningMap.tsx]
tags: [map, basemap, topo, nz, au, nsw]
---

# Basemap Toggle

Two user-facing basemaps — **Satellite** and **Topo** — where Topo auto-resolves to the correct regional product for the current viewport. The user never picks a country or a cartographic product.

## Layers

| Layer | Source | Coverage | Zoom | Key? | Proxy? |
|-------|--------|----------|------|------|--------|
| Satellite | Cesium Ion (Bing Maps Aerial) or OSM fallback | Global | — | Ion token (optional) | No |
| LINZ Topo50 (`topo-linz`) | LINZ LDS layer 767 | NZ (165.8–178.6°E, 33.9–47.5°S) | 5–19 | Yes (server-side) | Yes — `/api/tiles/topo/:z/:x/:y` |
| GA National (`topo-ga`) | Geoscience Australia ArcGIS REST | AU-wide (1:250k) | 4–14 | No | No — direct |
| NSW Topo (`topo-nsw`) | NSW Spatial Services ArcGIS REST | NSW (+ ACT enclave) (1:25k–1:100k) | 7–16 | No | No — direct |

GA and NSW are key-less, public, CORS-open ArcGIS REST tile services. They bypass the Linode backend entirely — Cesium's `UrlTemplateImageryProvider` fetches them straight from the browser. LINZ still goes through the backend proxy so the API key stays server-side.

**ArcGIS URL quirk**: GA/NSW use `{z}/{y}/{x}` (row/column), not `{z}/{x}/{y}`. Cesium recognises both tokens, so placement in the template is all that matters.

## Choice vs rendered layer

Two distinct types, deliberately ([BasemapSuggest.ts](../../src/services/BasemapSuggest.ts), Cesium-free and unit-tested):

- **`BasemapChoice`** = `'satellite' | 'topo'` — what the *user* picked. The entire user-facing vocabulary.
- **`MapLayer`** = `'satellite' | 'topo-linz' | 'topo-ga' | 'topo-nsw'` — what actually *renders*, and what a TripLink persists as `plannedBasemap` (so a saved plan records the real canvas it was drawn on, and attribution can name the true source).

Resolution:

- `regionalTopo(lat, lng)` — most-specific product covering the point: NSW > AU > NZ, else `null`.
- `suggestBasemap(lat, lng)` — topo where it exists, else satellite. Used when no choice has been made.
- `resolveBasemap(lat, lng, choice)`:
  - `'satellite'` → always satellite, no region constraint.
  - `'topo'` → the regional product, falling back to satellite outside all coverage. **The choice is never cleared**, so panning back into coverage resumes topo.
  - `null` → the suggestion.
- `choiceFromStored(raw)` — migrates persisted `'topo-linz'`/`'topo-ga'`/`'topo-nsw'`/`'topo'` to `'topo'`.
- `choiceFromLayer(layer)` — recovers the choice behind a persisted `plannedBasemap`.

Geography (the bounds and `isWithin*` predicates) lives in [regionBounds.ts](../../src/services/regionBounds.ts), separate from the tile-URL plumbing that reads `import.meta.env`. LinzMapService/AusMapService re-export it for back-compat.

[TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx) listens on `camera.moveEnd` with a 500 ms debounce, computes `resolveBasemap`, and swaps only if the target differs from what is painted. A single `basemapLayerRef` holds whichever topo overlay is active (at most one); satellite is the absence of any overlay.

## State & persistence

| Key | Value |
|-----|-------|
| `localStorage.upto_map_layer` | `'satellite'` \| `'topo'` |

Older installs holding `'topo-linz'` / `'topo-ga'` / `'topo-nsw'` (the pre-simplification per-product values) and legacy `'topo'` all migrate to `'topo'` via `choiceFromStored`.

React state:
- `userChoice: BasemapChoice | null` — durable preference; `null` means "let the viewport decide".
- `mapLayer: MapLayer` — what is currently rendering. Diverges from `userChoice` as the viewport moves (choice `'topo'` in Victoria → `mapLayer='topo-ga'`; pan to NZ → `mapLayer='topo-linz'`, choice unchanged).
- `topoAvailableHere: boolean` — whether any topo product covers the centre, so the Topo button can explain itself outside coverage instead of being inertly clickable.

## UI

Two thumbs, no country grouping:

```
Basemap
  [Satellite] [Topo]
  LINZ Topo50                 <- names the product actually rendering
```

The Topo thumb's swatch follows the active product. Outside all coverage the panel says
"No topo coverage here — showing satellite".

Attribution renders per *rendered* layer (CC BY 4.0 compliance):
- `topo-linz` → `© LINZ CC BY 4.0`
- `topo-ga` → `© Commonwealth of Australia (Geoscience Australia), CC BY 4.0`
- `topo-nsw` → `Contains NSW Spatial Services data © State of NSW (DCS), CC BY 4.0`

## Extending to other AU states

`AusMapService.ts` is deliberately structured as paired BOUNDS / URL / ATTRIBUTION triplets, so VIC/QLD/TAS/WA/SA layers slot in without touching the resolver. To add a state:

1. Add `XXX_BOUNDS`, `XXX_TOPO_URL`, `XXX_ATTRIBUTION`, `isWithinXxxBounds` to [AusMapService.ts](../../src/services/AusMapService.ts)
2. Add `XXX_BOUNDS` + `isWithinXxxBounds` to [regionBounds.ts](../../src/services/regionBounds.ts)
3. Extend `MapLayer` in [BasemapSuggest.ts](../../src/services/BasemapSuggest.ts) with `'topo-xxx'`
4. Insert into the priority chain in `regionalTopo` (most-specific first)
5. Add the branch in `applyBasemap` (provider construction) in [TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx)
6. Add entries to `TOPO_SOURCE_LABEL` / `TOPO_THUMB_CLASS` and a CSS swatch (`map-layer-thumb-xxx`), plus the per-layer attribution render

No new user-facing button — the new product appears automatically under the single Topo choice.

## Known gaps

- No cluster/opacity control per basemap (satellite is either all-on or hidden behind a topo)
- No fallback UX when the LINZ key is missing outside AU — Topo simply has nothing to show
- No OSM-based topo (e.g. OpenTopoMap) as a global fallback for regions outside NZ/AU
