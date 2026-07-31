# 08 — Route edit mode: dragging points pans the map instead on touch

Status: closed as deferred (2026-07-31) — Edit hidden on touch, accepted on device; drag-on-touch not built
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
- [x] If deferred instead: the Edit control is hidden on touch devices and this issue stays open
      with that decision recorded.

## Blocked by

- None.

## Closed as deferred — 2026-07-31

Accepted on device with the deferral in place: **the Edit control is hidden on touch**, so the
broken interaction is no longer reachable rather than fixed. Being explicit about what is and
is not true — dragging a route point on a phone is *still not implemented*. A touch user who
draws a bad route redraws it (which, since ADR 018, replaces the previous route cleanly), and
that is now the whole editing story on mobile.

Hiding the control was the honest move over leaving it visible: a pencil icon that pans the map
instead of moving the point reads as a broken app, not a missing feature.

**Reconsider if** redrawing proves too blunt for long routes — a 40-point route redrawn to move
one point is a bad trade. The real fix is a touch drag handler that claims the gesture before
Cesium's camera controller sees it (`ScreenSpaceEventType.PINCH_*` / touch move), which is why
this was deferred rather than patched: it needs the gesture-priority work, not a tweak.
