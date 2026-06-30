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
