---
type: feature
status: shipped
related: [backend-server.js, doc-sync.js, src/services/GlobalTrailService.ts, src/services/TrailLayerManager.ts, src/services/TrailSnapService.ts, src/config/api.ts]
tags: [doc, trails, huts, nz, data]
---

# DOC Integration (New Zealand)

Authoritative NZ outdoor data from the Department of Conservation API — tracks, huts, campsites, alerts. This is the full reference doc (consolidated from the old root-level `DOC-INTEGRATION.md`).

## What's in it

| Dataset | Count | Cache | Endpoint |
|---------|-------|-------|----------|
| Tracks | ~3,200 | `data/doc-tracks.json` (7-day TTL) | `GET /api/doc/tracks` |
| Huts | ~890 | `data/doc-huts.json` (7-day TTL) | `GET /api/doc/huts` |
| Campsites | ~1,850 | `data/doc-campsites.json` (7-day TTL) | `GET /api/doc/campsites` |
| Alerts | live | **never cached** | `GET /api/doc/alerts` |

## Architecture

```
Frontend
  GlobalTrailService.ts — auto-includes DOC when query is in NZ
  TrailLayerManager.ts  — viewport discovery layer via /api/trails/bbox
  TrailSnapService.ts   — route-click snap via /api/trails/snap
  src/config/api.ts     — ApiClient.getDocAlerts / getDocNearby

Backend (backend-server.js)
  /api/doc/tracks    → from data/doc-tracks.json
  /api/doc/huts      → from data/doc-huts.json
  /api/doc/campsites → from data/doc-campsites.json
  /api/doc/alerts    → LIVE from api.doc.govt.nz/v2/alerts
  /api/doc/nearby    → combines cache + live alerts
  /api/trails/bbox   → viewport-filtered tracks (max ~5° span)
  /api/trails/snap   → radius search for snap (2 km default, 10 km max)

Cache management (doc-sync.js)
  Weekly cron Monday 3 AM on Linode
  Fetches from DOC, converts NZTM2000 → WGS84, writes data/doc-{resource}.json
```

## Endpoints

### `GET /api/doc/tracks?name=&region=`

Cached tracks. Substring filters on `name` / `region`. Returns:
```json
{
  "source": "doc",
  "license": "CC BY 4.0 - https://www.doc.govt.nz/",
  "count": 42,
  "data": [{
    "assetId": "123456",
    "name": "Tongariro Alpine Crossing",
    "region": "Waikato",
    "line": { "type": "LineString", "coordinates": [[175.2, -39.2], ...] },
    "walkTimeMin": 6, "walkTimeMax": 8,
    "distance": 19.4,
    "dificulty": "Moderate"
  }]
}
```

### `GET /api/doc/huts?region=` / `GET /api/doc/campsites?region=`

Cached huts/campsites. Use simple `lat` / `lng` fields (not LineString geometry). Huts expose `altitude` + `facilities[]`.

### `GET /api/doc/alerts`

**Always live.** Returns only active alerts (between `startDate` / `endDate`). 15 s timeout. Never cached — safety-critical.

### `GET /api/doc/nearby?lat=&lng=&radius=`

Combines tracks + huts + campsites + alerts within `radius` km (default 20). Results sorted by distance from centre.

### `GET /api/trails/bbox?west=&south=&east=&north=&limit=`

Drives the [trail discovery layer](trail-discovery-layer.md). Returns tracks whose centroid falls inside the bbox, sorted by distance from bbox centre.

- All four bounds required, numeric
- `north > south`, `east > west`
- bbox wider than ~5° in either axis → **400** (prevents dumping all NZ tracks at country zoom)
- `limit` default 50, max 100
- Geometry returned as `[[lat, lng], ...]` (already swapped from GeoJSON)

### `GET /api/trails/snap?lat=&lng=&radius=`

Used by `TrailSnapService.ts` to snap route clicks to the nearest track within ~80 m. Default radius 2 km, max 10 km.

## Setup

### API key

