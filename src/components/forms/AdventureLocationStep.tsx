import React, { useState, useEffect } from 'react';
import { Row, Col, Alert, Spinner, Badge } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { MapPin, Navigation, CheckCircle, Globe, Info, AlertTriangle, Route, TrendingUp, Star } from 'lucide-react';
import { Input, Card, Button } from '../ui';
import { MapSelector } from '../map/MapSelector';
import { What3wordsInput } from '../what3words/What3wordsInput';
import { LocationDisplay } from '../what3words/LocationDisplay';
import { What3WordsLocation } from '../../types/what3words';
import { GlobalTrailService, TrailSuggestion } from '../../services/GlobalTrailService';

export const TripLinkLocationStep: React.FC = () => {
  const { register, setValue, watch } = useFormContext();
  const [primaryLocation, setPrimaryLocation] = useState<What3WordsLocation | null>(null);
  const [parkingLocation, setParkingLocation] = useState<What3WordsLocation | null>(null);
  const [emergencyExitLocation, setEmergencyExitLocation] = useState<What3WordsLocation | null>(null);
  
  // Route suggestion state
  const [routeSuggestions, setRouteSuggestions] = useState<TrailSuggestion[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<TrailSuggestion | null>(null);
  
  const formData = watch();
  const trailService = new GlobalTrailService();

  // Auto-suggest routes when trip title and activity type are available
  useEffect(() => {
    const triggerRouteSuggestion = async () => {
      if (formData.title && formData.activityType && formData.title.length > 3) {
        setIsLoadingRoutes(true);
        setShowSuggestions(true);
        
        try {
          const suggestions = await trailService.suggestRoute({
            title: formData.title,
            activityType: formData.activityType,
            location: formData.location?.name
          });
          
          setRouteSuggestions(suggestions);
        } catch (error) {
          console.error('Error fetching route suggestions:', error);
          setRouteSuggestions([]);
        } finally {
          setIsLoadingRoutes(false);
        }
      }
    };

    const debounceTimer = setTimeout(triggerRouteSuggestion, 1000);
    return () => clearTimeout(debounceTimer);
  }, [formData.title, formData.activityType, formData.location?.name]);

  const handleSuggestionSelect = (suggestion: TrailSuggestion) => {
    setSelectedSuggestion(suggestion);
    
    // Auto-fill location data from suggestion
    setValue('location.name', suggestion.name);
    
    if (suggestion.location.coordinates) {
      const [lng, lat] = suggestion.location.coordinates;
      const location: What3WordsLocation = {
        coordinates: { lat, lng },
        nearestPlace: suggestion.location.name
      };
      handleLocationUpdate('primary', location);
    }
    
    // Set route metadata if available
    if (suggestion.waypoints && suggestion.waypoints.length > 0) {
      setValue('waypoints', suggestion.waypoints.map(wp => ({
        name: wp.name,
        coordinates: wp.coordinates,
        estimatedTime: new Date().toISOString() // Default time - would be calculated properly
      })));
    }
  };

  const handleLocationUpdate = (locationType: 'primary' | 'parking' | 'emergency', location: What3WordsLocation | null) => {
    switch (locationType) {
      case 'primary':
        setPrimaryLocation(location);
        if (location) {
          setValue('location.what3wordsDetails', location);
          setValue('location.what3words', location.words);
          setValue('location.coordinates', [location.coordinates.lng, location.coordinates.lat]);
          if (!watch('location.name')) {
            setValue('location.name', location.nearestPlace || `${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}`);
          }
        }
        break;
      case 'parking':
        setParkingLocation(location);
        setValue('parkingLocation', location);
        break;
      case 'emergency':
        setEmergencyExitLocation(location);
        setValue('emergencyExitLocation', location);
        break;
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="h4 mb-2">
          <Globe className="me-2" size={24} />
          Precise Location Details
        </h3>
        <p className="text-muted">
          Use what3words addresses for precise location sharing with emergency contacts and services.
        </p>
      </div>

      {/* Route Suggestions Section */}
      {showSuggestions && (formData.title && formData.activityType) && (
        <Row className="mb-4">
          <Col>
            <Card>
              <h5 className="h6 mb-3">
                <Route className="me-2 text-primary" size={20} />
                Suggested Routes for "{formData.title}"
              </h5>
              
              {isLoadingRoutes ? (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Searching global trail databases...
                </div>
              ) : routeSuggestions.length > 0 ? (
                <div>
                  <p className="text-muted small mb-3">
                    Found {routeSuggestions.length} potential route matches from global trail databases
                  </p>
                  
                  <Row className="g-3">
                    {routeSuggestions.map((suggestion) => (
                      <Col key={suggestion.id} md={6} lg={4}>
                        <div 
                          className={`suggestion-card p-3 border rounded cursor-pointer ${
                            selectedSuggestion?.id === suggestion.id ? 'border-primary bg-primary bg-opacity-10' : 'border'
                          }`}
                          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                          onClick={() => handleSuggestionSelect(suggestion)}
                        >
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h6 className="mb-1">{suggestion.name}</h6>
                            <Badge 
                              bg={suggestion.confidence > 0.8 ? 'success' : 'warning'} 
                              className="ms-2"
                            >
                              {Math.round(suggestion.confidence * 100)}%
                            </Badge>
                          </div>
                          
                          <div className="small text-muted mb-2">
                            <div className="d-flex align-items-center mb-1">
                              <Globe size={12} className="me-1" />
                              {suggestion.location.name}
                            </div>
                            <div className="d-flex align-items-center">
                              <TrendingUp size={12} className="me-1" />
                              Source: {suggestion.source.toUpperCase()}
                            </div>
                          </div>
                          
                          {suggestion.distance && (
                            <div className="small">
                              <strong>Distance:</strong> {suggestion.distance}km
                            </div>
                          )}
                          
                          {suggestion.elevationGain && (
                            <div className="small">
                              <strong>Elevation:</strong> +{suggestion.elevationGain}m
                            </div>
                          )}
                          
                          {suggestion.difficulty && (
                            <div className="small">
                              <strong>Difficulty:</strong> {suggestion.difficulty}
                            </div>
                          )}
                          
                          {suggestion.metadata?.userRating && (
                            <div className="small d-flex align-items-center mt-1">
                              <Star size={12} className="me-1" />
                              {suggestion.metadata.userRating}/5
                            </div>
                          )}
                        </div>
                      </Col>
                    ))}
                  </Row>
                  
                  <div className="mt-3 text-center">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => setShowSuggestions(false)}
                    >
                      Continue with Manual Entry
                    </Button>
                  </div>
                </div>
              ) : (
                <Alert variant="light">
                  <Info size={16} className="me-2" />
                  No exact route matches found. You can continue with manual location entry below.
                </Alert>
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* What3words info banner */}
      <Alert variant="info" className="mb-4">
        <div className="d-flex align-items-start">
          <Globe size={20} className="me-3 mt-1 text-info" />
          <div>
            <strong>What is what3words?</strong>
            <p className="mb-2 small">
              what3words divides the world into 3x3 meter squares and assigns each a unique 3-word address. 
              This makes it easy to share exact locations with emergency services and contacts.
            </p>
            <div className="small text-muted">
              Example: <code>///filled.count.soap</code> identifies a precise 3x3m location
            </div>
          </div>
        </div>
      </Alert>

      {/* Primary Trip Location */}
      <Row className="mb-4">
        <Col>
          <Card variant="step">
            <h5 className="h6 mb-3">
              <MapPin className="me-2 text-primary" size={20} />
              Primary Trip Location
            </h5>
            
            <Row>
              <Col md={6}>
                <Input
                  label="Location Name"
                  placeholder="e.g., Mount Washington Summit Trail"
                  {...register('location.name', { 
                    required: 'Location name is required',
                    minLength: { value: 3, message: 'Location name must be at least 3 characters' }
                  })}
                  helperText="Give your trip location a descriptive name"
                />
              </Col>
              <Col md={6}>
                <What3wordsInput
                  label="Precise Location"
                  placeholder="Enter coordinates or what3words address"
                  value={primaryLocation}
                  onChange={(location) => handleLocationUpdate('primary', location)}
                  required={true}
                  helpText="Main location where your trip takes place"
                  showCurrentLocation={true}
                />
              </Col>
            </Row>

            {primaryLocation && (
              <div className="mt-3">
                <LocationDisplay
                  location={primaryLocation}
                  showBothFormats={true}
                  size="sm"
                  showMapLink={true}
                  showCopyButtons={true}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Key Safety Locations */}
      <Row className="mb-4">
        <Col md={6}>
          <Card variant="step">
            <h5 className="h6 mb-3">
              <Navigation className="me-2 text-success" size={20} />
              Parking / Access Point
            </h5>
            
            <What3wordsInput
              label="Where you'll park or access the trail"
              placeholder="Parking coordinates or what3words"
              value={parkingLocation}
              onChange={(location) => handleLocationUpdate('parking', location)}
              helpText="Where your vehicle will be located - important for emergency services"
              showCurrentLocation={true}
            />

            {parkingLocation && (
              <div className="mt-3">
                <LocationDisplay
                  location={parkingLocation}
                  title="Parking Location"
                  showBothFormats={false}
                  size="sm"
                  showMapLink={true}
                  showCopyButtons={true}
                />
              </div>
            )}
          </Card>
        </Col>

        <Col md={6}>
          <Card variant="step">
            <h5 className="h6 mb-3">
              <AlertTriangle className="me-2 text-warning" size={20} />
              Emergency Exit Point
            </h5>
            
            <What3wordsInput
              label="Nearest emergency exit or evacuation point"
              placeholder="Emergency access coordinates"
              value={emergencyExitLocation}
              onChange={(location) => handleLocationUpdate('emergency', location)}
              helpText="Closest point where emergency services can reach you"
              showCurrentLocation={false}
            />

            {emergencyExitLocation && (
              <div className="mt-3">
                <LocationDisplay
                  location={emergencyExitLocation}
                  title="Emergency Access"
                  showBothFormats={false}
                  size="sm"
                  showMapLink={true}
                  showCopyButtons={true}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Interactive Map */}
      <Row className="mb-4">
        <Col>
          <Card variant="step">
            <h5 className="h6 mb-3">
              <Navigation className="me-2" size={20} />
              Interactive Map View
            </h5>
            
            <MapSelector
              height="400px"
              center={primaryLocation ? 
                [primaryLocation.coordinates.lat, primaryLocation.coordinates.lng] : 
                undefined
              }
              onLocationSelect={(lat, lng) => {
                const location: What3WordsLocation = {
                  coordinates: { lat, lng },
                  // Note: In a real implementation, you'd convert these coordinates to what3words
                };
                handleLocationUpdate('primary', location);
              }}
              markers={[
                ...(primaryLocation ? [{
                  id: 'primary',
                  position: [primaryLocation.coordinates.lat, primaryLocation.coordinates.lng] as [number, number],
                  title: 'Primary Location',
                  description: primaryLocation.words ? `///${primaryLocation.words}` : 'Primary trip location'
                }] : []),
                ...(parkingLocation ? [{
                  id: 'parking',
                  position: [parkingLocation.coordinates.lat, parkingLocation.coordinates.lng] as [number, number],
                  title: 'Parking',
                  description: parkingLocation.words ? `///${parkingLocation.words}` : 'Parking location'
                }] : []),
                ...(emergencyExitLocation ? [{
                  id: 'emergency',
                  position: [emergencyExitLocation.coordinates.lat, emergencyExitLocation.coordinates.lng] as [number, number],
                  title: 'Emergency Exit',
                  description: emergencyExitLocation.words ? `///${emergencyExitLocation.words}` : 'Emergency access point'
                }] : [])
              ]}
            />
            
            <div className="mt-3 small text-muted">
              <Info size={14} className="me-2" />
              Click on the map to set locations. Different colored pins represent different location types.
            </div>
          </Card>
        </Col>
      </Row>

      {/* Safety Tips */}
      <Row>
        <Col>
          <Alert variant="success">
            <div className="d-flex align-items-start">
              <CheckCircle size={20} className="me-3 mt-1 text-success" />
              <div>
                <strong>Emergency Location Best Practices:</strong>
                <ul className="mt-2 mb-0 small">
                  <li><strong>Share what3words addresses</strong> with your emergency contacts - they're more precise than regular addresses</li>
                  <li><strong>Save key locations</strong> like parking and emergency exits for quick access during emergencies</li>
                  <li><strong>Test pronunciation</strong> of what3words addresses - practice saying them clearly</li>
                  <li><strong>Screenshot locations</strong> in case you lose cellular data during your trip</li>
                  <li><strong>Inform emergency services</strong> that you use what3words - most now support it</li>
                </ul>
              </div>
            </div>
          </Alert>
        </Col>
      </Row>
    </div>
  );
};