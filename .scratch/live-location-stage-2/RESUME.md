# Live location Stage 2 — RESUME HERE

Bookmark set 2026-07-09. Paused mid-Slice-01 to wait on the Apple Developer account +
Codemagic setup. Working on other things in the meantime.

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
