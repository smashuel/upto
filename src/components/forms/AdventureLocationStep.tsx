import React, { useState, useEffect } from 'react';
import { Row, Col, Alert, Spinner, Badge } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';
import { MapPin, Navigation, CheckCircle, Globe, Info, AlertTriangle, Route, TrendingUp } from 'lucide-react';
import type { SerializableTrack } from '../../services/TrackDrawer';
import { Input, Card, Button } from '../ui';
import { TripPlanningMap } from '../map/TripPlanningMap';
import { What3wordsInput } from '../what3words/What3wordsInput';
import { LocationDisplay } from '../what3words/LocationDisplay';
import { What3WordsLocation } from '../../types/what3words';
import { GlobalTrailService, TrailSuggestion } from '../../services/GlobalTrailService';

// Singleton — avoids re-instantiating on every render
const trailService = new GlobalTrailService();

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
            location: formData.location?.name,
            autoExtractLocation: true // NEW: Enable auto-extraction from title
          });

          setRouteSuggestions(suggestions);

          // Auto-select the top suggestion if confidence > 70%
          if (suggestions.length > 0 && suggestions[0].confidence > 0.7) {
            handleSuggestionSelect(suggestions[0]);
          }
        } catch (error) {
          console.error('Error fetching route suggestions:', error);
          setRouteSuggestions([]);
        } finally {
          setIsLoadingRoutes(false);
        }
      }
    };

    const debounceTimer = setTimeout(triggerRouteSuggestion, 1500); // Increased delay for geocoding
    return () => clearTimeout(debounceTimer);
  }, [formData.title, formData.activityType, formData.location?.name]);

  const handleSuggestionSelect = (suggestion: TrailSuggestion) => {
    setSelectedSuggestion(suggestion);
    
    // Auto-fill location data from suggestion
    setValue('location.name', suggestion.name);
    
    if (suggestion.location.coordinates) {
      const [lat, lng] = suggestion.location.coordinates;
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
          setValue('location.coordinates', [location.coordinates.lat, location.coordinates.lng]);
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
          <Route className="me-2" size={24} />
          Location & Route Planning
        </h3>
        <p className="text-muted">
          We've found potential routes based on your trip details. Review the map and adjust as needed.
        </p>
      </div>

      {/* Main Map - Full Width, Map-First Design */}
      <Row className="mb-4">
        <Col>
          <div style={{ overflow: 'hidden' }}>
            <Card className="p-0">
              <div style={{ position: 'relative' }}>
              <TripPlanningMap
                height="700px"
                center={primaryLocation ?
                  [primaryLocation.coordinates.lat, primaryLocation.coordinates.lng] :
                  undefined
                }
                onRouteCreated={(track: SerializableTrack) => {
                  // Append drawn route to form — stored in TripLink data JSONB
                  const existing = watch('routes') || [];
                  setValue('routes', [...existing, track]);
                  // If no primary location yet, use the first waypoint of the drawn route
                  if (!primaryLocation && track.waypoints.length > 0) {
                    const [lat, lng] = track.waypoints[0].coordinates;
                    handleLocationUpdate('primary', { coordinates: { lat, lng } });
                  }
                }}
                onWaypointAdded={(waypoint) => {
                  const location: What3WordsLocation = {
                    coordinates: { lat: waypoint.lat, lng: waypoint.lng },
                  };
                  handleLocationUpdate('primary', location);
                }}
                initialWaypoints={[
                  ...(primaryLocation ? [{
                    id: 'primary',
                    lat: primaryLocation.coordinates.lat,
                    lng: primaryLocation.coordinates.lng,
                    name: 'Primary Location',
                    description: primaryLocation.words ? `///${primaryLocation.words}` : 'Primary trip location'
                  }] : []),
                  ...(parkingLocation ? [{
                    id: 'parking',
                    lat: parkingLocation.coordinates.lat,
                    lng: parkingLocation.coordinates.lng,
                    name: 'Parking',
                    description: parkingLocation.words ? `///${parkingLocation.words}` : 'Parking location'
                  }] : []),
                  ...(emergencyExitLocation ? [{
                    id: 'emergency',
                    lat: emergencyExitLocation.coordinates.lat,
                    lng: emergencyExitLocation.coordinates.lng,
                    name: 'Emergency Exit',
                    description: emergencyExitLocation.words ? `///${emergencyExitLocation.words}` : 'Emergency access point'
                  }] : [])
                ]}
              />

              {/* Route Info Overlay Card */}
              {selectedSuggestion && (
                <div style={{
                  position: 'absolute',
                  bottom: '20px',
                  left: '20px',
                  zIndex: 1000,
                  maxWidth: '400px'
                }}>
                  <Card className="shadow-lg">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        <h5 className="h6 mb-1">
                          <MapPin size={16} className="me-2 text-primary" />
                          {selectedSuggestion.name}
                        </h5>
                        <Badge bg="success" className="me-2">
                          {Math.round(selectedSuggestion.confidence * 100)}% match
                        </Badge>
                        <Badge bg="secondary">
                          {selectedSuggestion.source.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    <div className="d-flex gap-3 mb-3">
                      {selectedSuggestion.distance && (
                        <div className="text-center">
                          <div className="fw-bold text-primary">{selectedSuggestion.distance}km</div>
                          <div className="small text-muted">Distance</div>
                        </div>
                      )}
                      {selectedSuggestion.elevationGain && (
                        <div className="text-center">
                          <div className="fw-bold text-success">↗{selectedSuggestion.elevationGain}m</div>
                          <div className="small text-muted">Elevation</div>
                        </div>
                      )}
                      {selectedSuggestion.difficulty && (
                        <div className="text-center">
                          <div className="fw-bold text-warning">{selectedSuggestion.difficulty}</div>
                          <div className="small text-muted">Difficulty</div>
                        </div>
                      )}
                    </div>

                    <div className="d-flex gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => {/* Auto-fill form with this route */}}
                      >
                        <CheckCircle size={16} className="me-1" />
                        Use This Route
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => setSelectedSuggestion(null)}
                      >
                        Clear
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </Card>
          </div>
        </Col>
      </Row>

      {/* Route Suggestions Section - Now more compact */}
      {showSuggestions && routeSuggestions.length > 0 && !selectedSuggestion && (formData.title && formData.activityType) && (
        <Row className="mb-4">
          <Col>
            <Card>
              <h5 className="h6 mb-3">
                <Route className="me-2 text-primary" size={20} />
                Other Suggested Routes for "{formData.title}"
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
                          className="suggestion-card p-3 border rounded cursor-pointer"
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

      {/* Collapsible Route Details */}
      <Row className="mb-4">
        <Col>
          <Card>
            <details>
              <summary className="h6 mb-3" style={{ cursor: 'pointer' }}>
                <Navigation className="me-2" size={20} />
                Route Coordinates & Waypoints
              </summary>

              <Row className="mt-3">
                <Col md={6}>
                  <div className="mb-3">
                    <label className="form-label small text-muted">Start Coordinates</label>
                    <div className="p-2 bg-light rounded">
                      {primaryLocation ?
                        `${primaryLocation.coordinates.lat.toFixed(6)}°N, ${primaryLocation.coordinates.lng.toFixed(6)}°${primaryLocation.coordinates.lng < 0 ? 'W' : 'E'}` :
                        'Not set'
                      }
                    </div>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="mb-3">
                    <label className="form-label small text-muted">what3words Address</label>
                    <div className="p-2 bg-light rounded">
                      {primaryLocation?.words ? `///${primaryLocation.words}` : 'Not available'}
                    </div>
                  </div>
                </Col>
              </Row>

              {selectedSuggestion?.waypoints && selectedSuggestion.waypoints.length > 0 && (
                <div className="mt-3">
                  <label className="form-label small text-muted">Route Waypoints</label>
                  <div className="d-flex flex-wrap gap-2">
                    {selectedSuggestion.waypoints.map((wp, idx) => (
                      <Badge key={idx} bg="secondary" className="p-2">
                        {wp.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </details>
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