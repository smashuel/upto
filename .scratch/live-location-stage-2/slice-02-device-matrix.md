# Slice 02 — on-device background matrix

**Round 1: RUN 2026-08-03** (iPhone 16 / iOS 26.4.1, build 25E253 / `9f98dc1`) — full results and
verdict archived in [slice-02-device-matrix-round-1.md](slice-02-device-matrix-round-1.md).

**Round 2: NOT RUN.** This is the retest sheet. Fixes for issues 06–10 landed 2026-08-03 and need
a new TestFlight build to verify.

Build tested: _______   Device / iOS: _______   Date: _______

---

## Round 1 outcome, in one paragraph

**Background tracking held.** Locked in a pocket for 20 minutes, steady ~3-minute updates, past
the 5-minute HTTP-throttle mark. That was the make-or-break question, so
`@capacitor-community/background-geolocation` stays and ADR 011's reconsider clause is **not**
triggered. Six defects were found, all in our own consumer logic rather than the plugin.

## What changed since round 1

| Issue | Change | Retest |
|---|---|---|
| [07](issues/07-stationary-traveller-produces-no-fixes.md) stationary → no fixes | `distanceFilter` 10 m → **0**; the time throttle alone sets the pace | **B** |
| [10](issues/10-sampling-cadence-too-slow.md) cadence too slow | 3 min → **30 s** ([ADR 020](../../brain/decisions/020-thirty-second-sampling-cadence.md)); battery readout added | **A, D** |
| [06](issues/06-sharing-resume-does-not-recover-watchers.md) resume never recovers | expected to fall out of 07 — no separate fix | **C** |
| [09](issues/09-owner-marker-freezes-on-own-map.md) own marker freezes | stale position cleared on teardown; root cause in 07 | **B, C** |
| [08](issues/08-watcher-removal-failure-is-invisible.md) indicator lingers | a failed removal now **tells you**, instead of being discarded | **C** |
| [11](issues/11-relaunch-does-not-return-to-live-trip.md) relaunch doesn't resume | **not fixed** — needs a product decision | — |

---

# Round 2 — the retest (about 60 min)

Same setup as before: go outside, move, second device for the watcher view. **Fixes now arrive
every 30 seconds, so everything is far quicker to judge than last time.**

## A — Cadence and battery ⭐ prioritise this one (30+ min)

Start a trip with sharing on **Watchers**. Walk. Then leave it running while you do something
else — the longer the better; the readout won't project a rate until 20 minutes in.

- [ ] Watcher updates arrive roughly every **30 seconds**
- [ ] A **battery line appears under the sharing toggle** on the trip screen

Battery line after ~20 min, verbatim: ______________________________

Battery line after an hour or more: ______________________________

> **This number decides ADR 020.** 30 s was chosen on a safety argument without its battery cost;
> the readout exists to settle it with data rather than opinion. Rough bar: a 10-hour day must
> not need more than about half a charge, because you need battery left for the emergency the app
> exists for. If it fails, the answer is finishing Slice 3 (traveller-chosen power modes), not
> simply reverting to 3 minutes.

## B — Stationary traveller (10 min) — this was the root cause

Stand still, phone locked, trip live.

- [ ] Watcher keeps updating every ~30 s **while you are not moving**
- [ ] Your own marker on your phone stays current rather than freezing
- [ ] Watcher never says "paused" while you're standing there

> Round 1 produced **no fixes at all** when stationary — that is what broke tests 6 and 7. This is
> the direct check that `distanceFilter: 0` fixed it.

## C — Privacy toggles — the round-1 failures (10 min)

Mid-trip, cycle **Watchers → Only me → Off → Watchers**, pausing on each.

- [ ] **Only me**: your own marker keeps updating; watcher stops and says so
- [ ] **Off**: blue location indicator disappears **within a few seconds, no refresh**
- [ ] **Off**: your own marker stops
- [ ] **Back to Watchers**: watcher recovers **within ~30 s** ← round 1 never recovered at all
- [ ] Do the whole cycle **standing still**, then again **walking**. Both must work.

If a red toast appears saying background location could not be fully stopped, **write it down
verbatim**. That is the new issue-08 instrumentation firing, and it means the OS may still be
collecting your location after you chose Off:

______________________________________________________________________

## D — Sanity re-check of what already passed (10 min)

The cadence change touches the same code path, so confirm nothing regressed.

- [ ] Backgrounded (switch to another app): watcher keeps updating, does **not** say "paused"
- [ ] Screen locked in pocket 10 min: still updating at the end
- [ ] Permission prompt still appears only when a trip goes live, not on launch

## E — Overdue keeps tracking (10 min) — never run

Set a short expected-return time and let it lapse.

- [ ] Status goes overdue and the email arrives
- [ ] Position **keeps updating** while overdue ← the period watchers most need it

---

## Not being retested, and why

- **[Issue 11](issues/11-relaunch-does-not-return-to-live-trip.md)** — a force-quit doesn't resume
  tracking. Confirmed in round 1 and deliberately not fixed: the options are auto-opening a live
  trip on launch (hijacks app launch) or lifting the source above the screen (bigger, and also
  fixes navigating to Profile stopping tracking). **Your call before I build either.**
- **Android** — still no device. That half of the matrix stays open.

## Round 2 verdict

- [ ] **PASS** — A, B and C all clean → Slice 02 closes.
- [ ] **Battery fails the bar** → ADR 020 reconsider: finish Slice 3 power modes.
- [ ] **Something else** — note it below:

______________________________________________________________________
