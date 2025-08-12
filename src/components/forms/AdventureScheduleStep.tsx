import React from 'react';
import { Row, Col, Form, Alert } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { Clock, Calendar, Bell, Info } from 'lucide-react';
import { format, differenceInHours, addHours } from 'date-fns';
import { Input, Card } from '../ui';

const CHECK_IN_INTERVALS = [
  { value: 6, label: '6 hours', description: 'For high-risk or short adventures' },
  { value: 12, label: '12 hours', description: 'For day-long adventures' },
  { value: 24, label: '24 hours', description: 'For overnight adventures' },
  { value: 48, label: '48 hours', description: 'For multi-day adventures' },
];

export const AdventureScheduleStep: React.FC = () => {
  const { register, watch, setValue, formState: { errors } } = useFormContext();
  
  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const checkInInterval = watch('checkInInterval');

  // Calculate duration and next check-in
  const duration = startDate && endDate ? differenceInHours(new Date(endDate), new Date(startDate)) : 0;
  const nextCheckIn = startDate && checkInInterval ? addHours(new Date(startDate), checkInInterval) : null;

  // Auto-set end date to 8 hours after start date if not set
  React.useEffect(() => {
    if (startDate && !endDate) {
      const defaultEnd = addHours(new Date(startDate), 8);
      setValue('endDate', format(defaultEnd, "yyyy-MM-dd'T'HH:mm"));
    }
  }, [startDate, endDate, setValue]);

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">Adventure Schedule</h3>
        <p className="text-muted">When are you planning to go and when should we check on you?</p>
      </div>

      <Row>
        <Col lg={8}>
          <Card variant="step">
            <h5 className="h6 mb-3">
              <Calendar className="me-2" size={20} />
              Adventure Timeline
            </h5>
            
            <Row>
              <Col md={6}>
                <Input
                  label="Start Date & Time"
                  type="datetime-local"
                  {...register('startDate', { 
                    required: 'Start date and time is required'
                  })}
                  error={errors.startDate?.message as string}
                  helperText="When will you begin your adventure?"
                />
              </Col>
              
              <Col md={6}>
                <Input
                  label="Expected End Date & Time"
                  type="datetime-local"
                  {...register('endDate', { 
                    required: 'End date and time is required',
                    validate: (value) => {
                      if (startDate && new Date(value) <= new Date(startDate)) {
                        return 'End time must be after start time';
                      }
                      return true;
                    }
                  })}
                  error={errors.endDate?.message as string}
                  helperText="When do you expect to complete your adventure?"
                />
              </Col>
            </Row>

            {duration > 0 && (
              <Alert variant="info" className="mt-3">
                <Info size={16} className="me-2" />
                <strong>Adventure Duration:</strong> {duration} hours ({Math.floor(duration / 24)} days, {duration % 24} hours)
              </Alert>
            )}
          </Card>

          <Card variant="step" className="mt-4">
            <h5 className="h6 mb-3">
              <Bell className="me-2" size={20} />
              Safety Check-ins
            </h5>
            
            <Form.Label>Check-in Frequency</Form.Label>
            <div className="row g-2 mb-3">
              {CHECK_IN_INTERVALS.map((interval) => (
                <div key={interval.value} className="col-md-6">
                  <Form.Check
                    type="radio"
                    id={`checkin-${interval.value}`}
                    value={interval.value}
                    {...register('checkInInterval')}
                    className="d-none"
                  />
                  <Form.Label
                    htmlFor={`checkin-${interval.value}`}
                    className={`card p-3 cursor-pointer border transition-all h-100 ${
                      checkInInterval == interval.value 
                        ? 'border-primary bg-primary text-white shadow-sm' 
                        : 'border-light bg-light text-dark'
                    }`}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex align-items-center mb-2">
                      <Clock size={16} className="me-2" />
                      <div className="fw-medium">Every {interval.label}</div>
                    </div>
                    <div className="small opacity-75">{interval.description}</div>
                  </Form.Label>
                </div>
              ))}
            </div>

            {nextCheckIn && (
              <Alert variant="warning">
                <Clock size={16} className="me-2" />
                <strong>First Check-in:</strong> {format(nextCheckIn, 'PPpp')}
                <div className="small mt-1">
                  If we don't hear from you by this time, your emergency contacts will be notified.
                </div>
              </Alert>
            )}
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="bg-light border-0 h-100">
            <h6 className="text-muted mb-3">
              <Info size={16} className="me-2" />
              Schedule Tips
            </h6>
            
            <div className="small text-muted">
              <div className="mb-3">
                <strong>Start Time:</strong> Be realistic about when you'll actually begin your adventure, not when you'll leave home.
              </div>
              
              <div className="mb-3">
                <strong>End Time:</strong> Include extra time for unexpected delays, breaks, and travel back.
              </div>
              
              <div className="mb-3">
                <strong>Check-ins:</strong> Choose a frequency that matches your adventure's risk level and communication availability.
              </div>
              
              <div className="mb-0">
                <strong>Emergency Protocol:</strong> If you miss a check-in, we'll attempt to contact you before alerting your emergency contacts.
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};