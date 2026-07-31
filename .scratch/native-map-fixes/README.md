# Native map fixes — CLOSED 2026-07-31

Issues surfaced from on-device (iPhone / TestFlight) testing of the Capacitor shell,
2026-07-31. Map bugs + UX changes, separate from the live-location Stage 2 feature work.

**All 11 closed and verified on device.** This sweep is done; it is kept as the record of what
the first real-device run of the shell found. The durable write-ups live in
[ADR 018](../../brain/decisions/018-one-route-per-triplink.md) and
[journal/2026-07-31-note-crash-nested-form.md](../../brain/journal/2026-07-31-note-crash-nested-form.md).

| # | Issue | Type | Outcome |
|---|-------|------|---------|
| [01](issues/01-native-cesium-ion-satellite-3d.md) | Cesium Ion satellite + 3D terrain don't render in the native app | bug | **done** — async Ion fallback defect + `VITE_*` keys missing from the Codemagic build |
| [02](issues/02-simplify-basemap-satellite-topo.md) | Collapse basemap to Satellite + Topo, auto-region topo | change | **done** — region resolved from the viewport, no country picker |
| [03](issues/03-isolate-map-gestures.md) | Isolate map gestures so pan/zoom don't move the wizard | ux/bug | **done** — gestures contained to the map |
| [04](issues/04-fullscreen-map-window-with-done.md) | Open the map in its own fullscreen window with a Done button | ux | **done** — needed safe-area floors before Done was reliably tappable |
| [05](issues/05-map-performance-lag.md) | Map is sluggish when panning/zooming | perf | **done** — resolved via the LOD + device-tier work; no dedicated profiling pass, subjective pass only |
| [06](issues/06-map-notes-crash-triplink.md) | Adding a map note crashes the TripLink | bug (data loss) | **done** — a nested `<form>`, after three wrong hypotheses |
| [07](issues/07-simplify-map-control-set.md) | Map control set unclear and redundant | ux | **done** — Waypoint / My location / Reset view removed |
| [08](issues/08-route-edit-drag-unusable-touch.md) | Route edit: dragging points pans the map on touch | bug | **deferred, accepted** — Edit hidden on touch; drag-on-touch still not built |
| [09](issues/09-2d-imagery-sharpness-uneven.md) | 2D imagery sharpness varies across the screen | bug | **done** — real LOD split from the 2D terrain provider, not refinement settling |
| [10](issues/10-map-notes-not-persisted.md) | Map notes are never persisted to the TripLink | gap | **done** — notes ride the TripLink and open on tap in the shared view |
| [11](issues/11-multiple-routes-per-triplink.md) | Multiple routes can be drawn on one TripLink | product | **done** — one route per TripLink ([ADR 018](../../brain/decisions/018-one-route-per-triplink.md)) |

## What this sweep is worth remembering for

- **Only one of these was findable without a device.** Everything here passed tsc, lint and the
  full test suite on the way in. The on-device run is not a formality at the end of the shell
  work — it is the only thing that surfaced any of it.
- **Issue 06 cost four rounds** because three plausible Cesium-side hypotheses were chased
  before the absence of any exception was treated as evidence. The instrument built to settle it
  (crash breadcrumb + banner) is kept: an iOS content-process kill is otherwise unobservable on
  TestFlight, where there is no console to read.
- **Two issues (10, 11) were product gaps, not bugs** — surfaced only because a real user was
  driving. Both became decisions rather than patches.

## Carried forward, not fixed

- **Drag-to-edit a route point on touch** (issue 08). Needs a touch handler that claims the
  gesture before Cesium's camera controller sees it. Redrawing is the mobile editing story until
  then.
