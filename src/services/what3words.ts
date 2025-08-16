import what3words from '@what3words/api';
import { What3WordsAddress, What3WordsLocation, What3WordsSuggestion } from '../types/what3words';

// Initialize What3words API
// Note: In production, get API key from environment variables
const W3W_API_KEY = import.meta.env.VITE_WHAT3WORDS_API_KEY;

class What3WordsService {
  private api: any;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
  private isApiKeyValid: boolean = false;

  constructor() {
    // Only initialize API if key is provided and not placeholder
    if (W3W_API_KEY && W3W_API_KEY !== 'your_actual_api_key_here' && W3W_API_KEY.length > 10) {
      this.api = what3words(W3W_API_KEY);
      this.isApiKeyValid = true;
    } else {
      console.warn('What3Words API key not configured. Some features will be limited.');
      this.isApiKeyValid = false;
    }
  }

  /**
   * Convert coordinates to what3words address
   */
  async coordinatesToWords(lat: number, lng: number, language: string = 'en'): Promise<What3WordsAddress | null> {
    // Return null gracefully if API key is not valid
    if (!this.isApiKeyValid) {
      console.debug('What3Words API not available - API key not configured');
      return null;
    }

    const cacheKey = `coords_${lat}_${lng}_${language}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_EXPIRY) {
        return cached.data;
      }
    }

    try {
      const response = await this.api.convertTo3wa({
        coordinates: { lat, lng },
        language,
        format: 'json'
      });

      if (response.error) {
        console.error('What3words API error:', response.error);
        // If unauthorized, mark API key as invalid
        if (response.error.code === 401) {
          this.isApiKeyValid = false;
          console.warn('What3Words API key is invalid or expired');
        }
        return null;
      }

      const result: What3WordsAddress = {
        words: response.words,
        map: response.map,
        language: response.language,
        country: response.country,
        square: response.square,
        nearestPlace: response.nearestPlace,
        coordinates: response.coordinates
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error: any) {
      console.debug('What3Words service unavailable:', error.message);
      // Mark API key as invalid on auth errors
      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        this.isApiKeyValid = false;
      }
      return null;
    }
  }

  /**
   * Convert what3words address to coordinates
   */
  async wordsToCoordinates(words: string, language: string = 'en'): Promise<What3WordsLocation | null> {
    // Return null gracefully if API key is not valid
    if (!this.isApiKeyValid) {
      console.debug('What3Words API not available - API key not configured');
      return null;
    }

    const cacheKey = `words_${words}_${language}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_EXPIRY) {
        return cached.data;
      }
    }

    try {
      const response = await this.api.convertToCoordinates({
        words: words.trim(),
        format: 'json'
      });

      if (response.error) {
        console.error('What3words API error:', response.error);
        return null;
      }

      const result: What3WordsLocation = {
        coordinates: response.coordinates,
        words: response.words,
        square: response.square,
        nearestPlace: response.nearestPlace,
        country: response.country
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } catch (error: any) {
      console.debug('What3Words service unavailable:', error.message);
      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        this.isApiKeyValid = false;
      }
      return null;
    }
  }

  /**
   * Get autosuggest suggestions for what3words input
   */
  async getAutoSuggestions(input: string, options?: {
    focus?: { lat: number; lng: number };
    nFocusResults?: number;
    nResults?: number;
    country?: string[];
    language?: string;
  }): Promise<What3WordsSuggestion[]> {
    if (!input || input.length < 3) return [];
    
    // Return empty array gracefully if API key is not valid
    if (!this.isApiKeyValid) {
      console.debug('What3Words API not available - API key not configured');
      return [];
    }

    try {
      const response = await this.api.autosuggest({
        input: input.trim(),
        focus: options?.focus,
        'n-focus-results': options?.nFocusResults || 3,
        'n-results': options?.nResults || 10,
        country: options?.country,
        language: options?.language || 'en',
        format: 'json'
      });

      if (response.error) {
        console.error('What3words autosuggest error:', response.error);
        return [];
      }

      return response.suggestions.map((suggestion: any): What3WordsSuggestion => ({
        words: suggestion.words,
        country: suggestion.country,
        nearestPlace: suggestion.nearestPlace,
        distanceToFocusKm: suggestion.distanceToFocusKm,
        rank: suggestion.rank,
        language: suggestion.language
      }));
    } catch (error: any) {
      console.debug('What3Words service unavailable:', error.message);
      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        this.isApiKeyValid = false;
      }
      return [];
    }
  }

  /**
   * Validate what3words address format
   */
  validateWhat3WordsFormat(input: string): boolean {
    // Basic regex for what3words format: word.word.word
    const w3wRegex = /^[a-zA-Z]+\.[a-zA-Z]+\.[a-zA-Z]+$/;
    return w3wRegex.test(input.trim());
  }

  /**
   * Validate coordinate format (lat, lng)
   */
  validateCoordinateFormat(input: string): { isValid: boolean; coordinates?: { lat: number; lng: number } } {
    const cleanInput = input.trim().replace(/\s+/g, '');
    
    // Try different coordinate formats
    const formats = [
      /^(-?\d+\.?\d*),(-?\d+\.?\d*)$/, // lat,lng
      /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/, // lat lng
    ];

    for (const format of formats) {
      const match = cleanInput.match(format);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        
        // Validate ranges
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { isValid: true, coordinates: { lat, lng } };
        }
      }
    }

    return { isValid: false };
  }

  /**
   * Get current user location and convert to what3words
   */
  async getCurrentLocationWhat3Words(): Promise<What3WordsLocation | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const w3wAddress = await this.coordinatesToWords(latitude, longitude);
          
          if (w3wAddress) {
            resolve({
              coordinates: { lat: latitude, lng: longitude },
              words: w3wAddress.words,
              square: w3wAddress.square,
              nearestPlace: w3wAddress.nearestPlace,
              country: w3wAddress.country
            });
          } else {
            resolve({
              coordinates: { lat: latitude, lng: longitude }
            });
          }
        },
        (error) => {
          console.error('Error getting current location:', error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }

  /**
   * Format what3words address for display
   */
  formatWhat3Words(words: string): string {
    return `///${words}`;
  }

  /**
   * Format what3words address for voice/pronunciation
   */
  formatWhat3WordsForVoice(words: string): string {
    return words.split('.').join(', ');
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if API is available and configured correctly
   */
  async isApiAvailable(): Promise<boolean> {
    if (!this.isApiKeyValid) {
      return false;
    }

    try {
      // Try a simple API call
      const response = await this.api.convertTo3wa({
        coordinates: { lat: 51.521251, lng: -0.203586 },
        format: 'json'
      });
      
      if (response.error) {
        if (response.error.code === 401) {
          this.isApiKeyValid = false;
        }
        return false;
      }
      
      return true;
    } catch (error: any) {
      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        this.isApiKeyValid = false;
      }
      return false;
    }
  }

  /**
   * Get API configuration status
   */
  getApiStatus(): { configured: boolean; available: boolean; message: string } {
    if (!this.isApiKeyValid) {
      return {
        configured: false,
        available: false,
        message: 'What3Words API key is not configured or invalid. Location features will use coordinates only.'
      };
    }

    return {
      configured: true,
      available: true,
      message: 'What3Words API is configured and available.'
    };
  }
}

// Export singleton instance
export const what3wordsService = new What3WordsService();
export default what3wordsService;