/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { MapPin, Route, StickyNote, Download, RotateCcw, Navigation, Layers, Undo2, Redo2, Footprints, X, Eye, Pencil, Check, Play, Square, TrendingUp, Maximize2, Minimize2 } from 'lucide-react';
import { getTopoTileUrl, LINZ_CESIUM_RECTANGLE, LINZ_ATTRIBUTION } from '../../services/LinzMapService';
import {
  AU_CESIUM_RECTANGLE,
  NSW_CESIUM_RECTANGLE,
  GA_TOPO_URL,
  NSW_TOPO_URL,
  GA_ATTRIBUTION,
  NSW_ATTRIBUTION,
} from '../../services/AusMapService';
import { resolveBasemap, type MapLayer } from '../../services/BasemapSuggest';
import { detectDeviceTier, applyPerformanceProfile } from '../../services/MapPerformance';
import { API_CONFIG } from '../../config/api';
import type { DrawingStats, SerializableTrack } from '../../services/TrackDrawer';
import type { TrailSelection } from '../../services/TrailLayerManager';
import type { MapNote } from '../../services/NoteManager';
import NoteModal from './NoteModal';
import type { LatLng } from '../../types/adventure';

type SceneMode = '2d' | '3d';

interface TripPlanningMapProps {
  height?: string;
  center?: [number, number]; // [lat, lng]
  onWaypointAdded?: (waypoint: any) => void;
  onRouteCreated?: (route: SerializableTrack) => void;
  onNoteAdded?: (note: any) => void;
  initialWaypoints?: any[];
  initialRoutes?: any[];
  /** When set to '2d-topo', the map opens flat with the LINZ topo layer applied. Default 3d-satellite. */
  initialMode?: '2d-topo' | '3d-satellite';
  /** A DOC track to render and highlight on first mount — camera flies to its bounds */
  preselectedTrail?: { id: string; name: string; geometry: LatLng[] };
  /** If no preselect, fly to the user's geolocation and auto-enable the trail discovery layer */
  fallbackToCurrentLocation?: boolean;
  /** View-only mode for TripLink overview pages: hides all editing chrome (mode selector,
   *  route/note tools, edit, export) and disables drawing. Keeps layers, fullscreen,
   *  locate/reset and flyover so a watcher can still explore the planned route. */
  readOnly?: boolean;
  /** Drops a "last check-in" pin on the map (view pages). */
  checkInMarker?: { lat: number; lng: number } | null;
  /** Drops a distinct "live" marker at the traveller's current position (live location
   *  Stage 1). Distinct from the static check-in pin. Stale/greyed treatment lands in Slice 02. */
  liveMarker?: { lat: number; lng: number } | null;
}

interface MapMode {
  type: 'view' | 'waypoint' | 'route' | 'note';
  active: boolean;
}

// ─── Elevation profile chart ────────────────────────────────────────────────

interface ElevationChartProps {
  points: Array<{ dist: number; ele: number }>;
  /** Called with the index of the hovered point, or -1 when the mouse leaves */
  onHover?: (index: number) => void;
  /** Externally-driven highlight index (e.g. from hovering the route on the map) */
  highlightIndex?: number;
}

/** Map slope percentage to a color: green (flat) → yellow → orange → red (steep) */
function slopeColor(slopePct: number): string {
  const abs = Math.abs(slopePct);
  if (abs < 5) return '#22c55e';   // green — easy
  if (abs < 10) return '#eab308';  // yellow — moderate
  if (abs < 15) return '#f97316';  // orange — steep
  return '#ef4444';                // red — very steep
}

