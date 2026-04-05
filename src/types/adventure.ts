import { What3WordsLocation } from './what3words';

// Canonical activity types used across the entire app
export type ActivityType =
  | 'hiking'
  | 'trail-running'
  | 'climbing'
  | 'cycling'
  | 'water-sports'
  | 'winter-sports'
  | 'other';

// Coordinates are always [lat, lng] — never [lng, lat]
export type LatLng = [number, number];

export interface TripLink {
  id: string;
  title: string;
  description: string;
  activityType: ActivityType;
  startDate: string; // ISO 8601 — stored as string in localStorage
  location: {
    name: string;
    coordinates: LatLng;
    what3words?: string;
    what3wordsDetails?: What3WordsLocation;
  };
  waypoints: TripWaypoint[];
  emergencyContacts: Contact[];
  shareToken: string;
  status: 'planned' | 'active' | 'completed';
  createdAt: string; // ISO 8601
}

export interface TripWaypoint {
  name: string;
  coordinates: LatLng;
  elevation?: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
}

// Re-export the old name as an alias during migration so nothing breaks at import time.
// TODO: remove once all consumers use TripLink directly.
export type Adventure = TripLink;
