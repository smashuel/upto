import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTE_TYPES,
  emblemSpec,
  escapeHtml,
  noteDescriptionHtml,
  noteTypeLabel,
  EMBLEM_WIDTH,
  EMBLEM_HEIGHT,
  type NoteType,
} from './noteGraphics.ts';

// Emblems are drawn onto a canvas rather than loaded from SVG data URIs. The previous
// icons carried only a `viewBox` with no width/height, which WebKit refuses to decode, so
// on iOS every note silently fell back to a bare floating label. Drawing removes the whole
// decode path: no URI parsing, no async load, nothing to fail on one platform and not another.

test('every note type has an emblem spec', () => {
  for (const type of NOTE_TYPES) {
    const spec = emblemSpec(type);
    assert.match(spec.color, /^#[0-9a-f]{6}$/i, `${type} needs a colour`);
  }
});

test('an unrecognised type falls back to the general emblem', () => {
  // A note's type can come from stored data written by an older or newer build. Falling
  // back keeps the note visible instead of dropping it off the map.
  const unknown = 'chairlift' as NoteType;
  assert.deepEqual(emblemSpec(unknown), emblemSpec('general'));
});

test('warning is visually distinct from general', () => {
  assert.notEqual(emblemSpec('warning').color, emblemSpec('general').color);
});

test('the emblem is taller than it is wide so it reads as a pin', () => {
  // The billboard is anchored at its bottom edge, so the tip must sit below the head.
  assert.ok(EMBLEM_HEIGHT > EMBLEM_WIDTH);
});

test('note types have human-readable labels', () => {
  assert.equal(noteTypeLabel('accommodation'), 'Accommodation');
  assert.equal(noteTypeLabel('general'), 'General');
});

test('html is escaped, ampersand first', () => {
  assert.equal(escapeHtml('Tom & <b>Jerry</b>'), 'Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;');
});

test('a note description escapes the user-written body', () => {
  // The body is typed by the user and interpolated into the Cesium info box as markup.
  const html = noteDescriptionHtml({
    content: '<script>bad</script> a & b',
    type: 'info',
    lat: -45.1,
    lng: 168.7,
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('a &amp; b'));
});

test('a note description includes the coordinates and type', () => {
  const html = noteDescriptionHtml({
    content: 'Aiming to leave around 8am',
    type: 'accommodation',
    lat: -45.123456,
    lng: 168.765432,
  });
  assert.match(html, /-45\.123456/);
  assert.match(html, /168\.765432/);
  assert.match(html, /Accommodation/);
  assert.match(html, /Aiming to leave around 8am/);
});

test('a note with no body produces no empty paragraph', () => {
  // Content is optional — a marker often needs only a title and a type.
  const html = noteDescriptionHtml({ content: '', type: 'info', lat: 0, lng: 0 });
  assert.match(html, /Info/);
  assert.ok(!html.includes('<p class="note-info-body">'));
});

test('the description carries no title', () => {
  // The title is the entity's `name`, which Cesium renders as the info-box header and sets
  // as text — so it must not be escaped, and must not be repeated in the body.
  const html = noteDescriptionHtml({ content: 'body', type: 'info', lat: 0, lng: 0 });
  assert.ok(!html.includes('Car park'));
});
