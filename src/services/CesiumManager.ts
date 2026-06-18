/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Base class for Cesium map interaction managers.
 *
 * Handles the shared boilerplate for all three managers:
 * - Retry-based initialization waiting for the Cesium viewer to be ready
 * - Own ScreenSpaceEventHandler (one per manager, so they don't overwrite each other)
 * - Cursor style management
 * - Cleanup on destroy
 */
export abstract class CesiumManager {
  protected viewer: any;
  protected handler: any = null;

  private setupRetries = 0;
  private readonly MAX_RETRIES = 50; // 5 seconds at 100ms intervals

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
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }
  }

  protected generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
