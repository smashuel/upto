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

## Where we are

Branch **`live-location-stage-2`** (off `429c3bf`), **NOT pushed** — all local.
Uncommitted (leave as-is, per convention): `data/doc-*.json`, `.claude/settings.local.json`.

### Done ✅
- **Software seam** — `src/services/positionSource.ts` (`selectPositionSource`,
  `createPositionSource`, `detectPlatform`, `WebForegroundPositionSource`); ActiveTrip
  refactored to consume it (behaviour-preserving). 6 node-test cases. `59 node-test / 41 vitest`,
  tsc + lint clean.
- **Capacitor + Android** — Capacitor 8 installed; `android/` project generated + committed
  (appId `world.upto.app`); `cap sync` copies the Vite bundle; `cap:sync` / `cap:android` npm
  scripts added.
- PRD + 5 sliced issues + mobile standup runbook, all in `.scratch/live-location-stage-2/`.

### Pending ⏳
1. **Android on-device verify** (needs Android SDK / Android Studio — not in the Linux dev env):
   `npm run cap:android` → Run on emulator/phone → confirm foreground live-marker parity +
   privacy toggle. Ticks the last of Slice 01's on-device acceptance.
2. **iOS via Codemagic → TestFlight** — BLOCKED on the user's Apple Developer account (pending).
   When ready: user links GitHub↔Codemagic + uploads an App Store Connect API key + registers
   bundle id `world.upto.app`; **I** then write `codemagic.yaml` + generate `ios/`. First
   requirement: **`git push`** this branch (Codemagic builds from GitHub).

## Resume trigger

When the Apple account is active → say "wire Codemagic" and I'll draft `codemagic.yaml` +
`ios/` generation. See [mobile-standup-runbook.md](mobile-standup-runbook.md) §"iOS build (cloud)".

## After Slice 01 closes → Slice 02 (native background location)

The real Stage 2 work. `native-background` source behind the seam + `resolveSampleCadence`
(Slice 03) + `nextFlushBatch` (Slice 04) are all cross-platform TS, buildable/testable here.
Android background matrix verifies on-device; iOS via TestFlight. This is the ADR-011
make-or-break slice — on-device matrix is the acceptance gate, not the unit suite.
Issues: [issues/](issues/).
