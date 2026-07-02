# PRD: Terrain-accurate elevation — close the remaining gaps

Status: ready-for-agent
Date: 2026-07-02
Origin: Stream 1 ("Terrain-accurate picking"), flagged in brain/project/status.md and
brain/journal/2026-06-17-map-runthrough-issues.md (issues #2/#3).

## Context — what already shipped

Commit `0834976` ("Terrain-accurate picking + elevation (Stream 1)") landed the core fix:

- In 3D, map clicks pick the real terrain surface via the scene's depth buffer
  (`scene.pickPosition`) instead of the sea-level ellipsoid — the 3D route
  draw-offset is fixed. Ellipsoid picking remains the fallback in 2D and on depth
  misses.
- Route points added while drawing, and points dropped after an edit-mode drag, get
  their true terrain height backfilled asynchronously via
  `sampleTerrainMostDetailed` against Cesium World Terrain, regardless of scene
  mode. Live drawing stats re-emit once the heights arrive.

This PRD covers what that commit did **not** finish. Until these gaps close, the
elevation numbers a TripLink *persists* can still lie, which defeats the point of
the stream.

## Problem Statement

I plan a route in the trip wizard, watch the distance / elevation gain / profile
update as I draw, and finish the route with a double-click. The stats I saw looked
right — but the route stored on my TripLink can silently carry a wrong (near-zero)
elevation for the last point or two of the route, and the gain/loss/difficulty
stored with it are computed from those wrong heights. My watchers, and any future
GuidePace time estimate, see numbers that undercount the climb. On an alpine trip I
set my turnaround margin from these numbers, so a wrong number is a safety defect,
not a cosmetic one.

Separately:

- Every time I finish *or re-edit* a route, the wizard appends another copy of it
  to my TripLink instead of updating the one I edited — my trip accumulates
  duplicate routes.
- When I drop a waypoint on the (default, 2D) wizard map, its info box reports
  "0m" elevation, which is visibly wrong in the mountains and erodes trust in
  every other number on the map.
- If terrain data can't load at all (no Cesium Ion token, offline), elevation
  quietly reads 0 with no hint that the number is unavailable rather than true.

## Solution

Make the route data that actually persists to the TripLink as trustworthy as the
live numbers on screen:

1. **Finishing a route waits for truth.** When the user double-clicks to finish
   (or exits edit mode), the final serialized route — the one handed to the wizard
   and stored in the TripLink — is built only after every point's true terrain
   height has been resolved (or conclusively failed). Distance, elevation gain,
   elevation loss, and difficulty are recomputed from those final heights. The user
   can keep seeing the instant provisional stats; the *persisted* record is the
   corrected one.
2. **The wizard upserts routes by id.** A route re-emitted after an edit (same id)
   replaces the stored copy rather than appending a duplicate. Newly drawn routes
   still append.
3. **Waypoints get real heights.** A placed waypoint's elevation is backfilled from
   terrain the same way route points are, and its info box shows the corrected
   height (no more "0m" on a mountainside in 2D).
4. **Honest degradation.** When terrain sampling is unavailable, the map surfaces a
   small, non-blocking notice that elevation figures are unavailable — and the
   serialized route marks elevations as absent rather than storing zeros that
   masquerade as sea level.

## User Stories

1. As a trip planner, I want the elevation gain/loss stored on my TripLink to match
   the terrain I actually drew over, so that my stated plan reflects the real climb.
2. As a trip planner, I want the last points of my route to have correct elevations
   even when I finish drawing quickly with a double-click, so that fast interaction
   doesn't silently corrupt my plan.
3. As a trip planner, I want the difficulty rating stored with my route to be
   computed from true elevation gain, so that "easy" never appears on a route that
   climbs 1,200 m.
4. As a trip planner, I want the elevation profile my watchers see to match the
   profile I saw while drawing, so that we are all looking at the same plan.
5. As a trip planner, I want editing a route (drag-to-reroute) to update the stored
   route rather than adding a second copy, so that my TripLink holds one route per
   route I drew.
6. As a trip planner, I want a route I re-edit several times to still be a single
   route on my TripLink, so that the review step and share view aren't cluttered
   with stale duplicates.
7. As a trip planner, I want a waypoint I drop on the 2D map to show its real
   terrain elevation in its info box, so that I can sanity-check hut and camp
   altitudes while planning.
8. As a trip planner, I want waypoints placed in 2D and 3D to report the same
   elevation for the same spot, so that the scene mode I happen to be in doesn't
   change my data.
9. As a trip planner drawing in 2D (the wizard default), I want my route's
   elevations sampled from real terrain even though the flat map has no height to
   pick, so that planning in the friendlier 2D view costs me nothing in accuracy.
10. As a trip planner, I want the live stats to appear instantly when I click and
    correct themselves a moment later, so that accuracy doesn't make drawing feel
    laggy.
11. As a trip planner without terrain data (offline, missing token), I want a
    visible hint that elevation is unavailable, so that I don't mistake "0 m gain"
    for "flat route".
12. As a trip planner without terrain data, I want my route stored with elevation
    marked absent rather than zero, so that a later re-open with terrain available
    can distinguish "unknown" from "sea level".
13. As a watcher opening a shared TripLink, I want the route's stated distance and
    climb to be the numbers the planner actually committed to, so that I can judge
    whether their expected return time is plausible.
14. As a future GuidePace user, I want time estimates computed from true ascent
    figures, so that the Munter/Chauvin outputs I set turnaround margins by are
    grounded in real terrain.
15. As a trip planner, I want a route snapped to a DOC trail to carry true terrain
    heights along the snapped geometry, so that following an official track gives
    me the same elevation fidelity as free drawing.
16. As a trip planner, I want a point I drag during edit mode to settle at the true
    terrain height where I dropped it, so that rerouting around a spur updates the
    climb correctly.
17. As a trip planner, I want a midpoint I pull out into a new control point to get
    a true terrain height once I release it, so that densifying my route improves
    rather than degrades its profile.
18. As a trip planner, I want the exported GPX of my route to contain the corrected
    elevations, so that my GPS device or another app shows the same profile Upto
    does.
19. As a developer, I want the route-drawing behaviour covered by automated tests
    at the module boundary, so that the finish-race regression can never silently
    return.

## Implementation Decisions

- **The seam is the track-drawing manager's public surface.** Its inputs are map
  clicks (via its Cesium input handler) and mode toggles; its outputs are two
  callbacks — live drawing stats, and the serialized route handed to the wizard.
  All fixes land behind this surface; the wizard-side change is confined to how the
  route callback writes into form state.
- **Finish is a settlement point, not a new pipeline.** Elevation enrichment stays
  asynchronous and per-click (instant point, corrected moment later). Finishing a
  drawing (and committing an edit) awaits one final whole-route enrichment pass,
  then recomputes metadata (distance, gain, loss, difficulty) from the settled
  heights, then serializes and emits. The emit-once contract is preserved: the
  wizard receives one final, correct route per finish rather than a provisional
  emit followed by a correction. Cancel semantics are unchanged.
- **Failure semantics for enrichment:** if terrain sampling fails or is
  unavailable, finish must still complete promptly with picked heights (never hang
  the wizard on a network call) — but the serialized route records that elevations
  are unsampled (see degradation decision) rather than presenting picked ~0 heights
  as measurements.
- **Wizard upserts by route id.** The route-created handler replaces an existing
  form-state entry with a matching id and appends otherwise. No schema change: the
  route array in the TripLink JSONB keeps its shape.
- **Waypoint heights ride the same enrichment mechanism.** The terrain-sampling
  helper currently private to the track drawer moves to (or is shared via) the
  common manager base so the waypoint manager can backfill a placed waypoint's
  elevation and refresh its info-box description. Waypoint serialization already
  carries an optional elevation.
- **Degradation is explicit.** The serialized route's per-point elevation becomes
  optional-when-unknown rather than defaulting to 0. The map shows a small
  dismissible notice when terrain sampling is unavailable ("elevation data
  unavailable — stats shown without climb"). Downstream consumers (stats display,
  GPX export, profile chart) treat absent elevation as "unknown", not zero.
- **No change to picking itself.** Depth-buffer picking in 3D with ellipsoid
  fallback shipped in Stream 1 and is correct; 2D picking legitimately returns
  surface positions with no height, which is exactly what enrichment is for. The
  trail-discovery layer's use of ellipsoid picking for viewport bounds is correct
  and untouched.
- **Respect ADR 013 areas** (requestRenderMode): any visual refresh after async
  elevation correction must request a render frame explicitly.

## Testing Decisions

- **First automated tests in the repo — add Vitest.** The project is Vite-based;
  Vitest slots in with no build changes. Tests live alongside the service they
  cover. This establishes the harness later streams reuse.
- **Test at the track-drawer boundary with a fake `window.Cesium`.** The entire map
  stack already talks to an untyped Cesium global, which makes the global itself
  the natural test double: a small fake providing the math actually used
  (cartesian/cartographic conversions, distance, midpoint), a stub viewer with an
  entity collection, a capturing input-handler class, and a controllable
  `sampleTerrainMostDetailed` whose resolution timing the test drives.
- **Test external behaviour only:** clicks in → callbacks out. Assert on the
  serialized route and emitted stats, never on private fields or internal call
  order.
- **The core test is the race:** click, click, finish *before* the terrain promise
  resolves → the emitted serialized route must still contain fixture terrain
  heights and metadata recomputed from them. A sibling test drives terrain failure
  → finish completes promptly and elevations are marked absent, not zero.
- **Upsert behaviour is tested at the same seam's consumer contract:** re-emitting
  a route with an existing id must result in one stored route; a new id appends.
- **Waypoint enrichment test:** placing a waypoint in a flat (2D-like) pick yields
  a waypoint whose reported elevation settles to the fixture terrain height.
- **No prior art in the repo** — these are the first tests; keep the fake minimal
  and purpose-built rather than attempting a general Cesium mock.
- Manual verification remains: a browser run-through drawing over known NZ terrain
  (e.g. a Tongariro route) confirming persisted gain/loss are non-zero and stable
  across 2D/3D.

## Out of Scope

- **GuidePace wiring** into the trip-details step (own roadmap item). This PRD only
  guarantees the ascent inputs it will consume are true.
- **Routing/snapping quality outside NZ** (Valhalla/Meili — compass plan #4).
- **Route overview on TripLink view pages** (Stream 1 "item A" / route-persistence
  feature file) — this PRD fixes what gets persisted, not where it is displayed.
- **Alternative terrain sources** (LINZ DEM, OpenTopoData, MapTiler) when Cesium
  World Terrain is unavailable — degradation is surfaced honestly instead.
- **Gating drawing to 2D-only** — considered in the 2026-06-17 journal and rejected;
  depth picking already fixed the 3D offset.
- **Note elevation** — notes are presentational pins; their height is not consumed
  anywhere.
- **The suggested-trail elevation figures** shown in route suggestions (sourced from
  DOC/OSM metadata, a different pipeline).

## Further Notes

- The mid-drag stats during drag-to-reroute intentionally use picked heights (a
  network call per mouse-move is not viable); the drop settles the truth. This is
  existing behaviour and stays.
- Distance is currently the 3D chord between enriched points, so it naturally
  becomes slope distance once heights are real — a small, correct increase over the
  flat distance users saw before.
- When this ships: tick the Stream 1 item in the brain status/roadmap, bump the
  journal thread, and consider an ADR if the "persisted stats must be computed from
  settled heights" invariant deserves durable capture.
- Seam and scope choices were made autonomously (user AFK at the checkpoint):
  TrackDrawer-boundary tests with fake Cesium via Vitest; all three gap areas in
  scope with the terrain-unavailable indicator as the smallest slice. Revisit if
  the user disagrees.
