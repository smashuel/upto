# Slice 4 — Offline store-and-forward for dead zones

Status: ready-for-agent
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
Covers user stories: 10, 11, 24, 27

## What to build

Make live location resilient to the long no-signal stretches a background sampler hits in the
backcountry. Stage 1 is fire-and-forget — every failed POST is silently dropped, so a valley
with no reception erases the traveller's positions for that whole stretch even after signal
returns. Fix that: buffer fixes on the device while offline and deliver them when connectivity
comes back.

Because Stage 2 stays **last-known-only** (no breadcrumb trail — user-confirmed scope), the
flush decision **coalesces the queue to the single most-recent meaningful event** rather than
replaying the whole buffer:

```
nextFlushBatch(queue, now, online) → batch
```

- `online === false` → empty batch (send nothing).
- A queue of several live fixes → the newest by timestamp only (superseded intermediates
  discarded).
- A trailing `unavailable` marker after live fixes → flushes as `unavailable` (last signal wins).
- After a successful flush the queue is drained (no re-send of delivered fixes).

The queue exists for **delivery reliability, not history** — so a watcher who was staring at a
stale marker snaps to the traveller's real *current* position the moment signal returns, never
a replay of an hours-old point. This deliberately keeps the door shut on a breadcrumb schema.

## Acceptance criteria

- [ ] `nextFlushBatch(queue, now, online)` is a pure function, unit-tested under `node --test`:
      offline → empty batch; multiple live fixes coalesce to the newest by timestamp; a trailing
      `unavailable` flushes as `unavailable`; empty queue → empty batch; out-of-order timestamps
      resolve to the true newest; queue drains after a successful flush (no double-send).
- [ ] Fixes taken while the device is offline are buffered locally; the sampler never crashes or
      spams on repeated POST failures.
- [ ] On reconnect the newest buffered position is delivered and the watcher's marker snaps to
      it (verified across a real dead-zone → reconnect on-device).
- [ ] No breadcrumb trail is stored — the buffer coalesces and overwrites (last-known-only
      preserved).

## Blocked by

- Slice 2 (02-native-background-location) — background sampling is what produces the long
  offline stretches this handles.
