# Slice 02 — device matrix, ROUND 1 (archived)

> Completed run, kept as the record. The live retest sheet is
> [slice-02-device-matrix.md](slice-02-device-matrix.md).

Status: RUN 2026-08-03 — tests 1-7 complete, 8 and 9 not run. See Verdict.
Build tested: 25E253 / 9f98dc1  (Codemagic build number / commit)
Device / iOS version: iPhone 16 / Version 26.4.1
Date: 3-Aug-2026

Fill this in as you go. A green unit suite is necessary and **not** sufficient — this document
is what closes the slice. See [issue 02](issues/02-native-background-location.md) and
[ADR 019](../../brain/decisions/019-background-geolocation-plugin.md).

---

## Before you start

- **Two phones is much easier than one.** You are the traveller on the iPhone; the watcher view
  is the share link open on a laptop or second device. Alone, you can't see what a watcher sees
  while your phone is locked in your pocket — which is the entire thing being tested.
- **Go outside, and move.** The plugin reports on movement (`distanceFilter` 10 m). Sitting at a
  desk produces almost nothing, and you'll wrongly conclude tracking is broken.
- **Allow about 90 minutes**, mostly waiting. Test 4 alone needs a 20-minute walk.
- **Expected cadence is one fix per ~3 minutes.** Not instant. Don't judge a test in 30 seconds.
- Keep the watcher view open the whole time and note the timestamps it shows.

---

## Test 1 — Permission prompt is contextual (5 min)

The prompt must appear **when a trip goes live**, never on app launch.

1. Force-quit and relaunch the app. → **No location prompt should appear.**
2. Create a TripLink and start it with sharing set to **Share with trip**.
3. iOS asks for location. Choose **Allow While Using App** if offered, then expect a second,
   later prompt for **Always Allow** (iOS often defers this until the app actually backgrounds).

- [X] No prompt on launch
- [X] Prompt appears at trip start
- [X] "Always Allow" was granted

Notes: No prompt on launch. Then when trip route was opened on the map to be drawn It asked for never allow, allow while using or always allow. I selected allow while using. Then when i went to start trip, it asked that "upto" uses location in the background, and gave the option to always allow, which i did and it worked.

> If you only ever get "While Using", say so — that path is **known not to be labelled** in the
> UI (the plugin exposes no permission-state API, ADR 019). Tracking will simply stop when you
> background the app, and watchers will see "paused". That's expected-but-unlabelled, not a new
> bug.

---

## Test 2 — Foreground (5 min)

Walk with the app open on the trip screen.

- [X] Your own marker moves on your map
- [X] Watcher view shows the marker moving
- [X] Watcher liveness reads "updated N min ago" with N small

---

## Test 3 — Backgrounded (10 min)

Switch to another app (Camera, Messages) and keep walking.

- [X] iOS shows the **blue location indicator** in the status bar
- [X] Watcher marker keeps moving
- [X] Watcher does **NOT** flip to "paused" / "unavailable" ← *this is the `shouldRetractOnHide`
      fix; if it says paused the moment you leave the app, that fix regressed*

---

## Test 4 — Screen locked, phone in pocket (20 min) ⭐ THE ONE THAT MATTERS

**This is the make-or-break test.** If it fails, the slice fails, regardless of everything else.

Lock the phone, put it in a pocket, walk for 20 minutes. Don't peek.

- [X] Watcher marker updated throughout — **write down the gaps between updates**
- [X] Still updating at the 20-minute mark (not just the first few)
- [X] Updates continued past the **5-minute** mark ← the WebView HTTP throttle would show here

Longest gap observed: 3 minutes (i think we should lower this )

> A steady ~3-minute cadence is a pass. Updates that stop after ~5 minutes point at HTTP
> delivery; updates that stop after ~10–15 minutes point at iOS suspending the app. **Either
> one is the ADR 011 reconsider trigger, not a bug to chase** — record it and stop.

---

## Test 5 — Killed and relaunched (10 min)

With the trip still active, swipe up to force-quit the app. Wait 2 minutes, walk, then reopen it.

- [X] After relaunch, tracking resumes once you're back on the trip screen
- [X] Does the app reopen **on the trip screen** or at the home screen? home screen, I had to go into past trip, and selected the 'active' trip to get back to the page

> **Known limitation, expect a partial pass.** A full swipe-kill relaunches at the app root, and
> tracking will not resume until you navigate back to the trip. Fixing that means auto-opening a
> live trip on launch — a product decision I flagged rather than guessed at. Just record what it
> does.

---

## Test 6 — Privacy: `owner-only` (5 min)

Mid-trip, switch sharing to **Just me**.

- [ ] Your own marker still updates on your phone
      note: it went my location at the start of the trip and stayed there
