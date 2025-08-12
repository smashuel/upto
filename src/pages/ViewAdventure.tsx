import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import { Card } from '../components/ui';
import { MapPin, Clock, Users, Share2, Mountain, Compass } from 'lucide-react';

export const ViewAdventure: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      {/* Fjord Hero Section */}
      <section className="fjord-section">
        <div className="fjord-overlay"></div>
        
        {/* Floating Elements */}
        <div className="parallax-element" style={{ top: '15%', left: '15%' }}>
          <Mountain size={50} />
        </div>
        <div className="parallax-element" style={{ top: '25%', right: '20%', animationDelay: '3s' }}>
          <Compass size={35} />
        </div>
        
        <Container className="hero-content">
          <Row className="align-items-center" style={{ minHeight: '50vh' }}>
            <Col className="text-center text-white">
              <div className="fade-in">
                <h1 className="text-hero mb-4">Adventure Details</h1>
                <p className="lead mb-0 text-hero">
                  Adventure ID: {id}
                </p>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      <Container className="py-4">
        <Row>
          <Col>

            <div className="mb-4">
              <Card className="mb-4">
                <div className="d-flex align-items-center justify-between mb-4">
                  <h2 className="h4 fw-bold text-fjord d-flex align-items-center mb-0">
                    <MapPin size={20} className="me-2" />
                    Adventure Overview
                  </h2>
                  <span className="badge badge-adventure">
                    Planned
                  </span>
                </div>
                
                <div className="text-center py-5 text-granite">
                  <p className="mb-4">Adventure viewing functionality coming soon!</p>
                  <p className="small">This feature will be available in Phase 2.</p>
                </div>
              </Card>

              <Row className="g-4 mb-4">
                <Col md={6}>
                  <Card className="h-100">
                    <h3 className="h5 fw-bold text-fjord d-flex align-items-center mb-4">
                      <Clock size={18} className="me-2" />
                      Schedule
                    </h3>
                    <div className="text-center py-4 text-granite small">
                      Schedule details coming soon
                    </div>
                  </Card>
                </Col>

                <Col md={6}>
                  <Card className="h-100">
                    <h3 className="h5 fw-bold text-fjord d-flex align-items-center mb-4">
                      <Users size={18} className="me-2" />
                      Emergency Contacts
                    </h3>
                    <div className="text-center py-4 text-granite small">
                      Contact management coming soon
                    </div>
                  </Card>
                </Col>
              </Row>

              <Card>
                <h3 className="h5 fw-bold text-fjord d-flex align-items-center mb-4">
                  <Share2 size={18} className="me-2" />
                  Share Adventure
                </h3>
                <div className="text-center py-4 text-granite small">
                  Sharing functionality coming soon
                </div>
              </Card>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};