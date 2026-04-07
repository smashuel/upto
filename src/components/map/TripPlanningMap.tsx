/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, ButtonGroup } from 'react-bootstrap';
import { Map, MapPin, Route, StickyNote, Download, RotateCcw, Navigation, Layers, Undo2 } from 'lucide-react';
import { getTopoTileUrl, LINZ_CESIUM_RECTANGLE, LINZ_ATTRIBUTION } from '../../services/LinzMapService';
import type { DrawingStats, SerializableTrack } from '../../services/TrackDrawer';

// Cesium types (using CDN, so we declare globals)
declare global {
  interface Window {
    Cesium: any;
  }
}

type MapLayer = 'satellite' | 'topo';

interface TripPlanningMapProps {
  height?: string;
  center?: [number, number]; // [lat, lng]
  onWaypointAdded?: (waypoint: any) => void;
  onRouteCreated?: (route: SerializableTrack) => void;
  onNoteAdded?: (note: any) => void;
  initialWaypoints?: any[];
  initialRoutes?: any[];
}

interface MapMode {
  type: 'view' | 'waypoint' | 'route' | 'note';
  active: boolean;
}

// ─── Elevation profile chart ────────────────────────────────────────────────

interface ElevationChartProps {
  points: Array<{ dist: number; ele: number }>;
}

