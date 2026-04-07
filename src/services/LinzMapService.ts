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

/** NZ mainland + coastal islands bounding box (EPSG:4326) */
export const NZ_BOUNDS = {
  west: 165.8,
  south: -47.5,
  east: 178.6,
  north: -33.9,
} as const;

/** Returns true if the coordinate falls within approximate NZ bounds */
export function isWithinNZBounds(lat: number, lng: number): boolean {
  return (
    lat >= NZ_BOUNDS.south &&
    lat <= NZ_BOUNDS.north &&
    lng >= NZ_BOUNDS.west &&
    lng <= NZ_BOUNDS.east
  );
}

/**
 * XYZ tile URL template for the LINZ Topo50 layer, routed through the
 * backend proxy so the API key stays server-side.
 *
 * Use with Cesium.UrlTemplateImageryProvider: `url` param.
 */
export function getTopoTileUrl(): string {
  return '/api/tiles/topo/{z}/{x}/{y}';
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
