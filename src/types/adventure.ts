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
  lat?: number;            // check-in coordinates, when the device shared location
  lng?: number;
}

// A drawn route persisted on the TripLink. Structurally matches TrackDrawer's
// SerializableTrack (kept here so types don't depend on the services layer).
export interface TripRoute {
  id: string;
  name: string;
  waypoints: Array<{ coordinates: LatLng; elevation: number }>;
  metadata: {
    distance: number;
    elevationGain: number;
    elevationLoss: number;
    difficulty?: string;
    activityType: string;
    created: string;
  };
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
  routes?: TripRoute[];    // drawn routes — rendered read-only on the view pages
  emergencyContacts: Contact[];
  shareToken: string;
  status: 'planned' | 'active' | 'completed' | 'overdue';
  createdAt: string;       // ISO 8601
  startedAt?: string;      // ISO 8601 — when creator tapped "Start Trip"
  lastCheckIn?: string;    // ISO 8601 — timestamp of most recent check-in
  overdueSince?: string;   // ISO 8601 — when overdue state was triggered
  checkIns: CheckIn[];
  // Last-known live position while the traveller has an active trip page open (Stage 1,
  // foreground-web). Last-known only — not a breadcrumb history. See brain/plans/live-location.md.
  livePosition?: {
    lat: number;
    lng: number;
    timestamp: string;     // ISO 8601 — when the fix was taken
    accuracy?: number;     // metres, when the device reports it
    // 'unavailable' marks the last signal as a stop beacon (permission denied / tab closed):
    // the coords are retained as last-known, but must not be presented as current.
    sharing?: 'live' | 'unavailable';
  };
  // Per-trip live-location privacy (Slice 03). Absent is treated as 'with-trip'.
  liveSharing?: 'with-trip' | 'owner-only' | 'off';
  // Basemap the planner drew the route on (Slice 04) — the view page opens on this
  // instead of a default world view. Mirrors `MapLayer` in services/BasemapSuggest
  // (kept inline so types don't depend on the services layer). Absent → view page
  // falls back to viewport auto-resolve.
  plannedBasemap?: 'satellite' | 'topo-linz' | 'topo-ga' | 'topo-nsw';
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
  // Snapshotted from the account's contacts.is_emergency at TripLink save time.
  // Drives who gets the overdue SMS (emergency-circle only). Ad-hoc contacts
  // added during the wizard default to false.
  isEmergency?: boolean;
  // The account-level contact id this snapshot was derived from, when applicable.
  savedContactId?: number;
}

// Re-export the old name as an alias during migration so nothing breaks at import time.
// TODO: remove once all consumers use TripLink directly.
export type Adventure = TripLink;
