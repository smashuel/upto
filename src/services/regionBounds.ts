// Pure geography: which regional map products cover a given point.
//
// Split out of LinzMapService/AusMapService because those modules also hold tile-URL
// plumbing that reads import.meta.env. Anything importing them for bounds alone was
// dragging Vite-only globals into plain-node contexts (unit tests, tooling). Bounds are
// static geography and have no business depending on build config.

/** NZ mainland + coastal islands bounding box (EPSG:4326) */
export const NZ_BOUNDS = {
  west: 165.8,
  south: -47.5,
  east: 178.6,
  north: -33.9,
} as const;

/** AU mainland + Tasmania bounding box (EPSG:4326) */
export const AU_BOUNDS = {
  west: 112.0,
  south: -44.0,
  east: 154.0,
  north: -10.0,
} as const;

/** NSW (including the ACT enclave) bounding box (EPSG:4326) */
export const NSW_BOUNDS = {
  west: 140.999,
  south: -37.505,
  east: 153.639,
  north: -28.157,
} as const;

interface Bounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

const contains = (b: Bounds, lat: number, lng: number): boolean =>
  lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;

/** Returns true if the coordinate falls within approximate NZ bounds */
export const isWithinNZBounds = (lat: number, lng: number): boolean =>
  contains(NZ_BOUNDS, lat, lng);

/** Returns true if the coordinate falls within approximate AU bounds */
export const isWithinAuBounds = (lat: number, lng: number): boolean =>
  contains(AU_BOUNDS, lat, lng);

/** Returns true if the coordinate falls within approximate NSW bounds */
export const isWithinNswBounds = (lat: number, lng: number): boolean =>
  contains(NSW_BOUNDS, lat, lng);
