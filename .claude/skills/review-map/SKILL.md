---
name: review-map
description: Debug and review the Cesium 3D mapping components for issues
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
---

# Review Cesium Map Stack

Analyze the mapping components and services for issues. This is a read-only diagnostic skill.

## Files to Analyze

- `src/components/map/TripPlanningMap.tsx` - Main Cesium viewer component
- `src/components/map/MapSelector.tsx` - Leaflet-based map selector (secondary)
- `src/services/WaypointManager.ts` - Waypoint click handling and rendering
- `src/services/TrackDrawer.ts` - Route drawing and track management
- `src/services/NoteManager.ts` - Map note placement
- `src/components/forms/AdventureLocationStep.tsx` - Form step that hosts the map
- `index.html` - Cesium CDN script loading

## What to Check

1. **Initialization chain**: Does the Cesium Viewer initialize properly? Is the `screenSpaceEventHandler` available when managers try to use it?
2. **Imagery loading**: Is the Ion token valid? Does `IonImageryProvider.fromAssetId(2)` succeed? Does the OSM fallback work?
3. **Terrain loading**: Does `CesiumTerrainProvider.fromIonAssetId(1)` complete?
4. **React lifecycle**: Are useEffect dependencies correct? Is the viewer being recreated unnecessarily? Check for stale closures.
5. **Manager initialization**: Do WaypointManager, TrackDrawer, NoteManager all successfully register event handlers?
6. **Camera positioning**: Is the camera pointing at land with proper altitude?
7. **CSS/Layout**: Is the map container sized correctly? Any `overflow: hidden` or `z-index` issues hiding the globe?

## Report Format

Provide a structured report with:
- **Status**: PASS/WARN/FAIL for each check
- **Issues Found**: specific line numbers and descriptions
- **Recommended Fixes**: concrete code changes if issues are found
