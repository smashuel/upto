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

// Geography lives in regionBounds.ts (pure, env-free); re-exported here so existing
// importers of this module are unaffected.
import { AU_BOUNDS, NSW_BOUNDS } from './regionBounds';

export { AU_BOUNDS, NSW_BOUNDS, isWithinAuBounds, isWithinNswBounds } from './regionBounds';

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
