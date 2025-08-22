import React from 'react';
import { Row, Col, Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { Mountain, Clock, Info, BookOpen, MapPin } from 'lucide-react';
import { Card } from '../ui';
import { GuidePaceEstimator } from '../guidepace/GuidePaceEstimator';

export const TripDetailsStep: React.FC = () => {
  const { register, watch, formState: { errors } } = useFormContext();
  
  const useGuidePace = watch('useGuidePace');
  const activityType = watch('activityType');
  const title = watch('title');

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
        <h3 className="h4 mb-2">Trip Details & Planning</h3>
        <p className="text-muted">
          Add details about your trip and get professional time estimates based on your route
        </p>
      </div>

      {/* Trip Summary */}
      {title && (
        <Row className="mb-4">
          <Col lg={10} className="mx-auto">
            <div className="bg-light rounded p-3 text-center">
              <MapPin size={16} className="text-primary me-2" />
              <strong>{title}</strong>
              {activityType && (
                <span className="badge bg-primary bg-opacity-10 text-primary ms-2">
                  {activityType.charAt(0).toUpperCase() + activityType.slice(1)}
                </span>
              )}
            </div>
          </Col>
        </Row>
      )}

      <Row>
        <Col lg={10} className="mx-auto">
          <Card>
            <h5 className="h6 mb-3">Trip Description</h5>
            
            <div className="mb-4">
              <Form.Label>Describe your planned trip</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                placeholder="Describe your planned trip, route, objectives, and any important details..."
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
                Include details about your planned route, objectives, weather considerations, 
                and any specific plans. This helps with time estimation and emergency planning.
              </div>
            </div>

            <hr className="my-4" />

            {/* GuidePace Professional Time Estimation */}
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
                  Get guide-quality time estimates based on your route and terrain analysis. 
                  Perfect for planning realistic schedules and sharing accurate ETAs with your safety contacts.
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