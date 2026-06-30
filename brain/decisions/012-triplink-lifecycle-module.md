---
type: decision
status: accepted
related: [triplink-lifecycle.js, triplink-lifecycle.test.js, backend-server.js, src/pages/PublicAdventureView.tsx, src/pages/ActiveTrip.tsx, CONTEXT.md]
tags: [architecture, triplinks, lifecycle, state-machine, testing, safety]
---

# 012 — TripLink lifecycle as a deep module; the DB stays the atomicity authority

## Context

The architecture review (2026-06-29, Card 1) found the TripLink status state machine
(`planned → active → overdue → completed`) smeared across five places: the `/start`,
`/checkin`, `/complete` route handlers, the 60-second overdue checker, and the watcher
view, which re-inferred `overdue → active` itself because the `checkin` SSE event omitted
the resulting status. The overdue checker was a bare top-level `setInterval` with no seam,
so the transition logic was untestable, and the repo had no test framework.

The transition guards lived in SQL as atomic conditional writes
(`UPDATE … WHERE status = 'planned'`), which is what makes `/start` race-safe under the
per-token rate limit. So "extract a state machine" ran straight into a fork: moving the
guard into read-then-write JavaScript would reintroduce a race the SQL currently prevents.

## Decision

Extract a deep **TripLink lifecycle** module ([triplink-lifecycle.js](../../triplink-lifecycle.js))
that owns every transition. Decisions taken in the grilling session:

1. **The DB stays the atomicity authority.** Each transition is an atomic conditional
   write behind a `repo` seam. The module reads current status only to *classify* the
   request (clean `409` vs idempotent no-op); the actual write is still the guarded SQL,
   so concurrency is unchanged. The benign TOCTOU on classification is acceptable — the
   atomic write is the real guard.

2. **The module owns the transition table + side-effect fan-out, not the recipients.**
   It maps "enter active → fire start-notice; enter overdue → fire overdue-notice; every
   transition → broadcast" but dispatches through an injected `notifier`. *Who* gets
   notified and on *which channel* stays behind that seam (the Watcher / Emergency Contact
   policy — a separate card). The lifecycle never imports contacts or Resend/Twilio.

3. **Dependencies are injected** (`repo`, `broadcaster`, `notifier`, `clock`) so the
   interface is the test surface. Production wires Postgres + SSE + notifications.js + the
   system clock; tests wire an in-memory repo + recorders + a fixed clock. Each seam has a
   real second adapter — that is what makes the overdue sweep testable.

4. **The legal graph is tightened** (deliberate, tested behaviour changes): `planned →
   completed` is now illegal (a trip must be started before it can be completed) and
   check-ins on a `completed` trip are rejected (`409`). Both were silently allowed by the
   old SQL. No new `cancelled` state — there is no cancel flow yet (deferred, not built).

5. **SSE broadcasts now carry the resulting status.** Commit 1 (this change) puts the
   status on the wire; commit 2 makes `PublicAdventureView` / `ActiveTrip` trust it and
   delete the inferred `overdue → active`.

6. **Tests run on Node's built-in runner** (`node --test`), not Vitest. This is a
   backend-only ESM module with no Vite/DOM needs, so Vitest earns nothing here — don't
   add a dependency the seam doesn't need, and don't pull a test framework into the
   backend's prod `node_modules`. Swap to Vitest later only if the frontend grows tests
   and one runner across both is worth it.

## Alternatives considered

- **Move the guard into JS read-check-write.** Rejected — reintroduces the TOCTOU race the
  atomic SQL currently prevents, forcing `SELECT … FOR UPDATE` transactions to re-solve
  concurrency the DB already handles.
- **Module owns notifications fully, including recipients.** Rejected — swallows the
  separate "who gets notified" card and couples the lifecycle to contacts and transports.
- **Add a `cancelled` state now.** Deferred — clean modelling, but no user action flows
  into it yet; it'd be a state with no inbound transition (a hypothetical seam).
- **Vitest.** Deferred — unnecessary for a backend ESM module, and it would add a test
  framework to the backend's dependency tree for no gain over the built-in runner.

## Consequences

- The overdue sweep is now testable via a fake clock; 16 tests cover the transition table,
  `/start` idempotency, the check-in alarm-clear, the two tightenings, and the sweep.
- Two deliberate behaviour changes ship: `409` on `planned → complete` and on check-in
  after completion. No legitimate frontend flow hits either (the completed view has no
  check-in panel; completion is only reached from an active/overdue trip).
- `npm test` exists for the first time (`node --test`).
- **Commit 2 still pending**: the frontend keeps its redundant `overdue → active`
  inference until it's switched to trust the SSE `status` field. Harmless until then.
- A small benign race remains: a check-in can insert a row in the instant a trip
  completes. Lower priority; wrap insert + status-update in one transaction if it matters.

## Reconsider if

- A transition needs a true read-modify-write across several fields atomically — then wrap
  it in a transaction with `SELECT … FOR UPDATE` rather than the conditional-write pattern.
- A cancel flow appears — add `cancelled` to the `TRANSITIONS` table and a `planned →
  cancelled` edge.
- Frontend + backend want a single test runner — replace `node --test` with Vitest.
- The check-in-on-completing race is observed in production — make the insert conditional
  on status in one statement/transaction.
