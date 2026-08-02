# 06 — Switching sharing back on does not bring watchers back

Status: ready-for-agent
Priority: **highest of this batch** — the traveller believes they are sharing and nobody is watching
Surfaced: Slice 02 device matrix test 7, 2026-08-03 (iPhone 16 / iOS 26.4.1, build 25E253 / `9f98dc1`)
Area: `src/pages/ActiveTrip.tsx` (`handleSetSharing`)

## What happens

Mid-trip, switch live sharing to **Off**, then back to **Watchers**. The traveller's phone shows
sharing is on. The watcher view stays on *"live tracking paused — last known 13 min ago"* and does
not recover.

This is the worst shape a bug can take in this app: **the app tells the traveller they are being
watched, and they are not.** Someone could reasonably rely on that and be wrong. It ranks above
everything else in this batch for that reason alone.

## Cause

The signalling is asymmetric. From [ActiveTrip.tsx](../../../src/pages/ActiveTrip.tsx):

```js
if (prev === 'with-trip' && next !== 'with-trip') {
  api.reportPosition(shareToken, { sharing: 'unavailable' }).catch(() => {});
}
```

**Leaving** `with-trip` proactively tells watchers to stop trusting the marker — correct, and
deliberately immediate. **Entering** `with-trip` tells them nothing. Recovery is left entirely to
"the next fix will sort it out".

That assumption held on the web, where the Stage 1 loop produced a fix every ~3 minutes
regardless. It does not hold on native: with `distanceFilter: 10 m`
([issue 07](07-stationary-traveller-produces-no-fixes.md)) a stationary traveller produces **no
next fix**, so "eventually" becomes "never". Someone toggling privacy while standing still —
exactly what you do when you are deciding whether to share — hits it every time.

The 13 minutes in the test log is not a slow recovery. It is no recovery.

## What to build

Send a resume signal when sharing enters `with-trip`, mirroring the retraction that already
exists on the way out. Two honest options:

1. **Re-publish the last known fix with its own real timestamp.** Cheap, and the existing
   liveness machinery then reports it correctly as N minutes old rather than as current. Must
   carry the original fix time — never `now` — or it is a fabricated-freshness bug dressed as a
   fix.
2. **Force one immediate sample on start.** Cleaner, since it produces genuinely current data,
   and it also fixes the "first fix after resume is a cadence away" delay. Needs the source to
   expose a one-shot request.

Option 1 is the smaller change; option 2 is the better behaviour. They compose — and if
[issue 07](07-stationary-traveller-produces-no-fixes.md) lands option 1 (`distanceFilter: 0`),
much of this resolves on its own, so **sequence 07 first and re-test before building this.**

## Acceptance criteria

- [ ] Toggling `off` → `with-trip` while stationary brings the watcher view back to a live state
      without the traveller having to move.
- [ ] Same for `owner-only` → `with-trip`.
- [ ] The recovery never presents a stale position as current — whatever is published carries the
      age it actually has.
- [ ] The existing immediate retraction on leaving `with-trip` is unchanged.

## Blocked by

- [Issue 07](07-stationary-traveller-produces-no-fixes.md) — fix and re-test first; it may
  reduce this to a much smaller change.
