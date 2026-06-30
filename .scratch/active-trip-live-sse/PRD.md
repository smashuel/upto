# PRD — Owner's ActiveTrip view reflects live lifecycle state via SSE

Status: ready-for-agent
Created: 2026-06-30
Related: [ADR 012 — TripLink lifecycle module](../../brain/decisions/012-triplink-lifecycle-module.md), [CONTEXT.md](../../CONTEXT.md)

## Problem Statement

When a traveller is on an active trip, they watch their own status on the **ActiveTrip**
screen (the owner view, reached via the trip's share token). The matching **Watcher** view
(`PublicAdventureView`) updates live: since the TripLink lifecycle module landed (ADR 012),
every transition broadcasts its resulting status over SSE, and the watcher trusts it.

The owner's screen does not. ActiveTrip fetches the TripLink once on mount and never
subscribes to the SSE stream. Worse, its **Overdue** banner is not driven by the trip's
status at all — it is recomputed on a 30-second client clock as `expectedReturnTime < now`,
with no 15-minute grace.

The result is a safety-eroding contradiction: a traveller who taps **"I'm OK — Check In"**
clears the alarm on the server (`overdue → active`), the Watcher view updates instantly, the
**Emergency Contacts** see the all-clear — but the traveller's *own* screen still shows a red
"Overdue — check in now" banner until they manually refresh. The person who just confirmed
they are safe is the last to be told the system agrees. Owner and watcher can disagree about
whether a trip is overdue, which is exactly the kind of divergence ADR 012 set out to kill.

## Solution

ActiveTrip subscribes to the same SSE stream the Watcher view uses, and drives its
overdue/active state off the server's lifecycle status rather than a local clock. The moment
a traveller checks in, their overdue banner clears live — no refresh — and their screen
always matches what their watchers see. The local clock is kept only for the *countdown*
display ("3h 12m elapsed", "overdue by 22m"), never for the *decision* of whether the trip is
overdue.

The transition-trusting logic that the Watcher view currently inlines is extracted into a
single pure reducer, `applyLifecycleEvent`, shared by both views — so the rule "trust the
server's status; never re-derive the state machine on the client" lives in exactly one place
and is unit-tested.

## User Stories

1. As a traveller on an active trip, I want my overdue banner to clear the instant I check
   in, so that I'm not alarmed by a warning that no longer applies.
2. As a traveller, I want my own screen to agree with what my watchers see, so that I trust
   the app is telling everyone the same thing.
3. As a traveller who has gone overdue and then resurfaced with a check-in, I want my screen
   to return to the calm "in progress" state live, so that I get immediate confirmation the
   alarm was cleared.
4. As a traveller, I want the overdue banner to respect the 15-minute grace the server uses,
   so that I'm not warned the instant I pass my expected-return time when the system hasn't
   actually escalated yet.
5. As a traveller, I want a check-in I make to appear immediately on my screen (optimistic),
   so that the UI feels responsive even before the server echo arrives.
6. As a traveller whose check-in is echoed back over SSE, I want it to not appear twice in my
   history, so that my check-in log stays accurate.
7. As a traveller, I want my elapsed-time and time-remaining counters to keep ticking on the
   local clock, so that the countdown stays smooth between server events.
8. As a traveller who taps "Complete Trip", I want the completed state to stick whether it
   arrives from my own action or from an SSE broadcast, so that the screen never flickers back
   to active.
9. As a traveller on a flaky connection, I want the SSE subscription to clean up when I leave
   the page, so that I don't leak connections or get stale updates on the next trip.
10. As a watcher, I want the live-update behaviour of my view to be unchanged by this work, so
    that nothing I rely on regresses.
11. As a developer, I want the "trust the server status" rule to live in one tested function,
    so that ActiveTrip and the Watcher view can never drift apart again.
12. As a developer, I want the reducer to fall back to the previous status when an SSE event
    omits `status`, so that an old backend during a deploy gap doesn't blank the state.
13. As a maintainer, I want no new test framework pulled into the repo for this, so that the
    backend dependency tree and build stay as ADR 012 decided.
14. As a traveller, I want a status broadcast (e.g. someone else starts/completes via the
    share token) to update my view live, so that the owner screen reflects authoritative state
    regardless of who triggered the transition.

## Implementation Decisions

- **One new seam: a pure `applyLifecycleEvent` reducer.** Extract the inline state-update
  logic currently duplicated across the Watcher view's three SSE handlers into a single pure
  function with no React and no `EventSource` imports, so it is importable by frontend
  components *and* runnable under `node --test`. Confirmed shape (from the design fork):

  ```
  applyLifecycleEvent(prev: TripLink, event:
    | { kind: 'status';  status; startedAt? }
    | { kind: 'checkin'; status?; timestamp; message?; locationW3w?; lat?; lng? }
    | { kind: 'overdue'; overdueSince }
  ): TripLink
  ```

  Rules it owns: trust `event.status` for `checkin`/`status` events, falling back to
  `prev.status` (the deploy-gap guard); clear `overdueSince` when the resulting status is not
  `overdue`; set `overdueSince` on an `overdue` event; prepend a `checkin` event to the
  check-in history **idempotently by timestamp** (so an owner's own echoed check-in is not
  double-counted); update `startedAt` from a `status` event when present.

- **The Watcher view is refactored onto the shared reducer**, deleting its three inline
  reducers. Behaviour is preserved exactly (including the `?? prev.status` guard and the
  `overdueSince` clearing); this is a dedup, not a behaviour change.

- **ActiveTrip gains an SSE subscription**, modelled on the Watcher view: subscribe once the
  share token and the initial TripLink are loaded, route each event through
  `applyLifecycleEvent`, and close the stream on unmount.

- **The overdue decision moves to server status.** ActiveTrip's banner condition changes from
  `remainingMs < 0` to `status === 'overdue'`. The local 30-second clock is retained *only*
  for the elapsed / remaining / "overdue by" duration labels — never for deciding whether the
  trip is overdue. Owner and watcher now share one source of truth (the lifecycle state
  machine, 15-minute grace included).

- **Optimistic check-in is kept.** The traveller's own check-in still updates `lastCheckIn`
  immediately on the API response for responsiveness; the subsequent SSE echo reconciles
  authoritative status (and, via the idempotent-by-timestamp rule, does not duplicate the
  entry).

- **No backend change.** The lifecycle module already broadcasts the resulting status on
  `status`, `checkin`, and `overdue` events (ADR 012, commit 1, already in `main`). This work
  is frontend-only; it consumes a contract that already exists and is already tested.

- **SSE event contract is the boundary.** The frontend's three handlers normalise each
  `EventSource` payload into the tagged `event` shape above before calling the reducer; the
  reducer never touches `EventSource` directly.

## Testing Decisions

- **What a good test is here:** the reducer's tests assert *external behaviour only* — given a
  prior `TripLink` state and an incoming SSE event payload, assert the next `TripLink` state.
  No test reaches into React rendering, `EventSource` internals, or the subscription effect;
  those are implementation details below the seam.

- **Module under test:** `applyLifecycleEvent` (the new pure reducer). This is the single,
  highest seam for the feature — both views funnel through it, so testing it covers the rule
  that matters (the client must trust, never re-derive, the lifecycle).

- **Runner:** `node --test`, matching ADR 012's decision not to add Vitest for a unit this
  small. No new test dependency.

- **Prior art:** `triplink-lifecycle.test.js` — same in-memory / plain-data, recording-style
  approach (fixtures built by hand, assertions on returned state), no DB or network.

- **Cases to cover:** check-in carrying `status: 'active'` clears `overdue → active` and nulls
  `overdueSince`; check-in with `status` omitted falls back to `prev.status` (deploy-gap
  guard); an `overdue` event sets status and `overdueSince`; a `status` event updates status
  and `startedAt`; an echoed check-in with a timestamp already present does not create a
  duplicate history entry; a `completed` status event is preserved (not overwritten by a stale
  active).

- **Below the seam (explicitly not unit-tested):** the `useEffect` subscription wiring, the
  switch from `remainingMs < 0` to `status === 'overdue'`, and EventSource lifecycle. With no
  frontend harness (and none being added per ADR 012), these are verified by manual run-through
  — start a trip, let it go overdue, check in, confirm the owner banner clears live and matches
  the watcher view.

## Out of Scope

- **Backend / lifecycle changes** — the server already broadcasts status; nothing to change.
- **Live GPS / live location streaming** — the next major bet (ADR 010/011), unrelated.
- **Extending `expectedReturnTime` on check-in** — a check-in clears the alarm but does not
  reschedule the return time; that is a separate product decision.
- **Notifying watchers on completion** — deliberately parked (status.md gap #8).
- **A `cancelled` state or any new lifecycle transition** — deferred in ADR 012.
- **EventSource reconnect/backoff hardening** — rely on the browser's built-in auto-reconnect,
  same as the Watcher view today.
- **Offline behaviour** — the existing localStorage fallback in ActiveTrip is untouched.

## Further Notes

- No deploy-ordering constraint: unlike ADR 012's commit 2 (which required the backend to ship
  first), the backend half is already live in `main`, so this frontend change can ship on its
  own. The `?? prev.status` fallback in the reducer is retained anyway as defence in depth.
- Unifying the owner's divergent time-math overdue model with the server's graced state machine
  is itself a safety correctness fix, not just a live-update nicety — today the owner can be
  shown "overdue" 15 minutes before the system actually escalates.
- After this ships, both the owner (ActiveTrip) and watcher (PublicAdventureView) views consume
  identical lifecycle state through one reducer; the only remaining asymmetry is that ActiveTrip
  also originates check-ins/completion, which the idempotent-by-timestamp rule accounts for.
