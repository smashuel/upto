# 018 — One route per TripLink

Date: 2026-07-31
Status: Accepted

## Context

The map let a user draw several routes onto one TripLink, discovered during on-device testing
of the Capacitor shell. Nothing in the data model or the share view said which route the trip
actually followed.

For a trip-planning app this is a tidiness problem. For a **safety** app it is worse than
that: a TripLink exists so an emergency contact knows where someone went and when to raise the
alarm. Two routes on one link means two answers to "where are they", and no way to tell which
one is current, which is a leftover, or whether the second was meant to extend the first.

The user's framing when asked: *"I think a TripLink should only be allowed one trip."*

## Decision

**A TripLink carries exactly one route.** Finishing a newly drawn route replaces the stored
one, and the user is told it was replaced.

Enforced in two places, deliberately:

- `applyDrawnRoute` (`src/services/routeUpsert.ts`) — the wizard's form state, which is what
  gets persisted.
- `TrackDrawer.setSingleTrackMode(true)` — the map itself, enabled whenever the map is
  editable.

One alone is not enough. Enforcing only in form state leaves a second line drawn on the map
that the saved trip doesn't have; enforcing only in the drawer leaves stored routes from
before this rule untouched. Together, what is drawn and what is saved cannot disagree.

An **edit** re-emits the same route id and is not a replacement — the user changed their route
rather than discarding one, so nothing is announced.

## Alternatives considered

- **Block the second route outright.** Rejected: redrawing is the normal way to fix a bad
  route, and forcing a separate "clear" step first adds friction to the common case.
- **Keep several routes, mark one primary.** Rejected: it adds a concept ("primary") to the
  share view and to every consumer, to model something no user has asked for.
- **Silently replace.** Rejected: a drawn route is real work, and losing it without a word on
  a trip plan is exactly the kind of surprise this app should not produce.

## Consequences

- The share view and any future notification have one unambiguous route to describe.
- TripLinks created before this rule may hold several routes. They are **not** rewritten, and
  read-only maps still render all of them — dropping route data from an existing trip plan
  without being asked would be worse than the inconsistency. `applyDrawnRoute` collapses them
  to one if the user draws again.
- `routes` stays an **array** on `TripLink`, both for that backward compatibility and because
  the multi-leg direction below will want it.

## Reconsider if

Multi-activity trips are taken on. A multi-sport race — paddle a stretch, ride a stretch, run
the last one — is a **single trip** whose parts carry different activity types, different
paces, and therefore different time estimates.

The natural shape for that is **legs within one route**, each with its own activity type, not
several independent routes. It changes `TripRoute` (a leg list, each leg with its own activity
and metadata) and GuidePace (per-leg estimates summed, rather than one activity for the whole
trip), and it should *reinforce* the one-route rule rather than repeal it: still one trip, made
of parts.

Explicitly deferred — the user's words: *"definitely way down the track, definitely doesn't
need to be any time soon."* Do not build toward it speculatively.
