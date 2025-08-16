import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert, Spinner, Card } from 'react-bootstrap';
import { AlertTriangle, MapPin, Phone, MessageSquare, Mail, Copy, Volume2, Wifi, WifiOff } from 'lucide-react';
import { LocationDisplay } from './LocationDisplay';
import what3wordsService from '../../services/what3words';
import { What3WordsLocation } from '../../types/what3words';

interface EmergencyLocationShareProps {
  show: boolean;
  onHide: () => void;
  currentLocation?: What3WordsLocation | null;
  emergencyContacts?: Array<{
    name: string;
    phone?: string;
    email?: string;
  }>;
}

export const EmergencyLocationShare: React.FC<EmergencyLocationShareProps> = ({
  show,
  onHide,
  currentLocation,
  emergencyContacts = []
}) => {
  const [location, setLocation] = useState<What3WordsLocation | null>(currentLocation || null);
  const [isLoading, setIsLoading] = useState(!currentLocation);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (show && !location) {
      getCurrentLocation();
    }
    
    // Check API availability
    what3wordsService.isApiAvailable().then(setApiAvailable);
  }, [show]);

  const getCurrentLocation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const loc = await what3wordsService.getCurrentLocationWhat3Words();
      if (loc) {
        setLocation(loc);
        setLastUpdated(new Date());
      } else {
        setError('Unable to get your current location. Please check your location permissions.');
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      setError('Error getting your current location. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const shareViaSMS = (contact: { name: string; phone?: string }) => {
    if (!contact.phone || !location) return;

    const message = createLocationMessage();
    const smsUrl = `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_blank');
  };

  const shareViaEmail = (contact: { name: string; email?: string }) => {
    if (!contact.email || !location) return;

    const subject = 'Emergency Location - Immediate Assistance Needed';
    const body = createLocationMessage(true);
    const emailUrl = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(emailUrl, '_blank');
  };

  const shareViaPhone = (contact: { name: string; phone?: string }) => {
    if (!contact.phone) return;
    window.open(`tel:${contact.phone}`, '_blank');
  };

  const createLocationMessage = (isEmail: boolean = false) => {
    if (!location) return '';

    const what3words = location.words ? `///${location.words}` : null;
    const coordinates = `${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}`;
    const timestamp = new Date().toLocaleString();

    let message = 'EMERGENCY LOCATION UPDATE\n\n';
    message += `Time: ${timestamp}\n\n`;

    if (what3words) {
      message += `what3words address: ${what3words}\n`;
      message += `(Say: "${what3wordsService.formatWhat3WordsForVoice(location.words!)}")\n\n`;
    }

    message += `GPS Coordinates: ${coordinates}\n\n`;

    if (location.nearestPlace) {
      message += `Near: ${location.nearestPlace}`;
      if (location.country) {
        message += `, ${location.country}`;
      }
      message += '\n\n';
    }

    if (isEmail) {
      message += 'INSTRUCTIONS FOR EMERGENCY SERVICES:\n';
      if (what3words) {
        message += `• Give them the what3words address: ${what3words}\n`;
        message += '• Most emergency services now accept what3words\n';
        message += '• If they don\'t support what3words, use the GPS coordinates above\n';
      } else {
        message += '• Give them the GPS coordinates above for exact location\n';
      }
      message += `• Google Maps link: https://www.google.com/maps?q=${location.coordinates.lat},${location.coordinates.lng}\n`;
      if (what3words) {
        message += `• what3words map: https://w3w.co/${location.words}\n`;
      }
      message += '\n';
    }

    message += 'Sent via upto Adventure Safety';
    
    return message;
  };

  const copyLocationText = async () => {
    const message = createLocationMessage(true);
    try {
      await navigator.clipboard.writeText(message);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const speakLocation = () => {
    if (!location) return;

    let text = 'Emergency location: ';
    
    if (location.words) {
      text += `what3words address is ${what3wordsService.formatWhat3WordsForVoice(location.words)}. `;
    }
    
    text += `GPS coordinates are ${location.coordinates.lat.toFixed(3)}, ${location.coordinates.lng.toFixed(3)}. `;
    
    if (location.nearestPlace) {
      text += `Near ${location.nearestPlace}`;
      if (location.country) {
        text += ` in ${location.country}`;
      }
    }

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.7; // Slower for clarity
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <Modal 
      show={show} 
      onHide={onHide} 
      size="lg" 
      centered
      backdrop="static"
      className="emergency-modal"
    >
      <Modal.Header className="bg-danger text-white">
        <Modal.Title className="d-flex align-items-center">
          <AlertTriangle size={24} className="me-2" />
          Emergency Location Share
        </Modal.Title>
        <div className="ms-auto d-flex align-items-center">
          {apiAvailable ? (
            <Wifi size={20} className="text-success" />
          ) : (
            <WifiOff size={20} className="text-warning" />
          )}
        </div>
      </Modal.Header>

      <Modal.Body className="p-4">
        {isLoading ? (
          <div className="text-center py-5">
            <Spinner animation="border" size="sm" className="text-danger" />
            <div className="mt-3">
              <h5>Getting your current location...</h5>
              <p className="text-muted">This may take a few seconds</p>
            </div>
          </div>
        ) : error ? (
          <Alert variant="danger">
            <AlertTriangle size={20} className="me-2" />
            {error}
            <div className="mt-3">
              <Button variant="outline-danger" onClick={getCurrentLocation}>
                Try Again
              </Button>
            </div>
          </Alert>
        ) : location ? (
          <div>
            {/* Location Display */}
            <LocationDisplay
              location={location}
              title="Your Current Location"
              emergency={true}
              size="lg"
              showMapLink={true}
              showCopyButtons={true}
              showPronunciation={true}
            />

            {/* Last updated info */}
            {lastUpdated && (
              <div className="text-center text-muted mt-2 mb-4">
                <small>
                  Location updated: {lastUpdated.toLocaleTimeString()}
                </small>
              </div>
            )}

            {/* Quick actions */}
            <div className="mb-4">
              <h6 className="mb-3">Quick Actions</h6>
              <div className="d-grid gap-2">
                <Button
                  variant="danger"
                  size="lg"
                  onClick={copyLocationText}
                  className="fw-bold"
                >
                  <Copy size={20} className="me-2" />
                  Copy Complete Location Info
                </Button>

                <Button
                  variant="outline-primary"
                  onClick={speakLocation}
                >
                  <Volume2 size={16} className="me-2" />
                  Hear Location Spoken Aloud
                </Button>

                <Button
                  variant="outline-success"
                  onClick={getCurrentLocation}
                  disabled={isLoading}
                >
                  <MapPin size={16} className="me-2" />
                  Update Current Location
                </Button>
              </div>
            </div>

            {/* Emergency contacts */}
            {emergencyContacts.length > 0 && (
              <div>
                <h6 className="mb-3">Share with Emergency Contacts</h6>
                <div className="row g-2">
                  {emergencyContacts.map((contact, index) => (
                    <div key={index} className="col-12">
                      <Card className="border-warning">
                        <Card.Body className="py-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <div className="fw-bold">{contact.name}</div>
                              <div className="small text-muted">
                                {contact.phone && (
                                  <span className="me-3">📞 {contact.phone}</span>
                                )}
                                {contact.email && (
                                  <span>✉️ {contact.email}</span>
                                )}
                              </div>
                            </div>
                            <div className="d-flex gap-1">
                              {contact.phone && (
                                <>
                                  <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={() => shareViaPhone(contact)}
                                    title="Call"
                                  >
                                    <Phone size={14} />
                                  </Button>
                                  <Button
                                    variant="outline-success"
                                    size="sm"
                                    onClick={() => shareViaSMS(contact)}
                                    title="Send SMS"
                                  >
                                    <MessageSquare size={14} />
                                  </Button>
                                </>
                              )}
                              {contact.email && (
                                <Button
                                  variant="outline-info"
                                  size="sm"
                                  onClick={() => shareViaEmail(contact)}
                                  title="Send Email"
                                >
                                  <Mail size={14} />
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency services info */}
            <Alert variant="info" className="mt-4">
              <h6 className="fw-bold mb-2">For Emergency Services (911/999/112):</h6>
              <ul className="mb-0 small">
                {location.words ? (
                  <>
                    <li>First try giving them the what3words address: <strong>///{location.words}</strong></li>
                    <li>Say it clearly: "<strong>{what3wordsService.formatWhat3WordsForVoice(location.words)}</strong>"</li>
                    <li>If they don't use what3words, give GPS coordinates: <strong>{location.coordinates.lat.toFixed(6)}, {location.coordinates.lng.toFixed(6)}</strong></li>
                  </>
                ) : (
                  <li>Give them the GPS coordinates: <strong>{location.coordinates.lat.toFixed(6)}, {location.coordinates.lng.toFixed(6)}</strong></li>
                )}
                <li>Tell them you're using the upto adventure safety app</li>
              </ul>
            </Alert>
          </div>
        ) : null}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};