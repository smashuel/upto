/* eslint-disable @typescript-eslint/no-explicit-any */
import { CesiumManager } from './CesiumManager';
import type { LatLng } from '../types/adventure';
import { TrailSnapService, type SnapResult } from './TrailSnapService';
import { beginRouteSettle, endRouteSettle } from './RouteSettlement';

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

/**
 * Where the stats-emitting interaction currently is:
 * - 'drawing'  — points being placed (Undo/Redo live here)
 * - 'editing'  — drag-to-reroute in progress
 * - 'settling' — finish/Done happened, true heights still resolving (bounded
 *   by the settle timeout); interaction is over but the route isn't committed
 * - 'finished' — the settled stats of a committed route, kept as a reference
 */
export type DrawingPhase = 'drawing' | 'editing' | 'settling' | 'finished';

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
  phase: DrawingPhase;
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
  /** Bumped by EVERY path that invalidates the drawing session: finish,
   *  cancel, clearAll AND destroy. A click whose snap lookup or elevation
   *  backfill is still in flight when the session ends belongs to a dead
   *  session — it must not repopulate cleared state, repaint a phantom stats
   *  panel, or touch a destroyed viewer (a double-click fires two LEFT_CLICKs
   *  before LEFT_DOUBLE_CLICK, so this happens on EVERY finish). Re-checked
   *  after every await in the click path. */
  private drawingEpoch = 0;
  /** Points backing the last stats emission — chart hover resolves against
   *  these so the profile and the map can never diverge (e.g. during a settle
   *  window, when the finishing track isn't in `tracks` yet). */
  private statsBackingPoints: TrackPoint[] = [];
  /** Points of the route currently settling (finish/edit-commit awaiting
   *  heights). The settling track isn't in `tracks` yet, so paths that restore
   *  a reference panel (cancel) must use these, not the previous committed
   *  track. Cleared when its settlement completes or is abandoned. */
  private settlingPoints: TrackPoint[] | null = null;

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
    this.drawingEpoch++; // strand in-flight clicks/drags — no touching a destroyed viewer
    if (this.editingTrack) {
      try {
        this.teardownEditMode(); // also destroys the edit drag handler (own ScreenSpaceEventHandler)
      } catch {
        // Viewer already torn down — the epoch bump above still strands stragglers
      }
    }
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
    const epoch = this.drawingEpoch;

    // New point invalidates the redo stack
    this.redoStack = [];

    // Remember where the new points start so we can backfill their true heights.
    const startLen = this.currentPoints.length;

    // Try to snap the click to a nearby DOC trail
    const snapResult = await this.snapService.snap([clickedLat, clickedLng]);

    // The session may have ended (finish/cancel/clear/destroy) while we
    // awaited the snap — this click belongs to that dead session, so drop it.
    if (epoch !== this.drawingEpoch) return;

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
      // Session may have ended during the sample — a straggling enrichment
      // must not emit over (or wipe) whatever replaced this drawing's panel.
      if (epoch !== this.drawingEpoch) return;
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
    this.teardownDrawing();
    // The settle window is a real state the UI must represent (disable Undo,
    // block a re-edit honestly): emit it rather than leaving stale live stats.
    this.emitStats(points, 'settling');

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
    const committed = await this.runSettlement(points, () => {
      const track = this.buildTrack(points);
      this.tracks.push(track);
      if (preview) this.viewer.entities.remove(preview);
      this.renderTrack(track);
      this.onCreated?.(this.serializeTrack(track));
      this.emitSettledStats(track);
    });
    if (!committed) {
      try { if (preview) this.viewer.entities.remove(preview); } catch { /* viewer torn down */ }
    }
  }

  /**
   * Shared settlement protocol for finish and edit-commit: wait (bounded) for
   * true heights, then apply the commit — unless clearAll()/destroy() ran
   * while we waited, in which case the commit is abandoned. Pending state is
   * tracked both per-drawer (blocks enterEditMode) and in the module-level
   * RouteSettlement registry (lets the wizard submit wait a settle out).
   * Returns whether the commit was applied.
   */
  private async runSettlement(points: TrackPoint[], apply: () => void): Promise<boolean> {
    const epoch = this.settleEpoch;
    this.pendingSettles++;
    this.settlingPoints = points;
    beginRouteSettle();
    try {
      await this.settleHeights(points);
      if (epoch !== this.settleEpoch) return false;
      apply();
      return true;
    } finally {
      if (this.settlingPoints === points) this.settlingPoints = null;
      this.pendingSettles--;
      endRouteSettle();
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

  /** End the interactive drawing session without emitting — shared by finish,
   *  cancel and clearAll. Bumping the epoch strands every in-flight click. */
  private teardownDrawing() {
    if (this.previewEntity) {
      this.viewer.entities.remove(this.previewEntity);
      this.previewEntity = null;
    }
    this.drawingEpoch++;
    this.drawing = false;
    this.currentPoints = [];
    this.redoStack = [];
    this.lastSnap = null;
    this.setCursor('');
  }

  private cancelDrawing() {
    this.teardownDrawing();
    // A cancel abandons the drawing in progress, not the committed route — if
    // one exists, its reference panel comes back instead of being wiped. A
    // route still settling isn't in `tracks` yet: restore ITS settling panel
    // (Edit stays honestly disabled), never the previous route's as finished.
    if (this.settlingPoints) {
      this.emitStats(this.settlingPoints, 'settling');
      return;
    }
    const latest = this.tracks[this.tracks.length - 1];
    if (latest) this.emitSettledStats(latest);
    else this.emitStats([], 'drawing'); // emits null
  }

  private buildTrack(points: TrackPoint[]): Track {
    const { distance, elevationGain, elevationLoss } = this.computeStats(points);
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

  /** Distance/elevation/profile figures shared by all three stats emitters */
  private computeStats(points: TrackPoint[]): {
    distance: number;
    elevationGain: number;
    elevationLoss: number;
    profile: Array<{ dist: number; ele: number }>;
  } {
    let distance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    const profile: Array<{ dist: number; ele: number }> = [];

    profile.push({ dist: 0, ele: points[0].elevation });

    for (let i = 1; i < points.length; i++) {
      const d =
        window.Cesium.Cartesian3.distance(points[i - 1].position, points[i].position) / 1000;
      distance += d;
      profile.push({ dist: distance, ele: points[i].elevation });
      const delta = points[i].elevation - points[i - 1].elevation;
      if (delta > 0) elevationGain += delta;
      else elevationLoss += Math.abs(delta);
    }

    return { distance, elevationGain, elevationLoss, profile };
  }

  /**
   * The single stats emitter: computes the figures, records the backing
   * points (chart hover resolves against exactly what the panel shows), and
   * emits — null when there are no points, so an empty emission clears the
   * panel without a companion call on the React side.
   */
  private emitStats(points: TrackPoint[], phase: DrawingPhase, canRedo = false) {
    this.statsBackingPoints = points;
    if (!this.onDrawingUpdate) return;
    if (points.length === 0) {
      this.onDrawingUpdate(null);
      return;
    }

    const stats = this.computeStats(points);
    this.onDrawingUpdate({
      pointCount: points.length,
      ...stats,
      estimatedTime: stats.distance / 4 + stats.elevationGain / 600,
      canRedo,
      phase,
    });
  }

  /** Emit current drawing progress stats to the React component */
  private emitDrawingStats() {
    this.emitStats(this.currentPoints, 'drawing', this.redoStack.length > 0);
  }

  /**
   * Emit the settled stats of a committed route so the panel + elevation
   * profile stay on screen for reference after finish/edit — cleared only by
   * an explicit route clear or the start of a new drawing. If the user has
   * already started a new drawing or edit, that interaction owns the panel:
   * the late settlement commits its route silently instead of clobbering it.
   */
  private emitSettledStats(track: Track) {
    if (this.drawing || this.editingTrack) return;
    if (track.points.length === 0) return;
    this.emitStats(track.points, 'finished');
  }

  /** Return the Cartesian3 position of a specific profile point (for chart↔map sync) */
  getDrawingPointPosition(index: number): any | null {
    const points = this.statsBackingPoints;
    if (index < 0 || index >= points.length) return null;
    return points[index].position;
  }

  /** Number of points behind the current profile (for bounds checking in chart hover) */
  getDrawingPointCount(): number {
    return this.statsBackingPoints.length;
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

    // Restore the reference stats panel for the latest loaded route — the map
    // is lazy-mounted, so this is what keeps the profile visible on remount.
    const latest = this.tracks[this.tracks.length - 1];
    if (latest) this.emitSettledStats(latest);
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
    this.drawingEpoch++; // strand any in-flight click: no phantom panel repaint after Clear
    // Clear wipes any drawing in progress too (points + preview), but keeps
    // the tool mode active so the user can start a fresh route immediately.
    if (this.previewEntity) {
      this.viewer.entities.remove(this.previewEntity);
      this.previewEntity = null;
    }
    this.currentPoints = [];
    this.redoStack = [];
    this.lastSnap = null;
    for (const track of this.tracks) {
      this.removeTrackEntities(track);
    }
    this.tracks = [];
    this.requestRender(); // entity removals must paint under requestRenderMode
    this.emitStats([], 'drawing'); // clears the stats panel (emits null)
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

    const track = this.editingTrack;
    const points = [...this.editPoints];
    this.teardownEditMode(); // interaction ends immediately on Done
    // Leave the editing phase NOW — the edit UI must not stick for the length
    // of the settle window. The settled stats replace this emission.
    this.emitStats(points, 'settling');

    void this.settleEdit(track, points);
  }

  /**
   * Same settlement contract as finishing a drawing: the re-emitted route
   * (same id — the wizard replaces, not appends) carries settled heights and
   * metadata recomputed from them. Abandons the commit if clearAll()/destroy()
   * ran while heights were settling.
   */
  private async settleEdit(track: Track, points: TrackPoint[]) {
    await this.runSettlement(points, () => {
      // Per-point snapshots — same reasoning as buildTrack
      track.points = points.map(p => ({ ...p }));
      this.recomputeTrackMetadata(track);
      this.renderTrack(track);
      this.onCreated?.(this.serializeTrack(track));
      this.emitSettledStats(track);
    });
  }

  /** Shared edit-mode teardown — overlay, drag handler, state, cursor. */
  private teardownEditMode() {
    this.clearEditOverlay();
    this.destroyEditDragHandler();
    this.editingTrack = null;
    this.editPoints = [];
    this.setCursor('');
  }

  /**
   * Tear down edit mode WITHOUT committing — for clearAll(), where emitting a
   * settled route for a track the user just deleted would resurrect it.
   * No emission of its own: clearAll emits the panel-clearing null.
   */
  private abortEditMode() {
    if (!this.editingTrack) return;
    this.teardownEditMode();
  }

  /** Is edit mode currently active? */
  isEditing(): boolean {
    return this.editingTrack !== null;
  }

  private recomputeTrackMetadata(track: Track) {
    const { distance, elevationGain, elevationLoss } = this.computeStats(track.points);
    track.metadata.distance = distance;
    track.metadata.elevationGain = elevationGain;
    track.metadata.elevationLoss = elevationLoss;
    track.metadata.difficulty = this.estimateDifficulty(distance, elevationGain);
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
      const epoch = this.drawingEpoch; // destroy() bumps this even if edit teardown throws
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

      // Edit mode may have been committed/aborted/destroyed while we awaited
      // the snap — the settlement pass owns the points now (or the drawer is
      // gone), nothing left to update here.
      if (!this.editingTrack || epoch !== this.drawingEpoch) return;

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

      // Same re-check after the second await: edit mode may have ended (Done,
      // clearAll, destroy) while the sample was in flight.
      if (!this.editingTrack || epoch !== this.drawingEpoch) return;

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
    if (this.editPoints.length === 0) return;
    this.emitStats(this.editPoints, 'editing');
  }

  /** Kept for backward compat */
  getRoutes(): Track[] {
    return this.getTracks();
  }
}
