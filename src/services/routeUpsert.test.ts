/**
 * One route per TripLink (issue 11). A TripLink describes a single trip, so drawing a new
 * route replaces the stored one rather than accumulating alongside it — while an edit, which
 * re-emits the same route id, must still replace in place and not read as a replacement to
 * the user.
 *
 * Multi-activity trips (a multi-sport race: paddle, then ride, then run) are a different
 * shape — legs with a per-leg activity inside one route — and are deliberately not modelled
 * as "several routes". See the ADR before relaxing this.
 */
import { describe, expect, it } from 'vitest';
import { applyDrawnRoute } from './routeUpsert';
import type { SerializableTrack } from './TrackDrawer';

const route = (id: string, distance = 1): SerializableTrack => ({
  id,
  name: `Route ${id}`,
  waypoints: [
    { coordinates: [-41.0, 172.0], elevation: 500 },
    { coordinates: [-41.0, 172.01], elevation: 800 },
  ],
  metadata: {
    distance,
    elevationGain: 300,
    elevationLoss: 0,
    activityType: 'hiking',
    created: new Date().toISOString(),
  },
});

describe('applyDrawnRoute', () => {
  it('stores the first route drawn', () => {
    const a = route('a');
    expect(applyDrawnRoute([], a)).toEqual({ routes: [a], replaced: false });
  });

  it('a newly drawn route replaces the existing one', () => {
    const a = route('a');
    const b = route('b');
    expect(applyDrawnRoute([a], b)).toEqual({ routes: [b], replaced: true });
  });

  it('an edit to the stored route is not a replacement', () => {
    // Committing an edit re-emits the same id. The user changed their route; they did not
    // discard one, so nothing should be announced to them.
    const edited = route('a', 2.5);
    expect(applyDrawnRoute([route('a', 1)], edited)).toEqual({
      routes: [edited],
      replaced: false,
    });
  });

  it('repeated edits still yield exactly one stored route', () => {
    let stored: SerializableTrack[] = [];
    for (const distance of [1, 2, 3]) {
      stored = applyDrawnRoute(stored, route('a', distance)).routes;
    }
    expect(stored).toHaveLength(1);
    expect(stored[0].metadata.distance).toBe(3);
  });

  it('collapses a TripLink that already holds several routes', () => {
    // TripLinks created before this rule can hold more than one. Drawing again resolves the
    // ambiguity down to the single route the user just drew.
    const result = applyDrawnRoute([route('a'), route('b')], route('c'));
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].id).toBe('c');
    expect(result.replaced).toBe(true);
  });

  it('does not mutate the input array', () => {
    const existing = [route('a')];
    applyDrawnRoute(existing, route('b'));
    expect(existing).toHaveLength(1);
    expect(existing[0].id).toBe('a');
  });
});
