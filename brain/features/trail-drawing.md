---
type: feature
status: shipped
related: [src/services/TrackDrawer.ts, src/components/map/TripPlanningMap.tsx]
tags: [map, route, drawing, gpx]
---

# Trail Drawing (TrackDrawer)

Click-to-place route drawing with snapping, live stats, GPX export, and post-finish edit mode.

## Drawing flow

1. Switch to **Route** mode in the mode pill
2. Left-click to place each control point — live preview polyline follows the cursor
3. Double-click (or click "Finish") to seal the route
4. Undo/redo with Ctrl+Z / Ctrl+Shift+Z (redo stack from map UX Phase 3)
5. Route enters **edit mode** after finish — drag midpoint handles to insert points, drag existing points to reposition (Phase 4 drag-to-reroute)

## Styling

- **Preview line** — orange `PolylineGlowMaterialProperty`, width 6, `glowPower: 0.15` (Phase 6.3 — deliberately *lighter* than the finished line so committing the route reads as an upgrade)
- **Finished line** — **casing + core** (Phase 6.1). Two stacked polylines: a white casing beneath (alpha 0.9) and a dodgerblue `#2563eb` solid core above. Draw order = insertion order, so the casing is added first. Replaces the old glow-only render, which bloomed and washed out on dark terrain.
- **Zoom-responsive width** (Phase 6.4) — `camera.moveEnd` listener tiers by altitude: near (<2 km) casing 10 / core 7, mid (2–15 km) 8 / 5, far (>15 km) 5 / 3. Listener is attached in `setup()` and detached in `destroy()`.
- **Steepness overlay** — per-segment slope colouring is now an **opt-in layer** (Phase 6.2), not the default. Toggle in the layers popover's Overlays section; persisted to `localStorage.upto_slope_overlay`. While on, the core polyline dims to 0.3 alpha so the coloured segments dominate. Colours: `<5%` green, `5–10%` yellow, `10–15%` orange, `>15%` red.

## Trail snapping

When the snap toggle is on, each placed point is projected to the nearest DOC/OSM track within ~50 m using `TrailSnapService`. Snapping is authoritative over raw click location — if a snap succeeds, the stored point is the track-aligned one, not the cursor position.

## Stats

Emitted via `onDrawingUpdate(stats)` callback:

| Field | Source |
|-------|--------|
| `distance` (km) | Haversine over control points |
| `ascent` / `descent` (m) | Terrain-sampled elevation deltas |
| `duration` (minutes) | Placeholder — will swap to GuidePace once wired |
| `canUndo` / `canRedo` | Stack sizes |

## Elevation profile

- Data: `getElevationProfile()` returns `{ distances[], elevations[] }` sampled along the route
- Rendered by `ElevationChart` component in `TripPlanningMap.tsx`
- 140 px tall, steepness-gradient fill, horizontal grid lines (Phase 1.4)
- Hover → vertical crosshair + tooltip + pulsing dot on map (Phase 3.1)
- Two-way sync: hover on map polyline → highlight chart point

## GPX export

`exportToGPX()` returns a GPX 1.1 XML string with `<trk><trkseg><trkpt>` per point, elevation included. Download wired via Export button in bottom-right overlay.

## Route flyover hand-off

`getLatestTrackPositions()` returns the finished route as `[lng, lat, elevation][]` for [RouteFlyover](route-flyover.md) to consume.

## Known gaps

- Flat/steepness colour mode toggle exists in code but not yet in UI
- No way to open a saved TripLink back into edit mode (blocked on backend persistence)
- GPX import is a planned future feature
