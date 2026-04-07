/**
 * TrailSnapService — snaps route-drawing clicks to nearby trail geometry.
 *
 * How it works:
 *  1. When the user places a waypoint while drawing, TrackDrawer calls `snap()`.
 *  2. We query the backend for trails within a small radius of the clicked point.
 *  3. We find the closest point on any returned trail polyline.
 *  4. If it's within SNAP_THRESHOLD_KM, we snap to it and remember which trail
 *     and polyline index we snapped to.
 *  5. On the *next* click, if it snaps to the **same** trail, we walk the
 *     polyline between the two snap indices and insert all intermediate vertices —
 *     so the route follows the actual track geometry rather than a straight line.
 *
 * Result: smooth trail-following when drawing near DOC tracks.
 */

import type { LatLng } from '../types/adventure';

export interface SnapTrail {
  id: string;
  name: string;
  source: string;
  geometry: LatLng[]; // [[lat, lng], ...]
}

export interface SnapResult {
  snappedLatLng: LatLng;
  trailId: string;
  trailName: string;
  geometry: LatLng[];
  /** Index into `geometry` of the closest vertex */
  vertexIndex: number;
}

/** Points closer than this to a trail will snap to it */
const SNAP_THRESHOLD_KM = 0.08; // 80 m

/** Haversine distance between two lat/lng pairs (km) */
function distKm([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the closest vertex on a polyline to a given point.
 * Returns { index, distance, latLng } or null if the polyline is empty.
 */
function closestVertexOnPolyline(
  point: LatLng,
  polyline: LatLng[],
): { index: number; distance: number; latLng: LatLng } | null {
  if (!polyline.length) return null;

  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < polyline.length; i++) {
    const d = distKm(point, polyline[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  return { index: bestIndex, distance: bestDist, latLng: polyline[bestIndex] };
}

export class TrailSnapService {
  private apiBase: string;
  private cache = new Map<string, { trails: SnapTrail[]; ts: number }>();
  private readonly cacheTtlMs = 30_000; // cache per grid cell for 30 s

  constructor(apiBase = '') {
    this.apiBase = apiBase;
  }

  /**
   * Try to snap `point` to a nearby trail.
   * Returns null if no trail is close enough (draw freehand instead).
   */
  async snap(point: LatLng): Promise<SnapResult | null> {
    const trails = await this.fetchNearby(point);
    if (!trails.length) return null;

    let best: { trail: SnapTrail; index: number; dist: number; latLng: LatLng } | null = null;

    for (const trail of trails) {
      const closest = closestVertexOnPolyline(point, trail.geometry);
      if (!closest) continue;
      if (closest.distance > SNAP_THRESHOLD_KM) continue;
      if (!best || closest.distance < best.dist) {
        best = { trail, index: closest.index, dist: closest.distance, latLng: closest.latLng };
      }
    }

    if (!best) return null;

    return {
      snappedLatLng: best.latLng,
      trailId: best.trail.id,
      trailName: best.trail.name,
      geometry: best.trail.geometry,
      vertexIndex: best.index,
    };
  }

  /**
   * Given two consecutive snap results on the *same* trail, return the
   * intermediate polyline vertices (exclusive of the two endpoints).
   * Direction is chosen to minimise the walk length.
   */
  interpolate(prev: SnapResult, next: SnapResult): LatLng[] {
    if (prev.trailId !== next.trailId) return [];

    const geo = prev.geometry;
    const a = prev.vertexIndex;
    const b = next.vertexIndex;
    if (a === b) return [];

    // Forward walk a→b
    const forward: LatLng[] = [];
    for (let i = a + 1; i < b; i++) forward.push(geo[i]);

    // Backward walk a→b (going backwards around the array)
    const backward: LatLng[] = [];
    for (let i = a - 1; i > b; i--) backward.push(geo[i]);

    // Pick shorter of the two
    const intermediate = forward.length <= backward.length ? forward : backward;
    return intermediate;
  }

  private cacheKey(lat: number, lng: number): string {
    // Quantise to ~1 km grid cells for caching
    return `${(lat * 100).toFixed(0)}_${(lng * 100).toFixed(0)}`;
  }

  private async fetchNearby([lat, lng]: LatLng): Promise<SnapTrail[]> {
    const key = this.cacheKey(lat, lng);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.trails;

    try {
      const url = `${this.apiBase}/api/trails/snap?lat=${lat}&lng=${lng}&radius=2`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const json: { trails: SnapTrail[] } = await res.json();
      const trails = json.trails ?? [];
      this.cache.set(key, { trails, ts: Date.now() });
      return trails;
    } catch {
      return []; // network fail → draw freehand
    }
  }
}
