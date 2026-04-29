/**
 * AusMapService — Australian topographic basemap integration
 *
 * Parallels LinzMapService. Two layers ship here:
 *   1. GA National (Geoscience Australia Topographic Base Map) — 1:250k, AU-wide, CC BY 4.0
 *   2. NSW Topo (NSW Spatial Services) — 1:25k–1:100k, NSW only, CC BY 4.0
 *
 * Both are key-less, public ArcGIS REST tile services with permissive CORS,
 * so they're fetched directly from the browser — no backend proxy.
 *
 * ArcGIS tile URLs use {z}/{y}/{x} (row/column), not {z}/{x}/{y}. Cesium's
 * UrlTemplateImageryProvider recognises both tokens, so placement in the
 * template is all that matters.
 *
 * Future state-level AU layers (VIC/QLD/TAS/WA/SA) should be added here with
 * matching BOUNDS / URL / ATTRIBUTION triplets.
 */

/** AU mainland + Tasmania bounding box (EPSG:4326) */
export const AU_BOUNDS = {
  west: 112.0,
  south: -44.0,
  east: 154.0,
  north: -10.0,
} as const;

/** NSW (including ACT enclave) bounding box (EPSG:4326) */
export const NSW_BOUNDS = {
  west: 140.999,
  south: -37.505,
  east: 153.639,
  north: -28.157,
} as const;

/** Returns true if the coordinate falls within approximate AU bounds */
export function isWithinAuBounds(lat: number, lng: number): boolean {
  return (
    lat >= AU_BOUNDS.south &&
    lat <= AU_BOUNDS.north &&
    lng >= AU_BOUNDS.west &&
    lng <= AU_BOUNDS.east
  );
}

/** Returns true if the coordinate falls within approximate NSW bounds */
export function isWithinNswBounds(lat: number, lng: number): boolean {
  return (
    lat >= NSW_BOUNDS.south &&
    lat <= NSW_BOUNDS.north &&
    lng >= NSW_BOUNDS.west &&
    lng <= NSW_BOUNDS.east
  );
}

/** Geoscience Australia national topo — key-less ArcGIS REST, {z}/{y}/{x} order */
export const GA_TOPO_URL =
  'https://services.ga.gov.au/gis/rest/services/Topographic_Base_Map/MapServer/tile/{z}/{y}/{x}';

/** NSW Spatial Services topo — key-less ArcGIS REST, {z}/{y}/{x} order */
export const NSW_TOPO_URL =
  'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Topo_Map/MapServer/tile/{z}/{y}/{x}';

/** Attribution strings required by each source's CC BY 4.0 licence */
export const GA_ATTRIBUTION = '© Commonwealth of Australia (Geoscience Australia), CC BY 4.0';
export const NSW_ATTRIBUTION = 'Contains NSW Spatial Services data © State of NSW (DCS), CC BY 4.0';

/** Cesium-compatible rectangles for UrlTemplateImageryProvider */
export const AU_CESIUM_RECTANGLE = {
  west: AU_BOUNDS.west,
  south: AU_BOUNDS.south,
  east: AU_BOUNDS.east,
  north: AU_BOUNDS.north,
};

export const NSW_CESIUM_RECTANGLE = {
  west: NSW_BOUNDS.west,
  south: NSW_BOUNDS.south,
  east: NSW_BOUNDS.east,
  north: NSW_BOUNDS.north,
};
