import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_OAUTH_RETURN_ORIGIN,
  oauthReturnOrigin,
  parseAuthDeepLink,
} from './oauthReturn.ts';

// ── The OAuth round trip in the native shell (2026-08-01) ────────────────────
//
// Google sign-in got all the way to the account picker on iOS and then died with "the
// application couldn't be opened". Cause: the app sent `window.location.origin` as its return
// address, which in the Capacitor WebView is `capacitor://localhost`. The OAuth flow runs in
// the SYSTEM BROWSER (Capacitor hands off any navigation outside the app's own origin), so the
// callback redirect asked Safari to open `capacitor://` — a scheme no app on the device
// registers. The token was minted correctly and had nowhere to go.
//
// These two functions are the halves of the fix: pick a return address the OS can actually
// route, and read the token back out of it.

test('the native return origin matches the backend allowlist exactly', () => {
  // Hard-coupled to `NATIVE_RETURN_ORIGIN` in oauth-origin.js. If they drift, the backend
  // refuses the app's origin and silently redirects sign-in to the website instead — which
  // looks like "Google login does nothing" on the phone. Pinned in both suites deliberately.
  assert.equal(NATIVE_OAUTH_RETURN_ORIGIN, 'world.upto.app://app');
});

test('native platforms return to the app scheme, not the WebView origin', () => {
  assert.equal(oauthReturnOrigin('ios', 'capacitor://localhost'), 'world.upto.app://app');
  assert.equal(oauthReturnOrigin('android', 'https://localhost'), 'world.upto.app://app');
});

test('the web returns to its own origin', () => {
  assert.equal(oauthReturnOrigin('web', 'https://upto.world'), 'https://upto.world');
  assert.equal(oauthReturnOrigin('web', 'http://localhost:5173'), 'http://localhost:5173');
});

// ── parseAuthDeepLink ────────────────────────────────────────────────────────

test('a session deep link yields the token', () => {
  assert.deepEqual(
    parseAuthDeepLink('world.upto.app://app/login?session=tok-123'),
    { session: 'tok-123' },
  );
});

test('an error deep link yields the error', () => {
  assert.deepEqual(
    parseAuthDeepLink('world.upto.app://app/login?error=google_cancelled'),
    { error: 'google_cancelled' },
  );
});

test('an encoded token is decoded', () => {
  assert.deepEqual(
    parseAuthDeepLink('world.upto.app://app/login?session=a%2Bb%3Dc'),
    { session: 'a+b=c' },
  );
});

test('a non-auth deep link is ignored', () => {
  // The app may later use this scheme for share links; only /login carries a session.
  assert.equal(parseAuthDeepLink('world.upto.app://app/trip/abc123'), null);
});

test('a login link carrying neither session nor error is ignored', () => {
  assert.equal(parseAuthDeepLink('world.upto.app://app/login'), null);
});

test('a foreign scheme is ignored', () => {
  // Another app can ask iOS to open a URL. Only our own scheme may deliver a session.
  assert.equal(parseAuthDeepLink('https://evil.example/login?session=tok'), null);
  assert.equal(parseAuthDeepLink('otherapp://app/login?session=tok'), null);
});

test('an empty session value is ignored rather than treated as a token', () => {
  assert.equal(parseAuthDeepLink('world.upto.app://app/login?session='), null);
});

test('malformed input is ignored, not thrown', () => {
  // This runs inside an OS callback; throwing here would surface as an app crash on launch.
  assert.equal(parseAuthDeepLink('not a url'), null);
  assert.equal(parseAuthDeepLink(''), null);
  assert.equal(parseAuthDeepLink(undefined), null);
});
