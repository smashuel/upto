interface TrackPoint {
  position: any; // Cesium.Cartesian3
  cartographic: any; // Cesium.Cartographic
  elevation?: number;
  timestamp: Date;
}

interface Track {
  id: string;
  name: string;
  points: TrackPoint[];
  entity?: any; // Cesium.Entity
  metadata: {
    distance: number;
    elevationGain: number;
    elevationLoss: number;
    difficulty?: string;
    notes: string;
    activityType: string;
    created: Date;
    lastModified: Date;
  };
}

export default class TrackDrawer {
  private viewer: any;
  private tracks: Track[] = [];
  private isDrawing: boolean = false;
  private currentTrack: Track | null = null;
  private currentTrackPoints: TrackPoint[] = [];
  private currentEntity: any = null;
  private onRouteCreated?: (track: Track) => void;
  private clickHandler?: any;
  private doubleClickHandler?: any;

  constructor(viewer: any, onRouteCreated?: (track: Track) => void) {
    this.viewer = viewer;
    this.onRouteCreated = onRouteCreated;
    this.setupDrawingHandlers();
  }

  private setupDrawingHandlers() {
    this.clickHandler = (event: any) => {
      if (!this.isDrawing) return;

      const pickedPosition = this.viewer.camera.pickEllipsoid(
        event.position,
        this.viewer.scene.globe.ellipsoid
      );

      if (pickedPosition) {
        this.addTrackPoint(pickedPosition);
      }
    };

    this.doubleClickHandler = (event: any) => {
      if (this.isDrawing) {
        this.finishDrawing();
      }
    };

    this.viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
      this.clickHandler,
      window.Cesium.ScreenSpaceEventType.LEFT_CLICK
    );

