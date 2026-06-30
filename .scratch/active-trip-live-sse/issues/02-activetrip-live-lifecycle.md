# 02 — ActiveTrip reflects live lifecycle state via SSE

Status: ready-for-agent

## Parent

[PRD — Owner's ActiveTrip view reflects live lifecycle state via SSE](../PRD.md)

## What to build

Make the owner's **ActiveTrip** screen reflect live TripLink lifecycle state, the way the
Watcher view already does. Today ActiveTrip fetches the TripLink once on mount, never
subscribes to SSE, and computes its **Overdue** banner from a local 30-second clock
(`expectedReturnTime < now`, no grace). The result: when a traveller taps "I'm OK — Check In",
the server clears the alarm (`overdue → active`) and watchers see it instantly, but the
traveller's own banner stays red until they refresh, and owner and watcher can disagree about
whether the trip is overdue.

Subscribe ActiveTrip to the same SSE stream the Watcher view uses, route every event through
the shared `applyLifecycleEvent` reducer (from issue 01), and drive the overdue banner off the
server's lifecycle status instead of the local clock. The local 30-second clock is kept *only*
for the duration labels (elapsed / time-remaining / "overdue by"), never for the decision of
whether the trip is overdue — that becomes `status === 'overdue'`, matching the watcher and the
server's 15-minute grace.

The traveller's own check-in stays optimistic (immediate `lastCheckIn` update on the API
response); the subsequent SSE echo reconciles authoritative status, and the reducer's
idempotent-by-timestamp rule keeps it from double-counting. The subscription is opened once the
share token and initial TripLink are loaded and closed on unmount. No backend change — the
lifecycle module already broadcasts the resulting status on every event (ADR 012, already in
`main`), so there is no deploy-ordering constraint.

## Acceptance criteria

- [ ] ActiveTrip opens an SSE subscription (once token + TripLink are loaded) and closes it on
      unmount.
- [ ] All incoming SSE events are applied through the shared `applyLifecycleEvent` reducer — no
      lifecycle/transition logic is re-implemented inline in ActiveTrip.
- [ ] The overdue banner is shown when `status === 'overdue'` (not from `expectedReturnTime`
      time-math), so it respects the server's 15-minute grace and matches the watcher view.
- [ ] After a traveller checks in on an overdue trip, their overdue banner clears live (no
      refresh) and the screen returns to the active state.
- [ ] The owner's own check-in does not appear twice (optimistic update + SSE echo are
      reconciled via the reducer's timestamp dedup).
- [ ] Elapsed / remaining / "overdue by" duration labels keep updating on the local clock.
- [ ] A `completed` status (from the owner's own "Complete Trip" tap or an SSE broadcast)
      sticks and does not flicker back to active.
- [ ] Manual run-through confirms owner and watcher views agree throughout a
      start → overdue → check-in → complete cycle.

## Blocked by

- [01 — Shared lifecycle reducer, proven on the Watcher view](./01-shared-lifecycle-reducer.md)
