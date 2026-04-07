# Upto - Outdoor Trip Planning App

## What Upto Does

Upto is an outdoor trip planning and safety app for New Zealand (and eventually global) recreationalists and outdoor professionals. Users create **TripLinks** — detailed trip plans with route information, emergency contacts, check-in schedules, and precise locations — then share them with contacts who need to know where they are and when to expect them back.

The core workflow is a multi-step wizard (`/create`) that walks the user through:
1. **Trip Overview** — activity type (hiking, climbing, skiing, cycling), title, dates
2. **Location & Route** — 3D map planning with waypoint/route drawing, auto-suggested trails from global databases, what3words precision locations for parking, primary location, and emergency exit points
3. **Trip Details** — description and professional time estimation using GuidePace (Munter Method, Chauvin System, Technical System)
4. **Emergency Contacts** — who to notify, escalation settings, notification preferences
5. **Review & Share** — preview the plan, generate a shareable link

TripLinks are currently stored in localStorage (no database yet). The app is designed for safety-critical outdoor use, so accuracy in location data, time estimates, and alert information matters.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite, deployed to Vercel
- **Backend**: Express.js (`backend-server.js`), deployed to Linode VPS
- **Linode VPS**: `172.105.178.48`, SSH as `root`, backend at `/opt/upto-backend/`
- **Process Manager**: PM2 (`ecosystem.config.js`)
- **Reverse Proxy**: Nginx on port 80, proxies `/api/*` to `localhost:3001`
- **Domain**: `upto.world` (Vercel frontend), also accessible at `upto-six.vercel.app`

## Frontend-Backend Communication

The frontend communicates with the backend via REST API calls through `src/config/api.ts`. There are two clients exported:

- **`ApiClient` class** — typed, reusable client with `get()`, `post()`, `request()` methods and built-in error handling
- **`api` object** — simplified shorthand functions for common operations

In development, requests go directly to `http://localhost:3001`. In production (Vercel), they go to `http://172.105.178.48` (port 80), where Nginx proxies `/api/*` to the Express backend on port 3001.

CORS is configured on the backend to allow requests from `localhost:5173`, `localhost:3000`, `upto-six.vercel.app`, `upto.world`, and the Linode IP itself.

## External APIs and Services

### Cesium Ion (3D Globe)
- **What**: Satellite imagery (Sentinel-2, asset ID 2) and world terrain (asset ID 1) for the 3D trip planning map
- **How**: Loaded via CDN (`cesium.com/downloads/cesiumjs/releases/1.132/`) in `index.html`, configured in `TripPlanningMap.tsx`
- **Auth**: `VITE_CESIUM_ION_TOKEN` env var. Falls back to OpenStreetMap tiles if token is missing
- **Used by**: `TripPlanningMap.tsx`, `WaypointManager.ts`, `TrackDrawer.ts`, `NoteManager.ts`

### What3words
- **What**: Converts coordinates to/from 3-word addresses (e.g., `///filled.count.soap`) for precise 3m x 3m location sharing — critical for emergency services
- **How**: `@what3words/api` npm package, service wrapper in `src/services/what3words.ts`
- **Auth**: `VITE_WHAT3WORDS_API_KEY` env var. Degrades gracefully if key is missing or invalid
- **Used by**: `What3wordsInput`, `LocationDisplay`, `EmergencyLocationShare` components, `AdventureLocationStep.tsx`

### NZ Department of Conservation (DOC) API
- **What**: Authoritative data on NZ tracks (~3,200), huts (~890), campsites (~1,850), and safety alerts
- **How**: Backend fetches from `api.doc.govt.nz`, caches tracks/huts/campsites as JSON files in `./data/`, serves alerts live (safety-critical, never cached)
- **Auth**: `DOC_API_KEY` env var (server-side only, set in PM2 env)
- **License**: CC BY 4.0 — attribution required
- **Sync**: `doc-sync.js` runs weekly via cron (Monday 3 AM) or manually. Converts coordinates from NZTM2000 (EPSG:2193) to WGS84 during sync
- **Cache TTL**: 7 days. Backend checks staleness on startup and triggers background sync if needed
- **Used by**: Backend DOC endpoints, `GlobalTrailService.ts` (frontend searches DOC via backend)

