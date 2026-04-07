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
  entity?: any;
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

  constructor(
    viewer: any,
    onCreated?: (track: SerializableTrack) => void,
    onDrawingUpdate?: (stats: DrawingStats | null) => void,
    apiBase = '',
  ) {
    super(viewer);
    this.onCreated = onCreated;
    this.onDrawingUpdate = onDrawingUpdate;
    this.snapService = new TrailSnapService(apiBase);
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
  }

  setMode(enabled: boolean) {
    if (enabled && !this.drawing) {
      this.drawing = true;
      this.currentPoints = [];
      this.previewEntity = null;
      this.lastSnap = null;
      this.setCursor('crosshair');
    } else if (!enabled && this.drawing) {
      this.cancelDrawing();
    }
  }

  /** Remove the last placed point during active drawing */
  undoLastPoint() {
    if (!this.drawing || this.currentPoints.length === 0) return;
    this.currentPoints.pop();
    this.updatePreview();
    this.emitDrawingStats();
  }

  private async addPoint(position: any) {
    const Cesium = window.Cesium;
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const clickedLat = Cesium.Math.toDegrees(cartographic.latitude);
    const clickedLng = Cesium.Math.toDegrees(cartographic.longitude);

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
  }

  private updatePreview() {
    if (this.previewEntity) this.viewer.entities.remove(this.previewEntity);
    if (this.currentPoints.length < 2) {
      this.previewEntity = null;
      return;
    }

    const Cesium = window.Cesium;
    const positions = this.currentPoints.map(p => p.position);
    this.previewEntity = this.viewer.entities.add({
      polyline: {
        positions,
        width: 4,
        material: new Cesium.PolylineOutlineMaterialProperty({
          color: Cesium.Color.ORANGE.withAlpha(0.8),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
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

    const track = this.buildTrack();
    this.tracks.push(track);
    if (this.previewEntity) this.viewer.entities.remove(this.previewEntity);
    track.entity = this.renderTrack(track);
    this.onCreated?.(this.serializeTrack(track));

    this.drawing = false;
    this.currentPoints = [];
    this.previewEntity = null;
    this.lastSnap = null;
    this.setCursor('');
    this.onDrawingUpdate?.(null); // clear live stats
  }

  private cancelDrawing() {
    if (this.previewEntity) {
      this.viewer.entities.remove(this.previewEntity);
      this.previewEntity = null;
    }
    this.drawing = false;
    this.currentPoints = [];
    this.lastSnap = null;
    this.setCursor('');
    this.onDrawingUpdate?.(null);
  }

  private buildTrack(): Track {
    let distance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;

    for (let i = 1; i < this.currentPoints.length; i++) {
      distance += window.Cesium.Cartesian3.distance(
        this.currentPoints[i - 1].position,
        this.currentPoints[i].position,
      );
      const delta = this.currentPoints[i].elevation - this.currentPoints[i - 1].elevation;
      if (delta > 0) elevationGain += delta;
      else elevationLoss += Math.abs(delta);
    }

    distance /= 1000; // convert to km
    const difficulty = this.estimateDifficulty(distance, elevationGain);

    return {
      id: this.generateId('track'),
      name: `Route ${this.tracks.length + 1}`,
      points: [...this.currentPoints],
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

  private renderTrack(track: Track): any {
    return this.viewer.entities.add({
      polyline: {
        positions: track.points.map(p => p.position),
        width: 3,
        material: window.Cesium.Color.BLUE.withAlpha(0.8),
        clampToGround: true,
      },
      description: `<div><h4>${track.name}</h4><p>${track.metadata.distance.toFixed(2)} km · +${track.metadata.elevationGain.toFixed(0)}m / -${track.metadata.elevationLoss.toFixed(0)}m · ${track.metadata.difficulty}</p></div>`,
    });
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
    });
  }

  getTracks(): Track[] {
    return [...this.tracks];
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
      track.entity = this.renderTrack(track);
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
    for (const track of this.tracks) {
      if (track.entity) this.viewer.entities.remove(track.entity);
    }
    this.tracks = [];
  }

  /** Kept for backward compat */
  getRoutes(): Track[] {
    return this.getTracks();
  }
}
