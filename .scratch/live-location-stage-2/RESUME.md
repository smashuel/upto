# Live location Stage 2 — RESUME HERE

Bookmark set 2026-07-09. Paused mid-Slice-01 to wait on the Apple Developer account +
Codemagic setup. Working on other things in the meantime.

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

## Where we are

Branch **`live-location-stage-2`**, **pushed** to `origin` (Codemagic builds from it). `ios/`
is gitignored + CI-generated each build. Uncommitted (leave, per convention): `data/doc-*.json`,
`.claude/settings.local.json`.

### Done ✅
- **Software seam** — `src/services/positionSource.ts`; ActiveTrip consumes it. node-test + vitest green.
- **Capacitor + Android + iOS** — Capacitor 8; `android/` committed; **`codemagic.yaml` → TestFlight working**.
- **Build-ahead seams** — `resolveSampleCadence` (Slice 3) + `nextFlushBatch` (Slice 4), TDD'd.
- PRD + 5 sliced issues + runbook in `.scratch/live-location-stage-2/`.

### Pending ⏳ — the next actions
1. **Verify Slice 01 foreground acceptance on the iPhone** (now possible via TestFlight): live-marker
   parity + liveness labels + privacy toggle (`with-trip`/`owner-only`/`off`) behave as web. Ticks
   the last Slice-01 boxes. **This is the immediate next step** before building background on top.
2. **Slice 02 — native background location** (the make-or-break). At this point **`ios/` must start
   being committed** (gitignore the CI-generate) so Slice-2 `Info.plist` permission strings
   (`NSLocation*UsageDescription`, `UIBackgroundModes`, `ITSAppUsesNonExemptEncryption=false`)
   persist across builds. Background-geolocation plugin via **SPM**, CapacitorHttp POST routing,
   then the on-device background matrix (locked/backgrounded/killed) — the acceptance gate.

Note: no Android device still — the Android half of the matrix stays open; iOS via TestFlight is
now the live verification path.

## After Slice 01 verifies → Slice 02 (native background location)

The real Stage 2 work. This is the ADR-011 make-or-break slice — on-device matrix (iOS via
TestFlight now) is the acceptance gate, not the unit suite. Issues: [issues/](issues/).
