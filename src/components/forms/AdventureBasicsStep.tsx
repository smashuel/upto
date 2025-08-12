import React from 'react';
import { Row, Col, Form } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { Mountain, Compass, AlertTriangle, MapPin } from 'lucide-react';
import { Input, Card } from '../ui';

const ACTIVITY_TYPES = [
  { value: 'hiking', label: 'Hiking', icon: Mountain },
  { value: 'climbing', label: 'Rock Climbing', icon: Mountain },
  { value: 'sailing', label: 'Sailing', icon: Compass },
  { value: 'skiing', label: 'Skiing', icon: Mountain },
  { value: 'cycling', label: 'Cycling', icon: Compass },
  { value: 'other', label: 'Other', icon: MapPin },
];

const DIFFICULTY_LEVELS = [
  { value: 'easy', label: 'Easy', description: 'Suitable for beginners, low risk', color: 'success' },
  { value: 'moderate', label: 'Moderate', description: 'Some experience required, moderate risk', color: 'warning' },
  { value: 'difficult', label: 'Difficult', description: 'Experienced adventurers, higher risk', color: 'danger' },
  { value: 'extreme', label: 'Extreme', description: 'Experts only, very high risk', color: 'dark' },
];

export const AdventureBasicsStep: React.FC = () => {
  const { register, watch, formState: { errors } } = useFormContext();
  
  const activityType = watch('activityType');
  const difficulty = watch('difficulty');

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">Adventure Details</h3>
        <p className="text-muted">Tell us about your planned adventure</p>
      </div>

      <Row>
        <Col md={6}>
          <Card variant="step" className="h-100">
            <h5 className="h6 mb-3">Basic Information</h5>
            
            <Input
              label="Adventure Title"
              placeholder="e.g., Mount Washington Day Hike"
              {...register('title', { 
                required: 'Adventure title is required',
                minLength: { value: 3, message: 'Title must be at least 3 characters' }
              })}
              error={errors.title?.message as string}
            />

            <div className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                placeholder="Describe your planned adventure, route, and any important details..."
                {...register('description', {
                  required: 'Description is required',
                  minLength: { value: 10, message: 'Description must be at least 10 characters' }
                })}
                className={errors.description ? 'is-invalid' : ''}
              />
              {errors.description && (
                <div className="invalid-feedback">
                  {errors.description.message as string}
                </div>
              )}
              <div className="form-text">
                Include details about your planned route, objectives, and any specific considerations.
              </div>
            </div>
          </Card>
        </Col>

        <Col md={6}>
          <Card variant="step" className="h-100">
            <h5 className="h6 mb-3">Activity & Risk Level</h5>
            
            <div className="mb-3">
              <Form.Label>Activity Type</Form.Label>
              <div className="row g-2">
                {ACTIVITY_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <div key={type.value} className="col-6 col-lg-4">
                      <Form.Check
                        type="radio"
                        id={`activity-${type.value}`}
                        value={type.value}
                        {...register('activityType')}
                        className="d-none"
                      />
                      <Form.Label
                        htmlFor={`activity-${type.value}`}
                        className={`card text-center p-2 cursor-pointer border transition-all ${
                          activityType === type.value 
                            ? 'border-primary bg-primary text-white shadow-sm' 
                            : 'border-light bg-light text-dark'
                        }`}
                        style={{ cursor: 'pointer' }}
                      >
                        <Icon size={20} className="mb-1" />
                        <div className="small fw-medium">{type.label}</div>
                      </Form.Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-3">
              <Form.Label>Difficulty Level</Form.Label>
              <div className="d-grid gap-2">
                {DIFFICULTY_LEVELS.map((level) => (
                  <div key={level.value}>
                    <Form.Check
                      type="radio"
                      id={`difficulty-${level.value}`}
                      value={level.value}
                      {...register('difficulty')}
                      className="d-none"
                    />
                    <Form.Label
                      htmlFor={`difficulty-${level.value}`}
                      className={`card p-3 cursor-pointer border transition-all ${
                        difficulty === level.value 
                          ? `border-${level.color} bg-${level.color} text-white shadow-sm` 
                          : 'border-light bg-light text-dark'
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex align-items-center">
                        <AlertTriangle size={16} className="me-2" />
                        <div>
                          <div className="fw-medium">{level.label}</div>
                          <div className="small opacity-75">{level.description}</div>
                        </div>
                      </div>
                    </Form.Label>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};