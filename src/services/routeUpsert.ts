import type { SerializableTrack } from './TrackDrawer';

/** Outcome of storing a drawn route on the TripLink. */
export interface RouteApplication {
  /** The TripLink's routes after applying this one. Always at most one. */
  routes: SerializableTrack[];
  /**
   * True when a *different* route was displaced, so the caller can tell the user their
   * previous route is gone. False for an edit-commit, which re-emits the same id — the user
   * changed one route rather than discarding one, and announcing that would be noise.
   */
  replaced: boolean;
}

/**
 * Apply a drawn route under the one-route-per-TripLink rule (issue 11).
 *
 * A TripLink describes a single trip: one route, one set of expectations about where someone
 * is and when they will be back. Several routes on one link left it ambiguous which one the
 * emergency contact should be looking at, which is a safety problem, not just a tidiness one.
 *
 * A multi-activity trip — a multi-sport race that paddles, then rides, then runs — is a
 * different shape: legs carrying their own activity type *within* one route. It is
 * deliberately not modelled as several routes. See ADR 018 before relaxing this.
 */
export function applyDrawnRoute(
  existing: SerializableTrack[],
  route: SerializableTrack,
): RouteApplication {
  const displaced = existing.some(r => r.id !== route.id);
  return { routes: [route], replaced: displaced };
}
