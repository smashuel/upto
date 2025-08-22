import React, { useState } from 'react';
import { InputGroup, Form, Alert } from 'react-bootstrap';
import { Share2, Copy, Check, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../ui';

interface TripLinkShareLinkProps {
  tripLinkId: string;
}

export const TripLinkShareLink: React.FC<TripLinkShareLinkProps> = ({ tripLinkId }) => {
  const [copied, setCopied] = useState(false);
  
  // Generate the shareable link
  const shareUrl = `${window.location.origin}/triplink/${tripLinkId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Share link copied to clipboard!');
      
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    } catch (error) {
      toast.error('Failed to copy link to clipboard');
      console.error('Copy failed:', error);
    }
  };

  const handleOpenLink = () => {
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">Share Your Adventure Plan</h3>
        <p className="text-muted">Send this link to your emergency contacts and anyone who needs to know your plans</p>
      </div>

      <Card>
        <div className="text-center mb-4">
          <div className="share-link-container">
            <Share2 size={48} className="text-primary mb-3" />
            <h5 className="mb-2">Your TripLink is Ready!</h5>
            <p className="text-muted mb-4">
              Share this link with your emergency contacts so they can view your trip details and track your progress.
            </p>
            
            <InputGroup size="lg" className="mb-3">
              <Form.Control
                value={shareUrl}
                readOnly
                className="share-link-input text-center"
                style={{ fontFamily: 'monospace' }}
              />
              <Button
                variant={copied ? 'success' : 'primary'}
                onClick={handleCopyLink}
                className={`copy-button ${copied ? 'copied' : ''}`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </InputGroup>

            <div className="d-grid d-md-block">
              <Button
                variant="outline-primary"
                onClick={handleOpenLink}
                icon={ExternalLink}
                className="me-md-2"
              >
                Preview Link
              </Button>
            </div>
          </div>
        </div>

        <Alert variant="info">
          <div className="d-flex align-items-start">
            <Share2 size={20} className="me-3 mt-1 text-info" />
            <div>
              <strong>Sharing Tips:</strong>
              <ul className="mt-2 mb-0 small">
                <li>Send this link to all your emergency contacts before you begin your adventure</li>
                <li>Include it in your trip plans or permit applications</li>
                <li>Bookmark it yourself for easy access to check-in and update your status</li>
                <li>The link will remain active throughout your adventure and can be accessed anytime</li>
              </ul>
            </div>
          </div>
        </Alert>

        <Alert variant="success">
          <div className="d-flex align-items-center">
            <Check size={20} className="me-2 text-success" />
            <strong>Your adventure plan has been saved successfully!</strong>
          </div>
        </Alert>
      </Card>
    </div>
  );
};