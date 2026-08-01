---
type: journal
date: 2026-08-01
related: [oauth-origin.js, src/services/oauthReturn.ts, src/hooks/useAuthDeepLink.ts, backend-server.js, ios/App/App/Info.plist]
tags: [security, oauth, auth, capacitor, ios, phase-2]
---

# Google sign-in on iOS, and the open redirect found while fixing it

Two bugs. The reported one was cosmetic by comparison.

## Reported: "the application couldn't be opened"

Google sign-in in the TestFlight build reached the account picker, then failed. Not a TestFlight
artefact — the same binary fails anywhere, including a release build.

The flow breaks on the way **back**:

1. `Login.tsx` sent `window.location.origin` as the return address. In the Capacitor WebView
   that is `capacitor://localhost` (no `iosScheme` set, so Capacitor's default).
2. Tapping the button navigates to `https://api.upto.world/...` — outside the app's own origin,
   and with no `allowNavigation` entry, so **Capacitor hands it to the system browser**. The
   entire OAuth exchange happens in Safari, outside the app.
3. The backend callback then redirected Safari to `capacitor://localhost/login?session=…`.
4. Safari asked iOS which app owns `capacitor://`. **Nothing does** — `Info.plist` had no
   `CFBundleURLTypes`. The session token was minted correctly and had nowhere to go.

Three separate pieces were missing: a registered URL scheme, a listener for the deep link, and
a frontend that sends a routable return address. Fixed with `world.upto.app://app`,
`@capacitor/app`'s `appUrlOpen`, and `oauthReturnOrigin(platform, webOrigin)`.

**The deep-link handler deliberately does not reuse `Login.tsx`'s existing `?session=` effect.**
That effect runs once on mount, and by the time the deep link arrives the app is being *resumed*
with Login likely already mounted — the effect would never re-fire. It also lets sign-in
complete from whatever screen the user started on.

## Found while reading it: an open redirect handing out session tokens

Far more serious, and unrelated to native:

```js
const origin = req.query.origin || 'https://upto.world';   // never validated
...
res.redirect(`${origin}/login?session=${sessionToken}`);   // token appended
```

Anyone could send a victim `https://api.upto.world/api/auth/google?origin=https://evil.example`.
The victim sees a **genuine Google consent screen initiated from our own domain**, approves it,
and their session token is delivered to the attacker's server. That is account takeover from one
link, with nothing about the flow looking wrong to the person clicking it.

Fixed with an exact-match allowlist (`oauth-origin.js`), validated at both the authorize
endpoint (so a refusal is logged where it happens) and again in the callback (`state`
round-trips through the browser, so it is attacker-reachable and cannot be trusted on return).

### Why exact-match, and nothing cleverer

Every open-redirect bug of this shape comes from a clever comparison — a `startsWith`, a suffix
check, a regex, a normalisation pass. So there isn't one. `https://upto.world/` (trailing slash)
and `http://upto.world` (wrong scheme) are simply different strings and are refused. The test
file works through the near-misses that motivate this: lookalike subdomains
(`upto.world.evil.example`), prefix collisions (`upto.worldwide.example`), userinfo smuggling
(`https://upto.world@evil.example`), and protocol-relative URLs.

A non-string `origin` is also refused, which is not hypothetical: Express hands back an **array**
for a repeated `?origin=&origin=` query param, and that would throw on a naive `.startsWith`.

**Unknown origins fall back to production rather than erroring.** The victim of a crafted link
then just lands signed-in on the real site — safe, and a better outcome than an error page.

### Consequence worth knowing

Vercel **preview** deployments get a fresh hostname each time and are therefore not allowlisted,
so Google sign-in on a preview falls back to production. That is the intended trade: a wildcard
for `*.vercel.app` would let anyone who can publish a Vercel site collect our users' sessions.

## Three strings that must not drift

`world.upto.app://app` is written in three places, and if they disagree the backend refuses the
app's origin and quietly redirects sign-in to the website — which on a phone looks like "the
Google button does nothing":

- `NATIVE_RETURN_ORIGIN` in [oauth-origin.js](../../oauth-origin.js) (backend allowlist)
- `NATIVE_OAUTH_RETURN_ORIGIN` in [oauthReturn.ts](../../src/services/oauthReturn.ts)
- `CFBundleURLSchemes` in [Info.plist](../../ios/App/App/Info.plist)

Both test suites pin the literal, and the Codemagic build now asserts `CFBundleURLTypes` exists
alongside the location keys — it is equally load-bearing, and equally silent when missing.

## Not changed

The Google Cloud Console redirect URI. It is still `${BACKEND_URL}/api/auth/google/callback` —
Google always returns to the backend, and only the backend's *onward* redirect changed.
