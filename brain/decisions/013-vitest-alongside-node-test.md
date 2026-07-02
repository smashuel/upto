---
type: decision
status: accepted
date: 2026-07-02
tags: [testing, vitest, node-test, map, cesium]
---

# ADR 013 — Vitest for service tests, alongside the existing node:test suites

## Context

The terrain-accurate-picking work (`.scratch/terrain-accurate-picking/`) needs
regression tests for `TrackDrawer` — async, timing-sensitive behaviour (elevation
enrichment racing a double-click finish). The repo already had two small test files
running under `node --test --experimental-strip-types` (the TripLink lifecycle
reducer and its backend integration test), but no test framework proper: no watch
mode, no global stubbing helpers, no config to scope suites.

## Decision

Adopt **Vitest** for service-level tests, scoped by `vitest.config.ts` to
`src/services/**/*.test.ts`. The pre-existing lifecycle tests **stay on
`node --test`** unmigrated; `npm test` chains both (`node --test … && vitest run`).

Map services are tested at their public boundary (input events in → callbacks out)
against a purpose-built fake of the `window.Cesium` global
(`src/services/testing/fakeCesium.ts`) with controllable terrain sampling
(auto / deferred / provider-unavailable / sample-reject). The fake is deliberately
minimal — extend it only when a test needs another member; it is not a general
Cesium mock.

## Alternatives

- **node:test for the new tests too** — zero new deps and consistent with prior
  art, but no watch mode, weaker async helpers (`vi.stubGlobal`, timers), and no
  path to jsdom/component tests later. The strip-types runner also constrains TS
  features in test files.
- **Migrate the lifecycle tests to Vitest now** — unifies on one framework, but
  gratuitous churn for a prefactor slice; they're green and untouched by this work.
- **Jest** — heavier, needs transform config in a Vite repo; Vitest is the
  Vite-native equivalent.

## Consequences

- Two test idioms coexist. Acceptable while the node:test surface is two files;
  the chained `test` script means a lifecycle failure skips the Vitest run.
- First-class home for the map-safety regression suite (slices 02–05 of the
  terrain-accurate-picking plan build on the fake).
- `CLAUDE.md` Conventions and `brain/project/status.md` no longer claim "no test
  framework".

## Reconsider if

- The node:test files grow or someone touches them substantially → migrate them to
  Vitest and drop the chained runner.
- Component/DOM testing arrives → revisit environment config (jsdom) rather than
  adding a third harness.
