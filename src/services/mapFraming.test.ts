// Run via `node --test --experimental-strip-types`. Pure, Cesium-free framing
// decisions for the live-view camera: which points to frame, and whether a fix
// has drifted far enough out of the current view to warrant a re-frame. Tests
// assert external behaviour only — no Cesium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { framingPoints, pointWithinView } from './mapFraming.ts';
import type { LatLng } from '../types/adventure.ts';

// ── framingPoints ───────────────────────────────────────────────────────────

test('framingPoints: route only when no live point', () => {
  const route: LatLng[] = [
    [-41.3, 174.8],
    [-41.31, 174.82],
  ];
  assert.deepEqual(framingPoints(route, null), route);
});

test('framingPoints: appends the live point to the route', () => {
  const route: LatLng[] = [[-41.3, 174.8]];
  assert.deepEqual(framingPoints(route, { lat: -41.4, lng: 174.9 }), [
    [-41.3, 174.8],
    [-41.4, 174.9],
  ]);
});

test('framingPoints: live only when there is no route', () => {
  assert.deepEqual(framingPoints([], { lat: -41.4, lng: 174.9 }), [[-41.4, 174.9]]);
});

test('framingPoints: empty when nothing to frame', () => {
  assert.deepEqual(framingPoints([], null), []);
});

test('framingPoints: does not mutate the caller route array', () => {
  const route: LatLng[] = [[-41.3, 174.8]];
  framingPoints(route, { lat: 0, lng: 0 });
  assert.equal(route.length, 1);
});

// ── pointWithinView ─────────────────────────────────────────────────────────

const rect = { west: 174.0, south: -42.0, east: 175.0, north: -41.0 }; // 1°×1°

test('pointWithinView: dead-centre point is inside', () => {
  assert.equal(pointWithinView(rect, -41.5, 174.5), true);
});

test('pointWithinView: point outside the rect is out', () => {
  assert.equal(pointWithinView(rect, -41.5, 176.0), false);
});

test('pointWithinView: point inside the raw rect but within the edge margin is out', () => {
  // default 15% margin → live band is lng [174.15, 174.85], lat [-41.85, -41.15].
  // 174.95 is inside the raw rect but inside the right margin.
  assert.equal(pointWithinView(rect, -41.5, 174.95), false);
});

test('pointWithinView: margin is configurable (0 margin honours the raw rect)', () => {
  assert.equal(pointWithinView(rect, -41.5, 174.95, 0), true);
});

test('pointWithinView: corners of the safe band are inside, just past are out', () => {
  // 20% margin → safe band lng [174.2, 174.8], lat [-41.8, -41.2].
  assert.equal(pointWithinView(rect, -41.2, 174.8, 0.2), true);
  assert.equal(pointWithinView(rect, -41.19, 174.8, 0.2), false);
});
