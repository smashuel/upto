# Mobile standup runbook — Capacitor native shell (Stage 2 Slice 1)

The **software half** of Slice 1 (the `PositionSource` seam + ActiveTrip refactor) is done,
tested, and merged. This runbook is the turnkey native standup. When Stage 2 ships, it
graduates into [brain/project/deployment.md](../../brain/project/deployment.md).

## No physical Mac required (decided 2026-07-08)

The app itself is **already device-agnostic** — one React/Vite codebase runs on any iOS/Android
device once built; the `PositionSource` seam was written and tested on Linux. The only Mac-locked
step is *compiling the iOS binary*, because Apple ships Xcode for macOS only. We do **not** buy a
Mac for it:

- **Android** — no Mac, no cloud. Android Studio + SDK run on Linux/Windows; develop, run on an
  emulator or a physical Android phone, and verify the background matrix **right here**.
- **iOS** — build + sign on **rented cloud macOS** (**Codemagic** is the least-friction for
  Capacitor; GitHub Actions `macos-*` runners or Ionic Appflow are alternatives), then distribute
  to **TestFlight** and test on a real iPhone. No physical Mac is ever touched.
- **Apple Developer Program ($99/yr)** — required for App Store distribution, TestFlight, and the
  background-location entitlement; the cloud build needs its signing certs/profiles. (User has /
  is getting one.)
- **PWA is not a substitute** — iOS PWAs cannot do reliable background location (the whole reason
  ADR 011 chose Capacitor). Do not fall back to it for this stage.

## What's already in the repo (done)

- **`src/services/positionSource.ts`** — the seam. `selectPositionSource(platform)` (pure,
  tested), `createPositionSource(kind, opts)`, `detectPlatform()`, and the
  `WebForegroundPositionSource` implementation (the old inline ActiveTrip loop). ActiveTrip
  consumes the source; nothing downstream (`api.reportPosition` → SSE → reducer → marker →
  liveness) changed.
- **`detectPlatform()`** already reads the `window.Capacitor` global Capacitor injects in the
  native shell — so the moment the platforms below exist, `selectPositionSource` resolves
  `'native-background'` on device with **no further wiring** (it will then throw the Slice-2
  "not yet implemented" guard until Slice 2 builds the native source — that's expected and
  loud, not silent).
- **`capacitor.config.json`** — appId `world.upto.app`, appName `Upto`, `webDir: dist` (Vite
  output). Seeded so you skip `npx cap init`.
- **`.gitignore`** — `android/` and `ios/` are both **committed** now (2026-07-31); each carries
  its own nested `.gitignore` that keeps build output, the copied web bundle, and the generated
  `capacitor.config.json` out. `keys/`, `*.p8`, `*.p12`, `*.mobileprovision` and `*.cer` are
  ignored — Apple signing keys never belong in the repo.

## Prerequisites

- **This machine (Linux) — Android + all shared work:** Android Studio + SDK, a JDK, Node 22.
- **iOS — nothing local:** a **Codemagic** account (free tier covers Capacitor) wired to this
  repo, plus the Apple Developer account's signing cert + provisioning profile uploaded to it.
  No Xcode, no CocoaPods, no Mac on your desk.

## Standup commands (Android + shared — run here)

```bash
# 1. Install Capacitor (core + CLI + both native platforms)
npm i @capacitor/core
npm i -D @capacitor/cli
npm i @capacitor/ios @capacitor/android   # @capacitor/ios is just the plugin package; safe to
                                          # install on Linux — it's only *compiled* in the cloud

# 2. Build the web app first — Capacitor wraps the dist/ output named in capacitor.config.json
npm run build

# 3. Add the Android platform (generates android/ — fully doable on Linux)
npx cap add android

# 4. Copy the web build + native plugin config into the platform
npx cap sync android

# 5. Run on an emulator / physical Android phone
npx cap open android   # → Android Studio: Run
```

Convenience scripts for `package.json` once deps are installed:

```json
"cap:sync": "npm run build && npx cap sync",
"cap:android": "npm run build && npx cap sync android && npx cap open android"
```

## iOS build (cloud — no Mac)

