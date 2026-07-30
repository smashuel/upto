---
number: 017
title: Never use relative /api URLs — resolve an absolute origin for native
status: accepted
date: 2026-07-31
---

# ADR 017 — Never use relative `/api` URLs; resolve an absolute origin for native

## Context

The web app is served from Vercel, which proxies `/api/*` to the Linode backend. That makes
root-relative URLs like `/api/tiles/topo/{z}/{x}/{y}` work everywhere on the web, and they
have the real benefit of keeping API keys server-side.

Inside the Capacitor shell (ADR 011) there is no Vercel origin. The WebView serves the
bundle from `capacitor://localhost` (iOS) or `https://localhost` (Android), so a relative
`/api/...` resolves **into the bundled web assets** and 404s.

This has now shipped twice:

1. **2026-07-09** — `src/config/api.ts`: the REST client's production base URL was `''`
   (same-origin). Every backend call failed on native. Fixed with an `isNativePlatform()`
   branch to an absolute origin.
2. **2026-07-31** — `src/services/LinzMapService.ts`: the LINZ topo tile template. Failed
   *silently* — Cesium does not surface per-tile 404s, so the basemap state flipped to topo
   while no pixels arrived and satellite stayed visible underneath. It read as a broken
   layer toggle, and cost a full diagnosis cycle to trace back to networking.

The second failure is the dangerous shape: no error, no console noise, just wrong pixels.

## Decision

**No module may construct a backend URL from a relative path.** Any code that builds a URL
the backend must serve — REST call, tile template, SSE stream, image `src` — resolves its
origin through a native-aware helper.

- `isNativePlatform()` is exported from `src/config/api.ts` and is the single detector.
- Native resolves to `VITE_NATIVE_API_BASE_URL`, defaulting to `https://api.upto.world`.
- The resolution logic lives in a pure, testable module (e.g. `src/services/topoTileUrl.ts`),
  not inline at the call site, so the native branch is covered by tests that run in CI —
  where there is no WebView to catch it.

Backend endpoints consumed by native must send permissive CORS. The tile proxy already
returns `access-control-allow-origin: *`; `capacitor://localhost` and `https://localhost`
are in the backend allow-list.

## Alternatives considered

- **Capacitor `server.url` pointing at Vercel.** Turns the app into a remote-loading web
  view: loses offline capability and the whole point of bundling the assets. Rejected.
- **A `<base href>` or fetch interceptor rewriting `/api`.** Global, invisible, and would not
  catch a URL handed to Cesium (which loads tiles via `Image`, not `fetch`). Rejected.
- **Per-call-site conditionals.** What we did twice by accident. Untestable and repeatedly
  forgotten. Rejected in favour of extracted, tested resolvers.

## Consequences

- One more indirection between a call site and its URL, and a test file per resolver.
- Native builds depend on `api.upto.world` DNS/TLS staying healthy (verified 200 on
  `/api/health`, 2026-07-31). There is no same-origin fallback on native by design.
- New backend-served assets need a conscious origin decision. Treat any literal string
  starting `'/api'` in a diff as a review flag.

## Reconsider if

- Capacitor gains a first-class way to proxy a path prefix to a remote origin, making
  relative paths genuinely portable.
- The backend moves behind a CDN that also serves the app bundle, collapsing the origins.
