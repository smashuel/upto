/* eslint-disable @typescript-eslint/no-explicit-any */
import { CesiumManager } from './CesiumManager';
import type { LatLng } from '../types/adventure';

export interface Waypoint {
  id: string;
  position: any; // Cesium.Cartesian3
  cartographic: any; // Cesium.Cartographic
  entity?: any; // Cesium.Entity
  metadata: {
    name: string;
    type: 'accommodation' | 'checkpoint' | 'viewpoint' | 'hazard' | 'generic';
    notes: string;
    elevation?: number;
    timestamp: Date;
  };
}

const WAYPOINT_COLORS: Record<Waypoint['metadata']['type'], string> = {
  accommodation: 'BLUE',
  checkpoint: 'GREEN',
  viewpoint: 'YELLOW',
  hazard: 'RED',
  generic: 'WHITE',
};

export default class WaypointManager extends CesiumManager {
  private waypoints: Waypoint[] = [];
  private active = false;
  private onAdded?: (waypoint: Waypoint) => void;

  constructor(viewer: any, onAdded?: (waypoint: Waypoint) => void) {
    super(viewer);
    this.onAdded = onAdded;
  }

  protected setup(handler: any) {
    handler.setInputAction((event: any) => {
      if (!this.active) return;
      const pos = this.pickPosition(event.position);
      if (pos) this.addWaypoint(pos);
    }, window.Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  setMode(enabled: boolean) {
    this.active = enabled;
    this.setCursor(enabled ? 'crosshair' : '');
  }

  addWaypoint(position: any, meta: Partial<Waypoint['metadata']> = {}): Waypoint {
    const cartographic = window.Cesium.Cartographic.fromCartesian(position);

    const waypoint: Waypoint = {
      id: this.generateId('waypoint'),
      position,
      cartographic,
      metadata: {
        name: meta.name || `Waypoint ${this.waypoints.length + 1}`,
        type: meta.type || 'generic',
        notes: meta.notes || '',
        elevation: cartographic.height,
        timestamp: new Date(),
        ...meta,
      },
    };

    this.waypoints.push(waypoint);
    waypoint.entity = this.renderWaypoint(waypoint);
    this.onAdded?.(waypoint);
    return waypoint;
  }

  private renderWaypoint(wp: Waypoint): any {
    const Cesium = window.Cesium;
    const color = Cesium.Color[WAYPOINT_COLORS[wp.metadata.type]] ?? Cesium.Color.WHITE;

    return this.viewer.entities.add({
      position: wp.position,
      point: {
        pixelSize: 12,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5),
      },
      label: {
        text: wp.metadata.name,
        font: '12pt sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -50),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0),
      },
      description: this.buildDescription(wp),
    });
  }

  private buildDescription(wp: Waypoint): string {
    const lat = window.Cesium.Math.toDegrees(wp.cartographic.latitude).toFixed(6);
    const lng = window.Cesium.Math.toDegrees(wp.cartographic.longitude).toFixed(6);
    return `<div><h4>${wp.metadata.name}</h4><p>${wp.metadata.type}</p><p>${lat}, ${lng}</p><p>${wp.cartographic.height.toFixed(0)}m</p></div>`;
  }

  deleteWaypoint(id: string) {
    const idx = this.waypoints.findIndex(wp => wp.id === id);
    if (idx === -1) return;
    const wp = this.waypoints[idx];
    if (wp.entity) this.viewer.entities.remove(wp.entity);
    this.waypoints.splice(idx, 1);
  }

  getWaypoints(): Waypoint[] {
    return [...this.waypoints];
  }

  /** Load waypoints from stored data — coordinates are [lat, lng] */
  loadWaypoints(waypoints: Array<{ name?: string; coordinates: LatLng; elevation?: number; type?: string }>) {
    for (const wp of waypoints) {
      const [lat, lng] = wp.coordinates;
      const position = window.Cesium.Cartesian3.fromDegrees(lng, lat, wp.elevation ?? 0);
      this.addWaypoint(position, wp as any);
    }
  }

  clearAll() {
    for (const wp of this.waypoints) {
      if (wp.entity) this.viewer.entities.remove(wp.entity);
    }
    this.waypoints = [];
  }
}
