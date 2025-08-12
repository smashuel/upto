import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Modal } from 'react-bootstrap';
import { Share2, Copy, Mail, MessageSquare, Smartphone, QrCode, Eye, Settings, ExternalLink } from 'lucide-react';
import { Button, Card } from '../ui';
import { Adventure } from '../../types/adventure';
import toast from 'react-hot-toast';

interface AdventureShareProps {
  adventure: Adventure;
  onClose: () => void;
  show: boolean;
}

export const AdventureShare: React.FC<AdventureShareProps> = ({ adventure, onClose, show }) => {
  const [shareUrl, setShareUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [shareStats, setShareStats] = useState({ views: 0, lastAccessed: null });

  useEffect(() => {
    if (show && adventure) {
      // Generate unique share URL
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/adventure/${adventure.shareToken}`;
      setShareUrl(url);

      // Generate QR code (in a real app, you'd use a QR code library)
      generateQRCode(url);

      // Load share statistics
      loadShareStats();
    }
  }, [show, adventure]);

  const generateQRCode = async (url: string) => {
    // Simulate QR code generation (in production, use a library like 'qrcode')
    const qrData = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" fill="black" font-size="12">QR Code for: ${url.substring(0, 30)}...</text></svg>`;
    setQrCodeUrl(qrData);
  };

  const loadShareStats = () => {
    // Load from localStorage (in production, from API)
    const stats = localStorage.getItem(`share-stats-${adventure.id}`);
    if (stats) {
      setShareStats(JSON.parse(stats));
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Adventure Plan: ${adventure.title}`);
    const body = encodeURIComponent(
      `Hi!\n\nI wanted to share my upcoming adventure plan with you for safety purposes.\n\n` +
      `Adventure: ${adventure.title}\n` +
      `Start: ${adventure.startDate.toLocaleString()}\n` +
      `Location: ${adventure.location.name}\n\n` +
      `You can view the full details and track my progress here:\n${shareUrl}\n\n` +
      `This link allows you to see my planned route, check-in schedule, and emergency contacts. ` +
      `If I miss a scheduled check-in, you'll be notified automatically.\n\n` +
      `Thanks for helping keep me safe!\n\n` +
      `Sent via upto Adventure Safety`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleSMSShare = () => {
    const message = encodeURIComponent(
      `Adventure Safety Update: I'm going on "${adventure.title}" starting ${adventure.startDate.toLocaleDateString()}. ` +
      `Track my progress and get safety updates: ${shareUrl}`
    );
    window.open(`sms:?body=${message}`);
  };

  const handleWhatsAppShare = () => {
    const message = encodeURIComponent(
      `🏔️ *Adventure Safety Plan*\n\n` +
      `*${adventure.title}*\n` +
      `📅 Start: ${adventure.startDate.toLocaleDateString()}\n` +
      `📍 Location: ${adventure.location.name}\n\n` +
      `Track my progress and safety check-ins: ${shareUrl}\n\n` +
      `You'll get automatic notifications if I miss a check-in. Thanks for helping keep me safe! 🙏`
    );
    window.open(`https://wa.me/?text=${message}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return 'text-fjord';
      case 'active': return 'text-forest';
      case 'completed': return 'text-sage';
      case 'overdue': return 'text-danger';
      case 'cancelled': return 'text-granite';
      default: return 'text-muted';
    }
  };

  const getVisibilityBadge = (visibility: string) => {
    switch (visibility) {
      case 'public': return <span className="badge bg-success">Public</span>;
      case 'contacts-only': return <span className="badge bg-warning">Contacts Only</span>;
      case 'private': return <span className="badge bg-secondary">Private</span>;
      default: return null;
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" centered>
      <Modal.Header closeButton className="bg-gradient-fjord text-white">
        <Modal.Title className="d-flex align-items-center">
          <Share2 className="me-2" size={24} />
          Share Adventure Plan
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <Container fluid>
          {/* Adventure Summary */}
          <Card className="mb-4 card-adventure">
            <Row>
              <Col md={8}>
                <div className="d-flex align-items-start justify-content-between mb-3">
                  <div>
                    <h4 className="fw-bold text-charcoal mb-1">{adventure.title}</h4>
                    <p className="text-stone mb-2">{adventure.description}</p>
                  </div>
                  <div className="text-end">
                    <span className={`badge badge-adventure me-2 ${getStatusColor(adventure.status)}`}>
                      {adventure.status.charAt(0).toUpperCase() + adventure.status.slice(1)}
                    </span>
                    {getVisibilityBadge(adventure.visibility)}
                  </div>
                </div>
                <div className="row text-center">
                  <div className="col-4">
                    <div className="text-fjord fw-bold">{adventure.startDate.toLocaleDateString()}</div>
                    <div className="small text-muted">Start Date</div>
                  </div>
                  <div className="col-4">
                    <div className="text-copper fw-bold">{adventure.location.name}</div>
                    <div className="small text-muted">Location</div>
                  </div>
                  <div className="col-4">
                    <div className="text-forest fw-bold">{adventure.emergencyContacts.length}</div>
                    <div className="small text-muted">Contacts</div>
                  </div>
                </div>
              </Col>
              <Col md={4} className="text-center">
                <div className="bg-ice rounded p-3">
                  <QrCode className="text-fjord mb-2" size={48} />
                  <div className="small text-granite">Scan to view</div>
                  {qrCodeUrl && (
                    <img 
                      src={qrCodeUrl} 
                      alt="QR Code" 
                      className="img-fluid mt-2"
                      style={{ maxWidth: '100px' }}
                    />
                  )}
                </div>
              </Col>
            </Row>
          </Card>

          {/* Share Options */}
          <Row className="g-3 mb-4">
            <Col md={6}>
              <Card className="h-100 text-center card-premium">
                <h5 className="fw-bold text-fjord mb-3">Share Link</h5>
                <div className="share-link-container mb-3">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="form-control share-link-input text-center mb-2"
                  />
                  <Button
                    variant={copySuccess ? 'success' : 'fjord'}
                    size="sm"
                    icon={copySuccess ? Eye : Copy}
                    onClick={handleCopyLink}
                    className="w-100"
                  >
                    {copySuccess ? 'Copied!' : 'Copy Link'}
                  </Button>
                </div>
                <div className="small text-granite">
                  <Eye size={14} className="me-1" />
                  {shareStats.views} views
                  {shareStats.lastAccessed && (
                    <span className="ms-2">• Last viewed {new Date(shareStats.lastAccessed).toLocaleDateString()}</span>
                  )}
                </div>
              </Card>
            </Col>
            
            <Col md={6}>
              <Card className="h-100">
                <h5 className="fw-bold text-fjord mb-3 text-center">Share via</h5>
                <div className="d-grid gap-2">
                  <Button variant="highland" icon={Mail} onClick={handleEmailShare}>
                    Email
                  </Button>
                  <Button variant="forest" icon={MessageSquare} onClick={handleWhatsAppShare}>
                    WhatsApp
                  </Button>
                  <Button variant="sky" icon={Smartphone} onClick={handleSMSShare}>
                    Text Message
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>

          {/* Privacy & Settings */}
          <Card className="mb-3">
            <h6 className="fw-bold text-fjord mb-3 d-flex align-items-center">
              <Settings className="me-2" size={18} />
              Privacy Settings
            </h6>
            <div className="row">
              <div className="col-md-6">
                <div className="form-check mb-2">
                  <input className="form-check-input" type="radio" name="visibility" value="public" 
                    checked={adventure.visibility === 'public'} readOnly />
                  <label className="form-check-label">
                    <strong>Public</strong> - Anyone with link can view
                  </label>
                </div>
                <div className="form-check mb-2">
                  <input className="form-check-input" type="radio" name="visibility" value="contacts-only" 
                    checked={adventure.visibility === 'contacts-only'} readOnly />
                  <label className="form-check-label">
                    <strong>Contacts Only</strong> - Only emergency contacts can view
                  </label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="radio" name="visibility" value="private" 
                    checked={adventure.visibility === 'private'} readOnly />
                  <label className="form-check-label">
                    <strong>Private</strong> - No sharing allowed
                  </label>
                </div>
              </div>
              <div className="col-md-6">
                <div className="bg-ice rounded p-3">
                  <h6 className="text-fjord fw-bold mb-2">What others can see:</h6>
                  <ul className="list-unstyled small mb-0">
                    <li>✓ Adventure details & route</li>
                    <li>✓ Start/end times</li>
                    <li>✓ Check-in status</li>
                    <li>✓ Emergency contact info</li>
                    <li>✗ Personal emergency details</li>
                    <li>✗ Exact real-time location</li>
                  </ul>
                </div>
              </div>
            </div>
          </Card>

          {/* Safety Reminder */}
          <div className="bg-golden bg-opacity-10 border border-warning rounded p-3 text-center">
            <div className="text-copper fw-bold mb-1">Safety Reminder</div>
            <div className="small text-granite">
              Your emergency contacts will receive automatic notifications if you miss scheduled check-ins. 
              Make sure they know to expect updates and understand how to use the tracking link.
            </div>
          </div>
        </Container>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          Close
        </Button>
        <Button variant="fjord" icon={ExternalLink} onClick={() => window.open(shareUrl, '_blank')}>
          Preview Public View
        </Button>
      </Modal.Footer>
    </Modal>
  );
};