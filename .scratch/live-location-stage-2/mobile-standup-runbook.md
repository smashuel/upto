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
- **`.gitignore`** ignores `/ios/` and `/android/` (generated per-machine). Un-ignore + commit
  if the team decides to version the native projects.

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

`npx cap add ios` generates the `ios/` project; it can be generated on the cloud macOS runner
(or committed once, from any `cap add ios` output) — it does **not** need to be created locally.
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

## Remaining Slice 1 acceptance (verify on device — Android here, iOS via TestFlight)

These issue-01 criteria need a running native app to tick:

- [ ] Capacitor initialised (ios + android) over the existing build; the Vercel web deploy is
      unchanged and still works (it is — the web build is untouched; `capacitor.config.json`
      and the ignored native dirs don't affect `vite build`).
- [ ] The native app builds and runs on a device/simulator and tracks live location in the
      **foreground** with full Stage 1 parity (marker, liveness labels, privacy toggle).
- [ ] The `with-trip` / `owner-only` / `off` privacy model behaves identically in the native
      shell (foreground): `owner-only` renders locally / never POSTs, `off` does not sample.

Note on the dev server vs. bundled web: for a first run you can point the native shell at the
already-deployed web app (set `server.url` in `capacitor.config.json` to the Vercel URL) to
sanity-check the shell without bundling; for a real build, ship the bundled `dist/` (drop
`server.url`) so the app works offline. Decide this during standup.

## What comes next (not Slice 1)

- **Slice 2** — back `native-background` with a Capacitor background-geolocation plugin
  (survives lock/background/kill). This is the ADR-011 make-or-break wall; its acceptance gate
  is the on-device background matrix, not a unit suite. `detectPlatform()` + the throwing guard
  in `createPositionSource` are already waiting for it.
- Background permission strings (iOS `NSLocation*UsageDescription`, Android
  `ACCESS_BACKGROUND_LOCATION`) get added to the native projects in Slice 2, with the
  contextual-rationale UX from the PRD.
