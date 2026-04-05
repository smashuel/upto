# DOC (Department of Conservation) API Integration

This document describes the integration of New Zealand's Department of Conservation API into the Upto outdoor trip planning app.

## Overview

The DOC API provides access to authoritative, curated data about New Zealand trails, huts, campsites, and safety alerts. Data is:

- **Licensed**: CC BY 4.0 — https://www.doc.govt.nz/
- **Authoritative**: Maintained by DOC, not crowd-sourced
- **Region-specific**: Only active for queries in/near New Zealand (lat -47 to -34, lng 166 to 178)
- **Cached**: Tracks/huts/campsites are synced weekly; alerts are always live (safety-critical)

## Architecture

```
Frontend (src/services/GlobalTrailService.ts)
  ├─ suggestRoute(query)
  │   └─ Parallel searches: OSM, Trailforks, Hiking Project, Local DB, DOC
  │   └─ searchDOC() → GET /api/doc/tracks?name=...
  │   └─ Consolidated + ranked results
  │
  └─ API methods (src/config/api.ts)
      ├─ getDocAlerts(region?)     → /api/doc/alerts
      └─ getDocNearby(lat, lng, r) → /api/doc/nearby

Backend (backend-server.js)
  ├─ GET /api/doc/tracks   → from ./data/doc-tracks.json cache
  ├─ GET /api/doc/huts     → from ./data/doc-huts.json cache
  ├─ GET /api/doc/campsites → from ./data/doc-campsites.json cache
  ├─ GET /api/doc/alerts    → live from https://api.doc.govt.nz/v2/alerts
  └─ GET /api/doc/nearby    → combines nearby cache data + live alerts

Cache Management (doc-sync.js)
  └─ Manual or cron sync: node doc-sync.js
  └─ Fetches from DOC API, writes ./data/doc-{resource}.json
  └─ Cache TTL: 7 days
```

## Setup

### 1. Get DOC API Key

1. Visit https://api.doc.govt.nz
2. Sign up and request API access
3. You'll receive an `x-api-key` header value

### 2. Set Environment Variable

#### Local Development
```bash
export DOC_API_KEY=your_key_here
npm run dev
```

#### Production (Linode)

The `DOC_API_KEY` is set in PM2 via the `deploy.sh` script. Before deploying:

```bash
# On your local machine
export DOC_API_KEY=your_key_here
sh deploy.sh
```

The script embeds `DOC_API_KEY` into the PM2 `ecosystem.config.js` env block.

### 3. Initial Sync

After deployment, manually trigger the first sync:

```bash
# SSH to your Linode server
ssh root@172.105.178.48

# Run the sync script
cd /opt/upto-backend
node doc-sync.js
```

Expected output:
```
═══════════════════════════════════════════════════
DOC Trail Data Sync
═══════════════════════════════════════════════════
Start time: 2026-03-26T12:34:56.789Z
Cache directory: ./data
API Key: your_**_here

[2026-03-26T12:34:56.789Z] Syncing tracks...
✓ Successfully synced tracks
  Records: 3241
  Time: 4.32s

[2026-03-26T12:35:01.234Z] Syncing huts...
✓ Successfully synced huts
  Records:892
  Time: 2.11s

[2026-03-26T12:35:03.456Z] Syncing campsites...
✓ Successfully synced campsites
  Records: 1847
  Time: 3.44s

═══════════════════════════════════════════════════
Summary
═══════════════════════════════════════════════════
✓ tracks           3241 records  (4.32s)
✓ huts              892 records  (2.11s)
✓ campsites        1847 records  (3.44s)

Total time: 10.89s
End time: 2026-03-26T12:35:13.321Z
```

### 4. Set Up Weekly Cron Sync

Add to Linode crontab:

```bash
# SSH to Linode
ssh root@172.105.178.48

# Edit crontab
crontab -e

# Add this line (syncs every Monday at 3 AM)
0 3 * * 1 cd /opt/upto-backend && node doc-sync.js >> /var/log/pm2/doc-sync.log 2>&1
```

## API Endpoints

### Backend Routes

All routes require the backend to be running and cache to be populated (except `/api/doc/alerts`).

#### `GET /api/doc/tracks?name=&region=`

Returns cached NZ DOC tracks.

**Query Parameters:**
- `name` (optional): Filter by track name (case-insensitive substring match)
- `region` (optional): Filter by region (case-insensitive substring match)