- [X] Watcher view stops updating and says so
      note: although this was extremely delayed
- [X] Blue location indicator still on (you're still sampling, just not publishing)

---

## Test 7 — Privacy: `off` genuinely collects nothing (5 min) ⭐ SECOND MOST IMPORTANT

Mid-trip, switch sharing to **Off**.

- [X] Blue location indicator **disappears within a few seconds** ← proves the native watcher was
      actually removed, not merely ignored. 
      note: but this required a refresh and so took longer than a few seconds, it didnt really respond in a 'live' manner
- [X] Watcher view stops updating
- [X] Your own marker stops updating too
      note: my marker just stayed at the beginning of the trip, no change
- [ ] Turn sharing back to **Share with trip** → indicator returns and updates resume
      note: this did not recover well, the watcher still only shows live tracking paused - last known 13min ago

> The blue indicator vanishing is the real assertion here. "Off" that keeps the OS collecting
> location while telling the traveller it isn't would be the worst bug this app could ship.

---

## Test 8 — Overdue keeps tracking (10 min)

Let a trip go past its expected return time (or set a short one deliberately).

- [ ] Status goes overdue, and the overdue email arrives
- [ ] Position **keeps updating** while overdue ← the period watchers most need it

---

## Test 9 — Stationary traveller (10 min) — observation, not pass/fail

Stop moving for 10 minutes with the trip live and the phone locked.

What does the watcher view say after 10 minutes? ______________________________

> By design a stationary phone produces no new fixes, so a traveller resting at a hut will read
> as stale. Honest, but it may read as alarming. **This is the open question in ADR 019** — your
> answer decides whether a heartbeat is worth adding in Slice 3. Note that a heartbeat re-sending
> a last-known position as if it were current is exactly the fabricated freshness this codebase
> refuses everywhere else, so it would need a different design.

---

## Battery (record opportunistically)

Battery % at trip start: 28% 8:23am  End: ____  Elapsed: ____ min

> Settings → Battery → find Upto for a per-app figure after a few hours.

---

## Verdict — 2026-08-03

- [x] **The ADR-011 bet is validated. Do NOT trigger the reconsider clause.**
- [ ] PASS — not yet; test 7 was not clean. Slice 02 stays open on six defects.
- [ ] FAIL — background tracking not held. *(Not this. It held.)*

### What actually happened

**The hard part worked.** Test 3 (backgrounded) and test 4 (locked, in pocket, 20 minutes) were
both clean, with a steady ~3-minute cadence holding past the 5-minute HTTP-throttle mark and all
the way to 20 minutes. That was the make-or-break question and the answer is yes: a locked iPhone
in a pocket keeps its watchers informed.

So `@capacitor-community/background-geolocation` stays. **None of the defects below are in the
plugin** — they are all in our own consumer logic around the sharing toggle and the cadence
model. That distinction is the whole point of having run this: it is the difference between
"change the foundation" and "fix six things we wrote."

`shouldRetractOnHide` also proved out — backgrounding did not flip watchers to "paused", which
was the one-line fix that would otherwise have undone the slice at the last step.

### The defects, filed

| # | Issue | Why it matters |
|---|-------|----------------|
| [06](issues/06-sharing-resume-does-not-recover-watchers.md) | Sharing `off` → back on never recovers watchers | **Worst shape available**: the app says you're being watched and you aren't |
| [07](issues/07-stationary-traveller-produces-no-fixes.md) | A stationary traveller produces no fixes at all | Root cause behind 06 and 09 |
| [08](issues/08-watcher-removal-failure-is-invisible.md) | Blue indicator needs a refresh to clear after `off` | We cannot currently tell a privacy failure from OS lag |
| [09](issues/09-owner-marker-freezes-on-own-map.md) | Traveller's own marker freezes | Probably a symptom of 07 |
| [10](issues/10-sampling-cadence-too-slow.md) | ~3-min cadence feels too coarse | Battery trade → Slice 3's built seam |
| [11](issues/11-relaunch-does-not-return-to-live-trip.md) | Relaunch after a kill doesn't resume tracking | Confirmed known limitation; silent |

**Fix 07 first.** It plausibly resolves 06 and 09 on its own, and fixing those before it would
mean building around a cause instead of removing it.

### Not run

Tests 8 (overdue keeps tracking) and 9 (stationary observation). Test 9 was largely answered
sideways anyway — issue 07 *is* the stationary finding, discovered because it broke two other
tests. Test 8 still needs doing; overdue email delivery was separately confirmed working on
2026-08-01.

### Also noted

Test 1 produced **two** permission prompts, not one: location when the map opened to draw a
route, then background-location at trip start. Both were contextual and both were granted, so it
passed — but the first one comes from the map's own current-location lookup, not the trip. Worth
knowing it exists; not filed.
