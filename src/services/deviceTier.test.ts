import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyDeviceTier } from './deviceTier.ts';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

test('desktop is always high tier', () => {
  assert.equal(classifyDeviceTier({ userAgent: DESKTOP_UA, cores: 8 }), 'high');
});

// The defect: iOS Safari DOES report hardwareConcurrency, and reports 4 on iPhones
// (including current flagships). A bare `cores <= 4` rule therefore demotes every
// iPhone to `low` — resolutionScale 0.75 + SSE 2.0 — which is what makes the
// satellite imagery look pixelated on a high-DPI phone.
test('a current iPhone reporting 4 cores is not treated as low-end', () => {
  assert.equal(classifyDeviceTier({ userAgent: IPHONE_UA, cores: 4 }), 'mid');
});

test('iOS never reports deviceMemory, and its absence must not imply low-end', () => {
  assert.equal(
    classifyDeviceTier({ userAgent: IPHONE_UA, cores: 4, deviceMemory: undefined }),
    'mid',
  );
});

test('a genuinely weak Android with little memory is low tier', () => {
  assert.equal(classifyDeviceTier({ userAgent: ANDROID_UA, cores: 8, deviceMemory: 2 }), 'low');
});

test('a genuinely weak Android with few cores is low tier', () => {
  assert.equal(classifyDeviceTier({ userAgent: ANDROID_UA, cores: 2 }), 'low');
});

test('a capable Android is mid tier', () => {
  assert.equal(classifyDeviceTier({ userAgent: ANDROID_UA, cores: 8, deviceMemory: 8 }), 'mid');
});

test('an unknown environment degrades to high rather than crippling desktop quality', () => {
  assert.equal(classifyDeviceTier({ userAgent: '', cores: 0 }), 'high');
});

test('iPad is classified as mobile even though its UA can omit iPhone', () => {
  const IPAD_UA =
    'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  assert.equal(classifyDeviceTier({ userAgent: IPAD_UA, cores: 4 }), 'mid');
});
