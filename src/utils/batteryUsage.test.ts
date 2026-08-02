import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeBatteryUsage } from './batteryUsage.ts';

// ── describeBatteryUsage: the readout that settles the 30-second cadence ─────
//
// The cadence went from 3 minutes to 30 seconds (ADR 020) on the judgement that a 3-minute-old
// marker is too coarse to watch. That is a real safety argument, but it was made WITHOUT the
// battery cost, and on a multi-day trip battery is itself a safety property. This function turns
// a trip into a number so the next decision is made from data.
//
// It is deliberately conservative about claiming a drain rate: an estimate from four minutes of
// walking would be worse than no estimate, because it would be quoted.

const START = Date.parse('2026-08-03T08:00:00Z');
const mins = (n: number) => START + n * 60_000;

/** Assert a readout was produced, and hand back the string so the case can inspect it. */
function line(input: Parameters<typeof describeBatteryUsage>[0]): string {
  const s = describeBatteryUsage(input);
  assert.ok(s, 'expected a readout');
  return s;
}

test('reports the drop and the elapsed time', () => {
  const s = line({ startPct: 80, startedAt: START, nowPct: 74, now: mins(60) });
  assert.match(s, /80%/);
  assert.match(s, /74%/);
  assert.match(s, /6%/);
  assert.match(s, /1h/);
});

test('projects a per-hour rate once there is enough of a sample', () => {
  const s = line({ startPct: 80, startedAt: START, nowPct: 68, now: mins(120) });
  assert.match(s, /6%\/h/, '12% over 2h is 6%/h');
});

test('refuses to project from too short a sample', () => {
  // 1% over four minutes extrapolates to 15%/h, which is noise dressed as a measurement — and
  // once printed, it gets quoted in a decision.
  const s = line({ startPct: 80, startedAt: START, nowPct: 79, now: mins(4) });
  assert.doesNotMatch(s, /\/h/);
  assert.match(s, /too short|keep going/i);
});

test('handles the battery going UP (charging) without reporting a negative drain', () => {
  const s = line({ startPct: 60, startedAt: START, nowPct: 72, now: mins(90) });
  assert.doesNotMatch(s, /-\d/);
  assert.match(s, /charg/i);
});

test('a flat battery over a long sample reports 0%/h rather than staying silent', () => {
  const s = line({ startPct: 80, startedAt: START, nowPct: 80, now: mins(90) });
  assert.match(s, /0%\/h/);
});

test('formats sub-hour durations in minutes', () => {
  const s = line({ startPct: 80, startedAt: START, nowPct: 78, now: mins(45) });
  assert.match(s, /45 min/);
});

test('formats multi-hour durations as hours and minutes', () => {
  const s = line({ startPct: 80, startedAt: START, nowPct: 60, now: mins(150) });
  assert.match(s, /2h 30m/);
});

test('returns null when there is no starting reading to compare against', () => {
  // Nothing useful to say, and a readout that invents a baseline is worse than no readout.
  assert.equal(describeBatteryUsage({ startPct: null, startedAt: START, nowPct: 70, now: mins(60) }), null);
  assert.equal(describeBatteryUsage({ startPct: 80, startedAt: START, nowPct: null, now: mins(60) }), null);
});

test('returns null if the clock goes backwards', () => {
  assert.equal(describeBatteryUsage({ startPct: 80, startedAt: mins(60), nowPct: 70, now: START }), null);
});
