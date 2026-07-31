# 11 — Multiple routes can be drawn on one TripLink

Status: needs-decision
Surfaced: on-device (iPhone), 2026-07-31
Area: src/services/TrackDrawer.ts, TripPlanningMap.tsx, AdventureLocationStep.tsx

## What to build

Nothing stops a user drawing several separate routes on the same map, and all of them are
kept. A TripLink describes one trip, and the safety model downstream assumes one intended
line of travel: the route drives distance, elevation, the GuidePace time estimate, and what a
watcher sees on the shared view. Several routes make "how long should this take, and where
should they be right now" ambiguous.

Decide the intended model before changing behaviour. Either:

- **One route per TripLink** — drawing a new one replaces or is refused until the existing one
  is cleared, with an obvious way to start over. Simplest, matches the safety model.
- **Multiple legs, explicitly modelled** — several routes are legitimate (e.g. day 1 / day 2, or
  an approach plus a climb), in which case they need ordering, per-leg stats, and a defined
  aggregate for the time estimate and the overdue calculation.

Whichever is chosen, existing TripLinks that already store several routes must still open and
render without losing data.

## Acceptance criteria

- [ ] Decision recorded (single route, or explicitly modelled legs).
- [ ] Drawing behaviour matches the decision, and the UI makes the rule obvious rather than
      silently discarding or silently accumulating.
- [ ] Route stats, GuidePace estimate, and the shared/active views agree on which route(s) count.
- [ ] TripLinks already holding multiple routes still load.

## Blocked by

- Needs a product decision from the user.

## Decided and shipped — 2026-07-31

**One route per TripLink.** See [ADR 018](../../../brain/decisions/018-one-route-per-triplink.md)
for the reasoning, the alternatives, and the deferred multi-leg direction.

Enforced in `applyDrawnRoute` (form state) *and* `TrackDrawer.setSingleTrackMode` (the map),
so the two cannot disagree. A newly drawn route replaces the stored one and says so; an edit
re-emits the same id and is not announced. Existing TripLinks holding several routes are not
rewritten and still render in full on read-only maps.

Future direction recorded, explicitly not being built now: a multi-sport trip (paddle, ride,
run) is one route made of **legs** carrying their own activity type — not several routes.
