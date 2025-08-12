import { Contact } from './adventure';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  emergencyContacts: Contact[];
  preferences: {
    defaultCheckInInterval: number;
    notificationMethods: ('email' | 'sms')[];
  };
  createdAt: Date;
}