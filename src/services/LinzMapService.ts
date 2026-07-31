/**
 * LinzMapService — LINZ Land Information New Zealand map integration
 *
 * Provides Topo50 tile access via a backend proxy (server-side API key).
 * Layer 767 = NZ Topo50 (classic paper map style, contours, hut symbols, track markings).
 * Only covers NZ bounds — falls back to satellite base layer outside this area.
 *
 * Owner: route-planner-agent / data-agent
 *
 * Setup:
 *   1. Get API key at https://data.linz.govt.nz → Account → API Keys
 *   2. Set LINZ_LDS_API_KEY on the backend (PM2 env)
 *   3. Optionally set VITE_LINZ_LDS_API_KEY for direct client-side tiles
 *
 * Attribution: © LINZ CC BY 4.0 — must be displayed when layer is active.
 */

import { isNativePlatform } from '../config/api';
import { resolveTopoTileUrl } from './topoTileUrl';

// Geography lives in regionBounds.ts (pure, env-free); re-exported here so existing
// importers of this module are unaffected.
import { NZ_BOUNDS } from './regionBounds';

export { NZ_BOUNDS, isWithinNZBounds } from './regionBounds';

/**
 * XYZ tile URL template for the LINZ Topo50 layer.
 *
 * In production (Vercel): tiles are proxied through /api/tiles/topo/:z/:x/:y
 * so the API key stays server-side.
 *
 * In development: if VITE_LINZ_LDS_API_KEY is set in .env, tiles are fetched
 * directly from LINZ (key visible in browser, acceptable for local dev only).
 * If neither is available, topo toggling is disabled.
 *
 * Use with Cesium.UrlTemplateImageryProvider: `url` param.
 */
export function getTopoTileUrl(): string | null {
  return resolveTopoTileUrl({
    isDev: import.meta.env.DEV,
    isNative: isNativePlatform(),
    devLinzKey: import.meta.env.VITE_LINZ_LDS_API_KEY,
    devApiUrl: import.meta.env.VITE_DEV_API_URL,
    nativeApiBaseUrl: import.meta.env.VITE_NATIVE_API_BASE_URL,
  });
}

/** Attribution string required by LINZ CC BY 4.0 licence */
export const LINZ_ATTRIBUTION = '© LINZ CC BY 4.0';

/** Cesium-compatible bounding rectangle degrees for UrlTemplateImageryProvider */
export const LINZ_CESIUM_RECTANGLE = {
  west: NZ_BOUNDS.west,
  south: NZ_BOUNDS.south,
  east: NZ_BOUNDS.east,
  north: NZ_BOUNDS.north,
};
