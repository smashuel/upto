import React from 'react';
import { Row, Col, Form } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { Mountain, MapPin, Bike, Snowflake, Waves } from 'lucide-react';
import { Card, Input } from '../ui';

const ACTIVITY_TYPES = [
  { 
    value: 'hiking', 
    label: 'Hiking', 
    icon: Mountain, 
    description: 'Day hikes, multi-day treks, backpacking',
    color: 'forest' 
  },
  { 
    value: 'trail-running', 
    label: 'Trail Running', 
    icon: Mountain, 
    description: 'Trail runs, ultra running, fell running',
    color: 'terracotta' 
  },
  { 
    value: 'climbing', 
    label: 'Climbing', 
    icon: Mountain, 
    description: 'Rock climbing, mountaineering, bouldering',
    color: 'stone' 
  },
  { 
    value: 'cycling', 
    label: 'Cycling', 
    icon: Bike, 
    description: 'Mountain biking, bikepacking, road cycling',
    color: 'sage' 
  },
  { 
    value: 'water-sports', 
    label: 'Water Sports', 
    icon: Waves, 
    description: 'Kayaking, sailing, paddleboarding, surfing',
    color: 'sky' 
  },
  { 
    value: 'winter-sports', 
    label: 'Winter Sports', 
    icon: Snowflake, 
    description: 'Skiing, snowboarding, snowshoeing',
    color: 'highland' 
  },
  { 
    value: 'other', 
    label: 'Other', 
    icon: MapPin, 
    description: 'Camping, photography, nature walks',
    color: 'sunrise' 
  },
];

export const TripOverviewStep: React.FC = () => {
  const { register, watch, formState: { errors } } = useFormContext();
  
  const selectedActivityType = watch('activityType');

  // Helper function to get activity type display name
  const getActivityTypeLabel = (type: string) => {
    const activity = ACTIVITY_TYPES.find(a => a.value === type);
    return activity?.label || type;
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">Trip Overview</h3>
        <p className="text-muted">Select your activity type and give your trip a name</p>
      </div>

      <Row>
        <Col lg={10} className="mx-auto">
          <Card>
            {/* Activity Type Selection */}
            <h5 className="h6 mb-4">What type of trip are you planning?</h5>
            
            <Row className="g-3 mb-4">
              {ACTIVITY_TYPES.map((activity) => {
                const Icon = activity.icon;
                const isSelected = selectedActivityType === activity.value;
                
                return (
                  <Col key={activity.value} md={6} lg={4}>
                    <Form.Check
                      type="radio"
                      id={`activity-${activity.value}`}
                      value={activity.value}
                      {...register('activityType', { 
                        required: 'Please select an activity type' 
                      })}
                      className="d-none"
                    />
                    <Form.Label
                      htmlFor={`activity-${activity.value}`}
                      className={`activity-card h-100 d-block p-3 rounded cursor-pointer ${
                        isSelected ? 'selected border-primary bg-primary bg-opacity-10' : 'border'
                      }`}
                      style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      <div className="text-center">
                        <div className={`activity-icon mb-2 ${isSelected ? 'text-primary' : 'text-muted'}`}>
                          <Icon size={32} />
                        </div>
                        <h6 className={`mb-2 ${isSelected ? 'text-primary' : ''}`}>
                          {activity.label}
                        </h6>
                        <small className="text-muted d-block">
                          {activity.description}
                        </small>
                      </div>
                    </Form.Label>
                  </Col>
                );
              })}
            </Row>

            {errors.activityType && (
              <div className="text-danger small mb-4">
                {errors.activityType.message as string}
              </div>
            )}

            {/* Trip Name Section */}
            {selectedActivityType && (
              <>
                <hr className="my-4" />
                
                <div className="text-center mb-4">
                  <div className="badge bg-primary bg-opacity-10 text-primary px-3 py-2 mb-3">
                    <MapPin size={16} className="me-2" />
                    {getActivityTypeLabel(selectedActivityType)}
                  </div>
                </div>
                
                <h5 className="h6 mb-3 text-center">Give your trip a name</h5>
                
                <Row>
                  <Col md={8} className="mx-auto">
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

                    <div className="form-text text-muted mt-3 text-center">
                      Choose a name that clearly describes your trip. This will be shared with your emergency contacts.
                    </div>
                  </Col>
                </Row>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};