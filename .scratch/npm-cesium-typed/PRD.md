# PRD — Bundle Cesium via npm with real TypeScript types (kill the `window.Cesium: any` surface)

Status: ready-for-agent
Created: 2026-07-04
Origin: Roadmap "Bridge — before phase 2 map work starts" ([brain/project/roadmap.md](../../brain/project/roadmap.md#L58-L64)).
Deliberately sequenced now: **after** Stream 1 (terrain-accurate picking) stopped churning the
map services, **before** Live GPS (phase 2) stacks a position channel on top of them. The
roadmap is explicit that the worst possible time to do this is *after* phase 2 code exists.
Respects [ADR 013](../../brain/decisions/013-vitest-alongside-node-test.md) (Vitest boundary
tests against a fake Cesium) and [ADR 014](../../brain/decisions/014-settle-window-is-a-real-state.md)
(manager teardown/epoch discipline).

## Context — what exists today

- Cesium 1.132 is loaded from a **CDN `<script>` tag** in `index.html`; its widgets CSS from a
  CDN `<link>`. Nothing about Cesium is bundled by Vite.
- Every map module reaches Cesium through the **`window.Cesium` global**, typed `any`. The
  ambient `Cesium: any` lives on the `Window` interface in `TripPlanningMap.tsx`. Ten map files
  carry `/* eslint-disable @typescript-eslint/no-explicit-any */` and/or inline `: any` largely
  because of this. The four managers all resolve Cesium as `const Cesium = window.Cesium` (or
  `window.Cesium.X` directly).
- `cesium@^1.132.0` and `@types/cesium@^1.70.4` are **already declared in `package.json` but
  unused at runtime**. `@types/cesium` (1.70) is ~60 minor versions behind the 1.132 runtime and
  describes an API that no longer matches; modern Cesium ships its own accurate bundled `.d.ts`.
- The Ion token is applied at runtime: `Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN`.
- `vite.config.ts` is bare (`react()` only) — no `CESIUM_BASE_URL`, no copying of Cesium's
  `Assets` / `Workers` / `ThirdParty` / `Widgets` static payload.
- **Test seam (ADR 013):** map services are tested at their public boundary (input events in →
  callbacks out) against a purpose-built fake with real spherical math, injected by
  `installFakeCesium()` which sets `globalThis.window.Cesium`. The `node --test` lifecycle suites
  do **not** touch Cesium and are unaffected by this work.

## Problem Statement

As the developer, every time I touch the map stack I am working blind. Cesium is an untyped
`any` global, so my editor gives me no autocomplete, no signature help, and no compile-time error
when I misspell a Cesium member or pass the wrong argument shape — the mistake only surfaces as a
runtime failure in the browser, on a safety-critical map. The all-`any` surface also defeats the
repo's `strict` TypeScript everywhere it matters most. On top of that, the app hard-depends on a
third-party CDN being reachable at page load: if `cesium.com` is slow, blocked, or serving a
different build than the version I pinned, the planning map silently fails to initialise. I am
about to build Live GPS — a new real-time position channel — directly on top of this untyped,
CDN-coupled surface, which is the worst possible foundation to extend.

## Solution

Cesium becomes a normal bundled npm dependency with real types, exactly like every other library
in the app. The developer imports Cesium from the `cesium` package and gets full autocomplete,
signature help, and compile-time type checking across the whole map stack; the `window.Cesium:
any` global and the blanket `eslint-disable no-explicit-any` headers that existed only to tolerate
it are removed. The app no longer fetches Cesium from a CDN at runtime — the exact pinned version
and its static assets (workers, web-assembly, widget CSS, imagery/terrain approximation data) are
served from the app's own build output, so the map initialises without any third-party origin
being reachable. Nothing about the *behaviour* of the map changes for end users: same basemaps,
same Ion token flow, same route drawing, same terrain sampling, same 2D/3D toggle. This is a
foundation swap, not a feature.

## User Stories

1. As the developer, I want Cesium imported from the `cesium` npm package, so that I stop
   depending on a runtime CDN fetch for a safety-critical component.
2. As the developer, I want real Cesium type definitions in scope, so that my editor gives me
   autocomplete and signature help for Cesium APIs across the map stack.
3. As the developer, I want the compiler to reject a misspelled or misused Cesium member, so that
   map bugs are caught at build time instead of at runtime on a real trip.
4. As the developer, I want the `window.Cesium: any` ambient declaration removed, so that the map
   code is held to the same `strict` standard as the rest of the app.
5. As the developer, I want the blanket `eslint-disable @typescript-eslint/no-explicit-any`
   headers that existed only to tolerate the untyped global removed wherever real types now flow,
   so that lint no longer green-lights genuine `any` slips in map code.
6. As the developer, I want the stale `@types/cesium@1.70` package removed, so that I'm not
   served type definitions that contradict the 1.132 runtime.
7. As the developer, I want the CDN `<script>` and widget-CSS `<link>` removed from `index.html`,
   so that there is exactly one source of Cesium (the bundled package) and no version-skew risk
   between the CDN build and the pinned dependency.
8. As the developer, I want Cesium's static assets (Workers, Assets, ThirdParty, Widgets) copied
   into the build and `CESIUM_BASE_URL` configured, so that terrain, imagery, and web-worker
   features work from self-hosted assets in dev and production.
9. As the developer, I want the widgets CSS imported through the bundler, so that the map widgets
   are styled without a CDN stylesheet.
10. As a trip planner, I want the planning map to look and behave exactly as it does today —
    satellite/topo basemaps, waypoints, route drawing with live stats, terrain-accurate
    elevation, notes, flyover, 2D↔3D — so that nothing I rely on regresses.
11. As a trip planner in a region with a flaky or filtered network, I want the map to initialise
    from the app's own origin, so that a blocked `cesium.com` no longer breaks trip planning.
12. As the developer, I want the Ion-token flow (`Ion.defaultAccessToken` from
    `VITE_CESIUM_ION_TOKEN`) to work unchanged after the swap, so that Ion imagery/terrain still
    loads and the existing OSM/no-token fallback still degrades gracefully.
13. As the developer, I want the map's existing behaviours to be verified end-to-end after the
    swap (2D and 3D, both basemap families, draw a route, place a waypoint, sample elevation),
    so that I trust the foundation before building Live GPS on it.
14. As the developer, I want the ADR-013 boundary tests to still pass, so that the map services'
    tested contract is proven intact across the migration.
15. As the developer, I want the fake-Cesium injection to move from "set `window.Cesium`" to
    "mock the `cesium` module", so that the test seam matches how production now resolves Cesium,
    while keeping the fake's real spherical math and its terrain-mode controls
    (auto / manual / unavailable / sample-reject) exactly as they are.
16. As the developer, I want `npm run build` (`tsc && vite build`) to pass with the new types and
    no `@types/cesium`, so that the production build is type-clean.
17. As the developer, I want the production bundle to load Cesium's large chunks and web workers
    correctly under Vite, so that the deployed app on Vercel behaves like local dev.
18. As the developer, I want this to remain an isolated, frontend-only PR with no backend or
    Linode change, so that it can ship on its own without deployment-ordering constraints.
19. As a future maintainer building Live GPS, I want the position-channel code to sit on a typed
    Cesium surface, so that the new real-time marker/entity code is type-checked from day one.
20. As the developer, I want a single, documented pattern for how map modules obtain Cesium
    (module import, not global), so that new map files added during phase 2 follow it by default.

## Implementation Decisions

- **Cesium comes from the `cesium` npm package via ES import.** Map modules replace
  `const Cesium = window.Cesium` (and direct `window.Cesium.X` access) with a module import of
  `cesium`. The exact import style (namespace `import * as Cesium from 'cesium'` vs named
  imports) is left to the implementer, but must be **consistent across the map stack** and land as
  the documented default for new map files.
- **Version stays pinned at the current 1.132 line.** This is a loader swap, not a Cesium upgrade
  — do not jump major/minor Cesium versions in this PR. Runtime behaviour must match what the CDN
  build did.
- **`@types/cesium` is removed, not upgraded.** Rely on the types bundled with `cesium` itself.
  `@types/cesium@1.70` is removed from `package.json`.
- **Static assets are served locally.** Configure Vite so Cesium's `Assets`, `Workers`,
  `ThirdParty`, and `Widgets` are available at runtime and `CESIUM_BASE_URL` points at them
  (whether via a Cesium-aware Vite plugin or an explicit static-copy + define is the implementer's
  call; the acceptance criterion is that terrain, imagery, and workers load with **no** CDN
  request). Widgets CSS is imported through the bundler.
- **CDN references are deleted from `index.html`.** After the swap there is exactly one source of
  Cesium. The `Cesium: any` ambient on the `Window` interface is deleted.
- **The `any` surface shrinks to only what Cesium genuinely can't type.** Remove the blanket
  `eslint-disable no-explicit-any` headers and inline `: any` on Cesium objects **wherever the
  real types now flow**. Where a specific Cesium type is genuinely awkward, a narrowly-scoped
  `any` with a reason comment is acceptable — the goal is "typed by default", not "zero `any` at
  any cost". `CesiumManager`'s protected fields (`viewer`, `handler`, `samplingTerrain`, the
  `ElevationPoint.position/cartographic`) are the highest-value targets to type.
- **The test seam moves from global-injection to module-mock.** `installFakeCesium()` currently
  sets `globalThis.window.Cesium`. Once services import the `cesium` module, they no longer read
  the global, so the fake must be registered as the `cesium` module mock (Vitest
  `vi.mock('cesium', …)`) returning the **existing** fake object. The fake's spherical-math
  implementation and its four terrain modes are preserved verbatim; only the *injection
  mechanism* changes. This is the single seam that moves in the whole migration.
- **No backend / Linode / deployment-order change.** Frontend-only. The Vercel build picks up the
  new bundling automatically; there is no Nginx/PM2/DB impact and no ordering dependency with any
  other in-flight work.
- **No behavioural change to any map feature.** Basemap switching, viewport auto-switch, waypoint
  placement, route drawing + live stats + elevation profile, terrain sampling, trail
  discovery/snapping, notes, flyover, fullscreen, `requestRenderMode`, and the 2D↔3D morph must
  all behave exactly as before. `scene3DOnly` remains unset (required for `morphTo2D`).

## Testing Decisions

- **What a good test is here:** the existing map-service boundary tests already embody it — drive
  the manager's public surface (input events in → recorded callbacks out) and assert on the
  emitted route/waypoint/stat data, never on Cesium internals or React. This migration must keep
  those tests meaningful by keeping them **behavioural**; it must not weaken them into
  "does it import" smoke tests.
- **The migration is a refactor, so its primary test obligation is "the existing suite stays
  green," not "add new unit tests."** `npm test` (node:test lifecycle suites + Vitest service
  tests) and `npm run build` (`tsc && vite build`) passing together is the pass/fail line for the
  typed-source half.
