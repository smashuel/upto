# 07 — A stationary traveller produces no fixes at all

Status: ready-for-agent — needs a product call on the cadence model first
Priority: high — it is the root cause behind issues 06 and 08, and it misreports safety state
Surfaced: Slice 02 device matrix, 2026-08-03 (iPhone 16 / iOS 26.4.1, build 25E253 / `9f98dc1`)
Area: `src/services/nativeBackgroundPositionSource.ts` (`DEFAULT_DISTANCE_FILTER_M`, the throttle)

## What happens

The background watcher is configured with `distanceFilter: 10` metres, so iOS only calls back
when the device **moves**. A traveller standing still produces **no fixes at all** — not a slow
trickle, none. Consequences observed during the matrix run:

- Their own marker freezes at wherever they last moved ("my marker just stayed at the beginning
  of the trip, no change").
- Their watchers see the liveness label decay to "paused, last known N min ago", which reads as
  *something has gone wrong* rather than *they have stopped for lunch*.
- Anything that waits for "the next fix" waits forever. That is what makes
  [issue 06](06-sharing-resume-does-not-recover-watchers.md) unrecoverable rather than merely
  slow.

This was predicted as the open question in [ADR 019](../../../brain/decisions/019-background-geolocation-plugin.md)
and deliberately left for the device to answer. It has answered: the behaviour is confusing
enough that it generated two apparent bugs during a single test session, before anyone was even
looking for it.

## Why it isn't just "make the filter smaller"

The reason a time cadence and a distance filter both exist is battery. Stage 1 fixed the
contract as roughly one fix per ~3 minutes and [plans/live-location.md](../../../brain/plans/live-location.md)
treats that as an invariant, not a tuning knob — a multi-day trip that flattens the phone is
worse than a coarse marker.

But the two axes are not equivalent, and Slice 2 conflated them. A *time* cadence produces a fix
every N minutes whether or not the traveller moved, which is what the Stage 1 web loop did and
what `describeLiveness` was designed against. A *distance* filter produces nothing when they
stop. Slice 2 applied both, which quietly changed the contract downstream seams still assume.

## What to decide

1. **`distanceFilter: 0` plus the existing time throttle.** Restores the Stage 1 contract
   exactly: one fix per cadence, moving or not, so `describeLiveness` keeps meaning what it
   meant. Costs callback volume, not radio power — the GPS is already active for the duration of
   the watcher, which is the actual battery expense. **This is the recommended option** and it is
   a one-line change.
2. **Keep the filter, add a heartbeat.** Re-send the last known position when nothing new has
   arrived. **Only acceptable if the payload carries the fix's real age** — re-sending an old
   position as though it were current is exactly the fabricated freshness this codebase refuses
   everywhere else, and on a safety tool it means a searcher trusting a stale point.
3. **Change nothing, fix the words.** Teach the watcher view to distinguish "stopped moving"
   from "stopped reporting". Honest, but it needs a signal we do not currently send, so it is
   option 2 with extra steps.

## Acceptance criteria

- [ ] A traveller who is stationary with the trip live and the phone locked keeps their watchers
      updated, and their own marker current.
- [ ] Whatever ships, a watcher can never be shown a position that is older than it appears.
- [ ] The ~3-min-class battery invariant still holds; measured, not assumed
      (see [issue 10](10-sampling-cadence-too-slow.md), which pushes the other way).
- [ ] `describeLiveness` needs no new cases — if it does, the contract moved and that is the
      thing to review.

## Blocked by

- Needs the decision above. Recommend option 1.
