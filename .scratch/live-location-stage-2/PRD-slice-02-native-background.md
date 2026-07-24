# PRD — Slice 2: Native background location (survives lock / background / kill)

Status: ready-for-agent
Created: 2026-07-26
Parent: [Stage 2 PRD](PRD.md) · [issue 02](issues/02-native-background-location.md)
Related: [ADR 010 safety-first](../../brain/decisions/010-product-direction-safety-first-social-leash.md),
[ADR 011 Capacitor shell](../../brain/decisions/011-capacitor-mobile-shell.md),
[ADR 013 Vitest/node-test scope](../../brain/decisions/013-vitest-alongside-node-test.md),
[Stage 1 PRD](../live-location/PRD.md), [plans/live-location.md](../../brain/plans/live-location.md),
[mobile-standup-runbook.md](mobile-standup-runbook.md), [positionSource.ts](../../src/services/positionSource.ts)

## Problem Statement

Live location works only **while the traveller has the trip page open in the foreground**. The
moment the iPhone locks or the app is backgrounded — exactly what a phone does in a pocket on a
real trip — the WebView stops sampling, the marker goes stale, and the watcher's view degrades to
"paused, last known N min ago." For a *safety* tool that is the whole ballgame: the traveller is
walking, the screen is off, and their watchers can no longer see where they are. ADR 011 named this
the make-or-break wall: "we lost their location when the phone went in their pocket" defeats the
feature. Slice 1 proved the whole pipeline (permission → publish → SSE → marker → liveness) in the
foreground and shipped a Capacitor shell to TestFlight; Slice 2 must make that pipeline keep
producing fixes with the screen off, the app backgrounded, or the app killed and relaunched.

A second, linked problem specific to the native shell: even when the plugin keeps producing fixes,
Android throttles WebView HTTP after ~5 minutes in the background, so `api.reportPosition` (a
WebView `fetch`) silently stops reaching the backend — the fixes are taken but never delivered.

## Solution

Back the **`native-background` `PositionSource`** (the seam Slice 1 built) with a Capacitor
background-geolocation plugin, so the traveller's position keeps streaming while the app is
backgrounded or the screen is locked. Fixes flow into the **unchanged** Stage 1 pipeline — the same
`api.reportPosition` → SSE `position` → `applyLifecycleEvent` → live marker → `describeLiveness` →
`shouldBroadcastPosition` chain, with the same `with-trip` / `owner-only` / `off` privacy model and
the same honest-degradation contract. Slice 2 changes only *how fixes are produced* and *how
reliably they are delivered*:

- The `native-background` branch of `createPositionSource` (today a loud throwing guard) becomes a
  real `NativeBackgroundPositionSource` that registers a background watcher and emits `onFix` /
  `onUnavailable` exactly as the web source does.
- Permission for "always allow" background location is requested **contextually with a rationale**
  (never a cold prompt on load), extending Slice 1's principle. "While using the app" degrades
  **honestly** to foreground-only tracking with a clear notice — the same contract, not a silent
  failure.
- On native, the position POST is routed through **CapacitorHttp** (native HTTP) rather than WebView
  `fetch`, so delivery survives the Android background throttle (and it sidesteps CORS on iOS too).
- Tracking resumes automatically after an OS-kill relaunch mid-trip, and keeps running while the
  trip is `overdue`, not only `active` — the period watchers most need it.

This ships as the honest upgrade from Slice 1's "live while the page is open" to **"live for the
duration of the trip, screen on or off"** — the promise the safety pitch actually needs.

## User Stories

1. As a traveller, I want my position to keep updating while my iPhone is in my pocket with the
   screen locked, so that my watchers can see where I am without me keeping the app open.
2. As a traveller, I want tracking to survive the app being backgrounded (I switch to my camera,
   maps, or messages), so that using my phone normally doesn't blind my watchers.
3. As a traveller, I want tracking to resume automatically if the OS kills and relaunches the app
   mid-trip, so that a low-memory kill doesn't silently end my sharing.
4. As a traveller, I want to grant "always allow" background location with a clear explanation of
   why a safety app needs it, so that I understand the permission I'm giving.
5. As a traveller who only grants "while using the app," I want the app to keep working in the
   foreground and tell me background tracking is limited, so that the degraded state is honest
   rather than silently broken.
6. As a traveller, I want the permission prompt to appear when my trip goes live with sharing on
   (not cold on app launch), so that the request has obvious context.
7. As a traveller who sets sharing to `off`, I want the background sampler to actually stop (not
   just not-publish), so that "off" genuinely collects nothing even in the native shell.
8. As a traveller on `owner-only`, I want my position rendered on my own map but never sent to the
   server, so that I can navigate privately while sharing nothing.
9. As a traveller on `with-trip`, I want each background fix delivered to my watchers even after
   my phone has been in my pocket for an hour, so that the Android background HTTP throttle doesn't
   silently stop delivery.
10. As a traveller, I want a persistent, OS-level indication that background tracking is active
    (the iOS blue location indicator / a foreground-service notification), so that I'm never
    unknowingly broadcasting.