- **Modules under test:** the same ones ADR 013 covers — `TrackDrawer`, `WaypointManager`, and by
  extension `CesiumManager` — through their `.test.ts` files against the fake. No new module under
  test is introduced.
- **The one deliberate test change:** `src/services/testing/fakeCesium.ts` /
  `installFakeCesium()` switches from stubbing `window.Cesium` to providing the `cesium` module
  mock. The assertion that proves this worked is simply that the pre-existing `TrackDrawer` and
  `WaypointManager` suites still pass unchanged (same cases: finish-before-enrichment race,
  terrain-unavailable degradation, elevation backfill, distance math).
- **Prior art:** `TrackDrawer.test.ts` and `WaypointManager.test.ts` (Vitest, fake Cesium, public
  boundary) are the direct template. The `node --test` lifecycle suites
  (`triplink-lifecycle.test.js`, `lifecycleReducer.test.ts`) are prior art for "don't touch tests
  that this work doesn't affect" — they stay untouched.
- **Below the seam (verified by manual run-through, not unit tests):** that the *bundled* Cesium
  (workers, WASM, Ion token, self-hosted assets) actually renders — unit tests run against the
  fake and cannot prove the real package loads. Required manual pass on `npm run dev` **and** a
  `vite build` + `npm run preview`: open the wizard map, confirm it initialises with no CDN
  network request, toggle 2D↔3D, switch satellite↔topo, draw a route and see live stats + a
  non-zero elevation profile, place a waypoint, confirm the Ion-token path and the no-token OSM
  fallback both still work.

