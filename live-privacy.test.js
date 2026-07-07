// Tests for the live-location privacy guard. Runs on Node's built-in test runner:
//   node --test          (or: npm test)
// Pure predicate, no DB/network — this is the server-side "enforce by not publishing"
// gate (defense in depth behind the client, which already declines to POST). See
// brain/plans/live-location.md (seam 2) and .scratch/live-location/issues/03-*.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBroadcastPosition } from './live-privacy.js';

test('with-trip broadcasts', () => {
  assert.equal(shouldBroadcastPosition('with-trip'), true);
});

test('owner-only does not broadcast (rendered locally, never shared)', () => {
  assert.equal(shouldBroadcastPosition('owner-only'), false);
});

test('off does not broadcast', () => {
  assert.equal(shouldBroadcastPosition('off'), false);
});

test('undefined defaults to broadcast (legacy trips predate the field)', () => {
  assert.equal(shouldBroadcastPosition(undefined), true);
});

test('null defaults to broadcast (absent column value)', () => {
  assert.equal(shouldBroadcastPosition(null), true);
});

test('an unrecognised value fails closed — privacy is the safe default', () => {
  assert.equal(shouldBroadcastPosition('nonsense'), false);
});
