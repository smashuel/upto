import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveBasemap,
  suggestBasemap,
  regionalTopo,
  choiceFromStored,
  choiceFromLayer,
} from './BasemapSuggest.ts';

// Representative coordinates.
const AORAKI = { lat: -43.595, lng: 170.142 }; // NZ — LINZ Topo50 coverage
const BLUE_MOUNTAINS = { lat: -33.7, lng: 150.3 }; // NSW — both NSW and AU coverage
const ULURU = { lat: -25.345, lng: 131.036 }; // AU, outside NSW
const CHAMONIX = { lat: 45.923, lng: 6.869 }; // no topo coverage at all

test('regional topo resolves the most specific product for a location', () => {
  assert.equal(regionalTopo(AORAKI.lat, AORAKI.lng), 'topo-linz');
  assert.equal(regionalTopo(BLUE_MOUNTAINS.lat, BLUE_MOUNTAINS.lng), 'topo-nsw');
  assert.equal(regionalTopo(ULURU.lat, ULURU.lng), 'topo-ga');
});

test('regional topo is null where no topo product covers the map', () => {
  assert.equal(regionalTopo(CHAMONIX.lat, CHAMONIX.lng), null);
});

// The point of the whole change: the user picks "Topo", not a country or a product.
test('choosing Topo yields the right regional product without the user naming it', () => {
  assert.equal(resolveBasemap(AORAKI.lat, AORAKI.lng, 'topo'), 'topo-linz');
  assert.equal(resolveBasemap(BLUE_MOUNTAINS.lat, BLUE_MOUNTAINS.lng, 'topo'), 'topo-nsw');
  assert.equal(resolveBasemap(ULURU.lat, ULURU.lng, 'topo'), 'topo-ga');
});

test('Topo falls back to satellite where no topo exists, without losing the choice', () => {
  assert.equal(resolveBasemap(CHAMONIX.lat, CHAMONIX.lng, 'topo'), 'satellite');
  // Panning back into coverage resumes topo — the choice is durable, not cleared.
  assert.equal(resolveBasemap(AORAKI.lat, AORAKI.lng, 'topo'), 'topo-linz');
});

test('choosing Satellite is honoured everywhere, including inside topo coverage', () => {
  assert.equal(resolveBasemap(AORAKI.lat, AORAKI.lng, 'satellite'), 'satellite');
  assert.equal(resolveBasemap(BLUE_MOUNTAINS.lat, BLUE_MOUNTAINS.lng, 'satellite'), 'satellite');
  assert.equal(resolveBasemap(CHAMONIX.lat, CHAMONIX.lng, 'satellite'), 'satellite');
});

test('with no choice yet, topo is suggested where it exists and satellite elsewhere', () => {
  assert.equal(resolveBasemap(AORAKI.lat, AORAKI.lng, null), 'topo-linz');
  assert.equal(resolveBasemap(CHAMONIX.lat, CHAMONIX.lng, null), 'satellite');
  assert.equal(suggestBasemap(ULURU.lat, ULURU.lng), 'topo-ga');
});

// Back-compat: the old four-way override was persisted to localStorage by product name.
test('stored per-product overrides migrate to the Topo choice', () => {
  for (const stored of ['topo-linz', 'topo-ga', 'topo-nsw', 'topo']) {
    assert.equal(choiceFromStored(stored), 'topo', `${stored} should migrate to topo`);
  }
});

test('stored satellite and unrecognised values are handled', () => {
  assert.equal(choiceFromStored('satellite'), 'satellite');
  assert.equal(choiceFromStored(null), null);
  assert.equal(choiceFromStored('nonsense'), null);
  assert.equal(choiceFromStored(''), null);
});

// A TripLink persists the concrete rendered layer, so reopening one must map back to a choice.
test('a persisted rendered layer maps back to the choice that produced it', () => {
  assert.equal(choiceFromLayer('topo-linz'), 'topo');
  assert.equal(choiceFromLayer('topo-nsw'), 'topo');
  assert.equal(choiceFromLayer('satellite'), 'satellite');
});

test('a trip planned on NZ topo reopens as topo when viewed in Australia', () => {
  // Not topo-linz — the choice survives, the product follows the viewport.
  const choice = choiceFromLayer('topo-linz');
  assert.equal(resolveBasemap(ULURU.lat, ULURU.lng, choice), 'topo-ga');
});
