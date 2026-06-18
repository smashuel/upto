/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
/**
 * TrailLayerManager — renders DOC tracks within the current map viewport.
 *
 * UX flow:
 *  1. User toggles the layer on from the map header.
 *  2. As the camera comes to rest, we fetch tracks intersecting the visible
 *     bbox from `/api/trails/bbox` and draw them as faint grey polylines.
 *  3. Clicking a polyline highlights it (blue, thicker) and notifies React via
 *     `onSelectionChange` so the host component can show a "Selected: …" chip.
 *  4. Camera moves keep the layer fresh — entities that fall out of the bbox
 *     are removed (except the currently-selected one, which always sticks
 *     around so the user doesn't lose their selection by panning).
 *
 * Why a separate Cesium manager:
 *  - Each manager has its own ScreenSpaceEventHandler, so click-to-select
 *    here doesn't fight TrackDrawer's click-to-place-route-point.
 *  - Sharing CesiumManager's setup-retry / cleanup boilerplate.
 */

import { CesiumManager } from './CesiumManager';
import { isWithinNZBounds } from './LinzMapService';
import { flyToRouteBounds } from './MapCamera';
import type { LatLng } from '../types/adventure';

interface BboxTrail {
  id: string;
  name: string;
  source: string;
  geometry: LatLng[]; // [[lat, lng], ...]
}

interface LayerEntity {
  /** Core polyline — always present. Default render is a thin solid green line. */
  entity: any;
  /** White casing underneath, only added while the entity is selected. */
  casing: any | null;
  name: string;
  geometry: LatLng[];
}

export interface TrailSelection {
  id: string;
  name: string;
}

/** Skip fetches when the visible span is wider than this in either axis */
const MAX_BBOX_SPAN_DEG = 5;

/** Skip fetches when the camera is higher than this above the ellipsoid */
const MAX_CAMERA_HEIGHT_M = 50_000;

/** Camera-idle debounce — fires `refresh` once the user stops panning */
const REFRESH_DEBOUNCE_MS = 400;

/** In-memory cache so panning back doesn't re-hit the backend */
const BBOX_CACHE_TTL_MS = 60_000;

export default class TrailLayerManager extends CesiumManager {
  private apiBase: string;
  private enabled = false;
  private entities = new Map<string, LayerEntity>();
  private selectedId: string | null = null;
  private opacity = 0.9;
  private bboxCache = new Map<string, { trails: BboxTrail[]; ts: number }>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private cameraMoveListener: (() => void) | null = null;
  private fetchSeq = 0;
  private onSelectionChange?: (sel: TrailSelection | null) => void;
  private onLoadingChange?: (loading: boolean) => void;

  constructor(
    viewer: any,
    onSelectionChange?: (sel: TrailSelection | null) => void,
    apiBase = '',
    onLoadingChange?: (loading: boolean) => void,
  ) {
    super(viewer);
    this.onSelectionChange = onSelectionChange;
    this.apiBase = apiBase;
    this.onLoadingChange = onLoadingChange;
  }

