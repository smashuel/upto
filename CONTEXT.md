# Upto — Domain Glossary (ubiquitous language)

The shared vocabulary for Upto. When code, UI copy, and docs disagree on a word, this
file wins. Created 2026-06-29 alongside [ADR 010](brain/decisions/010-product-direction-safety-first-social-leash.md).

## Core nouns

- **TripLink** — the central object: a trip plan (route, dates, locations, contacts,
  check-in schedule) that is shared via a `share_token` URL. Lifecycle:
  `planned → active → overdue → completed`. (`Adventure` is a legacy type alias — prefer
  `TripLink` in new code.)
- **Watcher** — anyone who has been notified about a TripLink and can see its shared view
  (status, check-ins, last-known location). A watcher is *informed*, not necessarily an
  emergency contact. Used loosely in UI ("Notify N watchers").
- **Emergency Contact** — a contact who should be alerted on overdue/escalation. Flagged
  `is_emergency` on the `contacts` table.
- **Emergency Circle** — the user's set of emergency contacts, pre-checked when starting a
  trip. (Account-level; the wizard auto-populates from it.)
- **Favourite** — a frequently-used contact (`is_favourite`). Orthogonal to emergency
  status — a contact can be either, both, or neither.
- **Check-in** — a traveller action during an active trip that records a timestamp +
  location (what3words / lat-lng) and optionally a message.
- **Overdue** — status the system sets when a trip passes `expected_return_time` + 15-min
  grace without completion. Triggers escalation.

## TripLink lifecycle (the status state machine)

The **TripLink lifecycle** is the deep module that owns every status transition of a
TripLink. Four states, one authoritative transition graph. The DB stays the atomicity
authority (transitions are atomic conditional writes); the module owns *which* transitions
are legal and *what side effects* fire on each.

Legal transitions (everything else is rejected):

| From | To | Trigger |
|------|----|---------|
| `planned` | `active` | owner/partner taps Start |
| `active` | `overdue` | overdue sweep (clock-driven, past `expected_return_time` + 15-min grace) |
| `overdue` | `active` | a late **Check-in** — clears the alarm when the traveller resurfaces |
| `active` | `completed` | Complete |
| `overdue` | `completed` | Complete (returned after going overdue) |

A **Check-in** is allowed only while `active` or `overdue`; in `active` it records the
check-in without changing status. **Rejected** (tightened from the old SQL, which allowed
them silently): `planned → completed` (must start first), check-ins on `completed`, and
any transition out of `completed` (terminal). Re-`Start` on a non-`planned` trip is an
idempotent no-op, not an error.

Every transition **broadcasts** the resulting status over SSE (the watcher view trusts the
payload — it no longer infers `overdue → active` itself). Notification dispatch is an
*injected* side effect: the lifecycle decides *that* a start/overdue notice fires, the
notifier decides *who* and *which channel* (the [[Watcher]] / Emergency Contact policy).

- **Settle window** — the interval between a route's finish (or edit-commit) and its
  *settled* emission, while true terrain heights resolve. A real state with its own rules:
  every teardown must strand work in flight, the UI represents it as `settling`, and
  nothing may persist a trip mid-window without waiting it out. See
  [ADR 014](brain/decisions/014-settle-window-is-a-real-state.md).

## Direction terms (per ADR 010)

- **Safety core** — the end-to-end promise that makes Upto a safety tool rather than a
  planner: the plan a TripLink stores is *truthful* (real distances, real climb), the
  watcher-facing view shows that same truth, and when a trip goes [[Overdue]] a human is
  *actually reached*. "Hardening the safety core" = closing gaps in that chain, as opposed
  to adding new capability.

- **Safety-first, social-curious** — the product stance: the safety/check-in tool is the
  product; a *thin* social layer exists only to reduce trip-coordination friction.
- **Live GPS / live location** — streaming the traveller's *current* position to watchers
  during an active trip. Committed as the next major bet, **framed as safety**. Distinct
  from the *last check-in pin* (static) and the *planned route* (static). See
  [ADR 011](brain/decisions/011-capacitor-mobile-shell.md).
- **Invite / accept / join** — the in-scope social feature: an owner sends a TripLink and
  recipients accept or join. Replaces the pre-mission group chat. See
  [social-triplink-sharing.md](brain/plans/social-triplink-sharing.md).

## Rejected / non-adopted terms

These appear in the **rejected** [squad-social-vision.md](brain/features/squad-social-vision.md)
spec. Do **not** introduce them as product vocabulary:

- **Squad** — not an adopted concept. Use **Watcher** / **contact** / (future) trip
  **participant**. A "squad feed" is parked for a dedicated design session, undefined.
- **Home Base** — not adopted. The role it described maps to **Emergency Contact** /
  primary contact.
- **Streaks, KOMs, segments, leaderboards, activity feed** — explicitly rejected; Upto is
  not a social network.
