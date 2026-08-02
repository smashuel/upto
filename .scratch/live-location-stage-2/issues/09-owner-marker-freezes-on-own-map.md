# 09 — The traveller's own marker freezes at the start of the trip

Status: FIXED 2026-08-03 (stale position cleared on teardown; root cause addressed in issue 07) — needs device retest
Priority: medium — the traveller cannot tell whether tracking is working
Surfaced: Slice 02 device matrix tests 6 and 7, 2026-08-03
Area: `src/pages/ActiveTrip.tsx` (`ownPosition`, `liveCoords`)

## What happens

On `owner-only`, the acceptance box "your own marker still updates on your phone" **failed**:
*"it went my location at the start of the trip and stayed there."* The same was noted again under
`off` → *"my marker just stayed at the beginning of the trip, no change."*

The traveller's own marker exists so they can confirm tracking is alive without asking a watcher.
Frozen, it does the opposite of its job — it is indistinguishable from tracking having died, and
it makes every privacy toggle look broken.

Note this passed in **test 2** (foreground, walking). It failed in tests 6 and 7, which were run
while stationary.

## Leading explanation

Most likely the same root cause as [issue 07](07-stationary-traveller-produces-no-fixes.md): the
traveller was standing still, so no fix was produced, so `ownPosition` never advanced. That it
passed while walking and failed while stationary fits exactly.

If so, **fixing 07 fixes this** and there is nothing else to do. But there is a second, real
defect visible in the code regardless:

```js
const liveCoords = liveSharing !== 'off' && ownPosition ? { … } : null;
```

`ownPosition` is never cleared when sharing changes. After `off` → `with-trip` the map
immediately re-renders the **old** position from before the toggle. `ownFixStale` greys it once
past the threshold, but for the first few minutes a stale point is drawn as if it were a current
one — on the traveller's own screen, while the app tells them sharing is on. That is worth fixing
even if 07 accounts for the freeze.

## What to build

1. Re-run tests 6 and 7 **while walking**, after issue 07 lands. If the marker tracks, this
   reduces to point 2.
2. Clear or explicitly age `ownPosition` when sharing changes, so a resumed session never draws a
   pre-toggle position as current.

## Acceptance criteria

- [ ] With the trip live and the traveller moving, their own marker tracks them in both
      `with-trip` and `owner-only`.
- [ ] After `off` → `with-trip`, the map does not present a pre-toggle position as current.
- [ ] A stationary traveller's own marker is honest about its age rather than simply looking
      broken.

## Blocked by

- [Issue 07](07-stationary-traveller-produces-no-fixes.md) — re-test after it lands.
