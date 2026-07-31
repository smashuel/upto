# 01 — Cesium Ion satellite + 3D terrain don't render in the native iOS app

Status: done (2026-07-31) — verified on device
Surfaced: on-device (TestFlight, iPhone), 2026-07-31
Area: src/components/map/TripPlanningMap.tsx (Cesium Ion setup, lines ~428–498)

## What to build

On the native iOS app, **satellite imagery** and **3D terrain** don't render, while **2D LINZ
topo works**. The first suspected cause — a missing `VITE_CESIUM_ION_TOKEN` in the Codemagic
build — is now **ruled out**: build 11 (commit `9238e15`) has `VITE_CESIUM_ION_TOKEN` bundled
(confirmed in the Codemagic env list, no "token empty" warning). So this is a genuine
**Cesium Ion-in-WKWebView** problem, not a config gap.

Key clue: 2D topo renders through Cesium (backend-proxied LINZ tiles), which proves Cesium
core + WebGL + web workers + self-hosted static assets all load inside the WKWebView. What
fails is specifically the **Cesium Ion network path** — satellite (Ion asset 2) and world
terrain (Ion asset 1), both gated by `hasValidToken`.

Diagnose and fix. Hypotheses to check (device diagnostics needed):
- Ion asset endpoint / tile fetch blocked or failing under the `capacitor://localhost` (iOS)
  origin — CORS or scheme handling on `api.cesium.com` / `assets.cesium.com`.
- The token isn't actually reaching `Ion.defaultAccessToken` at runtime (env var baked but
  read differently in the bundled app).
- `CESIUM_BASE_URL` / static-asset resolution differs for Ion vs the already-working topo path.
- WKWebView WebGL/context limits for the terrain mesh specifically.

## Acceptance criteria

- [ ] Confirm the exact symptom on a token-bundled build (11+): blank / OSM-fallback / black /
      no terrain relief / crash — for both "select Satellite" and "switch to 3D".
- [ ] Capture WKWebView console + network diagnostics showing the Ion failure (remote web
      inspector, or temporary in-app logging since no Mac/devtools is on hand).
- [ ] Root cause identified and fixed; satellite imagery and 3D terrain render on the device.
- [ ] 2D LINZ topo remains unaffected.

## Blocked by

- None — but needs an on-device diagnostic pass to confirm root cause before a fix lands.
