# Slice 2 — Native background location (survives lock / background / kill)

Status: ready-for-agent
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
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

## Acceptance criteria

- [ ] A Capacitor background-geolocation plugin is chosen and wired behind the
      `native-background` source; the choice + iOS-"always" rationale is recorded (candidate ADR
      note).
- [ ] `android.useLegacyBridge: true` and `CapacitorHttp` enabled; the position POST goes
      through native HTTP (not WebView `fetch`) on native, verified to survive > 5 min
      backgrounded on a real Android device.
- [ ] Position keeps updating with the app backgrounded and the screen locked, verified on a
      real iOS device (and Android).
- [ ] Tracking resumes automatically after an OS-kill relaunch mid-trip.
- [ ] "Always allow" is requested contextually with a rationale; "while using" degrades to
      foreground-only with an explicit notice; denial is reflected in the ActiveTrip chip (Stage
      1 contract).
- [ ] `off` stops the native sampler entirely (nothing collected); `owner-only` never POSTs;
      `with-trip` POSTs — verified in the native shell.
- [ ] Tracking continues while the trip is `overdue`, not only `active`.
- [ ] Watcher-side liveness labels (fresh / stale / unavailable) behave exactly as Stage 1 —
      background tracking just makes `fresh` more common (regression check, no new rules).
- [ ] On-device test matrix executed and recorded: {iOS, Android} × {foreground, backgrounded,
      locked, killed-then-relaunched}. A green unit suite is necessary but **not** the acceptance
      gate for this slice — the matrix is.

## Blocked by

- Slice 1 (01-capacitor-shell-and-source-seam) — needs the shell and the `PositionSource` seam.