11. As a traveller whose trip goes overdue, I want my position to keep flowing while `overdue`, not
    just `active`, so that the period when watchers most need my location is covered.
12. As a traveller, I want backgrounding the app to NOT be reported to watchers as "unavailable"
    (the way closing a browser tab is), so that a locked screen shows me still live, not paused.
13. As a watcher, I want the live marker and its liveness labels ("updated 3 min ago", "paused,
    last known 14 min ago") to behave exactly as in Slice 1, so that background tracking just makes
    the `fresh` state more common, not a new set of rules to learn.
14. As a watcher, I want a genuine `unavailable` signal only when the device truly can't produce a
    fix (permission denied, location error), so that "unavailable" stays meaningful.
15. As a returning web user, I want the website to keep working exactly as before, so that the
    native background source is additive, not a change to the foreground-web experience.
16. As a developer, I want the native position source to feed the *same* `api.reportPosition` → SSE
    → reducer pipeline as the web source, so that only one set of downstream behaviour exists and
    stays tested.
17. As a developer, I want the choice of source resolved by the existing, tested
    `selectPositionSource(platform)`, so that no new branch is scattered through the component.
18. As a developer, I want the plugin's raw location object normalised to the app's `PositionFix`
    by one small pure function, so that field mapping and bad-coordinate guarding are unit-tested
    off-device (the place coordinate bugs have bitten before).
19. As a maintainer, I want the chosen background-geolocation plugin and the iOS-"always" rationale
    recorded as a candidate ADR, so that the reconsider-path (a native module / React Native) is
    pre-decided, not improvised.
20. As a maintainer, I want the background plugin, permission lifecycle, and OS-kill resume verified
    on a real iPhone via TestFlight (not mocked), so that we don't ship a green unit suite over a
    feature that doesn't survive a screen lock.
21. As a maintainer, I want the `ios/` project committed from this slice on, so that the native
    permission strings and background-mode entitlements persist across cloud builds instead of
    being wiped by CI regeneration.
22. As a maintainer, I want the on-device background matrix ({foreground, backgrounded, locked,
    killed-relaunched} × {`off`, `owner-only`, `with-trip`}) executed and recorded as the
    acceptance gate, so that a passing unit suite is understood as necessary but not sufficient.

## Implementation Decisions

### The seam (one existing, one small new pure)

- **Existing seam — `PositionSource` / `createPositionSource`.** Implement the `native-background`
  branch (currently a throwing guard) as a `NativeBackgroundPositionSource` implementing the same
  `PositionSource` interface (`start(handlers)` / `stop()`) and emitting the same
  `PositionSourceHandlers` (`onFix(PositionFix)` / `onUnavailable('denied' | 'error')`). Nothing
  downstream changes. `selectPositionSource(platform)` already routes native → `'native-background'`
  and is already tested — no edit there.
- **New pure function — `toPositionFix(pluginLocation) → PositionFix | null`.** Maps the plugin's
  location object (`latitude`/`longitude`/`accuracy`/`time`, and a `simulated` flag) to the app's
  `PositionFix` (`lat`/`lng`/`accuracy`/`timestamp`). Returns `null` to drop unusable fixes
  (missing/invalid coordinates; optionally `simulated` fixes outside test builds). This is the one
  new unit-tested boundary Slice 2 adds; the plugin wiring around it is below the seam.

### The native source (below the seam — on-device verify)

- **Plugin choice:** default to **`@capacitor-community/background-geolocation`** (free, simple
  `registerPlugin` + `addWatcher` model, background/lock via a foreground service on Android +
  `UIBackgroundModes: location` on iOS). Record the choice + the iOS-"always" reliability rationale
  as a candidate ADR. **Fallback: `@transistorsoft/capacitor-background-geolocation`** (paid,
  gold-standard iOS "always") — the concrete landing spot for **ADR 011's reconsider clause** if the
  community plugin can't hold iOS "always" background. Install via **SPM** (Capacitor 8 iOS is
  SPM-based — `cap sync` wires the plugin's `Package.swift`; there is no `pod install`).
- **Watcher config, not a firehose:** configure the plugin's `addWatcher` with a `backgroundMessage`
  (required for it to deliver updates in the background, not only foreground) and a coarse
  `distanceFilter`. Slice 2 uses a **fixed coarse cadence** (the Stage-1 ~3-min-class floor);
  `resolveSampleCadence` (already built, Slice 3) replaces the fixed value later — do not raise the
  cadence just because native allows it (battery invariant).
- **Permission lifecycle:** request "always allow" **contextually** when the trip goes active with
  sharing on (the source's `start`), with a rationale. "While using" → foreground-only with an
  explicit notice (reuse Slice 1's `locationDenied`-style honest notice, extended for the
  while-using state). Denial → `onUnavailable('denied')`, which the existing consumer already maps
  to the ActiveTrip notice + watcher `unavailable`.
- **Privacy parity (unchanged consumer logic):** the existing ActiveTrip effect already enforces
  privacy by not-publishing — `off` never creates a source (so the native sampler never starts),
  `owner-only` samples but returns before POST, `with-trip` POSTs. Toggling to `off` mid-trip
  re-runs the effect and calls `source.stop()`, which must genuinely remove the native watcher
  (collect nothing). The server guard `shouldBroadcastPosition` is unchanged and remains the
  backstop.

### Delivery reliability

- **CapacitorHttp for the position POST on native.** Route `api.reportPosition` (and, safest,
  all API calls) through CapacitorHttp when running natively, so background POSTs survive the
  Android ~5-min WebView HTTP throttle and bypass CORS. `CapacitorHttp` is already enabled in
  `capacitor.config.ts`; the base-URL half is already fixed (native → absolute
  `https://api.upto.world`). Web keeps using `fetch` unchanged.
- **Background is not "unavailable."** The web-only `pagehide` → `beaconPositionUnavailable`
  behaviour must be **platform-guarded to web** — on native, backgrounding must keep publishing, not
  retract. A locked screen shows the traveller still live (fresh fixes keep arriving), not paused.

### Native project config (persisted — commit `ios/` from this slice)

- **Stop gitignoring `ios/`; commit it.** CI-regeneration would wipe the Info.plist edits below.
- **iOS `Info.plist`:** `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription` (safety rationale copy), `UIBackgroundModes:
  [location]`, and `ITSAppUsesNonExemptEncryption = false` (HTTPS-only → export-compliance exempt,
  stops the per-build prompt).
- **Android:** `useLegacyBridge: true` is already set (prevents the 5-min background halt);
  `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION`, and `POST_NOTIFICATIONS` (Android 13+) for
  the foreground-service notification. (Android verification waits on a device — see Out of Scope.)

## Testing Decisions

- **What a good test is here (unchanged philosophy):** given inputs, assert the derived output at a
  seam. No test reaches into the Capacitor plugin, the OS permission dialog, `navigator.geolocation`,
  the network, `EventSource`, or Cesium — those are implementation details below the seam.
- **`toPositionFix(pluginLocation)`** — new, `node --test` (prior art `selectPositionSource`,
  `describeLiveness`, `shouldBroadcastPosition`). Cases: a well-formed plugin location → the mapped
  `PositionFix`; missing/NaN/zero coordinates → `null`; `simulated: true` handling; `time` mapped to
  an ISO `timestamp`; accuracy passed through.
- **Reused, unchanged from Stage 1 (must stay green — the regression guard that the source swap
  didn't leak downstream):** `selectPositionSource`, `applyLifecycleEvent` `position` kind,
  `shouldBroadcastPosition`, `describeLiveness`, `mapFraming`.
- **Below the seam — explicitly on-device manual verify (the honest ceiling; ADR 013):** the
  **on-device background matrix is the acceptance gate**, a green unit suite is necessary but NOT
  sufficient. Matrix (iOS via TestFlight now): **{foreground, backgrounded, screen-locked,
  killed-then-relaunched} × {`off`, `owner-only`, `with-trip`}**, plus: "always" vs "while using"
  permission paths, `overdue` keeps tracking, background delivery survives >5 min (CapacitorHttp),
  and the OS-level active-tracking indicator shows. Record the run.

## Out of Scope

- **Battery-aware adaptive cadence** — `resolveSampleCadence` is already built (Slice 3); Slice 2
  consumes a fixed coarse interval and Slice 3 swaps it in. The profile power-mode UI is Slice 3.
- **Offline store-and-forward** — `nextFlushBatch` is already built (Slice 4); wiring the on-device
  buffer + `@capacitor/network` is Slice 4. Slice 2 stays fire-and-forget per fix (a dropped fix is
  caught by the next tick), now over CapacitorHttp.
- **Watcher push escalation** — Slice 5 (independent; iOS APNs key already parked).
- **Android on-device verification** — no Android device on hand; the Android half of the matrix
  stays an open gate. Android manifest/config is still added so the build is ready when a device
  lands.
- **Breadcrumb / movement-history trail** — Stage 2 stays last-known-only.
- **Off-route alerting, progress/late estimates, accuracy-radius circle, what3words on the live
  marker** — later.

## Further Notes

- **This is the ADR-011 make-or-break slice.** The single most valuable outcome is that a locked
  iPhone in a pocket keeps its watchers informed. If the community plugin can't hold iOS "always"
  background reliably, ADR 011's reconsider clause (Transistorsoft / native module / React Native)
  is live — that's a slice outcome, decided by the device matrix, not the unit suite.
- **The pipeline is reused, not rebuilt.** Slice 1 proved the whole permission → publish → broadcast
  → marker → liveness chain in the foreground precisely so Slice 2 is a *source swap plus delivery
  reliability*. If a Slice 2 change forces edits to the three tested Stage-1 seams
  (`applyLifecycleEvent`, `shouldBroadcastPosition`, `describeLiveness`), that's a signal the swap
  leaked — treat it as a red flag, not a normal edit.
- **TestFlight is now the live verification loop.** The Codemagic → TestFlight pipeline works (see
  runbook §"iOS build (cloud)"); each push builds an installable iOS build. Budget real-device time
  for the matrix — it is the gate.