const ElevationChart: React.FC<ElevationChartProps> = ({ points }) => {
  if (points.length < 2) return null;

  const W = 400;
  const H = 72;
  const pad = { left: 34, right: 8, top: 6, bottom: 18 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const maxDist = points[points.length - 1].dist;
  const eles = points.map(p => p.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const eleRange = maxEle - minEle || 1;

  const px = (d: number) => pad.left + (d / maxDist) * cW;
  const py = (e: number) => pad.top + cH - ((e - minEle) / eleRange) * cH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.dist).toFixed(1)},${py(p.ele).toFixed(1)}`)
    .join(' ');
  const fillD = `${pathD} L${px(maxDist).toFixed(1)},${(pad.top + cH).toFixed(1)} L${pad.left},${(pad.top + cH).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      style={{ display: 'block' }}
      aria-label="Elevation profile"
    >
      <defs>
        <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Baseline */}
      <line
        x1={pad.left} y1={pad.top + cH}
        x2={pad.left + cW} y2={pad.top + cH}
        stroke="#e5e7eb" strokeWidth="1"
      />
      {/* Fill */}
      <path d={fillD} fill="url(#eleGrad)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Y labels */}
      <text x={pad.left - 3} y={pad.top + 4} textAnchor="end" fontSize="8" fill="#9ca3af">
        {maxEle.toFixed(0)}m
      </text>
      <text x={pad.left - 3} y={pad.top + cH} textAnchor="end" fontSize="8" fill="#9ca3af">
        {minEle.toFixed(0)}m
      </text>
      {/* X labels */}
      <text x={pad.left} y={H - 2} textAnchor="start" fontSize="8" fill="#9ca3af">
        0
      </text>
      <text x={pad.left + cW} y={H - 2} textAnchor="end" fontSize="8" fill="#9ca3af">
        {maxDist.toFixed(2)} km
      </text>
    </svg>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(hours: number): string {
  if (hours < 0.1) return '< 5 min';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const LAYER_STORAGE_KEY = 'upto_map_layer';

// ─── Component ────────────────────────────────────────────────────────────────

export const TripPlanningMap: React.FC<TripPlanningMapProps> = ({
  height = '600px',
  center,
  onWaypointAdded,
  onRouteCreated,
  onNoteAdded,
  initialWaypoints = [],
  initialRoutes = [],
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const waypointManagerRef = useRef<any>(null);
  const trackDrawerRef = useRef<any>(null);
  const noteManagerRef = useRef<any>(null);
  const linzLayerRef = useRef<any>(null); // reference to the LINZ imagery layer

  const [isLoading, setIsLoading] = useState(true);
  const [mapMode, setMapMode] = useState<MapMode>({ type: 'view', active: false });
  const [cesiumReady, setCesiumReady] = useState(false);
  const topoTileUrl = getTopoTileUrl(); // null if no LINZ key available
  const [mapLayer, setMapLayer] = useState<MapLayer>(
    () => (localStorage.getItem(LAYER_STORAGE_KEY) as MapLayer) ?? 'satellite',
  );
  const [drawingStats, setDrawingStats] = useState<DrawingStats | null>(null);

  // Check if Cesium is loaded
  useEffect(() => {
    const checkCesium = () => {
      if (window.Cesium) {
        setCesiumReady(true);
      } else {
        setTimeout(checkCesium, 100);
      }
    };
    checkCesium();
  }, []);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!cesiumReady || !mapContainerRef.current) return;
    if (viewerRef.current) {
      console.log('TripPlanningMap: Viewer already initialized, skipping');
      return;
    }

    const initializeMap = async () => {
      try {
        const Cesium = window.Cesium;

        const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
        const hasValidToken = cesiumToken && cesiumToken !== 'your_cesium_ion_token_here';

        if (hasValidToken) {
          Cesium.Ion.defaultAccessToken = cesiumToken;
        }

        // Satellite base layer (always present)
        let baseLayer;
        if (hasValidToken) {
          try {
            baseLayer = Cesium.ImageryLayer.fromProviderAsync(
              Cesium.IonImageryProvider.fromAssetId(2),
            );
          } catch {
            baseLayer = Cesium.ImageryLayer.fromProviderAsync(
              Cesium.OpenStreetMapImageryProvider.fromUrl('https://a.tile.openstreetmap.org/'),
            );
          }
        } else {
          baseLayer = Cesium.ImageryLayer.fromProviderAsync(
            Cesium.OpenStreetMapImageryProvider.fromUrl('https://a.tile.openstreetmap.org/'),
          );
        }

        const viewer = new Cesium.Viewer(mapContainerRef.current, {
          baseLayer,
          scene3DOnly: true,
          shouldAnimate: true,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          geocoder: true,
          infoBox: true,
          selectionIndicator: true,
        });

        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = true;
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.0002;

        viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
          Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
        );

        if (hasValidToken) {
          try {
            const terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, {
              requestWaterMask: true,
              requestVertexNormals: true,
            });
            viewer.terrainProvider = terrainProvider;
          } catch (error) {
            console.error('Could not load Cesium World Terrain:', error);
          }
        }

        viewerRef.current = viewer;

        // Apply persisted layer preference
        const savedLayer = (localStorage.getItem(LAYER_STORAGE_KEY) as MapLayer) ?? 'satellite';
        if (savedLayer === 'topo') {
          applyTopoLayer(viewer, Cesium);
        }

        // Camera
        if (center) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(center[1], center[0], 15000),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-60),
              roll: 0.0,
            },
            duration: 0,
          });
        } else {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(172.0, -41.5, 2500000),
            duration: 0,
          });
        }

        // Managers
        const WaypointManager = (await import('../../services/WaypointManager')).default;
        const TrackDrawer = (await import('../../services/TrackDrawer')).default;
        const NoteManager = (await import('../../services/NoteManager')).default;

        // Normalise WaypointManager's Waypoint object → { lat, lng, name } before
        // forwarding to the parent. WaypointManager uses Cesium cartographic;
        // callers (AdventureLocationStep) expect plain lat/lng numbers.
        waypointManagerRef.current = new WaypointManager(viewer, (wp: any) => {
          if (!onWaypointAdded) return;
          const Cesium = window.Cesium;
          const lat = Cesium.Math.toDegrees(wp.cartographic.latitude);
          const lng = Cesium.Math.toDegrees(wp.cartographic.longitude);
          onWaypointAdded({ lat, lng, name: wp.metadata?.name });
        });
        trackDrawerRef.current = new TrackDrawer(
          viewer,
          onRouteCreated,
          (stats) => setDrawingStats(stats),
        );
        noteManagerRef.current = new NoteManager(viewer, onNoteAdded);

        if (initialWaypoints.length > 0) waypointManagerRef.current.loadWaypoints(initialWaypoints);
        if (initialRoutes.length > 0) trackDrawerRef.current.loadRoutes(initialRoutes);

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing Cesium map:', error);
        setIsLoading(false);
      }
    };

    initializeMap();

    return () => {
      waypointManagerRef.current?.destroy();
      trackDrawerRef.current?.destroy();
      noteManagerRef.current?.destroy();
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [cesiumReady]); // intentionally limited — only re-initialize when Cesium becomes available

  // Handle center prop changes without recreating the viewer
  const centerLat = center?.[0];
  const centerLng = center?.[1];
  useEffect(() => {
    if (!viewerRef.current || centerLat == null || centerLng == null) return;
    viewerRef.current.camera.flyTo({
      destination: window.Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 15000),
      orientation: {
        heading: window.Cesium.Math.toRadians(0),
        pitch: window.Cesium.Math.toRadians(-60),
        roll: 0.0,
      },
      duration: 2.0,
    });
  }, [centerLat, centerLng]);

  // ── Layer helpers ──────────────────────────────────────────────────────────

  function applyTopoLayer(viewer: any, Cesium: any) {
    if (linzLayerRef.current) return; // already added
    if (!topoTileUrl) return; // no LINZ key available
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: topoTileUrl,
      minimumLevel: 5,
      maximumLevel: 16,
      rectangle: Cesium.Rectangle.fromDegrees(
        LINZ_CESIUM_RECTANGLE.west,
        LINZ_CESIUM_RECTANGLE.south,
        LINZ_CESIUM_RECTANGLE.east,
        LINZ_CESIUM_RECTANGLE.north,
      ),
      credit: LINZ_ATTRIBUTION,
    });
    linzLayerRef.current = viewer.imageryLayers.addImageryProvider(provider);
  }

  function removeTopoLayer(viewer: any) {
    if (!linzLayerRef.current) return;
    viewer.imageryLayers.remove(linzLayerRef.current);
    linzLayerRef.current = null;
  }

  const handleLayerToggle = () => {
    if (!viewerRef.current) return;
    const Cesium = window.Cesium;
    const next: MapLayer = mapLayer === 'satellite' ? 'topo' : 'satellite';

    if (next === 'topo') {
      applyTopoLayer(viewerRef.current, Cesium);
    } else {
      removeTopoLayer(viewerRef.current);
    }

    localStorage.setItem(LAYER_STORAGE_KEY, next);
    setMapLayer(next);
  };

  // ── Mode controls ──────────────────────────────────────────────────────────

  const handleModeChange = (newMode: MapMode['type']) => {
    if (!viewerRef.current) return;

    waypointManagerRef.current?.setMode(false);
    trackDrawerRef.current?.setMode(false);
    noteManagerRef.current?.setMode(false);

    const isActive = mapMode.type !== newMode || !mapMode.active;

    switch (newMode) {
      case 'waypoint':
        waypointManagerRef.current?.setMode(isActive);
        break;
      case 'route':
        trackDrawerRef.current?.setMode(isActive);
        if (!isActive) setDrawingStats(null);
        break;
      case 'note':
        noteManagerRef.current?.setMode(isActive);
        break;
      default:
        break;
    }

    setMapMode({ type: newMode, active: isActive });
  };

  const handleUndo = () => {
    trackDrawerRef.current?.undoLastPoint();
  };

  const handleClearRoute = () => {
    trackDrawerRef.current?.clearAll();
    setDrawingStats(null);
  };

  const resetView = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.setView({
        destination: window.Cesium.Cartesian3.fromDegrees(
          center?.[1] ?? 172.0,
          center?.[0] ?? -41.5,
          center ? 10000 : 2500000,
        ),
        orientation: {
          heading: window.Cesium.Math.toRadians(0),
          pitch: window.Cesium.Math.toRadians(-45),
          roll: 0.0,
        },
      });
    }
  };

  const goToCurrentLocation = () => {
    if (navigator.geolocation && viewerRef.current) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          viewerRef.current.camera.setView({
            destination: window.Cesium.Cartesian3.fromDegrees(
              coords.longitude,
              coords.latitude,
              5000,
            ),
            orientation: {
              heading: window.Cesium.Math.toRadians(0),
              pitch: window.Cesium.Math.toRadians(-45),
              roll: 0.0,
            },
          });
          onWaypointAdded?.({
            lat: coords.latitude,
            lng: coords.longitude,
            name: 'Current Location',
            description: 'Your current GPS location',
          });
        },
        () => alert('Unable to get your location. Please check location permissions.'),
      );
    } else {
      alert('Geolocation is not supported by this browser.');
    }
  };

  const exportData = () => {
    const data = {
      waypoints: waypointManagerRef.current?.getWaypoints() || [],
      routes: trackDrawerRef.current?.getRoutes() || [],
      notes: noteManagerRef.current?.getNotes() || [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trip-planning-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────

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

          <div className="d-flex gap-2 flex-wrap">
            {/* Layer toggle */}
            <ButtonGroup size="sm">
              <Button
                variant={mapLayer === 'satellite' ? 'primary' : 'outline-secondary'}
                onClick={() => mapLayer !== 'satellite' && handleLayerToggle()}
                title="Satellite imagery"
              >
                Sat
              </Button>
              <Button
                variant={mapLayer === 'topo' ? 'primary' : 'outline-secondary'}
                onClick={() => mapLayer !== 'topo' && handleLayerToggle()}
                title={topoTileUrl ? 'LINZ Topo50 (NZ)' : 'Topo unavailable — set LINZ_LDS_API_KEY'}
                disabled={!topoTileUrl}
              >
                <Layers size={14} className="me-1" />
                Topo
              </Button>
            </ButtonGroup>

            {/* Map mode controls */}
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
                title="Draw Route"
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

            {/* Route drawing controls — only visible when route mode is active */}
            {mapMode.type === 'route' && mapMode.active && (
              <ButtonGroup size="sm">
                <Button
                  variant="outline-warning"
                  onClick={handleUndo}
                  title="Undo last point"
                  disabled={!drawingStats || drawingStats.pointCount === 0}
                >
                  <Undo2 size={16} />
                </Button>
                <Button
                  variant="outline-danger"
                  onClick={handleClearRoute}
                  title="Clear route"
                >
                  ✕
                </Button>
              </ButtonGroup>
            )}

            {/* Utility controls */}
            <ButtonGroup size="sm">
              <Button
                variant="outline-secondary"
                onClick={goToCurrentLocation}
                title="Go to Current Location"
              >
                <Navigation size={16} />
              </Button>
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

        {/* Mode instructions */}
        {mapMode.active && (
          <div className="mt-2">
            <small className="text-muted">
              {mapMode.type === 'waypoint' && 'Click on the map to add waypoints'}
              {mapMode.type === 'route' && 'Click to add route points · Double-click to finish · Undo removes last point'}
              {mapMode.type === 'note' && 'Click on the map to add notes'}
            </small>
          </div>
        )}

        {/* LINZ attribution — required when topo layer is active */}
        {mapLayer === 'topo' && (
          <div className="mt-1">
            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
              {LINZ_ATTRIBUTION} · Topo50 layer covers NZ only; satellite shows outside NZ bounds
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
          style={{ height, width: '100%', backgroundColor: '#000' }}
        />

        {/* Route stats + elevation profile — shown while drawing or after finishing */}
        {drawingStats && drawingStats.pointCount >= 1 && (
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb',
              padding: '10px 16px',
            }}
          >
            {/* Stats row */}
            <div className="d-flex gap-4 align-items-center mb-2" style={{ fontSize: '0.82rem' }}>
              <div>
                <span className="text-muted me-1">Distance</span>
                <strong>{drawingStats.distance.toFixed(2)} km</strong>
              </div>
              <div>
                <span className="text-muted me-1">↗</span>
                <strong>{drawingStats.elevationGain.toFixed(0)} m</strong>
              </div>
              <div>
                <span className="text-muted me-1">↘</span>
                <strong>{drawingStats.elevationLoss.toFixed(0)} m</strong>
              </div>
              <div>
                <span className="text-muted me-1">Est. time</span>
                <strong>{formatTime(drawingStats.estimatedTime)}</strong>
              </div>
              <div className="ms-auto text-muted" style={{ fontSize: '0.72rem' }}>
                {drawingStats.pointCount} pts · Naismith's rule
              </div>
            </div>

            {/* Elevation profile */}
            {drawingStats.profile.length >= 2 && (
              <ElevationChart points={drawingStats.profile} />
            )}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default TripPlanningMap;
