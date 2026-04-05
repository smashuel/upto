import type { LatLng } from '../types/adventure';

export interface TrailSuggestion {
  id: string;
  name: string;
  source: 'osm' | 'doc';
  confidence: number;
  activityType: string;
  location: {
    name: string;
    coordinates: LatLng;
  };
  distance?: number;
  elevationGain?: number;
  difficulty?: string;
  description?: string;
  waypoints?: Array<{ name: string; coordinates: LatLng }>;
}

export interface RouteQuery {
  title: string;
  activityType: string;
  location?: string;
  bounds?: { north: number; south: number; east: number; west: number };
  autoExtractLocation?: boolean;
}

const NZ_BOUNDS = { minLat: -47, maxLat: -34, minLng: 166, maxLng: 178 };
const REQUEST_TIMEOUT = 25000;
const MAX_SUGGESTIONS = 5;
const CONFIDENCE_THRESHOLD = 0.3;

// Shared fuzzy matching used by both OSM and DOC result processors
function fuzzyScore(query: string, candidate: string): number {
  const a = query.toLowerCase();
  const b = candidate.toLowerCase();
  if (a === b) return 1.0;
  if (b.includes(a) || a.includes(b)) return 0.75;

  // Levenshtein distance
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;

  const matrix: number[][] = Array.from({ length: shorter.length + 1 }, (_, i) =>
    Array.from({ length: longer.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  return (longer.length - matrix[shorter.length][longer.length]) / longer.length;
}

function isNZQuery(query: RouteQuery): boolean {
  if (query.bounds) {
    return !(
      query.bounds.south > NZ_BOUNDS.maxLat ||
      query.bounds.north < NZ_BOUNDS.minLat ||
      query.bounds.east < NZ_BOUNDS.minLng ||
      query.bounds.west > NZ_BOUNDS.maxLng
    );
  }
  if (query.location) {
    const loc = query.location.toLowerCase();
    return loc.includes('new zealand') || loc.includes(' nz') || loc.endsWith('nz');
  }
  return false;
}

function getOSMTags(activityType: string): Array<{ key: string; value?: string }> {
  const tagMap: Record<string, Array<{ key: string; value?: string }>> = {
    hiking: [{ key: 'route', value: 'hiking' }, { key: 'highway', value: 'path' }, { key: 'sac_scale' }],
    'trail-running': [{ key: 'route', value: 'hiking' }, { key: 'highway', value: 'path' }],
    cycling: [{ key: 'route', value: 'bicycle' }, { key: 'highway', value: 'cycleway' }],
    'winter-sports': [{ key: 'piste:type' }, { key: 'route', value: 'ski' }],
  };
  return tagMap[activityType] || tagMap.hiking;
}

async function searchOSM(query: RouteQuery): Promise<TrailSuggestion[]> {
  if (!query.bounds) return [];

  const { south, west, north, east } = query.bounds;
  const bbox = `(${south},${west},${north},${east})`;
  const titlePattern = query.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tags = getOSMTags(query.activityType);

  const overpassQuery = `
    [out:json][timeout:25];
    (
      ${tags.map(t => `way${bbox}["${t.key}"${t.value ? `="${t.value}"` : ''}]["name"~"${titlePattern}",i];`).join('\n      ')}
    );
    out geom;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: overpassQuery,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) throw new Error(`OSM Overpass ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data.elements)) return [];

  interface OsmElement { id: number; lat?: number; lon?: number; tags: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }

  return (data.elements as OsmElement[])
    .filter(el => el.tags?.name)
    .map((el): TrailSuggestion => {
      const coords: LatLng = el.geometry && el.geometry.length > 0
        ? [el.geometry[0].lat, el.geometry[0].lon]
        : [el.lat ?? 0, el.lon ?? 0];

      const waypoints = el.geometry && el.geometry.length > 1
        ? el.geometry.map((pt, i) => ({ name: `Point ${i + 1}`, coordinates: [pt.lat, pt.lon] as LatLng }))
        : undefined;

      return {
        id: `osm-${el.id}`,
        name: el.tags.name,
        source: 'osm',
        confidence: fuzzyScore(query.title, el.tags.name),
        activityType: query.activityType,
        location: { name: el.tags.name, coordinates: coords },
        distance: el.tags.distance ? parseFloat(el.tags.distance) : undefined,
        difficulty: el.tags.sac_scale || el.tags.difficulty,
        description: el.tags.description,
        waypoints,
      };
    })
    .filter((s: TrailSuggestion) => s.confidence > CONFIDENCE_THRESHOLD);
}

async function searchDOC(query: RouteQuery): Promise<TrailSuggestion[]> {
  if (!isNZQuery(query)) return [];

  const { API_CONFIG } = await import('../config/api');
  const params = new URLSearchParams({ name: query.title });
  const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DOC_TRACKS}?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) throw new Error(`DOC API ${response.status}`);

  const data = await response.json();
  interface DocTrack { assetId?: string; id?: string; name: string; lat?: number; lng?: number; lineWgs84?: number[][]; region?: string | string[]; distance?: string; dificulty?: string; introductory?: string }
  const tracks: DocTrack[] = data.data || [];

  return tracks
    .map((track): TrailSuggestion => {
      const coordinates: LatLng = track.lat && track.lng ? [track.lat, track.lng] : [0, 0];
      const waypoints = (track.lineWgs84 || [])
        .slice(0, 10)
        .map((pt: number[], i: number) => ({ name: `Point ${i + 1}`, coordinates: [pt[0], pt[1]] as LatLng }));

      const regionName = Array.isArray(track.region)
        ? track.region.join(', ')
        : (track.region || 'New Zealand');

      return {
        id: `doc-${track.assetId || track.id}`,
        name: track.name,
        source: 'doc',
        confidence: fuzzyScore(query.title, track.name),
        activityType: query.activityType,
        location: { name: regionName, coordinates },
        distance: track.distance ? parseFloat(track.distance) : undefined,
        difficulty: track.dificulty, // DOC API typo — intentional
        description: track.introductory,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
      };
    })
    .filter(s => s.confidence > CONFIDENCE_THRESHOLD);
}

export class GlobalTrailService {
  async suggestRoute(query: RouteQuery): Promise<TrailSuggestion[]> {
    let enhancedQuery = { ...query };

    // Auto-extract location from title via Nominatim if requested and no bounds given
    if (query.autoExtractLocation && query.title && !query.bounds) {
      try {
        const { NominatimGeocoder } = await import('./NominatimGeocoder');
        const geocoder = new NominatimGeocoder();
        const extraction = geocoder.extractLocationFromTitle(query.title);

        if (extraction.locationName && extraction.confidence > 0.4) {
          const results = await geocoder.geocode(extraction.locationName, query.activityType);
          if (results.length > 0) {
            enhancedQuery.location = results[0].displayName;
            enhancedQuery.bounds = geocoder.expandBounds(results[0].bounds, 25);
          }
        }
      } catch {
        // Location extraction is best-effort
      }
    }

    const [osmResults, docResults] = await Promise.allSettled([
      searchOSM(enhancedQuery),
      searchDOC(enhancedQuery),
    ]);

    const all: TrailSuggestion[] = [
      ...(osmResults.status === 'fulfilled' ? osmResults.value : []),
      ...(docResults.status === 'fulfilled' ? docResults.value : []),
    ];

    // Deduplicate by name+coords, sort by confidence, return top N
    const seen = new Set<string>();
    return all
      .filter(s => {
        const key = `${s.name}-${s.location.coordinates.join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SUGGESTIONS);
  }
}
