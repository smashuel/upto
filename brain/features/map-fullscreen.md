---
type: feature
status: shipped
related: [src/components/map/TripPlanningMap.tsx, src/styles/globals.css]
tags: [map, ux, cesium, wizard]
---

# Map Fullscreen Mode

A fullscreen toggle on the Cesium map so users have room to draw, reroute, and inspect trails without fighting the wizard's column layout.

## Shipped (2026-04-22)

- `Maximize2` button at top-right of the map, below the Layers button.
- Click → `viewportRef.current.requestFullscreen()` via the Fullscreen API.
- `:fullscreen` CSS pseudo-class makes the viewport fill 100vw/100vh and forces the inner Cesium canvas div to 100vh.
- Esc / browser fullscreen-exit gesture / button click all exit cleanly.
- **CSS overlay fallback** (`.map-viewport-fullscreen-fallback`) for browsers where the API rejects (sandboxed iframes, older iOS Safari): `position: fixed; inset: 0; z-index: 9999`. Esc handler attached only while fallback is active.
- `isFullscreen` state drives the icon swap (`Maximize2` ↔ `Minimize2`) and the active-button styling.
- Nothing is persisted — fullscreen is transient per spec.

## Notes from implementation

- The Cesium canvas `width: 100%` + the viewer's internal `ResizeObserver` handle the resize automatically — no `viewer.resize()` call needed.
- Manager classes (`WaypointManager`, `TrackDrawer`, `NoteManager`, `TrailLayerManager`) survive Fullscreen API entry without re-binding because the DOM isn't reparented.
- The CSS fallback path *does* re-style (not reparent) the container — also fine for handlers.
- The fullscreen button sits in the same `.map-overlay map-overlay-tr` flex column as the Layers button. The Layers panel renders after both buttons when open, so it doesn't displace the Fullscreen button.

## Problem

In the wizard, the map is embedded alongside form fields and sits in a ~60–70% width column on desktop, shrinking further on tablet/mobile. Drag-to-reroute and trail-discovery clicks are fiddly at that size; small-screen users effectively can't plan a complex route.

## Proposal

- Add a `⛶` (maximise) button to the floating map header, next to the existing Layers / 2D-3D controls.
- On click: take the map container fullscreen via the Fullscreen API (`element.requestFullscreen()`), with a CSS `position: fixed; inset: 0; z-index: 9999;` fallback for browsers where the API is blocked (iframes in some sandboxes, older iOS).
- Exit via Escape, the same button (now `⛶` → `⛶`-restore), or the browser's native fullscreen-exit gesture.
- Persist **nothing** — fullscreen is transient; each mount starts windowed.

## Cesium notes

- The Cesium viewer reacts to its container's resize via the resize observer it installs internally, so no explicit `viewer.resize()` call should be needed. Verify during QA.
- All four `CesiumManager` subclasses (`WaypointManager`, `TrackDrawer`, `NoteManager`, `TrailLayerManager`) own their own `ScreenSpaceEventHandler`. Entering fullscreen via the Fullscreen API does **not** reparent the DOM — the canvas just gets resized — so handlers should survive without special handling. Confirm with an in-flight drawing session.
- The CSS-overlay fallback does reparent (or at least re-styles) the container; double-check that drawing mode still works in that branch.

## Files

- [src/components/map/TripPlanningMap.tsx](../../src/components/map/TripPlanningMap.tsx) — button + toggle handler + `document.fullscreenElement` listener
- [src/styles/globals.css](../../src/styles/globals.css) — `.map-container-fullscreen` fallback class, button styling

## Stretch (not done)

- Remember fullscreen preference for returning users (weak signal though — most sessions will differ).
- Hide wizard nav chrome when fullscreen is active (so the Esc key feels like "back to form"). Less relevant now that the Fullscreen API path covers the whole viewport with the browser's own UI; only meaningful for the CSS fallback path.
