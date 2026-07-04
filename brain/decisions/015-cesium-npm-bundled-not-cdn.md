---
type: decision
id: 015
status: accepted
date: 2026-07-04
tags: [map, cesium, build, vite, types, dependencies]
---

# 015 — Cesium is bundled from npm (vite-plugin-cesium), not loaded from a CDN

## Context

Cesium 1.132 was loaded from a CDN `<script>` in `index.html` and reached
everywhere through the `window.Cesium` global, typed `any`. Ten+ map files carried
`eslint-disable no-explicit-any` largely to tolerate that global. This meant: no
autocomplete or compile-time checking on a safety-critical map, a hard runtime
dependency on `cesium.com` being reachable at page load, and a latent version-skew
risk (the CDN pinned 1.132 while `package.json` already carried an unused
`cesium@^1.132.0` that resolved to 1.133.1). The roadmap sequenced the swap as the
bridge between the terrain-truth stream and Live GPS — after the map services
stopped churning, before a real-time position channel got stacked on the untyped
surface. See [.scratch/npm-cesium-typed/PRD.md](../../.scratch/npm-cesium-typed/PRD.md).

## Decision

Bundle Cesium from the npm `cesium` package via **`vite-plugin-cesium`** (default
`rebuildCesium: false`): it sets `CESIUM_BASE_URL`, self-hosts Cesium's static
assets (`Assets`/`Workers`/`ThirdParty`/`Widgets`), injects `widgets.css`, and
externalises the JS to a self-hosted script in the build. All map code imports
`import * as Cesium from 'cesium'`; the `window.Cesium` global and the CDN tags are
gone. `@types/cesium` (stale 1.70) is removed — the package's own bundled `.d.ts`
provides real types under `moduleResolution: bundler`. Version pinned to the
`~1.133.0` line (the version already resolved in `package.json`; the CDN's 1.132 →
npm 1.133.1 shift is a same-major minor, tsc-validated, no behaviour change
observed).

The migration ran in three green-throughout slices bridged by a temporary
`window.Cesium = Cesium` bootstrap (removed in the final slice), keeping a single
Cesium instance in both dev and build.

## Alternatives

- **Keep the CDN global.** Zero build work, but leaves the map untyped,
  CDN-coupled, and a poor base for Live GPS. Rejected — it is the problem.
- **`rebuildCesium: true` (bundle Cesium's source into the JS).** True single-ESM
  instance with no injected script, but a much larger JS bundle and slower builds.
  Unnecessary: the default externalised mode is dev/build-consistent once the
  bootstrap unifies the instance, and bundle-size work is explicitly out of scope.
- **Manual `CESIUM_BASE_URL` + static-copy plugin.** More control, more bespoke
  config to maintain. The purpose-built plugin is the well-trodden path.
- **Upgrade Cesium as part of this.** Rejected — a loader swap, not a version bump;
  pinned to the current line to keep the regression surface small.

## Consequences

- Direct Cesium API calls are now type-checked — this immediately caught three
  latent bugs the `any` global hid (`OpenStreetMapImageryProvider.fromUrl` does not
  exist; a possibly-null `Viewer` container), all in the no-Ion-token fallback path.
- The ADR-013 test seam moved from injecting `window.Cesium` to
  `vi.mock('cesium', …)` returning a stable fake module; the fake's spherical math
  and four terrain modes are unchanged.
- **Still `any`:** viewer/entity refs and Cesium option bags across the map stack
  keep a file-level `eslint-disable`. Typing `viewer` as `Cesium.Viewer` cascades
  into every subclass's entity/scene calls, so a full de-any is a tracked follow-up
  ([.scratch/npm-cesium-typed/issues/04-de-any-map-stack.md](../../.scratch/npm-cesium-typed/issues/04-de-any-map-stack.md)).
  `CesiumManager`'s elevation/terrain surface (`ElevationPoint`, `samplingTerrain`,
  `handler`) is typed.
- The build serves Cesium from its own origin — the planning map no longer breaks
  if `cesium.com` is slow or blocked.

## Reconsider if

- Cesium ships a first-class Vite/ESM story that makes `vite-plugin-cesium`
  redundant, or the plugin goes unmaintained.
- Bundle size on the map route becomes a measured problem (revisit chunking /
  lazy-loading Cesium, currently out of scope).
