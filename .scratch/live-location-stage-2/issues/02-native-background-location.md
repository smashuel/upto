# Slice 2 — Native background location (survives lock / background / kill)

Status: matrix RUN 2026-08-03 — background tracking HOLDS (ADR-011 bet validated, plugin stays). Slice stays open on 6 consumer-side defects: issues 06-11.
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
**Concrete build plan: [PRD-slice-02-native-background.md](../PRD-slice-02-native-background.md)** (scoped 2026-07-26)
Covers user stories: 1, 2, 3, 4, 5, 13, 14, 18, 17 (regression)

## What to build

Back the `native-background` `PositionSource` (from Slice 1) with a Capacitor
background-geolocation plugin so the traveller's position keeps streaming **while the app is
backgrounded or the screen is locked** — the situation of a real active trip with the phone in
a pocket. Fixes flow into the same unchanged Stage 1 pipeline; this slice changes only *how
fixes are produced*.

**This is the ADR-011 make-or-break wall.** iOS "always" background reliability is the risk;
if the chosen plugin can't hold it, ADR 011's reconsider-clause (native module / React Native)
is live. Choosing the specific plugin is part of this slice.

Permission is requested **contextually with a rationale** (extending Stage 1's
never-cold-on-load principle): "always allow" when the trip goes active with sharing on.
"While using the app" degrades **honestly** to foreground-only tracking with a clear notice —
same honest-degradation contract, not a silent failure. Tracking must resume automatically if
the OS kills and relaunches the app mid-trip, and must keep running while the trip is
`overdue` (the period watchers most need it), not just `active`.

Privacy parity is strict: `off` must genuinely **stop the native sampler** (collect nothing),
not merely not-publish; `owner-only` renders locally and never POSTs; `with-trip` POSTs. The
server guard (`shouldBroadcastPosition` against stored `liveSharing`) is unchanged and remains
the backstop. Respect the platform's own persistent background-location indicator so the
traveller is never unknowingly broadcasting.

## Review findings to bake in (from /capacitor-best-practices + /capacitor-plugins, 2026-07-09)

These surfaced in the pre-implementation skill review and are **not optional** — two were
confirmed against the code and undercut the whole slice if missed:

1. **🔴 Android WebView throttles HTTP after 5 min backgrounded.** The
   `@capacitor-community/background-geolocation` docs are explicit on both:
   - Set **`android.useLegacyBridge: true`** in `capacitor.config.ts` or *"location updates
     halt after 5 minutes in the background"* — the exact failure this slice exists to prevent.
   - Even with the plugin still producing fixes, *"after 5 minutes in the background, HTTP
     requests from the WebView are throttled."* `api.reportPosition` is a WebView `fetch`
     ([src/config/api.ts:226](../../../src/config/api.ts)), so backgrounded > 5 min → POSTs
     silently stop reaching the backend while the plugin logs fixes locally. **Fix: on native,
     route the position POST through CapacitorHttp (native HTTP, `@capacitor/core` bundled;
     enable `CapacitorHttp` in config), not WebView `fetch`.** This is a first-class part of
     this slice, not an on-device discovery. (Partial overlap with Slice 4's offline queue, but
     throttling ≠ offline — the queue does not cover it.)
2. **🔴 Native API base URL is broken as written.** Production base URL is `''` (same-origin
   via the Vercel `/api/*` proxy — [src/config/api.ts:6-9](../../../src/config/api.ts)). In the
   Capacitor WebView there is no Vercel origin: `/api/*` resolves to `capacitor://localhost`,
   not the backend. A bundled build can't reach the API at all. Native builds need an
   **absolute backend origin**, and the backend CORS allowlist must include the Capacitor
   origin (`capacitor://localhost` / `https://localhost`). *(Base-URL half fixed in the
   config-hardening pass 2026-07-09; the CapacitorHttp routing lands here with the native
   source.)*
3. **Android battery-optimization / Doze** will kill background tracking independent of the
   plugin. Plan the Capawesome `@capawesome-team/capacitor-android-battery-optimization`
   exemption request (contextual, with rationale) as part of this slice / Slice 3.
4. **Persistent background-location indicator** — the plugin's foreground-service notification
   (Android) and the iOS blue status bar satisfy user story 14; customise the Android
   notification strings/icon in `strings.xml` (see runbook).

## Plugin choice (record as candidate ADR)

- **Default: `@capacitor-community/background-geolocation`** — free, simple `addWatcher` model,
  covers background/lock via a foreground service + `UIBackgroundModes: location`.
