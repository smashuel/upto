# 02 — Finish waits for settled heights

Status: ready-for-agent

## Parent

.scratch/terrain-accurate-picking/PRD.md

## What to build

The safety-critical core. Today, finishing a drawn route (double-click) or
committing an edit serializes the route and hands it to the wizard synchronously,
while the last point(s)' terrain-height enrichment is still an in-flight network
call — so the route persisted to the TripLink routinely carries stale ~0 elevations
on its final points, and gain/loss/difficulty computed from them. The live on-screen
stats self-correct a moment later; the persisted record does not.

Make finish (and edit-commit) a settlement point: await one final whole-route
terrain-enrichment pass, recompute the route metadata (distance, elevation gain,
elevation loss, difficulty) from the settled heights, then serialize and emit the
route-created callback exactly once with the corrected data. Per-click enrichment
stays asynchronous and instant-feeling; only the final emit waits. Cancel semantics
are unchanged.

Failure semantics: if terrain sampling fails or is unavailable, finish must still
complete promptly (never hang the wizard on a network call), falling back to picked
heights. Marking elevations as honestly absent is deliberately deferred to slice 05.

If the settlement triggers any visual refresh, request a render frame explicitly
(requestRenderMode is on — see the `requestRender` note in the shared Cesium
manager base).

Live drawing stats (the Munter-ish quick estimate, the profile chart) and GPX
export must reflect the settled heights after finish.

## Acceptance criteria

- [ ] Race test: click, click, double-click finish *before* the terrain promise resolves → the emitted serialized route contains fixture terrain heights and metadata recomputed from them
- [ ] Exactly one route-created emit per finish (no provisional emit followed by a correction)
- [ ] Edit-commit path: dragging a point then committing the edit emits a route whose changed points carry settled heights and whose metadata is recomputed
- [ ] Terrain-failure test: sampling rejects → finish completes promptly with picked heights (no hang, no throw)
- [ ] Difficulty rating is derived from settled elevation gain
- [ ] GPX export of a finished route contains the settled elevations
- [ ] Manual verify: draw over real NZ terrain (e.g. a Tongariro route) in default 2D wizard view — persisted gain/loss are non-zero and stable across 2D/3D
- [ ] `tsc --noEmit`, `npm run lint`, and the slice-01 characterization suite stay green (updated deliberately where behaviour changed)

## Blocked by

- .scratch/terrain-accurate-picking/issues/01-test-harness-vitest-fake-cesium.md

## Comments

**2026-07-02 (agent):** Implemented. Finish and edit-commit are settlement points:
whole-route enrichment (8 s bound) → recompute metadata → render → emit once.
Review surfaced concurrency hazards, all fixed + regression-tested: epoch guard
strands settlements on clearAll()/destroy(); committed tracks hold per-point
snapshots so straggling samples can't diverge an emitted route; enterEditMode
blocked while settling; latent undefined-deref in the edit LEFT_UP handler guarded.
12 Vitest tests green (race, edit-race, timeout, clearAll, destroy) + node:test
suites, tsc, lint. **Outstanding:** the "manual verify on real NZ terrain" criterion
— no Chrome in this WSL environment; needs a human run-through (`npm run dev`, draw
in default 2D, check gain/loss non-zero and stable across 2D↔3D).

**2026-07-02 (agent, after user browser verify):** User run-through on real NZ topo
confirmed live elevation works, but caught a phantom "2 pts · 0.00 km" stats panel
after the finishing double-click. Root cause: the double-click's own two LEFT_CLICKs
were still awaiting trail-snap when finish cleared the drawing — the stragglers
repopulated it and re-emitted zero stats. Fixed with a `drawingEpoch` guard
(finish/cancel strand in-flight clicks); regression test added (13 Vitest total).
The settled route itself was emitted correctly. Manual-verify criterion now
partially confirmed — worth one more run-through to see the panel clear cleanly.
