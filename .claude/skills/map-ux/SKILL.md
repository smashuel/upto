---
name: map-ux
description: Implement map UX improvements — route visuals (casing+core, zoom-scaled width), tight auto-zoom, controls, interactions, editing, polish
---

# Map UX Implementation

Implement map UX improvements for the Cesium-based trip planning map. This skill covers visual upgrades, route rendering, auto-zoom, control layout, interaction depth, and editing — guided by the phased plan in [brain/plans/map-ux-overhaul.md](../../brain/plans/map-ux-overhaul.md) and the competitor research in [brain/research/map-routing-competitor-patterns.md](../../brain/research/map-routing-competitor-patterns.md).

## Key Files

| File | Role |
|------|------|
| `src/components/map/TripPlanningMap.tsx` | Main component — controls, rendering, state, elevation chart |
| `src/components/map/NoteModal.tsx` | Note creation modal (replaces window.prompt) |
| `src/services/TrackDrawer.ts` | Route drawing, stats, snapping, casing+core render |
| `src/services/TrailLayerManager.ts` | DOC track discovery layer, viewport bbox queries, preselect auto-zoom |
| `src/services/WaypointManager.ts` | Waypoint placement and rendering |
| `src/services/NoteManager.ts` | Map note placement and icons |
| `src/services/CesiumManager.ts` | Base class for all map managers |
| `src/services/LinzMapService.ts` | LINZ Topo50 tile URL, NZ bounds, attribution |
| `src/components/forms/AdventureLocationStep.tsx` | Form step hosting the map + route suggestions |
| `src/styles/globals.css` | Map overlay CSS, floating controls, mobile breakpoints |

## Cesium Context

- Cesium v1.132 loaded via CDN (`window.Cesium` global) — all Cesium types are `any`
- Map managers extend `CesiumManager` base class (own `ScreenSpaceEventHandler` each)
- 2D mode uses `EllipsoidTerrainProvider` (flat), 3D uses `CesiumTerrainProvider` from Ion asset 1
- LINZ Topo50 tiles overlay satellite base; `maximumLevel: 16` in `UrlTemplateImageryProvider`
- MSAA is enabled (`scene.msaaSamples = 4`), FXAA disabled (blurs tile text)
- `maximumScreenSpaceError = 1.333` (aggressive LOD for crisp tiles), `useBrowserRecommendedResolution = false`
- Camera transitions use `flyTo` with `duration: 1.0-1.5`; scene morphs use `morphTo2D(1.5)` / `morphTo3D(1.5)` with `morphComplete` listener to restore camera

## Route Rendering Recipes

These are the canonical recipes. Apply them verbatim unless a specific case requires deviation.

### Finished route line — casing + core

```ts
// CASING: add first so it renders below
const casing = viewer.entities.add({
  polyline: {
    positions,
    width: 8,
    material: Cesium.Color.WHITE.withAlpha(0.9),
    clampToGround: true,
  },
});
// CORE: solid colour, on top
const core = viewer.entities.add({
  polyline: {
    positions,
    width: 5,
    material: Cesium.Color.fromCssColorString('#2563eb'),
    clampToGround: true,
  },
});
```

- **Do NOT** use `PolylineGlowMaterialProperty` for finished routes. Glow is for hover / selected / live preview only.
- **Do NOT** split the route into per-segment entities for slope colouring. Slope gradient is an optional *overlay* layer toggled by the user.
- Store `{ casing, core }` on the `Track` object so both can be removed on clear / width-update.

### Preview (live drawing) line

```ts
viewer.entities.add({
  polyline: {
    positions,
    width: 6,                         // lighter than finished route's 5+8
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.15,                // down from 0.25 — was too bloomy
      taperPower: 1.0,
      color: Cesium.Color.ORANGE,
    }),
    clampToGround: true,
  },
});
```

Orange glow = "this is ephemeral, commit with double-click". It must NOT out-weigh the finished route.

### Trail discovery line (unselected)

```ts
polyline: {
  positions,
  width: 3,
  material: Cesium.Color.fromCssColorString('rgba(95,173,65,0.7)'),
  clampToGround: true,
}
```

Thin, solid, AllTrails-green. Do not dash — competes with LINZ contours.

### Trail discovery line (selected / preselected)

```ts
// Casing
{ width: 8, material: Cesium.Color.WHITE.withAlpha(0.9) }
// Core
{ width: 5, material: Cesium.Color.fromCssColorString('#2563eb') }
```

Same casing + core as a finished user route — gives the user instant visual confirmation that "this is now the route I'm planning with".

