/**
 * mapFraming — pure, Cesium-free framing decisions for the live-view camera.
 *
 * Slice 04 (live location) needs the view page to keep the traveller's live
 * marker on screen *without* yanking the camera on every ~3 min fix. That splits
 * cleanly into two pure questions, kept here so they're testable without a viewer:
 *
 *   - `framingPoints` — which lat/lng points should the bounds-fit cover? The
 *     planned route plus the live marker when present (route-only, or live-only,
 *     or nothing, as fallbacks).
 *   - `pointWithinView` — is the live fix comfortably inside the current view, or
 *     has it drifted far enough toward the edge that we should re-frame?
 *
 * The Cesium glue (reading the camera rectangle, calling flyToRouteBounds) lives
 * in TripPlanningMap; these two functions carry the logic.
 */

import type { LatLng } from '../types/adventure';

/**
 * The lat/lng points the view camera should frame: the planned route plus the
 * live marker when present. Falls back to route-only, live-only, or empty.
 * Returns a fresh array — never mutates the caller's route.
 */
export function framingPoints(
  routeLatLng: LatLng[],
  live: { lat: number; lng: number } | null,
): LatLng[] {
  const pts: LatLng[] = [...routeLatLng];
  if (live) pts.push([live.lat, live.lng]);
  return pts;
}

export interface ViewRect {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Is (lat, lng) comfortably inside `rect` (degrees)? The rect is shrunk by
 * `marginFrac` on each axis first, so a point drifting toward the edge counts as
 * "out" — letting the caller re-frame *before* it leaves the screen rather than
 * chasing it once it's gone. Longitudes are assumed not to cross the antimeridian
 * (true for NZ/AU, the only regions this app frames).
 */
export function pointWithinView(
  rect: ViewRect,
  lat: number,
  lng: number,
  marginFrac = 0.15,
): boolean {
  const mx = (rect.east - rect.west) * marginFrac;
  const my = (rect.north - rect.south) * marginFrac;
  return (
    lng >= rect.west + mx &&
    lng <= rect.east - mx &&
    lat >= rect.south + my &&
    lat <= rect.north - my
  );
}