  protected setup(handler: any) {
    const Cesium = window.Cesium;
    handler.setInputAction((event: any) => {
      if (!this.enabled) return;
      const picked = this.viewer.scene.pick(event.position);
      const pickedId = picked?.id?.id; // Cesium Entity has .id (string)
      if (!pickedId) return;
      const hit = this.entities.get(pickedId);
      if (!hit) return;
      this.toggleSelection(pickedId);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.attachCameraListener();
    this.scheduleRefresh(0);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.detachCameraListener();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.clearAll();
  }

  /** Programmatic deselection — called from the React chip × button */
  clearSelection() {
    if (!this.selectedId) return;
    const prev = this.entities.get(this.selectedId);
    if (prev) this.applyStyle(prev, false);
    this.selectedId = null;
    this.onSelectionChange?.(null);
    this.requestRender();
  }

  /**
   * Render a single trail directly, mark it selected, and fly the camera to its bounds.
   * Used when the wizard already knows which DOC track the user wants — no bbox round-trip.
   * The diff loop preserves selected entities, so this trail stays visible across pans.
   */
  preselect(trail: { id: string; name: string; geometry: LatLng[] }) {
    if (!this.enabled || trail.geometry.length === 0) return;

    // Add the entity if we don't already have it
    if (!this.entities.has(trail.id)) {
      const entity = this.renderTrail({
        id: trail.id,
        name: trail.name,
        source: 'doc',
        geometry: trail.geometry,
      });
      this.entities.set(trail.id, {
        entity,
        casing: null,
        name: trail.name,
        geometry: trail.geometry,
      });
    }

    // Clear any previous selection, then mark this one
    if (this.selectedId && this.selectedId !== trail.id) {
      const prev = this.entities.get(this.selectedId);
      if (prev) this.applyStyle(prev, false);
    }
    const layer = this.entities.get(trail.id)!;
    this.applyStyle(layer, true);
    this.selectedId = trail.id;
    this.onSelectionChange?.({ id: trail.id, name: trail.name });
    this.requestRender();

    // Fly the camera to frame the trail tightly — see MapCamera.flyToRouteBounds
    // for the BoundingSphere + HeadingPitchRange rationale (avoids raw Rectangle
    // overshoot on short routes; picks 2D top-down vs 3D hero pitch).
    flyToRouteBounds(this.viewer, trail.geometry, { duration: 1.0 });
  }

  destroy() {
    this.detachCameraListener();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.clearAll();
    super.destroy();
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  private toggleSelection(id: string) {
    // Clicking the already-selected trail clears it
    if (this.selectedId === id) {
      this.clearSelection();
      return;
    }

    // Restyle previously-selected back to default
    if (this.selectedId) {
      const prev = this.entities.get(this.selectedId);
      if (prev) this.applyStyle(prev, false);
    }

    // Style the newly-selected one
    const next = this.entities.get(id);
    if (!next) return;
    this.applyStyle(next, true);
    this.selectedId = id;
    this.onSelectionChange?.({ id, name: next.name });
    this.requestRender();
  }

  // ── Camera listener / debounced refresh ────────────────────────────────────

  private attachCameraListener() {
    if (this.cameraMoveListener) return;
    this.widthTier = this.tierForHeight(this.viewer.camera.positionCartographic?.height);
    this.cameraMoveListener = () => {
      this.refreshWidthTier();
      this.scheduleRefresh(REFRESH_DEBOUNCE_MS);
    };
    this.viewer.camera.moveEnd.addEventListener(this.cameraMoveListener);
  }

  private detachCameraListener() {
    if (!this.cameraMoveListener) return;
    try {
      this.viewer.camera.moveEnd.removeEventListener(this.cameraMoveListener);
    } catch {
      // Viewer may already be torn down
    }
    this.cameraMoveListener = null;
  }

  private scheduleRefresh(delayMs: number) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh().catch(err => console.error('TrailLayer refresh failed:', err));
    }, delayMs);
  }

  // ── Viewport gating + fetch ────────────────────────────────────────────────

