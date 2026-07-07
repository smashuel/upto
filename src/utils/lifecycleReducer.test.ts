// Run via `node --test --experimental-strip-types` (see package.json `test` script).
// The reducer is the one seam where the client applies an SSE lifecycle event to a
// TripLink. Tests assert external behaviour only: prior state + event -> next state.
// No React, no EventSource — those live below the seam.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLifecycleEvent } from './lifecycleReducer.ts';
import type { TripLink } from '../types/adventure.ts';

// Minimal TripLink fixture — only the fields the reducer reads/writes matter; the cast
// fills the rest. Overrides stay typed via Partial so field typos are still caught.
const base = (over: Partial<TripLink> = {}): TripLink =>
  ({
    id: 't1',
    shareToken: 'tok',
    title: 'Test trip',
    status: 'active',
    checkIns: [],
    ...over,
  }) as TripLink;

test('checkin carrying status active clears overdue -> active and nulls overdueSince', () => {
  const prev = base({ status: 'overdue', overdueSince: '2026-06-30T09:00:00.000Z' });
  const next = applyLifecycleEvent(prev, {
    kind: 'checkin',
    status: 'active',
    timestamp: '2026-06-30T09:20:00.000Z',
  });
  assert.equal(next.status, 'active');
  assert.equal(next.overdueSince, undefined);
  assert.equal(next.lastCheckIn, '2026-06-30T09:20:00.000Z');
  assert.equal(next.checkIns.length, 1);
});

test('checkin with status omitted falls back to prev.status (deploy-gap guard)', () => {
  const prev = base({ status: 'overdue', overdueSince: '2026-06-30T09:00:00.000Z' });
  const next = applyLifecycleEvent(prev, {
    kind: 'checkin',
    timestamp: '2026-06-30T09:20:00.000Z',
  });
  // No resulting status on the wire -> keep what we had (old backend during a deploy gap).
  assert.equal(next.status, 'overdue');
  assert.equal(next.overdueSince, '2026-06-30T09:00:00.000Z');
});

test('checkin prepends to history with its payload fields', () => {
  const prev = base({ checkIns: [{ timestamp: '2026-06-30T08:00:00.000Z' }] });
  const next = applyLifecycleEvent(prev, {
    kind: 'checkin',
    status: 'active',
    timestamp: '2026-06-30T09:20:00.000Z',
    message: 'past the hut',
    locationW3w: 'filled.count.soap',
    lat: -41.5,
    lng: 172.0,
  });
  assert.equal(next.checkIns.length, 2);
  assert.deepEqual(next.checkIns[0], {
    timestamp: '2026-06-30T09:20:00.000Z',
    message: 'past the hut',
    locationW3w: 'filled.count.soap',
    lat: -41.5,
    lng: 172.0,
  });
});

test('echoed checkin with a timestamp already in history is not duplicated', () => {
  const prev = base({
    checkIns: [{ timestamp: '2026-06-30T09:20:00.000Z', message: 'past the hut' }],
  });
  const next = applyLifecycleEvent(prev, {
    kind: 'checkin',
    status: 'active',
    timestamp: '2026-06-30T09:20:00.000Z',
  });
  assert.equal(next.checkIns.length, 1);
  assert.equal(next.lastCheckIn, '2026-06-30T09:20:00.000Z');
});

test('overdue event sets status and overdueSince', () => {
  const prev = base({ status: 'active' });
  const next = applyLifecycleEvent(prev, {
    kind: 'overdue',
    overdueSince: '2026-06-30T10:00:00.000Z',
  });
  assert.equal(next.status, 'overdue');
  assert.equal(next.overdueSince, '2026-06-30T10:00:00.000Z');
});

test('status event updates status and startedAt, keeps prev startedAt when omitted', () => {
  const prev = base({ status: 'planned' });
  const started = applyLifecycleEvent(prev, {
    kind: 'status',
    status: 'active',
    startedAt: '2026-06-30T08:00:00.000Z',
  });
  assert.equal(started.status, 'active');
  assert.equal(started.startedAt, '2026-06-30T08:00:00.000Z');

  const noStartedAt = applyLifecycleEvent(started, { kind: 'status', status: 'active' });
  assert.equal(noStartedAt.startedAt, '2026-06-30T08:00:00.000Z');
});

test('status event to a non-overdue status clears a stale overdueSince', () => {
  const prev = base({ status: 'overdue', overdueSince: '2026-06-30T10:00:00.000Z' });
  const next = applyLifecycleEvent(prev, { kind: 'status', status: 'active' });
  assert.equal(next.status, 'active');
  assert.equal(next.overdueSince, undefined);
});

