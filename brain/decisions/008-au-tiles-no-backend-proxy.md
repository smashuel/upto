---
type: decision
status: accepted
related: [src/services/AusMapService.ts, src/components/map/TripPlanningMap.tsx, src/services/LinzMapService.ts, backend-server.js]
tags: [map, basemap, au, architecture]
---

# 008 — AU topo tiles fetched direct from the browser (no backend proxy)

## Context

Upto's existing NZ topo layer (LINZ Topo50) is fetched via a backend proxy at `GET /api/tiles/topo/:z/:x/:y` so the LINZ API key stays server-side. When adding AU support (Geoscience Australia National + NSW Spatial Services Topo), the natural question was whether to proxy those the same way — for consistency and to centralise any future rate-limit handling.

Both GA and NSW publish their tiles as **public, key-less ArcGIS REST services with permissive CORS**:
- `https://services.ga.gov.au/gis/rest/services/Topographic_Base_Map/MapServer/tile/{z}/{y}/{x}`
- `https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Topo_Map/MapServer/tile/{z}/{y}/{x}`

There's no secret to hide and no auth to broker.

## Decision

Fetch GA and NSW tiles directly from the browser via Cesium's `UrlTemplateImageryProvider`. No backend endpoint. No proxy. The `AusMapService.ts` module exports tile-URL templates, bounding boxes, and attribution strings only — no network code lives there.

## Alternatives considered

- **Proxy for symmetry with LINZ** — rejected. Adds backend maintenance, doubles tile latency, and solves a problem (key-hiding) that doesn't exist for these sources. Symmetry for its own sake isn't a reason.
- **Proxy for future rate-limit control** — rejected until needed. GA and NSW publish these as general-purpose public tile services; if either starts returning 429s we can bolt a proxy on in a day. Speculative infrastructure now would cost more than responding to the actual signal later.
- **Reroute through an OSM-style aggregate (e.g. MapTiler)** — rejected. Introduces a dependency, a key, and a cost centre to replace tiles that are free and direct.

## Consequences

- One less backend concern — AU coverage ships with zero changes to `backend-server.js`.
- Tile latency is governed by GA/NSW CDN performance, not our Linode box.
- The pattern for future AU state layers (VIC/QLD/TAS/WA/SA, when they're public ArcGIS services) is to add a triplet to `AusMapService` — no backend PR needed.
- **Attribution becomes a frontend invariant**: `GA_ATTRIBUTION` / `NSW_ATTRIBUTION` must render whenever the layer is active (CC BY 4.0 requirement). The `applyBasemap` helper passes them as `credit` to the Cesium provider, and the layers popover re-renders the string underneath. If either is dropped, we're in licence breach.

## Reconsider if

- GA or NSW start requiring a key, introduce rate limits we can't absorb, or change CORS policy.
- We add AU state layers that **do** require a key (some state services do) — at that point introduce a proxy, but only for those layers; GA + NSW stay direct.
- We want centralised analytics on tile usage (unlikely — Cesium and browser devtools already give us what we need).
