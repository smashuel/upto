// Which base imagery does the Cesium viewer open with? Pure decision, kept Cesium-free so it
// is unit-testable off-device: Cesium Ion satellite when we hold a usable Ion token, else the
// key-less OpenStreetMap fallback. The Cesium provider construction (and the async-rejection
// fallback) lives below this seam in TripPlanningMap.
// See .scratch/native-map-fixes/issues/01-native-cesium-ion-satellite-3d.md.

/** Cesium Ion asset id for the Sentinel-2 satellite basemap. */
export const ION_SATELLITE_ASSET_ID = 2;

/** Key-less fallback tiles when there's no usable Ion token (or Ion fails to load). */
export const OSM_TILE_URL = 'https://a.tile.openstreetmap.org/';

export type BaseImagery =
  | { kind: 'ion-satellite'; assetId: number }
  | { kind: 'osm-fallback'; url: string };

/** The .env.example stand-in — present but worthless, so it must not select Ion. */
const PLACEHOLDER_TOKEN = 'your_cesium_ion_token_here';

export function isUsableIonToken(token: string | null | undefined): boolean {
  const trimmed = token?.trim();
  return !!trimmed && trimmed !== PLACEHOLDER_TOKEN;
}

export function selectBaseImagery(token: string | null | undefined): BaseImagery {
  if (isUsableIonToken(token)) return { kind: 'ion-satellite', assetId: ION_SATELLITE_ASSET_ID };
  return { kind: 'osm-fallback', url: OSM_TILE_URL };
}
