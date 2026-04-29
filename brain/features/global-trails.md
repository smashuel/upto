---
type: feature
status: shipped
related: [src/services/GlobalTrailService.ts, src/services/NominatimGeocoder.ts, backend-server.js]
tags: [trails, osm, nominatim, global]
---

# Global Trails (OSM + Nominatim)

Trail search outside NZ, plus geocoding for auto-locating trips from their title.

## GlobalTrailService

`src/services/GlobalTrailService.ts` is the single entry point for trail search:

1. Read the trip title + activity type
2. Use `NominatimGeocoder.extractLocation(title)` to pull a place name out
3. Geocode → bounding box
4. **If bbox overlaps NZ** → query DOC API (authoritative, cached)
5. **Else** → query OSM Overpass API
6. Rank results by confidence (exact name match 90%, partial 60%, activity match 80%)

## OSM Overpass

- Endpoint: `overpass-api.de/api/interpreter` (free, public, no auth)
- Query: ways tagged `route=hiking|cycling|ski`, `highway=path|track|footway|cycleway`
- Called from both frontend (bbox in URL) and backend (`/api/trails/search`)

## Nominatim

- Endpoint: `nominatim.openstreetmap.org/search` and `/reverse`
- No auth — **rate-limited to 1 req/sec** (enforced in `NominatimGeocoder.ts` via a queued promise chain; don't remove this)
- Used for: forward/reverse geocoding + location extraction from titles

## Retired stubs

Previously had stubs for **TrailForks** and **Hiking Project** — both removed from `GlobalTrailService.ts` to avoid returning empty arrays that confused the UI. Re-adding requires API credentials (see [roadmap.md](../project/roadmap.md) "Data expansion").

## Known gaps

- Overpass has no snap-able geometry in many regions (`highway=path` without `name` tags are skipped)
- Confidence scoring is heuristic — no ML, no ranking signal from user clicks
- Nominatim rate limit makes it slow for bulk work; consider self-hosted if we ever need throughput
