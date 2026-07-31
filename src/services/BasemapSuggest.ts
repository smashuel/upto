/**
 * BasemapSuggest — pure viewport → basemap resolution.
 *
 * Kept Cesium-free on purpose: the only inputs are latitude, longitude, and a
 * nullable user choice. This makes auto-switch behaviour trivial to reason
 * about and to unit-test without spinning up a Cesium viewer.
 *
 * Two distinct types, deliberately:
 *
 *   BasemapChoice — what the *user* picked: Satellite or Topo. That is the whole
 *     user-facing vocabulary. Nobody choosing a map wants to name a cartographic
 *     product or a country first.
 *   MapLayer — what actually gets *rendered*, including which regional topo
 *     product. Resolved from the choice plus the viewport, and still what a
 *     TripLink persists (so a saved plan records the real canvas it was drawn on,
 *     and attribution can name the true source).
 *
 * Resolution rules:
 *   - Choice 'topo' → the most specific regional product covering the centre
 *     (NSW > AU > NZ), falling back to satellite outside all coverage. The choice
 *     is never cleared, so panning back into coverage resumes topo.
 *   - Choice 'satellite' → always honoured, no region constraint.
 *   - No choice yet → suggest topo where it exists, else satellite.
 */

// Explicit .ts extension: value import, needed by node --experimental-strip-types.
// Imported from regionBounds rather than the two map services so this stays free of the
// tile-URL plumbing (and its import.meta.env reads) that those modules also carry.
import { isWithinNZBounds, isWithinAuBounds, isWithinNswBounds } from './regionBounds.ts';

/** What actually gets rendered, including the specific regional topo product. */
export type MapLayer = 'satellite' | 'topo-linz' | 'topo-ga' | 'topo-nsw';

/** What the user picks. The entire user-facing basemap vocabulary. */
export type BasemapChoice = 'satellite' | 'topo';

export type TopoLayer = Exclude<MapLayer, 'satellite'>;

/**
 * The most specific topo product covering this point, or null if none does.
 * NSW is checked before AU because it is finer-scale (1:25k vs 1:250k).
 */
export function regionalTopo(lat: number, lng: number): TopoLayer | null {
  if (isWithinNswBounds(lat, lng)) return 'topo-nsw';
  if (isWithinAuBounds(lat, lng)) return 'topo-ga';
  if (isWithinNZBounds(lat, lng)) return 'topo-linz';
  return null;
}

/** What to show when the user has expressed no preference. */
export function suggestBasemap(lat: number, lng: number): MapLayer {
  return regionalTopo(lat, lng) ?? 'satellite';
}

export function resolveBasemap(
  lat: number,
  lng: number,
  choice: BasemapChoice | null,
): MapLayer {
  if (choice === 'satellite') return 'satellite';
  if (choice === 'topo') return regionalTopo(lat, lng) ?? 'satellite';
  return suggestBasemap(lat, lng);
}

/**
 * Migrate a persisted preference. The panel used to offer four products by name and
 * stored whichever was clicked, so existing installs hold 'topo-linz' / 'topo-ga' /
 * 'topo-nsw'. All of them meant "I want topo".
 */
export function choiceFromStored(raw: string | null | undefined): BasemapChoice | null {
  if (!raw) return null;
  if (raw === 'satellite') return 'satellite';
  if (raw === 'topo' || raw === 'topo-linz' || raw === 'topo-ga' || raw === 'topo-nsw') {
    return 'topo';
  }
  return null;
}

/** Recover the choice behind a concrete rendered layer (e.g. a TripLink's plannedBasemap). */
export function choiceFromLayer(layer: MapLayer): BasemapChoice {
  return layer === 'satellite' ? 'satellite' : 'topo';
}
