import test from 'node:test';
import assert from 'node:assert/strict';

import {
  svgDataUri,
  escapeHtml,
  noteIcon,
  NOTE_ICONS,
  NOTE_TYPES,
  type NoteType,
} from './noteGraphics.ts';

// Characters RFC 3986 excludes from a URI. WebKit is stricter than Chrome about SVG data
// URIs, so an icon that loads on a desktop browser can fail to decode in iOS WKWebView —
// and a billboard whose image never loads takes Cesium's render loop down with it.
const ILLEGAL_IN_URI = /[<>"\s{}|\\^`]/;

test('an encoded SVG data URI contains no characters that are illegal in a URI', () => {
  const uri = svgDataUri('<svg viewBox="0 0 24 24"><rect x="3" y="9"/></svg>');
  assert.ok(!ILLEGAL_IN_URI.test(uri), `found illegal character in ${uri}`);
});

test('the data URI declares a real charset parameter, not the bare ";utf8"', () => {
  const uri = svgDataUri('<svg/>');
  assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'), uri);
  assert.ok(!uri.includes(';utf8,'), '";utf8" is not a valid media-type parameter');
});

test('the encoded SVG decodes back to exactly the original markup', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" fill="#007CFF"><path d="M12 2L22 20H2z"/></svg>';
  const uri = svgDataUri(svg);
  const decoded = decodeURIComponent(uri.slice(uri.indexOf(',') + 1));
  assert.equal(decoded, svg);
});

test('a hash in a fill colour survives encoding — unescaped it truncates the URI at the fragment', () => {
  const uri = svgDataUri('<svg fill="#6B7280"/>');
  assert.ok(!uri.includes('#'), 'a raw # starts a fragment and drops the rest of the SVG');
  assert.ok(decodeURIComponent(uri.slice(uri.indexOf(',') + 1)).includes('#6B7280'));
});

test('every shipped note icon is a safely-encoded data URI', () => {
  for (const type of NOTE_TYPES) {
    const uri = NOTE_ICONS[type];
    assert.ok(uri, `${type} has no icon`);
    assert.ok(!ILLEGAL_IN_URI.test(uri), `${type} icon contains an illegal URI character`);
    assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'), `${type} icon has a bad prefix`);
  }
});

test('an unrecognised note type still yields an icon rather than undefined', () => {
  // A billboard handed image: undefined is a render-loop failure, and note type could come
  // from older stored data or a future type this build doesn't know about.
  assert.equal(noteIcon('not-a-real-type' as NoteType), NOTE_ICONS.general);
  assert.equal(noteIcon(undefined as unknown as NoteType), NOTE_ICONS.general);
});

test('a known note type resolves to its own icon', () => {
  assert.equal(noteIcon('warning'), NOTE_ICONS.warning);
});

// Note titles and bodies are user input rendered into the Cesium info-box description.
test('user text is escaped before going into the description HTML', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Ridge & "gully"'), 'Ridge &amp; &quot;gully&quot;');
  assert.equal(escapeHtml("it's steep"), 'it&#39;s steep');
});

test('escaping ampersands first does not double-escape the entities it creates', () => {
  assert.equal(escapeHtml('a & <b>'), 'a &amp; &lt;b&gt;');
});

test('escaping leaves ordinary text untouched', () => {
  assert.equal(escapeHtml('Flat sheltered camp spot, 3 tents'), 'Flat sheltered camp spot, 3 tents');
});
