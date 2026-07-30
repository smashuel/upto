// Pure classifier behind the on-device map diagnostics panel. There is no Mac in this project's
// toolchain, so a TestFlight build's WKWebView console is unreadable — this turns the Cesium Ion
// token state plus any runtime imagery/terrain errors into a report the traveller can read off
// the screen (or paste into an issue). Kept Cesium-free and clock-free so it's unit-testable.
// See .scratch/native-map-fixes/issues/01-native-cesium-ion-satellite-3d.md.

// Explicit .ts extension: this is a VALUE import, so node's --experimental-strip-types ESM
// resolver needs the real file (type-only imports elsewhere are erased and don't).
import { isUsableIonToken } from './baseImagery.ts';

export type MapHealth = 'ok' | 'no-token' | 'ion-unreachable';

export interface MapDiagnosticsInput {
  token: string | null | undefined;
  /** Message from a failed Ion satellite imagery load, if one occurred. */
  ionImageryError?: string | null;
  /** Message from a failed Ion world-terrain load, if one occurred. */
  terrainError?: string | null;
}

export interface MapDiagnostics {
  health: MapHealth;
  summary: string;
  details: string[];
}

export function describeMapDiagnostics(input: MapDiagnosticsInput): MapDiagnostics {
  const details: string[] = [];

  if (input.ionImageryError) details.push(`Ion imagery: ${input.ionImageryError}`);
  if (input.terrainError) details.push(`Ion terrain: ${input.terrainError}`);

  // No usable key at all — a build/config problem, not a network one. Say so plainly, because
  // the fix ("add VITE_CESIUM_ION_TOKEN to the build") is completely different from a
  // reachability failure, and the map still works (OSM + topo) meanwhile.
  if (!isUsableIonToken(input.token)) {
    return {
      health: 'no-token',
      summary: 'No Cesium Ion token in this build — using OpenStreetMap; 3D terrain is off.',
      details: [...details, 'VITE_CESIUM_ION_TOKEN was missing or a placeholder at build time.'],
    };
  }

  // Token is usable but Ion still didn't load — the reachability case (CORS/scheme/network from
  // this WebView). This is the one on-device diagnosis we otherwise can't see without a Mac.
  if (details.length > 0) {
    return {
      health: 'ion-unreachable',
      summary: 'Cesium Ion token is present but Ion could not be loaded from this device.',
      details,
    };
  }

  return {
    health: 'ok',
    summary: 'Cesium Ion token present; no imagery or terrain errors observed.',
    details,
  };
}
