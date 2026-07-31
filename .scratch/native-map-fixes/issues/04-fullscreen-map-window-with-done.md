# 04 — Open the map in its own fullscreen window with a "Done" button

Status: done (2026-07-31)
Surfaced: on-device (iPhone), 2026-07-31
Area: AdventureLocationStep.tsx / CreateAdventure.tsx (wizard step), TripPlanningMap.tsx (fullscreen)

## What to build

On mobile the map opens as a small embedded box inside the wizard, which is cramped to
navigate and draw in. Entering the **Map & route** step should open the map in a **dedicated
fullscreen view** (its own window over the wizard), so there's room to pan/zoom/draw, and a
clear **Done** button to return to the TripLink wizard when finished — carrying the drawn route
and waypoints back into the step. Reuse the existing fullscreen plumbing (the `Maximize2` /
`:fullscreen` path) but make fullscreen the *default entry* for this step on mobile rather than
an opt-in maximise.

Pairs with issue 03 (gesture isolation): fullscreen removes most of the "gesture spills into
the page" problem by construction, but 03 still matters for the embedded/desktop case.

## Acceptance criteria

- [ ] On mobile, opening Map & route presents the map fullscreen (not a small embedded box).
- [ ] A visible **Done** button returns to the wizard and preserves the drawn route, waypoints,
      and chosen basemap.
- [ ] Re-opening the step returns to the map with prior work intact.
- [ ] Desktop remains acceptable (embedded or fullscreen — pick the cleaner of the two).

## Blocked by

- None. Complements issue 03.
