import React from 'react';
import { Row, Col, Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { Mountain, Compass, MapPin, Clock, Info, BookOpen } from 'lucide-react';
import { Input, Card } from '../ui';
import { GuidePaceEstimator } from '../guidepace/GuidePaceEstimator';

const ACTIVITY_TYPES = [
  { value: 'hiking', label: 'Hiking', icon: Mountain },
  { value: 'climbing', label: 'Rock Climbing', icon: Mountain },
  { value: 'sailing', label: 'Sailing', icon: Compass },
  { value: 'skiing', label: 'Skiing', icon: Mountain },
  { value: 'cycling', label: 'Cycling', icon: Compass },
  { value: 'other', label: 'Other', icon: MapPin },
];


export const AdventureBasicsStep: React.FC = () => {
  const { register, watch, formState: { errors } } = useFormContext();
  
  const activityType = watch('activityType');
  const useGuidePace = watch('useGuidePace');

  const guidePaceTooltip = (
    <Tooltip id="guidepace-tooltip" className="custom-tooltip">
      <div style={{ textAlign: 'left', maxWidth: '320px' }}>
        <div className="fw-bold mb-2">
          <Mountain size={16} className="me-2" />
          Professional Time Estimation
        </div>
        <div className="small mb-2">
          Based on proven mountain guide methodology
        </div>
        <div className="small mb-2">
          <div>✓ Munter Method - hiking & skiing terrain</div>
          <div>✓ Chauvin System - scrambling & snow climbing</div>
          <div>✓ Technical System - roped climbing</div>
        </div>
        <div className="small mb-2">
          Used by IFMGA guides worldwide for accurate time planning and safety management.
        </div>
        <div className="small text-decoration-underline d-flex align-items-center">
          <BookOpen size={14} className="me-1" />
          Learn more about GuidePace
        </div>
      </div>
    </Tooltip>
  );

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
            <h5 className="h6 mb-3">Activity Type</h5>
            
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

          </Card>
        </Col>
      </Row>

      {/* GuidePace Professional Time Estimation */}
      <Row className="mt-4">
        <Col>
          <Card variant="step">
            <div className="d-flex align-items-start">
              <Form.Check
                type="checkbox"
                id="useGuidePace"
                {...register('useGuidePace')}
                className="me-3 mt-1"
              />
              <div className="flex-grow-1">
                <div className="d-flex align-items-center mb-2">
                  <Form.Label htmlFor="useGuidePace" className="fw-medium mb-0 cursor-pointer d-flex align-items-center" style={{ cursor: 'pointer' }}>
                    <Clock size={20} className="me-2 text-primary" />
                    Use Professional Time Estimation (GuidePace)
                  </Form.Label>
                  <OverlayTrigger
                    placement="top"
                    delay={{ show: 250, hide: 400 }}
                    overlay={guidePaceTooltip}
                  >
                    <Info size={16} className="ms-2 text-muted cursor-pointer" style={{ cursor: 'pointer' }} />
                  </OverlayTrigger>
                </div>
                <p className="text-muted mb-0 small">
                  Get guide-quality time estimates based on terrain analysis. Perfect for planning realistic schedules and sharing accurate ETAs with your safety contacts.
                </p>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* GuidePace Professional Time Estimation System */}
      <GuidePaceEstimator isVisible={useGuidePace} />
    </div>
  );
};