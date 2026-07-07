# Slice 4 — Basemap persistence rider

Status: ready-for-agent
Parent: [.scratch/live-location/PRD.md](../PRD.md)
Covers user stories: 18, 19

## What to build

Persist the basemap the planner chose so a shared TripLink opens on the same canvas the route
(and the live marker) was drawn on, instead of a default world view. This completes the
unshipped basemap half of
[triplink-route-persistence.md](../../../brain/features/triplink-route-persistence.md) — the
route half already shipped.

Add `plannedBasemap?: MapLayer` to the TripLink (canonical `MapLayer` from `BasemapSuggest`:
`'satellite' | 'topo-linz' | 'topo-ga' | 'topo-nsw'`). On TripLink save, `CreateAdventure`
includes the current basemap. On view mount, `TripPlanningMap` honours a `plannedBasemap`
prop and **skips viewport auto-resolve** when it's present — so an AU trip opens on GA/NSW
topo rather than defaulting to NZ LINZ.

**No `plannedCamera` and no persisted scene mode** (grilled): with a moving live marker we
don't want a frozen planning camera fighting "keep the marker in view", so the view page's
existing bounds-fit (`flyToRouteBounds`) is **extended to include the live point** rather than
restoring a saved camera. The watcher view stays in 2D topo (the sensible glance default).

This slice is largely independent of the live-position pipeline; it can proceed in parallel.
The only coupling is the framing tweak to include the live point, which degrades gracefully to
route-only framing when no live point exists.

## Acceptance criteria

- [ ] `plannedBasemap?: MapLayer` added to the TripLink type.
- [ ] `CreateAdventure` saves the current `MapLayer` (from `BasemapSuggest`) on the TripLink.
- [ ] `TripPlanningMap` accepts a `plannedBasemap` prop and applies it on mount, skipping
      viewport auto-resolve when present.
- [ ] `PublicAdventureView` and `ViewAdventure` pass `plannedBasemap` through.
- [ ] View-page camera framing (`flyToRouteBounds`) is extended to include the live point when
      one is present; falls back to route-only framing otherwise.
- [ ] The camera must **not hard-recenter on every position fix** (Slice 01 fed live position
      in as the map `center`, so the view yanked every ~3 min). Keep the live point in view via
      a bounds fit, not a per-fix fly-to; only re-frame when it drifts out of view.
- [ ] Demoable: plan an AU trip on GA topo → the shared view opens on GA topo with the route
      (and live marker, if streaming) framed — not a default NZ/world view.

## Blocked by

None — can start immediately. (The framing-to-live-point criterion coordinates with Slice 1
but degrades to route-only framing without it.)
