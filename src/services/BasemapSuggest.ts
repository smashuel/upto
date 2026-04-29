/**
 * BasemapSuggest — pure viewport → basemap resolution.
 *
 * Kept Cesium-free on purpose: the only inputs are latitude, longitude, and a
 * nullable user override. This makes auto-switch behaviour trivial to reason
 * about and to unit-test without spinning up a Cesium viewer.
 *
 * Resolution rules:
 *   - No override → pick the most specific region that contains the centre
 *     (NSW > AU > NZ > satellite).
 *   - Override is 'satellite' → always honoured (no region constraint).
 *   - Override is a topo layer → honoured only while the centre is still
 *     inside that layer's native region; otherwise fall through to the
 *     auto suggestion. The override is *not* cleared — panning back in
 *     resumes the user's preference.
 */

import { isWithinNZBounds } from './LinzMapService';
import { isWithinAuBounds, isWithinNswBounds } from './AusMapService';

export type MapLayer = 'satellite' | 'topo-linz' | 'topo-ga' | 'topo-nsw';

export function suggestBasemap(lat: number, lng: number): MapLayer {
  if (isWithinNswBounds(lat, lng)) return 'topo-nsw';
  if (isWithinAuBounds(lat, lng)) return 'topo-ga';
  if (isWithinNZBounds(lat, lng)) return 'topo-linz';
  return 'satellite';
}

export function resolveBasemap(
  lat: number,
  lng: number,
  override: MapLayer | null,
): MapLayer {
  if (!override) return suggestBasemap(lat, lng);
  if (override === 'satellite') return 'satellite';
  if (override === 'topo-linz' && !isWithinNZBounds(lat, lng)) return suggestBasemap(lat, lng);
  if (override === 'topo-ga' && !isWithinAuBounds(lat, lng)) return suggestBasemap(lat, lng);
  if (override === 'topo-nsw' && !isWithinNswBounds(lat, lng)) return suggestBasemap(lat, lng);
  return override;
}
