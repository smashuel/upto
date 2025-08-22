import React from 'react';
import { Row, Col } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { MapPin } from 'lucide-react';
import { Input, Card } from '../ui';

export const TripTitleStep: React.FC = () => {
  const { register, watch, formState: { errors } } = useFormContext();
  
  const activityType = watch('activityType');

  // Helper function to get activity type display name
  const getActivityTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      'hiking': 'Hiking',
      'trail-running': 'Trail Running',
      'climbing': 'Climbing',
      'cycling': 'Cycling',
      'water-sports': 'Water Sports',
      'winter-sports': 'Winter Sports',
      'other': 'Other Activity'
    };
    return labels[type] || type;
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">Name Your Trip</h3>
        <p className="text-muted">Give your {getActivityTypeLabel(activityType)?.toLowerCase()} trip a descriptive name</p>
      </div>

      <Row>
        <Col lg={8} className="mx-auto">
          <Card className="text-center">
            {activityType && (
              <div className="mb-4">
                <div className="badge bg-primary bg-opacity-10 text-primary px-3 py-2 mb-3">
                  <MapPin size={16} className="me-2" />
                  {getActivityTypeLabel(activityType)}
                </div>
              </div>
            )}
            
            <h5 className="h6 mb-3">Trip Title</h5>
            
            <Input
              label=""
              placeholder="e.g., Mount Washington Day Hike, Half Dome Trail Run, or Lake District Cycling Tour"
              className="text-center"
              {...register('title', { 
                required: 'Trip title is required',
                minLength: { value: 3, message: 'Title must be at least 3 characters' },
                maxLength: { value: 100, message: 'Title must be less than 100 characters' }
              })}
              error={errors.title?.message as string}
            />

            <div className="form-text text-muted mt-3">
              Choose a name that clearly describes your trip. This will be shared with your emergency contacts.
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};