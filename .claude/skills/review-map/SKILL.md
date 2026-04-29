---
name: review-map
description: Debug and review the Cesium 3D mapping components for issues, including a competitor-visual comparison of route rendering against Strava / AllTrails / Komoot
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
---

# Review Cesium Map Stack

Analyze the mapping components and services for issues. This is a read-only diagnostic skill — it does not write code. When issues are found that require implementation, hand off to the [map-ux](../map-ux/SKILL.md) skill.

## Files to Analyze

- `src/components/map/TripPlanningMap.tsx` — main Cesium viewer component (viewer config, MSAA/FXAA, auto-zoom logic)
- `src/services/WaypointManager.ts` — waypoint click handling and rendering
- `src/services/TrackDrawer.ts` — route drawing, snapping, render materials
- `src/services/TrailLayerManager.ts` — DOC trail discovery layer, `preselect` auto-zoom, materials
- `src/services/NoteManager.ts` — map note placement
- `src/services/CesiumManager.ts` — base class for setup/retry/handler boilerplate
- `src/components/forms/AdventureLocationStep.tsx` — form step that hosts the map
- `index.html` — Cesium CDN script loading

## What to Check

### Initialization and lifecycle
1. Does the Cesium Viewer initialize properly? Is the `screenSpaceEventHandler` available when managers try to use it?
2. Imagery: Is the Ion token valid? Does `IonImageryProvider.fromAssetId(2)` succeed? Does the OSM fallback work?
3. Terrain: Does `CesiumTerrainProvider.fromIonAssetId(1)` complete (only when `sceneMode !== '2d'`)?
4. React lifecycle: Are useEffect dependencies correct? Is the viewer being recreated unnecessarily? Stale closures?
5. Manager initialization: Do all four managers (Waypoint, Track, Note, TrailLayer) successfully register handlers?
6. CSS/Layout: Is the map container sized correctly? Any `overflow: hidden` or `z-index` issues hiding the globe?

### Route visual quality (vs Strava / AllTrails / Komoot)
Cross-reference [brain/research/map-routing-competitor-patterns.md](../../brain/research/map-routing-competitor-patterns.md).

7. **Finished-route material**: is it `PolylineGlowMaterialProperty` (bad default — looks "swimmy") or casing+core (good)?
8. **Per-segment vs single entity**: if the route is split per segment for slope colouring, the joins will show brightness dips. Flag this.
9. **Preview line vs finished line**: is the preview *lighter* than the finished line? If preview is heavier (thicker glow > thinner solid), committing a route feels like a downgrade.
10. **Zoom-responsive width**: is there a `camera.moveEnd` listener adjusting polyline width, or is width fixed in px?
11. **Auto-zoom** (`TrailLayerManager.preselect`, `TripPlanningMap` center-prop effect): is it `flyTo({ destination: Rectangle })` (overshoots short routes) or `flyToBoundingSphere` with `HeadingPitchRange` (tight, pitched)?
12. **Trail discovery line**: is it dashed (competes with topo contours) or thin solid (reads cleanly)?

### Viewer anti-aliasing / crispness
13. `scene.msaaSamples = 4` set? (required for clean polyline edges)
14. `postProcessStages.fxaa.enabled = false`? (FXAA blurs tile text)
15. `useBrowserRecommendedResolution = false`? (native device pixels)
16. `globe.maximumScreenSpaceError` — is it set aggressively (≤ 1.5) for crisp tiles?

### Camera / framing
17. When the wizard opens with a preselected DOC trail, does the camera frame it with ~20 % padding, or does it zoom too far out?
18. In 3D mode, is the pitch ~45° (hero shot) or straight down (flat)?
19. Does the camera position persist across 2D↔3D morphs?

## Report Format

Provide a structured report with:
- **Status**: PASS / WARN / FAIL for each check
- **Issues Found**: specific file:line references and descriptions
- **Competitor Comparison**: for each visual issue, cite which pattern from the research doc the current code diverges from
- **Recommended Fixes**: point at the concrete recipe in [map-ux/SKILL.md](../map-ux/SKILL.md) rather than re-deriving — keep this skill read-only

## Handoff

When the audit surfaces fixable issues, end the report with:

> To implement these fixes, invoke `/map-ux` with the specific recipe(s) referenced above.
