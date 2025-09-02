interface Waypoint {
  id: string;
  position: any; // Cesium.Cartesian3
  cartographic: any; // Cesium.Cartographic
  entity?: any; // Cesium.Entity
  metadata: {
    name: string;
    type: 'accommodation' | 'checkpoint' | 'viewpoint' | 'hazard' | 'generic';
    notes: string;
    stayDuration?: string;
    elevation?: number;
    timestamp: Date;
  };
}

export default class WaypointManager {
  private viewer: any;
  private waypoints: Waypoint[] = [];
  private isWaypointMode: boolean = false;
  private onWaypointAdded?: (waypoint: Waypoint) => void;
  private clickHandler?: any;

  constructor(viewer: any, onWaypointAdded?: (waypoint: Waypoint) => void) {
    this.viewer = viewer;
    this.onWaypointAdded = onWaypointAdded;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.clickHandler = (event: any) => {
      if (!this.isWaypointMode) return;

      const pickedPosition = this.viewer.camera.pickEllipsoid(
        event.position,
        this.viewer.scene.globe.ellipsoid
      );

      if (pickedPosition) {
        this.addWaypoint(pickedPosition);
      }
    };

    this.viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
      this.clickHandler,
      window.Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
  }

  setMode(enabled: boolean) {
    this.isWaypointMode = enabled;
    this.viewer.cesiumWidget.canvas.style.cursor = enabled ? 'crosshair' : '';
  }

  addWaypoint(position: any, metadata: Partial<Waypoint['metadata']> = {}): Waypoint {
    const cartographic = window.Cesium.Cartographic.fromCartesian(position);
    
    const waypoint: Waypoint = {
      id: this.generateId(),
      position: position,
      cartographic: cartographic,
      metadata: {
        name: metadata.name || `Waypoint ${this.waypoints.length + 1}`,
        type: metadata.type || 'generic',
        notes: metadata.notes || '',
        stayDuration: metadata.stayDuration,
        elevation: cartographic.height,
        timestamp: new Date(),
        ...metadata
      }
    };

    this.waypoints.push(waypoint);
    this.renderWaypoint(waypoint);
    
    if (this.onWaypointAdded) {
      this.onWaypointAdded(waypoint);
    }

    return waypoint;
  }

  private renderWaypoint(waypoint: Waypoint) {
    const entity = this.viewer.entities.add({
      position: waypoint.position,
      point: {
        pixelSize: 12,
        color: this.getWaypointColor(waypoint.metadata.type),
        outlineColor: window.Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: window.Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5)
      },
      label: {
        text: waypoint.metadata.name,
        font: '12pt sans-serif',
        pixelOffset: new window.Cesium.Cartesian2(0, -50),
        fillColor: window.Cesium.Color.WHITE,
        outlineColor: window.Cesium.Color.BLACK,
        outlineWidth: 2,
        style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
        scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0)
      },
      description: this.createWaypointDescription(waypoint)
    });

    waypoint.entity = entity;
  }

  private createWaypointDescription(waypoint: Waypoint): string {
    const { metadata, cartographic } = waypoint;
    const lat = window.Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
    const lng = window.Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
    const elevation = cartographic.height.toFixed(0);

    return `
      <div style="max-width: 300px;">
        <h4>${metadata.name}</h4>
        <p><strong>Type:</strong> ${metadata.type.charAt(0).toUpperCase() + metadata.type.slice(1)}</p>
        <p><strong>Coordinates:</strong> ${lat}, ${lng}</p>
        <p><strong>Elevation:</strong> ${elevation}m</p>
        ${metadata.notes ? `<p><strong>Notes:</strong> ${metadata.notes}</p>` : ''}
        ${metadata.stayDuration ? `<p><strong>Stay Duration:</strong> ${metadata.stayDuration}</p>` : ''}
        <p><small>Added: ${metadata.timestamp.toLocaleDateString()}</small></p>
        <button onclick="waypoint_${waypoint.id}_edit()">Edit</button>
        <button onclick="waypoint_${waypoint.id}_delete()">Delete</button>
      </div>
    `;
  }

  private getWaypointColor(type: Waypoint['metadata']['type']): any {
    const colors = {
      'accommodation': window.Cesium.Color.BLUE,
      'checkpoint': window.Cesium.Color.GREEN,
      'viewpoint': window.Cesium.Color.YELLOW,
      'hazard': window.Cesium.Color.RED,
      'generic': window.Cesium.Color.WHITE
    };
    return colors[type] || colors.generic;
  }

  deleteWaypoint(id: string) {
    const waypointIndex = this.waypoints.findIndex(wp => wp.id === id);
    if (waypointIndex === -1) return;

    const waypoint = this.waypoints[waypointIndex];
    if (waypoint.entity) {
      this.viewer.entities.remove(waypoint.entity);
    }

    this.waypoints.splice(waypointIndex, 1);
  }

  updateWaypoint(id: string, updates: Partial<Waypoint['metadata']>) {
    const waypoint = this.waypoints.find(wp => wp.id === id);
    if (!waypoint) return;

    waypoint.metadata = { ...waypoint.metadata, ...updates };
    
    // Update the visual representation
    if (waypoint.entity) {
      waypoint.entity.point.color = this.getWaypointColor(waypoint.metadata.type);
      waypoint.entity.label.text = waypoint.metadata.name;
      waypoint.entity.description = this.createWaypointDescription(waypoint);
    }
  }

  getWaypoints(): Waypoint[] {
    return [...this.waypoints];
  }

  loadWaypoints(waypoints: any[]) {
    waypoints.forEach(wp => {
      if (wp.coordinates && Array.isArray(wp.coordinates) && wp.coordinates.length === 2) {
        const [lat, lng] = wp.coordinates;
        const position = window.Cesium.Cartesian3.fromDegrees(lng, lat, wp.elevation || 0);
        this.addWaypoint(position, wp);
      }
    });
  }

  clearAll() {
    this.waypoints.forEach(waypoint => {
      if (waypoint.entity) {
        this.viewer.entities.remove(waypoint.entity);
      }
    });
    this.waypoints = [];
  }

  flyToWaypoint(id: string) {
    const waypoint = this.waypoints.find(wp => wp.id === id);
    if (!waypoint) return;

    this.viewer.camera.flyTo({
      destination: window.Cesium.Cartesian3.fromCartesian(waypoint.position, undefined, 500),
      duration: 2.0
    });
  }

  private generateId(): string {
    return `waypoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}