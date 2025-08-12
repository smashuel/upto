import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { 
  Plus, Shield, Clock, Share2, MapPin, Users, AlertCircle, 
  Compass, Star, Quote, ArrowRight, Zap 
} from 'lucide-react';
import { Button, Card } from '../components/ui';

export const Home: React.FC = () => {
  const features = [
    {
      icon: Shield,
      title: 'Safety First',
      description: 'Create detailed adventure plans with emergency contacts and automated check-in schedules.',
      color: 'forest'
    },
    {
      icon: Clock,
      title: 'Smart Check-ins',
      description: 'Set custom intervals for safety check-ins. Miss one, and your contacts are automatically notified.',
      color: 'terracotta'
    },
    {
      icon: Share2,
      title: 'Easy Sharing',
      description: 'Send your adventure details to trusted contacts with a simple, shareable link.',
      color: 'sage'
    },
    {
      icon: MapPin,
      title: 'Route Planning',
      description: 'Interactive maps let you plan routes and add waypoints so others know exactly where you\'ll be.',
      color: 'sunrise'
    },
    {
      icon: Users,
      title: 'Safety Network',
      description: 'Manage your emergency contacts and keep your entire safety network informed.',
      color: 'forest'
    },
    {
      icon: AlertCircle,
      title: 'Smart Alerts',
      description: 'Automatic notifications when adventures exceed their planned duration or check-ins are missed.',
      color: 'terracotta'
    },
  ];

  const testimonials = [
    {
      name: "Sarah Chen",
      role: "Mountain Guide",
      quote: "upto has become essential for my guiding business. My clients' families have peace of mind, and I can focus on the adventure.",
      rating: 5,
      image: "🏔️"
    },
    {
      name: "Jake Morrison",
      role: "Solo Hiker",
      quote: "The automated check-ins and easy sharing features make solo hiking so much safer. My family always knows where I am.",
      rating: 5,
      image: "🥾"
    },
    {
      name: "Lisa Park",
      role: "Climbing Instructor",
      quote: "Perfect for organizing group climbs. Everyone stays connected, and the safety features give us all confidence.",
      rating: 5,
      image: "🧗‍♀️"
    }
  ];

  const stats = [
    { value: "10K+", label: "Adventures Planned" },
    { value: "99.8%", label: "Successful Check-ins" },
    { value: "24/7", label: "Safety Monitoring" },
    { value: "50+", label: "Countries Served" }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-overlay"></div>
        
        {/* Floating Elements */}
        <div className="parallax-element" style={{ top: '10%', left: '10%' }}>
          <img src="/location.png" alt="Location" style={{ width: '60px', height: '60px' }} />
        </div>
        <div className="parallax-element" style={{ top: '20%', right: '15%', animationDelay: '2s' }}>
          <Compass size={40} />
        </div>
        <div className="parallax-element" style={{ bottom: '30%', left: '20%', animationDelay: '4s' }}>
          <MapPin size={50} />
        </div>
        
        <Container className="hero-content">
          <Row className="align-items-top min-vh-100">
            <Col lg={6} className="text-white">
              <div className="fade-in">
                <h1 className="text-hero mb-4">
                  Adventure with <span className="text-forest">Confidence</span>
                </h1>
                <p className="lead mb-5 text-hero">
                  upto is your premium safety companion for outdoor adventures. Create detailed plans, 
                  set automated check-ins, and keep your loved ones informed so you can focus 
                  on what matters most—the adventure ahead.
                </p>
                <div className="d-flex flex-column flex-sm-row gap-3">
                  <Link to="/create" className="text-decoration-none">
                    <Button variant="sunrise" size="lg" icon={Plus} className="w-100">
                      Start Planning Your Adventure
                    </Button>
                  </Link>
                  <Button variant="outline-light" size="lg" icon={ArrowRight} className="w-100">
                    See How It Works
                  </Button>
                </div>
              </div>
            </Col>
            <Col lg={6} className="text-center slide-up">
              <div className="position-relative">
                <div className="bg-white rounded-3 p-4 shadow-lg" style={{ 
                  background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.7) 100%)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                  <div className="d-flex align-items-center mb-3">
                    <div className="bg-gradient-forest rounded-circle p-2 me-3">
                      <img src="/location.png" alt="Location" style={{ width: '20px', height: '20px' }} className="text-white" />
                    </div>
                    <div className="text-start">
                      <h6 className="mb-1 text-forest fw-bold">Mt. Washington Day Hike</h6>
                      <small className="text-muted">Starting in 2 hours</small>
                    </div>
                    <div className="ms-auto">
                      <span className="badge badge-adventure">Active</span>
                    </div>
                  </div>
                  <div className="progress progress-adventure mb-3" style={{ height: '8px' }}>
                    <div className="progress-bar" style={{ width: '35%' }}></div>
                  </div>
                  <div className="row text-center">
                    <div className="col-4">
                      <div className="small text-sage fw-bold">6.2mi</div>
                      <div className="small text-muted">Distance</div>
                    </div>
                    <div className="col-4">
                      <div className="small text-terracotta fw-bold">4h 30m</div>
                      <div className="small text-muted">Duration</div>
                    </div>
                    <div className="col-4">
                      <div className="small text-sunrise fw-bold">3 contacts</div>
                      <div className="small text-muted">Notified</div>
                    </div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      {/* Stats Section */}
      <section className="py-5 bg-gradient-forest">
        <Container>
          <Row className="text-center text-white">
            {stats.map((stat, index) => (
              <Col key={index} sm={6} lg={3} className="mb-4 mb-lg-0">
                <div className="fade-in" style={{ animationDelay: `${index * 0.2}s` }}>
                  <h2 className="display-4 fw-bold mb-2 text-hero">{stat.value}</h2>
                  <p className="mb-0 text-light">{stat.label}</p>
                </div>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      {/* Features Section */}
      <section className="py-5">
        <Container>
          <Row className="text-center mb-5">
            <Col lg={8} className="mx-auto">
              <h2 className="display-5 fw-bold mb-4 text-forest">
                Why Choose upto?
              </h2>
              <p className="lead text-stone">
                Every outdoor adventure carries inherent risks. upto bridges the gap between 
                independence and safety, giving you the freedom to explore while keeping 
                your loved ones connected and informed.
              </p>
            </Col>
          </Row>

          <Row className="g-4">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Col key={index} md={6} lg={4}>
                  <div 
                    className="feature-card h-100 slide-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="feature-icon">
                      <Icon />
                    </div>
                    <h4 className="fw-bold mb-3 text-charcoal">{feature.title}</h4>
                    <p className="text-stone mb-0">{feature.description}</p>
                  </div>
                </Col>
              );
            })}
          </Row>
        </Container>
      </section>

      {/* Testimonials Section */}
      <section className="py-5 bg-cream">
        <Container>
          <Row className="text-center mb-5">
            <Col lg={8} className="mx-auto">
              <h2 className="display-5 fw-bold mb-4 text-forest">
                Trusted by Adventurers Worldwide
              </h2>
              <p className="lead text-stone">
                From weekend warriors to professional guides, outdoor enthusiasts 
                trust upto to keep them connected and safe.
              </p>
            </Col>
          </Row>

          <Row className="g-4">
            {testimonials.map((testimonial, index) => (
              <Col key={index} lg={4}>
                <Card className="h-100 card-premium text-center">
                  <div className="mb-3">
                    <div className="display-1 mb-3">{testimonial.image}</div>
                    <div className="d-flex justify-content-center mb-3">
                      {Array.from({ length: testimonial.rating }, (_, i) => (
                        <Star key={i} size={16} className="text-warning me-1" fill="currentColor" />
                      ))}
                    </div>
                  </div>
                  <Quote className="text-sage mb-3" size={32} />
                  <p className="mb-4 fst-italic text-slate">"{testimonial.quote}"</p>
                  <div className="mt-auto">
                    <h6 className="fw-bold text-charcoal mb-1">{testimonial.name}</h6>
                    <small className="text-stone">{testimonial.role}</small>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      {/* CTA Section */}
      <section className="py-5 bg-gradient-earth">
        <Container>
          <Row className="text-center text-white">
            <Col lg={8} className="mx-auto">
              <Zap className="mb-4 text-warning" size={64} />
              <h2 className="display-5 fw-bold mb-4 text-hero">
                Ready to Adventure Safely?
              </h2>
              <p className="lead mb-5 text-light">
                Join thousands of adventurers who trust upto to keep them connected. 
                Create your first adventure plan in under 5 minutes.
              </p>
              <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center">
                <Link to="/create" className="text-decoration-none">
                  <Button variant="light" size="lg" icon={Plus} className="shadow-lg">
                    Create Your First Adventure
                  </Button>
                </Link>
                <Button variant="outline-light" size="lg" icon={Users}>
                  Learn More
                </Button>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      {/* Recent Adventures */}
      <section className="py-5">
        <Container>
          <Row>
            <Col lg={8} className="mx-auto">
              <Card className="card-adventure text-center">
                <div className="p-5">
                  <img src="/location.png" alt="Location" style={{ width: '64px', height: '64px' }} className="mb-4" />
                  <h3 className="fw-bold mb-3 text-charcoal">Your Adventures Await</h3>
                  <p className="text-stone mb-4">
                    Once you create your first adventure plan, you'll see all your upcoming 
                    and completed adventures here. Get started and take the first step 
                    toward safer outdoor exploration.
                  </p>
                  <Link to="/create">
                    <Button variant="adventure" size="lg" icon={Plus}>
                      Create Your First Adventure
                    </Button>
                  </Link>
                </div>
              </Card>
            </Col>
          </Row>
        </Container>
      </section>
    </div>
  );
};