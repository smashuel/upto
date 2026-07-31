// toPositionFix — the boundary between the background-geolocation plugin's Location and the
// app's PositionFix (live location Stage 2 Slice 2).
//
// Kept pure and import-free on purpose. Everything else about the native source (the watcher,
// the OS permission dialog, the foreground service) is below the seam and only verifiable on a
// real device; this mapping is not, so it is unit-tested off-device — which matters because
// coordinate handling is where this codebase has been bitten before (NZTM2000 vs WGS84 in the
// DOC sync, lat/lng order in DOC track geometry).
//
// See .scratch/live-location-stage-2/PRD-slice-02-native-background.md.

import type { PositionFix } from './positionSource.ts';

/**
 * The subset of the plugin's `Location` this mapping reads. Declared structurally rather than
 * imported so the module stays dependency-free — and so a plugin swap (ADR 011's reconsider
 * path is a different background plugin) only has to satisfy this shape.
 *
 * Every field is optional here even though the plugin types some as required: this function
 * exists precisely to be the place that does not trust the payload.
 */
export interface PluginLocation {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  simulated?: boolean;
  /** Milliseconds since the unix epoch, per the plugin. Nullable in its own types. */
  time?: number | null;
}

export interface ToPositionFixOptions {
  /**
   * Accept fixes the OS flags as software-simulated. Off by default: a simulated position
   * broadcast to a watcher as real is a falsehood told in the one situation this app exists
   * for. Turn on only to exercise the pipeline in the iOS Simulator / Android emulator.
   */
  allowSimulated?: boolean;
  /** Injectable clock, for the fallback when the plugin supplies no usable `time`. */
  now?: () => number;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Map a plugin location onto a `PositionFix`, or return `null` to drop it.
 *
 * The bias is deliberate and worth stating: **a wrong position is worse than no position.**
 * A dropped fix degrades honestly — the existing liveness machinery shows the watcher "paused,
 * last known N min ago" — whereas a bad one sends a searcher to the wrong valley. So anything
 * malformed is refused rather than coerced, and the next sample (a few minutes away) recovers.
 */
export function toPositionFix(
  location: PluginLocation | null | undefined,
  options: ToPositionFixOptions = {},
): PositionFix | null {
  if (!location) return null;

  const { latitude, longitude, accuracy, simulated, time } = location;

  if (simulated === true && !options.allowSimulated) return null;

  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  // Null Island. A real place in the Gulf of Guinea, but as a *pair* it is overwhelmingly an
  // uninitialised reading. A zero on one axis alone (the equator, the prime meridian) is
  // ordinary and is kept.
  if (latitude === 0 && longitude === 0) return null;

  // The plugin types `accuracy` as required and non-nullable on both platforms, so a missing
  // or nonsense value means the payload is malformed — and coordinates carried by a malformed
  // payload are not worth trusting either.
  if (!isFiniteNumber(accuracy) || accuracy < 0) return null;

  // `time` is nullable in the plugin's own types. Falling back to now costs at most the
  // sampling cadence of drift, which is far better than discarding a good position; a
  // non-positive value means the device clock is unset, not that the fix is from 1970.
  const timestampMs = isFiniteNumber(time) && time > 0
    ? time
    : (options.now?.() ?? Date.now());

  return {
    lat: latitude,
    lng: longitude,
    accuracy,
    timestamp: new Date(timestampMs).toISOString(),
  };
}
