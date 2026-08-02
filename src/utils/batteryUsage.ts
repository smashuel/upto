// The readout that settles the 30-second cadence question.
//
// ADR 020 dropped the sampling floor from 3 minutes to 30 seconds on the argument that a
// 3-minute-old marker is too coarse to watch and too wide a search radius for someone moving.
// That is a real safety argument — but it was made without the battery cost, and on a multi-day
// trip battery IS a safety property: a tracker that dies at hour 30 has failed at the only
// moment that counted.
//
// So this exists to turn a live trip into a number the traveller can read off their own screen,
// rather than asking them to remember to check Settings at both ends of a walk.
//
// Deliberately conservative about projecting a rate — see the minimum sample below.

export interface BatteryUsageInput {
  /** Battery percentage (0–100) when tracking started, or null if never captured. */
  startPct: number | null;
  /** Epoch ms when tracking started. */
  startedAt: number;
  /** Current battery percentage, or null if the platform can't report it. */
  nowPct: number | null;
  /** Epoch ms now. */
  now: number;
}

/**
 * Below this, a projected drain rate is noise. One percent over four minutes extrapolates to
 * 15%/h, which is not a measurement — and the moment it is printed it becomes a number someone
 * quotes in a decision. Better to say "keep going".
 */
const MIN_SAMPLE_MS = 20 * 60 * 1000;

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * A one-line battery summary for the live trip, or `null` when there is nothing honest to say.
 *
 * Returns null rather than guessing when a reading is missing or the clock has gone backwards —
 * a readout that invents its baseline is worse than no readout, because it looks authoritative.
 */
export function describeBatteryUsage(input: BatteryUsageInput): string | null {
  const { startPct, startedAt, nowPct, now } = input;
  if (startPct === null || nowPct === null) return null;

  const elapsedMs = now - startedAt;
  if (elapsedMs < 0) return null;

  const elapsed = formatDuration(elapsedMs);
  const used = startPct - nowPct;

  // Charging (or a rising reading) makes drain meaningless — say so rather than printing a
  // negative "usage" that reads as a bug.
  if (used < 0) {
    return `Battery ${nowPct}% — up from ${startPct}% over ${elapsed} (charging; drain not measurable)`;
  }

  const base = `Battery ${nowPct}% — ${used}% used from ${startPct}% over ${elapsed}`;

  if (elapsedMs < MIN_SAMPLE_MS) {
    return `${base}. Too short to project a rate yet — keep going.`;
  }

  const perHour = used / (elapsedMs / 3_600_000);
  // One decimal below 10%/h, whole numbers above: the difference between 4.2 and 4.8%/h matters
  // for a multi-day trip; the difference between 23 and 24 does not.
  const rate = perHour < 10 ? Math.round(perHour * 10) / 10 : Math.round(perHour);
  return `${base} — about ${rate}%/h`;
}
