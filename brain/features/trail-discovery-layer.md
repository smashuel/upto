---
type: feature
status: shipped
related: [src/services/TrailLayerManager.ts, backend-server.js]
tags: [map, doc, trails, discovery]
---

# Trail Discovery Layer

Renders nearby DOC tracks as dashed polylines in the current viewport. Users see what's around and can click to highlight a track (and eventually snap a route to it).

## How it works

1. User toggles **Tracks** in the layers popover
2. On `moveEnd`, `TrailLayerManager` reads the camera rectangle, computes a bbox
3. Calls `GET /api/trails/bbox?west=&south=&east=&north=&limit=`
4. Backend returns up to 50 DOC tracks whose centroid falls inside the bbox, sorted by distance to bbox centre
5. Each track renders as a Cesium polyline entity

## Styling (Phase 6.6)

- **Default** — thin solid AllTrails-green `rgba(95,173,65,0.85)` scaled by the opacity slider (×0.7 floor), width 3 (replaces the Phase 5.1 dashed brown — dashed lines competed with LINZ Topo contour markings)
- **Selected** — **casing + core** pair, matching user-drawn routes from [trail-drawing.md](trail-drawing.md). White casing beneath, dodgerblue `#2563eb` core above. On select, both entities are removed and re-added in the correct draw order; the original entity id is preserved so click-to-select still resolves. On deselect, the casing is removed and the core reverts to the default green.
- **Zoom-responsive width** (Phase 6.4) — shared altitude tiers with TrackDrawer. Unselected: near 4 / mid 3 / far 2. Selected casing+core: 10+7 / 8+5 / 5+3.
- Opacity slider wires through to `defaultMaterial()` only — selected state ignores opacity so the current selection never fades out.

## Backend safety

- The bbox endpoint rejects requests wider than ~5° to avoid dumping all ~3,200 tracks on a zoomed-out view
- Tracks are served from the JSON cache (`./data/doc-tracks.json`) — never the live DOC API

## Click to select

`ScreenSpaceEventHandler` LEFT_CLICK on a trail entity:
- Restyles the hit entity to `selectedMaterial`
- Restyles previously selected entity back to default
- Emits `onTrackSelected(trackId)` for the parent component

## Coverage

NZ-only (DOC data). Outside NZ, the layer is empty — OSM trails are not yet surfaced this way. See [global-trails.md](global-trails.md) for OSM integration.

## Known gaps

- No cluster rendering when tracks overlap — multiple tracks in the same corridor look like one thick line
- No filter by track difficulty or region in the layer UI (the underlying endpoint supports `?region=`)
- Selected track isn't yet a drag-to-snap source for TrackDrawer (planned)
