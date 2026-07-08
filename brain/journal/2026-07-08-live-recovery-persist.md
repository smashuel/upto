---
date: 2026-07-08
tags: [live-gps, sse, persistence, honest-degradation]
related: [brain/plans/live-location.md, backend-server.js]
---

# Live position: recover-from-unavailable must persist immediately

## Symptom
During Slice 03 verify, a watcher loading a live trip mid-way sometimes saw
"Live tracking unavailable — showing last check-in" even though the traveller
was actively sharing and live fixes were flowing over SSE.

## Root cause
The `POST /position` DB persist is deliberately **coarse** — throttled to ~once
per 10 min (`LIVE_PERSIST_INTERVAL_MS`) so a long trip is a handful of writes.
An `unavailable` beacon, by contrast, persists **immediately** (it's a state
change, not telemetry). So the sequence:

1. live fix → persisted (sharing absent)
2. `unavailable` beacon → persisted immediately as `sharing:'unavailable'`
3. live fix resumes → broadcast live over SSE, but the coarse throttle **skips
   the DB write** for up to 10 min

left the DB row showing `sharing:'unavailable'` while the device was actually
live. A watcher with an open SSE self-heals on the next live event, but one
**loading fresh** reads the stale `unavailable` from `GET` until the throttle
elapses — a false "unavailable" for up to ~10 min.

Not a safety bug (it under-claims liveness — the safe direction, never the
reverse), but a real UX nit.

## Fix
In the position endpoint's live branch, detect recovery and bypass the throttle:

```js
const recoveringFromUnavailable = livePositions.get(token)?.sharing === 'unavailable';
livePositions.set(token, pos);
broadcast(token, 'position', { sharing: 'live', ...pos });
const last = livePositionPersistedAt.get(token) || 0;
if (recoveringFromUnavailable || Date.now() - last >= LIVE_PERSIST_INTERVAL_MS) {
  persistLivePosition(token, pos);
}
```

(A server restart empties the in-memory map, so `last || 0` already forces the
first post-restart persist — this handles the same-process recover-within-10-min
case the throttle was hiding.)

## Invariant
**A state *recovery* on a throttled channel must not inherit the throttle.**
Coarse persistence is fine for steady-state telemetry, but any transition that
changes the *honest meaning* of the persisted value (live↔unavailable) must
write through immediately, or a fresh reader sees a stale claim. Same spirit as
the `unavailable` beacon persisting immediately.

Verified by reproducing steps 1→2→3 back-to-back and asserting the DB row's
`sharing` returns to live within the throttle window.