### Zoom-responsive width

Attach a `camera.moveEnd` listener. Compute width from `positionCartographic.height`:

```ts
function widthForHeight(h: number): { casing: number; core: number } {
  if (h > 50_000) return { casing: 5, core: 3 };
  if (h > 10_000) return { casing: 6, core: 4 };
  if (h > 2_000)  return { casing: 8, core: 5 };
  return { casing: 10, core: 7 };
}
```

Update entities in place — don't recreate them.

### Auto-zoom — `flyToBoundingSphere`, never raw rectangle

```ts
const cartesians = geometry.map(([lat, lng]) =>
  Cesium.Cartesian3.fromDegrees(lng, lat),
);
const sphere = Cesium.BoundingSphere.fromPoints(cartesians);
sphere.radius = Math.max(sphere.radius * 1.2, 500); // 20% margin, floor 500 m

const is2D = viewer.scene.mode === Cesium.SceneMode.SCENE2D;
const pitch = Cesium.Math.toRadians(is2D ? -90 : -45);

viewer.camera.flyToBoundingSphere(sphere, {
  duration: 1.2,
  offset: new Cesium.HeadingPitchRange(0, pitch, sphere.radius * 2),
});
```

`flyTo(destination: rect)` overshoots on short routes — always use this pattern.

### Anti-patterns

| Don't | Do |
|-------|-----|
| `PolylineGlowMaterialProperty` on finished route | Casing + solid core |
| One entity per segment (slope colouring as default) | One entity per track; slope is an overlay |
| `flyTo({ destination: Rectangle })` | `flyToBoundingSphere(sphere, { offset: HeadingPitchRange })` |
| Dashed brown trail-layer lines (competes with topo) | Thin solid green |
| Fixed polyline width across zoom | `camera.moveEnd` listener resizes on altitude |

## Implementation Phases (from plan)

1. **Visual Foundation** — route casing+core, smooth camera, loading indicator, elevation chart upgrade
2. **Controls Overhaul** — floating overlays, note modal, mobile touch targets
3. **Interaction Depth** — interactive elevation profile with map sync, undo/redo, waypoint icons
4. **Route Editing Power** — drag-to-reroute, steepness gradient overlay (optional, not default)
5. **Polish** — trail layer styling, layer management panel, animated flyover

## Implementation Rules

- All `<button>` elements inside the map must have `type="button"` (nested inside wizard `<form>`)
- Floating controls use `position: absolute` with `backdrop-filter: blur(8px)`, `z-index: 10`
- Mobile breakpoint: `@media (max-width: 640px)` — 44x44px min touch targets
- Camera position must be preserved across scene morphs (capture before, restore on `morphComplete`)
- Cesium geocoder is disabled (`geocoder: false`) — our Layers button uses top-right
- The `.map-selected-trail` chip is centered at `bottom: 52px; left: 50%; transform: translateX(-50%)`
- Always verify with `npx tsc --noEmit && npm run lint` after changes
- When changing route rendering, update BOTH `TrackDrawer.renderTrack` and `TrailLayerManager.applyStyle` so user-drawn and pre-selected DOC trails look consistent

## Verification Checklist

1. Load `/create`, type trip name, expand Route & Map — map renders, preselected route lands with ~20% margin, pitch 45° in 3D / top-down in 2D
2. Route mode: click points, verify orange glow preview (width 6), double-click finish, route renders as white casing + blue core (no glow)
3. Zoom in to 500 m altitude — casing widens to 10 px, core to 7 px
4. Trail layer: toggle Tracks in Layers panel, zoom NZ, trails appear as thin solid green, click to select — selected promotes to casing + core
5. 2D/3D toggle: smooth morph, camera position preserved, terrain correct per mode
6. Mobile: resize to 375px, verify 44px touch targets, controls usable
7. All map buttons: clicking does NOT trigger "TripLink created" toast
8. Build: `npx tsc --noEmit && npm run lint` passes clean

## After shipping rendering changes

Per brain maintenance rules ([CLAUDE.md](../../CLAUDE.md)):
- Tick the relevant items in [brain/plans/map-ux-overhaul.md](../../brain/plans/map-ux-overhaul.md)
- Update [brain/features/trail-drawing.md](../../brain/features/trail-drawing.md) with the new recipe (casing+core, zoom-scaled width)
- Update [brain/features/trail-discovery-layer.md](../../brain/features/trail-discovery-layer.md) if the discovery-line material changes
- If the `flyToBoundingSphere` pattern fixes a known bug, add a brief [brain/journal/](../../brain/journal/) entry noting the fix
