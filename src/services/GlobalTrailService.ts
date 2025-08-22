interface TrailSuggestion {
  id: string;
  name: string;
  source: 'trailforks' | 'osm' | 'hiking-project' | 'local';
  confidence: number;
  activityType: string;
  location: {
    name: string;
    coordinates: [number, number];
    bounds?: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
  };
  distance?: number;
  elevationGain?: number;
  difficulty?: string;
  description?: string;
  waypoints?: Array<{
    name: string;
    coordinates: [number, number];
    elevation?: number;
  }>;
  metadata?: {
    verified: boolean;
    lastUpdated: Date;
    userRating?: number;
    tags?: string[];
  };
}

interface RouteQuery {
  title: string;
  activityType: string;
  location?: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

interface ConfidenceFactors {
  exact_name_match: number;
  partial_name_match: number;
  activity_type_match: number;
  location_proximity: number;
  difficulty_similarity: number;
  distance_similarity: number;
}

class GlobalTrailService {
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly MAX_SUGGESTIONS = 5;
  private readonly REQUEST_TIMEOUT = 25000;

  private readonly confidenceFactors: ConfidenceFactors = {
    exact_name_match: 0.9,
    partial_name_match: 0.6,
    activity_type_match: 0.8,
    location_proximity: 0.7,
    difficulty_similarity: 0.5,
    distance_similarity: 0.4
  };

  async suggestRoute(query: RouteQuery): Promise<TrailSuggestion[]> {
    try {
      // Execute parallel searches across multiple data sources
      const searchPromises = [
        this.searchTrailforks(query),
        this.searchOSMOverpass(query),
        this.searchHikingProject(query), // US coverage only
        this.searchLocalDatabase(query)
      ];

      const results = await Promise.allSettled(searchPromises);
      const allSuggestions: TrailSuggestion[] = [];

      // Collect successful results
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          allSuggestions.push(...result.value);
        }
      });