test('completed status is preserved (terminal, not overwritten)', () => {
  const prev = base({ status: 'overdue', overdueSince: '2026-06-30T10:00:00.000Z' });
  const next = applyLifecycleEvent(prev, { kind: 'status', status: 'completed' });
  assert.equal(next.status, 'completed');
  assert.equal(next.overdueSince, undefined);
});

test('live position event sets livePosition from the fix', () => {
  const prev = base({ status: 'active' });
  const next = applyLifecycleEvent(prev, {
    kind: 'position',
    sharing: 'live',
    timestamp: '2026-06-30T09:30:00.000Z',
    lat: -41.5,
    lng: 172.0,
    accuracy: 12,
  });
  assert.deepEqual(next.livePosition, {
    lat: -41.5,
    lng: 172.0,
    timestamp: '2026-06-30T09:30:00.000Z',
    accuracy: 12,
  });
});

test('a newer-timestamp position replaces an older livePosition', () => {
  const prev = base({
    status: 'active',
    livePosition: { lat: -41.5, lng: 172.0, timestamp: '2026-06-30T09:30:00.000Z' },
  });
  const next = applyLifecycleEvent(prev, {
    kind: 'position',
    sharing: 'live',
    timestamp: '2026-06-30T09:33:00.000Z',
    lat: -41.6,
    lng: 172.1,
  });
  assert.equal(next.livePosition?.timestamp, '2026-06-30T09:33:00.000Z');
  assert.equal(next.livePosition?.lat, -41.6);
});

test('an older-or-equal-timestamp position is ignored (monotonic)', () => {
  const current = { lat: -41.6, lng: 172.1, timestamp: '2026-06-30T09:33:00.000Z' };
  const prev = base({ status: 'active', livePosition: current });

  // Out-of-order (older) broadcast — dropped.
  const older = applyLifecycleEvent(prev, {
    kind: 'position',
    sharing: 'live',
    timestamp: '2026-06-30T09:30:00.000Z',
    lat: -41.5,
    lng: 172.0,
  });
  assert.deepEqual(older.livePosition, current);

  // Duplicate broadcast of the same fix — also dropped (no-op).
  const dup = applyLifecycleEvent(prev, {
    kind: 'position',
    sharing: 'live',
    timestamp: '2026-06-30T09:33:00.000Z',
    lat: -41.6,
    lng: 172.1,
  });
  assert.deepEqual(dup.livePosition, current);
});

test('a position event leaves all lifecycle state untouched (isolation invariant)', () => {
  const prev = base({
    status: 'overdue',
    overdueSince: '2026-06-30T10:00:00.000Z',
    startedAt: '2026-06-30T08:00:00.000Z',
    lastCheckIn: '2026-06-30T09:20:00.000Z',
    checkIns: [{ timestamp: '2026-06-30T09:20:00.000Z', message: 'past the hut' }],
  });
  const next = applyLifecycleEvent(prev, {
    kind: 'position',
    sharing: 'live',
    timestamp: '2026-06-30T10:05:00.000Z',
    lat: -41.5,
    lng: 172.0,
  });
  // Live position never re-derives the state machine — it only adds livePosition.
  assert.equal(next.status, 'overdue');
  assert.equal(next.overdueSince, '2026-06-30T10:00:00.000Z');
  assert.equal(next.startedAt, '2026-06-30T08:00:00.000Z');
  assert.equal(next.lastCheckIn, '2026-06-30T09:20:00.000Z');
  assert.deepEqual(next.checkIns, prev.checkIns);
  assert.equal(next.livePosition?.lat, -41.5);
});

test('an unavailable beacon marks last-known unavailable, keeps coords, leaves lifecycle untouched', () => {
  const prev = base({
    status: 'active',
    lastCheckIn: '2026-06-30T09:20:00.000Z',
    livePosition: { lat: -41.5, lng: 172.0, timestamp: '2026-06-30T09:30:00.000Z', sharing: 'live' },
  });
  const next = applyLifecycleEvent(prev, {
    kind: 'position',
    sharing: 'unavailable',
    timestamp: '2026-06-30T09:36:00.000Z',
  });
  assert.deepEqual(next.livePosition, {
    lat: -41.5, lng: 172.0, timestamp: '2026-06-30T09:30:00.000Z', sharing: 'unavailable',
  });
  assert.equal(next.status, 'active');
  assert.equal(next.lastCheckIn, '2026-06-30T09:20:00.000Z');
});

test('an unavailable beacon with no prior position is a no-op', () => {
  const prev = base({ status: 'active' });
  const next = applyLifecycleEvent(prev, { kind: 'position', sharing: 'unavailable', timestamp: '2026-06-30T09:36:00.000Z' });
  assert.equal(next.livePosition, undefined);
});
