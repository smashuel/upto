---
type: journal
date: 2026-06-17
tags: [map, cesium, wizard, bugs, run-through, backlog]
---

# 2026-06-17 — Map & wizard run-through issues

User did a full create-a-trip run-through and reported 9 issues. Captured here, grouped by root cause, with what was fixed immediately vs. deferred.

## Fixed in this pass

### ✅ Note content required → now optional
Camp spots / markers don't need a comment. [NoteModal.tsx](../../src/components/map/NoteModal.tsx): removed the `required` textarea, the `if (!content.trim()) return` guard, and the disabled-submit. A note now needs only a type (and an optional title) — e.g. drop an "Accommodation" pin with no text. Content label now reads "Note (optional)".

### ✅ Messy what3words clutter under the map → removed
[AdventureLocationStep.tsx](../../src/components/forms/AdventureLocationStep.tsx): removed the "What is what3words?" info banner, the **Primary Trip Location** card (name input + precise-location w3w input), the **Parking / Access Point** and **Emergency Exit Point** cards, and the orphaned "Emergency Location Best Practices" tips alert (it referenced the parking/exit sections we removed). Location is now captured directly from the map (drawing a route / dropping a waypoint sets `location.*`). The collapsed "Route Coordinates & Waypoints" details + the route-suggestions section remain. Removed now-dead imports/state (`What3wordsInput`, `LocationDisplay`, `Input`, parking/emergency state).

> Follow-up question for the user: parking + emergency-exit w3w points are genuinely useful for SAR. We removed the *messy inline UI*, not the concept. If we want them back later, the better home is a compact, optional "key locations" affordance on the map itself (drop-a-pin), not four stacked cards. Noted as a candidate, not lost.

## Deferred — needs investigation / its own task

### ⚠️ Elevation reads 0; profile graph glitches 0↔0  +  3D draw lands in the wrong place  →  SAME root cause
Both stem from **`CesiumManager.pickPosition` using `camera.pickEllipsoid`** ([CesiumManager.ts](../../src/services/CesiumManager.ts)) — it picks the smooth WGS84 ellipsoid (sea level), not the terrain surface. Consequences:
- Every picked point gets `height ≈ 0`, so `TrackDrawer` elevation gain/loss and the profile chart are all zero (the "glitches between 0 and 0").
- In **3D**, the ellipsoid sits *below* the rendered terrain, so a click ray hits the ellipsoid at a point horizontally offset from where the user clicked on the mountainside → the drawn route lands in a different spot than the cursor.

This is already flagged in [plans/compass_artifact.md](../plans/compass_artifact.md) ("Other findings"). **Proper fix** (its own task): use `scene.pickPosition` (depth buffer → real terrain) for the click location, and sample true heights along the finished route with `sampleTerrainMostDetailed` before computing elevation stats. This is the single highest safety-value map fix — elevation numbers currently lie.

The user's pragmatic suggestion — **"limit drawing to 2D only"** — would fix the *horizontal offset* (in 2D the ellipsoid pick maps cleanly to lat/lng) but **not** the elevation (still height 0). So 2D-only is a partial band-aid; the real fix is terrain-aware picking + sampling. Decide during that task whether to also gate drawing to 2D.

### ⚠️ Route didn't match the visible track on the NSW topo basemap
`TrailSnapService` only snaps to **DOC (New Zealand) tracks** — there's no snap data for NSW/AU topo, so a drawn route follows the user's literal clicks, not the track drawn on the GA/NSW tiles. This is the routing/snapping gap already scoped in [plans/compass_artifact.md](../plans/compass_artifact.md) #4 (Valhalla + Meili map-matching over OSM, which covers AU). Until then, snapping outside NZ is best-effort.

### ⚠️ Adding a note cleared the drawn route
Hypothesis (needs reproduction): the route was still **mid-draw** (not finished with a double-click) when the user switched to Note mode. `handleModeChange` calls `trackDrawer.setMode(false)` → `cancelDrawing()`, which discards the in-progress `currentPoints`. Finished tracks (in `this.tracks`) are *not* cleared by mode switches, so this only bites unfinished routes.
**Proposed fix**: when leaving route mode with ≥2 points down, auto-**finish** the route instead of cancelling (or warn). Confirm the repro first — if a *finished* route was cleared, it's a different, more serious bug.

### 📋 TripLink should show a map overview with the route highlighted + last check-in location
Feature, not a bug. The watcher view ([PublicAdventureView.tsx](../../src/pages/PublicAdventureView.tsx)) and the creator's [ActiveTrip.tsx](../../src/pages/ActiveTrip.tsx) should render a read-only map: the planned route highlighted, plus the last check-in location (and eventually live current location). Depends on **route persistence into the TripLink JSONB** (already a roadmap item — [features/triplink-route-persistence.md](../features/triplink-route-persistence.md)) — the route is saved to form state but the view pages don't render it yet. Sizeable; its own phase.

### 📋 Time estimation present but not wired
Known — `GuidePaceEstimator` shows in the wizard but isn't connected to the drawn route. Already on the roadmap ("Wire GuidePace into TripDetailsStep"). TBD a later phase, per the user.

## Summary of dispositions

| # | Issue | Disposition |
|---|-------|-------------|
| 1 | Route didn't match NSW topo track | Deferred → Valhalla/Meili (compass plan #4) |
| 2 | 3D draw lands in wrong place | Deferred → terrain-aware picking (root cause: `pickEllipsoid`) |
| 3 | Elevation 0 / graph glitches | Deferred → same root cause + `sampleTerrainMostDetailed` |
| 4 | Adding note cleared route | Deferred → confirm repro; auto-finish on mode switch |
| 5 | Couldn't add note without comment | ✅ Fixed — content optional |
| 6 | TripLink map overview + last check-in | Deferred → route persistence + view-page map (own phase) |
| 7 | w3w blurb under map messy | ✅ Removed |
| 8 | Primary/parking/precise/exit sections messy | ✅ Removed |
| 9 | Time estimation not implemented | Deferred → GuidePace wiring (known) |
