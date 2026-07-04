/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Cesium from 'cesium';
/**
 * Shared Cesium camera framing helpers.
 *
 * Competitor apps (Strava, AllTrails, Komoot, Gaia, CalTopo) all frame routes
 * with a tight bounding-sphere fit + pixel-scale padding, not Cesium's default
 * `flyTo({ destination: Rectangle })` which overshoots on short routes.
 *
 * `flyToRouteBounds` wraps the canonical pattern: BoundingSphere.fromPoints,
 * 20% padding, floor radius, pitch chosen from the current scene mode
 * (top-down in 2D, 45° hero-tilt in 3D).
 */

type LatLng = [number, number];

export interface FlyToRouteBoundsOptions {
  /** Animation duration in seconds. Default 1.2. */
  duration?: number;
  /** Floor the sphere radius to this many metres so tiny routes don't zoom past human scale. Default 500. */
  minRadius?: number;
  /** Multiplier applied to the raw sphere radius — > 1 adds margin. Default 1.2 (20 %). */
  paddingFactor?: number;
}

/**
 * Fly the camera to frame a lat/lng route with tight padding.
 * Safe to call during scene morphs — the pitch branch picks the active mode.
 */
export function flyToRouteBounds(
  viewer: any,
  geometryLatLng: LatLng[],
  opts: FlyToRouteBoundsOptions = {},
): void {
  if (!viewer || geometryLatLng.length === 0) return;

  const { duration = 1.2, minRadius = 500, paddingFactor = 1.2 } = opts;

  const cartesians = geometryLatLng.map(([lat, lng]) =>
    Cesium.Cartesian3.fromDegrees(lng, lat),
  );
  const sphere = Cesium.BoundingSphere.fromPoints(cartesians);
  sphere.radius = Math.max(sphere.radius * paddingFactor, minRadius);

  const is2D = viewer.scene.mode === Cesium.SceneMode.SCENE2D;
  const pitch = Cesium.Math.toRadians(is2D ? -90 : -45);

  viewer.camera.flyToBoundingSphere(sphere, {
    duration,
    offset: new Cesium.HeadingPitchRange(0, pitch, sphere.radius * 2),
  });
}
