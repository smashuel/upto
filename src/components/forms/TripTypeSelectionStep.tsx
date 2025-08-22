import React from 'react';
import { Row, Col, Form } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { Mountain, MapPin, Bike, Snowflake, Waves } from 'lucide-react';
import { Card } from '../ui';

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

const DIFFICULTY_LEVELS = [
  { value: 'easy', label: 'Easy', description: 'Beginner friendly, low risk' },
  { value: 'moderate', label: 'Moderate', description: 'Some experience required' },
  { value: 'difficult', label: 'Difficult', description: 'Advanced skills needed' },
  { value: 'extreme', label: 'Extreme', description: 'Expert level, high risk' },
];

export const TripTypeSelectionStep: React.FC = () => {
  const { register, watch, formState: { errors } } = useFormContext();
  
  const selectedActivityType = watch('activityType');
  const selectedDifficulty = watch('difficulty');

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">Select Your Trip Type</h3>
        <p className="text-muted">Choose the type of outdoor activity you're planning</p>
      </div>

      <Row>
        <Col lg={10} className="mx-auto">
          <Card>
            <h5 className="h6 mb-4">Activity Type</h5>
            
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
              <div className="text-danger small mb-3">
                {errors.activityType.message as string}
              </div>
            )}

            {selectedActivityType && (
              <>
                <hr className="my-4" />
                
                <h5 className="h6 mb-3">Difficulty Level</h5>
                <Row className="g-3">
                  {DIFFICULTY_LEVELS.map((level) => {
                    const isSelected = selectedDifficulty === level.value;
                    
                    return (
                      <Col key={level.value} md={6} lg={3}>
                        <Form.Check
                          type="radio"
                          id={`difficulty-${level.value}`}
                          value={level.value}
                          {...register('difficulty', { 
                            required: 'Please select a difficulty level' 
                          })}
                          className="d-none"
                        />
                        <Form.Label
                          htmlFor={`difficulty-${level.value}`}
                          className={`difficulty-card h-100 d-block p-3 rounded text-center cursor-pointer ${
                            isSelected ? 'selected border-success bg-success bg-opacity-10' : 'border'
                          }`}
                          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          <h6 className={`mb-2 ${isSelected ? 'text-success' : ''}`}>
                            {level.label}
                          </h6>
                          <small className="text-muted d-block">
                            {level.description}
                          </small>
                        </Form.Label>
                      </Col>
                    );
                  })}
                </Row>

                {errors.difficulty && (
                  <div className="text-danger small mt-2">
                    {errors.difficulty.message as string}
                  </div>
                )}
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};