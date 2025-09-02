interface MapNote {
  id: string;
  position: any; // Cesium.Cartesian3
  cartographic: any; // Cesium.Cartographic
  entity?: any; // Cesium.Entity
  content: string;
  type: 'accommodation' | 'warning' | 'info' | 'photo' | 'general';
  metadata: {
    title: string;
    stayDuration?: string;
    contact?: string;
    website?: string;
    phone?: string;
    elevation?: number;
    timestamp: Date;
    lastModified: Date;
  };
}

export default class NoteManager {
  private viewer: any;
  private notes: MapNote[] = [];
  private isNoteMode: boolean = false;
  private onNoteAdded?: (note: MapNote) => void;
  private clickHandler?: any;

  constructor(viewer: any, onNoteAdded?: (note: MapNote) => void) {
    this.viewer = viewer;
    this.onNoteAdded = onNoteAdded;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.clickHandler = (event: any) => {
      if (!this.isNoteMode) return;

      const pickedPosition = this.viewer.camera.pickEllipsoid(
        event.position,
        this.viewer.scene.globe.ellipsoid
      );

      if (pickedPosition) {
        this.promptForNote(pickedPosition);
      }
    };

    this.viewer.cesiumWidget.screenSpaceEventHandler.setInputAction(
      this.clickHandler,
      window.Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
  }

  setMode(enabled: boolean) {
    this.isNoteMode = enabled;
    this.viewer.cesiumWidget.canvas.style.cursor = enabled ? 'help' : '';
  }

  private promptForNote(position: any) {
    // In a real implementation, this would open a modal or form
    // For now, we'll create a simple note with prompt
    const content = prompt('Enter note content:');
    if (!content) return;

    const title = prompt('Note title (optional):') || 'Map Note';
    const type = prompt('Note type (accommodation/warning/info/photo/general):') as MapNote['type'] || 'general';

    this.addNote(position, {
      content,
      type,
      metadata: {
        title
      }
    });
  }

  addNote(position: any, noteData: {
    content: string;
    type: MapNote['type'];
    metadata: Partial<MapNote['metadata']>;
  }): MapNote {
    const cartographic = window.Cesium.Cartographic.fromCartesian(position);
    
    const note: MapNote = {
      id: this.generateId(),
      position: position,
      cartographic: cartographic,
      content: noteData.content,
      type: noteData.type,
      metadata: {
        title: noteData.metadata.title || 'Map Note',
        stayDuration: noteData.metadata.stayDuration,
        contact: noteData.metadata.contact,
        website: noteData.metadata.website,
        phone: noteData.metadata.phone,
        elevation: cartographic.height,
        timestamp: new Date(),
        lastModified: new Date(),
        ...noteData.metadata
      }
    };

    this.notes.push(note);
    this.renderNote(note);
    
    if (this.onNoteAdded) {
      this.onNoteAdded(note);
    }

    return note;
  }

  private renderNote(note: MapNote) {
    const entity = this.viewer.entities.add({
      position: note.position,
      billboard: {
        image: this.getNoteIcon(note.type),
        scale: 0.6,
        heightReference: window.Cesium.HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: window.Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5)
      },
      label: {
        text: note.metadata.title,
        font: '11pt sans-serif',
        pixelOffset: new window.Cesium.Cartesian2(0, -60),
        fillColor: window.Cesium.Color.WHITE,
        outlineColor: window.Cesium.Color.BLACK,
        outlineWidth: 2,
        style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
        scaleByDistance: new window.Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0)
      },
      description: this.createNoteDescription(note)
    });

    note.entity = entity;
  }

  private getNoteIcon(type: MapNote['type']): string {
    // Using data URLs for simple icons (you could replace with actual icon files)
    const icons = {
      accommodation: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTMgMjFIMjFWOUgzVjIxWk01IDExSDdWMTNINVYxMVpNOSAxMUgxMVYxM0g5VjExWk0xMyAxMUgxNVYxM0gxM1YxMVpNMTcgMTFIMTlWMTNIMTdWMTFaIiBmaWxsPSIjMDA3Q0ZGIi8+Cjwvc3ZnPg==',
      warning: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMjIgMjBIMkwxMiAyWk0xMSAxN0gxM1YxOUgxMVYxN1pNMTEgOUgxM1YxNUgxMVY5WiIgZmlsbD0iI0ZGNkIwMCIvPgo8L3N2Zz4=',
      info: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMwMEI4RDQiLz4KPHBhdGggZD0iTTEyIDZWOE0xMiAxMlYxOCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9zdmc+',
      photo: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iNSIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE0IiByeD0iMiIgZmlsbD0iIzAwN0NGRiIvPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4=',
      general: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDEySDNNMTIgM1YyMSIgc3Ryb2tlPSIjNkI3MjgwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4='
    };
    
    return icons[type] || icons.general;
  }

  private createNoteDescription(note: MapNote): string {
    const { metadata, cartographic } = note;
    const lat = window.Cesium.Math.toDegrees(cartographic.latitude).toFixed(6);
    const lng = window.Cesium.Math.toDegrees(cartographic.longitude).toFixed(6);
    const elevation = cartographic.height.toFixed(0);

    return `
      <div style="max-width: 350px;">
        <h4>${metadata.title}</h4>
        <p><strong>Type:</strong> ${note.type.charAt(0).toUpperCase() + note.type.slice(1)}</p>
        <p><strong>Content:</strong> ${note.content}</p>
        <p><strong>Location:</strong> ${lat}, ${lng}</p>
        <p><strong>Elevation:</strong> ${elevation}m</p>
        ${metadata.stayDuration ? `<p><strong>Stay Duration:</strong> ${metadata.stayDuration}</p>` : ''}
        ${metadata.contact ? `<p><strong>Contact:</strong> ${metadata.contact}</p>` : ''}
        ${metadata.phone ? `<p><strong>Phone:</strong> ${metadata.phone}</p>` : ''}
        ${metadata.website ? `<p><strong>Website:</strong> <a href="${metadata.website}" target="_blank">${metadata.website}</a></p>` : ''}
        <p><small>Added: ${metadata.timestamp.toLocaleDateString()}</small></p>
        <button onclick="note_${note.id}_edit()">Edit</button>
        <button onclick="note_${note.id}_delete()">Delete</button>
      </div>
    `;
  }

  deleteNote(id: string) {
    const noteIndex = this.notes.findIndex(note => note.id === id);
    if (noteIndex === -1) return;

    const note = this.notes[noteIndex];
    if (note.entity) {
      this.viewer.entities.remove(note.entity);
    }

    this.notes.splice(noteIndex, 1);
  }

  updateNote(id: string, updates: Partial<MapNote>) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;

    Object.assign(note, updates);
    note.metadata.lastModified = new Date();
    
    // Update the visual representation
    if (note.entity) {
      note.entity.description = this.createNoteDescription(note);
      if (updates.metadata?.title) {
        note.entity.label.text = updates.metadata.title;
      }
    }
  }

  getNotes(): MapNote[] {
    return [...this.notes];
  }

  clearAll() {
    this.notes.forEach(note => {
      if (note.entity) {
        this.viewer.entities.remove(note.entity);
      }
    });
    this.notes = [];
  }

  flyToNote(id: string) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;

    this.viewer.camera.flyTo({
      destination: window.Cesium.Cartesian3.fromCartesian(note.position, undefined, 1000),
      duration: 2.0
    });
  }

  private generateId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}