import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTopoTileUrl } from './topoTileUrl.ts';

// The bug this seam exists for: in the Capacitor WebView the document origin is
// capacitor://localhost (iOS) or https://localhost (Android), so a root-relative
// '/api/...' tile template resolves INTO THE APP BUNDLE and 404s every tile. The
// basemap state flips but no pixels ever arrive — the map looks stuck on satellite.

test('web production uses the same-origin proxy so the LINZ key stays server-side', () => {
  const url = resolveTopoTileUrl({ isDev: false, isNative: false });
  assert.equal(url, '/api/tiles/topo/{z}/{x}/{y}');
});

test('native production targets an absolute backend origin, never a relative path', () => {
  const url = resolveTopoTileUrl({
    isDev: false,
    isNative: true,
    nativeApiBaseUrl: 'https://api.upto.world',
  });
  assert.equal(url, 'https://api.upto.world/api/tiles/topo/{z}/{x}/{y}');
});

test('native falls back to the default backend origin when no override is configured', () => {
  const url = resolveTopoTileUrl({ isDev: false, isNative: true });
  assert.ok(url, 'native must always resolve a topo URL');
  assert.ok(
    !url!.startsWith('/'),
    `native tile URL must be absolute, got ${url}`,
  );
});

test('dev prefers a direct LINZ key when one is present', () => {
  const url = resolveTopoTileUrl({ isDev: true, isNative: false, devLinzKey: 'abc123' });
  assert.equal(
    url,
    'https://data.linz.govt.nz/services;key=abc123/tiles/v4/layer=767/EPSG:3857/{z}/{x}/{y}.png',
  );
});

test('dev ignores the placeholder key and proxies through the dev backend instead', () => {
  const url = resolveTopoTileUrl({
    isDev: true,
    isNative: false,
    devLinzKey: 'your_linz_lds_api_key_here',
    devApiUrl: 'http://localhost:3001',
  });
  assert.equal(url, 'http://localhost:3001/api/tiles/topo/{z}/{x}/{y}');
});

test('dev with no key and no backend URL disables topo rather than emitting a broken template', () => {
  assert.equal(resolveTopoTileUrl({ isDev: true, isNative: false }), null);
});

test('a native dev build still targets the backend, not the WebView origin', () => {
  // `npx cap run` against a dev server is still a native WebView — the relative
  // path is just as broken there, so native must win over the dev branch.
  const url = resolveTopoTileUrl({
    isDev: true,
    isNative: true,
    devApiUrl: 'http://192.168.1.5:3001',
  });
  assert.equal(url, 'http://192.168.1.5:3001/api/tiles/topo/{z}/{x}/{y}');
});

test('trailing slashes on the backend origin do not produce a doubled path separator', () => {
  const url = resolveTopoTileUrl({
    isDev: false,
    isNative: true,
    nativeApiBaseUrl: 'https://api.upto.world/',
  });
  assert.equal(url, 'https://api.upto.world/api/tiles/topo/{z}/{x}/{y}');
});
