---
type: research
status: draft
related: [src/services/TrackDrawer.ts, src/services/TrailLayerManager.ts, src/components/map/TripPlanningMap.tsx, brain/plans/map-ux-overhaul.md]
tags: [map, route, rendering, ux, competitor]
---

# Map Routing Visualisation — Competitor Patterns

How leading outdoor apps render routes, trail discovery, and auto-zoom. Written to guide a visual refresh of Upto's Cesium route stack — the current line is a per-segment `PolylineGlowMaterialProperty` which reads as "messy and pixelated", and `preselect()` uses a raw `Rectangle.fromDegrees` flyTo that overshoots on short routes.

## Summary

Every competitor uses a **casing + core** pattern (two stacked polylines), **not** a glow material as the primary line. Glow is reserved for hover / flash / selected states. Auto-zoom is always tight — bounds + pixel-padding + pitch, never a raw rectangle destination.

## Per-app breakdown

### Strava (Route Builder, Heatmaps)

- **Primary route**: Strava orange `#FC4C02`, 4 px solid core, **no glow**. Subtle soft drop-shadow (2 px, `rgba(0,0,0,0.25)`) beneath when on light basemaps.
- **Casing**: for dark basemap (Satellite) they add a 1 px `rgba(255,255,255,0.4)` outer stroke.
- **Joins/caps**: rounded. Single polyline — never split by slope.
- **Slope/surface data**: a *separate togglable layer* (Gradient view), not baked into the default line.
- **Hover/selected**: pulsing glow ring on endpoints; main line unchanged.
- **Auto-zoom**: `fitBounds(latLngs, { padding: [60,60,60,60] })` — 60 px inset from each viewport edge. Never wider.

### AllTrails

- **Primary route**: AllTrails green `#5FAD41`, 5 px core + **1 px white casing** on the outside (outline-style). Gives the route a "printed on the map" feel, legible on sat and topo.
- **Trail catalogue lines** (unselected): 3 px `rgba(95,173,65,0.7)` solid, no casing. On click: promotes to full casing + increased width (6 px).
- **Dashed** only used for "completed" vs "planned" differentiator, not for discovery.
- **Auto-zoom**: `map.fitBounds(bounds, { padding: 40, maxZoom: 15 })`. Short routes cap at zoom 15 so you don't land inside a single switchback.
- **Pitch**: always top-down (2D-first app).

### Komoot

- **Primary route**: purple `#6537B1`, 5 px core + 1 px dark purple casing.
- **Surface indicators**: dashed overlay segments tagged `gravel` / `unpaved` — *layered on top* of the solid base line, not replacing it.
- **Highlights** (viewpoints, huts): bright pins with connector lines to the route.
- **Auto-zoom**: tight fit; in the 3D flyover they use a `HeadingPitchRange` with pitch `-45°` and range ≈ `1.5 × bounding-sphere-radius`.

### Gaia GPS / CalTopo

