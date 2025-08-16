import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Form, InputGroup, Button, Alert, Spinner } from 'react-bootstrap';
import { MapPin, Copy, CheckCircle, AlertTriangle, Navigation, Globe } from 'lucide-react';
import what3wordsService from '../../services/what3words';
import { What3WordsLocation, What3WordsSuggestion, LocationInputType } from '../../types/what3words';

interface What3wordsInputProps {
  label?: string;
  placeholder?: string;
  value?: What3WordsLocation | null;
  onChange: (location: What3WordsLocation | null) => void;
  required?: boolean;
  disabled?: boolean;
  showCurrentLocation?: boolean;
  focus?: { lat: number; lng: number }; // For better suggestions
  className?: string;
  helpText?: string;
  errorText?: string;
}

export const What3wordsInput: React.FC<What3wordsInputProps> = ({
  label = 'Location',
  placeholder = 'Enter coordinates (lat, lng) or what3words (word.word.word)',
  value,
  onChange,
  required = false,
  disabled = false,
  showCurrentLocation = true,
  focus,
  className = '',
  helpText = 'Enter GPS coordinates or a what3words address for precise location',
  errorText
}) => {
  const [inputValue, setInputValue] = useState('');
  const [inputType, setInputType] = useState<LocationInputType['type']>('coordinates');
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<What3WordsSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(true);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionTimeoutRef = useRef<NodeJS.Timeout>();

  // Initialize input value from prop
  useEffect(() => {
    if (value) {
      if (value.words) {
        setInputValue(value.words);
        setInputType('what3words');
      } else if (value.coordinates) {
        setInputValue(`${value.coordinates.lat}, ${value.coordinates.lng}`);
        setInputType('coordinates');
      }
    } else {
      setInputValue('');
    }
  }, [value]);

  // Check API availability on mount
  useEffect(() => {
    what3wordsService.isApiAvailable().then(setApiAvailable);
  }, []);

  const validateAndConvert = useCallback(async (input: string) => {
    if (!input.trim()) {
      setIsValid(null);
      setError(null);
      onChange(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Determine input type
      const isW3W = what3wordsService.validateWhat3WordsFormat(input);
      const coordValidation = what3wordsService.validateCoordinateFormat(input);

      if (isW3W) {
        setInputType('what3words');
        
        if (!apiAvailable) {
          setError('what3words API is unavailable. Using input as-is.');
          setIsValid(true);
          onChange({
            coordinates: { lat: 0, lng: 0 }, // Placeholder
            words: input.trim()
          });
          return;
        }

        const location = await what3wordsService.wordsToCoordinates(input);
        if (location) {
          setIsValid(true);
          onChange(location);
        } else {
          setIsValid(false);
          setError('Invalid what3words address');
          onChange(null);
        }
      } else if (coordValidation.isValid && coordValidation.coordinates) {
        setInputType('coordinates');
        
        const { lat, lng } = coordValidation.coordinates;
        
        if (apiAvailable) {
          const w3wAddress = await what3wordsService.coordinatesToWords(lat, lng);
          const location: What3WordsLocation = {
            coordinates: { lat, lng },
            words: w3wAddress?.words,
            square: w3wAddress?.square,
            nearestPlace: w3wAddress?.nearestPlace,
            country: w3wAddress?.country
          };
          setIsValid(true);
          onChange(location);
        } else {
          setIsValid(true);
          onChange({
            coordinates: { lat, lng }
          });
        }
      } else {
        setIsValid(false);
        setError('Invalid format. Use coordinates (lat, lng) or what3words (word.word.word)');
        onChange(null);
      }
    } catch (error) {
      console.error('Error validating location:', error);
      setIsValid(false);
      setError('Error validating location');
      onChange(null);
    } finally {
      setIsLoading(false);
    }
  }, [apiAvailable, onChange]);

  const getSuggestions = useCallback(async (input: string) => {
    if (!input || input.length < 3 || !apiAvailable) {
      setSuggestions([]);
      return;
    }

    // Only get suggestions for partial what3words input
    if (input.includes('.') && !what3wordsService.validateWhat3WordsFormat(input)) {
      try {
        const suggestions = await what3wordsService.getAutoSuggestions(input, {
          focus,
          nResults: 5
        });
        setSuggestions(suggestions);
      } catch (error) {
        console.error('Error getting suggestions:', error);
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  }, [focus, apiAvailable]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowSuggestions(true);

    // Clear previous timeout
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }

    // Debounce validation and suggestions
    suggestionTimeoutRef.current = setTimeout(() => {
      validateAndConvert(newValue);
      getSuggestions(newValue);
    }, 300);
  };

  const handleSuggestionSelect = (suggestion: What3WordsSuggestion) => {
    setInputValue(suggestion.words);
    setShowSuggestions(false);
    validateAndConvert(suggestion.words);
    inputRef.current?.focus();
  };

  const getCurrentLocation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const location = await what3wordsService.getCurrentLocationWhat3Words();
      if (location) {
        if (location.words) {
          setInputValue(location.words);
          setInputType('what3words');
        } else {
          setInputValue(`${location.coordinates.lat}, ${location.coordinates.lng}`);
          setInputType('coordinates');
        }
        setIsValid(true);
        onChange(location);
      } else {
        setError('Unable to get current location');
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      setError('Error getting current location');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (inputValue && isValid) {
      try {
        await navigator.clipboard.writeText(inputValue);
        // Could add a toast notification here
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  };

  const getValidationIcon = () => {
    if (isLoading) return <Spinner animation="border" size="sm" />;
    if (isValid === true) return <CheckCircle className="text-success" size={16} />;
    if (isValid === false) return <AlertTriangle className="text-danger" size={16} />;
    return <MapPin className="text-muted" size={16} />;
  };

  const getInputTypeIcon = () => {
    return inputType === 'what3words' ? 
      <Globe className="text-primary" size={16} /> :
      <Navigation className="text-secondary" size={16} />;
  };

  return (
    <div className={`what3words-input ${className}`}>
      <Form.Group>
        {label && (
          <Form.Label>
            {label} {required && <span className="text-danger">*</span>}
            {!apiAvailable && (
              <small className="text-warning ms-2">
                (Offline mode - what3words features limited)
              </small>
            )}
          </Form.Label>
        )}
        
        <InputGroup className="position-relative">
          <InputGroup.Text>
            {getInputTypeIcon()}
          </InputGroup.Text>
          
          <Form.Control
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            isValid={isValid === true}
            isInvalid={isValid === false}
            style={{
              paddingRight: showCurrentLocation ? '120px' : '80px'
            }}
          />
          
          <div className="position-absolute" style={{ right: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 5 }}>
            <div className="d-flex align-items-center gap-2">
              {isValid === true && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={copyToClipboard}
                  title="Copy to clipboard"
                  className="border-0 p-1"
                >
                  <Copy size={14} />
                </Button>
              )}
              
              {showCurrentLocation && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={getCurrentLocation}
                  disabled={isLoading}
                  title="Get current location"
                  className="border-0 p-1"
                >
                  <Navigation size={14} />
                </Button>
              )}
              
              <div className="ms-1">
                {getValidationIcon()}
              </div>
            </div>
          </div>
        </InputGroup>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="position-absolute w-100 mt-1 bg-white border rounded shadow-lg" style={{ zIndex: 1000 }}>
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="w-100 p-3 border-0 bg-white text-start hover-bg-light d-flex justify-content-between"
                onClick={() => handleSuggestionSelect(suggestion)}
                style={{ cursor: 'pointer' }}
              >
                <div>
                  <div className="fw-bold text-primary">
                    ///{suggestion.words}
                  </div>
                  <small className="text-muted">
                    {suggestion.nearestPlace}, {suggestion.country}
                  </small>
                </div>
                {suggestion.distanceToFocusKm && (
                  <small className="text-muted align-self-center">
                    {suggestion.distanceToFocusKm.toFixed(1)}km
                  </small>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Help text */}
        {helpText && !error && (
          <Form.Text className="text-muted">
            {helpText}
          </Form.Text>
        )}

        {/* Error message */}
        {(error || errorText) && (
          <Alert variant="danger" className="mt-2 mb-0 py-2">
            <AlertTriangle size={16} className="me-2" />
            {error || errorText}
          </Alert>
        )}

        {/* Success info for what3words */}
        {isValid && value && inputType === 'what3words' && value.nearestPlace && (
          <Alert variant="success" className="mt-2 mb-0 py-2">
            <CheckCircle size={16} className="me-2" />
            Location confirmed near {value.nearestPlace}
            {value.coordinates && (
              <div className="small mt-1">
                Coordinates: {value.coordinates.lat.toFixed(6)}, {value.coordinates.lng.toFixed(6)}
              </div>
            )}
          </Alert>
        )}

        {/* Success info for coordinates */}
        {isValid && value && inputType === 'coordinates' && value.words && (
          <Alert variant="info" className="mt-2 mb-0 py-2">
            <Globe size={16} className="me-2" />
            what3words: ///{value.words}
            <Button
              variant="link"
              size="sm"
              className="p-0 ms-2 text-decoration-none"
              onClick={() => copyToClipboard()}
            >
              <Copy size={12} className="me-1" />
              Copy
            </Button>
          </Alert>
        )}
      </Form.Group>
    </div>
  );
};