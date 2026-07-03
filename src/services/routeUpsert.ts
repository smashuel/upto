import type { SerializableTrack } from './TrackDrawer';

/**
 * Upsert a route into the wizard's form-state route array by id: an
 * edit-commit re-emits the same route id and replaces the stored copy;
 * a newly drawn route (fresh id) appends. Returns a new array.
 */
export function upsertRouteById(
  existing: SerializableTrack[],
  route: SerializableTrack,
): SerializableTrack[] {
  const index = existing.findIndex(r => r.id === route.id);
  if (index === -1) return [...existing, route];
  const next = [...existing];
  next[index] = route;
  return next;
}
