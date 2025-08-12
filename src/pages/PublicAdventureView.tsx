import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Row, Col, Alert } from 'react-bootstrap';
import { 
  MapPin, Clock, Users, Shield, CheckCircle, AlertTriangle, 
  Phone, Mail, Calendar, Route, Mountain, Activity, Info 
} from 'lucide-react';
import { Card, Button } from '../components/ui';
import { Adventure, CheckIn } from '../types/adventure';
import { MapSelector } from '../components/map/MapSelector';

export const PublicAdventureView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeUntilNextCheckin, setTimeUntilNextCheckin] = useState<string>('');

  useEffect(() => {
    if (token) {
      loadAdventure(token);
      // Update view count
      updateViewCount(token);
    }
  }, [token]);

  useEffect(() => {
    // Update countdown timer every minute
    const timer = setInterval(() => {
      if (adventure?.nextCheckInDue) {
        updateCountdown();
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [adventure]);

  const loadAdventure = async (shareToken: string) => {
    try {
      setLoading(true);
      // In production, this would be an API call
      // For now, simulate loading from localStorage with token matching
      const adventures = JSON.parse(localStorage.getItem('adventures') || '[]');
      const foundAdventure = adventures.find((adv: Adventure) => adv.shareToken === shareToken);
      
      if (!foundAdventure) {
        setError('Adventure not found or link has expired.');
        return;
      }

      // Check visibility permissions
      if (foundAdventure.visibility === 'private') {
        setError('This adventure is private and cannot be viewed.');
        return;
      }

      // Parse dates
      foundAdventure.startDate = new Date(foundAdventure.startDate);
      foundAdventure.endDate = new Date(foundAdventure.endDate);
      if (foundAdventure.lastCheckIn) {
        foundAdventure.lastCheckIn = new Date(foundAdventure.lastCheckIn);
      }
      if (foundAdventure.nextCheckInDue) {
        foundAdventure.nextCheckInDue = new Date(foundAdventure.nextCheckInDue);
      }

      setAdventure(foundAdventure);
      updateCountdown();
    } catch (err) {
      setError('Failed to load adventure details.');
    } finally {
      setLoading(false);
    }
  };

  const updateViewCount = async (shareToken: string) => {
    // Update view statistics
    const statsKey = `share-stats-${shareToken}`;
    const stats = JSON.parse(localStorage.getItem(statsKey) || '{"views": 0}');
    stats.views += 1;
    stats.lastAccessed = new Date().toISOString();
    localStorage.setItem(statsKey, JSON.stringify(stats));
  };

  const updateCountdown = () => {
    if (!adventure?.nextCheckInDue) return;

    const now = new Date();
    const nextCheckIn = adventure.nextCheckInDue;
    const diff = nextCheckIn.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeUntilNextCheckin('Check-in overdue');
    } else {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeUntilNextCheckin(`${hours}h ${minutes}m`);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'planned':
        return { 
          color: 'text-fjord', 
          bg: 'bg-fjord', 
          icon: Calendar,
          message: 'Adventure is planned and will begin soon'
        };
      case 'active':
        return { 
          color: 'text-forest', 
          bg: 'bg-forest', 
          icon: Activity,
          message: 'Adventure is currently active'
        };
      case 'completed':
        return { 
          color: 'text-sage', 
          bg: 'bg-sage', 
          icon: CheckCircle,
          message: 'Adventure completed successfully'
        };
      case 'overdue':
        return { 
          color: 'text-danger', 
          bg: 'bg-danger', 
          icon: AlertTriangle,
          message: 'Check-in is overdue - emergency contacts have been notified'
        };
      default:
        return { 
          color: 'text-granite', 
          bg: 'bg-granite', 
          icon: Info,
          message: 'Status unknown'
        };
    }
  };

  const formatDuration = (startDate: Date, endDate: Date) => {
    const diff = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ${hours % 24}h`;
    }
    return `${hours}h`;
  };

  if (loading) {
    return (
      <div className="highland-section">
        <div className="highland-overlay"></div>
        <Container className="hero-content">
          <Row className="align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
            <Col md={6} className="text-center text-white">
              <div className="adventure-spinner mx-auto mb-4"></div>
              <h3 className="text-hero">Loading Adventure Details...</h3>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  if (error || !adventure) {
    return (
      <div className="highland-section">
        <div className="highland-overlay"></div>
        <Container className="hero-content">
          <Row className="align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
            <Col md={6} className="text-center text-white">
              <AlertTriangle size={64} className="text-copper mb-4" />
              <h3 className="text-hero mb-3">Adventure Not Found</h3>
              <p className="lead text-hero mb-4">
                {error || 'The adventure link you\'re looking for doesn\'t exist or has expired.'}
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

  const statusInfo = getStatusInfo(adventure.status);
  const StatusIcon = statusInfo.icon;

  return (
    <div>
      {/* Hero Section */}
      <section className="highland-section">
        <div className="highland-overlay"></div>
        <Container className="hero-content">
          <Row className="align-items-center" style={{ minHeight: '50vh' }}>
            <Col className="text-center text-white">
              <div className="fade-in">
                <div className="d-flex justify-content-center align-items-center mb-3">
                  <Shield className="me-3" size={48} />
                  <div>
                    <h1 className="text-hero mb-1">{adventure.title}</h1>
                    <p className="lead text-hero mb-0">Adventure Safety Tracking</p>
                  </div>
                </div>
                <div className={`badge ${statusInfo.bg} text-white px-4 py-2 fs-6`}>
                  <StatusIcon size={18} className="me-2" />
                  {adventure.status.charAt(0).toUpperCase() + adventure.status.slice(1)}
                </div>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      <Container className="py-5">
        {/* Status Alert */}
        {adventure.status === 'overdue' && (
          <Alert variant="danger" className="mb-4">
            <AlertTriangle className="me-2" size={20} />
            <strong>Check-in Overdue:</strong> This adventurer has missed their scheduled check-in. 
            Emergency contacts have been automatically notified.
          </Alert>
        )}

        <Row className="g-4">
          {/* Main Adventure Details */}
          <Col lg={8}>
            <Card className="mb-4 card-adventure">
              <h3 className="fw-bold text-fjord mb-4 d-flex align-items-center">
                <Mountain className="me-2" size={24} />
                Adventure Overview
              </h3>
              
              <p className="text-granite mb-4">{adventure.description}</p>
              
              <Row className="g-3 mb-4">
                <Col md={6}>
                  <div className="d-flex align-items-center">
                    <Calendar className="text-fjord me-2" size={18} />
                    <div>
                      <div className="fw-bold">Start Time</div>
                      <div className="text-granite">{adventure.startDate.toLocaleString()}</div>
                    </div>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="d-flex align-items-center">
                    <Clock className="text-copper me-2" size={18} />
                    <div>
                      <div className="fw-bold">Duration</div>
                      <div className="text-granite">{formatDuration(adventure.startDate, adventure.endDate)}</div>
                    </div>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="d-flex align-items-center">
                    <MapPin className="text-forest me-2" size={18} />
                    <div>
                      <div className="fw-bold">Location</div>
                      <div className="text-granite">{adventure.location.name}</div>
                    </div>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="d-flex align-items-center">
                    <Activity className="text-sage me-2" size={18} />
                    <div>
                      <div className="fw-bold">Activity</div>
                      <div className="text-granite">
                        {adventure.activities.map(a => a.type).join(', ')}
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>

              {/* Route Map */}
              {adventure.location.coordinates && (
                <div className="mb-4">
                  <h5 className="fw-bold text-fjord mb-3">Planned Route</h5>
                  <div style={{ height: '300px' }} className="map-container">
                    <MapSelector
                      center={adventure.location.coordinates}
                      waypoints={adventure.activities[0]?.route?.waypoints || []}
                      readOnly={true}
                      showRoute={true}
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* Check-in Timeline */}
            <Card>
              <h4 className="fw-bold text-fjord mb-4 d-flex align-items-center">
                <CheckCircle className="me-2" size={24} />
                Safety Check-ins
              </h4>
              
              {adventure.status === 'active' && adventure.nextCheckInDue && (
                <Alert variant="info" className="mb-4">
                  <Clock className="me-2" size={18} />
                  <strong>Next check-in due:</strong> {timeUntilNextCheckin}
                </Alert>
              )}

              <div className="timeline">
                {adventure.checkIns && adventure.checkIns.length > 0 ? (
                  adventure.checkIns.map((checkIn, index) => (
                    <div key={checkIn.id} className="timeline-item mb-3">
                      <div className="d-flex align-items-start">
                        <div className={`timeline-marker ${checkIn.status === 'safe' ? 'bg-success' : checkIn.status === 'emergency' ? 'bg-danger' : 'bg-warning'}`}>
                          <CheckCircle size={16} className="text-white" />
                        </div>
                        <div className="timeline-content ms-3">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <h6 className="mb-0 fw-bold">Check-in #{index + 1}</h6>
                            <small className="text-muted">
                              {new Date(checkIn.timestamp).toLocaleString()}
                            </small>
                          </div>
                          <div className={`badge ${checkIn.status === 'safe' ? 'bg-success' : checkIn.status === 'emergency' ? 'bg-danger' : 'bg-warning'} mb-2`}>
                            {checkIn.status.charAt(0).toUpperCase() + checkIn.status.slice(1)}
                          </div>
                          {checkIn.message && (
                            <p className="text-granite mb-1">{checkIn.message}</p>
                          )}
                          {checkIn.location?.address && (
                            <small className="text-muted">
                              <MapPin size={14} className="me-1" />
                              {checkIn.location.address}
                            </small>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-granite">
                    <CheckCircle size={48} className="text-mist mb-3" />
                    <p className="mb-0">No check-ins yet. First check-in will appear here once the adventure begins.</p>
                  </div>
                )}
              </div>
            </Card>
          </Col>

          {/* Sidebar */}
          <Col lg={4}>
            {/* Current Status */}
            <Card className="mb-4 text-center card-premium">
              <StatusIcon size={48} className={`${statusInfo.color} mb-3`} />
              <h5 className="fw-bold mb-3">Current Status</h5>
              <p className="text-granite mb-3">{statusInfo.message}</p>
              {adventure.lastCheckIn && (
                <div className="small text-muted">
                  Last check-in: {adventure.lastCheckIn.toLocaleString()}
                </div>
              )}
            </Card>

            {/* Emergency Contacts */}
            <Card className="mb-4">
              <h5 className="fw-bold text-fjord mb-3 d-flex align-items-center">
                <Users className="me-2" size={20} />
                Emergency Contacts
              </h5>
              {adventure.emergencyContacts.map((contact) => (
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
                      onClick={() => window.open(`tel:${contact.phone}`)}>
                    </Button>
                    <Button variant="outline-secondary" size="sm" icon={Mail} 
                      onClick={() => window.open(`mailto:${contact.email}`)}>
                    </Button>
                  </div>
                </div>
              ))}
            </Card>

            {/* Safety Info */}
            <Card>
              <h5 className="fw-bold text-fjord mb-3 d-flex align-items-center">
                <Shield className="me-2" size={20} />
                Safety Information
              </h5>
              <div className="small text-granite">
                <div className="mb-2">
                  <strong>Check-in Interval:</strong> Every {adventure.checkInInterval} hours
                </div>
                <div className="mb-2">
                  <strong>Escalation Time:</strong> {adventure.notifications.escalationTimeHours} hours after missed check-in
                </div>
                <div className="bg-ice rounded p-2 mt-3">
                  <div className="fw-bold text-fjord mb-1">How This Works</div>
                  <ul className="list-unstyled mb-0 small">
                    <li>• Automatic check-in reminders sent to adventurer</li>
                    <li>• Emergency contacts notified if check-ins missed</li>
                    <li>• GPS location shared during active adventures</li>
                    <li>• Emergency services contacted if critical</li>
                  </ul>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Powered by upto */}
        <div className="text-center mt-5 pt-4 border-top">
          <div className="small text-muted">
            <Shield size={16} className="me-1" />
            Adventure safety powered by <strong>upto</strong> • 
            <a href="/" className="text-decoration-none ms-1">Create your own adventure plan</a>
          </div>
        </div>
      </Container>
    </div>
  );
};