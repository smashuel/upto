import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Row, Col, Alert } from 'react-bootstrap';
import { MapPin, Clock, Users, Shield, AlertTriangle, Phone, Mail, Calendar, Mountain } from 'lucide-react';
import { Card, Button } from '../components/ui';
import { TripLink } from '../types/adventure';

export const PublicAdventureView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [tripLink, setTripLink] = useState<TripLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadTripLink(token);
    }
  }, [token]);

  const loadTripLink = (shareToken: string) => {
    try {
      setLoading(true);
      const stored = JSON.parse(localStorage.getItem('triplinks') || '[]');
      const found = stored.find((tl: TripLink) => tl.shareToken === shareToken);

      if (!found) {
        setError('TripLink not found or link has expired.');
        return;
      }

      setTripLink(found);
    } catch {
      setError('Failed to load trip details.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="highland-section">
        <div className="highland-overlay"></div>
        <Container className="hero-content">
          <Row className="align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
            <Col md={6} className="text-center text-white">
              <div className="adventure-spinner mx-auto mb-4"></div>
              <h3 className="text-hero">Loading Trip Details...</h3>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  if (error || !tripLink) {
    return (
      <div className="highland-section">
        <div className="highland-overlay"></div>
        <Container className="hero-content">
          <Row className="align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
            <Col md={6} className="text-center text-white">
              <AlertTriangle size={64} className="text-copper mb-4" />
              <h3 className="text-hero mb-3">TripLink Not Found</h3>
              <p className="lead text-hero mb-4">
                {error || "The TripLink you're looking for doesn't exist or has expired."}
              </p>
              <Button variant="highland" onClick={() => window.location.href = '/'}>
                Return to upto
              </Button>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  const startDate = new Date(tripLink.startDate);

  return (
    <div>
      <section className="highland-section">
        <div className="highland-overlay"></div>
        <Container className="hero-content">
          <Row className="align-items-center" style={{ minHeight: '50vh' }}>
            <Col className="text-center text-white">
              <div className="fade-in">
                <div className="d-flex justify-content-center align-items-center mb-3">
                  <Shield className="me-3" size={48} />
                  <div>
                    <h1 className="text-hero mb-1">{tripLink.title}</h1>
                    <p className="lead text-hero mb-0">TripLink Safety Plan</p>
                  </div>
                </div>
                <div className="badge bg-primary text-white px-4 py-2 fs-6 text-capitalize">
                  {tripLink.status}
                </div>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      <Container className="py-5">
        <Row className="g-4">
          <Col lg={8}>
            <Card className="mb-4">
              <h3 className="fw-bold text-fjord mb-4 d-flex align-items-center">
                <Mountain className="me-2" size={24} />
                Trip Overview
              </h3>

              <p className="text-granite mb-4">{tripLink.description}</p>

              <Row className="g-3">
                <Col md={6}>
                  <div className="d-flex align-items-center">
                    <Calendar className="text-fjord me-2" size={18} />
                    <div>
                      <div className="fw-bold">Start Time</div>
                      <div className="text-granite">{startDate.toLocaleString()}</div>
                    </div>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="d-flex align-items-center">
                    <MapPin className="text-forest me-2" size={18} />
                    <div>
                      <div className="fw-bold">Location</div>
                      <div className="text-granite">{tripLink.location.name}</div>
                    </div>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="d-flex align-items-center">
                    <Clock className="text-copper me-2" size={18} />
                    <div>
                      <div className="fw-bold">Activity</div>
                      <div className="text-granite text-capitalize">{tripLink.activityType}</div>
                    </div>
                  </div>
                </Col>
              </Row>

              {tripLink.location.what3words && (
                <Alert variant="info" className="mt-4 mb-0">
                  <strong>Precise Location:</strong>{' '}
                  <code>///{tripLink.location.what3words}</code>
                </Alert>
              )}
            </Card>
          </Col>

          <Col lg={4}>
            <Card className="mb-4">
              <h5 className="fw-bold text-fjord mb-3 d-flex align-items-center">
                <Users className="me-2" size={20} />
                Emergency Contacts
              </h5>
              {tripLink.emergencyContacts.length > 0 ? (
                tripLink.emergencyContacts.map((contact) => (
                  <div key={contact.id} className="d-flex align-items-center justify-content-between py-2 border-bottom">
                    <div>
                      <div className="fw-bold text-charcoal">{contact.name}</div>
                      <small className="text-muted">{contact.relationship}</small>
                      {contact.isPrimary && (
                        <span className="badge bg-copper text-white ms-2 small">Primary</span>
                      )}
                    </div>
                    <div className="d-flex gap-2">
                      <Button variant="outline-secondary" size="sm" icon={Phone}
                        onClick={() => window.open(`tel:${contact.phone}`)}>Call
                      </Button>
                      <Button variant="outline-secondary" size="sm" icon={Mail}
                        onClick={() => window.open(`mailto:${contact.email}`)}>Email
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted small mb-0">No emergency contacts listed.</p>
              )}
            </Card>

            <Card>
              <h5 className="fw-bold text-fjord mb-3 d-flex align-items-center">
                <Shield className="me-2" size={20} />
                Safety Information
              </h5>
              <div className="bg-ice rounded p-2">
                <div className="fw-bold text-fjord mb-1 small">How This Works</div>
                <ul className="list-unstyled mb-0 small">
                  <li>• Share this link with people who need to know your plans</li>
                  <li>• They can see your route and emergency contacts</li>
                  <li>• Use what3words addresses to give rescuers your exact location</li>
                </ul>
              </div>
            </Card>
          </Col>
        </Row>

        <div className="text-center mt-5 pt-4 border-top">
          <div className="small text-muted">
            <Shield size={16} className="me-1" />
            Trip safety powered by <strong>upto</strong> •{' '}
            <a href="/" className="text-decoration-none ms-1">Create your own TripLink</a>
          </div>
        </div>
      </Container>
    </div>
  );
};
