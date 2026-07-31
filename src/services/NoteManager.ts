/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Cesium from 'cesium';
import { CesiumManager } from './CesiumManager';
import {
  noteEmblem,
  noteDescriptionHtml,
  emblemSpec,
  EMBLEM_SCALE,
  type NoteType,
} from './noteGraphics';

/** A note as persisted on a TripLink — plain data, no Cesium objects. */
export interface SerializableNote {
  id: string;
  title: string;
  content: string;
  type: NoteType;
  lat: number;
  lng: number;
}

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
  // Emits plain data, never a MapNote: those carry live Cesium objects, and handing one to
  // React form state puts an unserialisable (and cyclic) value on the path to the TripLink.
  private onAdded?: (note: SerializableNote) => void;
  private onRequestNote?: NoteRequestCallback;

  constructor(
    viewer: any,
    onAdded?: (note: SerializableNote) => void,
    onRequestNote?: NoteRequestCallback,
  ) {
    super(viewer);
    this.onAdded = onAdded;
    this.onRequestNote = onRequestNote;
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
      // Stored at zero height, not at the picked height. A pick on terrain returns a
      // cartesian well above the ellipsoid, and an entity floating at that altitude shifts
      // laterally against the ground as the camera zooms — which is exactly the "the label
      // moves around the map" symptom. Anchoring at zero and clamping to ground below pins
      // it to the coordinate instead.
      position: Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        0,
      ),
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
    this.onAdded?.(this.serialize(note));
    this.requestRender();
    return note;
  }

  private serialize(note: MapNote): SerializableNote {
    return {
      id: note.id,
      title: note.title,
      content: note.content,
      type: note.type,
      lat: Cesium.Math.toDegrees(note.cartographic.latitude),
      lng: Cesium.Math.toDegrees(note.cartographic.longitude),
    };
  }

  private renderNote(note: MapNote): any {
    const lat = Cesium.Math.toDegrees(note.cartographic.latitude);
    const lng = Cesium.Math.toDegrees(note.cartographic.longitude);

    // Painted synchronously onto a canvas — no URL, no decode step, nothing that can fail
    // asynchronously inside Cesium's render loop. Null only outside a DOM.
    const emblem = noteEmblem(note.type);

    return this.viewer.entities.add({
      position: note.position,
      // Cesium renders `name` as the info-box header, assigned as text rather than markup,
      // so the title must be passed raw here — escaping it would show a literal entity.
      name: note.title,
      description: noteDescriptionHtml({ content: note.content, type: note.type, lat, lng }),
      ...(emblem
        ? {
            billboard: {
              image: emblem,
              scale: EMBLEM_SCALE,
              // Bottom origin puts the pin's tip on the coordinate; clamping keeps it on
              // the ground however the terrain under it loads or the camera moves.
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              // Constant on-screen size. `scaleByDistance` made the pin drift and shrink
              // while zooming, which read as the note not being fixed to its location.
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }
        : {
            // No canvas available to paint on. A point needs no image and cannot fail, so
            // the note stays visible and tappable — an entity with no graphics at all would
            // be silently missing from the map, which is worse than a plain dot.
            point: {
              pixelSize: 14,
              color: Cesium.Color.fromCssColorString(emblemSpec(note.type).color),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
    });
  }

  /** Notes as plain data for persistence on a TripLink. */
  getSerializableNotes(): SerializableNote[] {
    return this.notes.map((n) => this.serialize(n));
  }

  /**
   * Render notes loaded from a saved TripLink. Replaces whatever is currently shown, so a
   * re-render of the map doesn't stack duplicates on top of each other.
   */
  loadNotes(notes: SerializableNote[]): void {
    this.clearAll();
    for (const saved of notes) {
      const position = Cesium.Cartesian3.fromDegrees(saved.lng, saved.lat, 0);
      const note: MapNote = {
        id: saved.id,
        position,
        cartographic: Cesium.Cartographic.fromCartesian(position),
        content: saved.content,
        type: saved.type,
        title: saved.title,
        timestamp: new Date(),
      };
      try {
        note.entity = this.renderNote(note);
        this.notes.push(note);
      } catch (err) {
        // One bad saved note must not stop the rest of the trip rendering.
        console.error('NoteManager: failed to render saved note', saved.id, err);
      }
    }
    this.requestRender();
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
