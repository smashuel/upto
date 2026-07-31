// Scene-mode-aware globe LOD pressure.
//
// `Globe.maximumScreenSpaceError` controls how deeply the terrain quadtree refines, and
// imagery LOD rides along with it — lower value, finer tiles, sharper picture.
//
// The 2D/3D split exists because the two modes use different terrain providers. In 3D the
// viewer loads Cesium World Terrain, whose geometric error forces deep refinement; imagery
// gets pulled to a fine LOD as a side effect. In 2D we swap in EllipsoidTerrainProvider
// (flat, negligible geometric error), refinement stops several levels earlier, and the same
// satellite imagery renders visibly coarser — reported on-device as "3D is way clearer".
//
// Buying that detail back is cheap in 2D specifically: there is no terrain mesh to build or
// light, so a lower SSE costs imagery tile fetches and fill rate, not geometry. The 3D values
// are left exactly as tuned so the mode that actually carries terrain cost is untouched.

// Explicit .ts extension: value import, so node's --experimental-strip-types resolver
// needs the real file (type-only imports are erased and don't).
import { PERF_PROFILES, type DeviceTier } from './MapPerformance.ts';

export type GlobeSceneMode = '2d' | '3d';

/**
 * Multiplier applied to the tier's 3D screen-space error when flat. Below 1.0 = sharper.
 * Weaker tiers get a milder boost so the win doesn't come back as jank on slow hardware.
 */
const FLAT_SSE_FACTOR: Record<DeviceTier, number> = {
  high: 0.75,
  mid: 0.65,
  low: 0.6,
};

/** Refining past this pins the quadtree at max depth for negligible visible gain. */
const MIN_SSE = 1;

export function resolveScreenSpaceError(tier: DeviceTier, mode: GlobeSceneMode): number {
  const base = PERF_PROFILES[tier].maximumScreenSpaceError;
  if (mode === '3d') return base;
  return Math.max(MIN_SSE, base * FLAT_SSE_FACTOR[tier]);
}
