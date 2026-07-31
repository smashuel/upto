import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMapPresentation } from './mapPresentation.ts';

const PHONE = { viewportWidth: 390, coarsePointer: true };
const TABLET = { viewportWidth: 834, coarsePointer: true };
const DESKTOP = { viewportWidth: 1440, coarsePointer: false };

test('a phone opens the map as its own screen, not a box inside the wizard', () => {
  assert.equal(resolveMapPresentation(PHONE), 'immersive');
});

test('desktop keeps the map embedded in the wizard alongside the other fields', () => {
  assert.equal(resolveMapPresentation(DESKTOP), 'embedded');
});

test('a tablet has room for the embedded map even with a touch pointer', () => {
  assert.equal(resolveMapPresentation(TABLET), 'embedded');
});

// A narrow desktop window is still a mouse-driven window with a visible page around it —
// taking it over would be more disruptive than helpful.
test('a narrow desktop window stays embedded because the pointer is fine', () => {
  assert.equal(
    resolveMapPresentation({ viewportWidth: 500, coarsePointer: false }),
    'embedded',
  );
});

test('a large phone in landscape still counts as a phone', () => {
  // Landscape iPhone: wide viewport, but a coarse pointer and little vertical room.
  assert.equal(
    resolveMapPresentation({ viewportWidth: 844, coarsePointer: true, viewportHeight: 390 }),
    'immersive',
  );
});

test('unknown environment falls back to embedded rather than seizing the screen', () => {
  assert.equal(resolveMapPresentation(null), 'embedded');
});
