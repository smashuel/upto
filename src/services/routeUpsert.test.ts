/**
 * Upsert-by-id contract for the wizard's route-created handler (issue 03):
 * an edit re-emits the same route id and must replace the stored copy, not
 * append a duplicate; new ids append.
 */
import { describe, expect, it } from 'vitest';
import { upsertRouteById } from './routeUpsert';
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

describe('upsertRouteById', () => {
  it('appends a route with a new id', () => {
    const a = route('a');
    const b = route('b');
    expect(upsertRouteById([], a)).toEqual([a]);
    expect(upsertRouteById([a], b)).toEqual([a, b]);
  });

  it('replaces the stored copy when the id already exists, preserving order', () => {
    const a = route('a');
    const b = route('b');
    const edited = route('a', 2.5);

    const result = upsertRouteById([a, b], edited);
    expect(result).toEqual([edited, b]);
  });

  it('repeated edits still yield exactly one stored route', () => {
    let stored: SerializableTrack[] = [];
    stored = upsertRouteById(stored, route('a', 1));
    stored = upsertRouteById(stored, route('a', 2));
    stored = upsertRouteById(stored, route('a', 3));
    expect(stored).toHaveLength(1);
    expect(stored[0].metadata.distance).toBe(3);
  });

  it('does not mutate the input array', () => {
    const existing = [route('a')];
    upsertRouteById(existing, route('a', 9));
    expect(existing[0].metadata.distance).toBe(1);
  });
});