## Out of Scope

- **Upgrading the Cesium version** — this pins to the current 1.132 line; a version bump is a
  separate task with its own regression pass.
- **Live GPS / position channel** — the phase-2 feature this bridge unblocks, not part of it.
- **Refactoring map architecture** — no changes to the manager class hierarchy, the
  `CesiumManager` base contract, or how managers are wired into `TripPlanningMap`, beyond the
  Cesium-source swap and the type tightening it enables.
- **Chasing zero `any` in map code** — the goal is "typed by default"; a few narrowly-scoped,
  commented `any`s for genuinely awkward Cesium shapes are acceptable.
- **Migrating the `node --test` lifecycle suites** — untouched, per ADR 013.
- **Backend, Nginx, PM2, DB, or deploy-script changes** — none; frontend-only.
- **Bundle-size optimisation of Cesium** (tree-shaking individual Cesium modules, lazy-loading
  chunks) — the app already downloaded the full CDN build; matching that is sufficient. Slimming
  Cesium is a later, optional optimisation.

## Further Notes

- **Why now, precisely:** the roadmap times this between Stream 1 and phase 2 on purpose. Stream 1
  churned every map service (depth picking, terrain sampling, settle windows); doing the type swap
  during that churn would have meant constant rebasing, and doing it *after* Live GPS lands means
  retro-typing a live real-time channel. This is the quiet window.
- **No deploy-ordering constraint:** unlike backend contract changes, this is a pure frontend
  bundling change — it ships whenever, on its own PR, and Vercel rebuilds from the new config.
- **Watch item — bundle chunking under Vite:** Cesium is large and uses web workers; the known
  risk is a `vite build` that dev-serves fine but breaks worker/asset paths in the production
  `preview`/Vercel build. The manual-verification step deliberately requires a `vite build` +
  `preview` pass, not just `npm run dev`, to catch exactly that.
- **After this ships:** tick the "npm Cesium + official TS types" bridge box in
  [roadmap.md](../../brain/project/roadmap.md), note it in [status.md](../../brain/project/status.md),
  and update the CLAUDE.md "Known Quirks" line that currently says *"Cesium is loaded via CDN (not
  npm) and accessed through `window.Cesium` global — all map services use `any` types"* — that
  sentence becomes false and must be rewritten in the same PR.
