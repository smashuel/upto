# Slice 02 — on-device background matrix (the acceptance gate)

Status: NOT RUN
Build tested: _______  (Codemagic build number / commit)
Device / iOS version: _______
Date: _______

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

- [ ] No prompt on launch
- [ ] Prompt appears at trip start
- [ ] "Always Allow" was granted

Notes: ______________________________________________

> If you only ever get "While Using", say so — that path is **known not to be labelled** in the
> UI (the plugin exposes no permission-state API, ADR 019). Tracking will simply stop when you
> background the app, and watchers will see "paused". That's expected-but-unlabelled, not a new
> bug.

---

## Test 2 — Foreground (5 min)

Walk with the app open on the trip screen.

- [ ] Your own marker moves on your map
- [ ] Watcher view shows the marker moving
- [ ] Watcher liveness reads "updated N min ago" with N small

---

## Test 3 — Backgrounded (10 min)

Switch to another app (Camera, Messages) and keep walking.

- [ ] iOS shows the **blue location indicator** in the status bar
- [ ] Watcher marker keeps moving
- [ ] Watcher does **NOT** flip to "paused" / "unavailable" ← *this is the `shouldRetractOnHide`
      fix; if it says paused the moment you leave the app, that fix regressed*

---

## Test 4 — Screen locked, phone in pocket (20 min) ⭐ THE ONE THAT MATTERS

**This is the make-or-break test.** If it fails, the slice fails, regardless of everything else.

Lock the phone, put it in a pocket, walk for 20 minutes. Don't peek.

- [ ] Watcher marker updated throughout — **write down the gaps between updates**
- [ ] Still updating at the 20-minute mark (not just the first few)
- [ ] Updates continued past the **5-minute** mark ← the WebView HTTP throttle would show here

Longest gap observed: ______ minutes

> A steady ~3-minute cadence is a pass. Updates that stop after ~5 minutes point at HTTP
> delivery; updates that stop after ~10–15 minutes point at iOS suspending the app. **Either
> one is the ADR 011 reconsider trigger, not a bug to chase** — record it and stop.

---

## Test 5 — Killed and relaunched (10 min)

With the trip still active, swipe up to force-quit the app. Wait 2 minutes, walk, then reopen it.

- [ ] After relaunch, tracking resumes once you're back on the trip screen
- [ ] Does the app reopen **on the trip screen** or at the home screen? ____________

> **Known limitation, expect a partial pass.** A full swipe-kill relaunches at the app root, and
> tracking will not resume until you navigate back to the trip. Fixing that means auto-opening a
> live trip on launch — a product decision I flagged rather than guessed at. Just record what it
> does.

---

## Test 6 — Privacy: `owner-only` (5 min)

Mid-trip, switch sharing to **Just me**.

- [ ] Your own marker still updates on your phone
- [ ] Watcher view stops updating and says so
- [ ] Blue location indicator still on (you're still sampling, just not publishing)

---

## Test 7 — Privacy: `off` genuinely collects nothing (5 min) ⭐ SECOND MOST IMPORTANT

Mid-trip, switch sharing to **Off**.

- [ ] Blue location indicator **disappears within a few seconds** ← proves the native watcher was
      actually removed, not merely ignored
- [ ] Watcher view stops updating
- [ ] Your own marker stops updating too
- [ ] Turn sharing back to **Share with trip** → indicator returns and updates resume

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

Battery % at trip start: ____  End: ____  Elapsed: ____ min

> Settings → Battery → find Upto for a per-app figure after a few hours.

---

## Verdict

- [ ] **PASS** — Tests 3, 4 and 7 all clean. Slice 02 closes.
- [ ] **FAIL** — background tracking not held. → ADR 011 reconsider clause: move to
      `@transistorsoft/capacitor-background-geolocation` behind the same seam.

What actually happened:

______________________________________________________________________
