// Run via `node --test --experimental-strip-types`. nextFlushBatch is the pure
// store-and-forward decision for live location Stage 2 Slice 4: given a device-side queue of
// fixes/unavailable markers buffered while offline, decide what to POST on reconnect. Because
// Stage 2 is LAST-KNOWN-ONLY, it coalesces the queue to the single most-recent meaningful event
// — never a replay of stale points, never a breadcrumb trail. Tests assert behaviour only.
// See .scratch/live-location-stage-2/issues/04-offline-store-and-forward.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFlushBatch, type QueuedEvent } from './flushBatch.ts';

const NOW = new Date('2026-07-09T10:00:00.000Z');
const at = (min: number): string => new Date(NOW.getTime() - min * 60_000).toISOString();

const fix = (min: number): QueuedEvent => ({ kind: 'fix', lat: -41.3, lng: 174.8, accuracy: 10, timestamp: at(min) });
const unavailable = (min: number): QueuedEvent => ({ kind: 'unavailable', reason: 'error', timestamp: at(min) });

test('offline → empty batch (send nothing)', () => {
  assert.deepEqual(nextFlushBatch([fix(2), fix(1)], NOW, false), []);
});

test('empty queue → empty batch', () => {
  assert.deepEqual(nextFlushBatch([], NOW, true), []);
});

test('multiple live fixes → only the newest by timestamp', () => {
  const batch = nextFlushBatch([fix(5), fix(1), fix(3)], NOW, true);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].timestamp, at(1));
});

test('a trailing unavailable after live fixes → flushes as unavailable (last signal wins)', () => {
  const batch = nextFlushBatch([fix(5), fix(3), unavailable(1)], NOW, true);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].kind, 'unavailable');
});

test('an unavailable followed by a newer live fix → flushes the live fix (newest wins)', () => {
  const batch = nextFlushBatch([unavailable(5), fix(1)], NOW, true);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].kind, 'fix');
  assert.equal(batch[0].timestamp, at(1));
});

test('out-of-order timestamps still resolve to the true newest', () => {
  const batch = nextFlushBatch([fix(1), fix(9), fix(4)], NOW, true);
  assert.equal(batch[0].timestamp, at(1));
});

test('queue drains after a successful flush (no double-send)', () => {
  const queue = [fix(3), fix(1)];
  const first = nextFlushBatch(queue, NOW, true);
  assert.equal(first.length, 1);
  // caller removes the flushed event(s) → next call sees an empty queue → nothing re-sent.
  assert.deepEqual(nextFlushBatch([], NOW, true), []);
});

test('clock-skew guard: a future-stamped fix does not win the coalesce', () => {
  const future: QueuedEvent = { kind: 'fix', lat: 0, lng: 0, accuracy: 10, timestamp: new Date(NOW.getTime() + 60_000).toISOString() };
  const batch = nextFlushBatch([fix(2), future], NOW, true);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].timestamp, at(2)); // the real newest, not the bogus future point
});
