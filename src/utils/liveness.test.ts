// Run via `node --test --experimental-strip-types`. describeLiveness is the pure
// honest-degradation classifier: given a TripLink and the current time, what liveness
// state should the watcher view present? Tests assert external behaviour only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLiveness } from './liveness.ts';
import type { TripLink } from '../types/adventure.ts';

const base = (over: Partial<TripLink> = {}): TripLink =>
  ({
    id: 't1',
    shareToken: 'tok',
    title: 'Test trip',
    status: 'active',
    checkIns: [],
    ...over,
  }) as TripLink;

const NOW = new Date('2026-07-07T10:00:00.000Z');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

test('with-trip + a recent live fix → fresh', () => {
  const trip = base({
    liveSharing: 'with-trip',
    livePosition: { lat: -41.3, lng: 174.8, timestamp: minsAgo(2), sharing: 'live' },
  });
  assert.equal(describeLiveness(trip, NOW), 'fresh');
});

test('with-trip + a live fix older than the threshold → stale', () => {
  const trip = base({
    liveSharing: 'with-trip',
    livePosition: { lat: -41.3, lng: 174.8, timestamp: minsAgo(14), sharing: 'live' },
  });
  assert.equal(describeLiveness(trip, NOW), 'stale');
});

test('sharing off or owner-only → not-shared (even with a fresh fix)', () => {
  const fresh = { lat: -41.3, lng: 174.8, timestamp: minsAgo(1), sharing: 'live' as const };
  assert.equal(describeLiveness(base({ liveSharing: 'off', livePosition: fresh }), NOW), 'not-shared');
  assert.equal(describeLiveness(base({ liveSharing: 'owner-only', livePosition: fresh }), NOW), 'not-shared');
});

test('with-trip but no position yet → not-shared', () => {
  assert.equal(describeLiveness(base({ liveSharing: 'with-trip' }), NOW), 'not-shared');
});

test('latest signal is an unavailable beacon → unavailable (even if recent)', () => {
  const trip = base({
    liveSharing: 'with-trip',
    livePosition: { lat: -41.3, lng: 174.8, timestamp: minsAgo(1), sharing: 'unavailable' },
  });
  assert.equal(describeLiveness(trip, NOW), 'unavailable');
});

test('completed or planned trip never claims live, regardless of position age', () => {
  const recent = { lat: -41.3, lng: 174.8, timestamp: minsAgo(1), sharing: 'live' as const };
  assert.equal(describeLiveness(base({ status: 'completed', liveSharing: 'with-trip', livePosition: recent }), NOW), 'not-shared');
  assert.equal(describeLiveness(base({ status: 'planned', liveSharing: 'with-trip', livePosition: recent }), NOW), 'not-shared');
});

test('overdue trip still surfaces a fresh position (you most want it then)', () => {
  const trip = base({
    status: 'overdue',
    liveSharing: 'with-trip',
    livePosition: { lat: -41.3, lng: 174.8, timestamp: minsAgo(2), sharing: 'live' },
  });
  assert.equal(describeLiveness(trip, NOW), 'fresh');
});
