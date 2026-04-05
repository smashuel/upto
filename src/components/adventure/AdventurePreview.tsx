import React from 'react';
import { Row, Col, Badge } from 'react-bootstrap';
import { MapPin, Clock, Users, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Card } from '../ui';

interface AdventurePreviewProps {
  formData: {
    title: string;
    description: string;
    activityType: string;
    startDate: string;
    location: { name: string } | string;
    emergencyContacts: Array<{ name: string; relationship: string; phone: string; email: string }>;
  };
}

const ACTIVITY_ICONS: Record<string, string> = {
  'hiking': '🥾',
  'trail-running': '🏃',
  'climbing': '🧗',
  'cycling': '🚴',
  'water-sports': '🚣',
  'winter-sports': '⛷️',
  'other': '🗺️',
};

export const AdventurePreview: React.FC<AdventurePreviewProps> = ({ formData }) => {
  const locationName = typeof formData.location === 'string'
    ? formData.location
    : formData.location?.name || 'TBD';

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">TripLink Preview</h3>
        <p className="text-muted">Review your trip plan before sharing</p>
      </div>

      <div className="adventure-preview">
        {/* Header */}
        <div className="adventure-header">
          <Row className="align-items-center">
            <Col>
              <div className="d-flex align-items-center mb-2">
                <span className="me-3" style={{ fontSize: '2rem' }}>
                  {ACTIVITY_ICONS[formData.activityType] || '🗺️'}
                </span>
                <div>
                  <h2 className="mb-1 text-white">{formData.title || 'Untitled Trip'}</h2>
                  <div className="d-flex gap-2">
                    <Badge bg="light" text="dark" className="text-capitalize">
                      {formData.activityType || 'Not specified'}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="mb-0 text-white opacity-90">
                {formData.description || 'No description provided'}
              </p>
            </Col>
          </Row>
        </div>

        {/* Stats Grid */}
        <div className="adventure-stats">
          <div className="adventure-stat">
            <MapPin size={20} className="text-primary mb-2" />
            <div className="adventure-stat-value">{locationName}</div>
            <div className="adventure-stat-label">Location</div>
          </div>

          <div className="adventure-stat">
            <Calendar size={20} className="text-primary mb-2" />
            <div className="adventure-stat-value">
              {formData.startDate
                ? format(new Date(formData.startDate), 'MMM d')
                : 'TBD'
              }
            </div>
            <div className="adventure-stat-label">Start Date</div>
          </div>

          <div className="adventure-stat">
            <Clock size={20} className="text-primary mb-2" />
            <div className="adventure-stat-value">
              {formData.startDate
                ? format(new Date(formData.startDate), 'h:mm a')
                : 'TBD'
              }
            </div>
            <div className="adventure-stat-label">Start Time</div>
          </div>
        </div>

        {/* Details */}
        <div className="p-4">
          <Row>
            <Col md={6}>
              <Card className="h-100 border-0 shadow-sm">
                <h6 className="d-flex align-items-center mb-3">
                  <Calendar className="me-2 text-primary" size={18} />
                  Schedule Details
                </h6>

                {formData.startDate ? (
                  <div className="small">
                    <div className="mb-2">
                      <strong>Start:</strong> {format(new Date(formData.startDate), 'PPpp')}
                    </div>
                  </div>
                ) : (
                  <div className="text-muted small">Schedule not yet configured</div>
                )}
              </Card>
            </Col>

            <Col md={6}>
              <Card className="h-100 border-0 shadow-sm">
                <h6 className="d-flex align-items-center mb-3">
                  <Users className="me-2 text-primary" size={18} />
                  Emergency Contacts
                </h6>

                {formData.emergencyContacts && formData.emergencyContacts.length > 0 ? (
                  <div className="small">
                    {formData.emergencyContacts.map((contact, index) => (
                      <div key={index} className="mb-2">
                        <strong>{contact.name}</strong> ({contact.relationship})
                        <div className="text-muted">{contact.phone} • {contact.email}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted small">No emergency contacts added yet</div>
                )}
              </Card>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
};
