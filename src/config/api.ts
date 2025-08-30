// Environment detection for Vercel deployment
const isDevelopment = import.meta.env.MODE === 'development' || import.meta.env.DEV;

// API Base URL Configuration
const API_BASE_URL = isDevelopment
  ? 'http://localhost:3001'       // Local development - direct to backend
  : 'http://172.105.178.48';      // Production - port 80 via Nginx

// API Configuration
export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  TIMEOUT: 10000, // 10 seconds
  
  ENDPOINTS: {
    HEALTH: '/api/health',
    TRAILS_SEARCH: '/api/trails/search',
    ADVENTURES: '/api/adventures',
    ADVENTURE_BY_ID: (id: string) => `/api/adventures/${id}`,
  }
};

// API client with error handling
export class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = API_CONFIG.BASE_URL;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get(API_CONFIG.ENDPOINTS.HEALTH);
      return true;
    } catch (error) {
      console.error('Backend connection test failed:', error);
      return false;
    }
  }

  async healthCheck() {
    const response = await this.get(API_CONFIG.ENDPOINTS.HEALTH);
    return response;
  }

  async searchTrails(title: string, type: string, location?: string) {
    const params = new URLSearchParams({ 
      title, 
      type, 
      ...(location && { location }) 
    });
    const response = await this.get(`${API_CONFIG.ENDPOINTS.TRAILS_SEARCH}?${params}`);
    return response;
  }

  async createAdventure(adventureData: any) {
    return this.post(API_CONFIG.ENDPOINTS.ADVENTURES, adventureData);
  }

  async getAdventure(id: string) {
    return this.get(API_CONFIG.ENDPOINTS.ADVENTURE_BY_ID(id));
  }
}

export const apiClient = new ApiClient();

// Simplified API object for easy usage
export const api = {
  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },

  async searchTrails(title: string, type: string, location?: string) {
    const params = new URLSearchParams({ 
      title, 
      type, 
      ...(location && { location }) 
    });
    const response = await fetch(`${API_BASE_URL}/api/trails/search?${params}`);
    if (!response.ok) throw new Error('Trail search failed');
    return response.json();
  },

  async createAdventure(adventureData: any) {
    const response = await fetch(`${API_BASE_URL}/api/adventures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adventureData),
    });
    if (!response.ok) throw new Error('Adventure creation failed');
    return response.json();
  },

  async getAdventure(id: string) {
    const response = await fetch(`${API_BASE_URL}/api/adventures/${id}`);
    if (!response.ok) throw new Error('Adventure fetch failed');
    return response.json();
  }
};