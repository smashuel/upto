// Tests for the OAuth return-URL allowlist. Runs on Node's built-in test runner:
//   node --test          (or: npm test)
//
// This is a security boundary, not a formatting helper. The callback appends a freshly minted
// SESSION TOKEN to whatever URL comes out of here, so an attacker who can steer it steers the
// victim's session to a server they control — full account takeover from one crafted link and a
// perfectly genuine Google consent screen on our own domain. Every case below is a way someone
// might try to look allowlisted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOAuthReturnUrl, DEFAULT_RETURN_ORIGIN, NATIVE_RETURN_ORIGIN } from './oauth-origin.js';

test('a known web origin is honoured', () => {
  assert.equal(
    resolveOAuthReturnUrl('https://upto.world', { session: 'abc' }),
    'https://upto.world/login?session=abc',
  );
});

test('the Vercel origin is honoured', () => {
  assert.equal(
    resolveOAuthReturnUrl('https://upto-six.vercel.app', { session: 'abc' }),
    'https://upto-six.vercel.app/login?session=abc',
  );
});

test('a dev origin is honoured', () => {
  assert.equal(
    resolveOAuthReturnUrl('http://localhost:5173', { session: 'abc' }),
    'http://localhost:5173/login?session=abc',
  );
});

test('the native app scheme is honoured and yields a parseable deep link', () => {
  const url = resolveOAuthReturnUrl(NATIVE_RETURN_ORIGIN, { session: 'abc' });
  assert.equal(url, 'world.upto.app://app/login?session=abc');
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'world.upto.app:');
  assert.equal(parsed.searchParams.get('session'), 'abc');
});

// ── The attack, and the near-misses ──────────────────────────────────────────

test('an arbitrary origin is REFUSED and falls back to the default', () => {
  // The whole point. Without this the next line hands the session token to evil.example.
  assert.equal(
    resolveOAuthReturnUrl('https://evil.example', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('a lookalike subdomain is refused', () => {
  assert.equal(
    resolveOAuthReturnUrl('https://upto.world.evil.example', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('a prefix-matching host is refused', () => {
  assert.equal(
    resolveOAuthReturnUrl('https://upto.worldwide.example', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('an allowlisted origin smuggled into a query string is refused', () => {
  assert.equal(
    resolveOAuthReturnUrl('https://evil.example/?x=https://upto.world', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('an allowlisted origin smuggled into userinfo is refused', () => {
  // https://upto.world@evil.example resolves to evil.example — a classic that reads as safe.
  assert.equal(
    resolveOAuthReturnUrl('https://upto.world@evil.example', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('a trailing slash is not silently accepted as the same origin', () => {
  // Exact-match only: no normalisation means no normalisation bugs to exploit.
  assert.equal(
    resolveOAuthReturnUrl('https://upto.world/', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('an allowlisted host on the wrong scheme is refused', () => {
  assert.equal(
    resolveOAuthReturnUrl('http://upto.world', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('a protocol-relative URL is refused', () => {
  assert.equal(
    resolveOAuthReturnUrl('//evil.example', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('capacitor://localhost is refused — it is what the broken iOS builds send', () => {
  // No app can open it (nothing registers that scheme), so honouring it strands the token.
  // Falling back at least lands the traveller on a working web login.
  assert.equal(
    resolveOAuthReturnUrl('capacitor://localhost', { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

// ── Shapes that aren't strings at all ────────────────────────────────────────

test('a missing origin uses the default', () => {
  assert.equal(
    resolveOAuthReturnUrl(undefined, { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

test('a non-string origin uses the default', () => {
  // Express gives an ARRAY for a repeated ?origin=&origin= query param — a real request shape,
  // not a hypothetical, and one that would throw on a naive .startsWith check.
  assert.equal(
    resolveOAuthReturnUrl(['https://upto.world', 'https://evil.example'], { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
  assert.equal(
    resolveOAuthReturnUrl({ toString: () => 'https://upto.world' }, { session: 'abc' }),
    `${DEFAULT_RETURN_ORIGIN}/login?session=abc`,
  );
});

// ── Parameter handling ───────────────────────────────────────────────────────

test('an error param is carried instead of a session', () => {
  assert.equal(
    resolveOAuthReturnUrl('https://upto.world', { error: 'google_cancelled' }),
    'https://upto.world/login?error=google_cancelled',
  );
});

test('params are URL-encoded', () => {
  assert.equal(
    resolveOAuthReturnUrl('https://upto.world', { session: 'a b&c=d' }),
    'https://upto.world/login?session=a+b%26c%3Dd',
  );
});

test('no params yields a bare login URL', () => {
  assert.equal(resolveOAuthReturnUrl('https://upto.world'), 'https://upto.world/login');
});
