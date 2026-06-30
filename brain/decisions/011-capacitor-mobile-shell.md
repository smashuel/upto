---
type: decision
status: accepted
related: [brain/decisions/010-product-direction-safety-first-social-leash.md, brain/features/squad-social-vision.md, package.json, index.html]
tags: [mobile, capacitor, live-gps, architecture, pwa]
---

# 011 — Capacitor as the mobile shell for live GPS

## Context

[ADR 010](010-product-direction-safety-first-social-leash.md) commits live GPS tracking
as the next major bet. The hard constraint is **iOS background location**: Safari / a pure
PWA cannot keep updating position once the screen locks or the app backgrounds. For a
safety app, "we lost their location when the phone went in their pocket" defeats the
feature. So committing live GPS means committing to a path through that wall.

## Decision

**Wrap the existing React/Vite app in [Capacitor](https://capacitorjs.com/).**

The current frontend stays the single codebase. Capacitor adds a native shell with
plugins for background geolocation and push notifications, shipped to the App Store /
Play Store. Web keeps deploying as today; the native shell is **additive**, not a fork.

**Staging (de-risk the pipeline before the shell):**

1. **Foreground-only web first** — build the live-position pipeline (a position channel
   over the existing SSE stream, a live marker that moves on the TripLink map) using
   plain `navigator.geolocation` while the app is open. Proves the end-to-end plumbing
   with zero native work.
2. **Then Capacitor** for reliable background location + push.

A **privacy model** is a hard precondition of shipping any of this: per-trip
share-scope — `with trip` / `owner only` / `off` — defaulting to the least-shared option
that still does the job, for the duration of the trip only.

## Alternatives considered

- **PWA-only, accept the limits.** Rejected as the *product* path: it can only ever
  promise foreground tracking, which undercuts the safety pitch. **But** it is adopted as
  *stage 1* of the Capacitor plan — the foreground web version is the fastest way to
  prove the pipeline.
- **React Native rewrite.** Rejected. Best long-term native UX, but it's a second
  codebase and a major time sink competing with everything else — wrong call for a small
  effort with a working React web app.
- **Defer the shell decision.** Rejected as the headline decision (we are choosing
  Capacitor now) but effectively honoured by the staging: stage 1 ships before any native
  commitment, so the choice can still be reversed cheaply if stage 1 reveals a blocker.

## Consequences

- A native build/release pipeline (Xcode, Play Console, signing) enters the project for
  the first time — new ops surface, app-store review latency.
- Background-location battery management and a privacy/consent model become required
  design work, not optional polish.
- Push notifications via Capacitor become a candidate escalation channel — relevant to
  ADR 010's "email-only for now" (SMS vs push is revisitable once the shell exists).
- The npm-Cesium-bundle backlog item (kills the all-`any` map surface) gains weight: a
  native build is a cleaner place to control assets than the CDN `window.Cesium` global.

## Reconsider if

- Stage 1 (foreground web live position) reveals the pipeline itself is the hard part —
  then the shell choice can wait longer.
- Capacitor's background-geolocation story on iOS proves unreliable in testing — React
  Native (or a native module) comes back on the table.
- Live GPS gets deprioritised in a future replan — there's no reason to adopt Capacitor
  without it.
