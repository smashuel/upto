import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, ButtonGroup } from 'react-bootstrap';
import { Map, MapPin, Route, StickyNote, Download, RotateCcw } from 'lucide-react';

// Cesium types (using CDN, so we declare globals)
declare global {
  interface Window {
    Cesium: any;
  }
}

interface TripPlanningMapProps {
  height?: string;
  center?: [number, number]; // [lat, lng]
  onWaypointAdded?: (waypoint: any) => void;
  onRouteCreated?: (route: any) => void;
  onNoteAdded?: (note: any) => void;
  initialWaypoints?: any[];
  initialRoutes?: any[];
}

interface MapMode {
  type: 'view' | 'waypoint' | 'route' | 'note';
  active: boolean;
}

export const TripPlanningMap: React.FC<TripPlanningMapProps> = ({
  height = '600px',
  center = [44.5, -121.5], // Default to Oregon Cascades
  onWaypointAdded,
  onRouteCreated,
  onNoteAdded,
  initialWaypoints = [],
  initialRoutes = []
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const waypointManagerRef = useRef<any>(null);
  const trackDrawerRef = useRef<any>(null);
  const noteManagerRef = useRef<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [mapMode, setMapMode] = useState<MapMode>({ type: 'view', active: false });
  const [cesiumReady, setCesiumReady] = useState(false);

  // Check if Cesium is loaded
  useEffect(() => {
    const checkCesium = () => {
      if (window.Cesium) {
        setCesiumReady(true);
      } else {
        // Retry after a short delay
        setTimeout(checkCesium, 100);
      }
    };
    
    checkCesium();
  }, []);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!cesiumReady || !mapContainerRef.current) return;

    const initializeMap = async () => {
      try {
        // Set Cesium Ion token from environment variables
        const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
        if (cesiumToken && cesiumToken !== 'your_cesium_ion_token_here') {
          window.Cesium.Ion.defaultAccessToken = cesiumToken;
        }

        // Create viewer with terrain and outdoor imagery
        const viewer = new window.Cesium.Viewer(mapContainerRef.current, {
          // Use Cesium World Terrain for 3D elevation data
          terrainProvider: window.Cesium.createWorldTerrain({
            requestWaterMask: true,
            requestVertexNormals: true
          }),
          
          // Use OpenStreetMap as base imagery (no API key required)
          imageryProvider: new window.Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/'
          }),
          
          // Scene configuration for outdoor use
          scene3DOnly: true,
          shouldAnimate: true,
          
          // Remove default UI elements we don't need
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          
          // Keep useful controls
          geocoder: true,
          infoBox: true,
          selectionIndicator: true
        });

        // Disable default double-click behavior
        viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
          window.Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
        );

        // Set initial camera position
        viewer.camera.setView({
          destination: window.Cesium.Cartesian3.fromDegrees(center[1], center[0], 10000),
          orientation: {
            heading: window.Cesium.Math.toRadians(0),
            pitch: window.Cesium.Math.toRadians(-45),
            roll: 0.0
          }
        });

        viewerRef.current = viewer;

        // Initialize managers (we'll create these classes next)
        const WaypointManager = (await import('../../services/WaypointManager')).default;
        const TrackDrawer = (await import('../../services/TrackDrawer')).default;
        const NoteManager = (await import('../../services/NoteManager')).default;

        waypointManagerRef.current = new WaypointManager(viewer, onWaypointAdded);
        trackDrawerRef.current = new TrackDrawer(viewer, onRouteCreated);
        noteManagerRef.current = new NoteManager(viewer, onNoteAdded);

        // Load initial data
        if (initialWaypoints.length > 0) {
          waypointManagerRef.current.loadWaypoints(initialWaypoints);
        }
        
        if (initialRoutes.length > 0) {
          trackDrawerRef.current.loadRoutes(initialRoutes);
        }

        setIsLoading(false);
        
      } catch (error) {
        console.error('Error initializing Cesium map:', error);
        setIsLoading(false);
      }
    };

    initializeMap();

    // Cleanup function
    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [cesiumReady, center, onWaypointAdded, onRouteCreated, onNoteAdded]);

  // Handle mode changes
  const handleModeChange = (newMode: MapMode['type']) => {
    if (!viewerRef.current) return;

    // Disable all modes first
    waypointManagerRef.current?.setMode(false);
    trackDrawerRef.current?.setMode(false);
    noteManagerRef.current?.setMode(false);

    const isActive = mapMode.type !== newMode || !mapMode.active;
    
    // Enable the selected mode
    switch (newMode) {
      case 'waypoint':
        waypointManagerRef.current?.setMode(isActive);
        break;
      case 'route':
        trackDrawerRef.current?.setMode(isActive);
        break;
      case 'note':
        noteManagerRef.current?.setMode(isActive);
        break;
      case 'view':
      default:
        // View mode - all interaction disabled
        break;
    }

    setMapMode({ type: newMode, active: isActive });
  };

  const resetView = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.setView({
        destination: window.Cesium.Cartesian3.fromDegrees(center[1], center[0], 10000),
        orientation: {
          heading: window.Cesium.Math.toRadians(0),
          pitch: window.Cesium.Math.toRadians(-45),
          roll: 0.0
        }
      });
    }
  };

  const exportData = () => {
    const data = {
      waypoints: waypointManagerRef.current?.getWaypoints() || [],
      routes: trackDrawerRef.current?.getRoutes() || [],
      notes: noteManagerRef.current?.getNotes() || []
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trip-planning-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!cesiumReady) {
    return (
      <Card>
        <div className="d-flex justify-content-center align-items-center" style={{ height }}>
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <div>Loading Cesium 3D Map...</div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            <Map className="me-2" size={20} />
            3D Trip Planning Map
          </h5>
          
          <div className="d-flex gap-2">
            {/* Map Mode Controls */}
            <ButtonGroup size="sm">
              <Button 
                variant={mapMode.type === 'view' ? 'primary' : 'outline-secondary'}
                onClick={() => handleModeChange('view')}
                title="View Mode"
              >
                <Map size={16} />
              </Button>
              <Button 
                variant={mapMode.type === 'waypoint' && mapMode.active ? 'primary' : 'outline-secondary'}
                onClick={() => handleModeChange('waypoint')}
                title="Add Waypoints"
              >
                <MapPin size={16} />
              </Button>
              <Button 
                variant={mapMode.type === 'route' && mapMode.active ? 'primary' : 'outline-secondary'}
                onClick={() => handleModeChange('route')}
                title="Draw Routes"
              >
                <Route size={16} />
              </Button>
              <Button 
                variant={mapMode.type === 'note' && mapMode.active ? 'primary' : 'outline-secondary'}
                onClick={() => handleModeChange('note')}
                title="Add Notes"
              >
                <StickyNote size={16} />
              </Button>
            </ButtonGroup>

            {/* Utility Controls */}
            <ButtonGroup size="sm">
              <Button 
                variant="outline-secondary"
                onClick={resetView}
                title="Reset View"
              >
                <RotateCcw size={16} />
              </Button>
              <Button 
                variant="outline-secondary"
                onClick={exportData}
                title="Export Data"
              >
                <Download size={16} />
              </Button>
            </ButtonGroup>
          </div>
        </div>
        
        {/* Mode Instructions */}
        {mapMode.active && (
          <div className="mt-2">
            <small className="text-muted">
              {mapMode.type === 'waypoint' && "Click on the map to add waypoints"}
              {mapMode.type === 'route' && "Click to start drawing a route. Double-click to finish."}
              {mapMode.type === 'note' && "Click on the map to add notes"}
            </small>
          </div>
        )}
      </Card.Header>
      
      <Card.Body className="p-0">
        {isLoading && (
          <div className="position-absolute top-50 start-50 translate-middle z-1">
            <div className="text-center">
              <div className="spinner-border text-primary mb-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div>Initializing 3D terrain...</div>
            </div>
          </div>
        )}
        
        <div 
          ref={mapContainerRef}
          style={{ 
            height, 
            width: '100%',
            backgroundColor: '#000'
          }}
        />
      </Card.Body>
    </Card>
  );
};

export default TripPlanningMap;