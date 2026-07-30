# Native map fixes

Issues surfaced from on-device (iPhone / TestFlight) testing of the Capacitor shell,
2026-07-31. Map bugs + UX changes, separate from the live-location Stage 2 feature work.

| # | Issue | Type | Status |
|---|-------|------|--------|
| [01](issues/01-native-cesium-ion-satellite-3d.md) | Cesium Ion satellite + 3D terrain don't render in the native app (token confirmed bundled) | bug | needs-info |
| [02](issues/02-simplify-basemap-satellite-topo.md) | Collapse basemap to Satellite + Topo, auto-region topo | change | ready-for-agent |
| [03](issues/03-isolate-map-gestures.md) | Isolate map gestures so pan/zoom don't move the wizard | ux/bug | ready-for-agent |
| [04](issues/04-fullscreen-map-window-with-done.md) | Open the map in its own fullscreen window with a Done button | ux | ready-for-agent |
| [05](issues/05-map-performance-lag.md) | Map is sluggish on the native device when panning/zooming | perf | needs-info |

Related shipped fixes (branch `live-location-stage-2`): fullscreen safe-area insets +
satellite render-nudge (`8a10e96`), VITE build keys into Codemagic (`9238e15`).
