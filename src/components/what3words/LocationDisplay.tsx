import React, { useState } from 'react';
import { Card, Button, ButtonGroup, Alert, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { MapPin, Globe, Copy, ExternalLink, Volume2, Navigation, Info } from 'lucide-react';
import { What3WordsLocation } from '../../types/what3words';
import what3wordsService from '../../services/what3words';

interface LocationDisplayProps {
  location: What3WordsLocation;
  title?: string;
  showBothFormats?: boolean;
  size?: 'sm' | 'md' | 'lg';
  emergency?: boolean;
  showMapLink?: boolean;
  showCopyButtons?: boolean;
  showPronunciation?: boolean;
  className?: string;
  onLocationClick?: () => void;
}

export const LocationDisplay: React.FC<LocationDisplayProps> = ({
  location,
  title,
  showBothFormats = true,
  size = 'md',
  emergency = false,
  showMapLink = true,
  showCopyButtons = true,
  showPronunciation = true,
  className = '',
  onLocationClick
}) => {
  const [copied, setCopied] = useState<'coordinates' | 'what3words' | null>(null);
  const [activeFormat, setActiveFormat] = useState<'what3words' | 'coordinates'>(
    location.words ? 'what3words' : 'coordinates'
  );

  const copyToClipboard = async (text: string, type: 'coordinates' | 'what3words') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  };

  const getCoordinateText = () => {
    const { lat, lng } = location.coordinates;
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const getWhat3WordsText = () => {
    return location.words ? `///${location.words}` : null;
  };

  const getWhat3WordsVoiceText = () => {
    return location.words ? what3wordsService.formatWhat3WordsForVoice(location.words) : null;
  };

  const openInMaps = () => {
    const { lat, lng } = location.coordinates;
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, '_blank');
  };

  const openWhat3WordsMap = () => {
    if (location.words) {
      const url = `https://w3w.co/${location.words}`;
      window.open(url, '_blank');
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return {
          card: 'p-2',
          primary: 'h6 mb-1',
          secondary: 'small',
          button: 'sm' as const
        };
      case 'lg':
        return {
          card: 'p-4',
          primary: 'h3 mb-2',
          secondary: 'h6',
          button: 'sm' as const
        };
      default:
        return {
          card: 'p-3',
          primary: 'h5 mb-2',
          secondary: '',
          button: 'sm' as const
        };
    }
  };

  const classes = getSizeClasses();
  const what3wordsText = getWhat3WordsText();
  const coordinateText = getCoordinateText();
  const voiceText = getWhat3WordsVoiceText();

  if (emergency) {
    return (
      <Card className={`location-display emergency-mode border-danger ${className}`}>
        <Card.Body className={classes.card}>
          <div className="text-center">
            <div className="text-danger mb-3">
              <MapPin size={emergency ? 48 : 32} />
            </div>
            
            {title && (
              <h4 className="text-danger fw-bold mb-3">{title}</h4>
            )}

            {/* Primary format (what3words if available, otherwise coordinates) */}
            <div className="mb-4">
              {what3wordsText ? (
                <div>
                  <div className="text-muted small mb-1">what3words address:</div>
                  <div className={`${classes.primary} fw-bold font-monospace bg-light p-3 rounded border`}>
                    {what3wordsText}
                  </div>
                  <div className="small text-muted mt-1">
                    Say: "{voiceText}"
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-muted small mb-1">GPS Coordinates:</div>
                  <div className={`${classes.primary} fw-bold font-monospace bg-light p-3 rounded border`}>
                    {coordinateText}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="d-flex flex-column gap-2">
              {what3wordsText && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => copyToClipboard(what3wordsText, 'what3words')}
                  className="fw-bold"
                >
                  <Copy size={20} className="me-2" />
                  {copied === 'what3words' ? 'Copied!' : 'Copy what3words'}
                </Button>
              )}
              
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => copyToClipboard(coordinateText, 'coordinates')}
              >
                <Navigation size={20} className="me-2" />
                {copied === 'coordinates' ? 'Copied!' : 'Copy Coordinates'}
              </Button>

              {voiceText && showPronunciation && (
                <Button
                  variant="outline-secondary"
                  onClick={() => speakText(voiceText)}
                  className="mt-2"
                >
                  <Volume2 size={16} className="me-2" />
                  Hear Pronunciation
                </Button>
              )}
            </div>

            {/* Emergency instructions */}
            <Alert variant="info" className="mt-4 text-start">
              <Info size={16} className="me-2" />
              <strong>For Emergency Services:</strong><br />
              {what3wordsText ? (
                <>
                  Give them the what3words address above, or use coordinates if they don't support what3words.
                  Most emergency services now accept what3words for precise location.
                </>
              ) : (
                <>
                  Give them the GPS coordinates above. These provide your exact location.
                </>
              )}
            </Alert>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card 
      className={`location-display ${className} ${onLocationClick ? 'cursor-pointer' : ''}`}
      onClick={onLocationClick}
    >
      <Card.Body className={classes.card}>
        {title && (
          <Card.Title className="d-flex align-items-center mb-3">
            <MapPin size={20} className="me-2 text-primary" />
            {title}
          </Card.Title>
        )}

        {showBothFormats && location.words ? (
          <div>
            {/* Format toggle */}
            <ButtonGroup className="mb-3 w-100">
              <Button
                variant={activeFormat === 'what3words' ? 'primary' : 'outline-primary'}
                onClick={() => setActiveFormat('what3words')}
                className="d-flex align-items-center justify-content-center"
              >
                <Globe size={16} className="me-2" />
                what3words
              </Button>
              <Button
                variant={activeFormat === 'coordinates' ? 'primary' : 'outline-primary'}
                onClick={() => setActiveFormat('coordinates')}
                className="d-flex align-items-center justify-content-center"
              >
                <Navigation size={16} className="me-2" />
                GPS
              </Button>
            </ButtonGroup>

            {/* Display active format */}
            <div className="mb-3">
              {activeFormat === 'what3words' && what3wordsText ? (
                <div>
                  <div className={`${classes.primary} fw-bold font-monospace text-primary mb-1`}>
                    {what3wordsText}
                  </div>
                  {voiceText && (
                    <div className="small text-muted">
                      Pronunciation: "{voiceText}"
                    </div>
                  )}
                  {location.nearestPlace && (
                    <div className="small text-muted">
                      Near {location.nearestPlace}
                      {location.country && `, ${location.country}`}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className={`${classes.primary} fw-bold font-monospace text-secondary`}>
                    {coordinateText}
                  </div>
                  <div className="small text-muted">
                    Latitude, Longitude
                  </div>
                </div>
              )}
            </div>

            {/* Secondary format info */}
            <div className="small text-muted mb-3">
              {activeFormat === 'what3words' ? (
                <div>GPS: {coordinateText}</div>
              ) : (
                what3wordsText && <div>what3words: {what3wordsText}</div>
              )}
            </div>
          </div>
        ) : (
          /* Single format display */
          <div className="mb-3">
            {what3wordsText ? (
              <div>
                <div className="small text-muted mb-1">what3words address:</div>
                <div className={`${classes.primary} fw-bold font-monospace text-primary mb-1`}>
                  {what3wordsText}
                </div>
                {voiceText && (
                  <div className="small text-muted mb-2">
                    Say: "{voiceText}"
                  </div>
                )}
                <div className="small text-muted">
                  GPS: {coordinateText}
                </div>
              </div>
            ) : (
              <div>
                <div className="small text-muted mb-1">GPS Coordinates:</div>
                <div className={`${classes.primary} fw-bold font-monospace text-secondary`}>
                  {coordinateText}
                </div>
              </div>
            )}
            
            {location.nearestPlace && (
              <div className="small text-muted mt-2">
                Near {location.nearestPlace}
                {location.country && `, ${location.country}`}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="d-flex flex-wrap gap-2">
          {showCopyButtons && (
            <>
              {what3wordsText && (
                <OverlayTrigger
                  overlay={<Tooltip>Copy what3words address</Tooltip>}
                >
                  <Button
                    variant="outline-primary"
                    size={classes.button}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(what3wordsText, 'what3words');
                    }}
                  >
                    <Globe size={14} className="me-1" />
                    {copied === 'what3words' ? 'Copied!' : 'Copy'}
                  </Button>
                </OverlayTrigger>
              )}
              
              <OverlayTrigger
                overlay={<Tooltip>Copy GPS coordinates</Tooltip>}
              >
                <Button
                  variant="outline-secondary"
                  size={classes.button}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(coordinateText, 'coordinates');
                  }}
                >
                  <Navigation size={14} className="me-1" />
                  {copied === 'coordinates' ? 'Copied!' : 'GPS'}
                </Button>
              </OverlayTrigger>
            </>
          )}

          {showMapLink && (
            <>
              <OverlayTrigger
                overlay={<Tooltip>Open in Google Maps</Tooltip>}
              >
                <Button
                  variant="outline-success"
                  size={classes.button}
                  onClick={(e) => {
                    e.stopPropagation();
                    openInMaps();
                  }}
                >
                  <ExternalLink size={14} className="me-1" />
                  Maps
                </Button>
              </OverlayTrigger>

              {what3wordsText && (
                <OverlayTrigger
                  overlay={<Tooltip>Open in what3words</Tooltip>}
                >
                  <Button
                    variant="outline-info"
                    size={classes.button}
                    onClick={(e) => {
                      e.stopPropagation();
                      openWhat3WordsMap();
                    }}
                  >
                    <Globe size={14} className="me-1" />
                    W3W
                  </Button>
                </OverlayTrigger>
              )}
            </>
          )}

          {voiceText && showPronunciation && (
            <OverlayTrigger
              overlay={<Tooltip>Hear pronunciation</Tooltip>}
            >
              <Button
                variant="outline-secondary"
                size={classes.button}
                onClick={(e) => {
                  e.stopPropagation();
                  speakText(voiceText);
                }}
              >
                <Volume2 size={14} />
              </Button>
            </OverlayTrigger>
          )}
        </div>
      </Card.Body>
    </Card>
  );
};