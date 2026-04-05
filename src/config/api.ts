/* eslint-disable @typescript-eslint/no-explicit-any */
// API Base URL — reads from env vars so localhost vs Linode can be toggled in .env
// VITE_DEV_API_URL overrides in dev; VITE_API_BASE_URL is used in production builds
const isDevelopment = import.meta.env.MODE === 'development' || import.meta.env.DEV;

const API_BASE_URL = isDevelopment
  ? (import.meta.env.VITE_DEV_API_URL || 'http://localhost:3001')
  : (import.meta.env.VITE_API_BASE_URL || 'http://172.105.178.48');

// API Configuration
export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  TIMEOUT: 10000, // 10 seconds

  ENDPOINTS: {
    HEALTH: '/api/health',
    TRAILS_SEARCH: '/api/trails/search',
    ADVENTURES: '/api/adventures',
    ADVENTURE_BY_ID: (id: string) => `/api/adventures/${id}`,
    DOC_TRACKS: '/api/doc/tracks',
    DOC_HUTS: '/api/doc/huts',
    DOC_CAMPSITES: '/api/doc/campsites',
    DOC_ALERTS: '/api/doc/alerts',
    DOC_NEARBY: '/api/doc/nearby',
    // TripLink endpoints
    TRIPLINKS: '/api/triplinks',
    TRIPLINK: (token: string) => `/api/triplinks/${token}`,
    TRIPLINK_START: (token: string) => `/api/triplinks/${token}/start`,
    TRIPLINK_CHECKIN: (token: string) => `/api/triplinks/${token}/checkin`,
    TRIPLINK_COMPLETE: (token: string) => `/api/triplinks/${token}/complete`,
    TRIPLINK_EVENTS: (token: string) => `/api/triplinks/${token}/events`,
    // Auth endpoints
    AUTH_REGISTER: '/api/auth/register',
    AUTH_LOGIN: '/api/auth/login',
    AUTH_ME: '/api/auth/me',
    AUTH_LOGOUT: '/api/auth/logout',
    // Contacts endpoints
    CONTACTS: '/api/contacts',
    CONTACT: (id: number) => `/api/contacts/${id}`,
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

  async getDocAlerts(region?: string) {
    const params = region ? `?region=${encodeURIComponent(region)}` : '';
    return this.get(`${API_CONFIG.ENDPOINTS.DOC_ALERTS}${params}`);
  }

  async getDocNearby(lat: number, lng: number, radius: number = 20) {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString()
    });
    return this.get(`${API_CONFIG.ENDPOINTS.DOC_NEARBY}?${params}`);
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
  },

  async docAlerts(region?: string) {
    const params = region ? `?region=${encodeURIComponent(region)}` : '';
    const response = await fetch(`${API_BASE_URL}/api/doc/alerts${params}`);
    if (!response.ok) throw new Error('DOC alerts fetch failed');
    return response.json();
  },

  async docNearby(lat: number, lng: number, radius: number = 20) {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString()
    });
    const response = await fetch(`${API_BASE_URL}/api/doc/nearby?${params}`);
    if (!response.ok) throw new Error('DOC nearby fetch failed');
    return response.json();
  },

  // ── TripLink API ──────────────────────────────────────────────────────────

  async createTripLink(tripLink: any): Promise<{ id: string; shareToken: string }> {
    const response = await fetch(`${API_BASE_URL}/api/triplinks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tripLink),
    });
    if (!response.ok) throw new Error('Failed to create TripLink');
    return response.json();
  },

  async getTripLink(shareToken: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/triplinks/${shareToken}`);
    if (!response.ok) throw new Error('TripLink not found');
    return response.json();
  },

  async startTrip(shareToken: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/triplinks/${shareToken}/start`, {
      method: 'PATCH',
    });
    if (!response.ok) throw new Error('Failed to start trip');
  },

  async checkIn(shareToken: string, data: { message?: string; locationW3w?: string } = {}): Promise<{ timestamp: string }> {
    const response = await fetch(`${API_BASE_URL}/api/triplinks/${shareToken}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to record check-in');
    return response.json();
  },

  async completeTrip(shareToken: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/triplinks/${shareToken}/complete`, {
      method: 'PATCH',
    });
    if (!response.ok) throw new Error('Failed to complete trip');
  },

  /**
   * Subscribe to server-sent events for a TripLink.
   * Returns the EventSource so the caller can close it on unmount.
   */
  subscribeToEvents(
    shareToken: string,
    handlers: {
      onStatus?: (data: any) => void;
      onCheckin?: (data: any) => void;
      onOverdue?: (data: any) => void;
    }
  ): EventSource {
    const url = `${API_BASE_URL}/api/triplinks/${shareToken}/events`;
    const es = new EventSource(url);

    if (handlers.onStatus)  es.addEventListener('status',  (e: MessageEvent) => handlers.onStatus!(JSON.parse(e.data)));
    if (handlers.onCheckin) es.addEventListener('checkin', (e: MessageEvent) => handlers.onCheckin!(JSON.parse(e.data)));
    if (handlers.onOverdue) es.addEventListener('overdue', (e: MessageEvent) => handlers.onOverdue!(JSON.parse(e.data)));

    return es;
  },

  // ── Auth API ──────────────────────────────────────────────────────────────

  async register(email: string, name: string, password: string): Promise<{ sessionToken: string; user: { id: string; email: string; name: string } }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Registration failed');
    return data;
  },

  async login(email: string, password: string): Promise<{ sessionToken: string; user: { id: string; email: string; name: string } }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');
    return data;
  },

  async getMe(sessionToken: string): Promise<{ id: string; email: string; name: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    if (!response.ok) throw new Error('Session invalid');
    const data = await response.json();
    return data.user;
  },

  async logout(sessionToken: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
  },

  // ── Contacts API ──────────────────────────────────────────────────────────

  async getContacts(sessionToken: string): Promise<SavedContact[]> {
    const response = await fetch(`${API_BASE_URL}/api/contacts`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return response.json();
  },

  async createContact(sessionToken: string, contact: Omit<SavedContact, 'id' | 'created_at'>): Promise<SavedContact> {
    const response = await fetch(`${API_BASE_URL}/api/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify(contact),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create contact');
    return data;
  },

  async updateContact(sessionToken: string, id: number, updates: Partial<SavedContact>): Promise<SavedContact> {
    const response = await fetch(`${API_BASE_URL}/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify(updates),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update contact');
    return data;
  },

  async deleteContact(sessionToken: string, id: number): Promise<void> {
    await fetch(`${API_BASE_URL}/api/contacts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
  },
};

// ── Shared types exposed from api.ts ─────────────────────────────────────────

export interface SavedContact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  relationship?: string;
  is_favourite: boolean;
  created_at?: string;
}