**Response:**
```json
{
  "source": "doc",
  "license": "CC BY 4.0 - https://www.doc.govt.nz/",
  "count": 42,
  "data": [
    {
      "assetId": "123456",
      "name": "Tongariro Alpine Crossing",
      "region": "Waikato",
      "line": {
        "type": "LineString",
        "coordinates": [[175.2, -39.2], [175.3, -39.3], ...]
      },
      "introductory": "A renowned one-day alpine crossing...",
      "walkTimeMin": 6,
      "walkTimeMax": 8,
      "distance": 19.4,
      "dificulty": "Moderate"  // Note DOC's typo
    }
  ]
}
```

#### `GET /api/doc/huts?region=`

Returns cached NZ DOC huts.

**Query Parameters:**
- `region` (optional): Filter by region

**Response:**
```json
{
  "source": "doc",
  "license": "CC BY 4.0 - https://www.doc.govt.nz/",
  "count": 12,
  "data": [
    {
      "assetId": "789012",
      "name": "Mangaeheu Hut",
      "region": "Waikato",
      "lat": -39.25,
      "lng": 175.28,
      "altitude": 1650,
      "facilities": ["Bunk room", "Water supply", "Toilet"]
    }
  ]
}
```

#### `GET /api/doc/campsites?region=`

Returns cached NZ DOC campsites.

**Query Parameters:**
- `region` (optional): Filter by region

#### `GET /api/doc/alerts`

**Always fetches live** from DOC API. Returns only active alerts (between startDate and endDate).

**Response:**
```json
{
  "source": "doc",
  "license": "CC BY 4.0 - https://www.doc.govt.nz/",
  "count": 3,
  "fetchedAt": "2026-03-26T12:34:56.789Z",
  "data": [
    {
      "assetId": "alert-001",
      "heading": "Track closure",
      "detail": "Tongariro Alpine Crossing closed due to volcanic activity",
      "regions": ["Waikato", "Bay of Plenty"],
      "startDate": "2026-03-20T00:00:00Z",
      "endDate": "2026-04-15T23:59:59Z"
    }
  ]
}
```

#### `GET /api/doc/nearby?lat=&lng=&radius=`

Returns tracks, huts, campsites, and alerts near a location.

**Query Parameters:**
- `lat` (required): User latitude
- `lng` (required): User longitude
- `radius` (optional, default 20): Search radius in km

**Response:**
```json
{
  "source": "doc",
  "license": "CC BY 4.0 - https://www.doc.govt.nz/",
  "center": { "lat": -39.2, "lng": 175.3 },
  "radius": 20,
  "tracks": [...],  // Sorted by distance
  "huts": [...],    // Sorted by distance
  "campsites": [...], // Sorted by distance
  "alerts": [...]   // All active regional alerts
}
```

### Frontend API Client

**In `src/config/api.ts`:**

```typescript
// Using ApiClient class
const client = new ApiClient();
await client.getDocAlerts('Waikato');
await client.getDocNearby(-39.2, 175.3, 20);

// Or use the shorthand api object
await api.docAlerts('Waikato');
await api.docNearby(-39.2, 175.3, 20);
```

## Frontend Integration

### Trail Search

When a user searches for a trail in New Zealand, the `GlobalTrailService` automatically includes DOC results:

```typescript
// In AdventureLocationStep.tsx
const suggestions = await trailService.suggestRoute({
  title: 'Tongariro Alpine Crossing',
  activityType: 'hiking',
  autoExtractLocation: true
});

// Results will include DOC tracks if location is detected as NZ
// suggestions[0].source === 'doc'
```

### Nearby Resources

To fetch resources near a user location:

```typescript
const nearby = await api.docNearby(-39.2, 175.3, 30);

// Use nearby.tracks for the map
// Use nearby.huts for accommodation planning
// Use nearby.alerts for safety briefings
```

## Sync Script Usage

### Manual Sync

```bash
# From project root or /opt/upto-backend/
node doc-sync.js
```

### Docker / CI/CD

```bash
#!/bin/bash
export DOC_API_KEY=your_key_here
node doc-sync.js || exit 1
```

### Cron (Production)

```crontab
# Weekly Monday 3 AM
0 3 * * 1 cd /opt/upto-backend && DOC_API_KEY=your_key_here node doc-sync.js >> /var/log/pm2/doc-sync.log 2>&1

# Or if DOC_API_KEY is in PM2 env, PM2 handles it:
0 3 * * 1 cd /opt/upto-backend && node doc-sync.js >> /var/log/pm2/doc-sync.log 2>&1
```

## Caching Strategy

### Cached Resources (Tracks, Huts, Campsites)