1. Register at [api.doc.govt.nz](https://api.doc.govt.nz)
2. Receive `x-api-key` value → set as `DOC_API_KEY` env var

### Local dev

```bash
export DOC_API_KEY=your_key_here
npm run dev
```

### Production (Linode)

`DOC_API_KEY` is set in PM2 via `deploy.sh`. Before deploying:
```bash
export DOC_API_KEY=your_key_here
sh deploy.sh
```
The script embeds it into `ecosystem.config.js` env block.

### Initial sync (after first deploy)

```bash
ssh root@172.105.178.48
cd /opt/upto-backend && node doc-sync.js
```

### Weekly cron (already set up)

```crontab
0 3 * * 1 cd /opt/upto-backend && node doc-sync.js >> /var/log/pm2/doc-sync.log 2>&1
```

## Sync script (`doc-sync.js`)

- Manual: `node doc-sync.js`
- Converts NZTM2000 (EPSG:2193) → WGS84 at sync time so downstream consumers don't need projection math
- Writes `data/doc-{resource}.json` as `{ syncedAt: ISO8601, data: [...] }`
- Backend checks staleness on startup; if >7 days → background sync

## NZ bounds detection

DOC queries only fire when:
- Query bounds overlap NZ (`lat -47 to -34, lng 166 to 178`), OR
- Query location contains "New Zealand" or "NZ"

Keeps international users off the DOC API.

## DOC API quirks

1. **Typo**: DOC uses `dificulty`, not `difficulty` — don't "fix" in our code
2. **Coordinate swap**: GeoJSON LineString is `[lng, lat]`; we use `[lat, lng]` internally. Swap in `processDOCResults()` and `doc-sync.js`
3. **Huts/campsites** use flat `lat` / `lng` fields, not geometry

## Attribution (legal — CC BY 4.0)

All DOC data is CC BY 4.0 ([human-readable](https://creativecommons.org/licenses/by/4.0/) / [legal code](https://creativecommons.org/licenses/by/4.0/legalcode)).

Our app must:
1. Display "Data © New Zealand Department of Conservation" where DOC data is shown (currently: map header when discovery layer is on)
2. Link to [doc.govt.nz](https://www.doc.govt.nz/)
3. Surface the license prominently (e.g. Settings → Data Sources) — **not yet done**

## Safety invariant

DOC alerts are safety-critical. They are **never cached** — always fetched live. Do not add a cache layer in front of `/api/doc/alerts` under any circumstance. If this becomes a performance problem, the answer is a stale-while-revalidate pattern with a short TTL (seconds, not minutes), not a cache.

## Troubleshooting

**No DOC results in search:**
```bash
ssh root@172.105.178.48 'pm2 show upto-backend | grep DOC_API_KEY'
ssh root@172.105.178.48 'ls -la /opt/upto-backend/data/'
ssh root@172.105.178.48 'cd /opt/upto-backend && node doc-sync.js'
ssh root@172.105.178.48 'pm2 logs upto-backend'
```

**Sync fails with "DOC_API_KEY not set":** pass it via the cron line or PM2 env. `pm2 restart upto-backend --update-env` after changes.

**Cache stale (>7 days):** run manual sync, check `crontab -l` on Linode.

**Alerts not appearing:**
```bash
curl -H "x-api-key: $DOC_API_KEY" https://api.doc.govt.nz/v2/alerts
pm2 logs upto-backend | grep -i alert
```

## Frontend consumption

```ts
// Direct API
await api.docAlerts('Waikato');
await api.docNearby(-39.2, 175.3, 20);

// Indirect (via GlobalTrailService)
trailService.suggestRoute({ title: 'Tongariro Alpine Crossing', activityType: 'hiking' });
// → auto-extracts location, detects NZ, includes DOC results
```

## Known gaps

- Alerts aren't yet surfaced in the wizard Review step (should flag relevant regional alerts before the user shares the plan)
- No UI for the license attribution page — CC BY 4.0 not prominently displayed
- Trail discovery layer doesn't yet let users filter by `dificulty` or `region` (endpoint supports both)
