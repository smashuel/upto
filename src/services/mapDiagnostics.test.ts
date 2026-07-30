// Run via `node --test --experimental-strip-types`. describeMapDiagnostics is the pure
// classifier behind the on-device map diagnostics panel: given the Ion token state plus any
// imagery/terrain errors observed at runtime, say what's wrong in terms a human can act on.
// It exists because there's no Mac (so no Safari Web Inspector) to read the WKWebView console
// on a TestFlight build. Tests assert the classification + that the underlying error survives
// into the report — never exact prose. Prior art: describeLiveness.
// See .scratch/native-map-fixes/issues/01-native-cesium-ion-satellite-3d.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeMapDiagnostics } from './mapDiagnostics.ts';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.real-looking-token';

test('a usable token that still fails to load Ion imagery reports ion-unreachable, with the cause', () => {
  const report = describeMapDiagnostics({
    token: TOKEN,
    ionImageryError: 'Failed to fetch https://api.cesium.com/v1/assets/2/endpoint',
  });
  assert.equal(report.health, 'ion-unreachable');
  // The actual error text must survive into the report — it's the whole point of the panel.
  assert.ok(report.details.some((d) => d.includes('api.cesium.com')));
});

test('a missing or placeholder token reports no-token, not a mysterious Ion failure', () => {
  // Distinguishing these two is the point: "you forgot the key" and "the key works but Ion is
  // unreachable from this WebView" need completely different fixes.
  assert.equal(describeMapDiagnostics({ token: undefined }).health, 'no-token');
  assert.equal(describeMapDiagnostics({ token: 'your_cesium_ion_token_here' }).health, 'no-token');
});

test('a usable token with no errors reports ok', () => {
  assert.equal(describeMapDiagnostics({ token: TOKEN }).health, 'ok');
});

test('a terrain-only failure still reports ion-unreachable and names the terrain cause', () => {
  // 3D terrain can fail while satellite imagery succeeds — the report must not hide it.
  const report = describeMapDiagnostics({ token: TOKEN, terrainError: 'terrain 401' });
  assert.equal(report.health, 'ion-unreachable');
  assert.ok(report.details.some((d) => d.includes('terrain 401')));
});
