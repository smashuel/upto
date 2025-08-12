import React, { useState } from 'react';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { Plus, User, AlertTriangle } from 'lucide-react';
import { EmergencyLocationShare } from '../what3words/EmergencyLocationShare';

export const Header: React.FC = () => {
  const location = useLocation();
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  const navItems = [
    { path: '/', label: 'Home', icon: () => <img src="/location.png" alt="Home" style={{ width: '16px', height: '16px' }} /> },
    { path: '/create', label: 'Create Adventure', icon: Plus },
    { path: '/profile', label: 'Profile', icon: User },
  ];

  const isActivePath = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <Navbar expand="lg" className="header" style={{backgroundColor: 'transparent', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000}} variant="light">
      <Container>
        <Navbar.Brand as={Link} to="/" className="d-flex align-items-center text-decoration-none">
          <img 
            src="/Fresh Teal Logo for Upto with Aqua Accents (1).png" 
            alt="upto Logo" 
            height="80"
          />
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="ms-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(item.path);
              
              return (
                <Nav.Link
                  key={item.path}
                  as={Link}
                  to={item.path}
                  className={`nav-link d-flex align-items-center mx-2 px-3 py-2 rounded ${active ? 'active' : ''}`}
                  style={{ color: '#212529', backgroundColor: active ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)' }}
                >
                  <div className="me-2">
                    <Icon size={16} />
                  </div>
                  {item.label}
                </Nav.Link>
              );
            })}
            
            {/* Emergency Location Share Button */}
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowEmergencyModal(true)}
              className="ms-3 d-flex align-items-center"
              style={{ 
                backgroundColor: 'rgba(220, 53, 69, 0.9)', 
                borderColor: 'rgba(220, 53, 69, 0.9)',
                backdropFilter: 'blur(10px)'
              }}
            >
              <AlertTriangle size={14} className="me-1" />
              Emergency
            </Button>
          </Nav>
        </Navbar.Collapse>
      </Container>
      
      {/* Emergency Location Share Modal */}
      <EmergencyLocationShare
        show={showEmergencyModal}
        onHide={() => setShowEmergencyModal(false)}
        emergencyContacts={[]} // TODO: Get from user's saved contacts
      />
    </Navbar>
  );
};