// Run via `node --test --experimental-strip-types`. resolveSampleCadence is the pure
// battery-aware sampling policy: given trip status, foreground/background state, battery,
// and the traveller's power mode, decide how often / how precisely to sample — or null when
// the device should not sample at all. Tests assert external behaviour only (relative
// widening/tightening + the null gates), not exact constants. See
// .scratch/live-location-stage-2/issues/03-battery-aware-cadence-and-power-mode.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSampleCadence, type CadenceContext } from './sampleCadence.ts';

const ctx = (over: Partial<CadenceContext> = {}): CadenceContext => ({
  status: 'active',
  liveSharing: 'with-trip',
  appState: 'foreground',
  batteryLevel: 0.9,
  isCharging: false,
  powerMode: 'adaptive',
  ...over,
});

test('status not active/overdue → null (no sampling)', () => {
  assert.equal(resolveSampleCadence(ctx({ status: 'planned' })), null);
  assert.equal(resolveSampleCadence(ctx({ status: 'completed' })), null);
});

test('liveSharing off → null (off genuinely collects nothing)', () => {
  assert.equal(resolveSampleCadence(ctx({ liveSharing: 'off' })), null);
});

test('owner-only still samples (renders locally, never POSTs) → not null', () => {
  assert.notEqual(resolveSampleCadence(ctx({ liveSharing: 'owner-only' })), null);
});

test('overdue still samples (the period watchers most need it) → not null', () => {
  assert.notEqual(resolveSampleCadence(ctx({ status: 'overdue' })), null);
});

test('foreground + adaptive + charging → tightest cadence (highest accuracy)', () => {
  const c = resolveSampleCadence(ctx({ appState: 'foreground', powerMode: 'adaptive', isCharging: true }));
  assert.ok(c);
  assert.equal(c.enableHighAccuracy, true);
});

test('background widens the interval + lowers accuracy vs foreground (same trip)', () => {
  const fg = resolveSampleCadence(ctx({ appState: 'foreground' }))!;
  const bg = resolveSampleCadence(ctx({ appState: 'background' }))!;
  assert.ok(bg.intervalMs > fg.intervalMs);
  assert.equal(bg.enableHighAccuracy, false);
});

test('battery-saver widens further than adaptive at the same inputs', () => {
  const adaptive = resolveSampleCadence(ctx({ powerMode: 'adaptive' }))!;
  const saver = resolveSampleCadence(ctx({ powerMode: 'battery-saver' }))!;
  assert.ok(saver.intervalMs > adaptive.intervalMs);
});

test('low battery widens vs high battery (when not charging)', () => {
  const high = resolveSampleCadence(ctx({ batteryLevel: 0.9 }))!;
  const low = resolveSampleCadence(ctx({ batteryLevel: 0.1 }))!;
  assert.ok(low.intervalMs > high.intervalMs);
});

test('unknown battery (null) is treated conservatively (>= a low-but-known battery-ish widening, never like full)', () => {
  const full = resolveSampleCadence(ctx({ batteryLevel: 0.9 }))!;
  const unknown = resolveSampleCadence(ctx({ batteryLevel: null }))!;
  assert.ok(unknown.intervalMs > full.intervalMs);
});

test('charging tightens vs the same inputs on battery', () => {
  const onBattery = resolveSampleCadence(ctx({ batteryLevel: 0.15, isCharging: false }))!;
  const charging = resolveSampleCadence(ctx({ batteryLevel: 0.15, isCharging: true }))!;
  assert.ok(charging.intervalMs < onBattery.intervalMs);
});

test('monotonic sanity: backgrounded/battery-saver interval >= foreground/adaptive for the same trip', () => {
  const fgAdaptive = resolveSampleCadence(ctx({ appState: 'foreground', powerMode: 'adaptive' }))!;
  const bgSaver = resolveSampleCadence(ctx({ appState: 'background', powerMode: 'battery-saver' }))!;
  assert.ok(bgSaver.intervalMs >= fgAdaptive.intervalMs);
});

test('never samples faster than the coarse foreground floor (battery invariant)', () => {
  // The tightest possible cadence (fg + adaptive + charging + full battery) must not dip below
  // the Stage-1 ~3-min foreground floor — native capability is not a licence to firehose.
  const tightest = resolveSampleCadence(
    ctx({ appState: 'foreground', powerMode: 'adaptive', isCharging: true, batteryLevel: 1 }),
  )!;
  assert.ok(tightest.intervalMs >= 3 * 60 * 1000);
});
