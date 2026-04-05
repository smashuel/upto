import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui';

export const Home: React.FC = () => {
  return (
    <div className="home-minimal">
      {/* Full Screen Hero Section */}
      <section className="hero-section-minimal">
        <div className="hero-overlay"></div>

        <div className="hero-content-minimal">
          <div className="text-center text-white">
            <div className="fade-in">
              {/* Logo */}
              <img
                src="/Fresh Teal Logo for Upto with Aqua Accents (1).png"
                alt="upto Logo"
                className="mb-4"
                style={{
                  maxWidth: '400px',
                  width: '80%',
                  height: 'auto',
                  filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.3))'
                }}
              />

              {/* Tagline */}
              <p className="h5 mb-5 text-light fw-normal" style={{ opacity: 0.95 }}>
                Outdoor Trip Planning – For recreationalists and professionals
              </p>

              {/* CTA Buttons */}
              <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center align-items-center mt-5" style={{ paddingBottom: '3rem' }}>
                <div className="button-with-description">
                  <Link to="/create" className="text-decoration-none">
                    <Button
                      variant="sunrise"
                      size="lg"
                      icon={Plus}
                      style={{
                        minWidth: '220px',
                        fontSize: '1.1rem',
                        padding: '0.75rem 2rem'
                      }}
                    >
                      Create TripLink
                    </Button>
                  </Link>
                  <p className="button-description text-light">
                    Create detailed TripLinks, set automated check-ins, and keep your loved ones informed so you can focus on what matters most—the journey ahead
                  </p>
                </div>

                <Link to="/profile" className="text-decoration-none">
                  <Button
                    variant="outline-light"
                    size="lg"
                    icon={ArrowRight}
                    style={{
                      minWidth: '220px',
                      fontSize: '1.1rem',
                      padding: '0.75rem 2rem'
                    }}
                  >
                    View Profile
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};