/**
 * Nominatim Geocoding Service
 *
 * Uses OpenStreetMap's Nominatim API to geocode location names and extract
 * geographic information from trip titles for route suggestion.
 *
 * API: https://nominatim.openstreetmap.org
 * Rate Limit: 1 request/second (enforced by delay)
 * Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
 */

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string]; // [south, north, west, east]
  class: string;
  type: string;
  importance: number;
  address?: {
    country?: string;
    state?: string;
    county?: string;
    city?: string;
    town?: string;
    village?: string;
    peak?: string;
    mountain_pass?: string;
    natural?: string;
  };
}

interface GeocodeResult {
  coordinates: {
    lat: number;
    lng: number;
  };
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  displayName: string;
  confidence: number;
  locationType: string;
  address?: {
    country?: string;
    region?: string;
    locality?: string;
  };
}

interface LocationExtraction {
  locationName: string | null;
  confidence: number;
  source: 'explicit' | 'extracted' | 'none';
}

class NominatimGeocoder {
  private readonly BASE_URL = 'https://nominatim.openstreetmap.org';
  private readonly RATE_LIMIT_MS = 1100; // 1.1 seconds to be safe
  private lastRequestTime = 0;

  // Common outdoor activity location keywords
  private readonly LOCATION_KEYWORDS = [
    'mount', 'mt', 'peak', 'summit', 'mountain', 'ridge', 'pass',
    'trail', 'lake', 'river', 'falls', 'canyon', 'valley', 'gorge',
    'national park', 'state park', 'forest', 'wilderness',
    'range', 'sierra', 'cascades', 'rockies', 'alps', 'highlands'
  ];

  /**
   * Extract potential location name from trip title
   * Examples:
   *   "Mount Washington Summit Trail" -> "Mount Washington"
   *   "Half Dome Day Hike" -> "Half Dome"
   *   "Pacific Crest Trail Section" -> "Pacific Crest Trail"
   */
  extractLocationFromTitle(title: string): LocationExtraction {
    if (!title || title.length < 3) {
      return { locationName: null, confidence: 0, source: 'none' };
    }

    const lowerTitle = title.toLowerCase();
    let locationName: string | null = null;
    let confidence = 0;
    let source: 'explicit' | 'extracted' | 'none' = 'none';

    // Check for explicit location keywords
    for (const keyword of this.LOCATION_KEYWORDS) {
      const keywordIndex = lowerTitle.indexOf(keyword);
      if (keywordIndex !== -1) {
        // Extract the location name around the keyword
        const words = title.split(/\s+/);
        const keywordWords = keyword.split(/\s+/);

        // Find the keyword position in words array
        for (let i = 0; i <= words.length - keywordWords.length; i++) {
          const phrase = words.slice(i, i + keywordWords.length).join(' ').toLowerCase();
          if (phrase === keyword) {
            // Extract 2-3 words around the keyword as location name
            const start = Math.max(0, i - 1);
            const end = Math.min(words.length, i + keywordWords.length + 1);
            locationName = words.slice(start, end).join(' ');
            confidence = 0.8;
            source = 'extracted';
            break;
          }
        }

        if (locationName) break;
      }
    }

    // If no keyword found, check for proper nouns (capitalized words)
    if (!locationName) {
      const capitalizedWords = title
        .split(/\s+/)
        .filter(word => /^[A-Z][a-z]+/.test(word));

      if (capitalizedWords.length >= 2) {
        // Take the first 2-3 capitalized words as potential location
        locationName = capitalizedWords.slice(0, 3).join(' ');
        confidence = 0.5;
        source = 'extracted';
      } else if (capitalizedWords.length === 1) {
        locationName = capitalizedWords[0];
        confidence = 0.3;
        source = 'extracted';
      }
    }

    return { locationName, confidence, source };
  }

  /**
   * Geocode a location name to coordinates and bounds
   */
  async geocode(locationName: string, activityType?: string): Promise<GeocodeResult[]> {
    await this.enforceRateLimit();

    try {
      // Build query with activity-specific class hints
      const classHints = this.getClassHintsForActivity(activityType);

      const params = new URLSearchParams({
        q: locationName,
        format: 'json',
        addressdetails: '1',
        limit: '5',
        'accept-language': 'en',
        ...(classHints && { class: classHints })
      });

      const response = await fetch(
        `${this.BASE_URL}/search?${params.toString()}`,
        {
          headers: {
            'User-Agent': 'Upto-TripPlanning/1.0 (outdoor safety app)'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const data: NominatimResult[] = await response.json();

      return data.map(result => this.transformResult(result));
    } catch (error) {
      console.error('Nominatim geocoding error:', error);
      return [];
    }
  }

  /**
   * Reverse geocode coordinates to location name
   */
  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    await this.enforceRateLimit();

    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lng.toString(),
        format: 'json',
        addressdetails: '1',
        'accept-language': 'en'
      });

      const response = await fetch(
        `${this.BASE_URL}/reverse?${params.toString()}`,
        {
          headers: {
            'User-Agent': 'Upto-TripPlanning/1.0 (outdoor safety app)'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const data: NominatimResult = await response.json();

      return this.transformResult(data);
    } catch (error) {
      console.error('Nominatim reverse geocoding error:', error);
      return null;
    }
  }

  /**
   * Transform Nominatim result to our format
   */
  private transformResult(result: NominatimResult): GeocodeResult {
    const bounds = {
      south: parseFloat(result.boundingbox[0]),
      north: parseFloat(result.boundingbox[1]),
      west: parseFloat(result.boundingbox[2]),
      east: parseFloat(result.boundingbox[3])
    };

    return {
      coordinates: {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      },
      bounds,
      displayName: result.display_name,
      confidence: result.importance,
      locationType: `${result.class}:${result.type}`,
      address: {
        country: result.address?.country,
        region: result.address?.state || result.address?.county,
        locality: result.address?.city || result.address?.town || result.address?.village
      }
    };
  }

  /**
   * Get appropriate OSM class hints based on activity type
   */
  private getClassHintsForActivity(activityType?: string): string | null {
    const classMap: Record<string, string> = {
      'hiking': 'natural,tourism',
      'climbing': 'natural,sport',
      'trail-running': 'natural,highway',
      'cycling': 'highway,natural',
      'winter-sports': 'natural,sport',
      'water-sports': 'natural,waterway'
    };

    return activityType ? classMap[activityType] || null : null;
  }

  /**
   * Enforce rate limiting (1 req/sec for Nominatim)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
      await new Promise(resolve =>
        setTimeout(resolve, this.RATE_LIMIT_MS - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Get bounds expanded by a certain distance (in km)
   */
  expandBounds(
    bounds: { north: number; south: number; east: number; west: number },
    radiusKm: number = 25
  ): { north: number; south: number; east: number; west: number } {
    // Approximate: 1 degree latitude ≈ 111 km
    // Longitude varies by latitude, but we'll use a simple approximation
    const latDelta = radiusKm / 111;
    const avgLat = (bounds.north + bounds.south) / 2;
    const lngDelta = radiusKm / (111 * Math.cos(avgLat * Math.PI / 180));

    return {
      north: bounds.north + latDelta,
      south: bounds.south - latDelta,
      east: bounds.east + lngDelta,
      west: bounds.west - lngDelta
    };
  }
}

export { NominatimGeocoder, type GeocodeResult, type LocationExtraction };
