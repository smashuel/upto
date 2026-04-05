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

export interface CheckIn {
  timestamp: string;       // ISO 8601
  message?: string;
  locationW3w?: string;    // what3words address at check-in time
}

export interface TripLink {
  id: string;
  userId?: string;         // set when creator is logged in
  title: string;
  description: string;
  activityType: ActivityType;
  startDate: string;       // ISO 8601
  expectedReturnTime?: string; // ISO 8601 — used for overdue detection
  location: {
    name: string;
    coordinates: LatLng;
    what3words?: string;
    what3wordsDetails?: What3WordsLocation;
  };
  waypoints: TripWaypoint[];
  emergencyContacts: Contact[];
  shareToken: string;
  status: 'planned' | 'active' | 'completed' | 'overdue';
  createdAt: string;       // ISO 8601
  startedAt?: string;      // ISO 8601 — when creator tapped "Start Trip"
  lastCheckIn?: string;    // ISO 8601 — timestamp of most recent check-in
  overdueSince?: string;   // ISO 8601 — when overdue state was triggered
  checkIns: CheckIn[];
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
