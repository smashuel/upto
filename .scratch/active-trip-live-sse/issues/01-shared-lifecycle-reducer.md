# 01 — Shared lifecycle reducer, proven on the Watcher view

Status: ready-for-agent

## Parent

[PRD — Owner's ActiveTrip view reflects live lifecycle state via SSE](../PRD.md)

## What to build

Extract the logic that applies an incoming SSE lifecycle event to a `TripLink` into a single
pure reducer, `applyLifecycleEvent`, then refactor the **Watcher** view
(`PublicAdventureView`) to use it — deleting the three inline reducers it currently has in its
`onStatus` / `onCheckin` / `onOverdue` handlers.

This slice is a **behaviour-preserving prefactor**: the watcher view must update live exactly
as it does today. Its only user-visible deliverable is "nothing changed"; its real value is
that the rule "trust the server's status, never re-derive the state machine on the client"
now lives in one tested place, ready for ActiveTrip to consume in slice 02.

The reducer is pure — no React, no `EventSource` — so it is importable by components *and*
runnable under `node --test`. The three SSE handlers normalise each `EventSource` payload into
a tagged event before calling it; the reducer never touches `EventSource` itself. Confirmed
shape (from the PRD's design fork):

```
applyLifecycleEvent(prev: TripLink, event:
  | { kind: 'status';  status; startedAt? }
  | { kind: 'checkin'; status?; timestamp; message?; locationW3w?; lat?; lng? }
  | { kind: 'overdue'; overdueSince }
): TripLink
```

Rules it owns, carried over verbatim from the current watcher handlers:
- Trust `event.status` for `checkin` / `status` events, falling back to `prev.status` (the
  deploy-gap guard — an old backend may omit it).
- Clear `overdueSince` when the resulting status is not `overdue`; set it on an `overdue` event.
- Prepend a `checkin` event to the check-in history **idempotently by timestamp**, so a
  check-in already present is not duplicated (this is new vs. the current watcher inline code,
  which always prepends — the watcher never originated check-ins so it never hit a duplicate;
  the rule is added here because ActiveTrip will need it in slice 02, and it is a safe no-op
  for the watcher).
- Update `startedAt` from a `status` event when present.

## Acceptance criteria

- [ ] A pure `applyLifecycleEvent` reducer exists with no React or `EventSource` imports.
- [ ] `PublicAdventureView` routes all three SSE event types through the reducer; its inline
      reducers are removed.
- [ ] The watcher view's live behaviour is unchanged: status updates, check-in echo, and
      overdue all reflect on the page as before (manual run-through).
- [ ] Unit tests run under `node --test` (no new test framework) and cover: check-in carrying
      `status: 'active'` clears `overdue → active` and nulls `overdueSince`; check-in with
      `status` omitted falls back to `prev.status`; an `overdue` event sets status +
      `overdueSince`; a `status` event updates status + `startedAt`; an echoed check-in whose
      timestamp is already in history produces no duplicate; a `completed` status is preserved.
- [ ] `npm test` is green.

## Blocked by

None - can start immediately.
