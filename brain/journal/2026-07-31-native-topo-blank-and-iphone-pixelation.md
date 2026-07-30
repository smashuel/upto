---
date: 2026-07-31
tags: [capacitor, cesium, basemap, performance, native]
---

# Native: topo never paints, satellite looks pixelated

Two unrelated defects found in the same on-device session (first TestFlight build that
actually shipped our changes — an incomplete App Store Connect compliance step had been
silently blocking earlier builds from reaching the device, so several "still broken"
reports were really "never installed").

## Bug A — LINZ topo never paints on native

**Symptom.** On iPhone the map opens on satellite. The Layers panel shows *LINZ Topo* as
the active layer, but the imagery is satellite. Toggling to Satellite and back to Topo
changes the highlighted chip and never changes the pixels.

**Root cause.** `getTopoTileUrl()` returned the root-relative template
`/api/tiles/topo/{z}/{x}/{y}` in production. That only works when the page is served from
an origin that proxies `/api/*` (Vercel). In the Capacitor WebView the document origin is
`capacitor://localhost` (iOS) / `https://localhost` (Android), so every tile request
resolved *into the bundled web assets* and 404'd.

The basemap state machine was working perfectly — `applyBasemap` added the imagery layer
and `mapLayer` flipped to `topo-linz`. The layer simply had no pixels, and the satellite
base layer underneath it stayed visible. That mismatch between UI state and rendered
imagery is what made it look like a toggle bug rather than a networking bug.

Corroborating detail: the AU layers (GA National, NSW Topo) use absolute ArcGIS URLs and
were unaffected — only the backend-proxied NZ layer broke.

**Fix.** Extracted the branch into a pure, tested seam `src/services/topoTileUrl.ts`
(`resolveTopoTileUrl`), which returns an absolute backend origin whenever `isNative`.
`isNativePlatform()` is now exported from `src/config/api.ts` and reused rather than
re-implemented. Verified the proxy serves tiles cross-origin:
`GET https://api.upto.world/api/tiles/topo/12/4020/2555` → `200 image/png` with
`access-control-allow-origin: *`.

**This is the second time this exact root cause has shipped** — `src/config/api.ts` was
fixed for it on 2026-07-09. Promoted to [ADR 017](../decisions/017-no-relative-api-urls-on-native.md).

## Bug B — satellite imagery pixelated on iPhone

**Symptom.** Ion satellite renders, but visibly soft/blocky.

**Not the cause.** Suspected the imagery source, since the docs said Ion asset 2 was
Sentinel-2 (10 m/px, mushy when zoomed in). Queried the Ion API directly: **asset 2 is
"Bing Maps Aerial"**, not Sentinel-2. The docs were wrong in three places (CLAUDE.md,
`features/3d-map.md`, `features/basemap-toggle.md`) — corrected. The source was already
the best available, so the fault had to be in rendering.

**Root cause.** `detectDeviceTier()` demoted anything with `cores <= 4` to the `low`
profile (`resolutionScale: 0.75`, `maximumScreenSpaceError: 2.0`). iOS Safari **does**
report `navigator.hardwareConcurrency`, and reports `4` on iPhones — including current
flagships. So every iPhone silently rendered at the low-end profile. The comment directly
above the code even said iOS should "conservatively assume `mid`"; the code contradicted
its own stated intent.

**Fix.** Extracted `classifyDeviceTier` into `src/services/deviceTier.ts` with an explicit
iOS carve-out: core count is only consulted on platforms that report it honestly. iPhones
now land on `mid` (`resolutionScale: 0.9`, SSE `1.6`).

**Tradeoff to watch.** This raises render quality on exactly the device that was also
reported as laggy when panning/zooming. Sharper and heavier pull in opposite directions;
`mid` is what the code always intended, so it's the right baseline, but issue 05 (map
performance) should now be re-measured on device before any further tuning. If `mid` turns
out to be too heavy on real hardware, the answer is to tune the `mid` profile numbers in
`MapPerformance.ts` — not to reinstate the misclassification.

## Tests

16 new `node --test` cases across the two seams (`topoTileUrl.test.ts`, `deviceTier.test.ts`).
Suite: 101 node-test + 41 vitest passing.
