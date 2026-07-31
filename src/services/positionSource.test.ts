import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPositionSource, createPositionSource } from './positionSource.ts';

// ── selectPositionSource: the pure platform → source-kind branch (Stage 2 Slice 1) ──
// Pins which source a platform uses. Only 'web-foreground' is implemented in Slice 1;
// 'native-background' is wired in Slice 2 — but the branch is decided (and tested) here.

test('selectPositionSource: web → web-foreground', () => {
  assert.equal(selectPositionSource('web'), 'web-foreground');
});

test('selectPositionSource: iOS → native-background', () => {
  assert.equal(selectPositionSource('ios'), 'native-background');
});

test('selectPositionSource: Android → native-background', () => {
  assert.equal(selectPositionSource('android'), 'native-background');
});

// ── createPositionSource: factory guards (the instantiation branch) ──
// The web source needs a geolocation-capable environment; native is real as of Slice 2.

test('createPositionSource: native-background returns a startable source (Slice 2)', () => {
  // Slice 1 asserted this branch THREW. It no longer does — that guard existed so a native
  // build reaching here failed loudly instead of going dark, and it has served its purpose.
  // Constructing it must not touch the plugin (registration happens on start), so this is safe
  // to build off-device; the source's own behaviour is covered in
  // nativeBackgroundPositionSource.test.ts against a fake plugin.
  const source = createPositionSource('native-background', { intervalMs: 1000 });
  assert.ok(source, 'a native source is returned');
  assert.equal(typeof source.start, 'function');
  assert.equal(typeof source.stop, 'function');
});

test('createPositionSource: web-foreground returns null when geolocation is unavailable', () => {
  // Node's `navigator` exists but has no `geolocation` — the exact "unsupported environment"
  // branch (SSR / old browser) the factory guards against, tested without mutating the global.
  assert.ok(!('geolocation' in navigator), 'precondition: bare navigator has no geolocation');
  assert.equal(createPositionSource('web-foreground', { intervalMs: 1000 }), null);
});

test('createPositionSource: web-foreground returns a startable source when geolocation exists', () => {
  // Attach only `geolocation` to the existing navigator (it's a read-only global; the prop is
  // configurable), then remove it so other tests still see a bare navigator.
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition() {} },
    configurable: true,
  });
  try {
    const source = createPositionSource('web-foreground', { intervalMs: 1000 });
    assert.ok(source);
    assert.equal(typeof source!.start, 'function');
    assert.equal(typeof source!.stop, 'function');
  } finally {
    delete (navigator as { geolocation?: unknown }).geolocation;
  }
});
