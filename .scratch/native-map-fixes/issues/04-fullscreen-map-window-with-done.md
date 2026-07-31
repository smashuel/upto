# 04 — Open the map in its own fullscreen window with a "Done" button

Status: done (2026-07-31) — verified on device after the safe-area floors
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

- [x] On mobile, opening Map & route presents the map fullscreen (not a small embedded box).
- [x] A visible **Done** button returns to the wizard and preserves the drawn route, waypoints,
      and chosen basemap.
- [x] Re-opening the step returns to the map with prior work intact.
- [x] Desktop remains acceptable (embedded or fullscreen — pick the cleaner of the two).

## Blocked by

- None. Complements issue 03.

## Verified on device — 2026-07-31

Fullscreen map with Done works on the iPhone. This one was reopened once: the first fix
presented fullscreen correctly but the Done button and map header sat under the notch and the
home indicator, so the escape hatch was partly unreachable. Fixed by honouring the safe-area
insets with a floor, rather than trusting `env(safe-area-inset-*)` alone — inside the Capacitor
WebView those can report 0 before the view settles, which is what produced a control you could
see but not reliably tap.
