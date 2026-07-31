# Slice 1 — Capacitor shell + PositionSource seam (native app, foreground parity)

Status: DONE (2026-07-31) — verified on iPhone via TestFlight. Android build ready but unverified (no device); that gap carries into the Slice 2 matrix, it does not hold Slice 1 open.
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
Covers user stories: 19, 20, 21, 22, 12 (foreground)

## Progress (2026-07-08)

**Software half — done, tested, committed** (`95c01c0`, branch `live-location-stage-2`): the
`PositionSource` seam (`src/services/positionSource.ts`), ActiveTrip refactored to consume it
(behaviour-preserving), `selectPositionSource` TDD'd under `node --test` (6 cases), all three
reused Stage 1 seams still green (59 node-test / 41 vitest), tsc + lint + prod web build clean.
Capacitor repo prep landed: `capacitor.config.json` seed, `/ios` `/android` gitignored. *(Both
are committed as of 2026-07-31 — see the closing section.)*

**Native half — Android standup DONE in-repo** (`d1710d2`): Capacitor 8 installed
(core/cli/android/ios); the `android/` project is generated + committed (appId
`world.upto.app`); `cap sync` copies the Vite bundle in; `cap:android` npm script added.
`detectPlatform()` resolves `'android'` via the `window.Capacitor` global, so the seam picks
`native-background` on device (throwing the Slice-2 guard until Slice 2 builds it).

Turnkey steps in [mobile-standup-runbook.md](../mobile-standup-runbook.md).

## Closed — 2026-07-31, verified on an iPhone via TestFlight

The Codemagic → TestFlight pipeline landed (2026-07-26) and the app has now been driven on a real
iPhone: foreground live location works with Stage 1 parity, and the shell itself is sound.

**The device run is what made this slice worth doing.** Everything shipped green — tsc, lint,
145 node-test + 52 vitest — and the iPhone still surfaced eleven distinct map defects, tracked
and now all closed in [.scratch/native-map-fixes/](../../native-map-fixes/README.md). One was
data-loss severity (placing a note wiped the in-progress trip; the cause was a nested `<form>`,
nothing Cesium-related). Two were product gaps that only a real user driving the app would
raise, and both became decisions rather than patches: notes now persist on the TripLink, and a
TripLink carries exactly one route ([ADR 018](../../../brain/decisions/018-one-route-per-triplink.md)).

Also landed since the note above: `ios/` is no longer gitignored — it is **committed**, with the
location permission strings, because CI regenerated it every build and wiped `Info.plist` before
the app compiled. That was a silent blocker on Slice 2 rather than a Slice 1 defect, but it is
fixed here so the background work can start. See
[issue 02](02-native-background-location.md).

**Android remains unverified** — still no device. The `android/` project is generated, committed
and configured (`useLegacyBridge`, the manifest permissions), so it is build-ready; nobody has
run it. That gap folds into the Slice 2 on-device matrix, which already carries Android as an
explicit open gate. It does not hold Slice 1 open: the slice's purpose was to land the native
build/release/signing surface at low risk and prove the source seam, and iOS did both.

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

- [x] Capacitor initialised (`ios` + `android` platforms) over the existing build; the web
      deploy to Vercel is unchanged and still works.
- [x] The inline sampling loop is extracted into a `PositionSource` interface with a
      `web-foreground` implementation; ActiveTrip consumes the source, not `navigator.geolocation`
      directly.
- [x] `selectPositionSource(platform)` is a pure function, unit-tested under `node --test`:
      native platform → `'native-background'`; web → `'web-foreground'`.
- [x] The native app builds and runs on a device/simulator and tracks live location in the
      **foreground** with full Stage 1 parity (marker, liveness labels, privacy toggle).
- [x] The `with-trip` / `owner-only` / `off` privacy model behaves identically in the native
      shell (foreground): `owner-only` renders locally / never POSTs, `off` does not sample.
- [x] The reused Stage 1 seams (`applyLifecycleEvent` position kind, `shouldBroadcastPosition`,
      `describeLiveness`, `mapFraming`) stay green with no new cases required — proving the swap
      didn't change downstream behaviour.
- [x] A native build/release runbook is captured for `brain/project/deployment.md` (moved there
      when the stage ships).

## Blocked by

- None — can start immediately.