The `ios/` project is **committed** (generated once on Linux by `npx cap add ios` — Xcode is only
needed to *build* it, not to create it). CI no longer regenerates it: the pipeline asserts it is
present, with its location permission keys, and fails the build if not. Do not reinstate
`cap add ios` as a fallback — a fresh project carries none of those keys, so the app would build
and ship silently unable to ask for location.

The Codemagic pipeline then, on each push:

1. `npm ci && npm run build` (web bundle)
2. `npx cap sync ios`
3. Xcode build + code-sign with the uploaded Apple cert/profile
4. Publish the `.ipa` to **TestFlight**

You install from TestFlight on your iPhone and test — including the background-location matrix.
A `codemagic.yaml` at repo root drives this (add in the iOS-enablement step; keep signing secrets
in Codemagic's encrypted env, never committed — same rule as `deploy.sh`).

## No physical device on hand (2026-07-09)

Currently **no Android device and no Apple account** — so the on-device background matrix (the
real acceptance gate) can't be closed for either platform yet. The chosen path is **build-ahead**:
land all device-independent work now, hold the matrix open. See
[RESUME.md](RESUME.md#path-chosen-2026-07-09-build-ahead-device-independent-matrix-stays-an-open-gate).

- **Android emulator** (Android Studio AVD) runs a foreground + wiring smoke test using
  mock-GPS route playback. **Run it on the Windows host, not inside WSL2** (WSL2 lacks the
  KVM/GPU path for a usable emulator). It is **not** trustworthy for Doze/battery-optimization
  kills, multi-hour battery drain, or true "always" reliability — those need a real device.
- **Cheapest real unblock:** a ~$60–100 used Android phone closes the whole Android half of the
  matrix, Apple-independent. Highest-leverage spend for a safety-critical background feature.

## iOS build (cloud) — the WORKING Codemagic recipe (2026-07-26)

The no-Mac Codemagic → TestFlight pipeline is live and green ([codemagic.yaml](../../codemagic.yaml)).
Hard-won gotchas, in the order they bit us — keep these when touching the pipeline:

1. **Capacitor 8 iOS = Swift Package Manager, not CocoaPods.** `cap add ios` generates
   `ios/App/App.xcodeproj` + a `CapApp-SPM` package + `Package.swift` — **no `Podfile`, no
   `.xcworkspace`**. Build with `xcode-project build-ipa --project ios/App/App.xcodeproj --scheme App`.
   Do **not** run `pod install` or reference a workspace (both fail). Plugins are pulled via SPM on
   `cap sync`, not pods — this is the direction the `capacitor-best-practices` skill recommends.
2. **Signing is explicit + needs an RSA key.** `app-store-connect fetch-signing-files "$BUNDLE_ID"
   --type IOS_APP_STORE --certificate-key "@env:CERTIFICATE_PRIVATE_KEY" --create`. The `--create`
   makes the (first-time) iOS Distribution cert + App Store profile, but cert creation needs an RSA
   key: generate once (`openssl genrsa -out key.pem 2048`), store its contents as a **secure
   Codemagic var `CERTIFICATE_PRIVATE_KEY`** in group `ios_signing`. Codemagic reuses the cert on
   later builds. Then `keychain add-certificates` + `xcode-project use-profiles --project
   <explicit path>` (its default `**/*.xcodeproj` glob misses the nested Capacitor path).
   Prereq: bundle id `world.upto.app` registered in the Developer portal (Identifiers).
3. **Integration name** — `codemagic.yaml`'s `integrations: app_store_connect:` must match the App
   Store Connect API key name in Codemagic (currently `Sam Wood`).
4. **Publishing = upload-only** (`submit_to_testflight: false`). Uploading makes the build available
   to **internal** testers automatically (no Beta App Review). `submit_to_testflight: true` submits
   for **external** testing → demands Test Information (feedback email + reviewer contact) we don't
   need. Add self as internal tester in App Store Connect → TestFlight → Internal Testing.
5. **Export compliance** on first upload → "None of the algorithms mentioned above" (Upto is HTTPS
   only, no custom crypto) → exempt. `ITSAppUsesNonExemptEncryption=false` is now baked into
   `Info.plist`, so the per-build prompt is gone.

**`ios/` is committed as of 2026-07-31** — it had to be before Slice 2, because CI-regeneration
wiped `ios/App/App/Info.plist` on every build. It now carries:

| Key | Why |
|-----|-----|
| `NSLocationWhenInUseUsageDescription` | Foreground map position. Slice 1 already needed it. |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | The "always" rationale App Review reads. |
| `UIBackgroundModes: [location]` | Lets fixes keep arriving with the screen locked. |
| `ITSAppUsesNonExemptEncryption: false` | HTTPS only → export-compliance exempt. |

⚠️ `UIBackgroundModes: [location]` is declared **ahead of** the background-location code that uses
it. That is inert on device (nothing registers a background watcher until Slice 2 lands the
plugin) and fine for TestFlight, which is upload-only to internal testers with no Beta App Review.
It is **not** fine for a real App Store submission: Apple rejects apps that declare the background
location mode without demonstrably using it. Do not submit for review until Slice 2 is in.

## Slice 1 acceptance — CLOSED on iOS 2026-07-31

Verified on a real iPhone via TestFlight:

- [x] Capacitor initialised (ios + android) over the existing build; the Vercel web deploy is
      unchanged and still works (it is — the web build is untouched; `capacitor.config.ts`
      and the native dirs don't affect `vite build`).
- [x] The native app builds and runs on a device and tracks live location in the **foreground**
      with full Stage 1 parity (marker, liveness labels, privacy toggle).
- [x] The `with-trip` / `owner-only` / `off` privacy model behaves identically in the native
      shell (foreground): `owner-only` renders locally / never POSTs, `off` does not sample.

**Android is still unverified** — no device. `android/` is generated, committed and configured,
so it is build-ready, but nobody has run it. That gap folds into the Slice 2 on-device matrix,
which already carries Android as an explicit open gate.

The device run also surfaced eleven map defects that every automated check had passed — all
closed, see [.scratch/native-map-fixes/](../native-map-fixes/README.md). Budget device time for
each slice on that basis: the suite is necessary, it is not the gate.

Note on the dev server vs. bundled web: for a first run you can point the native shell at the
already-deployed web app (set `server.url` in `capacitor.config.json` to the Vercel URL) to
sanity-check the shell without bundling; for a real build, ship the bundled `dist/` (drop
`server.url`) so the app works offline. Decide this during standup.

## What comes next (not Slice 1)

- **Slice 2** — back `native-background` with a Capacitor background-geolocation plugin
  (survives lock/background/kill). This is the ADR-011 make-or-break wall; its acceptance gate
  is the on-device background matrix, not a unit suite. `detectPlatform()` + the throwing guard
  in `createPositionSource` are already waiting for it.
- The iOS permission strings are **already in** `ios/App/App/Info.plist` (see the table above).

## Background-geolocation plugin gotcha (Slice 2, landed 2026-08-01)

`@capacitor-community/background-geolocation` publishes a `Package.swift` pinning
`capacitor-swift-pm` **`from: "7.0.0"`**, which cannot satisfy our app's `exact: "8.4.1"`.
`npx cap sync ios` **rewrites it in `node_modules`** to `from: "8.0.0"`, so it resolves — but
only if sync runs *before* the Xcode build. The Codemagic pipeline does (`npm ci` → build →
assert → `cap sync ios` → `build-ipa`).

**If you ever build `ios/App/App.xcodeproj` straight after a fresh `npm ci` without syncing,
SPM resolution fails with a version conflict that looks nothing like this cause.** Run
`npx cap sync ios` first. The `cap sync` warning "built for Capacitor 7, it might cause issues"
is expected and is the same underlying fact.

Android needs **no** `ACCESS_BACKGROUND_LOCATION`: the plugin uses a foreground service typed
`location` and never references that permission, and declaring it would invite Play Store review
scrutiny for something unused. The plugin's manifest merges in what it does need
(`ACCESS_FINE/COARSE_LOCATION`, `FOREGROUND_SERVICE*`, `POST_NOTIFICATIONS`, the service). We
only set the notification channel name in `strings.xml`. See
[ADR 019](../../brain/decisions/019-background-geolocation-plugin.md).