  private getViewportBbox(): { w: number; s: number; e: number; n: number } | null {
    const Cesium = window.Cesium;

    // computeViewRectangle returns null in 2D/Columbus View — fall back to
    // picking the four screen corners against the ellipsoid.
    let w: number, s: number, e: number, n: number;

    const rect = this.viewer.camera.computeViewRectangle();
    if (rect) {
      w = Cesium.Math.toDegrees(rect.west);
      s = Cesium.Math.toDegrees(rect.south);
      e = Cesium.Math.toDegrees(rect.east);
      n = Cesium.Math.toDegrees(rect.north);
    } else {
      // Screen-corner fallback for 2D mode
      const canvas = this.viewer.canvas;
      const ellipsoid = this.viewer.scene.globe.ellipsoid;
      const tl = this.viewer.camera.pickEllipsoid(new Cesium.Cartesian2(0, 0), ellipsoid);
      const br = this.viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(canvas.clientWidth, canvas.clientHeight),
        ellipsoid,
      );
      if (!tl || !br) {
        console.log('[TrailLayer] gated: screen-corner pick returned null (zoomed too far out)');
        return null;
      }
      const tlCarto = Cesium.Cartographic.fromCartesian(tl);
      const brCarto = Cesium.Cartographic.fromCartesian(br);
      w = Cesium.Math.toDegrees(tlCarto.longitude);
      n = Cesium.Math.toDegrees(tlCarto.latitude);
      e = Cesium.Math.toDegrees(brCarto.longitude);
      s = Cesium.Math.toDegrees(brCarto.latitude);
    }

    // Handle antimeridian wraparound — NZ straddles 180°, so east can be
    // negative (e.g. w=168, e=-176). Normalise by shifting east into 0-360 range.
    if (e <= w) {
      // Check if this is genuinely NZ spanning the antimeridian vs fully zoomed out
      const span = (e + 360) - w;
      if (span > MAX_BBOX_SPAN_DEG) {
        console.log(`[TrailLayer] gated: bbox too large after antimeridian fix (${(n-s).toFixed(2)}° × ${span.toFixed(2)}°, max ${MAX_BBOX_SPAN_DEG}°)`);
        return null;
      }
      // Clamp east to 180 for the API query — backend data is within NZ (166–178)
      e = 180;
    }
    if (n <= s) {
      console.log(`[TrailLayer] gated: invalid lat range (s=${s.toFixed(2)} n=${n.toFixed(2)})`);
      return null;
    }
    if ((n - s) > MAX_BBOX_SPAN_DEG || (e - w) > MAX_BBOX_SPAN_DEG) {
      console.log(`[TrailLayer] gated: bbox too large (${(n-s).toFixed(2)}° × ${(e-w).toFixed(2)}°, max ${MAX_BBOX_SPAN_DEG}°)`);
      return null;
    }

    // Skip if camera is too high
    const carto = this.viewer.camera.positionCartographic;
    if (carto?.height && carto.height > MAX_CAMERA_HEIGHT_M) {
      console.log(`[TrailLayer] gated: camera too high (${(carto.height/1000).toFixed(1)} km, max ${MAX_CAMERA_HEIGHT_M/1000} km)`);
      return null;
    }

    // Skip if bbox centre is outside NZ — DOC data is NZ-only
    const cLat = (n + s) / 2;
    const cLng = (e + w) / 2;
    if (!isWithinNZBounds(cLat, cLng)) {
      console.log(`[TrailLayer] gated: centre outside NZ (${cLat.toFixed(2)}, ${cLng.toFixed(2)})`);
      return null;
    }