- **Fallback: `@transistorsoft/capacitor-background-geolocation`** (paid, gold-standard iOS
  "always" reliability) — this is the concrete landing spot for **ADR 011's reconsider clause**
  if the community plugin can't hold iOS "always" background. Name both in the ADR note so the
  escalation path is pre-decided, not improvised under pressure.

## Progress (2026-07-31) — native config prerequisite landed

The `ios/` project is now **committed**, with its location permission strings. This had to happen
before any background-location code: CI regenerated `ios/` on every build, so every `Info.plist`
edit was wiped before the app was even compiled. Landed:

- `ios/` un-gitignored and committed (19 files; Capacitor's nested `ios/.gitignore` keeps build
  output, the copied web bundle and the generated `capacitor.config.json` out). Bundle id is
  unchanged at `world.upto.app`, so signing and the TestFlight upload path are untouched.
- `Info.plist`: `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]`,
  `ITSAppUsesNonExemptEncryption = false` (kills the per-build export-compliance prompt).
- `codemagic.yaml`: the `cap add ios` regeneration step is replaced by an **assertion** that the
  project and all four keys are present, failing the build otherwise. Deliberately no fallback —
  a regenerated project has none of these keys, so the app would build and ship silently unable
  to ask for location, which is the exact failure that was happening invisibly.
- `keys/`, `*.p8`, `*.p12`, `*.mobileprovision`, `*.cer` gitignored — the App Store Connect and
  APNs private keys were sitting untracked and un-ignored, one `git add .` from being published.

⚠️ `UIBackgroundModes: [location]` is declared ahead of the code that uses it. Inert on device and
fine for TestFlight (upload-only, internal testers, no Beta App Review), but Apple rejects App
Store submissions that declare it without using it — don't submit for review until this slice
lands the plugin.

Still to build: the plugin itself, `toPositionFix`, contextual "always" permission, CapacitorHttp
POST routing, and the on-device matrix.

## Progress (2026-08-01) — the source is built; the gate is not passed

Code complete and unit-green (180 node-test + 52 vitest). **The on-device matrix has not been
run, and it — not this test count — is the acceptance gate.** Landed:

- **`toPositionFix`** ([nativePositionFix.ts](../../../src/services/nativePositionFix.ts)) — the
  pre-agreed pure seam, 16 cases. Refuses non-finite / out-of-range / missing coordinates,
  exactly-(0,0), bad accuracy, and OS-simulated fixes; falls back to now for a null `time`.
  The bias is explicit: **a wrong position is worse than no position**, because a dropped fix
  degrades honestly through the liveness labels while a bad one sends a searcher to the wrong
  valley.
- **`NativeBackgroundPositionSource`**
  ([nativeBackgroundPositionSource.ts](../../../src/services/nativeBackgroundPositionSource.ts))
  — 14 cases against an injected fake plugin. Covers the two behaviours that are privacy- and
  safety-critical and would otherwise only be findable on a device: `stop()` removing the
  watcher **even when called before `addWatcher` resolves** (otherwise "off" leaves the OS
  collecting location), and `NOT_AUTHORIZED` mapping to `denied` while everything else maps to
  `error`.
- **`shouldRetractOnHide`** ([retractOnHide.ts](../../../src/services/retractOnHide.ts)) — 5
  cases. Stage 1 retracted the live position on `pagehide`; in the native shell that also fires
  on a mere backgrounding, so retracting would report a false "paused" about a traveller whose
  phone is in their pocket and being tracked perfectly well. Two lines, tested because getting
  it wrong is invisible in review and loud in the field.
- `createPositionSource`'s native branch is real; the Slice-1 throwing guard is gone.
- **Plugin choice recorded**: [ADR 019](../../../brain/decisions/019-background-geolocation-plugin.md).

### Two PRD items that turned out to need no code

- **CapacitorHttp routing was already done by configuration.** Capacitor's native bridge patches
  `window.fetch` when `CapacitorHttp.enabled` is true, which `capacitor.config.ts` already sets.
  Verified in `@capacitor/ios`'s `native-bridge.js` (the patch is gated on that flag), so
  `api.reportPosition` is already on native HTTP on device. No wrapper written.
- **Android needs no `ACCESS_BACKGROUND_LOCATION`.** The plugin uses a foreground service typed
  `location` and never references that permission. Declaring it would invite Play Store review
  scrutiny for something unused. The plugin's own manifest merges in what it does need; we only
  renamed the notification channel to "Trip location sharing" so a traveller can tell who is
  collecting their location from the notification alone.

### Not built — stated plainly rather than quietly dropped

