// Icon and text helpers for map notes. Cesium-free so they're unit-testable.
//
// The icons were previously inline `data:image/svg+xml;utf8,<svg ...>` strings carrying raw
// `<`, `>`, `"` and space characters, all of which RFC 3986 excludes from a URI, plus a
// `;utf8` media-type parameter that isn't valid (the parameter is `charset`). Desktop
// browsers are lenient about both; WebKit is stricter, so an icon that renders fine in
// development can fail to decode in an iOS WKWebView — and a Cesium billboard whose image
// fails to load raises inside the render loop rather than degrading quietly.

export const NOTE_TYPES = ['accommodation', 'warning', 'info', 'photo', 'general'] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

/** Percent-encode SVG markup into a data URI that survives a strict URI parser. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Escape user-supplied text for interpolation into HTML. Note titles and bodies are typed
 * by the user and rendered into the Cesium info-box description; unescaped, a stray `<`
 * silently breaks the markup and a crafted string injects into it.
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

const SVG: Record<NoteType, string> = {
  accommodation:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#007CFF"><rect x="3" y="9" width="18" height="12" rx="1"/><path d="M1 9h22M9 9V5h6v4"/></svg>',
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF6B00"><path d="M12 2L22 20H2z"/><path d="M12 9v4M12 16v2" stroke="white" stroke-width="1.5"/></svg>',
  info:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#00B8D4"><circle cx="12" cy="12" r="10"/><path d="M12 8v2M12 12v6" stroke="white" stroke-width="2"/></svg>',
  photo:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#007CFF"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3" fill="white"/></svg>',
  general:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 12H3M12 3v18" stroke="#6B7280" stroke-width="2"/></svg>',
};

export const NOTE_ICONS: Record<NoteType, string> = Object.fromEntries(
  NOTE_TYPES.map((t) => [t, svgDataUri(SVG[t])]),
) as Record<NoteType, string>;

/**
 * Icon for a note type, falling back to `general` for anything unrecognised. A note's type
 * can come from stored data written by an older or newer build, and handing Cesium a
 * billboard with `image: undefined` fails inside the render loop rather than degrading.
 */
export function noteIcon(type: NoteType): string {
  return NOTE_ICONS[type] ?? NOTE_ICONS.general;
}

// Decoded icon cache.
//
// Handing Cesium a URL string makes *Cesium* responsible for fetching and decoding it, and it
// does that asynchronously inside the render loop — so a decode failure surfaces as an
// exception in `scene.render()`, which no try/catch around `entities.add()` can ever catch.
// (WKWebView is stricter about SVG data URIs than desktop browsers, so this is a real risk on
// the phone and not on a dev machine.) Decoding up front instead moves the failure somewhere
// catchable: a note either gets an icon that is already proven to render, or it gets no
// billboard at all — never a pending decode that can take the map down later.
const decodedIcons = new Map<NoteType, HTMLImageElement>();

async function decodeIcon(type: NoteType): Promise<void> {
  if (typeof Image === 'undefined') return; // non-DOM (tests, SSR)
  try {
    const img = new Image();
    img.src = noteIcon(type);
    await img.decode();
    decodedIcons.set(type, img);
  } catch (err) {
    console.error(`noteGraphics: icon for "${type}" failed to decode`, err);
  }
}

/** Kick off icon decoding. Safe to call repeatedly; each type is only decoded once. */
export function preloadNoteIcons(): void {
  for (const type of NOTE_TYPES) {
    if (!decodedIcons.has(type)) void decodeIcon(type);
  }
}

/**
 * A decoded, known-good image for this note type, or null if it isn't available. Null means
 * "render the note without a billboard" — never "hand Cesium something that might fail".
 */
export function decodedNoteIcon(type: NoteType): HTMLImageElement | null {
  return decodedIcons.get(type) ?? decodedIcons.get('general') ?? null;
}