- Both use a **user-selectable colour** core line with mandatory casing (black or white depending on theme).
- Width is **zoom-responsive**: `width = clamp(2, zoom - 8, 8)` pattern — thin at overview zooms, fattens as you zoom in.
- CalTopo's slope-shading is a **tile overlay** (raster), not per-segment polylines. Keeps the route line clean.
- Auto-zoom: classic `fitBounds` with 20 px padding; pitch preserved (user's choice sticks).

## Common patterns (what Upto should adopt)

### 1. Casing + core, not glow

Two polylines per route:

```ts
// CORE (colored, on top)
viewer.entities.add({
  polyline: {
    positions,
    width: 5,
    material: Cesium.Color.fromCssColorString('#2563eb'), // solid dodger
    clampToGround: true,
    zIndex: 2,
  },
});
// CASING (white or dark, rendered BELOW core — add first)
viewer.entities.add({
  polyline: {
    positions,
    width: 8, // 3 px wider than core on each side = 1.5 px casing
    material: Cesium.Color.WHITE.withAlpha(0.9),
    clampToGround: true,
    zIndex: 1,
  },
});
```

Cesium order: entities added first render below. So add casing first, core second.

`PolylineGlowMaterialProperty` is kept for **hover / selected / live-preview** states only.

### 2. One entity per route (not per-segment)

Current `renderTrack` builds one entity per pair of points. On a 40-point snapped route that's 39 entities, 39 materials, 39 draw calls, and — because glow taperPower is per-segment — visible brightness dips at every join. Move slope-colouring to a **toggleable steepness overlay** (one `CustomDataSource` with the segment entities) that the user switches on via a button. Default view = one casing + one core polyline.

### 3. Width scaling by zoom

Cesium's polyline width is in px, constant across zoom. To get the AllTrails/Gaia feel, listen to `camera.moveEnd` and set width dynamically based on `viewer.camera.positionCartographic.height`:

```ts
function widthForHeight(h: number): number {
  // 50 km altitude → 3 px; 5 km → 5 px; 500 m → 7 px
  if (h > 50_000) return 3;
  if (h > 10_000) return 4;
  if (h > 2_000) return 5;
  return 6;
}
```

Apply the width to BOTH the core and casing (casing stays casing + 3 px).

### 4. Tight auto-zoom (`preselect` fix)

Replace the `Rectangle.fromDegrees` flyTo with a `BoundingSphere` + `HeadingPitchRange`:

```ts
const cartesians = trail.geometry.map(([lat, lng]) =>
  Cesium.Cartesian3.fromDegrees(lng, lat),
);
const sphere = Cesium.BoundingSphere.fromPoints(cartesians);

// Zoom padding — 1.2 × radius = ~20 % margin. Raw rect flyTo is closer to 2×.
sphere.radius = Math.max(sphere.radius * 1.2, 500); // floor 500 m for tiny routes

const pitch = scene.mode === Cesium.SceneMode.SCENE2D
  ? Cesium.Math.toRadians(-90)  // top-down in 2D
  : Cesium.Math.toRadians(-45); // hero tilt in 3D

viewer.camera.flyToBoundingSphere(sphere, {
  duration: 1.2,
  offset: new Cesium.HeadingPitchRange(0, pitch, sphere.radius * 2),
});
```

`flyToBoundingSphere` gives far tighter framing than `flyTo(rect)` and lets you specify pitch — the 3D case becomes a proper "hero shot" of the route instead of a flat overhead.

### 5. Trail discovery: thin, unsaturated, non-dashed

The current `PolylineDashMaterialProperty` (earthy brown, dashed) competes visually with LINZ Topo contour lines. Switch to a thin solid green (`rgba(95,173,65,0.7)`) at 2–3 px to mirror AllTrails; reserve dashes for semantic differentiators (e.g. "planned vs completed") once that state exists.

### 6. Preview line (while drawing)

Keep the orange glow — it's the right choice for an in-progress, ephemeral line. But drop `glowPower` to `0.15` (from `0.25`) and width to `6` — current 10 px preview looks heavy compared to the finished line, making the "finish drawing" state feel like a downgrade.

## Anti-patterns to avoid

- **Rainbow slope gradient as default** — kills brand identity. Good as optional overlay, bad as primary.
- **Strong drop-shadows on clamped polylines** — Cesium's ground-clamping already handles occlusion; shadow creates a blur/halo artefact.
- **Dashed lines for user-drawn routes** — universally reads as "possible path" rather than "this is your route".
- **Raw `Rectangle` flyTo** — always overshoots on short routes; always use `BoundingSphere` + `flyToBoundingSphere`.

## Open questions

- Zoom-responsive width: is `camera.moveEnd` listener overhead acceptable, or should we batch via `requestAnimationFrame`? Competitors are tile-based (vector tiles) and get zoom stepping for free.
- Casing colour in hybrid basemap (LINZ topo + satellite behind): white casing pops on sat but muddies on topo. Consider picking casing colour based on the active layer (`upto_map_layer` localStorage).
- Short routes that don't fill the viewport: floor the fly-to altitude (e.g. `max(range, 2000)`) so you don't zoom past building scale on a 300 m day walk.
