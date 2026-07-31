// Emblem and text helpers for map notes. Cesium-free so they're unit-testable.
//
// Notes are drawn as a map pin painted onto a canvas, not loaded from an image URL.
//
// The previous icons were SVG data URIs carrying only a `viewBox` — no `width`/`height` — so
// they had no intrinsic size. WebKit refuses to decode such an image, `decode()` rejected on
// iOS, and `renderNote` fell back to a bare floating label: the note appeared on the phone as
// text with no emblem. Painting the pin ourselves removes the entire failure path — no URI to
// parse, no network or decode step, nothing that can behave differently on one platform.

export const NOTE_TYPES = ['accommodation', 'warning', 'info', 'photo', 'general'] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

/**
 * Drawn at 2x and displayed at half scale, so the pin stays sharp on a retina screen without
 * relying on the billboard's own filtering.
 */
export const EMBLEM_WIDTH = 64;
export const EMBLEM_HEIGHT = 84;
/** Billboard scale that renders the 2x artwork at its intended on-screen size. */
export const EMBLEM_SCALE = 0.5;

export interface EmblemSpec {
  /** Pin body colour. */
  color: string;
  /** Human-readable name, used in the info box. */
  label: string;
}

const SPECS: Record<NoteType, EmblemSpec> = {
  accommodation: { color: '#007cff', label: 'Accommodation' },
  warning: { color: '#f97316', label: 'Warning' },
  info: { color: '#0891b2', label: 'Info' },
  photo: { color: '#8b5cf6', label: 'Photo' },
  general: { color: '#475569', label: 'General' },
};

/** Spec for a note type, falling back to `general` for anything unrecognised. */
export function emblemSpec(type: NoteType): EmblemSpec {
  return SPECS[type] ?? SPECS.general;
}

export function noteTypeLabel(type: NoteType): string {
  return emblemSpec(type).label;
}

/**
 * Escape user-supplied text for interpolation into HTML. Note titles and bodies are typed
 * by the user and rendered into the Cesium info box; unescaped, a stray `<` silently breaks
 * the markup and a crafted string injects into it.
 * Ampersand first, so the entities introduced below aren't re-escaped.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface NoteDescription {
  content: string;
  type: NoteType;
  lat: number;
  lng: number;
}

/**
 * Body of the Cesium info box — what someone opening a shared TripLink sees when they tap
 * a note.
 *
 * The title is deliberately absent: it is the entity's `name`, which Cesium renders as the
 * info-box header and assigns as text rather than markup. That means it must *not* be
 * escaped (escaping would display a literal `&amp;`) and must not be repeated here.
 */
export function noteDescriptionHtml(note: NoteDescription): string {
  const body = note.content.trim()
    ? `<p class="note-info-body">${escapeHtml(note.content)}</p>`
    : '';
  return [
    '<div class="note-info">',
    `<p class="note-info-type">${escapeHtml(noteTypeLabel(note.type))}</p>`,
    body,
    `<p class="note-info-coords">${note.lat.toFixed(6)}, ${note.lng.toFixed(6)}</p>`,
    '</div>',
  ].join('');
}

/**
 * Paint a map pin carrying a small note sheet.
 *
 * Deliberately built from primitives (arcs, rects) rather than text glyphs or an image: no
 * font has to be present, nothing has to load, and it renders identically everywhere.
 * Returns null outside a DOM (tests, SSR), where the caller renders without an emblem.
 */
export function drawNoteEmblem(type: NoteType): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = EMBLEM_WIDTH;
  canvas.height = EMBLEM_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { color } = emblemSpec(type);
  const cx = EMBLEM_WIDTH / 2;
  const cy = 30;
  const r = 26;

  // Pin, drawn twice: a white silhouette first, then the coloured body inset within it, which
  // gives a clean outline without stroking the union of two overlapping shapes.
  const pin = (radius: number, tipY: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.45, cy + radius * 0.78);
    ctx.lineTo(cx + radius * 0.45, cy + radius * 0.78);
    ctx.lineTo(cx, tipY);
    ctx.closePath();
    ctx.fill();
  };

  pin(r, EMBLEM_HEIGHT - 1, '#ffffff');
  pin(r - 3, EMBLEM_HEIGHT - 5, color);

  // Note sheet: a white page with three ruled lines.
  const w = 20;
  const h = 24;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i += 1) {
    ctx.fillRect(x + 4, y + 6 + i * 6, w - 8, 2);
  }

  return canvas;
}

// Emblems are identical for every note of a type, so paint each one once.
const emblems = new Map<NoteType, HTMLCanvasElement>();

/**
 * The emblem for a note type, painted on first use. Synchronous by design: the old
 * asynchronous decode meant a note could be added before its image was ready, and a failure
 * surfaced inside Cesium's render loop where no caller could catch it.
 */
export function noteEmblem(type: NoteType): HTMLCanvasElement | null {
  const key = type in SPECS ? type : 'general';
  const cached = emblems.get(key);
  if (cached) return cached;

  const drawn = drawNoteEmblem(key);
  if (drawn) emblems.set(key, drawn);
  return drawn;
}
