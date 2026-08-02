// The pure battery-aware sampling policy for live location (Stage 2 Slice 3). Given trip
// status, foreground/background state, battery level/charging, and the traveller's chosen
// power mode, decide how often and how precisely the device should sample — or `null` when it
// should not sample at all. This replaces Stage 1's two hardcoded interval constants with one
// tunable, tested seam; the native background source (Slice 2) and the web foreground source
// both derive their cadence here. No React, no plugin, no clocks: pure so it can be exhaustively
// unit-tested off-device. See .scratch/live-location-stage-2/issues/03-battery-aware-cadence-and-power-mode.md.
//
// Battery invariant (grilled 2026-07-05, carried from Stage 1): the floor is a *starting point,
// not a ceiling*. Within this module we only ever widen the interval / lower accuracy from the
// foreground floor — nothing here samples faster than FG_FLOOR_MS, whatever the inputs say.
//
// The floor's VALUE moved from 3 minutes to 30 seconds on 2026-08-03 by explicit decision
// (ADR 020) after the device matrix. The invariant above is unchanged — the shape of the policy
// still only widens — but the starting point is six times tighter, and the battery cost of that
// has not yet been measured. Treat FG_FLOOR_MS as provisional until it has been.

import type { TripStatus } from '../types/adventure';

export type PowerMode = 'adaptive' | 'battery-saver';

export interface CadenceContext {
  /** Sample only while the trip is active or overdue. */
  status: TripStatus;
  liveSharing: 'with-trip' | 'owner-only' | 'off';
  appState: 'foreground' | 'background';
  /** 0..1, or null when the platform can't report it (treated conservatively — as low). */
  batteryLevel: number | null;
  isCharging: boolean;
  powerMode: PowerMode;
}

export interface SampleCadence {
  intervalMs: number;
  distanceFilterM: number;
  enableHighAccuracy: boolean;
}

// --- Tunable constants (single home for the battery-vs-safety tradeoff) ---

/**
 * Foreground floor: the tightest we ever sample. Exported so the web foreground source
 * (ActiveTrip) uses the same single source of truth, not a copy.
 *
 * **30 s as of 2026-08-03, down from the Stage-1 3-minute floor — see
 * [ADR 020](../../brain/decisions/020-thirty-second-sampling-cadence.md).** The device matrix
 * showed 3 minutes held reliably in a pocket but read as too coarse to watch, and a 3-minute-old
 * marker is a wide search radius for someone moving. The battery cost of that trade is
 * deliberately **unmeasured so far** — ADR 020 exists to make sure it gets measured rather than
 * assumed, and this constant is the one place to widen it again if the data says so.
 */
export const FG_FLOOR_MS = 30 * 1000;
/**
 * Backgrounded base: still wider than foreground, because the screen is off and radios are dear.
 * Held at 2× the floor, as before.
 *
 * Note this is dormant — `resolveSampleCadence` is not yet wired into either source (Slice 3),
 * so today both foreground and background run at FG_FLOOR_MS. When Slice 3 lands, backgrounded
 * tracking will drop to this value unless the battery data says otherwise. That is a decision to
 * take with numbers in hand, not now.
 */
const BG_BASE_MS = 60 * 1000;

/** Battery-saver multiplies the interval — the traveller has opted to trade freshness for life. */
const SAVER_MULTIPLIER = 2;
/** Low/unknown battery (not charging) widens the interval. */
const LOW_BATTERY_MULTIPLIER = 1.5;
/** At or below this level (and not charging) we treat the battery as low. */
const LOW_BATTERY_THRESHOLD = 0.2;

const FG_DISTANCE_FILTER_M = 25;
const BG_DISTANCE_FILTER_M = 100;

function samples(ctx: CadenceContext): boolean {
  if (ctx.status !== 'active' && ctx.status !== 'overdue') return false;
  // `off` genuinely collects nothing. `owner-only` still samples (rendered locally, never POSTed
  // — the server guard is the backstop), so only `off` gates sampling here.
  if (ctx.liveSharing === 'off') return false;
  return true;
}

/**
 * Pure: resolve the sampling cadence for the current context, or `null` when the device should
 * not sample. Widens the interval / drops accuracy when backgrounded, in battery-saver mode, or
 * on low/unknown battery; tightens when foreground and/or charging — never below FG_FLOOR_MS.
 */
export function resolveSampleCadence(ctx: CadenceContext): SampleCadence | null {
  if (!samples(ctx)) return null;

  const background = ctx.appState === 'background';
  const saver = ctx.powerMode === 'battery-saver';
  // null battery is unknown — fail conservative and treat it as low. Charging overrides low.
  const lowBattery =
    !ctx.isCharging && (ctx.batteryLevel === null || ctx.batteryLevel <= LOW_BATTERY_THRESHOLD);

  let intervalMs = background ? BG_BASE_MS : FG_FLOOR_MS;
  if (saver) intervalMs *= SAVER_MULTIPLIER;
  if (lowBattery) intervalMs *= LOW_BATTERY_MULTIPLIER;

  // Never dip below the coarse foreground floor, whatever the tightening inputs say.
  intervalMs = Math.max(intervalMs, FG_FLOOR_MS);

  // High accuracy only when we can afford it: foreground, adaptive, and either charging or a
  // known-healthy battery. Everything else (background / saver / low-or-unknown battery) is coarse.
  const enableHighAccuracy =
    !background &&
    !saver &&
    (ctx.isCharging || (ctx.batteryLevel !== null && ctx.batteryLevel > LOW_BATTERY_THRESHOLD));

  const distanceFilterM = background || saver || lowBattery ? BG_DISTANCE_FILTER_M : FG_DISTANCE_FILTER_M;

  return { intervalMs, distanceFilterM, enableHighAccuracy };
}