    this.viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
      this.doubleClickHandler,
      window.Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );
  }

  setMode(enabled: boolean) {
    if (enabled && !this.isDrawing) {
      this.startDrawing();
    } else if (!enabled && this.isDrawing) {
      this.cancelDrawing();
    }
  }

  private startDrawing() {
    this.isDrawing = true;
    this.currentTrackPoints = [];
    this.currentEntity = null;
    this.viewer.cesiumWidget.canvas.style.cursor = 'crosshair';
  }

  private addTrackPoint(position: any) {
    const cartographic = window.Cesium.Cartographic.fromCartesian(position);
    
    const trackPoint: TrackPoint = {
      position: position,
      cartographic: cartographic,
      elevation: cartographic.height,
      timestamp: new Date()
    };

    this.currentTrackPoints.push(trackPoint);
    this.updateTrackVisualization();
  }

  private updateTrackVisualization() {
    if (this.currentEntity) {
      this.viewer.entities.remove(this.currentEntity);
    }

    if (this.currentTrackPoints.length > 1) {
      const positions = this.currentTrackPoints.map(point => point.position);
      
      this.currentEntity = this.viewer.entities.add({
        polyline: {
          positions: positions,
          width: 4,
          material: window.Cesium.Color.ORANGE.withAlpha(0.8),
          clampToGround: true,
          // Add arrow-like appearance for direction
          polylineOutline: true,
          outlineColor: window.Cesium.Color.BLACK,
          outlineWidth: 1
        }
      });

      // Add point markers for each track point
      this.currentTrackPoints.forEach((point, index) => {
        if (index === 0 || index === this.currentTrackPoints.length - 1) {
          this.viewer.entities.add({
            position: point.position,
            point: {
              pixelSize: 8,
              color: index === 0 ? window.Cesium.Color.GREEN : window.Cesium.Color.RED,
              outlineColor: window.Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: window.Cesium.HeightReference.CLAMP_TO_GROUND
            },
            label: {
              text: index === 0 ? 'START' : 'END',
              font: '10pt sans-serif',
              pixelOffset: new window.Cesium.Cartesian2(0, -30),
              fillColor: window.Cesium.Color.WHITE,
              outlineColor: window.Cesium.Color.BLACK,
              outlineWidth: 1,
              style: window.Cesium.LabelStyle.FILL_AND_OUTLINE
            }
          });
        }
      });
    }
  }

  private finishDrawing(): Track | null {
    if (this.currentTrackPoints.length < 2) {
      this.cancelDrawing();
      return null;
    }

    const track = this.createTrackFromPoints();
    this.tracks.push(track);
    this.renderFinalTrack(track);

    if (this.onRouteCreated) {
      this.onRouteCreated(track);
    }

    this.isDrawing = false;
    this.viewer.cesiumWidget.canvas.style.cursor = '';
    this.currentTrackPoints = [];
    this.currentEntity = null;

    return track;
  }

  private cancelDrawing() {
    if (this.currentEntity) {
      this.viewer.entities.remove(this.currentEntity);
      this.currentEntity = null;
    }
    
    this.isDrawing = false;
    this.viewer.cesiumWidget.canvas.style.cursor = '';
    this.currentTrackPoints = [];
  }

  private createTrackFromPoints(): Track {
    const metadata = this.calculateTrackMetadata();
    
    return {
      id: this.generateId(),
      name: `Route ${this.tracks.length + 1}`,
      points: [...this.currentTrackPoints],
      metadata: {
        distance: metadata.distance,
        elevationGain: metadata.elevationGain,
        elevationLoss: metadata.elevationLoss,
        difficulty: this.estimateDifficulty(metadata),
        notes: '',
        activityType: 'hiking', // Default, can be updated
        created: new Date(),
        lastModified: new Date()
      }
    };
  }

  private calculateTrackMetadata() {
    let totalDistance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let previousPoint: TrackPoint | null = null;

    for (const point of this.currentTrackPoints) {
      if (previousPoint) {
        // Calculate distance between points
        const distance = window.Cesium.Cartesian3.distance(
          previousPoint.position,
          point.position
        );
        totalDistance += distance;

        // Calculate elevation change
        const elevationChange = point.elevation! - previousPoint.elevation!;
        if (elevationChange > 0) {
          elevationGain += elevationChange;
        } else {
          elevationLoss += Math.abs(elevationChange);
        }
      }
      previousPoint = point;
    }

    return {
      distance: totalDistance / 1000, // Convert to kilometers
      elevationGain,
      elevationLoss
    };
  }

  private estimateDifficulty(metadata: { distance: number; elevationGain: number; elevationLoss: number }): string {
    const { distance, elevationGain } = metadata;
    
    // Simple difficulty estimation based on distance and elevation gain
    const difficultyScore = distance * 0.5 + (elevationGain / 100) * 0.3;
    
    if (difficultyScore < 2) return 'easy';
    if (difficultyScore < 5) return 'moderate';
    if (difficultyScore < 8) return 'difficult';
    return 'expert';
  }

  private renderFinalTrack(track: Track) {
    const positions = track.points.map(point => point.position);
    
    const entity = this.viewer.entities.add({
      polyline: {
        positions: positions,
        width: 3,
        material: window.Cesium.Color.BLUE.withAlpha(0.8),
        clampToGround: true
      },
      description: this.createTrackDescription(track)
    });

    track.entity = entity;
  }

  private createTrackDescription(track: Track): string {
    const { metadata } = track;
    
    return `
      <div style="max-width: 400px;">
        <h4>${track.name}</h4>
        <p><strong>Distance:</strong> ${metadata.distance.toFixed(2)} km</p>
        <p><strong>Elevation Gain:</strong> +${metadata.elevationGain.toFixed(0)}m</p>
        <p><strong>Elevation Loss:</strong> -${metadata.elevationLoss.toFixed(0)}m</p>
        <p><strong>Difficulty:</strong> ${metadata.difficulty}</p>
        <p><strong>Activity Type:</strong> ${metadata.activityType}</p>
        ${metadata.notes ? `<p><strong>Notes:</strong> ${metadata.notes}</p>` : ''}
        <p><small>Created: ${metadata.created.toLocaleDateString()}</small></p>
        <button onclick="track_${track.id}_edit()">Edit</button>
        <button onclick="track_${track.id}_delete()">Delete</button>
        <button onclick="track_${track.id}_export()">Export GPX</button>
      </div>
    `;
  }

  deleteTrack(id: string) {
    const trackIndex = this.tracks.findIndex(track => track.id === id);
    if (trackIndex === -1) return;

    const track = this.tracks[trackIndex];
    if (track.entity) {
      this.viewer.entities.remove(track.entity);
    }

    this.tracks.splice(trackIndex, 1);
  }

  updateTrack(id: string, updates: Partial<Track>) {
    const track = this.tracks.find(t => t.id === id);
    if (!track) return;

    Object.assign(track, updates);
    track.metadata.lastModified = new Date();
    
    // Update the visual representation
    if (track.entity) {
      track.entity.description = this.createTrackDescription(track);
    }
  }

  getTracks(): Track[] {
    return [...this.tracks];
  }

  loadRoutes(routes: any[]) {
    routes.forEach(route => {
      if (route.waypoints && Array.isArray(route.waypoints)) {
        const trackPoints: TrackPoint[] = route.waypoints.map((wp: any) => {
          const [lat, lng] = wp.coordinates;
          const position = window.Cesium.Cartesian3.fromDegrees(lng, lat, wp.elevation || 0);
          return {
            position,
            cartographic: window.Cesium.Cartographic.fromCartesian(position),
            elevation: wp.elevation,
            timestamp: new Date()
          };
        });

        const track: Track = {
          id: route.id || this.generateId(),
          name: route.name || `Imported Route ${this.tracks.length + 1}`,
          points: trackPoints,
          metadata: {
            distance: route.distance || 0,
            elevationGain: route.elevationGain || 0,
            elevationLoss: route.elevationLoss || 0,
            difficulty: route.difficulty,
            notes: route.notes || '',
            activityType: route.activityType || 'hiking',
            created: new Date(route.created || Date.now()),
            lastModified: new Date()
          }
        };

        this.tracks.push(track);
        this.renderFinalTrack(track);
      }
    });
  }

  exportTrackAsGPX(id: string): string {
    const track = this.tracks.find(t => t.id === id);
    if (!track) return '';

    const trackPointsXML = track.points.map(point => {
      const lat = window.Cesium.Math.toDegrees(point.cartographic.latitude);
      const lng = window.Cesium.Math.toDegrees(point.cartographic.longitude);
      const elevation = point.elevation || 0;
      
      return `    <trkpt lat="${lat}" lon="${lng}">
      <ele>${elevation}</ele>
      <time>${point.timestamp.toISOString()}</time>
    </trkpt>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Upto Trip Planner">
  <trk>
    <name>${track.name}</name>
    <desc>${track.metadata.notes}</desc>
    <trkseg>
${trackPointsXML}
    </trkseg>
  </trk>
</gpx>`;
  }

  clearAll() {
    this.tracks.forEach(track => {
      if (track.entity) {
        this.viewer.entities.remove(track.entity);
      }
    });
    this.tracks = [];
  }

  flyToTrack(id: string) {
    const track = this.tracks.find(t => t.id === id);
    if (!track || track.points.length === 0) return;

    // Calculate bounding box of the track
    const positions = track.points.map(point => point.position);
    const boundingSphere = window.Cesium.BoundingSphere.fromPoints(positions);
    
    this.viewer.camera.flyToBoundingSphere(boundingSphere, {
      duration: 2.0,
      offset: new window.Cesium.HeadingPitchRange(0, -0.5, boundingSphere.radius * 2)
    });
  }

  private generateId(): string {
    return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}