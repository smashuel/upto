---
type: feature
status: partial  # route half shipped 2026-06-18; basemap+camera remainder rides live-GPS stage 1 (roadmap 2026-07-03)
related: [src/types/adventure.ts, src/services/TrackDrawer.ts, src/pages/CreateAdventure.tsx, src/pages/ViewAdventure.tsx, src/pages/PublicAdventureView.tsx, src/components/map/TripPlanningMap.tsx]
tags: [triplink, persistence, tracking, safety, map]
---

# Route Persisted on TripLink (→ Live-Tracking vs Plan)

When a TripLink is generated, the drawn route + chosen basemap should travel with it. That turns the TripLink from "intent summary" into "reference object the in-trip view can compare live GPS against" — enabling off-route alerts and shared participant views later.

## Problem

Today the route lives in `TrackDrawer`'s in-memory state + whatever summary fields land on the `Adventure` localStorage blob. The in-trip / public view has no polyline, no elevation profile, and no knowledge of which basemap the planner used. Consequences:

- The shared link renders a blank/default map — loses the whole point of having spent time planning a route.
- We can't build "you're 300 m off your planned line" alerts without the polyline on hand.
- If/when the user goes back to inspect a past trip, the shape of what they planned is gone.

## Proposal

On TripLink save, serialise:

1. The drawn track via the existing `SerializableTrack` export from [TrackDrawer.ts](../../src/services/TrackDrawer.ts) — positions, waypoints, stats (distance / ascent / descent / estimated time), possibly the elevation samples.
2. The active `MapLayer` from [BasemapSuggest.ts](../../src/services/BasemapSuggest.ts) (`'satellite' | 'topo-linz' | 'topo-ga' | 'topo-nsw'`) so the view renders on the same canvas the planner used.
3. (Optional) The camera framing used at save time — so reopen lands where the planner last looked.

On in-trip / shared view mount:

- Rehydrate the track into a read-only `TrackDrawer` render (or a simpler polyline renderer if drawing tools are gated).
- Apply the saved basemap.
- Later: overlay live GPS and surface an "off-route" indicator when the live point drifts beyond a threshold.

## Files

- [src/types/adventure.ts](../../src/types/adventure.ts) — extend TripLink with `plannedRoute?: SerializableTrack` and `plannedBasemap?: MapLayer`
- [src/pages/CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx) — wire the save to include these fields
- [src/pages/ViewAdventure.tsx](../../src/pages/ViewAdventure.tsx) + [PublicAdventureView.tsx](../../src/pages/PublicAdventureView.tsx) — render the rehydrated route
- [src/components/map/TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx) — accept a `plannedRoute` prop + `plannedBasemap` prop, honour on mount, skip auto-resolve for basemap if provided
- [src/services/TrackDrawer.ts](../../src/services/TrackDrawer.ts) — already exposes `SerializableTrack`; may need a "read-only" render mode

## Blocker

This is half-blocked on the **persistence backend** (see Persistence section in [../project/roadmap.md](../project/roadmap.md)). Right now TripLinks live in localStorage, which is per-device — so the "share a TripLink" half of this feature can't work without a backend. But we *can* ship the localStorage version first: the rehydrate-on-view-page path has value even if only the author's device has the data, and it proves the shape we'll send to Postgres later.

## Relationship to other backlog

- Pairs with [map-fullscreen.md](map-fullscreen.md) — rehydrated route + fullscreen = in-trip reference screen.
- Feeds [../plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md) — joined participants see the same route.
- Enables eventual off-route alerting as part of the safety system (check-in escalation).

## Stretch

- Off-route detection: simple point-to-polyline distance check on a geolocation watch; alert if > X m for > Y seconds.
- Progress indicator: "you're 40% along your planned route" based on cumulative distance.
- Automatic late-running warning: if pace (distance / elapsed) is trending slow vs. the plan's estimated time, nudge the user / emergency contact early.
