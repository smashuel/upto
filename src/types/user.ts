import { Contact } from './adventure';
import type { PowerMode } from '../utils/sampleCadence';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  emergencyContacts: Contact[];
  preferences: {
    defaultCheckInInterval: number;
    notificationMethods: ('email' | 'sms')[];
    /**
     * Live-location sampling power mode (Stage 2 Slice 3). Feeds resolveSampleCadence.
     * Absent/legacy → treated as 'adaptive'. Profile-page toggle + backend persistence are the
     * remaining Slice-3 wiring; the pure cadence seam consumes this today.
     */
    powerMode?: PowerMode;
  };
  createdAt: Date;
}