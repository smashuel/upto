// The OAuth round trip in the native shell.
//
// Google sign-in reached the account picker on iOS and then failed with "the application
// couldn't be opened". The app was sending `window.location.origin` as its return address,
// which inside the Capacitor WebView is `capacitor://localhost`. Capacitor hands any navigation
// outside the app's own origin to the SYSTEM BROWSER, so the whole OAuth flow happened in
// Safari — and the callback then asked Safari to open `capacitor://`, a scheme no app on the
// device registers. The session token was minted correctly and had nowhere to go.
//
// The fix is a real, registered custom scheme (`CFBundleURLTypes` in ios/App/App/Info.plist)
// that iOS can route back into the app, plus a listener for it (see useAuthDeepLink).

import type { Platform } from './positionSource.ts';

/**
 * Where the backend should send the browser after Google sign-in, when we are the native app.
 *
 * **Must stay identical to `NATIVE_RETURN_ORIGIN` in `oauth-origin.js`** (the backend's
 * allowlist) and to the scheme registered in `ios/App/App/Info.plist`. If these drift the
 * backend refuses the app's origin and quietly redirects sign-in to the website instead, which
 * on the phone looks like "the Google button does nothing". Both test suites pin the literal.
 */
export const NATIVE_OAUTH_RETURN_ORIGIN = 'world.upto.app://app';

/** Path the backend appends the session/error to. */
const AUTH_PATH = '/login';

/**
 * Pure: the return address to hand the backend for this platform.
 *
 * The web keeps using its own origin — one deployment can be `upto.world`, another a preview or
 * localhost, and each must come back to itself.
 */
export function oauthReturnOrigin(platform: Platform, webOrigin: string): string {
  return platform === 'web' ? webOrigin : NATIVE_OAUTH_RETURN_ORIGIN;
}

export interface AuthDeepLink {
  session?: string;
  error?: string;
}

/**
 * Pure: read a session (or an error) out of a deep link the OS handed us, or `null` if this
 * URL is not an auth callback.
 *
 * Only our own scheme is accepted. Any app can ask iOS to open a URL, and this one carries a
 * session token straight into an authenticated state — so the scheme check is the gate, not a
 * formality. Never throws: it runs inside an OS callback, where an exception surfaces as a
 * crash on launch.
 */
export function parseAuthDeepLink(url: string | undefined | null): AuthDeepLink | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'world.upto.app:') return null;
  if (parsed.pathname !== AUTH_PATH) return null;

  const session = parsed.searchParams.get('session');
  if (session) return { session };

  const error = parsed.searchParams.get('error');
  if (error) return { error };

  return null;
}
