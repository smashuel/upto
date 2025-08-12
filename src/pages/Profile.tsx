import React from 'react';
import { Card, Button, Input } from '../components/ui';
import { User, Settings } from 'lucide-react';

export const Profile: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
        <p className="text-gray-600">Manage your account settings and emergency contacts.</p>
      </div>

      <div className="space-y-6">
        {/* Personal Information */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
            <User className="h-5 w-5 mr-2 text-adventure-600" />
            Personal Information
          </h2>
          
          <div className="space-y-4">
            <Input
              label="Full Name"
              placeholder="Your full name"
              defaultValue="Adventure User"
            />
            
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                placeholder="your@email.com"
                defaultValue="user@example.com"
              />
              
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+1 (555) 123-4567"
                defaultValue="+1 (555) 123-4567"
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end">
            <Button>Save Changes</Button>
          </div>
        </Card>

        {/* Safety Preferences */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
            <Settings className="h-5 w-5 mr-2 text-adventure-600" />
            Safety Preferences
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Check-in Interval
              </label>
              <select className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                <option value={6}>Every 6 hours</option>
                <option value={12}>Every 12 hours</option>
                <option value={24} selected>Every 24 hours</option>
                <option value={48}>Every 48 hours</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Notification Methods
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" defaultChecked />
                  <span className="ml-2 text-sm text-gray-700">Email notifications</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="ml-2 text-sm text-gray-700">SMS notifications</span>
                </label>
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex justify-end">
            <Button>Save Preferences</Button>
          </div>
        </Card>

        {/* Emergency Contacts */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Emergency Contacts</h2>
          
          <div className="text-center py-12 text-gray-500">
            <p className="mb-4">Emergency contact management coming soon!</p>
            <p className="text-sm">This feature will be available in Phase 2.</p>
          </div>
        </Card>
      </div>
    </div>
  );
};