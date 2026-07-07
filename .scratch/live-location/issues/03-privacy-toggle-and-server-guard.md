# Slice 3 — Privacy toggle + server guard

Status: ready-for-agent
Parent: [.scratch/live-location/PRD.md](../PRD.md)
Covers user stories: 6, 10, 12, 13, 14, 15, 23

## What to build

Give the traveller per-trip control over who sees their live position, defaulting to the safe
common case and enforced both by *not publishing* and by a server guard behind it.

`liveSharing: 'with-trip' | 'owner-only' | 'off'`, default `with-trip` (treated as such when
absent — legacy trips never POST so they stay dark). It is a **live toggle on ActiveTrip, not
a wizard field** — a runtime safety/privacy choice, mutable while `active`/`overdue`. The
last-set value persists on the TripLink.

Enforcement model (grilled):
- `off` → the device never samples; nothing collected.
- `owner-only` → the device renders its own live position locally but **never POSTs**;
  watchers get nothing (this cleanly enforces owner-only over the shared capability-token SSE
  stream — the answer is simply not to broadcast).
- `with-trip` → sample → POST → broadcast (Slice 1 behaviour).

Server guard (defense in depth): `shouldBroadcastPosition(liveSharing)` — the position
endpoint reads the trip's **current stored** `liveSharing` on every POST and refuses to
broadcast unless it is `with-trip`, so a stale client can't override the trip's setting.

Consent surface: a persistent **"● Sharing live location with watchers"** chip on ActiveTrip
(doubling as the toggle) so the traveller always knows when they're broadcasting; a
**contextual** permission prompt (when the trip goes active with sharing on, or when the
traveller first toggles sharing on — not a cold prompt on load) with a one-line "share with
the people watching this trip?" explainer; and denial reflected in the same chip ("Location
off — watchers see your last check-in only"). Flipping to `off` mid-trip tears down the timer
and fires one `unavailable` beacon.

## Acceptance criteria

- [ ] `liveSharing` field added to the TripLink type, default `with-trip` when absent.
- [ ] `shouldBroadcastPosition(liveSharing)` is a pure function, unit-tested under
      `node --test`: `with-trip` → true; `owner-only` → false; `off` → false; `undefined` →
      true. The position endpoint calls it against the stored value before broadcasting.
- [ ] ActiveTrip has a three-way `liveSharing` toggle chip, mutable mid-trip, persisted on the
      TripLink; the chip shows the current broadcasting state.
- [ ] `owner-only` renders the traveller's own marker locally but sends no POST; `off` does
      not sample at all.
- [ ] `GET /api/triplinks/:token` returns `liveSharing`; the watcher view shows the
      `not-shared` state (from Slice 2) for `owner-only`/`off` trips.
- [ ] Permission is requested contextually (not on load) with an explainer; denial is
      reflected in the ActiveTrip chip.
- [ ] Flipping to `off` mid-trip tears down the sampling timer and fires one `unavailable`
      beacon so watchers flip within a cycle.
- [ ] Demoable: set owner-only → watcher shows "not enabled", owner still sees own marker; set
      off → nothing sampled; flip off mid-trip → watcher flips to paused/not-enabled.

## Blocked by

- Slice 1 (01-live-marker-end-to-end)
- Slice 2 (02-honest-liveness-and-rehydrate) — owner-only/off surface the `not-shared` notice
  and the flip-off path reuses the `unavailable` beacon machinery.
