import React from 'react';
import { Row, Col, Alert } from 'react-bootstrap';
import { Users, Plus, Phone, Mail } from 'lucide-react';
import { Card, Button } from '../ui';

export const TripLinkContactsStep: React.FC = () => {
  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">Emergency Contacts</h3>
        <p className="text-muted">Who should we notify if something goes wrong?</p>
      </div>

      <Row>
        <Col lg={8}>
          <Card variant="step">
            <h5 className="h6 mb-3">
              <Users className="me-2" size={20} />
              Your Safety Network
            </h5>
            
            <div className="text-center py-5 text-muted">
              <Users size={48} className="mb-3 opacity-50" />
              <h6>Contact Management</h6>
              <p className="mb-3">Add and manage your emergency contacts</p>
              <Button variant="primary" disabled>
                <Plus size={16} className="me-2" />
                Add Emergency Contact
              </Button>
              <div className="small mt-2 text-muted">
                Coming in Phase 2 - Contact Management System
              </div>
            </div>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="bg-light border-0">
            <h6 className="text-muted mb-3">
              <Phone size={16} className="me-2" />
              Contact Guidelines
            </h6>
            
            <div className="small text-muted">
              <div className="mb-3">
                <strong>Primary Contact:</strong> Someone who knows your adventure plans and can coordinate response if needed.
              </div>
              
              <div className="mb-3">
                <strong>Secondary Contacts:</strong> Additional people to notify, such as family members or close friends.
              </div>
              
              <div className="mb-3">
                <strong>Local Contacts:</strong> If adventuring far from home, include someone familiar with the local area.
              </div>
              
              <div className="mb-0">
                <strong>Information Needed:</strong> Name, relationship, phone number, and email address for each contact.
              </div>
            </div>
          </Card>

          <Alert variant="warning" className="mt-3">
            <Mail size={16} className="me-2" />
            <strong>Note:</strong> All contacts will receive detailed information about your adventure plan and emergency procedures.
          </Alert>
        </Col>
      </Row>
    </div>
  );
};