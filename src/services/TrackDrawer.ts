/* eslint-disable @typescript-eslint/no-explicit-any */
import { CesiumManager } from './CesiumManager';
import type { LatLng } from '../types/adventure';
import { TrailSnapService, type SnapResult } from './TrailSnapService';

interface TrackPoint {
  position: any; // Cesium.Cartesian3
  cartographic: any;
  elevation: number;
  timestamp: Date;
}

export interface Track {
  id: string;
  name: string;
  points: TrackPoint[];
  /** White outline polyline — renders below the core for the "printed on map" look */
  casing?: any;
  /** Solid colored polyline — renders on top of the casing */
  core?: any;
  /** Optional slope-gradient overlay (one entity per segment) — added when the Steepness layer is toggled on */
  slopeOverlay?: any[];
  metadata: {
    distance: number; // km
    elevationGain: number; // m
    elevationLoss: number; // m
    difficulty?: string;
    activityType: string;
    created: Date;
  };
}

/** JSON-serialisable version of a track — safe to store in form state / backend */
export interface SerializableTrack {
  id: string;
  name: string;
  waypoints: Array<{ coordinates: LatLng; elevation: number }>;
  metadata: {
    distance: number;
    elevationGain: number;
    elevationLoss: number;
    difficulty?: string;
    activityType: string;
    created: string; // ISO string
  };
}

/** Live drawing stats emitted after every point add / undo */
export interface DrawingStats {
  pointCount: number;
  distance: number; // km
  elevationGain: number; // m
  elevationLoss: number; // m
  /** Naismith estimate in hours: distance/4 + gain/600 */
  estimatedTime: number;
  /** Cumulative distance + elevation for the elevation profile chart */
  profile: Array<{ dist: number; ele: number }>;
  /** Whether redo is available (points were undone and no new point added since) */
  canRedo: boolean;
  /** Whether a finished route is currently being edited (drag-to-reroute) */
  editing: boolean;
}

export default class TrackDrawer extends CesiumManager {
  private tracks: Track[] = [];
  private drawing = false;
  private currentPoints: TrackPoint[] = [];
  private previewEntity: any = null;
  private onCreated?: (track: SerializableTrack) => void;
  private onDrawingUpdate?: (stats: DrawingStats | null) => void;
  private snapService: TrailSnapService;
  /** Snap result from the previous click — used to interpolate trail geometry */
  private lastSnap: SnapResult | null = null;
  /** Points removed by undo — available for redo until a new point is added */
  private redoStack: TrackPoint[] = [];

  // Cached real terrain provider used to sample TRUE elevations, independent of
  // whatever terrain is currently displayed (2D mode uses a flat ellipsoid, so
  // picked heights there are 0). Lazily created; stays null if unavailable
  // (e.g. no Ion token) and elevations then fall back to the picked height.
  private samplingTerrain: any = null;
  private samplingTerrainTried = false;

  // Steepness overlay: per-segment slope-coloured polylines, rendered on top
  // of the normal casing+core when the user toggles the "Steepness" layer.
  private slopeOverlayEnabled = false;

  // Zoom-responsive width: widths change in tiers with camera altitude so the
  // line reads as a "crayon on paper" at country zoom and a precise GPS track
  // at street zoom. Listener attached in setup(), detached in destroy().
  private widthTier: 'near' | 'mid' | 'far' | null = null;
  private zoomListener: (() => void) | null = null;

  // ── Edit mode (drag-to-reroute) ───────────────────────────────────────────
  private editingTrack: Track | null = null;
  private editPoints: TrackPoint[] = [];
  private editHandles: any[] = [];       // Cesium entities for control-point handles
  private editMidHandles: any[] = [];    // Cesium entities for midpoint handles
  private editPolyline: any = null;      // The live-updating polyline entity
  private editHandler: any = null;       // Separate ScreenSpaceEventHandler for drag
  private draggingIndex = -1;            // Index into editPoints being dragged (-1 = none)
  private draggingIsMid = false;         // True if the dragged handle is a midpoint insert

  // ── Settlement (finish/edit-commit wait for true heights) ─────────────────
  /** Hard bound on the whole-route elevation pass at finish — a dead/slow
   *  terrain service must never hang the wizard. */
  private readonly settleTimeoutMs: number;
  /** Bumped by clearAll()/destroy(); a settlement that awakes into a different
   *  epoch abandons its commit instead of resurrecting cleared state. */
  private settleEpoch = 0;
  /** Settlements in flight — edit mode is blocked while > 0 so an edit can't
   *  grab a track whose points/metadata are still being committed. */
  private pendingSettles = 0;

