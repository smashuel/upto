/* eslint-disable @typescript-eslint/no-explicit-any */
import { CesiumManager } from './CesiumManager';

export interface MapNote {
  id: string;
  position: any;
  cartographic: any;
  entity?: any;
  content: string;
  type: 'accommodation' | 'warning' | 'info' | 'photo' | 'general';
  title: string;
  timestamp: Date;
}

// Minimal inline SVG icons as data URLs
const NOTE_ICONS: Record<MapNote['type'], string> = {
  accommodation: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23007CFF"><rect x="3" y="9" width="18" height="12" rx="1"/><path d="M1 9h22M9 9V5h6v4"/></svg>',
  warning:       'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF6B00"><path d="M12 2L22 20H2z"/><path d="M12 9v4M12 16v2" stroke="white" stroke-width="1.5"/></svg>',
  info:          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2300B8D4"><circle cx="12" cy="12" r="10"/><path d="M12 8v2M12 12v6" stroke="white" stroke-width="2"/></svg>',
  photo:         'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23007CFF"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3" fill="white"/></svg>',
  general:       'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 12H3M12 3v18" stroke="%236B7280" stroke-width="2"/></svg>',
};

export default class NoteManager extends CesiumManager {
  private notes: MapNote[] = [];
  private active = false;
  private onAdded?: (note: MapNote) => void;

  constructor(viewer: any, onAdded?: (note: MapNote) => void) {
    super(viewer);
    this.onAdded = onAdded;
  }

  protected setup(handler: any) {
    handler.setInputAction((event: any) => {
      if (!this.active) return;
      const pos = this.pickPosition(event.position);
      if (pos) this.promptAndAdd(pos);
    }, window.Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  setMode(enabled: boolean) {
    this.active = enabled;
    this.setCursor(enabled ? 'help' : '');
  }

  private promptAndAdd(position: any) {
    // TODO: replace with a proper modal — window.prompt doesn't work on mobile
    const content = window.prompt('Note content:');
    if (!content) return;
    const title = window.prompt('Note title (optional):') || 'Map Note';
    const typeRaw = window.prompt('Type: accommodation / warning / info / photo / general') || 'general';
    const type = (['accommodation', 'warning', 'info', 'photo', 'general'].includes(typeRaw)
      ? typeRaw
      : 'general') as MapNote['type'];

    this.addNote(position, { content, title, type });
  }

  addNote(position: any, data: { content: string; title: string; type: MapNote['type'] }): MapNote {
    const cartographic = window.Cesium.Cartographic.fromCartesian(position);

    const note: MapNote = {
      id: this.generateId('note'),
      position,
      cartographic,
      content: data.content,
      type: data.type,
      title: data.title,
      timestamp: new Date(),
    };

    this.notes.push(note);
    note.entity = this.renderNote(note);
    this.onAdded?.(note);
    return note;
  }

  private renderNote(note: MapNote): any {
    const Cesium = window.Cesium;
    const lat = Cesium.Math.toDegrees(note.cartographic.latitude).toFixed(6);
    const lng = Cesium.Math.toDegrees(note.cartographic.longitude).toFixed(6);

    return this.viewer.entities.add({
      position: note.position,
      billboard: {
        image: NOTE_ICONS[note.type],
        scale: 0.6,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5),
      },
      label: {
        text: note.title,
        font: '11pt sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -60),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.0),
      },
      description: `<div><h4>${note.title}</h4><p>${note.content}</p><p>${lat}, ${lng}</p></div>`,
    });
  }

  getNotes(): MapNote[] {
    return [...this.notes];
  }

  deleteNote(id: string) {
    const idx = this.notes.findIndex(n => n.id === id);
    if (idx === -1) return;
    const note = this.notes[idx];
    if (note.entity) this.viewer.entities.remove(note.entity);
    this.notes.splice(idx, 1);
  }

  clearAll() {
    for (const note of this.notes) {
      if (note.entity) this.viewer.entities.remove(note.entity);
    }
    this.notes = [];
  }
}
