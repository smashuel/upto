// Run via `node --test --experimental-strip-types`. selectBaseImagery is the pure decision of
// WHICH base imagery the Cesium viewer opens with: Cesium Ion satellite when we hold a usable
// Ion token, else the key-less OSM fallback. Tests assert external behaviour only.
// See .scratch/native-map-fixes/issues/01-native-cesium-ion-satellite-3d.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectBaseImagery } from './baseImagery.ts';

test('a real Ion token selects Ion satellite imagery', () => {
  assert.deepEqual(selectBaseImagery('eyJhbGciOiJIUzI1NiJ9.real-looking-token'), {
    kind: 'ion-satellite',
    assetId: 2,
  });
});

test('an unusable token falls back to OSM rather than leaving the map blank', () => {
  // The .env.example placeholder — present but worthless. Historically the one guarded case.
  assert.equal(selectBaseImagery('your_cesium_ion_token_here').kind, 'osm-fallback');
  assert.equal(selectBaseImagery(undefined).kind, 'osm-fallback');
  assert.equal(selectBaseImagery(null).kind, 'osm-fallback');
  assert.equal(selectBaseImagery('').kind, 'osm-fallback');
  // A var set to whitespace in CI is "present" but unusable — must not select Ion.
  assert.equal(selectBaseImagery('   ').kind, 'osm-fallback');
});
