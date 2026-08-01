// OAuth return-URL allowlist — a security boundary, not a formatting helper.
//
// The Google callback appends a freshly minted SESSION TOKEN to the URL this produces. Before
// this module existed, the return origin was taken straight off `?origin=` and interpolated
// unchecked, so anyone could send a victim
//
//     https://api.upto.world/api/auth/google?origin=https://evil.example
//
// and, after that person completed a perfectly genuine Google consent screen on our own domain,
// their session token was delivered to the attacker's server. That is account takeover from one
// link. Everything here exists to make the set of possible destinations closed and small.
//
// Pure so it can be unit-tested off the network (see oauth-origin.test.js), matching the
// live-privacy.js pattern.

/** Where a request goes when it asks for anywhere we don't recognise. */
export const DEFAULT_RETURN_ORIGIN = 'https://upto.world';

/**
 * The iOS/Android app's custom URL scheme, registered in `ios/App/App/Info.plist`
 * (`CFBundleURLTypes`). The WebView's own origin (`capacitor://localhost`) deliberately is NOT
 * allowlisted: the OAuth flow runs in the system browser, and no app on the device registers
 * `capacitor://`, so redirecting there strands the token on an error page. That was the
 * "the application couldn't be opened" bug.
 */
export const NATIVE_RETURN_ORIGIN = 'world.upto.app://app';

/**
 * Exact-match allowlist. Deliberately not normalised, not pattern-matched, not suffix-checked:
 * every open-redirect bug of this shape comes from a clever comparison, so there isn't one.
 * A trailing slash or a different scheme is simply a different string and is refused.
 *
 * Consequence worth knowing: Vercel *preview* deployments get a fresh hostname each time and
 * are therefore not on this list, so Google sign-in falls back to production there. That is the
 * intended trade — a wildcard for `*.vercel.app` would let anyone who can publish a Vercel site
 * collect our users' sessions.
 */
const ALLOWED_RETURN_ORIGINS = new Set([
  'https://upto.world',
  'https://www.upto.world',
  'https://upto-six.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  NATIVE_RETURN_ORIGIN,
]);

/**
 * Build the post-OAuth redirect URL for a requested origin.
 *
 * Anything not on the allowlist falls back to the default rather than erroring: the victim of a
 * crafted link then simply lands signed-in on the real site, which is both safe (the token
 * reaches their own browser on our own origin) and a better outcome than an error page.
 *
 * @param {unknown} requestedOrigin  Untrusted — straight off the query string / OAuth state.
 * @param {Record<string,string>} [params]  e.g. `{ session }` or `{ error }`.
 * @returns {string} An absolute URL on an allowlisted origin.
 */
export function resolveOAuthReturnUrl(requestedOrigin, params = {}) {
  // Express hands back an ARRAY for a repeated `?origin=&origin=` query param, and objects are
  // possible via extended query parsing — so check the type before trusting Set membership.
  const origin =
    typeof requestedOrigin === 'string' && ALLOWED_RETURN_ORIGINS.has(requestedOrigin)
      ? requestedOrigin
      : DEFAULT_RETURN_ORIGIN;

  const query = new URLSearchParams(params).toString();
  return `${origin}/login${query ? `?${query}` : ''}`;
}

/** Whether an origin would be honoured — exported for logging a refusal at the call site. */
export function isAllowedReturnOrigin(requestedOrigin) {
  return typeof requestedOrigin === 'string' && ALLOWED_RETURN_ORIGINS.has(requestedOrigin);
}
