# 08 — Route edit mode: dragging points pans the map instead on touch

Status: ready-for-agent
Surfaced: on-device (iPhone), 2026-07-31
Area: TripPlanningMap.tsx (edit mode), src/services/TrackDrawer.ts

## What to build

The Edit Route control (pencil, bottom-right) enters a mode where route points are meant to be
draggable. On a phone this does not work: dragging a point pans the map instead, so the route
cannot be adjusted at all after it's drawn.

Almost certainly the drag handler is bound to mouse events (or to a Cesium screen-space event
type that doesn't fire for touch), so the touch never reaches the point and falls through to
Cesium's default camera pan. Note that issue 03 set `touch-action: none` on the map viewport,
which correctly hands all touches to Cesium — so the fix belongs in how edit mode claims the
touch, not in CSS.

Either make drag-to-edit work on touch, or — if that's a larger piece of work — remove the Edit
control on touch devices for now so it doesn't advertise a capability the app doesn't have, and
keep this issue open as the record.

## Acceptance criteria

- [ ] On a phone, entering edit mode and dragging a route point moves that point, and the map
      does not pan during the drag.
- [ ] The route's distance/elevation/time stats update after an edit, as they do on desktop.
- [ ] Desktop mouse drag-to-edit is unchanged.
- [ ] If deferred instead: the Edit control is hidden on touch devices and this issue stays open
      with that decision recorded.

## Blocked by

- None.