    return { w, s, e, n };
  }

  private async refresh() {
    if (!this.enabled) return;

    const bbox = this.getViewportBbox();
    if (!bbox) {
      console.log('[TrailLayer] refresh skipped — viewport gated (too zoomed out, outside NZ, or camera too high)');
      // Out of viewport / too zoomed out — clear non-selected entities
      this.clearNonSelected();
      return;
    }

    console.log(`[TrailLayer] refresh bbox: w=${bbox.w.toFixed(3)} s=${bbox.s.toFixed(3)} e=${bbox.e.toFixed(3)} n=${bbox.n.toFixed(3)}`);
    this.onLoadingChange?.(true);
    const trails = await this.fetchBbox(bbox);
    this.onLoadingChange?.(false);
    console.log(`[TrailLayer] fetched ${trails.length} trails`);
    this.diff(trails);
  }

  private async fetchBbox(bbox: { w: number; s: number; e: number; n: number }): Promise<BboxTrail[]> {
    const key = this.cacheKey(bbox);
    const cached = this.bboxCache.get(key);
    if (cached && Date.now() - cached.ts < BBOX_CACHE_TTL_MS) return cached.trails;

    const seq = ++this.fetchSeq;
    try {
      const url = `${this.apiBase}/api/trails/bbox?west=${bbox.w}&south=${bbox.s}&east=${bbox.e}&north=${bbox.n}&limit=50`;
      console.log(`[TrailLayer] fetching: ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[TrailLayer] fetch failed: ${res.status} ${res.statusText}`);
        return [];
      }
      const json: { trails: BboxTrail[] } = await res.json();
      // If a newer fetch has started, drop this stale response
      if (seq !== this.fetchSeq) return [];
      const trails = json.trails ?? [];
      this.bboxCache.set(key, { trails, ts: Date.now() });
      return trails;
    } catch (err) {
      console.error('[TrailLayer] fetch error:', err);
      return [];
    }
  }

  private cacheKey(bbox: { w: number; s: number; e: number; n: number }): string {
    // Quantise to ~0.05° (~5 km) so micro-pans hit the cache
    const q = (n: number) => Math.round(n * 20) / 20;
    return `${q(bbox.w)}_${q(bbox.s)}_${q(bbox.e)}_${q(bbox.n)}`;
  }

  // ── Diff / render ──────────────────────────────────────────────────────────

  private diff(trails: BboxTrail[]) {
    const incomingIds = new Set(trails.map(t => t.id));
    let added = 0;
    let removed = 0;

    // Remove entities no longer in viewport — except the selected one
    for (const [id, layer] of this.entities) {
      if (incomingIds.has(id)) continue;
      if (id === this.selectedId) continue;
      this.viewer.entities.remove(layer.entity);
      this.entities.delete(id);
      removed++;
    }

    // Add new entities
    for (const trail of trails) {
      if (this.entities.has(trail.id)) continue;
      const entity = this.renderTrail(trail);
      this.entities.set(trail.id, {
        entity,
        casing: null,
        name: trail.name,
        geometry: trail.geometry,
      });
      added++;
    }

    console.log(`[TrailLayer] diff: +${added} -${removed}, total entities: ${this.entities.size}`);
    if (added || removed) this.requestRender();
  }

  private renderTrail(trail: BboxTrail): any {
    const Cesium = window.Cesium;
    const positions = trail.geometry.flatMap(([lat, lng]) => [lng, lat]);
    const { unselected } = this.widthsForTier();
    return this.viewer.entities.add({
      id: trail.id,
      name: trail.name,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
        width: unselected,
        material: this.defaultMaterial(),
        clampToGround: true,
      },
      description: `<div><h4>${trail.name}</h4><p>DOC track</p></div>`,
    });
  }

  /**
   * Style a layer entry as selected or unselected. Selected state promotes the
   * core polyline to dodgerblue and adds a white casing below — matching how
   * user-drawn routes render in TrackDrawer, so "preselected trail" and
   * "route I drew" share the same visual language.
   *
   * On select, both entities are rebuilt so the casing renders *under* the core
   * (insertion order in Cesium's EntityCollection determines draw order for
   * clampToGround polylines). The original entity id is preserved so click-to-
   * select tests still resolve to the same LayerEntity.
   */
  private applyStyle(layer: LayerEntity, selected: boolean) {
    const Cesium = window.Cesium;
    const widths = this.widthsForTier();
    const positions = Cesium.Cartesian3.fromDegreesArray(
      layer.geometry.flatMap(([lat, lng]) => [lng, lat]),
    );

    if (selected) {
      const id = layer.entity?.id;
      if (layer.entity) this.viewer.entities.remove(layer.entity);
      if (layer.casing) this.viewer.entities.remove(layer.casing);

      layer.casing = this.viewer.entities.add({
        polyline: {
          positions,
          width: widths.selectedCasing,
          material: Cesium.Color.WHITE.withAlpha(0.9),
          clampToGround: true,
        },
      });
      layer.entity = this.viewer.entities.add({
        id,
        name: layer.name,
        polyline: {
          positions,
          width: widths.selectedCore,
          material: this.selectedCoreMaterial(),
          clampToGround: true,
        },
        description: `<div><h4>${layer.name}</h4><p>DOC track</p></div>`,
      });
    } else {
      if (layer.casing) {
        this.viewer.entities.remove(layer.casing);
        layer.casing = null;
      }
      if (layer.entity?.polyline) {
        layer.entity.polyline.width = widths.unselected;
        layer.entity.polyline.material = this.defaultMaterial();
      }
    }
  }

  /** Thin solid AllTrails-green — reads cleanly on both satellite and LINZ topo. */
  private defaultMaterial(): any {
    const Cesium = window.Cesium;
    return Cesium.Color.fromCssColorString('rgba(95,173,65,0.85)').withAlpha(0.7 * this.opacity);
  }

  /** Dodgerblue core for the selected discovery trail — same as user routes. */
  private selectedCoreMaterial(): any {
    const Cesium = window.Cesium;
    return Cesium.Color.fromCssColorString('#2563eb');
  }

  /** Set overlay opacity (0..1). Updates materials on all non-selected entities. */
  setOpacity(value: number) {
    this.opacity = Math.max(0, Math.min(1, value));
    for (const [id, layer] of this.entities) {
      if (id === this.selectedId) continue;
      if (layer.entity?.polyline) layer.entity.polyline.material = this.defaultMaterial();
    }
    this.requestRender();
  }

  // ── Zoom-responsive width ──────────────────────────────────────────────────
  private widthTier: 'near' | 'mid' | 'far' | null = null;

  private tierForHeight(height?: number): 'near' | 'mid' | 'far' {
    if (!height || !Number.isFinite(height)) return 'mid';
    if (height < 2000) return 'near';
    if (height > 15000) return 'far';
    return 'mid';
  }

  private widthsForTier(tier: 'near' | 'mid' | 'far' = this.widthTier ?? 'mid'): {
    unselected: number;
    selectedCasing: number;
    selectedCore: number;
  } {
    if (tier === 'near') return { unselected: 4, selectedCasing: 10, selectedCore: 7 };
    if (tier === 'far') return { unselected: 2, selectedCasing: 5, selectedCore: 3 };
    return { unselected: 3, selectedCasing: 8, selectedCore: 5 };
  }

  private refreshWidthTier() {
    const next = this.tierForHeight(this.viewer.camera.positionCartographic?.height);
    if (next === this.widthTier) return;
    this.widthTier = next;
    const widths = this.widthsForTier(next);
    for (const [id, layer] of this.entities) {
      const isSel = id === this.selectedId;
      if (layer.entity?.polyline) {
        layer.entity.polyline.width = isSel ? widths.selectedCore : widths.unselected;
      }
      if (layer.casing?.polyline) layer.casing.polyline.width = widths.selectedCasing;
    }
    this.requestRender();
  }

  // ── Cleanup helpers ────────────────────────────────────────────────────────

  private clearAll() {
    for (const layer of this.entities.values()) {
      this.viewer.entities.remove(layer.entity);
      if (layer.casing) this.viewer.entities.remove(layer.casing);
    }
    this.entities.clear();
    if (this.selectedId) {
      this.selectedId = null;
      this.onSelectionChange?.(null);
    }
    this.requestRender();
  }

  private clearNonSelected() {
    let removed = 0;
    for (const [id, layer] of this.entities) {
      if (id === this.selectedId) continue;
      this.viewer.entities.remove(layer.entity);
      if (layer.casing) this.viewer.entities.remove(layer.casing);
      this.entities.delete(id);
      removed++;
    }
    if (removed) this.requestRender();
  }
}
