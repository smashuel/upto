/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Base class for Cesium map interaction managers.
 *
 * Handles the shared boilerplate for all three managers:
 * - Retry-based initialization waiting for the Cesium viewer to be ready
 * - Own ScreenSpaceEventHandler (one per manager, so they don't overwrite each other)
 * - Cursor style management
 * - Cleanup on destroy
 * - True-terrain elevation sampling (see `enrichElevation`)
 */

/** Minimal shape `enrichElevation` needs — route points and waypoints both satisfy this. */
export interface ElevationPoint {
  position: any; // Cesium.Cartesian3
  cartographic: any; // Cesium.Cartographic
  elevation: number;
  /** True once a real terrain sample has landed for this point. Only ever set
   *  true by `enrichElevation` — a failed/unavailable attempt leaves it as the
   *  caller set it (false for a fresh point), never retroactively clears a
   *  confirmation a previous successful sample already gave it. */
  elevationKnown: boolean;
}

export abstract class CesiumManager {
  protected viewer: any;
  protected handler: any = null;

  private setupRetries = 0;
  private readonly MAX_RETRIES = 50; // 5 seconds at 100ms intervals

  // Cached real terrain provider used to sample TRUE elevations, independent of
  // whatever terrain is currently displayed (2D mode uses a flat ellipsoid, so
  // picked heights there are 0). Lazily created per manager instance; stays null
  // if unavailable (e.g. no Ion token) and elevations then fall back to the
  // picked height.
  private samplingTerrain: any = null;
  private samplingTerrainTried = false;
  /** Fired at most once per instance, the first time terrain-provider
   *  resolution completes, with whether real elevation sampling is possible
   *  this session — drives the map's "elevation unavailable" notice. Set by
   *  subclasses in their own constructors (this base class takes only a
   *  viewer). A per-call sampling failure (tile fetch hiccup) does NOT
   *  re-fire this — it only reflects whether the terrain SOURCE loaded. */
  protected onTerrainAvailability?: (available: boolean) => void;
  /** Set by destroy() — strands any async continuation still in flight (e.g.
   *  a terrain-provider construction that outlives the manager), matching the
   *  epoch/teardown discipline ADR 014 establishes for this class hierarchy.
   *  Protected so subclasses (e.g. WaypointManager's per-object async guards)
   *  can share the same flag instead of keeping their own duplicate. */
  protected destroyed = false;

  constructor(viewer: any) {
    this.viewer = viewer;
    // Small delay so the viewer is fully settled before first readiness check
    setTimeout(() => this.trySetup(), 10);
  }

  private trySetup() {
    this.setupRetries++;

    const ready =
      this.viewer?.cesiumWidget?.screenSpaceEventHandler &&
      this.viewer?.scene &&
      this.viewer?.camera;

    if (!ready) {
      if (this.setupRetries < this.MAX_RETRIES) {
        setTimeout(() => this.trySetup(), 100);
      } else {
        console.error(`${this.constructor.name}: viewer not ready after max retries`);
      }
      return;
    }

    try {
      this.handler = new window.Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
      this.setup(this.handler);
      // initialized
    } catch (err) {
      console.error(`${this.constructor.name}: setup failed`, err);
    }
  }

  /** Subclasses register their input actions here. */
  protected abstract setup(handler: any): void;

  /** Request a single frame. Required when `requestRenderMode` is on and we mutate
   *  the scene outside a camera move (adding/removing/restyling entities) — otherwise
   *  the change won't appear until the next camera movement. */
  protected requestRender() {
    try { this.viewer?.scene?.requestRender(); } catch { /* viewer torn down */ }
  }

  protected setCursor(style: string) {
    try {
      if (this.viewer?.cesiumWidget?.canvas) {
        this.viewer.cesiumWidget.canvas.style.cursor = style;
      }
    } catch {
      // Ignore — viewer may be in teardown
    }
  }

  /** Lazily resolve a real terrain provider for height sampling (Cesium World Terrain). */
  protected async getSamplingTerrain(): Promise<any | null> {
    if (this.samplingTerrainTried) return this.samplingTerrain;
    this.samplingTerrainTried = true;
    try {
      this.samplingTerrain = await window.Cesium.CesiumTerrainProvider.fromIonAssetId(1);
    } catch {
      this.samplingTerrain = null; // no Ion token / offline — fall back to picked heights
    }
    if (!this.destroyed) this.onTerrainAvailability?.(this.samplingTerrain !== null);
    return this.samplingTerrain;
  }

  /**
   * Replace each point's elevation with the true terrain height at its lng/lat,
   * sampled from real terrain regardless of the displayed scene mode. Mutates the
   * points in place; silently no-ops if terrain is unavailable. Shared by
   * TrackDrawer (route points) and WaypointManager (placed waypoints) — the
   * rendered geometry is clamped-to-ground, so this only affects stored
   * elevation + distance, never visuals.
   */
  protected async enrichElevation(points: ElevationPoint[]): Promise<void> {
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
      points[i].elevationKnown = true;
    }
  }

  protected pickPosition(screenPosition: any): any | null {
    const Cesium = window.Cesium;
    const scene = this.viewer?.scene;
    // In 3D, pick the actual rendered terrain surface via the depth buffer so a
    // click lands where the cursor is — not on the sea-level ellipsoid that sits
    // *below* the terrain (which caused drawn routes/notes to appear offset, and
    // gave every point a height of ~0). Falls back to ellipsoid picking in 2D or
    // when the depth pick misses (e.g. clicking sky / unloaded terrain tile).
    try {
      if (
        scene &&
        scene.mode === Cesium.SceneMode.SCENE3D &&
        scene.pickPositionSupported
      ) {
        const cart = scene.pickPosition(screenPosition);
        if (Cesium.defined(cart)) return cart;
      }
    } catch {
      // fall through to ellipsoid pick
    }
    try {
      return this.viewer.camera.pickEllipsoid(
        screenPosition,
        scene?.globe?.ellipsoid
      ) ?? null;
    } catch {
      return null;
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }
  }

  protected generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