1. **"While using" gets no explicit notice** (PRD user story 5). The plugin exposes no
   permission-state API, only `NOT_AUTHORIZED` on outright denial, so always-vs-while-using is
   not observable. A while-using traveller degrades through the existing liveness machinery
   ("paused, last known N min ago") — honest, but unlabelled. Transistorsoft exposes
   authorization status; see ADR 019's reconsider path.
2. **OS-kill relaunch resume is partial** (user story 3). A WebView content-process kill reloads
   the current URL, so tracking resumes. A full app kill relaunches at the app root, and
   tracking will not resume until the traveller navigates back to the trip. Fixing that means
   auto-navigating to an active trip on launch — a product decision about hijacking app launch,
   not a technical one. **Needs a call before it is built.**
3. **In-app navigation away from the trip page stops tracking.** The source lives in
   `ActiveTrip`'s effect, so leaving that screen for, say, Profile tears the watcher down.
   Backgrounding does *not* do this (React stays mounted), so the primary pocket/lock scenario
   is unaffected — but it is a real gap. The fix is lifting the source to an app-level service
   keyed on "a trip is live", which is a bigger change than a source swap.

## Matrix result — 2026-08-03 (iPhone 16 / iOS 26.4.1, build 25E253 / `9f98dc1`)

**The make-or-break question is answered: yes.** Locked in a pocket for 20 minutes, the app kept
its watchers updated at a steady ~3-minute cadence, past the 5-minute WebView-HTTP-throttle mark.
Backgrounding did not flip watchers to "paused" (`shouldRetractOnHide` held).

**`@capacitor-community/background-geolocation` stays — do not trigger ADR 011's reconsider
clause.** Every defect found is in our own consumer logic, not the plugin.

Six filed: [06](06-sharing-resume-does-not-recover-watchers.md) (sharing resume never recovers
watchers — worst of the batch), [07](07-stationary-traveller-produces-no-fixes.md) (a stationary
traveller produces no fixes; root cause of 06 and 09),
[08](08-watcher-removal-failure-is-invisible.md), [09](09-owner-marker-freezes-on-own-map.md),
[10](10-sampling-cadence-too-slow.md), [11](11-relaunch-does-not-return-to-live-trip.md).
Fix 07 first. Full run: [slice-02-device-matrix.md](../slice-02-device-matrix.md).

### The matrix still to run

{foreground, backgrounded, screen-locked, killed-then-relaunched} × {`off`, `owner-only`,
`with-trip`}, plus: the "always" prompt appears contextually at trip start; background delivery
still lands after > 5 min; the iOS blue status-bar indicator shows; a stationary traveller's
staleness behaviour is tolerable (see ADR 019).

## Acceptance criteria

- [x] iOS native config persists across builds: `ios/` committed with the location usage
      strings, `UIBackgroundModes`, and export-compliance flag; CI asserts rather than
      regenerates (PRD user story 21).
- [x] A Capacitor background-geolocation plugin is chosen and wired behind the
      `native-background` source; the choice + iOS-"always" rationale is recorded (candidate ADR
      note).
- [~] `android.useLegacyBridge: true` and `CapacitorHttp` enabled; the position POST goes
      through native HTTP (not WebView `fetch`) on native — config verified against the native
      bridge source; the > 5 min backgrounded run still needs a real Android device.
- [ ] Position keeps updating with the app backgrounded and the screen locked, verified on a
      real iOS device (and Android).
- [ ] Tracking resumes automatically after an OS-kill relaunch mid-trip.
- [~] "Always allow" is requested contextually with a rationale — the source only starts when a
      trip goes live with sharing on, so the prompt is contextual by construction. Denial is
      reflected in the ActiveTrip chip (the Stage 1 contract, unchanged).
      **The "while using" notice is NOT built** — the plugin exposes no permission-state API, so
      always-vs-while-using is not observable. See "Not built", above.
- [~] `off` stops the native sampler entirely (nothing collected); `owner-only` never POSTs;
      `with-trip` POSTs — verified in the native shell.
- [x] Tracking continues while the trip is `overdue`, not only `active` (already true since
      Slice 1 — the consumer effect gates on `active || overdue`; re-confirmed, no change).
- [ ] Watcher-side liveness labels (fresh / stale / unavailable) behave exactly as Stage 1 —
      background tracking just makes `fresh` more common (regression check, no new rules).
- [ ] On-device test matrix executed and recorded: {iOS, Android} × {foreground, backgrounded,
      locked, killed-then-relaunched}. A green unit suite is necessary but **not** the acceptance
      gate for this slice — the matrix is.

## Blocked by

- Slice 1 (01-capacitor-shell-and-source-seam) — needs the shell and the `PositionSource` seam.
