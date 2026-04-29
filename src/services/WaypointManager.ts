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

/** SVG icon data URLs keyed by waypoint type — 32px circles with white icons */
const WAYPOINT_ICONS: Record<Waypoint['metadata']['type'], { url: string; color: string }> = {
  accommodation: {
    color: '#3b82f6',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="%233b82f6" stroke="white" stroke-width="2"/><path d="M10 21v-4h3v-2c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v2h3v4" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 17h12" stroke="white" stroke-width="1.5"/></svg>',
  },
  checkpoint: {
    color: '#22c55e',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="%2322c55e" stroke="white" stroke-width="2"/><path d="M12 16l3 3 5-6" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  viewpoint: {
    color: '#eab308',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="%23eab308" stroke="white" stroke-width="2"/><path d="M16 10l4 8H12z" stroke="white" stroke-width="1.5" fill="none" stroke-linejoin="round"/><line x1="16" y1="18" x2="16" y2="22" stroke="white" stroke-width="1.5"/></svg>',
  },
  hazard: {
    color: '#ef4444',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="%23ef4444" stroke="white" stroke-width="2"/><path d="M16 11v6M16 20v1" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  generic: {
    color: '#6b7280',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="%236b7280" stroke="white" stroke-width="2"/><circle cx="16" cy="14" r="3" stroke="white" stroke-width="1.5" fill="none"/><path d="M11 22c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
  },
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
    const icon = WAYPOINT_ICONS[wp.metadata.type] ?? WAYPOINT_ICONS.generic;

    return this.viewer.entities.add({
      position: wp.position,
      billboard: {
        image: icon.url,
        scale: 1.0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5),
      },
      label: {
        text: wp.metadata.name,
        font: '12pt sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -40),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