  constructor(
    viewer: any,
    onCreated?: (track: SerializableTrack) => void,
    onDrawingUpdate?: (stats: DrawingStats | null) => void,
    apiBase = '',
    settleTimeoutMs = 8000,
  ) {
    super(viewer);
    this.onCreated = onCreated;
    this.onDrawingUpdate = onDrawingUpdate;
    this.snapService = new TrailSnapService(apiBase);
    this.settleTimeoutMs = settleTimeoutMs;
  }

  protected setup(handler: any) {
    const Cesium = window.Cesium;

    handler.setInputAction((event: any) => {
      if (!this.drawing) return;
      const pos = this.pickPosition(event.position);
      if (pos) this.addPoint(pos); // addPoint is async but fire-and-forget is fine here
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(() => {
      if (this.drawing) this.finishDrawing();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Zoom-responsive width: recompute widths after every camera idle
    this.widthTier = this.tierForHeight(this.viewer.camera.positionCartographic?.height);
    this.zoomListener = () => this.refreshWidthTier();
    this.viewer.camera.moveEnd.addEventListener(this.zoomListener);
  }

  destroy() {
    this.settleEpoch++; // strand in-flight settlements — no emits into an unmounted component
    if (this.zoomListener) {
      try {
        this.viewer.camera.moveEnd.removeEventListener(this.zoomListener);
      } catch {
        // Viewer already torn down
      }
      this.zoomListener = null;
    }
    super.destroy();
  }

  private tierForHeight(height?: number): 'near' | 'mid' | 'far' {
    if (!height || !Number.isFinite(height)) return 'mid';
    if (height < 2000) return 'near';
    if (height > 15000) return 'far';
    return 'mid';
  }

  /** Width pair (casing, core) for the current altitude tier */
  private widthsForTier(tier: 'near' | 'mid' | 'far' = this.widthTier ?? 'mid'): { casing: number; core: number } {
    if (tier === 'near') return { casing: 10, core: 7 };
    if (tier === 'far') return { casing: 5, core: 3 };
    return { casing: 8, core: 5 };
  }

  private refreshWidthTier() {
    const next = this.tierForHeight(this.viewer.camera.positionCartographic?.height);
    if (next === this.widthTier) return;
    this.widthTier = next;
    const { casing: cw, core: xw } = this.widthsForTier(next);
    for (const track of this.tracks) {
      if (track.casing?.polyline) track.casing.polyline.width = cw;
      if (track.core?.polyline) track.core.polyline.width = xw;
    }
    // Edit polyline mirrors the core width (+1 for grabbability)
    if (this.editPolyline?.polyline) this.editPolyline.polyline.width = xw + 1;
  }

  setMode(enabled: boolean) {
    if (enabled && !this.drawing) {
      this.drawing = true;
      this.currentPoints = [];
      this.redoStack = [];
      this.previewEntity = null;
      this.lastSnap = null;
      this.setCursor('crosshair');
    } else if (!enabled && this.drawing) {
      this.cancelDrawing();
    }
  }

  /** Remove the last placed point during active drawing — pushes to redo stack */
  undoLastPoint() {
    if (!this.drawing || this.currentPoints.length === 0) return;
    const removed = this.currentPoints.pop()!;
    this.redoStack.push(removed);
    this.updatePreview();
    this.emitDrawingStats();
  }

  /** Re-add the last undone point */
  redoLastPoint() {
    if (!this.drawing || this.redoStack.length === 0) return;
    const restored = this.redoStack.pop()!;
    this.currentPoints.push(restored);
    this.updatePreview();
    this.emitDrawingStats();
  }

  private async addPoint(position: any) {
    const Cesium = window.Cesium;
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const clickedLat = Cesium.Math.toDegrees(cartographic.latitude);
    const clickedLng = Cesium.Math.toDegrees(cartographic.longitude);

    // New point invalidates the redo stack
    this.redoStack = [];

    // Remember where the new points start so we can backfill their true heights.
    const startLen = this.currentPoints.length;

    // Try to snap the click to a nearby DOC trail
    const snapResult = await this.snapService.snap([clickedLat, clickedLng]);

    if (snapResult) {
      // If consecutive snaps are on the same trail, walk the polyline between them
      // so the route follows real track geometry rather than a straight line
      if (this.lastSnap && this.lastSnap.trailId === snapResult.trailId) {
        const intermediate = this.snapService.interpolate(this.lastSnap, snapResult);
        for (const [iLat, iLng] of intermediate) {
          const iPos = Cesium.Cartesian3.fromDegrees(iLng, iLat, 0);
          const iCarto = Cesium.Cartographic.fromCartesian(iPos);
          this.currentPoints.push({
            position: iPos,
            cartographic: iCarto,
            elevation: iCarto.height,
            timestamp: new Date(),
          });
        }
      }

      // Add the snapped endpoint
      const [sLat, sLng] = snapResult.snappedLatLng;
      const snappedPos = Cesium.Cartesian3.fromDegrees(sLng, sLat, 0);
      const snappedCarto = Cesium.Cartographic.fromCartesian(snappedPos);
      this.currentPoints.push({
        position: snappedPos,
        cartographic: snappedCarto,
        elevation: snappedCarto.height,
        timestamp: new Date(),
      });
      this.lastSnap = snapResult;
    } else {
      // No snap — add the raw clicked position
      this.currentPoints.push({
        position,
        cartographic,
        elevation: cartographic.height,
        timestamp: new Date(),
      });
      this.lastSnap = null; // broke the snap chain
    }

    this.updatePreview();
    this.emitDrawingStats();

    // Backfill true terrain elevation for the points just added, then refresh the
    // stats/profile. Done after the initial emit so the point appears instantly
    // and the elevation corrects a moment later (sampling is a network call).
    const added = this.currentPoints.slice(startLen);
    if (added.length) {
      await this.enrichElevation(added);
      this.emitDrawingStats();
    }
  }

  /** Lazily resolve a real terrain provider for height sampling (Cesium World Terrain). */
  private async getSamplingTerrain(): Promise<any | null> {
    if (this.samplingTerrainTried) return this.samplingTerrain;
    this.samplingTerrainTried = true;
    try {
      this.samplingTerrain = await window.Cesium.CesiumTerrainProvider.fromIonAssetId(1);
    } catch {
      this.samplingTerrain = null; // no Ion token / offline — fall back to picked heights
    }
    return this.samplingTerrain;
  }

  /**
   * Replace each point's elevation with the true terrain height at its lng/lat,
   * sampled from real terrain regardless of the displayed scene mode. Mutates the
   * points in place; silently no-ops if terrain is unavailable. The rendered line
   * is clamped-to-ground so this only affects stored elevation + distance, not visuals.
   */
  private async enrichElevation(points: TrackPoint[]): Promise<void> {
    if (!points.length) return;
    const Cesium = window.Cesium;
    const terrain = await this.getSamplingTerrain();
    if (!terrain) return;
    const cartos = points.map(p => Cesium.Cartographic.fromCartesian(p.position));
    try {
      await Cesium.sampleTerrainMostDetailed(terrain, cartos);
    } catch {
      return;
    }
    for (let i = 0; i < points.length; i++) {
      const h = cartos[i].height;
      if (!Number.isFinite(h)) continue;
      const lng = Cesium.Math.toDegrees(cartos[i].longitude);
      const lat = Cesium.Math.toDegrees(cartos[i].latitude);
      points[i].position = Cesium.Cartesian3.fromDegrees(lng, lat, h);
      points[i].cartographic = Cesium.Cartographic.fromCartesian(points[i].position);
      points[i].elevation = h;
    }
  }

  private updatePreview() {
    if (this.previewEntity) this.viewer.entities.remove(this.previewEntity);
    if (this.currentPoints.length < 2) {
      this.previewEntity = null;
      return;
    }

    const Cesium = window.Cesium;
    const positions = this.currentPoints.map(p => p.position);
    // Preview = lightweight orange glow. Intentionally lighter than the finished
    // casing+core — committing a route should read as a visual upgrade, not a downgrade.
    this.previewEntity = this.viewer.entities.add({
      polyline: {
        positions,
        width: 6,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.15,
          taperPower: 1.0,
          color: Cesium.Color.ORANGE,
        }),
        clampToGround: true,
      },
    });
  }

  private finishDrawing() {
    if (this.currentPoints.length < 2) {
      this.cancelDrawing();
      return;
    }

    // Reset interaction state immediately — drawing must FEEL finished on the
    // double-click. The preview polyline stays visible until the settled track
    // replaces it, so there's no flicker gap while heights resolve.
    const points = this.currentPoints;
    const preview = this.previewEntity;
    this.drawing = false;
    this.currentPoints = [];
    this.previewEntity = null;
    this.redoStack = [];
    this.lastSnap = null;
    this.setCursor('');
    this.onDrawingUpdate?.(null); // clear live stats

    void this.settleAndCommit(points, preview);
  }

  /**
   * The settlement point for a finished drawing: wait for every point's true
   * terrain height (per-click enrichment may still be in flight — the last
   * click virtually always is, since it immediately precedes the finishing
   * double-click), THEN compute metadata, render, and emit the serialized
   * route exactly once. The route the wizard persists is never built from
   * provisional heights. If clearAll()/destroy() ran while we waited, the
   * commit is abandoned — a cleared route must not resurrect.
   */
  private async settleAndCommit(points: TrackPoint[], preview: any) {
    const epoch = this.settleEpoch;
    this.pendingSettles++;
    try {
      await this.settleHeights(points);
      if (epoch !== this.settleEpoch) {
        try { if (preview) this.viewer.entities.remove(preview); } catch { /* viewer torn down */ }
        return;
      }
      const track = this.buildTrack(points);
      this.tracks.push(track);
      if (preview) this.viewer.entities.remove(preview);
      this.renderTrack(track);
      this.onCreated?.(this.serializeTrack(track));
    } finally {
      this.pendingSettles--;
    }
  }

  /**
   * Whole-route elevation pass with a hard time bound: a dead/slow terrain
   * service must never hang the wizard — after the timeout we proceed with
   * whatever heights the points already carry (picked, or partially enriched).
   * Straggling samples that land later mutate only the orphaned working
   * points — committed tracks hold per-point snapshots (see buildTrack /
   * settleEdit), so an emitted route can never silently diverge.
   */
  private async settleHeights(points: TrackPoint[]): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(resolve, this.settleTimeoutMs);
    });
    try {
      await Promise.race([this.enrichElevation(points), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private cancelDrawing() {
    if (this.previewEntity) {
      this.viewer.entities.remove(this.previewEntity);
      this.previewEntity = null;
    }
    this.drawing = false;
    this.currentPoints = [];
    this.redoStack = [];
    this.lastSnap = null;
    this.setCursor('');
    this.onDrawingUpdate?.(null);
  }

  private buildTrack(points: TrackPoint[]): Track {
    let distance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;

    for (let i = 1; i < points.length; i++) {
      distance += window.Cesium.Cartesian3.distance(
        points[i - 1].position,
        points[i].position,
      );
      const delta = points[i].elevation - points[i - 1].elevation;
      if (delta > 0) elevationGain += delta;
      else elevationLoss += Math.abs(delta);
    }

    distance /= 1000; // convert to km
    const difficulty = this.estimateDifficulty(distance, elevationGain);

    return {
      id: this.generateId('track'),
      name: `Route ${this.tracks.length + 1}`,
      // Per-point snapshots: straggling elevation samples (timeout path, late
      // per-click enrichment) mutate the working points, not the committed track.
      points: points.map(p => ({ ...p })),
      metadata: {
        distance,
        elevationGain,
        elevationLoss,
        difficulty,
        activityType: 'hiking',
        created: new Date(),
      },
    };
  }

  private estimateDifficulty(distanceKm: number, elevationGainM: number): string {
    const score = distanceKm * 0.5 + (elevationGainM / 100) * 0.3;
    if (score < 2) return 'easy';
    if (score < 5) return 'moderate';
    if (score < 8) return 'difficult';
    return 'expert';
  }

  /** Map slope percentage to a CSS color for gradient route lines */
  private static slopeColor(slopePct: number): string {
    const abs = Math.abs(slopePct);
    if (abs < 5) return '#22c55e';   // green — easy
    if (abs < 10) return '#eab308';  // yellow — moderate
    if (abs < 15) return '#f97316';  // orange — steep
    return '#ef4444';                // red — very steep
  }

  /**
   * Render a finished route as casing (wide white) + core (narrower colored).
   * Pattern cribbed from AllTrails / Strava / Komoot — see
   * brain/research/map-routing-competitor-patterns.md.
   * The old per-segment glow render lives on as an opt-in Steepness overlay
   * via `toggleSlopeOverlay()`.
   */
  private renderTrack(track: Track): void {
    const Cesium = window.Cesium;
    const pts = track.points;
    if (pts.length < 2) return;

    const positions = pts.map(p => p.position);
    const desc = `<div><h4>${track.name}</h4><p>${track.metadata.distance.toFixed(2)} km · +${track.metadata.elevationGain.toFixed(0)}m / -${track.metadata.elevationLoss.toFixed(0)}m · ${track.metadata.difficulty}</p></div>`;
    const { casing: cw, core: xw } = this.widthsForTier();

    // CASING: add first so it renders below the core.
    track.casing = this.viewer.entities.add({
      polyline: {
        positions,
        width: cw,
        material: Cesium.Color.WHITE.withAlpha(0.9),
        clampToGround: true,
      },
    });

    // CORE: solid colored line on top. Dimmed when the Steepness overlay is active
    // so the per-segment colors dominate.
    track.core = this.viewer.entities.add({
      polyline: {
        positions,
        width: xw,
        material: this.coreMaterial(),
        clampToGround: true,
      },
      description: desc,
    });

    if (this.slopeOverlayEnabled) this.addSlopeOverlay(track);
    this.requestRender(); // paint loaded/finished routes under requestRenderMode
  }

  /** Dodgerblue core — full opacity normally, dimmed when slope overlay is active. */
  private coreMaterial(): any {
    const Cesium = window.Cesium;
    const alpha = this.slopeOverlayEnabled ? 0.3 : 1.0;
    return Cesium.Color.fromCssColorString('#2563eb').withAlpha(alpha);
  }

  /** Build per-segment colored polylines for the Steepness overlay on a track. */
  private addSlopeOverlay(track: Track) {
    if (track.slopeOverlay || track.points.length < 2) return;
    const Cesium = window.Cesium;
    const pts = track.points;
    const segments: any[] = [];

    for (let i = 0; i < pts.length - 1; i++) {
      const dx = Cesium.Cartesian3.distance(pts[i].position, pts[i + 1].position) / 1000;
      const dEle = pts[i + 1].elevation - pts[i].elevation;
      const slope = dx > 0 ? (dEle / (dx * 1000)) * 100 : 0;
      const color = Cesium.Color.fromCssColorString(TrackDrawer.slopeColor(slope));

      segments.push(this.viewer.entities.add({
        polyline: {
          positions: [pts[i].position, pts[i + 1].position],
          width: 6,
          material: color,
          clampToGround: true,
        },
      }));
    }

    track.slopeOverlay = segments;
  }

  private removeSlopeOverlay(track: Track) {
    if (!track.slopeOverlay) return;
    for (const seg of track.slopeOverlay) this.viewer.entities.remove(seg);
    track.slopeOverlay = undefined;
  }

  /** Public toggle — add/remove slope overlay on every track, dim/restore the core. */
  toggleSlopeOverlay(): boolean {
    this.slopeOverlayEnabled = !this.slopeOverlayEnabled;
    for (const track of this.tracks) {
      if (this.slopeOverlayEnabled) this.addSlopeOverlay(track);
      else this.removeSlopeOverlay(track);
      if (track.core) track.core.polyline.material = this.coreMaterial();
    }
    this.requestRender();
    return this.slopeOverlayEnabled;
  }

  /** For restoring persisted toggle state on mount. Does NOT flip — just sets to given value. */
  setSlopeOverlayEnabled(enabled: boolean) {
    if (this.slopeOverlayEnabled === enabled) return;
    this.toggleSlopeOverlay();
  }

  isSlopeOverlayEnabled(): boolean {
    return this.slopeOverlayEnabled;
  }

  /** Remove casing + core (and slope overlay, if present) for a track */
  private removeTrackEntities(track: Track) {
    if (track.casing) {
      this.viewer.entities.remove(track.casing);
      track.casing = undefined;
    }
    if (track.core) {
      this.viewer.entities.remove(track.core);
      track.core = undefined;
    }
    if (track.slopeOverlay) {
      for (const seg of track.slopeOverlay) this.viewer.entities.remove(seg);
      track.slopeOverlay = undefined;
    }
  }

  /** Convert a raw Track to a JSON-serialisable form (no Cesium objects) */
  private serializeTrack(track: Track): SerializableTrack {
    return {
      id: track.id,
      name: track.name,
      waypoints: track.points.map(p => ({
        coordinates: [
          window.Cesium.Math.toDegrees(p.cartographic.latitude),
          window.Cesium.Math.toDegrees(p.cartographic.longitude),
        ] as LatLng,
        elevation: p.elevation,
      })),
      metadata: {
        ...track.metadata,
        created: track.metadata.created.toISOString(),
      },
    };
  }

  /** Emit current drawing progress stats to the React component */
  private emitDrawingStats() {
    if (!this.onDrawingUpdate) return;
    if (this.currentPoints.length === 0) {
      this.onDrawingUpdate(null);
      return;
    }

    let distance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    const profile: Array<{ dist: number; ele: number }> = [];

    profile.push({ dist: 0, ele: this.currentPoints[0].elevation });

    for (let i = 1; i < this.currentPoints.length; i++) {
      const d =
        window.Cesium.Cartesian3.distance(
          this.currentPoints[i - 1].position,
          this.currentPoints[i].position,
        ) / 1000;
      distance += d;
      profile.push({ dist: distance, ele: this.currentPoints[i].elevation });
      const delta = this.currentPoints[i].elevation - this.currentPoints[i - 1].elevation;
      if (delta > 0) elevationGain += delta;
      else elevationLoss += Math.abs(delta);
    }

    this.onDrawingUpdate({
      pointCount: this.currentPoints.length,
      distance,
      elevationGain,
      elevationLoss,
      estimatedTime: distance / 4 + elevationGain / 600,
      profile,
      canRedo: this.redoStack.length > 0,
      editing: false,
    });
  }

  /** Return the Cartesian3 position of a specific point in the current drawing (for chart↔map sync) */
  getDrawingPointPosition(index: number): any | null {
    if (index < 0 || index >= this.currentPoints.length) return null;
    return this.currentPoints[index].position;
  }

  /** Number of points currently drawn (for bounds checking in chart hover) */
  getDrawingPointCount(): number {
    return this.currentPoints.length;
  }

  getTracks(): Track[] {
    return [...this.tracks];
  }

  /** Positions of the latest finished track as [lng, lat, height] — for flyover */
  getLatestTrackPositions(): Array<[number, number, number]> | null {
    const track = this.tracks[this.tracks.length - 1];
    if (!track || track.points.length < 2) return null;
    const Cesium = window.Cesium;
    return track.points.map(p => {
      const lng = Cesium.Math.toDegrees(p.cartographic.longitude);
      const lat = Cesium.Math.toDegrees(p.cartographic.latitude);
      return [lng, lat, p.elevation] as [number, number, number];
    });
  }

  /** Load routes from stored data — waypoint coordinates are [lat, lng] */
  loadRoutes(
    routes: Array<{
      id?: string;
      name?: string;
      waypoints?: Array<{ coordinates: LatLng; elevation?: number }>;
      distance?: number;
      elevationGain?: number;
      elevationLoss?: number;
      difficulty?: string;
      activityType?: string;
    }>,
  ) {
    for (const route of routes) {
      if (!route.waypoints?.length) continue;

      const points: TrackPoint[] = route.waypoints.map(wp => {
        const [lat, lng] = wp.coordinates;
        const position = window.Cesium.Cartesian3.fromDegrees(lng, lat, wp.elevation ?? 0);
        return {
          position,
          cartographic: window.Cesium.Cartographic.fromCartesian(position),
          elevation: wp.elevation ?? 0,
          timestamp: new Date(),
        };
      });

      const track: Track = {
        id: route.id || this.generateId('track'),
        name: route.name || `Imported Route ${this.tracks.length + 1}`,
        points,
        metadata: {
          distance: route.distance ?? 0,
          elevationGain: route.elevationGain ?? 0,
          elevationLoss: route.elevationLoss ?? 0,
          difficulty: route.difficulty,
          activityType: route.activityType ?? 'hiking',
          created: new Date(),
        },
      };

      this.tracks.push(track);
      this.renderTrack(track);
    }
  }

  exportGPX(id: string): string {
    const track = this.tracks.find(t => t.id === id);
    if (!track) return '';

    const pts = track.points
      .map(p => {
        const lat = window.Cesium.Math.toDegrees(p.cartographic.latitude);
        const lng = window.Cesium.Math.toDegrees(p.cartographic.longitude);
        return `    <trkpt lat="${lat}" lon="${lng}"><ele>${p.elevation}</ele><time>${p.timestamp.toISOString()}</time></trkpt>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Upto">\n  <trk><name>${track.name}</name><trkseg>\n${pts}\n  </trkseg></trk>\n</gpx>`;
  }

  clearAll() {
    this.abortEditMode(); // discard, don't commit — the tracks are going away
    this.settleEpoch++; // strand any in-flight settlement: cleared routes must not resurrect
    for (const track of this.tracks) {
      this.removeTrackEntities(track);
    }
    this.tracks = [];
  }

  // ── Edit mode (drag-to-reroute) ───────────────────────────────────────────

  /** Enter edit mode on the most recently finished track */
  enterEditMode(): boolean {
    if (this.editingTrack) return false; // already editing
    if (this.pendingSettles > 0) return false; // a finish/edit is still committing
    const track = this.tracks[this.tracks.length - 1];
    if (!track) return false;

    this.editingTrack = track;
    this.editPoints = track.points.map(p => ({ ...p }));

    // Hide the finished casing+core (and slope overlay) — we'll show a live polyline instead
    this.removeTrackEntities(track);

    this.renderEditOverlay();
    this.setupEditDragHandler();
    this.setCursor('grab');
    this.emitEditStats();
    return true;
  }

  /** Commit edits and leave edit mode */
  exitEditMode() {
    if (!this.editingTrack) return;

    // Clean up edit overlay; interaction ends immediately
    this.clearEditOverlay();
    this.destroyEditDragHandler();

    const track = this.editingTrack;
    const points = [...this.editPoints];
    this.editingTrack = null;
    this.editPoints = [];
    this.setCursor('');
    this.onDrawingUpdate?.(null);

    void this.settleEdit(track, points);
  }

  /**
   * Same settlement contract as finishing a drawing: the re-emitted route
   * (same id — the wizard replaces, not appends) carries settled heights and
   * metadata recomputed from them. Abandons the commit if clearAll()/destroy()
   * ran while heights were settling.
   */
  private async settleEdit(track: Track, points: TrackPoint[]) {
    const epoch = this.settleEpoch;
    this.pendingSettles++;
    try {
      await this.settleHeights(points);
      if (epoch !== this.settleEpoch) return;

      // Per-point snapshots — same reasoning as buildTrack
      track.points = points.map(p => ({ ...p }));
      this.recomputeTrackMetadata(track);
      this.renderTrack(track);
      this.onCreated?.(this.serializeTrack(track));
    } finally {
      this.pendingSettles--;
    }
  }

  /**
   * Tear down edit mode WITHOUT committing — for clearAll(), where emitting a
   * settled route for a track the user just deleted would resurrect it.
   */
  private abortEditMode() {
    if (!this.editingTrack) return;
    this.clearEditOverlay();
    this.destroyEditDragHandler();
    this.editingTrack = null;
    this.editPoints = [];
    this.setCursor('');
    this.onDrawingUpdate?.(null);
  }

  /** Is edit mode currently active? */
  isEditing(): boolean {
    return this.editingTrack !== null;
  }

  private recomputeTrackMetadata(track: Track) {
    let distance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;

    for (let i = 1; i < track.points.length; i++) {
      distance += window.Cesium.Cartesian3.distance(
        track.points[i - 1].position,
        track.points[i].position,
      );
      const delta = track.points[i].elevation - track.points[i - 1].elevation;
      if (delta > 0) elevationGain += delta;
      else elevationLoss += Math.abs(delta);
    }

    track.metadata.distance = distance / 1000;
    track.metadata.elevationGain = elevationGain;
    track.metadata.elevationLoss = elevationLoss;
    track.metadata.difficulty = this.estimateDifficulty(track.metadata.distance, elevationGain);
  }

  /** Draw the live polyline + control handles + midpoint handles */
  private renderEditOverlay() {
    const Cesium = window.Cesium;

    // Live polyline using CallbackProperty for real-time drag updates.
    // Same lightweight glow as the drawing preview — feels like "in flux".
    this.editPolyline = this.viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => this.editPoints.map(p => p.position), false),
        width: 6,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.15,
          taperPower: 1.0,
          color: Cesium.Color.ORANGE,
        }),
        clampToGround: true,
      },
    });

