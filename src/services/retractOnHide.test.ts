import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRetractOnHide } from './retractOnHide.ts';

// ── shouldRetractOnHide: does a hidden document mean "tracking stopped"? (Stage 2 Slice 2) ──
//
// Two lines of code, tested because getting it wrong is invisible in review and loud in the
// field. On the web, `pagehide` means the tab is going away and the JS that produces fixes dies
// with it — so retracting is honest. In the native shell, `pagehide` also fires when the app is
// merely backgrounded, and that is exactly when the background watcher takes over: the phone is
// in a pocket and fixes keep flowing.
//
// Retracting there would report "paused, last known N min ago" to a watcher about a traveller
// who is being tracked perfectly well — the single most common state of a real trip turned into
// a false alarm, and the whole point of Slice 2 undone at the last step.

test('web + with-trip: hiding the tab retracts — the fix producer dies with the document', () => {
  assert.equal(shouldRetractOnHide('web', 'with-trip'), true);
});

test('iOS + with-trip: backgrounding does NOT retract — the native watcher keeps producing', () => {
  assert.equal(shouldRetractOnHide('ios', 'with-trip'), false);
});

test('Android + with-trip: backgrounding does NOT retract', () => {
  assert.equal(shouldRetractOnHide('android', 'with-trip'), false);
});

test('owner-only never retracts — it was never publishing anything to retract', () => {
  assert.equal(shouldRetractOnHide('web', 'owner-only'), false);
  assert.equal(shouldRetractOnHide('ios', 'owner-only'), false);
});

test('off never retracts', () => {
  assert.equal(shouldRetractOnHide('web', 'off'), false);
  assert.equal(shouldRetractOnHide('ios', 'off'), false);
});
