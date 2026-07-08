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
// The web source needs a geolocation-capable environment; native isn't built until Slice 2.

test('createPositionSource: native-background is not implemented until Slice 2 (throws)', () => {
  assert.throws(
    () => createPositionSource('native-background', { intervalMs: 1000 }),
    /native-background/,
  );
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