- **TTL**: 7 days
- **Location**: `./data/doc-{resource}.json`
- **Format**: `{ "syncedAt": "ISO8601", "data": [...] }`
- **Stale check**: On backend startup; if stale, background sync is triggered
- **Updates**: Weekly via cron or manual `node doc-sync.js`

### Live Resources (Alerts)

- **Always fetched**: Never cached
- **Reason**: Safety-critical — closures, hazards, weather alerts must be current
- **Timeout**: 15 seconds

## Troubleshooting

### No DOC results in search

1. Check that DOC_API_KEY is set:
   ```bash
   ssh root@172.105.178.48 'pm2 show upto-backend | grep DOC_API_KEY'
   ```

2. Check that cache is populated:
   ```bash
   ssh root@172.105.178.48 'ls -la /opt/upto-backend/data/'
   ```

3. Run manual sync and check for errors:
   ```bash
   ssh root@172.105.178.48 'cd /opt/upto-backend && node doc-sync.js'
   ```

4. Check backend logs:
   ```bash
   ssh root@172.105.178.48 'pm2 logs upto-backend'
   ```

### Sync fails with "DOC_API_KEY not set"

Make sure the env var is passed to the sync script. Either:
- Export it before running: `export DOC_API_KEY=key && node doc-sync.js`
- Or set it in the cron job: `0 3 * * 1 ... DOC_API_KEY=key node doc-sync.js ...`

### Cache is stale (older than 7 days)

Manually trigger a sync:
```bash
ssh root@172.105.178.48 'cd /opt/upto-backend && node doc-sync.js'
```

Or check your cron job is running:
```bash
ssh root@172.105.178.48 'crontab -l'
```

### Alerts not appearing

Alerts are always fetched live. If they're not appearing:
1. Check DOC API is reachable: `curl -H "x-api-key: $DOC_API_KEY" https://api.doc.govt.nz/v2/alerts`
2. Check backend logs for fetch errors: `pm2 logs upto-backend | grep -i alert`

## Data License

All DOC data provided by this integration is licensed under **CC BY 4.0**:
- **Human-readable**: https://creativecommons.org/licenses/by/4.0/
- **Legal code**: https://creativecommons.org/licenses/by/4.0/legalcode
- **DOC Attribution**: https://www.doc.govt.nz/

Your app must:
1. Display attribution: "Data © New Zealand Department of Conservation"
2. Include a link to the DOC website
3. Display this license information prominently in your app (e.g., Settings → Data Sources)

## Implementation Details

### NZ Bounds Detection

Queries are only sent to DOC if:
- Query bounds overlap NZ (lat -47 to -34, lng 166 to 178), OR
- Query location contains "New Zealand" or "NZ"

This prevents unnecessary API calls for users outside NZ.

### Coordinate System

- **GeoJSON** (DOC API): `[longitude, latitude]`
- **TrailSuggestion** (Upto): `[latitude, longitude]`
- **Conversion**: `[lng, lat] → [lat, lng]`

The code handles this swap in `processDOCResults()`.

### DOC API Quirks

1. **Field name typo**: DOC uses `dificulty` instead of `difficulty`
2. **Track geometry**: Line geometry is in GeoJSON LineString format — we extract the first point as the track "center" and all points as "waypoints"
3. **Huts/campsites**: Use simple `lat`/`lng` fields (not geometry)

## Files Modified

- **backend-server.js**: Added DOC cache utilities, 5 routes, startup sync
- **doc-sync.js** (new): Standalone sync script
- **src/services/GlobalTrailService.ts**: Added DOC search, NZ detection
- **src/config/api.ts**: Added DOC endpoints, client methods
- **deploy.sh**: Added DOC_API_KEY to PM2 env, data directory creation
- **.env.example**: Added DOC_API_KEY documentation
- **DOC-INTEGRATION.md** (this file): Full documentation

## Next Steps

1. **[For Developers]** Test locally:
   ```bash
   export DOC_API_KEY=your_test_key
   npm run dev
   # Search for "Tongariro" to see DOC results
   ```

2. **[For Ops]** Deploy and sync:
   ```bash
   # Set your DOC_API_KEY in environment
   sh deploy.sh
   # Then SSH and run initial sync
   ```

3. **[For Product]** Add DOC attribution to app:
   - Settings → Data Sources → "New Zealand: Department of Conservation (CC BY 4.0)"
   - Link to https://www.doc.govt.nz/

4. **[Ongoing]** Monitor weekly syncs:
   ```bash
   ssh root@172.105.178.48 'tail -f /var/log/pm2/doc-sync.log'
   ```
