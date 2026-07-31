/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Cesium from 'cesium';
import { CesiumManager } from './CesiumManager';
import {
  decodedNoteIcon,
  preloadNoteIcons,
  escapeHtml,
  type NoteType,
} from './noteGraphics';

export interface MapNote {
  id: string;
  position: any;
  cartographic: any;
  entity?: any;
  content: string;
  type: NoteType;
  title: string;
  timestamp: Date;
}

export type NoteRequestCallback = (
  position: any,
  /** Returns the placed note, or null if it could not be placed (never throws). */
  onSubmit: (data: { content: string; title: string; type: NoteType }) => MapNote | null,
) => void;

export default class NoteManager extends CesiumManager {
  private notes: MapNote[] = [];
  private active = false;
  private onAdded?: (note: MapNote) => void;
  private onRequestNote?: NoteRequestCallback;

  constructor(
    viewer: any,
    onAdded?: (note: MapNote) => void,
    onRequestNote?: NoteRequestCallback,
  ) {
    super(viewer);
    this.onAdded = onAdded;
    this.onRequestNote = onRequestNote;
    // Decode icons now, so the first note placed already has a proven-good image.
    preloadNoteIcons();
  }

  protected setup(handler: any) {
    handler.setInputAction((event: any) => {
      if (!this.active) return;
      const pos = this.pickPosition(event.position);
      if (!pos) return;

      if (!this.onRequestNote) {
        // No UI to collect the note text. There used to be a window.prompt() fallback here,
        // but WKWebView suspends/blocks prompt() in ways a desktop browser doesn't, so it
        // was a hang-or-crash on the very platform it would have been reached from.
        console.error('NoteManager: no note-input handler provided; ignoring note click');
        return;
      }
      this.onRequestNote(pos, (data) => this.addNote(pos, data));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  setMode(enabled: boolean) {
    this.active = enabled;
    this.setCursor(enabled ? 'help' : '');
  }

  /**
   * Add a note at a picked position. Returns null instead of throwing if the note can't be
   * placed — a failure here used to propagate out through the React submit handler and tear
   * down the whole trip-planning wizard, losing the user's in-progress route.
   */
  addNote(
    position: any,
    data: { content: string; title: string; type: NoteType },
  ): MapNote | null {
    // fromCartesian returns undefined for a degenerate cartesian (e.g. a pick that landed at
    // the ellipsoid centre). Reading .latitude off it later is a crash, so bail early.
    const cartographic = position ? Cesium.Cartographic.fromCartesian(position) : undefined;
    if (!cartographic) {
      console.error('NoteManager: could not resolve a position for this note', position);
      return null;
    }

    const note: MapNote = {
      id: this.generateId('note'),
      position,
      cartographic,
      content: data.content,
      type: data.type,
      title: data.title,
      timestamp: new Date(),
    };

    try {
      note.entity = this.renderNote(note);
    } catch (err) {
      // Rendering is the risky half (billboard image decode, entity construction). Keep the
      // map and the trip alive; the note simply doesn't get placed.
      console.error('NoteManager: failed to render note', err);
      return null;
    }

    this.notes.push(note);
    this.onAdded?.(note);
    this.requestRender();
    return note;
  }

  private renderNote(note: MapNote): any {
    const lat = Cesium.Math.toDegrees(note.cartographic.latitude).toFixed(6);
    const lng = Cesium.Math.toDegrees(note.cartographic.longitude).toFixed(6);

    // Only ever hand Cesium an image that has already decoded successfully. Passing a URL
    // makes Cesium decode it inside the render loop, where a failure throws somewhere no
    // try/catch here can reach. If no icon decoded, the note still renders — label only.
    const icon = decodedNoteIcon(note.type);

    return this.viewer.entities.add({
      position: note.position,
      ...(icon
        ? {
            billboard: {
              image: icon,
              scale: 0.6,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5),
            },
          }
        : {}),
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
      // Title and content are user input — escape before interpolating into markup.
      description: `<div><h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.content)}</p><p>${lat}, ${lng}</p></div>`,
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