const ElevationChart: React.FC<ElevationChartProps> = ({ points, onHover, highlightIndex }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState(-1);

  if (points.length < 2) return null;

  const W = 600;
  const H = 140;
  const pad = { left: 42, right: 12, top: 10, bottom: 24 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const maxDist = points[points.length - 1].dist;
  const eles = points.map(p => p.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const eleRange = maxEle - minEle || 1;

  const px = (d: number) => pad.left + (d / maxDist) * cW;
  const py = (e: number) => pad.top + cH - ((e - minEle) / eleRange) * cH;

  // Compute slope-colored segments
  const segments: Array<{ d: string; color: string; slope: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].dist - points[i].dist;
    const dEle = points[i + 1].ele - points[i].ele;
    const slope = dx > 0 ? (dEle / (dx * 1000)) * 100 : 0;
    const d = `M${px(points[i].dist).toFixed(1)},${py(points[i].ele).toFixed(1)} L${px(points[i + 1].dist).toFixed(1)},${py(points[i + 1].ele).toFixed(1)}`;
    segments.push({ d, color: slopeColor(slope), slope });
  }

  // Fill path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.dist).toFixed(1)},${py(p.ele).toFixed(1)}`)
    .join(' ');
  const fillD = `${pathD} L${px(maxDist).toFixed(1)},${(pad.top + cH).toFixed(1)} L${pad.left},${(pad.top + cH).toFixed(1)} Z`;

  // Y-axis grid
  const ySteps = 4;
  const yGridLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const ele = minEle + (eleRange * i) / ySteps;
    return { y: py(ele), label: `${ele.toFixed(0)}m` };
  });

  // X-axis labels
  const xSteps = 4;
  const xLabels = Array.from({ length: xSteps + 1 }, (_, i) => {
    const dist = (maxDist * i) / xSteps;
    return { x: px(dist), label: dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km` };
  });

  // Active hover index (local hover takes priority, then external highlight)
  const activeIdx = hoverIdx >= 0 ? hoverIdx : (highlightIndex ?? -1);
  const activePoint = activeIdx >= 0 && activeIdx < points.length ? points[activeIdx] : null;
  const activeSlope = activeIdx >= 0 && activeIdx < segments.length ? segments[activeIdx].slope : 0;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Convert screen X to SVG viewBox X
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    // Convert SVG X to distance
    const dist = ((svgX - pad.left) / cW) * maxDist;
    if (dist < 0 || dist > maxDist) {
      setHoverIdx(-1);
      onHover?.(-1);
      return;
    }
    // Find closest point index by distance
    let closest = 0;
    let closestDelta = Math.abs(points[0].dist - dist);
    for (let i = 1; i < points.length; i++) {
      const delta = Math.abs(points[i].dist - dist);
      if (delta < closestDelta) {
        closest = i;
        closestDelta = delta;
      }
    }
    setHoverIdx(closest);
    onHover?.(closest);
  };

  const handleMouseLeave = () => {
    setHoverIdx(-1);
    onHover?.(-1);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      style={{ display: 'block', cursor: 'crosshair' }}
      aria-label="Elevation profile"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {yGridLines.map((g, i) => (
        <g key={`yg-${i}`}>
          <line
            x1={pad.left} y1={g.y}
            x2={pad.left + cW} y2={g.y}
            stroke="#e5e7eb" strokeWidth={i === 0 ? 1 : 0.5}
            strokeDasharray={i === 0 ? undefined : '4,3'}
          />
          <text x={pad.left - 4} y={g.y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">
            {g.label}
          </text>
        </g>
      ))}

      {/* Fill */}
      <path d={fillD} fill="url(#eleGrad)" />

      {/* Slope-colored line segments */}
      {segments.map((seg, i) => (
        <path
          key={`seg-${i}`}
          d={seg.d}
          fill="none"
          stroke={seg.color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Hover crosshair + tooltip */}
      {activePoint && (
        <g>
          {/* Vertical crosshair line */}
          <line
            x1={px(activePoint.dist)} y1={pad.top}
            x2={px(activePoint.dist)} y2={pad.top + cH}
            stroke="#3b82f6" strokeWidth="1" strokeDasharray="3,2" opacity="0.7"
          />
          {/* Dot on the profile line */}
          <circle
            cx={px(activePoint.dist)}
            cy={py(activePoint.ele)}
            r="4"
            fill="#3b82f6"
            stroke="#fff"
            strokeWidth="1.5"
          />
          {/* Tooltip background + text */}
          <g transform={`translate(${Math.min(px(activePoint.dist) + 8, W - 100)}, ${Math.max(py(activePoint.ele) - 42, pad.top)})`}>
            <rect x={0} y={0} width={92} height={38} rx={4} fill="rgba(30,41,59,0.92)" />
            <text x={6} y={13} fontSize="9" fontWeight="600" fill="#fff">
              {activePoint.ele.toFixed(0)}m
            </text>
            <text x={6} y={25} fontSize="8" fill="#94a3b8">
              {activePoint.dist < 1
                ? `${(activePoint.dist * 1000).toFixed(0)}m`
                : `${activePoint.dist.toFixed(2)}km`}
              {' · '}
              {activeSlope > 0 ? '+' : ''}{activeSlope.toFixed(1)}%
            </text>
          </g>
        </g>
      )}

      {/* X labels */}
      {xLabels.map((xl, i) => (
        <text
          key={`xl-${i}`}
          x={xl.x}
          y={H - 4}
          textAnchor={i === 0 ? 'start' : i === xSteps ? 'end' : 'middle'}
          fontSize="9"
          fill="#9ca3af"
        >
          {xl.label}
        </text>
      ))}

      {/* Slope legend */}
      <g transform={`translate(${pad.left + cW - 120}, ${pad.top})`}>
        {[
          { color: '#22c55e', label: '<5%' },
          { color: '#eab308', label: '5-10%' },
          { color: '#f97316', label: '10-15%' },
          { color: '#ef4444', label: '>15%' },
        ].map((s, i) => (
          <g key={`leg-${i}`} transform={`translate(${i * 30}, 0)`}>
            <rect x={0} y={0} width={8} height={8} rx={2} fill={s.color} />
            <text x={10} y={7} fontSize="7" fill="#9ca3af">{s.label}</text>
          </g>
        ))}
      </g>
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
const TRAIL_LAYER_STORAGE_KEY = 'upto_trail_layer';
const SCENE_MODE_STORAGE_KEY = 'upto_scene_mode';
const SLOPE_OVERLAY_STORAGE_KEY = 'upto_slope_overlay';

// ─── Component ────────────────────────────────────────────────────────────────

export const TripPlanningMap: React.FC<TripPlanningMapProps> = ({
  height = '600px',
  center,
  onWaypointAdded,
  onRouteCreated,
  onNoteAdded,
  initialWaypoints = [],
  initialRoutes = [],
  initialMode = '3d-satellite',
  preselectedTrail,
  fallbackToCurrentLocation = false,
  readOnly = false,
  checkInMarker = null,
  liveMarker = null,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const waypointManagerRef = useRef<any>(null);
  const trackDrawerRef = useRef<any>(null);
  const noteManagerRef = useRef<any>(null);
  const trailLayerRef = useRef<any>(null);
  // Reference to whichever topo imagery layer is currently on top of the satellite base.
  // Only one topo basemap can be active at a time — swap swaps the whole layer.
  const basemapLayerRef = useRef<{ layer: any; kind: Exclude<MapLayer, 'satellite'> } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [mapMode, setMapMode] = useState<MapMode>({ type: 'view', active: false });
  const [cesiumReady, setCesiumReady] = useState(false);
  const topoTileUrl = getTopoTileUrl(); // null if no LINZ key available
  // User's durable preference (null = let auto-detect decide). Persisted across
  // sessions; honoured only while the centre is still inside the preference's
  // native region — otherwise we fall through to the viewport suggestion.
  const [userOverride, setUserOverride] = useState<MapLayer | null>(() => {
    const raw = localStorage.getItem(LAYER_STORAGE_KEY);
    if (!raw) return null;
    if (raw === 'topo') return 'topo-linz'; // back-compat migration
    if (raw === 'satellite' || raw === 'topo-linz' || raw === 'topo-ga' || raw === 'topo-nsw') {
      return raw;
    }
    return null;
  });
  // What's actually rendering right now (diverges from userOverride during auto-switch).
  // initialMode='2d-topo' forces LINZ on mount regardless of override.
  const [mapLayer, setMapLayer] = useState<MapLayer>(() => {
    if (initialMode === '2d-topo' && topoTileUrl) return 'topo-linz';
    return userOverride ?? 'satellite';
  });
  const [sceneMode, setSceneMode] = useState<SceneMode>(() => {
    if (initialMode === '2d-topo') return '2d';
    const saved = localStorage.getItem(SCENE_MODE_STORAGE_KEY) as SceneMode | null;
    return saved ?? '3d';
  });
  const [drawingStats, setDrawingStats] = useState<DrawingStats | null>(null);
  const [trailLayerEnabled, setTrailLayerEnabled] = useState<boolean>(
    () => localStorage.getItem(TRAIL_LAYER_STORAGE_KEY) === 'on',
  );
  const [slopeOverlayOn, setSlopeOverlayOn] = useState<boolean>(
    () => localStorage.getItem(SLOPE_OVERLAY_STORAGE_KEY) === 'on',
  );
  const [selectedTrail, setSelectedTrail] = useState<TrailSelection | null>(null);
  const [trailsLoading, setTrailsLoading] = useState(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [trailLayerOpacity, setTrailLayerOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('upto_trail_layer_opacity');
    const n = saved ? Number(saved) : 0.9;
    return Number.isFinite(n) ? n : 0.9;
  });
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  // Fullscreen: tracks both Fullscreen API state and CSS-overlay fallback (when API is unavailable / blocked).
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const noteSubmitRef = useRef<((data: { content: string; title: string; type: MapNote['type'] }) => void) | null>(null);
  /** Pulsing dot entity shown on the map when hovering the elevation chart */
  const profileHighlightRef = useRef<any>(null);
  /** "Last check-in" pin entity (view pages) */
  const checkInMarkerRef = useRef<any>(null);
  /** "Live" position marker entity (live location Stage 1) */
  const liveMarkerRef = useRef<any>(null);
  const flyoverRef = useRef<any>(null);
  // True while a flyover is animating — suppresses the viewport basemap
  // auto-switch so the forced 3D-satellite view sticks for the whole flyover.
  const flyoverActiveRef = useRef(false);
  const [flyoverRunning, setFlyoverRunning] = useState(false);
  const [hasFinishedRoute, setHasFinishedRoute] = useState<boolean>(
    () => (initialRoutes?.length ?? 0) > 0,
  );
  // Terrain-unavailable notice: set true (never back to false) the first time
  // either manager confirms it has no real terrain source this session —
  // dismissible, and must never interrupt drawing.
  const [terrainUnavailable, setTerrainUnavailable] = useState(false);
  const [terrainNoticeDismissed, setTerrainNoticeDismissed] = useState(false);

  // Cesium is bundled (module import), so it is always available on mount.
  useEffect(() => {
    setCesiumReady(true);
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
              Promise.resolve(new Cesium.OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' })),
            );
          }
        } else {
          baseLayer = Cesium.ImageryLayer.fromProviderAsync(
            Promise.resolve(new Cesium.OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' })),
          );
        }

        const viewer = new Cesium.Viewer(mapContainerRef.current!, {
          baseLayer,
          shouldAnimate: true,
          // On-demand rendering: the scene only repaints on camera moves, tile
          // loads, or an explicit scene.requestRender(). A toggle effect flips
          // this OFF (continuous) during drawing/editing/flyover so live updates
          // work; managers call requestRender() after idle-mode entity changes.
          requestRenderMode: true,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          geocoder: false,
          infoBox: true,
          selectionIndicator: true,
        });

        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = true;
        viewer.scene.fog.density = 0.0002;

        // Render at native device resolution for crisp tiles on retina/high-DPI screens
        viewer.useBrowserRecommendedResolution = false;
        // Disable FXAA — it blurs tile text and contour lines
        viewer.scene.postProcessStages.fxaa.enabled = false;

        // Device-tier performance profile. Desktop ('high') reproduces the previous
        // hand-tuned settings exactly — SSE 1.333, MSAA 4×, native resolution, fog +
        // atmosphere on — so there's no desktop regression. Mobile tiers relax
        // resolution/SSE and drop MSAA + atmosphere to recover framerate. All values
        // live in MapPerformance.ts for empirical tuning on real devices.
        const perfTier = detectDeviceTier();
        applyPerformanceProfile(viewer, perfTier);
        console.log(`TripPlanningMap: performance tier = ${perfTier}`);

        viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
          Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
        );

        // Only load 3D terrain when actually in 3D mode — in 2D the terrain mesh
        // distorts the flat topo tiles and wastes bandwidth.
        if (hasValidToken && sceneMode !== '2d') {
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

        // Apply initial basemap. initialMode='2d-topo' wins — the wizard always
        // opens on LINZ topo if we have a key. Otherwise honour the stored
        // override if we have one; auto-switch will refine once the camera settles.
        if (initialMode === '2d-topo' && topoTileUrl) {
          applyBasemap(viewer, Cesium, 'topo-linz');
          localStorage.setItem(LAYER_STORAGE_KEY, 'topo-linz');
        } else if (userOverride && userOverride !== 'satellite') {
          applyBasemap(viewer, Cesium, userOverride);
        }

        // Morph to 2D before any camera movement so flyTo lands in the right scene mode.
        if (sceneMode === '2d') {
          viewer.scene.morphTo2D(0);
        }

        // Camera — preselectedTrail takes over framing below via TrailLayerManager.preselect.
        // When there's no preselected trail but we have a center, soft-land at 8 km / -45°
        // (down from 15 km / -60° which framed too steep and too far out).
        if (preselectedTrail) {
          // Instant land near the trail centroid; preselect() then animates the tight fit.
          const lats = preselectedTrail.geometry.map(([lat]) => lat);
          const lngs = preselectedTrail.geometry.map(([, lng]) => lng);
          const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(cLng, cLat, 8000),
            duration: 0,
          });
        } else if (center) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(center[1], center[0], 8000),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-45),
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
        const TrailLayerManager = (await import('../../services/TrailLayerManager')).default;

        // Both map managers independently attempt real-terrain sampling; either
        // confirming "no source this session" is enough to raise the notice.
        const onTerrainAvailability = (available: boolean) => {
          if (!available) setTerrainUnavailable(true);
        };

        // Normalise WaypointManager's Waypoint object → { lat, lng, name } before
        // forwarding to the parent. WaypointManager uses Cesium cartographic;
        // callers (AdventureLocationStep) expect plain lat/lng numbers.
        waypointManagerRef.current = new WaypointManager(viewer, (wp: any) => {
          if (!onWaypointAdded) return;
          const lat = Cesium.Math.toDegrees(wp.cartographic.latitude);
          const lng = Cesium.Math.toDegrees(wp.cartographic.longitude);
          onWaypointAdded({ lat, lng, name: wp.metadata?.name });
        }, onTerrainAvailability);
        trackDrawerRef.current = new TrackDrawer(
          viewer,
          (track) => {
            setHasFinishedRoute(true);
            onRouteCreated?.(track);
          },
          (stats) => setDrawingStats(stats),
          API_CONFIG.BASE_URL,
          undefined,
          onTerrainAvailability,
        );
        noteManagerRef.current = new NoteManager(viewer, onNoteAdded, (_position, onSubmit) => {
          noteSubmitRef.current = onSubmit;
          setNoteModalOpen(true);
        });
        trailLayerRef.current = new TrailLayerManager(viewer, (sel) => setSelectedTrail(sel), API_CONFIG.BASE_URL, (loading) => setTrailsLoading(loading));
        trailLayerRef.current.setOpacity(trailLayerOpacity);

        const RouteFlyover = (await import('../../services/RouteFlyover')).default;
        flyoverRef.current = new RouteFlyover(viewer);

        if (initialWaypoints.length > 0) waypointManagerRef.current.loadWaypoints(initialWaypoints);
        if (initialRoutes.length > 0) trackDrawerRef.current.loadRoutes(initialRoutes);

        // Restore persisted slope overlay after any initial routes are loaded
        if (slopeOverlayOn) {
          trackDrawerRef.current.setSlopeOverlayEnabled(true);
        }

        // Restore persisted trail-layer toggle (must be after the manager is created)
        if (localStorage.getItem(TRAIL_LAYER_STORAGE_KEY) === 'on') {
          trailLayerRef.current.enable();
        }

        // Preselect a DOC track (from the wizard's auto-suggested route) if provided
        if (preselectedTrail) {
          trailLayerRef.current.enable();
          setTrailLayerEnabled(true);
          localStorage.setItem(TRAIL_LAYER_STORAGE_KEY, 'on');
          trailLayerRef.current.preselect(preselectedTrail);
        } else if (fallbackToCurrentLocation) {
          // No good match — turn the discovery layer on so panning reveals nearby tracks,
          // then fly to the user's geolocation if available.
          trailLayerRef.current.enable();
          setTrailLayerEnabled(true);
          localStorage.setItem(TRAIL_LAYER_STORAGE_KEY, 'on');
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                viewer.camera.flyTo({
                  destination: Cesium.Cartesian3.fromDegrees(
                    pos.coords.longitude,
                    pos.coords.latitude,
                    8000,
                  ),
                  duration: 1.2,
                });
              },
              () => { /* permission denied / unavailable — leave default view */ },
              { timeout: 5000, maximumAge: 60_000 },
            );
          }
        }

        // Paint the initial scene (loaded routes/waypoints) under requestRenderMode.
        viewer.scene.requestRender();
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
      trailLayerRef.current?.destroy();
      flyoverRef.current?.destroy();
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [cesiumReady]); // intentionally limited — only re-initialize when Cesium becomes available

  // Handle center prop changes without recreating the viewer.
  // If a preselected trail is driving the framing, don't fight it — the trail's
  // bounds already frame the scene tighter than a single lat/lng ever could.
  const centerLat = center?.[0];
  const centerLng = center?.[1];
  const hasPreselectedTrail = !!preselectedTrail;
  useEffect(() => {
    if (!viewerRef.current || centerLat == null || centerLng == null) return;
    if (hasPreselectedTrail) return;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 8000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0,
      },
      duration: 1.2,
    });
  }, [centerLat, centerLng, hasPreselectedTrail]);

  // ── Layer helpers ──────────────────────────────────────────────────────────

  /**
   * Swap the active topo basemap to the target. Satellite is represented by the
   * absence of any overlay (the Cesium base layer is always satellite/OSM).
   * Safe to call with the already-active layer — early-returns.
   */
  function applyBasemap(viewer: any, Cesium: any, target: MapLayer) {
    // Remove whatever is active if it's not already what we want
    if (basemapLayerRef.current && basemapLayerRef.current.kind !== target) {
      try { viewer.imageryLayers.remove(basemapLayerRef.current.layer); } catch { /* ignore */ }
      basemapLayerRef.current = null;
    }
    if (target === 'satellite') return;
    if (basemapLayerRef.current) return; // already the right one

    let provider: any = null;
    if (target === 'topo-linz') {
      if (!topoTileUrl) return; // no LINZ key — silently skip
      provider = new Cesium.UrlTemplateImageryProvider({
        url: topoTileUrl,
        minimumLevel: 5,
        maximumLevel: 19,
        rectangle: Cesium.Rectangle.fromDegrees(
          LINZ_CESIUM_RECTANGLE.west,
          LINZ_CESIUM_RECTANGLE.south,
          LINZ_CESIUM_RECTANGLE.east,
          LINZ_CESIUM_RECTANGLE.north,
        ),
        credit: LINZ_ATTRIBUTION,
      });
    } else if (target === 'topo-ga') {
      provider = new Cesium.UrlTemplateImageryProvider({
        url: GA_TOPO_URL,
        minimumLevel: 4,
        maximumLevel: 14, // GA national tops out ~1:250k
        rectangle: Cesium.Rectangle.fromDegrees(
          AU_CESIUM_RECTANGLE.west,
          AU_CESIUM_RECTANGLE.south,
          AU_CESIUM_RECTANGLE.east,
          AU_CESIUM_RECTANGLE.north,
        ),
        credit: GA_ATTRIBUTION,
      });
    } else if (target === 'topo-nsw') {
      provider = new Cesium.UrlTemplateImageryProvider({
        url: NSW_TOPO_URL,
        minimumLevel: 7,
        maximumLevel: 16, // NSW Topo goes to ~1:25k
        rectangle: Cesium.Rectangle.fromDegrees(
          NSW_CESIUM_RECTANGLE.west,
          NSW_CESIUM_RECTANGLE.south,
          NSW_CESIUM_RECTANGLE.east,
          NSW_CESIUM_RECTANGLE.north,
        ),
        credit: NSW_ATTRIBUTION,
      });
    }
    if (!provider) return;
    basemapLayerRef.current = {
      layer: viewer.imageryLayers.addImageryProvider(provider),
      kind: target,
    };
  }

  const handleLayerChange = (target: MapLayer) => {
    if (!viewerRef.current) return;
    applyBasemap(viewerRef.current, Cesium, target);
    localStorage.setItem(LAYER_STORAGE_KEY, target);
    setUserOverride(target);
    setMapLayer(target);
    viewerRef.current.scene.requestRender();
  };

  // Debounced viewport → basemap auto-switch.
  // On each camera settle, resolve the target from the centre + user override
  // and swap if it differs from what's currently painted. The override is
  // durable — panning out of region falls through to auto-suggest; panning
  // back in resumes the user's preference without needing a re-click.
  useEffect(() => {
    if (!cesiumReady || !viewerRef.current) return;
    const viewer = viewerRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const recompute = () => {
      // Don't fight the forced satellite view during a flyover.
      if (flyoverActiveRef.current) return;
      const carto = viewer.camera.positionCartographic;
      if (!carto) return;
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const target = resolveBasemap(lat, lng, userOverride);
      if (target === mapLayer) return;
      applyBasemap(viewer, Cesium, target);
      setMapLayer(target);
      viewer.scene.requestRender();
    };

    const onMoveEnd = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(recompute, 500);
    };

    viewer.camera.moveEnd.addEventListener(onMoveEnd);
    // Fire once so the initial centre picks the right basemap even when no
    // override is set and the mount-time apply left us on 'satellite'.
    recompute();

    return () => {
      if (timer) clearTimeout(timer);
      try { viewer.camera.moveEnd.removeEventListener(onMoveEnd); } catch { /* ignore */ }
    };
  }, [cesiumReady, userOverride, mapLayer]);

  const handleTrailLayerToggle = () => {
    const next = !trailLayerEnabled;
    if (next) trailLayerRef.current?.enable();
    else trailLayerRef.current?.disable();
    localStorage.setItem(TRAIL_LAYER_STORAGE_KEY, next ? 'on' : 'off');
    setTrailLayerEnabled(next);
  };

  const handleSlopeOverlayToggle = () => {
    const next = !slopeOverlayOn;
    trackDrawerRef.current?.setSlopeOverlayEnabled(next);
    localStorage.setItem(SLOPE_OVERLAY_STORAGE_KEY, next ? 'on' : 'off');
    setSlopeOverlayOn(next);
  };

  const handleTrailLayerOpacity = (value: number) => {
    setTrailLayerOpacity(value);
    localStorage.setItem('upto_trail_layer_opacity', String(value));
    trailLayerRef.current?.setOpacity?.(value);
  };

  const handleClearSelectedTrail = () => {
    trailLayerRef.current?.clearSelection();
  };

  const handleSceneModeChange = async (next: SceneMode) => {
    if (next === sceneMode || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const camera = viewer.camera;

    // Capture current camera position so we can restore it after the morph
    const savedPosition = camera.positionCartographic.clone();
    const savedHeading = camera.heading;
    const savedPitch = camera.pitch;

    const restoreCamera = () => {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(
          savedPosition.longitude,
          savedPosition.latitude,
          savedPosition.height,
        ),
        orientation: {
          heading: savedHeading,
          pitch: next === '2d' ? Cesium.Math.toRadians(-90) : savedPitch,
          roll: 0.0,
        },
        duration: 0,
      });
    };

    // Listen for morph completion, then restore camera
    const removeListener = viewer.scene.morphComplete.addEventListener(() => {
      removeListener();
      restoreCamera();
      viewer.scene.requestRender();
    });

    // Morph instantly (duration 0). Cesium's *animated* morph swings the camera
    // out to a global view and back — that's the zoom-out users see. An instant
    // morph flips the mode in place, and restoreCamera() keeps the saved spot.
    if (next === '2d') {
      // Flatten terrain so topo tiles render cleanly
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      viewer.scene.morphTo2D(0);
    } else {
      viewer.scene.morphTo3D(0);
      // Restore 3D terrain
      try {
        const terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, {
          requestWaterMask: true,
          requestVertexNormals: true,
        });
        viewer.terrainProvider = terrainProvider;
      } catch {
        // Fall back to ellipsoid
      }
    }
    localStorage.setItem(SCENE_MODE_STORAGE_KEY, next);
    setSceneMode(next);
    viewer.scene.requestRender();
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
        // No stats-clear on toggle-off: a mid-draw cancel emits null itself,
        // and a finished route's reference panel should survive mode changes.
        trackDrawerRef.current?.setMode(isActive);
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

  const handleRedo = () => {
    trackDrawerRef.current?.redoLastPoint();
  };

  const handleClearRoute = () => {
    trackDrawerRef.current?.clearAll(); // emits the panel-clearing null itself
    setHasFinishedRoute(false);
    flyoverRef.current?.stop();
  };

  const handleEditRoute = () => {
    const entered = trackDrawerRef.current?.enterEditMode();
    if (entered) {
      // Deactivate other modes
      waypointManagerRef.current?.setMode(false);
      noteManagerRef.current?.setMode(false);
      setMapMode({ type: 'view', active: false });
    }
  };

  const handleFinishEdit = () => {
    trackDrawerRef.current?.exitEditMode();
  };

  const handleFlyoverToggle = async () => {
    const flyover = flyoverRef.current;
    if (!flyover) return;
    if (flyover.isRunning()) {
      flyover.stop();
      return;
    }
    const positions = trackDrawerRef.current?.getLatestTrackPositions();
    if (!positions || positions.length < 2) return;

    // Flyover looks best as 3D satellite (topo tiles distort draped on terrain).
    // Remember the working view, force 3D + satellite, and restore on stop.
    const prevLayer = mapLayer;
    const prevScene = sceneMode;
    flyoverActiveRef.current = true; // suppress auto basemap switch during the flight
    // Force continuous rendering now (don't wait for the effect) so the clock-driven
    // chase-cam animates from the first frame.
    if (viewerRef.current) viewerRef.current.scene.requestRenderMode = false;

    if (mapLayer !== 'satellite') {
      applyBasemap(viewerRef.current, Cesium, 'satellite');
      setMapLayer('satellite');
    }
    if (sceneMode !== '3d') {
      await handleSceneModeChange('3d');
    }

    const started = flyover.start(positions, {
      onStop: () => {
        flyoverActiveRef.current = false;
        // Restore the working view the user had before the flyover.
        if (prevScene !== '3d') handleSceneModeChange(prevScene);
        if (prevLayer !== 'satellite') {
          applyBasemap(viewerRef.current, Cesium, prevLayer);
          setMapLayer(prevLayer);
        }
        setFlyoverRunning(false);
      },
    });
    if (started) setFlyoverRunning(true);
    else flyoverActiveRef.current = false; // start failed — drop the suppression
  };

  // ── Elevation profile ↔ map sync ──────────────────────────────────────────

  const handleProfileHover = useCallback((index: number) => {
    if (!viewerRef.current) return;

    // Remove previous highlight
    if (profileHighlightRef.current) {
      viewerRef.current.entities.remove(profileHighlightRef.current);
      profileHighlightRef.current = null;
    }

    if (index < 0) return;

    const pos = trackDrawerRef.current?.getDrawingPointPosition(index);
    if (!pos) return;

    profileHighlightRef.current = viewerRef.current.entities.add({
      position: pos,
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#3b82f6'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }, []);

  // ── Last check-in pin (view pages) ─────────────────────────────────────────
  // Adds/updates/removes a distinct green pin at the most recent check-in location.
  // Keyed on isLoading too so it runs once the viewer finishes initialising.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !cesiumReady) return;
    if (checkInMarkerRef.current) {
      viewer.entities.remove(checkInMarkerRef.current);
      checkInMarkerRef.current = null;
    }
    if (!checkInMarker) { viewer.scene.requestRender(); return; }
    checkInMarkerRef.current = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(checkInMarker.lng, checkInMarker.lat),
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString('#16a34a'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        // No CLAMP_TO_GROUND: clamped `point` graphics don't render in SCENE2D (the view
        // pages' default). disableDepthTestDistance keeps it on top in both 2D and 3D.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'Last check-in',
        font: '600 11pt sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -22),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#14532d'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0),
      },
    });
    viewer.scene.requestRender();
  }, [checkInMarker?.lat, checkInMarker?.lng, cesiumReady, isLoading]);

  // ── Live position marker (view pages) ──────────────────────────────────────
  // A distinct blue "Live" marker at the traveller's current position. Kept visually
  // separate from the static green check-in pin. Stale/greyed treatment lands in Slice 02.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !cesiumReady) return;
    if (liveMarkerRef.current) {
      viewer.entities.remove(liveMarkerRef.current);
      liveMarkerRef.current = null;
    }
    if (!liveMarker) { viewer.scene.requestRender(); return; }
    liveMarkerRef.current = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(liveMarker.lng, liveMarker.lat),
      point: {
        pixelSize: 15,
        color: Cesium.Color.fromCssColorString('#2563eb'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        // No CLAMP_TO_GROUND: clamped `point` graphics don't render in SCENE2D (the view
        // pages' default). disableDepthTestDistance keeps it on top in both 2D and 3D.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'Live',
        font: '600 11pt sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -24),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#1e3a8a'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0),
      },
    });
    viewer.scene.requestRender();
  }, [liveMarker?.lat, liveMarker?.lng, cesiumReady, isLoading]);

  // ── Render mode: continuous during interaction, on-demand when idle ─────────
  // Drawing/editing use CallbackProperty geometry and the flyover uses the clock —
  // all need every-frame rendering. A static map (the common case, incl. the
  // read-only view-page maps) idles the GPU under requestRenderMode.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !cesiumReady) return;
    const interactive = mapMode.active || drawingStats?.phase === 'editing' || flyoverRunning;
    viewer.scene.requestRenderMode = !interactive;
    viewer.scene.requestRender();
  }, [mapMode.active, mapMode.type, drawingStats?.phase, flyoverRunning, cesiumReady, isLoading]);

  // ── Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) ───────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only handle when route mode is active
      if (mapMode.type !== 'route' || !mapMode.active) return;
      // Don't hijack shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mapMode.type, mapMode.active]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  // Fullscreen API where available (resizes container in place, Cesium's resize observer
  // handles the canvas). CSS overlay fallback when the API is missing or rejects (e.g.
  // sandboxed iframes, older iOS Safari). Esc exits in both branches.
  const toggleFullscreen = useCallback(async () => {
    const el = viewportRef.current;
    if (!el) return;

    const exitingFallback = fullscreenFallback;
    const exitingApi = !!document.fullscreenElement;

    if (exitingApi) {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
      return;
    }
    if (exitingFallback) {
      setFullscreenFallback(false);
      setIsFullscreen(false);
      return;
    }

    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // fall through to CSS overlay
      }
    }
    setFullscreenFallback(true);
    setIsFullscreen(true);
  }, [fullscreenFallback]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement || fullscreenFallback);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fullscreenFallback]);

  // Esc-to-exit for the CSS-overlay fallback path. The Fullscreen API handles Esc itself.
  useEffect(() => {
    if (!fullscreenFallback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenFallback(false);
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreenFallback]);

  const resetView = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          center?.[1] ?? 172.0,
          center?.[0] ?? -41.5,
          center ? 10000 : 2500000,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0.0,
        },
        duration: 1.5,
      });
    }
  };

  const goToCurrentLocation = () => {
    if (navigator.geolocation && viewerRef.current) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          viewerRef.current.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              coords.longitude,
              coords.latitude,
              5000,
            ),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-45),
              roll: 0.0,
            },
            duration: 1.5,
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
      <div className="map-loading-placeholder" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading map...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrapper">
      {/* ── Map container with floating overlays ─────────────────────────── */}
      <div
        ref={viewportRef}
        className={`map-viewport${fullscreenFallback ? ' map-viewport-fullscreen-fallback' : ''}`}
        style={{ position: 'relative', borderRadius: fullscreenFallback ? 0 : 12, overflow: 'hidden' }}
      >

        {/* Cesium canvas */}
        <div
          ref={mapContainerRef}
          style={{ height, width: '100%', backgroundColor: '#1a1a2e' }}
        />

        {/* Loading spinner overlay */}
        {isLoading && (
          <div className="map-overlay-center">
            <div className="spinner-border text-primary mb-2" role="status" />
            <div style={{ color: '#fff', fontSize: '0.8rem' }}>Initializing terrain...</div>
          </div>
        )}

        {/* ── TOP-LEFT: Mode selector (vertical pill bar) ─────────────── */}
        {!readOnly && (
        <div className="map-overlay map-overlay-tl">
          {([
            { mode: 'view' as const, icon: <Eye size={18} />, label: 'View' },
            { mode: 'waypoint' as const, icon: <MapPin size={18} />, label: 'Waypoint' },
            { mode: 'route' as const, icon: <Route size={18} />, label: 'Route' },
            { mode: 'note' as const, icon: <StickyNote size={18} />, label: 'Note' },
          ]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              type="button"
              className={`map-btn ${(mode === 'view' ? mapMode.type === 'view' : mapMode.type === mode && mapMode.active) ? 'map-btn-active' : ''}`}
              onClick={() => handleModeChange(mode)}
              title={label}
            >
              {icon}
            </button>
          ))}
        </div>
        )}

        {/* ── TOP-RIGHT: Layers + Fullscreen ──────────────────────────── */}
        <div className="map-overlay map-overlay-tr">
          <button
            type="button"
            className={`map-btn ${layersPanelOpen ? 'map-btn-active' : ''}`}
            onClick={() => setLayersPanelOpen(o => !o)}
            title="Map layers"
          >
            <Layers size={18} />
          </button>

          <button
            type="button"
            className={`map-btn ${isFullscreen ? 'map-btn-active' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {layersPanelOpen && (
            <div className="map-layers-panel">
              <div className="map-layers-title">Layers</div>

              {/* Basemap */}
              <div className="map-layers-section">
                <div className="map-layers-label">Basemap</div>
                <div className="map-layers-thumbs">
                  <button
                    type="button"
                    className={`map-layer-thumb ${mapLayer === 'satellite' ? 'active' : ''}`}
                    onClick={() => mapLayer !== 'satellite' && handleLayerChange('satellite')}
                    title="Satellite imagery"
                  >
                    <span className="map-layer-thumb-preview map-layer-thumb-satellite" />
                    <span className="map-layer-thumb-label">Satellite</span>
                  </button>
                </div>
                <div className="map-layers-sublabel">New Zealand</div>
                <div className="map-layers-thumbs">
                  <button
                    type="button"
                    className={`map-layer-thumb ${mapLayer === 'topo-linz' ? 'active' : ''}`}
                    onClick={() => mapLayer !== 'topo-linz' && handleLayerChange('topo-linz')}
                    disabled={!topoTileUrl}
                    title={topoTileUrl ? 'LINZ Topo50' : 'Topo unavailable (no LINZ key)'}
                  >
                    <span className="map-layer-thumb-preview map-layer-thumb-topo" />
                    <span className="map-layer-thumb-label">LINZ Topo</span>
                  </button>
                </div>
                <div className="map-layers-sublabel">Australia</div>
                <div className="map-layers-thumbs">
                  <button
                    type="button"
                    className={`map-layer-thumb ${mapLayer === 'topo-ga' ? 'active' : ''}`}
                    onClick={() => mapLayer !== 'topo-ga' && handleLayerChange('topo-ga')}
                    title="Geoscience Australia National Topo"
                  >
                    <span className="map-layer-thumb-preview map-layer-thumb-ga" />
                    <span className="map-layer-thumb-label">GA National</span>
                  </button>
                  <button
                    type="button"
                    className={`map-layer-thumb ${mapLayer === 'topo-nsw' ? 'active' : ''}`}
                    onClick={() => mapLayer !== 'topo-nsw' && handleLayerChange('topo-nsw')}
                    title="NSW Spatial Services Topo"
                  >
                    <span className="map-layer-thumb-preview map-layer-thumb-nsw" />
                    <span className="map-layer-thumb-label">NSW Topo</span>
                  </button>
                </div>
              </div>

              {/* Scene mode */}
              <div className="map-layers-section">
                <div className="map-layers-label">Dimension</div>
                <div className="map-layers-row">
                  <button
                    type="button"
                    className={`map-layer-chip ${sceneMode === '2d' ? 'active' : ''}`}
                    onClick={() => handleSceneModeChange('2d')}
                  >
                    2D
                  </button>
                  <button
                    type="button"
                    className={`map-layer-chip ${sceneMode === '3d' ? 'active' : ''}`}
                    onClick={() => handleSceneModeChange('3d')}
                  >
                    3D
                  </button>
                </div>
              </div>

              {/* Overlays */}
              <div className="map-layers-section">
                <div className="map-layers-label">Overlays</div>
                <button
                  type="button"
                  className={`map-layer-chip wide ${trailLayerEnabled ? 'active' : ''}`}
                  onClick={handleTrailLayerToggle}
                >
                  <Footprints size={14} />
                  DOC Tracks
                </button>
                {trailLayerEnabled && (
                  <div className="map-layer-opacity">
                    <span className="map-layer-opacity-label">Opacity</span>
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={trailLayerOpacity}
                      onChange={e => handleTrailLayerOpacity(Number(e.target.value))}
                      aria-label="DOC tracks opacity"
                    />
                    <span className="map-layer-opacity-value">{Math.round(trailLayerOpacity * 100)}%</span>
                  </div>
                )}
                <button
                  type="button"
                  className={`map-layer-chip wide ${slopeOverlayOn ? 'active' : ''}`}
                  onClick={handleSlopeOverlayToggle}
                  title="Color route segments by slope steepness"
                >
                  <TrendingUp size={14} />
                  Steepness
                </button>
              </div>

              {/* Attribution */}
              {mapLayer === 'topo-linz' && (
                <div className="map-layers-attribution">{LINZ_ATTRIBUTION}</div>
              )}
              {mapLayer === 'topo-ga' && (
                <div className="map-layers-attribution">{GA_ATTRIBUTION}</div>
              )}
              {mapLayer === 'topo-nsw' && (
                <div className="map-layers-attribution">{NSW_ATTRIBUTION}</div>
              )}
            </div>
          )}
        </div>

        {/* ── TOP-CENTER: Terrain notice + mode instruction chip ──────── */}
        <div className="map-overlay map-overlay-tc">
          {terrainUnavailable && !terrainNoticeDismissed && (
            <div className="map-terrain-notice">
              <span>Elevation data unavailable — route stats shown without climb.</span>
              <button
                type="button"
                onClick={() => setTerrainNoticeDismissed(true)}
                aria-label="Dismiss"
                className="map-btn-inline"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {(mapMode.active || drawingStats?.phase === 'editing') && (
            <div className="map-instruction-chip">
              {drawingStats?.phase === 'editing' && 'Drag control points to reroute · Drag midpoints to add'}
              {drawingStats?.phase !== 'editing' && mapMode.type === 'waypoint' && 'Click to add waypoints'}
              {drawingStats?.phase !== 'editing' && mapMode.type === 'route' && 'Click to add points · Double-click to finish'}
              {drawingStats?.phase !== 'editing' && mapMode.type === 'note' && 'Click to add notes'}
            </div>
          )}
        </div>

        {/* ── BOTTOM-LEFT: Locate + Reset ─────────────────────────────── */}
        <div className="map-overlay map-overlay-bl">
          <button type="button" className="map-btn" onClick={goToCurrentLocation} title="My location">
            <Navigation size={18} />
          </button>
          <button type="button" className="map-btn" onClick={resetView} title="Reset view">
            <RotateCcw size={18} />
          </button>
        </div>

        {/* ── BOTTOM-RIGHT: Flyover + Export + Edit Route ─────────────── */}
        <div className="map-overlay map-overlay-br">
          {hasFinishedRoute && drawingStats?.phase !== 'editing' && (
            <button
              type="button"
              className={`map-btn ${flyoverRunning ? 'map-btn-danger' : ''}`}
              onClick={handleFlyoverToggle}
              title={flyoverRunning ? 'Stop flyover' : 'Play route flyover'}
            >
              {flyoverRunning ? <Square size={18} /> : <Play size={18} />}
            </button>
          )}
          {!readOnly && drawingStats?.phase !== 'editing' && (
            <button
              type="button"
              className="map-btn"
              onClick={handleEditRoute}
              // Disabled (not silently swallowed) while a finish/edit is
              // still settling heights — enterEditMode would refuse anyway.
              disabled={drawingStats?.phase === 'settling'}
              title={
                drawingStats?.phase === 'settling'
                  ? 'Finalising route elevations…'
                  : 'Edit route (drag points)'
              }
            >
              <Pencil size={18} />
            </button>
          )}
          {!readOnly && (
            <button type="button" className="map-btn" onClick={exportData} title="Export data">
              <Download size={18} />
            </button>
          )}
        </div>

        {/* ── BOTTOM-CENTER: Route drawing controls ───────────────────── */}
        {!readOnly && mapMode.type === 'route' && mapMode.active && (
          <div className="map-overlay map-overlay-bc">
            <div className="map-route-controls">
              <button
                type="button"
                className="map-btn"
                onClick={handleUndo}
                title="Undo (Ctrl+Z)"
                // Undo only acts on an active drawing — during the settle
                // window (phase 'settling') it must read disabled, not no-op.
                disabled={drawingStats?.phase !== 'drawing' || drawingStats.pointCount === 0}
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                className="map-btn"
                onClick={handleRedo}
                title="Redo (Ctrl+Shift+Z)"
                disabled={!drawingStats?.canRedo}
              >
                <Redo2 size={16} />
              </button>
              <button
                type="button"
                className="map-btn map-btn-danger"
                onClick={handleClearRoute}
                title="Clear route"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── BOTTOM-CENTER: Edit mode controls ──────────────────────── */}
        {drawingStats?.phase === 'editing' && (
          <div className="map-overlay map-overlay-bc">
            <div className="map-route-controls">
              <div className="map-edit-label">Drag points to reroute</div>
              <button
                type="button"
                className="map-btn map-btn-success"
                onClick={handleFinishEdit}
                title="Finish editing"
              >
                <Check size={16} />
                <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>Done</span>
              </button>
            </div>
          </div>
        )}

        {/* Trail layer loading indicator */}
        {trailsLoading && (
          <div className="map-loading-pill">
            <span className="map-loading-dot" />
            Loading trails...
          </div>
        )}

        {/* Note creation modal */}
        <NoteModal
          open={noteModalOpen}
          onSubmit={(data) => {
            noteSubmitRef.current?.(data);
            noteSubmitRef.current = null;
            setNoteModalOpen(false);
          }}
          onCancel={() => {
            noteSubmitRef.current = null;
            setNoteModalOpen(false);
          }}
        />

        {/* Selected trail chip — floating inside the map */}
        {selectedTrail && (
          <div className="map-selected-trail">
            <Footprints size={14} />
            <strong>{selectedTrail.name}</strong>
            <span className="map-selected-trail-badge">DOC</span>
            <button
              type="button"
              onClick={handleClearSelectedTrail}
              aria-label="Clear selection"
              className="map-btn-inline"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Below-map panels (outside the viewport) ──────────────────────── */}

      {/* Route stats + elevation profile */}
      {drawingStats && drawingStats.pointCount >= 1 && (
        <div className="map-stats-panel">
          <div className="map-stats-row">
            <div className="map-stat">
              <span className="map-stat-label">Distance</span>
              <span className="map-stat-value">{drawingStats.distance.toFixed(2)} km</span>
            </div>
            {drawingStats.elevationKnown ? (
              <>
                <div className="map-stat">
                  <span className="map-stat-label">↗</span>
                  <span className="map-stat-value">{drawingStats.elevationGain!.toFixed(0)} m</span>
                </div>
                <div className="map-stat">
                  <span className="map-stat-label">↘</span>
                  <span className="map-stat-value">{drawingStats.elevationLoss!.toFixed(0)} m</span>
                </div>
                <div className="map-stat">
                  <span className="map-stat-label">Est. time</span>
                  <span className="map-stat-value">{formatTime(drawingStats.estimatedTime!)}</span>
                </div>
              </>
            ) : (
              <div className="map-stat map-stat-unknown">
                <span className="map-stat-label">Climb</span>
                <span className="map-stat-value">unavailable</span>
              </div>
            )}
            <div className="map-stat-meta">
              {/* Read-only views (shared/active trip) show the same stats card
                  without wizard framing — a watcher sees the planner's numbers. */}
              {drawingStats.phase === 'settling' && 'Saving · '}
              {drawingStats.phase === 'finished' && !readOnly && 'Saved · '}
              {drawingStats.pointCount} pts · Naismith&apos;s rule
            </div>
          </div>

          {drawingStats.elevationKnown && drawingStats.profile.length >= 2 && (
            <ElevationChart points={drawingStats.profile} onHover={handleProfileHover} />
          )}
        </div>
      )}
    </div>
  );
};

export default TripPlanningMap;
