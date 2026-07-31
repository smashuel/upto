# Live location Stage 2 — RESUME HERE

**Bookmark updated 2026-07-31. Slice 01 is CLOSED on iOS. The next work is Slice 02 —
native background location, the ADR-011 make-or-break slice. Jump to
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

## Next: Slice 02 — native background location

The real Stage 2 work and the **ADR-011 make-or-break slice**: if a locked iPhone in a pocket
can't keep its watchers informed, the feature doesn't exist. Concrete build plan:
[PRD-slice-02-native-background.md](PRD-slice-02-native-background.md) ·
[issue 02](issues/02-native-background-location.md).

Starting state is better than the plan assumes — the iOS `Info.plist` half is already done, so
begin at the plugin:

1. **Plugin** — `@capacitor-community/background-geolocation` via SPM (Capacitor 8 iOS is SPM,
   there is no `pod install`). Fallback if it can't hold iOS "always": Transistorsoft — that is
   ADR 011's reconsider clause going live, and it's a *slice outcome decided by the device
   matrix*, not a unit-test result.
2. **`toPositionFix(pluginLocation)`** — the one new pure seam. TDD under `node --test`.
3. **Contextual "always" permission** with a rationale, at trip-goes-active; "while using"
   degrades honestly to foreground-only with a notice.
4. **CapacitorHttp POST routing** so background delivery survives Android's ~5-min WebView HTTP
   throttle. Platform-guard the web-only `pagehide` → unavailable beacon: on native,
   backgrounding must keep publishing, not retract.
5. **Android manifest** — `ACCESS_BACKGROUND_LOCATION`, `POST_NOTIFICATIONS`.
6. **The on-device matrix** — {foreground, backgrounded, locked, killed-relaunched} ×
   {`off`, `owner-only`, `with-trip`}. This is the acceptance gate.

**Red flag to watch for:** if Slice 2 forces edits to `applyLifecycleEvent`,
`shouldBroadcastPosition` or `describeLiveness`, the source swap has leaked. Slice 1 built the
seam precisely so this is a source swap plus delivery reliability, nothing more.

Still no Android device — the Android half of the matrix stays an open gate; iOS via TestFlight
is the live verification path.
