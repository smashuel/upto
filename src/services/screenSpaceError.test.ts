import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveScreenSpaceError } from './screenSpaceError.ts';
import { PERF_PROFILES } from './MapPerformance.ts';

// Lower maximumScreenSpaceError = deeper quadtree refinement = finer imagery tiles.
//
// Why 2D needs its own value: in 3D the viewer loads Cesium World Terrain, whose geometric
// error drives deep refinement and drags imagery LOD along with it. 2D swaps in
// EllipsoidTerrainProvider (flat, negligible geometric error), so refinement stops early and
// the same imagery renders visibly coarser. Because 2D has no terrain mesh to build, buying
// that detail back costs only imagery tiles — cheap relative to the same change in 3D.

test('2D refines deeper than 3D on every tier', () => {
  for (const tier of ['low', 'mid', 'high'] as const) {
    const in2d = resolveScreenSpaceError(tier, '2d');
    const in3d = resolveScreenSpaceError(tier, '3d');
    assert.ok(
      in2d < in3d,
      `${tier}: expected 2D SSE (${in2d}) to be lower/sharper than 3D (${in3d})`,
    );
  }
});

test('3D keeps the existing tuned profile value exactly — no regression', () => {
  for (const tier of ['low', 'mid', 'high'] as const) {
    assert.equal(resolveScreenSpaceError(tier, '3d'), PERF_PROFILES[tier].maximumScreenSpaceError);
  }
});

test('a weaker device still refines less than a stronger one in 2D', () => {
  assert.ok(resolveScreenSpaceError('low', '2d') > resolveScreenSpaceError('mid', '2d'));
  assert.ok(resolveScreenSpaceError('mid', '2d') > resolveScreenSpaceError('high', '2d'));
});

test('never returns a value below 1, which pins the quadtree at max depth', () => {
  for (const tier of ['low', 'mid', 'high'] as const) {
    assert.ok(
      resolveScreenSpaceError(tier, '2d') >= 1,
      'SSE under 1 forces ruinous over-refinement',
    );
  }
});

test('every resolved value is a usable positive number', () => {
  for (const tier of ['low', 'mid', 'high'] as const) {
    for (const mode of ['2d', '3d'] as const) {
      const sse = resolveScreenSpaceError(tier, mode);
      assert.ok(Number.isFinite(sse) && sse > 0, `${tier}/${mode} produced ${sse}`);
    }
  }
});
