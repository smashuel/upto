import React from 'react';
import { Container } from 'react-bootstrap';
import { Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer py-4">
      <Container>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-center">
          <div className="d-flex align-items-center mb-3 mb-md-0">
            <img src="/location.png" alt="Location" style={{ width: '24px', height: '24px' }} className="me-2" />
            <span className="fw-semibold h5 mb-0">upto</span>
          </div>
          
          <div className="d-flex align-items-center text-muted small">
            <span>Built with</span>
            <Heart className="mx-2 text-danger" size={16} />
            <span>for adventurers everywhere</span>
          </div>
        </div>
        
        <hr className="my-3" />
        
        <div className="text-center text-muted small">
          <p className="mb-0">&copy; 2024 upto. Stay safe, adventure responsibly.</p>
        </div>
      </Container>
    </footer>
  );
};