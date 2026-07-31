# 03 — Isolate map gestures so pan/zoom don't move the wizard

Status: done (2026-07-31)
Surfaced: on-device (iPhone), 2026-07-31
Area: TripPlanningMap.tsx / AdventureLocationStep.tsx (map container touch handling)

## What to build

On mobile, when the map is an embedded box inside the TripLink wizard, pan/zoom/drag gestures
that stray outside the map bounds scroll or move the **whole wizard page** — so navigating or
drawing a route "moves the whole workflow," which feels broken. Contain the map's touch
gestures so panning, pinch-zooming, and route-drawing never scroll or move the surrounding
wizard, regardless of whether a finger drifts off the map edge mid-gesture.

This is the gesture-containment half of the map-window work — deliberately split from the
dedicated-fullscreen-window change (issue 04) so the "it fights me when I drag" pain can be
fixed independently and first. Use touch-action / gesture-capture containment on the map
surface; don't rely on the fullscreen window existing.

## Acceptance criteria

- [ ] On mobile, pan / pinch-zoom / drag-to-draw on the map never scrolls or moves the wizard
      page — including when a gesture starts on the map and the finger leaves the map bounds.
- [ ] Route drawing and waypoint placement still work normally.
- [ ] Holds whether the map is embedded (issue 04 not yet done) or fullscreen.
- [ ] No regression to desktop mouse/trackpad interaction.

## Blocked by

- None. Complements issue 04 but is independent.
