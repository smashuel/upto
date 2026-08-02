# 11 — After a force-quit, the app reopens at the home screen and tracking stays off

Status: needs-decision — the fix is a product call about app launch
Priority: medium-high — it is silent, and it happens exactly when the phone is under stress
Surfaced: Slice 02 device matrix test 5, 2026-08-03 — *"home screen, I had to go into past trip, and selected the 'active' trip to get back to the page"*
Area: `src/App.tsx` routing / launch behaviour, `src/pages/ActiveTrip.tsx`

## What happens

Confirmed on device, as predicted. Force-quitting the app mid-trip and relaunching lands on the
home screen. Tracking does **not** resume until the traveller manually navigates to My Trips and
opens the active trip. It does resume correctly once they do.

The position source lives in `ActiveTrip`'s effect, so it only exists while that screen is
mounted.

## Why it matters more than "the user can just tap twice"

The traveller has no reason to think anything is wrong. They started a trip, sharing was on, and
the app is open — nothing tells them tracking stopped. Meanwhile their watchers see the marker go
stale, which after long enough is indistinguishable from an emergency.

And it fires under exactly the conditions where you want it least: a low-memory kill on a cold
day with a lot of apps open, or a traveller who habitually swipes apps away. iOS also does this
on its own, without the user swiping anything.

## Options

1. **Resume on launch.** On start, if the account has an `active` or `overdue` trip, route
   straight to it. Directly fixes the reported behaviour. The product question is whether
   hijacking app launch is acceptable — it is decisive, and it is also the app overriding what
   the user tapped. Arguably right for a safety tool during a live trip, and a soft version (a
   persistent "Trip in progress — tap to resume" banner) trades a little reliability for control.
2. **Lift the source above the screen.** Move it into an app-level service keyed on "a trip is
   live", so tracking no longer depends on which screen is mounted. This is the more correct
   architecture and it also fixes the *other* half of the problem nobody has filed: today,
   navigating from the trip page to Profile **also** stops tracking. Bigger change; touches the
   consumer that Slice 2 deliberately left alone.

These are not exclusive — 2 is the real fix, 1 is what makes the traveller land somewhere useful.
Note that 2 alone does not solve this ticket: after a kill there is no mounted app at all until
launch, so something still has to notice a live trip and start the source.

## Acceptance criteria

- [ ] After a force-quit and relaunch mid-trip, tracking resumes without the traveller knowing to
      go looking for it.
- [ ] If it cannot resume automatically, the app says so unmistakably rather than looking normal.
- [ ] Navigating away from the trip screen within the app does not stop tracking.
- [ ] Verified on device — this cannot be proven off-device.

## Blocked by

- Needs a product decision between options 1 and 2 (or both).
