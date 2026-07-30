// Pure resolver for the LINZ Topo50 tile template. Split out of LinzMapService so the
// native-vs-web branch is unit-testable without import.meta.env.
//
// Why it exists: the production template used to be the root-relative
// '/api/tiles/topo/{z}/{x}/{y}', which only works when the page is served from an origin
// that proxies /api/* (Vercel). In the Capacitor WebView the origin is capacitor://localhost
// (iOS) or https://localhost (Android), so that path resolves into the bundled web assets
// and every tile 404s — the basemap state flips to topo but no pixels ever arrive, which
// reads on-device as "the map is stuck on satellite". Same failure already documented for
// the REST client in src/config/api.ts.

const LINZ_TOPO_LAYER = 767;
const PLACEHOLDER_LINZ_KEY = 'your_linz_lds_api_key_here';

/** Path segment of the backend tile proxy; the API key stays server-side. */
export const TOPO_PROXY_PATH = '/api/tiles/topo/{z}/{x}/{y}';

/** Backend origin used by native builds when nothing is configured. */
export const DEFAULT_NATIVE_API_BASE_URL = 'https://api.upto.world';

export interface TopoUrlEnv {
  isDev: boolean;
  /** True inside a Capacitor WebView, where relative /api paths do not reach the backend. */
  isNative: boolean;
  /** VITE_LINZ_LDS_API_KEY — dev-only convenience, exposes the key to the browser. */
  devLinzKey?: string | null;
  /** VITE_DEV_API_URL — absolute origin of the local backend. */
  devApiUrl?: string | null;
  /** VITE_NATIVE_API_BASE_URL — absolute backend origin for native builds. */
  nativeApiBaseUrl?: string | null;
}

const joinOrigin = (origin: string): string => `${origin.replace(/\/+$/, '')}${TOPO_PROXY_PATH}`;

/**
 * Resolve the XYZ tile template for LINZ Topo50, or null when topo cannot be served
 * (dev with neither a key nor a backend URL). Returning null disables the topo toggle,
 * which is preferable to handing Cesium a template that 404s every tile.
 */
export function resolveTopoTileUrl(env: TopoUrlEnv): string | null {
  // Native is checked before dev: `cap run` against a dev server is still a WebView, so
  // the relative path is just as broken there as in a TestFlight build. An explicit
  // dev backend URL still wins in dev, so a device on the LAN hits the local backend
  // rather than production.
  if (env.isNative) {
    const origin =
      env.nativeApiBaseUrl ||
      (env.isDev ? env.devApiUrl : null) ||
      DEFAULT_NATIVE_API_BASE_URL;
    return joinOrigin(origin);
  }

  if (env.isDev) {
    const key = env.devLinzKey;
    if (key && key !== PLACEHOLDER_LINZ_KEY) {
      return `https://data.linz.govt.nz/services;key=${key}/tiles/v4/layer=${LINZ_TOPO_LAYER}/EPSG:3857/{z}/{x}/{y}.png`;
    }
    if (env.devApiUrl) return joinOrigin(env.devApiUrl);
    return null;
  }

  // Web production: same-origin proxy through Vercel → Linode backend.
  return TOPO_PROXY_PATH;
}
