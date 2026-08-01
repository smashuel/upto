# Live location Stage 2 — RESUME HERE

**Bookmark updated 2026-08-01. Slice 01 is CLOSED on iOS. Slice 02 is BUILT and unit-green, but
its gate — the on-device background matrix — has NOT been run. The next action is a TestFlight
build and that matrix, not more code. Jump to
[§ Next: Slice 02](#next-slice-02--native-background-location).**

History below is kept because the constraints it records (no Android device, the device-gated
matrix) are still live.

## Path chosen 2026-07-09: BUILD-AHEAD (device-independent), matrix stays an open gate

Constraints: Apple Developer account pending **and no physical Android device**. Decision:
build everything device-independent now; the **on-device background matrix is an explicit open
gate** (a green unit suite is *necessary but not sufficient* — PRD). Closes when a real Android
phone or TestFlight (post-Apple) is in hand. Recommendation on record: a ~$60–100 used Android
phone is the highest-leverage unblock — Apple-independent, closes the entire Android half of the
gate. Emulator (Android Studio AVD, run on the Windows host — WSL2 can't) is a foreground +
wiring smoke test only, **not** trustworthy for Doze/battery/kill reliability, which is the risk.

### Build-ahead landed 2026-07-09
- **Skill review** (`/capacitor-best-practices` + `/capacitor-plugins`) → findings folded into
  [issues 02](issues/02-native-background-location.md) / [04](issues/04-offline-store-and-forward.md) /
  [05](issues/05-watcher-push-escalation.md). Two code-confirmed 🔴: Android WebView HTTP throttle
  (>5 min bg) → use CapacitorHttp; native API base URL was `''` same-origin → broken in the shell.
- **Config hardening:** `capacitor.config.json` → `capacitor.config.ts` with `android.useLegacyBridge`
  + `CapacitorHttp` enabled; native builds now target an absolute backend origin; backend CORS
  extended to the Capacitor origin.
- **Slice 3 `resolveSampleCadence`** + **Slice 4 `nextFlushBatch`** — pure functions, TDD'd under
  `node --test`. (Slice 3 profile power-mode UI + persistence still pending; the seam is done.)

### Still device-gated (the open matrix)
Slice 2 native background source, Slice 5 push *delivery*, battery drain, dead-zone reconnect —
all need a real device. Code can be written to "device-ready"; sign-off cannot happen here.

## 🎉 MILESTONE 2026-07-26: iOS app live on TestFlight — the Codemagic pipeline works

The Apple account landed and the **no-Mac cloud build is fully working end to end**: deps →
web build → Capacitor SPM sync → iOS compile → cert+profile creation → signed archive →
App Store Connect upload → TestFlight. The app installs and runs on a real iPhone. This
closes the iOS-build/signing/store ops unknown ADR 011 flagged as the project's new risk.

**The Codemagic recipe (hard-won — full detail in the runbook §"iOS build (cloud)"):**
- Capacitor 8 iOS is **Swift Package Manager, not CocoaPods** — no `Podfile`/`.xcworkspace`;
  build `--project ios/App/App.xcodeproj` (scheme `App`), no `pod install`.
- Signing is **explicit**: `fetch-signing-files --create` needs an RSA key → secure Codemagic
  var `CERTIFICATE_PRIVATE_KEY` (group `ios_signing`) creates+reuses the distribution cert;
  `use-profiles --project <path>` (default glob misses the nested Capacitor path).
- Publishing is **upload-only** (`submit_to_testflight: false`) → internal testers get every
  processed build with no Beta App Review. Export compliance = "None of the algorithms" (HTTPS
  only) → exempt.

## ✅ 2026-07-31: Slice 01 CLOSED on iOS — the shell is real, and it cost eleven bugs

Foreground live location verified on a real iPhone: live-marker parity, liveness labels, and the
`with-trip` / `owner-only` / `off` privacy toggle all behave as on web. Slice 01 is done.

**The lesson worth carrying into every remaining slice:** the build that went to the device had
passed tsc, lint and the full suite, and the iPhone still surfaced **eleven** distinct map
defects — one of them data-loss severity (placing a note wiped the in-progress trip; the cause
was a nested `<form>`, nothing Cesium-related, and it took four rounds to find because three
plausible Cesium hypotheses got chased first). All eleven are now closed:
[.scratch/native-map-fixes/](../native-map-fixes/README.md). Two of them were product gaps a
real user surfaced, not bugs, and became decisions: notes persist on the TripLink, and a
TripLink holds exactly one route ([ADR 018](../../brain/decisions/018-one-route-per-triplink.md)).

Budget device time per slice on that basis. The PRD's "necessary but not sufficient" line about
the unit suite is not a formality — it is the observed behaviour of this codebase.

**Also landed:** `ios/` is now **committed** with its location permission strings, and `keys/` +
`*.p8`/`*.p12`/`*.mobileprovision`/`*.cer` are gitignored (two Apple private keys were sitting
untracked and un-ignored — never committed, verified against full history, but one `git add .`
away). CI asserts the iOS config rather than regenerating it.

## Where we are

Branch **`live-location-stage-2`**, **pushed** to `origin` (Codemagic builds from it). `ios/` and
`android/` are both **committed**. Uncommitted (leave, per convention): `data/doc-*.json`,
`.claude/settings.local.json` — plus, currently, the **Valhalla routing** thread's changes to
`brain/project/status.md`, `roadmap.md`, `CONTEXT.md` and the untracked `brain/{decisions,plans}`
Valhalla files. Don't sweep those into a Stage 2 commit.

### Done ✅
- **Slice 01 — CLOSED on iOS 2026-07-31.** Software seam (`src/services/positionSource.ts`) +
  Capacitor 8 shell + `codemagic.yaml` → TestFlight, verified on device.
- **Native config durable** — `ios/` committed with `NSLocation*UsageDescription`,
  `UIBackgroundModes: [location]`, `ITSAppUsesNonExemptEncryption=false`.
- **Build-ahead seams** — `resolveSampleCadence` (Slice 3) + `nextFlushBatch` (Slice 4), TDD'd.
- **Native map defect sweep** — all 11 closed.
- PRD + 5 sliced issues + runbook in `.scratch/live-location-stage-2/`.

## Next: Slice 02 — native background location (BUILT 2026-08-01, gate NOT passed)

The real Stage 2 work and the **ADR-011 make-or-break slice**: if a locked iPhone in a pocket
can't keep its watchers informed, the feature doesn't exist. The code is written and unit-green
(180 node-test + 52 vitest). **That is not the gate.** Full detail:
[issue 02](issues/02-native-background-location.md) ·
[ADR 019](../../brain/decisions/019-background-geolocation-plugin.md).

Built: `@capacitor-community/background-geolocation` behind `NativeBackgroundPositionSource`;
`toPositionFix` (the pre-agreed pure seam) and `shouldRetractOnHide` TDD'd; the Slice-1 throwing
guard replaced by the real native branch. **The `pagehide` retraction is now platform-guarded**
— without that, every time the traveller pocketed their phone the native app would have told
their watchers tracking had stopped, which would have undone the slice at the last step.

Two PRD items needed **no code**: CapacitorHttp already patches `window.fetch` via config
(verified against the native bridge source), and Android needs no `ACCESS_BACKGROUND_LOCATION`
(foreground-service model; declaring it invites Play Store scrutiny for nothing).

### The immediate next action is a device, not more code

**Fill in [slice-02-device-matrix.md](slice-02-device-matrix.md)** — a step-by-step checklist of the
nine tests, with what each one proves and what a failure means. Summary: {foreground, backgrounded, screen-locked, killed-then-relaunched} × {`off`,
`owner-only`, `with-trip`}, plus the contextual "always" prompt, >5 min background delivery, the
iOS blue status-bar indicator, and how a *stationary* traveller's staleness reads.

**If iOS "always" doesn't hold, that is the answer, not a bug to chase** — it triggers ADR 011's
reconsider clause and the move to Transistorsoft. Same seam, one class.

### Three things deliberately not built — decide before building

1. **"While using" gets no explicit notice.** The plugin has no permission-state API. Degrades
   through the existing liveness labels instead: honest, unlabelled.
2. **Full-app-kill relaunch doesn't resume tracking** (a WebView process kill does). Fixing it
   means auto-navigating to a live trip on launch — a product call about hijacking app launch.
3. **Navigating away from the trip page in-app stops tracking.** Backgrounding does *not*
   (React stays mounted), so the pocket/lock case is fine. The fix is lifting the source to an
   app-level service, which is bigger than a source swap.

**Red flag to watch for:** if further Slice 2 work forces edits to `applyLifecycleEvent`,
`shouldBroadcastPosition` or `describeLiveness`, the source swap has leaked. It hasn't so far —
those three seams were untouched, which is the evidence the seam did its job.

Still no Android device — the Android half of the matrix stays an open gate; iOS via TestFlight
is the live verification path.