      // Consolidate and rank results
      return this.consolidateAndRankResults(allSuggestions, query);
    } catch (error) {
      console.error('Error in route suggestion:', error);
      return [];
    }
  }

  private async searchTrailforks(query: RouteQuery): Promise<TrailSuggestion[]> {
    try {
      // Note: This would require actual Trailforks API credentials in production
      // const requestBody = {
      //   filter: {
      //     title: query.title,
      //     activity: this.mapActivityTypeToTrailforks(query.activityType)
      //   },
      //   bounds: query.bounds || (query.location ? this.locationToBounds(query.location) : null)
      // };

      // For now, return mock data that follows the API structure
      return this.createMockTrailforksResults(query);
    } catch (error) {
      console.error('Trailforks search error:', error);
      return [];
    }
  }

  private async searchOSMOverpass(query: RouteQuery): Promise<TrailSuggestion[]> {
    try {
      const overpassQuery = this.buildOverpassQuery(query);
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: overpassQuery,
        signal: AbortSignal.timeout(this.REQUEST_TIMEOUT)
      });

      if (!response.ok) {
        throw new Error(`OSM Overpass API error: ${response.status}`);
      }

      const data = await response.json();
      return this.processOSMResults(data, query);
    } catch (error) {
      console.error('OSM Overpass search error:', error);
      // Return mock data for development
      return this.createMockOSMResults(query);
    }
  }

  private async searchHikingProject(query: RouteQuery): Promise<TrailSuggestion[]> {
    try {
      // Hiking Project API only covers US, Canada, Puerto Rico
      if (!this.isUSRegion(query.location)) {
        return [];
      }

      // For now, return mock data
      return this.createMockHikingProjectResults(query);
    } catch (error) {
      console.error('Hiking Project search error:', error);
      return [];
    }
  }

  private async searchLocalDatabase(query: RouteQuery): Promise<TrailSuggestion[]> {
    // Search user-generated content and cached results
    const cached = localStorage.getItem('trailSuggestions');
    if (cached) {
      const suggestions: TrailSuggestion[] = JSON.parse(cached);
      return suggestions.filter(s => 
        this.calculateConfidence(query, s) > this.CONFIDENCE_THRESHOLD
      );
    }
    return [];
  }

  private buildOverpassQuery(query: RouteQuery): string {
    const activityTags = this.getOSMActivityTags(query.activityType);
    const titlePattern = query.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special regex chars
    
    return `
      [out:json][timeout:25];
      (
        ${activityTags.map(tag => 
          `way["${tag.key}"${tag.value ? `="${tag.value}"` : ''}]["name"~"${titlePattern}",i];`
        ).join('\n        ')}
      );
      out geom;
    `;
  }

  private getOSMActivityTags(activityType: string): Array<{key: string, value?: string}> {
    const tagMap: Record<string, Array<{key: string, value?: string}>> = {
      'hiking': [
        { key: 'route', value: 'hiking' },
        { key: 'highway', value: 'path' },
        { key: 'highway', value: 'footway' },
        { key: 'sac_scale' }
      ],
      'cycling': [
        { key: 'route', value: 'bicycle' },
        { key: 'highway', value: 'cycleway' }
      ],
      'winter-sports': [
        { key: 'piste:type' },
        { key: 'route', value: 'ski' }
      ],
      'trail-running': [
        { key: 'route', value: 'hiking' },
        { key: 'highway', value: 'path' }
      ]
    };

    return tagMap[activityType] || tagMap['hiking'];
  }

  private processOSMResults(data: any, query: RouteQuery): TrailSuggestion[] {
    if (!data.elements || !Array.isArray(data.elements)) {
      return [];
    }

    return data.elements
      .filter((element: any) => element.tags?.name)
      .map((element: any) => {
        const coordinates = this.extractOSMCoordinates(element);
        
        const suggestion: TrailSuggestion = {
          id: `osm-${element.id}`,
          name: element.tags.name,
          source: 'osm',
          confidence: this.calculateConfidence(query, {
            name: element.tags.name,
            activityType: query.activityType,
            location: { coordinates }
          } as any),
          activityType: query.activityType,
          location: {
            name: element.tags.name,
            coordinates: coordinates
          },
          distance: element.tags.distance ? parseFloat(element.tags.distance) : undefined,
          difficulty: element.tags.sac_scale || element.tags.difficulty,
          description: element.tags.description,
          metadata: {
            verified: false,
            lastUpdated: new Date(),
            tags: Object.keys(element.tags)
          }
        };

        if (element.geometry && element.geometry.length > 1) {
          suggestion.waypoints = element.geometry.map((point: any, index: number) => ({
            name: `Point ${index + 1}`,
            coordinates: [point.lat, point.lon] as [number, number]
          }));
        }

        return suggestion;
      })
      .filter((suggestion: TrailSuggestion) => suggestion.confidence > this.CONFIDENCE_THRESHOLD);
  }

  private extractOSMCoordinates(element: any): [number, number] {
    if (element.geometry && element.geometry.length > 0) {
      const firstPoint = element.geometry[0];
      return [firstPoint.lat, firstPoint.lon];
    }
    return [element.lat || 0, element.lon || 0];
  }

  private calculateConfidence(query: RouteQuery, candidate: Partial<TrailSuggestion>): number {
    let score = 0;
    let factorCount = 0;

    // Name similarity using fuzzy matching
    if (candidate.name && query.title) {
      const nameScore = this.fuzzyMatch(query.title.toLowerCase(), candidate.name.toLowerCase());
      if (nameScore > 0.8) {
        score += this.confidenceFactors.exact_name_match;
      } else if (nameScore > 0.5) {
        score += this.confidenceFactors.partial_name_match;
      }
      factorCount++;
    }

    // Activity type match
    if (candidate.activityType === query.activityType) {
      score += this.confidenceFactors.activity_type_match;
    }
    factorCount++;

    // Location proximity (if available)
    if (query.location && candidate.location) {
      const locationScore = this.calculateLocationProximity(query.location, candidate.location.name);
      score += locationScore * this.confidenceFactors.location_proximity;
      factorCount++;
    }

    return factorCount > 0 ? score / factorCount : 0;
  }

  private fuzzyMatch(str1: string, str2: string): number {
    // Simple Levenshtein distance based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private calculateLocationProximity(queryLocation: string, candidateLocation: string): number {
    // Simple string similarity for location matching
    return this.fuzzyMatch(queryLocation.toLowerCase(), candidateLocation.toLowerCase());
  }

  private consolidateAndRankResults(suggestions: TrailSuggestion[], _query: RouteQuery): TrailSuggestion[] {
    // Remove duplicates based on name and coordinates
    const uniqueSuggestions = this.removeDuplicates(suggestions);
    
    // Sort by confidence score (highest first)
    const ranked = uniqueSuggestions.sort((a, b) => b.confidence - a.confidence);
    
    // Return top suggestions
    return ranked.slice(0, this.MAX_SUGGESTIONS);
  }

  private removeDuplicates(suggestions: TrailSuggestion[]): TrailSuggestion[] {
    const seen = new Set<string>();
    return suggestions.filter(suggestion => {
      const key = `${suggestion.name}-${suggestion.location.coordinates.join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Utility methods (commented out for now, will be used when real APIs are integrated)
  // private mapActivityTypeToTrailforks(activityType: string): string {
  //   const mapping: Record<string, string> = {
  //     'hiking': 'hiking',
  //     'cycling': 'mountain-biking',
  //     'trail-running': 'trail-running',
  //     'winter-sports': 'skiing',
  //     'climbing': 'mountaineering'
  //   };
  //   return mapping[activityType] || 'hiking';
  // }

  // private locationToBounds(_location: string): any {
  //   // This would integrate with a geocoding service in production
  //   // For now, return mock bounds
  //   return {
  //     north: 45.0,
  //     south: 44.0,
  //     east: -121.0,
  //     west: -122.0
  //   };
  // }

  private isUSRegion(location?: string): boolean {
    if (!location) return false;
    const usKeywords = ['usa', 'united states', 'america', 'us', 'california', 'oregon', 'washington'];
    return usKeywords.some(keyword => location.toLowerCase().includes(keyword));
  }

  // Mock data creation methods for development
  private createMockTrailforksResults(query: RouteQuery): TrailSuggestion[] {
    const mockSuggestions: TrailSuggestion[] = [
      {
        id: 'tf-mock-1',
        name: `${query.title} Trail`,
        source: 'trailforks',
        confidence: 0.85,
        activityType: query.activityType,
        location: {
          name: 'Mock Location',
          coordinates: [44.5, -121.5]
        },
        distance: 12.5,
        elevationGain: 800,
        difficulty: 'moderate',
        description: `A popular ${query.activityType} trail with stunning views`,
        metadata: {
          verified: true,
          lastUpdated: new Date(),
          userRating: 4.2,
          tags: ['scenic', 'moderate', 'popular']
        }
      }
    ];

    return mockSuggestions.filter(s => s.confidence > this.CONFIDENCE_THRESHOLD);
  }

  private createMockOSMResults(query: RouteQuery): TrailSuggestion[] {
    return [
      {
        id: 'osm-mock-1',
        name: `${query.title} Path`,
        source: 'osm',
        confidence: 0.75,
        activityType: query.activityType,
        location: {
          name: 'OSM Location',
          coordinates: [44.6, -121.6]
        },
        metadata: {
          verified: false,
          lastUpdated: new Date()
        }
      }
    ];
  }

  private createMockHikingProjectResults(query: RouteQuery): TrailSuggestion[] {
    return [
      {
        id: 'hp-mock-1',
        name: `${query.title} Hike`,
        source: 'hiking-project',
        confidence: 0.8,
        activityType: query.activityType,
        location: {
          name: 'Hiking Project Location',
          coordinates: [44.7, -121.7]
        },
        distance: 8.2,
        elevationGain: 600,
        difficulty: 'moderate',
        description: 'Well-maintained trail with excellent facilities',
        metadata: {
          verified: true,
          lastUpdated: new Date(),
          userRating: 4.5
        }
      }
    ];
  }
}

export { GlobalTrailService, type TrailSuggestion, type RouteQuery };