# Mobile standup runbook — Capacitor native shell (Stage 2 Slice 1)

The **software half** of Slice 1 (the `PositionSource` seam + ActiveTrip refactor) is done,
tested, and merged. The **native half** — actually initialising Capacitor and building the app
— must run on a **Mac with Xcode + Android SDK**; it cannot be done in the Linux/CI environment
this repo is otherwise developed in. This runbook is the turnkey standup. When Stage 2 ships,
this graduates into [brain/project/deployment.md](../../brain/project/deployment.md).

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

## Prerequisites (Mac)

- Xcode + Command Line Tools, CocoaPods (`sudo gem install cocoapods`).
- Android Studio + SDK (for the Android target), a JDK.
- Node 22 (matches the repo).

## Standup commands

```bash
# 1. Install Capacitor (core + CLI + both native platforms)
npm i @capacitor/core
npm i -D @capacitor/cli
npm i @capacitor/ios @capacitor/android

# 2. Build the web app first — Capacitor wraps the dist/ output named in capacitor.config.json
npm run build

# 3. Add the native platforms (generates ios/ and android/ — the parts that need a Mac)
npx cap add ios
npx cap add android

# 4. Copy the web build + native plugin config into the platforms
npx cap sync

# 5. Open in the native IDEs to run on a simulator / device
npx cap open ios       # → Xcode: pick a simulator/device, Run
npx cap open android   # → Android Studio: Run
```

Add these convenience scripts to `package.json` once the deps are installed:

```json
"cap:sync": "npm run build && npx cap sync",
"cap:ios": "npm run build && npx cap sync ios && npx cap open ios",
"cap:android": "npm run build && npx cap sync android && npx cap open android"
```

## Remaining Slice 1 acceptance (Mac-only — verify + tick on device)

These are the issue-01 criteria that could not be verified in the Linux environment:

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