### OpenStreetMap Overpass API
- **What**: Global trail/path data from OSM. Searches for ways tagged as hiking routes, paths, footways, cycleways, ski routes
- **How**: POST queries to `overpass-api.de/api/interpreter` with Overpass QL
- **Auth**: None (free, public API)
- **Used by**: `GlobalTrailService.ts` (frontend, with bounding box), `backend-server.js` (backend trail search)

### Nominatim (OpenStreetMap Geocoding)
- **What**: Forward and reverse geocoding — converts location names to coordinates and vice versa. Also extracts location names from trip titles
- **How**: `nominatim.openstreetmap.org/search` and `/reverse` endpoints
- **Auth**: None. Rate limited to 1 request/second (enforced in `NominatimGeocoder.ts`)
- **Used by**: `NominatimGeocoder.ts` (auto-location extraction in `GlobalTrailService`)

### LINZ LDS (NZ Topo50 Map)
- **What**: LINZ Land Information NZ layer 767 — classic Topo50 paper-map style with contours, hut symbols, and track markings
- **Tile URL**: `https://data.linz.govt.nz/services;key={LINZ_LDS_API_KEY}/tiles/v4/layer=767/EPSG:3857/{z}/{x}/{y}.png`
- **Proxy**: Backend proxies tiles via `GET /api/tiles/topo/:z/:x/:y` — API key stays server-side
- **Auth**: `LINZ_LDS_API_KEY` backend env var (PM2). Frontend uses `VITE_LINZ_LDS_API_KEY` for fallback only
- **Get key**: [data.linz.govt.nz](https://data.linz.govt.nz) → Account → API Keys
- **Coverage**: NZ bounds only (`165.8°E–178.6°E, 33.9°S–47.5°S`). Outside NZ, satellite base layer shows through
- **Attribution**: `© LINZ CC BY 4.0` — displayed in the map header whenever Topo layer is active
- **Toggle**: "Sat | Topo" toggle in map header, persisted to `localStorage` key `upto_map_layer`
- **Agent**: route-planner-agent owns the toggle; data-agent owns `LinzMapService.ts`
- **Used by**: `TripPlanningMap.tsx` (layer switching), `LinzMapService.ts` (URL/bounds helpers)

### Placeholder / Not Yet Integrated
- **Leaflet** (`react-leaflet`): Package still installed but `MapSelector.tsx` has been removed. Could be reintroduced as a lightweight fallback map if needed.
- **TrailForks** (`VITE_TRAILFORKS_API_KEY`): Not integrated — stubs removed from `GlobalTrailService.ts`. Would provide mountain biking and hiking trail data.
- **Hiking Project**: Not integrated — stubs removed. US-only coverage.
- **MapTiler** (`VITE_MAPTILER_API_KEY`): Not integrated, env var placeholder only

## Directory Structure

```
upto/
├── .claude/                        # Claude Code configuration
│   ├── settings.json               # Project-level Claude settings
│   ├── settings.local.json         # Local (gitignored) Claude settings
│   └── skills/                     # Custom Claude Code skills
│       ├── build-check/SKILL.md    # Run tsc + eslint and fix errors
│       ├── check-backend/SKILL.md  # Diagnose Linode backend health
│       ├── deploy/SKILL.md         # Deploy backend to Linode
│       └── review-map/SKILL.md     # Audit Cesium map components
├── data/                           # DOC API cache (gitignored, created by sync)
│   ├── doc-tracks.json             # ~3,200 NZ tracks with WGS84 coords
│   ├── doc-huts.json               # ~890 NZ huts with WGS84 coords
│   └── doc-campsites.json          # ~1,850 NZ campsites with WGS84 coords
├── markdown/                       # Project documentation (reference)
│   ├── DEPLOYMENT_SETUP.md
│   ├── GUIDEPACE_FEATURE.md
│   ├── MAPPING.md
│   ├── NGINX_PROXY_SETUP.md
│   ├── WHAT3WORDS_IMPLEMENTATION.md
│   └── WHAT3WORDS_SETUP.md
├── public/                         # Static assets (logos, hero images)
├── src/
│   ├── App.tsx                     # Router, QueryClient, Layout, Toaster
│   ├── main.tsx                    # React entry point
│   ├── components/
│   │   ├── adventure/              # Trip preview, sharing, share link
│   │   │   ├── AdventurePreview.tsx
│   │   │   ├── AdventureShare.tsx
│   │   │   └── AdventureShareLink.tsx
│   │   ├── forms/                  # Multi-step TripLink creation wizard
│   │   │   ├── TripTypeSelectionStep.tsx   # Activity type picker
│   │   │   ├── TripTitleStep.tsx           # Trip name input
│   │   │   ├── TripOverviewStep.tsx        # Combined overview (step 1)
│   │   │   ├── AdventureLocationStep.tsx   # Map + route + w3w (step 2)
│   │   │   ├── TripDetailsStep.tsx         # Description + time est (step 3)
│   │   │   ├── AdventureContactsStep.tsx   # Emergency contacts (step 4)
│   │   │   └── AdventureScheduleStep.tsx   # Schedule (pulled out, unused)
│   │   ├── guidepace/              # GuidePace time estimation UI
│   │   │   ├── GuidePaceEstimator.tsx
│   │   │   ├── PaceFactorControls.tsx
│   │   │   ├── RouteBreakdown.tsx
│   │   │   └── TimeEstimateSummary.tsx
│   │   ├── layout/                 # Header, Footer, Layout wrapper
│   │   ├── map/
│   │   │   └── TripPlanningMap.tsx  # Cesium 3D globe (primary map)
│   │   ├── ui/                     # Reusable UI components (Button, Card, Input)
│   │   └── what3words/             # What3words input, display, emergency share
│   │       ├── What3wordsInput.tsx
│   │       ├── LocationDisplay.tsx
│   │       ├── EmergencyLocationShare.tsx
│   │       └── index.ts
│   ├── config/
│   │   └── api.ts                  # API client, endpoints, base URL logic
│   ├── pages/
│   │   ├── Home.tsx                # Landing page with hero + CTAs
│   │   ├── CreateAdventure.tsx     # Multi-step wizard container
│   │   ├── ViewAdventure.tsx       # View a TripLink by ID
│   │   ├── PublicAdventureView.tsx # Public shared view
│   │   ├── Profile.tsx             # User profile page
│   │   └── NotFound.tsx            # 404 page
│   ├── services/
│   │   ├── CesiumManager.ts        # Abstract base class for Cesium map managers
│   │   ├── GlobalTrailService.ts   # Trail search: OSM Overpass + DOC (NZ only)
│   │   ├── NominatimGeocoder.ts    # Geocoding + location extraction from titles
│   │   ├── WaypointManager.ts      # Cesium waypoint click-to-place (extends CesiumManager)
│   │   ├── TrackDrawer.ts          # Cesium route drawing + GPX export (extends CesiumManager)
│   │   ├── NoteManager.ts          # Cesium map note placement (extends CesiumManager)
│   │   └── what3words.ts           # What3words API service wrapper
│   ├── types/
│   │   ├── adventure.ts            # Adventure, Contact, CheckIn, etc.
│   │   ├── user.ts                 # User types
│   │   └── what3words.ts           # What3words types
│   ├── utils/
│   │   ├── RouteAnalyzer.ts        # Terrain detection, route segmentation
│   │   └── TimeCalculator.ts       # Munter, Chauvin, Technical time formulas
│   └── styles/
│       └── globals.css             # Global styles, CSS variables, theme
├── backend-server.js               # Express backend (all API routes)
├── backend-package.json            # Backend-only package.json for deployment
├── doc-sync.js                     # DOC API sync script (NZTM2000 → WGS84)
├── deploy.sh                       # Automated Linode deployment script
├── nginx-config                    # Nginx reverse proxy configuration
├── index.html                      # Entry HTML (Cesium CDN loaded here)
├── vercel.json                     # Vercel build + SPA rewrite config
├── package.json                    # Frontend dependencies + scripts
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Vite build config
├── DOC-INTEGRATION.md              # Detailed DOC API integration docs
└── DOC-INTEGRATION-SUMMARY.txt     # Short DOC integration summary
```

## Key Paths

| Path | Purpose |
|------|---------|
| `src/components/map/TripPlanningMap.tsx` | Cesium 3D map viewer |
| `src/services/CesiumManager.ts` | Abstract base for map managers (setup/retry/handler boilerplate) |
| `src/services/WaypointManager.ts` | Map waypoint management |
| `src/services/TrackDrawer.ts` | Route drawing: click-to-place, undo, live stats (distance/elevation/time), elevation profile data, serialise to JSON |
| `src/services/LinzMapService.ts` | LINZ Topo50 tile URL helpers, NZ bounds detection, attribution constant |
| `src/services/NoteManager.ts` | Map note placement |
| `src/services/GlobalTrailService.ts` | Trail search + Nominatim geocoding |
| `src/services/NominatimGeocoder.ts` | Forward/reverse geocoding, location extraction |
| `src/services/what3words.ts` | What3words API wrapper |
| `src/utils/TimeCalculator.ts` | GuidePace time estimation formulas |
| `src/utils/RouteAnalyzer.ts` | Terrain detection, route segmentation |
| `src/components/forms/AdventureLocationStep.tsx` | Location step in trip creation |
| `src/pages/CreateAdventure.tsx` | Multi-step TripLink wizard container |
| `src/config/api.ts` | API client for backend communication |
| `src/types/adventure.ts` | Core data types (Adventure, Contact, CheckIn) |
| `backend-server.js` | Express backend (trails, DOC, adventures) |
| `doc-sync.js` | DOC API sync with NZTM2000→WGS84 conversion |
| `deploy.sh` | Automated Linode deployment script |
| `nginx-config` | Nginx reverse proxy config |

## Commands

```bash
npm run dev        # Start Vite dev server (port 5173)
npm run build      # TypeScript compile + Vite build
npm run lint       # ESLint check
npm run preview    # Preview production build
sh deploy.sh       # Deploy backend to Linode
node doc-sync.js   # Manually sync DOC data (requires DOC_API_KEY)
```

## Environment Variables

### Frontend (VITE_ prefix, set in .env)

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Backend API URL (production: `http://172.105.178.48`) |
| `VITE_DEV_API_URL` | Backend API URL (dev: `http://localhost:3001`) |
| `VITE_WHAT3WORDS_API_KEY` | What3words geolocation API |
| `VITE_CESIUM_ION_TOKEN` | Cesium 3D globe imagery + terrain |
| `VITE_LINZ_LDS_API_KEY` | LINZ Topo50 tiles (fallback; prefer server-side `LINZ_LDS_API_KEY`) |
| `VITE_TRAILFORKS_API_KEY` | TrailForks trail data (placeholder, not yet active) |
| `VITE_MAPTILER_API_KEY` | MapTiler mapping (placeholder, not yet active) |

### Backend (server-side, set in PM2 env or shell)

| Variable | Purpose |
|----------|---------|
| `PORT` | Express listen port (default: 3001) |
| `DOC_API_KEY` | NZ Department of Conservation API key |
| `LINZ_LDS_API_KEY` | LINZ LDS API key for Topo50 tile proxy (`/api/tiles/topo/:z/:x/:y`) |
| `NODE_ENV` | Environment (production on Linode) |

## DOC Integration (Current State)

The DOC (Department of Conservation) integration is **fully implemented** and provides NZ-specific outdoor data:

### What's Working
- **Tracks**: ~3,200 NZ walking/hiking tracks served from cache via `GET /api/doc/tracks?name=&region=`
- **Huts**: ~890 backcountry huts via `GET /api/doc/huts?region=`
- **Campsites**: ~1,850 campsites via `GET /api/doc/campsites?region=`
- **Alerts**: Live safety alerts (closures, hazards, weather) via `GET /api/doc/alerts` — always fetched fresh, never cached
- **Nearby search**: Combined tracks + huts + campsites + alerts within a radius via `GET /api/doc/nearby?lat=&lng=&radius=`
- **Coordinate conversion**: `doc-sync.js` converts NZTM2000 to WGS84 at sync time so downstream consumers don't need projection math
- **Auto-detection**: `GlobalTrailService.ts` only queries DOC when the search location overlaps NZ bounds or contains "New Zealand"/"NZ"
- **Frontend integration**: DOC results appear in trail suggestions on the Location step, ranked alongside OSM results

### DOC API Quirks
- The `dificulty` field is misspelled in DOC's API (not `difficulty`)
- Track geometry is GeoJSON LineString `[longitude, latitude]` — the app uses `[latitude, longitude]`, so coordinates are swapped during processing
- Huts and campsites use simple `lat`/`lng` fields (converted from NZTM2000 `x`/`y` during sync)

### Detailed Docs
See `DOC-INTEGRATION.md` for full endpoint documentation, setup instructions, caching strategy, and troubleshooting.

## Known Issues and Incomplete Features

### Not Yet Implemented
- **Database persistence**: TripLinks are saved to `localStorage` only — no backend database. The adventure POST/GET endpoints are stubs returning placeholder responses
- **User authentication**: No auth system. Profile page exists but has no real user management
- **Check-in system**: The data model defines check-ins, escalation, and notifications, but none of the check-in logic is implemented
- **Notification delivery**: Emergency contact notification preferences are collected but no email/SMS sending is wired up
- **Adventure sharing**: Share tokens and QR codes are generated client-side but the backend doesn't serve public adventure views
- **TrailForks integration**: Stub returns empty array — needs API credentials
- **Hiking Project integration**: Stub returns empty array — US-only, needs API credentials
- **MapTiler integration**: Not started, env var placeholder only
- **GuidePace UI connection**: `GuidePaceEstimator`, `PaceFactorControls`, `RouteBreakdown`, and `TimeEstimateSummary` components exist and the calculator logic works, but they aren't wired into the main trip creation flow
- **AdventureScheduleStep**: Component exists but was pulled out of the wizard steps — schedule is not currently part of the creation flow
- **NoteManager UX**: Uses `window.prompt()` for note input instead of a proper modal/form

### Known Quirks
- Cesium is loaded via CDN (not npm) and accessed through `window.Cesium` global — all map services use `any` types for Cesium objects
- The three map managers (WaypointManager, TrackDrawer, NoteManager) extend `CesiumManager` base class which handles setup/retry and gives each its own `ScreenSpaceEventHandler` to avoid overwriting each other's click handlers
- Each manager retries initialization up to 50 times (5 seconds) waiting for the Cesium viewer to be ready
- Default camera position is NZ overview (`172.0, -41.5, 2500000m`)
- NoteManager still uses `window.prompt()` for note input — needs a proper modal
- `Adventure` is re-exported as a type alias from `adventure.ts` for backward compat — use `TripLink` directly in new code

## Conventions

- React components use functional components with TypeScript interfaces
- Forms use `react-hook-form` with `useFormContext` for shared state across wizard steps
- UI components in `src/components/ui/` wrap Bootstrap (`react-bootstrap`)
- Services in `src/services/` are class-based with Cesium `window.Cesium` global
- Cesium is loaded via CDN in `index.html`, not npm — version 1.132
- Icons use `lucide-react`
- Toast notifications via `react-hot-toast`
- State management: React Query (`@tanstack/react-query`) for server state, `useState` for local state
- Routing: `react-router-dom` v7 with `BrowserRouter`
- No test framework is set up

## Specialist Agents and Skills

### Skills (invoked via `/skill-name`)

| Skill | Description |
|-------|-------------|
| `/build-check` | Run `tsc --noEmit` + `npm run lint`, analyze errors, fix them, and re-verify |
| `/check-backend` | SSH to Linode, check health endpoint, PM2 status, Nginx, logs, disk/memory |
| `/deploy` | Pre-flight checks (TypeScript, SSH, git status), then run `deploy.sh` to push backend to Linode |
| `/review-map` | Read-only audit of the Cesium map stack — initialization, imagery, terrain, React lifecycle, managers |

### Agents (TODO — placeholders for future configuration)

<!-- Add custom agents here as they are defined -->
<!-- Example: -->
<!-- | Agent | Type | Description | -->
<!-- |-------|------|-------------| -->
<!-- | trail-data-agent | Explore | Investigate trail data quality and coverage issues | -->
