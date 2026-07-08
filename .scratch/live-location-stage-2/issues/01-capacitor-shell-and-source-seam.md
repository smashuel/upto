# Slice 1 — Capacitor shell + PositionSource seam (native app, foreground parity)

Status: ready-for-agent
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
Covers user stories: 19, 20, 21, 22, 12 (foreground)

## What to build

Stand up the Capacitor native shell over the existing React/Vite app (ADR 011), *additively*
— the web app keeps deploying to Vercel exactly as today; the native build is a second target
over the same codebase, not a fork. Get the app running on a real device / simulator with
**foreground** live-location working through the unchanged Stage 1 pipeline.

Prefactor first ("make the change easy, then make the easy change"): extract the inline
foreground `getCurrentPosition` sampling loop currently living in ActiveTrip into a small
`PositionSource` interface (start / stop / onFix / onUnavailable), with the existing web
behaviour as the `web-foreground` implementation. Add `selectPositionSource(platform)` — a
pure function choosing the source from the runtime platform. In this slice only the
`web-foreground` source exists (native background arrives in Slice 2); the seam is what makes
that later swap a one-line change. Everything the source emits must flow into the **unchanged**
`api.reportPosition` → SSE `position` → `applyLifecycleEvent` → marker → `describeLiveness` →
`shouldBroadcastPosition` chain — no downstream edits.

This slice is deliberately mostly infrastructure: its value is landing the native
build/release/signing/store ops surface (Xcode, Play Console, signing) at the lowest-risk
tracking, and proving the source seam, before taking on the background-plugin reliability risk.

## Acceptance criteria

- [ ] Capacitor initialised (`ios` + `android` platforms) over the existing build; the web
      deploy to Vercel is unchanged and still works.
- [ ] The inline sampling loop is extracted into a `PositionSource` interface with a
      `web-foreground` implementation; ActiveTrip consumes the source, not `navigator.geolocation`
      directly.
- [ ] `selectPositionSource(platform)` is a pure function, unit-tested under `node --test`:
      native platform → `'native-background'`; web → `'web-foreground'`.
- [ ] The native app builds and runs on a device/simulator and tracks live location in the
      **foreground** with full Stage 1 parity (marker, liveness labels, privacy toggle).
- [ ] The `with-trip` / `owner-only` / `off` privacy model behaves identically in the native
      shell (foreground): `owner-only` renders locally / never POSTs, `off` does not sample.
- [ ] The reused Stage 1 seams (`applyLifecycleEvent` position kind, `shouldBroadcastPosition`,
      `describeLiveness`, `mapFraming`) stay green with no new cases required — proving the swap
      didn't change downstream behaviour.
- [ ] A native build/release runbook is captured for `brain/project/deployment.md` (moved there
      when the stage ships).

## Blocked by

- None — can start immediately.
