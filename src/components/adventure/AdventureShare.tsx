import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Modal } from 'react-bootstrap';
import { Share2, Copy, Mail, MessageSquare, Smartphone, QrCode, Eye, ExternalLink } from 'lucide-react';
import { Button, Card } from '../ui';
import { TripLink } from '../../types/adventure';
import toast from 'react-hot-toast';

interface AdventureShareProps {
  adventure: TripLink;
  onClose: () => void;
  show: boolean;
}

export const AdventureShare: React.FC<AdventureShareProps> = ({ adventure, onClose, show }) => {
  const [shareUrl, setShareUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [shareStats, setShareStats] = useState({ views: 0, lastAccessed: null as string | null });

  useEffect(() => {
    if (show && adventure) {
      const url = `${window.location.origin}/triplink/${adventure.shareToken}`;
      setShareUrl(url);
      generateQRCode(url);
      loadShareStats();
    }
  }, [show, adventure]);

  const generateQRCode = (url: string) => {
    const qrData = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" fill="black" font-size="12">QR: ${url.substring(0, 30)}...</text></svg>`;
    setQrCodeUrl(qrData);
  };

  const loadShareStats = () => {
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
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const startDateStr = new Date(adventure.startDate).toLocaleString();
  const startDateShort = new Date(adventure.startDate).toLocaleDateString();

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Trip Plan: ${adventure.title}`);
    const body = encodeURIComponent(
      `Hi!\n\nI wanted to share my upcoming trip plan with you for safety purposes.\n\n` +
      `Trip: ${adventure.title}\n` +
      `Start: ${startDateStr}\n` +
      `Location: ${adventure.location.name}\n\n` +
      `View details here:\n${shareUrl}\n\n` +
      `Sent via upto`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleSMSShare = () => {
    const message = encodeURIComponent(
      `Trip Safety Update: I'm going on "${adventure.title}" starting ${startDateShort}. ` +
      `Track my progress: ${shareUrl}`
    );
    window.open(`sms:?body=${message}`);
  };

  const handleWhatsAppShare = () => {
    const message = encodeURIComponent(
      `🏔️ *Trip Safety Plan*\n\n` +
      `*${adventure.title}*\n` +
      `📅 Start: ${startDateShort}\n` +
      `📍 Location: ${adventure.location.name}\n\n` +
      `Track my progress: ${shareUrl}`
    );
    window.open(`https://wa.me/?text=${message}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return 'text-fjord';
      case 'active': return 'text-forest';
      case 'completed': return 'text-sage';
      default: return 'text-muted';
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" centered>
      <Modal.Header closeButton className="bg-gradient-fjord text-white">
        <Modal.Title className="d-flex align-items-center">
          <Share2 className="me-2" size={24} />
          Share TripLink
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <Container fluid>
          {/* Trip Summary */}
          <Card className="mb-4 card-adventure">
            <Row>
              <Col md={8}>
                <div className="d-flex align-items-start justify-content-between mb-3">
                  <div>
                    <h4 className="fw-bold text-charcoal mb-1">{adventure.title}</h4>
                    <p className="text-stone mb-2">{adventure.description}</p>
                  </div>
                  <span className={`badge badge-adventure ${getStatusColor(adventure.status)}`}>
                    {adventure.status.charAt(0).toUpperCase() + adventure.status.slice(1)}
                  </span>
                </div>
                <div className="row text-center">
                  <div className="col-4">
                    <div className="text-fjord fw-bold">{startDateShort}</div>
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
                    <img src={qrCodeUrl} alt="QR Code" className="img-fluid mt-2" style={{ maxWidth: '100px' }} />
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
                  <Button variant="highland" icon={Mail} onClick={handleEmailShare}>Email</Button>
                  <Button variant="success" icon={MessageSquare} onClick={handleWhatsAppShare}>WhatsApp</Button>
                  <Button variant="sky" icon={Smartphone} onClick={handleSMSShare}>Text Message</Button>
                </div>
              </Card>
            </Col>
          </Row>

          <div className="bg-golden bg-opacity-10 border border-warning rounded p-3 text-center">
            <div className="text-copper fw-bold mb-1">Safety Reminder</div>
            <div className="small text-granite">
              Send this link to your emergency contacts before you head out.
            </div>
          </div>
        </Container>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>Close</Button>
        <Button variant="fjord" icon={ExternalLink} onClick={() => window.open(shareUrl, '_blank')}>
          Preview Link
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
