import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPositionFix } from './nativePositionFix.ts';

// ── toPositionFix: the plugin's Location → the app's PositionFix (Stage 2 Slice 2) ──
//
// The one new pure seam this slice adds. Everything about the background plugin below this
// function is native and only verifiable on a device; the field mapping and the bad-fix
// guarding are not, and coordinate bugs have bitten this codebase before (NZTM vs WGS84,
// lat/lng order), so they get pinned here.
//
// The guard's bias is deliberate: for a safety app a WRONG position is worse than NO position.
// A dropped fix degrades honestly — the watcher sees "last known N min ago" via the existing
// liveness machinery — whereas a bad one puts a searcher in the wrong valley.

const good = {
  latitude: -44.6721,
  longitude: 167.9245,
  accuracy: 12.5,
  altitude: 310,
  altitudeAccuracy: 5,
  simulated: false,
  bearing: 180,
  speed: 1.2,
  time: 1_785_542_400_000, // 2026-08-01T00:00:00.000Z
};

test('toPositionFix: maps a well-formed plugin location', () => {
  assert.deepEqual(toPositionFix(good), {
    lat: -44.6721,
    lng: 167.9245,
    accuracy: 12.5,
    timestamp: '2026-08-01T00:00:00.000Z',
  });
});

test('toPositionFix: latitude and longitude are not swapped', () => {
  // The plugin's own .d.ts comments label these backwards ("Longitude in degrees" on
  // `latitude`). They are not swapped in the data — this pins that so nobody "fixes" it.
  const fix = toPositionFix({ ...good, latitude: -45, longitude: 170 });
  assert.equal(fix?.lat, -45);
  assert.equal(fix?.lng, 170);
});

test('toPositionFix: null or undefined location → null', () => {
  assert.equal(toPositionFix(null), null);
  assert.equal(toPositionFix(undefined), null);
});

test('toPositionFix: non-finite coordinates → null', () => {
  assert.equal(toPositionFix({ ...good, latitude: NaN }), null);
  assert.equal(toPositionFix({ ...good, longitude: NaN }), null);
  assert.equal(toPositionFix({ ...good, latitude: Infinity }), null);
});

/** Drop a key, to model a payload that simply doesn't carry the field. */
function without<K extends keyof typeof good>(key: K) {
  const copy: Record<string, unknown> = { ...good };
  delete copy[key];
  return copy as typeof good;
}

test('toPositionFix: missing coordinates → null', () => {
  assert.equal(toPositionFix(without('latitude')), null);
  assert.equal(toPositionFix(without('longitude')), null);
});

test('toPositionFix: out-of-range coordinates → null', () => {
  assert.equal(toPositionFix({ ...good, latitude: 91 }), null);
  assert.equal(toPositionFix({ ...good, latitude: -91 }), null);
  assert.equal(toPositionFix({ ...good, longitude: 181 }), null);
  assert.equal(toPositionFix({ ...good, longitude: -181 }), null);
});

test('toPositionFix: exactly (0, 0) → null — Null Island is a failed fix, not a location', () => {
  // A real place in the Gulf of Guinea, and the overwhelmingly likely meaning of a 0/0 pair
  // is an uninitialised reading. Nobody this app tracks is there; a searcher sent there is a
  // searcher not looking for them.
  assert.equal(toPositionFix({ ...good, latitude: 0, longitude: 0 }), null);
});

test('toPositionFix: a zero on ONE axis is a real location and is kept', () => {
  // The equator and the prime meridian are ordinary places — only the pair is suspect.
  assert.equal(toPositionFix({ ...good, latitude: 0 })?.lat, 0);
  assert.equal(toPositionFix({ ...good, longitude: 0 })?.lng, 0);
});

test('toPositionFix: simulated fixes are dropped by default', () => {
  // A software-simulated position broadcast to a watcher as real is a lie told during the one
  // situation the app exists for. The plugin flags them; we refuse them.
  assert.equal(toPositionFix({ ...good, simulated: true }), null);
});

test('toPositionFix: simulated fixes can be opted in for device testing', () => {
  // Without this, the iOS Simulator and Android emulator can never exercise the pipeline.
  const fix = toPositionFix({ ...good, simulated: true }, { allowSimulated: true });
  assert.equal(fix?.lat, -44.6721);
});

test('toPositionFix: non-finite or negative accuracy → null', () => {
  // The plugin types `accuracy` as a required non-nullable number on both platforms, so a
  // missing or nonsense one means the payload is malformed — and coordinates from a malformed
  // payload are not worth trusting either.
  assert.equal(toPositionFix({ ...good, accuracy: NaN }), null);
  assert.equal(toPositionFix({ ...good, accuracy: -1 }), null);
  assert.equal(toPositionFix(without('accuracy')), null);
});

test('toPositionFix: an accuracy of exactly 0 is kept', () => {
  assert.equal(toPositionFix({ ...good, accuracy: 0 })?.accuracy, 0);
});

test('toPositionFix: epoch millis become an ISO timestamp', () => {
  assert.equal(
    toPositionFix({ ...good, time: 0 + 1_700_000_000_000 })?.timestamp,
    new Date(1_700_000_000_000).toISOString(),
  );
});

test('toPositionFix: a null time falls back to now rather than dropping the fix', () => {
  // The position is the valuable part. `time` is nullable in the plugin's own types, and the
  // fix arrived on this device now, which is accurate to within the sampling cadence.
  const fix = toPositionFix({ ...good, time: null }, { now: () => 1_785_542_400_000 });
  assert.equal(fix?.timestamp, '2026-08-01T00:00:00.000Z');
  assert.equal(fix?.lat, -44.6721);
});

test('toPositionFix: a nonsense time falls back to now', () => {
  const fix = toPositionFix({ ...good, time: NaN }, { now: () => 1_785_542_400_000 });
  assert.equal(fix?.timestamp, '2026-08-01T00:00:00.000Z');
});

test('toPositionFix: a non-positive time falls back to now', () => {
  // 0 is 1970 — a device clock that has not been set, not a fix from the Nixon administration.
  const fix = toPositionFix({ ...good, time: 0 }, { now: () => 1_785_542_400_000 });
  assert.equal(fix?.timestamp, '2026-08-01T00:00:00.000Z');
});
