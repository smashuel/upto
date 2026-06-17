/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Device-tier performance profile for the Cesium viewer.
 *
 * Cesium is heavy on low-end phones. The existing viewer was tuned for desktop
 * crispness (native resolution, MSAA 4×, aggressive screen-space error of 1.333)
 * after earlier "blurry/pixelated" feedback — but those exact settings tank the
 * framerate on mid-range Android.
 *
 * This module keeps the crisp desktop settings unchanged (tier `high`) and only
 * relaxes quality on mobile, trading a little sharpness for a smoother pan. All
 * values live here so they can be tuned empirically on real devices (there is no
 * official Cesium mobile preset — these are community-synthesised starting points).
 *
 * NOTE: this profile is purely visual-quality tuning. It deliberately does NOT
 * touch `requestRenderMode` — that's the bigger CPU/battery win but has a subtle
 * failure mode (scene mutations don't appear until the camera moves unless every
 * manager calls `scene.requestRender()`), so it's tracked as a separate, verified
 * follow-up. See brain/plans/compass_artifact.md.
 */

export type DeviceTier = 'low' | 'mid' | 'high';

export interface PerfProfile {
  /** Drawing-buffer scale. 1.0 = render at device pixel ratio (crisp/expensive). */
  resolutionScale: number;
  /** Globe LOD pressure. Lower = more/finer tiles (crisper, heavier). Cesium default is 2. */
  maximumScreenSpaceError: number;
  /** MSAA sample count (WebGL2). 1 = off. Smooths polyline/contour edges, GPU cost. */
  msaaSamples: number;
  /** Sky atmosphere halo — per-frame cost, cosmetic. */
  skyAtmosphere: boolean;
  /** Ground atmosphere — per-frame cost; disabling also dodges a known black-globe bug on some Android devices (CesiumGS #10442). */
  groundAtmosphere: boolean;
  /** Distance fog — cheap and aids depth perception, so kept on across tiers. */
  fog: boolean;
}

export const PERF_PROFILES: Record<DeviceTier, PerfProfile> = {
  // Desktop / capable: identical to the pre-existing hand-tuned settings — zero regression.
  high: {
    resolutionScale: 1.0,
    maximumScreenSpaceError: 1.333,
    msaaSamples: 4,
    skyAtmosphere: true,
    groundAtmosphere: true,
    fog: true,
  },
  // Capable mobile: slight resolution + LOD relaxation, MSAA + atmosphere off.
  mid: {
    resolutionScale: 0.9,
    maximumScreenSpaceError: 1.6,
    msaaSamples: 1,
    skyAtmosphere: false,
    groundAtmosphere: false,
    fog: true,
  },
  // Low-end mobile: the FPS win comes mostly from resolutionScale + relaxed SSE.
  low: {
    resolutionScale: 0.75,
    maximumScreenSpaceError: 2.0,
    msaaSamples: 1,
    skyAtmosphere: false,
    groundAtmosphere: false,
    fog: true,
  },
};

/**
 * Classify the current device. Desktop is always `high`. Mobile splits on the
 * Device Memory API (Chrome/Android) and logical core count — both heuristics,
 * both absent on iOS Safari, where we conservatively assume `mid`.
 */
export function detectDeviceTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'high';
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua);
  if (!isMobile) return 'high';

  const mem = (navigator as any).deviceMemory as number | undefined; // GB, Chrome-only
  const cores = navigator.hardwareConcurrency || 0;
  if ((mem && mem <= 4) || (cores && cores > 0 && cores <= 4)) return 'low';
  return 'mid';
}

/**
 * Apply a performance profile to a live Cesium viewer. Each setter is guarded so
 * an unsupported property (older Cesium / headless GL) can't break init.
 * Returns the applied profile (handy for logging/telemetry).
 */
export function applyPerformanceProfile(
  viewer: any,
  tier: DeviceTier = detectDeviceTier(),
): PerfProfile {
  const p = PERF_PROFILES[tier];
  const scene = viewer?.scene;
  if (!scene) return p;

  try { viewer.resolutionScale = p.resolutionScale; } catch { /* unsupported */ }
  try { scene.globe.maximumScreenSpaceError = p.maximumScreenSpaceError; } catch { /* unsupported */ }
  try { scene.msaaSamples = p.msaaSamples; } catch { /* WebGL1 / unsupported */ }
  try { scene.skyAtmosphere.show = p.skyAtmosphere; } catch { /* unsupported */ }
  try { scene.globe.showGroundAtmosphere = p.groundAtmosphere; } catch { /* unsupported */ }
  try { scene.fog.enabled = p.fog; } catch { /* unsupported */ }

  return p;
}
