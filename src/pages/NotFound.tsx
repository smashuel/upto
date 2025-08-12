import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import { Home, Mountain } from 'lucide-react';

export const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="flex justify-center mb-8">
          <Mountain className="h-24 w-24 text-adventure-600" />
        </div>
        
        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Adventure Not Found</h2>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          Looks like you've wandered off the trail. The page you're looking for doesn't exist.
        </p>
        
        <Link to="/">
          <Button icon={Home} size="lg">
            Return Home
          </Button>
        </Link>
      </div>
    </div>
  );
};