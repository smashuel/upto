import { What3WordsLocation } from './what3words';

export interface Adventure {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location: {
    name: string;
    coordinates: [number, number]; // [longitude, latitude]
    what3words?: string;
    what3wordsDetails?: What3WordsLocation;
  };
  activities: AdventureActivity[];
  emergencyContacts: Contact[];
  checkInInterval: number; // hours
  status: 'planned' | 'active' | 'completed' | 'overdue' | 'cancelled';
  visibility: 'public' | 'contacts-only' | 'private';
  shareToken: string; // Unique token for sharing
  qrCode?: string; // Base64 QR code data
  checkIns: CheckIn[];
  emergencyInfo?: EmergencyInfo;
  notifications: NotificationSettings;
  createdAt: Date;
  updatedAt: Date;
  lastCheckIn?: Date;
  nextCheckInDue?: Date;
}

export interface AdventureActivity {
  id: string;
  type: 'hiking' | 'climbing' | 'sailing' | 'skiing' | 'cycling' | 'other';
  name: string;
  estimatedDuration: number; // minutes
  difficulty: 'easy' | 'moderate' | 'difficult' | 'extreme';
  equipment: string[];
  route?: {
    waypoints: Array<{
      name: string;
      coordinates: [number, number];
      estimatedTime: Date;
      what3words?: string;
      what3wordsDetails?: What3WordsLocation;
    }>;
  };
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
  notificationPreferences: {
    email: boolean;
    sms: boolean;
    immediateAlerts: boolean;
    dailyUpdates: boolean;
  };
}

export interface CheckIn {
  id: string;
  adventureId: string;
  timestamp: Date;
  location?: {
    coordinates: [number, number];
    accuracy?: number;
    address?: string;
    what3words?: string;
    what3wordsDetails?: What3WordsLocation;
  };
  type: 'manual' | 'automatic' | 'emergency';
  status: 'safe' | 'need-help' | 'emergency';
  message?: string;
  photos?: string[]; // Base64 or URLs
}

export interface EmergencyInfo {
  medicalConditions: string[];
  allergies: string[];
  medications: string[];
  emergencyInstructions: string;
  bloodType?: string;
  emergencyContactPriority: string[]; // Contact IDs in priority order
  localEmergencyNumber?: string;
}

export interface NotificationSettings {
  checkInReminders: boolean;
  emergencyEscalation: boolean;
  adventureUpdates: boolean;
  contactNotifications: boolean;
  escalationTimeHours: number; // How many hours late before escalation
  reminderIntervalMinutes: number; // How often to remind before due
}

export interface ShareableLink {
  token: string;
  adventureId: string;
  createdAt: Date;
  expiresAt?: Date;
  viewCount: number;
  lastAccessed?: Date;
}

export interface AdventureTemplate {
  id: string;
  name: string;
  description: string;
  activityType: string;
  defaultDuration: number; // hours
  defaultCheckInInterval: number; // hours
  defaultDifficulty: 'easy' | 'moderate' | 'difficult' | 'extreme';
  commonEquipment: string[];
  createdAt: Date;
  usageCount: number;
}