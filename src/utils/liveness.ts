// The pure honest-degradation classifier for live location. Given a TripLink and the
// current time, decide how the watcher view should present the traveller's position — so a
// stale or absent point can never masquerade as a current one (the Phase-1 terrain
// absent-not-zero principle, applied to live GPS). No React, no clocks of its own: `now` is
// passed in so the display tick recomputes it between SSE events. See brain/plans/live-location.md.
import type { TripLink } from '../types/adventure.ts';

export type Liveness = 'fresh' | 'stale' | 'not-shared' | 'unavailable';

/** A live fix older than this is no longer presented as current (≈ 3 missed 3-min samples). */
export const LIVE_STALE_MS = 10 * 60 * 1000;

export function describeLiveness(trip: TripLink, now: Date): Liveness {
  // Live only means anything mid-trip: never on a planned (not started) or completed trip.
  if (trip.status !== 'active' && trip.status !== 'overdue') return 'not-shared';

  // Only 'with-trip' surfaces live position to watchers; absent defaults to 'with-trip'.
  if (trip.liveSharing === 'off' || trip.liveSharing === 'owner-only') return 'not-shared';

  const pos = trip.livePosition;
  if (!pos) return 'not-shared';

  // The device explicitly stopped supplying fixes — retain last-known coords for reference
  // but never claim they're current, regardless of how recent the beacon is.
  if (pos.sharing === 'unavailable') return 'unavailable';

  const ageMs = now.getTime() - Date.parse(pos.timestamp);
  return ageMs >= LIVE_STALE_MS ? 'stale' : 'fresh';
}