    this.renderEditHandles();
  }

  /** Render/re-render control point and midpoint handle entities */
  private renderEditHandles() {
    const Cesium = window.Cesium;

    // Clear old handles
    for (const h of this.editHandles) this.viewer.entities.remove(h);
    for (const h of this.editMidHandles) this.viewer.entities.remove(h);
    this.editHandles = [];
    this.editMidHandles = [];

    // Control point handles (white circles)
    for (let i = 0; i < this.editPoints.length; i++) {
      const entity = this.viewer.entities.add({
        position: new Cesium.CallbackProperty(() => this.editPoints[i]?.position, false),
        point: {
          pixelSize: 10,
          color: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.DODGERBLUE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        _editIndex: i,
        _editType: 'control',
      });
      this.editHandles.push(entity);
    }

    // Midpoint handles (smaller, translucent) — between each pair
    for (let i = 0; i < this.editPoints.length - 1; i++) {
      const entity = this.viewer.entities.add({
        position: new Cesium.CallbackProperty(() => {
          const a = this.editPoints[i]?.position;
          const b = this.editPoints[i + 1]?.position;
          if (!a || !b) return a;
          return Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3());
        }, false),
        point: {
          pixelSize: 7,
          color: Cesium.Color.DODGERBLUE.withAlpha(0.5),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.7),
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        _editIndex: i,
        _editType: 'midpoint',
      });
      this.editMidHandles.push(entity);
    }
  }

  private clearEditOverlay() {
    for (const h of this.editHandles) this.viewer.entities.remove(h);
    for (const h of this.editMidHandles) this.viewer.entities.remove(h);
    if (this.editPolyline) this.viewer.entities.remove(this.editPolyline);
    this.editHandles = [];
    this.editMidHandles = [];
    this.editPolyline = null;
  }

  /** Set up LEFT_DOWN / MOUSE_MOVE / LEFT_UP for handle dragging */
  private setupEditDragHandler() {
    const Cesium = window.Cesium;
    this.editHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    // Disable default camera drag while we're over a handle
    const cameraController = this.viewer.scene.screenSpaceCameraController;

    this.editHandler.setInputAction((event: any) => {
      const picked = this.viewer.scene.pick(event.position);
      if (!picked?.id?._editType) return;

      this.draggingIndex = picked.id._editIndex;
      this.draggingIsMid = picked.id._editType === 'midpoint';

      // If midpoint drag, insert a new control point at the midpoint position
      if (this.draggingIsMid) {
        const a = this.editPoints[this.draggingIndex];
        const b = this.editPoints[this.draggingIndex + 1];
        const midPos = Cesium.Cartesian3.midpoint(a.position, b.position, new Cesium.Cartesian3());
        const midCarto = Cesium.Cartographic.fromCartesian(midPos);
        const newPoint: TrackPoint = {
          position: midPos,
          cartographic: midCarto,
          elevation: midCarto.height,
          timestamp: new Date(),
        };
        // Insert after draggingIndex
        this.editPoints.splice(this.draggingIndex + 1, 0, newPoint);
        this.draggingIndex = this.draggingIndex + 1;
        this.draggingIsMid = false;
        // Re-render handles since count changed
        this.renderEditHandles();
      }

      cameraController.enableRotate = false;
      cameraController.enableTranslate = false;
      cameraController.enableZoom = false;
      this.setCursor('grabbing');
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    this.editHandler.setInputAction((event: any) => {
      if (this.draggingIndex < 0) return;
      const pos = this.pickPosition(event.endPosition);
      if (!pos) return;

      const carto = Cesium.Cartographic.fromCartesian(pos);
      this.editPoints[this.draggingIndex] = {
        position: pos,
        cartographic: carto,
        elevation: carto.height,
        timestamp: new Date(),
      };
      this.emitEditStats();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    this.editHandler.setInputAction(async () => {
      if (this.draggingIndex < 0) return;

      const dragIdx = this.draggingIndex;
      this.draggingIndex = -1;

      cameraController.enableRotate = true;
      cameraController.enableTranslate = true;
      cameraController.enableZoom = true;
      this.setCursor('grab');

      // Try to snap the dropped point to a trail
      const pt = this.editPoints[dragIdx];
      const lat = Cesium.Math.toDegrees(pt.cartographic.latitude);
      const lng = Cesium.Math.toDegrees(pt.cartographic.longitude);
      const snapResult = await this.snapService.snap([lat, lng]);

      // Edit mode may have been committed/aborted while we awaited the snap —
      // the settlement pass owns the points now, nothing left to update here.
      if (!this.editingTrack) return;

      if (snapResult) {
        const [sLat, sLng] = snapResult.snappedLatLng;
        const snappedPos = Cesium.Cartesian3.fromDegrees(sLng, sLat, 0);
        const snappedCarto = Cesium.Cartographic.fromCartesian(snappedPos);
        this.editPoints[dragIdx] = {
          position: snappedPos,
          cartographic: snappedCarto,
          elevation: snappedCarto.height,
          timestamp: new Date(),
        };
      }

      // Backfill the dragged point's true elevation before recomputing stats.
      await this.enrichElevation([this.editPoints[dragIdx]]);

      // Re-render handles (positions may have shifted after snap)
      this.renderEditHandles();
      this.emitEditStats();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
  }

  private destroyEditDragHandler() {
    if (this.editHandler) {
      this.editHandler.destroy();
      this.editHandler = null;
    }
    this.draggingIndex = -1;
    // Ensure camera controls are re-enabled
    try {
      const cc = this.viewer.scene.screenSpaceCameraController;
      cc.enableRotate = true;
      cc.enableTranslate = true;
      cc.enableZoom = true;
    } catch { /* viewer may be destroyed */ }
  }

  /** Emit stats from the edit-mode points */
  private emitEditStats() {
    if (!this.onDrawingUpdate || this.editPoints.length === 0) return;

    let distance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    const profile: Array<{ dist: number; ele: number }> = [];

    profile.push({ dist: 0, ele: this.editPoints[0].elevation });

    for (let i = 1; i < this.editPoints.length; i++) {
      const d = window.Cesium.Cartesian3.distance(
        this.editPoints[i - 1].position,
        this.editPoints[i].position,
      ) / 1000;
      distance += d;
      profile.push({ dist: distance, ele: this.editPoints[i].elevation });
      const delta = this.editPoints[i].elevation - this.editPoints[i - 1].elevation;
      if (delta > 0) elevationGain += delta;
      else elevationLoss += Math.abs(delta);
    }

    this.onDrawingUpdate({
      pointCount: this.editPoints.length,
      distance,
      elevationGain,
      elevationLoss,
      estimatedTime: distance / 4 + elevationGain / 600,
      profile,
      canRedo: false,
      editing: true,
    });
  }

  /** Kept for backward compat */
  getRoutes(): Track[] {
    return this.getTracks();
  }
}
