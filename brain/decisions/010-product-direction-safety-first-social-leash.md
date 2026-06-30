---
type: decision
status: accepted
related: [brain/project/vision.md, brain/project/roadmap.md, brain/project/status.md, brain/features/squad-social-vision.md, brain/plans/social-triplink-sharing.md, brain/decisions/011-capacitor-mobile-shell.md]
tags: [product, direction, vision, social, scope]
---

# 010 — Product direction: safety-first core, social on a leash, live GPS as the next big bet

## Context

The brain had accumulated two contradictory north stars. [vision.md](../project/vision.md)
states in bold that Upto is **"Not a social fitness tracker… Not an AllTrails clone."**
Meanwhile [squad-social-vision.md](../features/squad-social-vision.md) proposed
repositioning the whole product as **"the Anti-Strava for real adventurers"** — squads,
an activity feed, streaks, a viral growth loop. That isn't a parked feature; it's a
second product. Alongside it sat a pile of speculative backlog (live GPS, social
sharing, PWA offline, Valhalla routing) whose priority was undecidable *because the
identity question underneath it was unresolved*.

This ADR records the outcome of a `/grill-with-docs` session (2026-06-29) that forced
the fork and walked the dependent decisions.

## Decision

**1. Identity — safety-first, social-curious.** Upto is a trip-planning and
safety/check-in tool. That is the product and the homepage message. A *lightweight*
social layer is legitimate, but only where it reduces real coordination friction for a
safety trip — never as an engagement network in its own right.

**2. The social leash.** Of the social pieces in `squad-social-vision.md`:

| Piece | Verdict |
|-------|---------|
| Invite / accept / join a TripLink | **In.** Replaces the pre-mission group chat. This is [social-triplink-sharing.md](../plans/social-triplink-sharing.md). |
| Private post-trip recap card | **In.** "You made it back" summary (planned vs actual, check-in timeline). Private URL, no public feed. |
| Squad feed | **Parked — needs its own design session.** The idea has appeal but no agreed shape. Do not build until a dedicated grilling session defines what it is and who it serves. |
| Quiet streaks | **Out for now.** Gamification mechanic; revisit only if a feed exists and demand is proven. |
| Public leaderboards / KOMs / segments / activity stream / viral loop | **Rejected.** This is the Strava pattern the positioning explicitly rejects. |

**3. Live GPS is the next *major* bet — but not the next *thing*.** Streaming the
traveller's live position to watchers is committed as the headline project after the
safety core is hardened. It is framed as **safety** (a watcher sees where you are during
an active trip), not as squad-social. The mobile-shell path it requires is its own
record — see [ADR 011](011-capacitor-mobile-shell.md).

**4. Sequencing (one set of hands).**

1. **Harden the safety core first** — terrain-accurate picking (elevation currently
   reads ~0 off the ellipsoid, a real safety bug), verify the overdue→email escalation
   end-to-end, close the small danglers (GuidePace wiring, NoteModal, route persistence
   on view pages).
2. **Then** live GPS / Capacitor (the major bet).
3. **Then** social invite/accept/join.

**5. Escalation channel — email-only is acceptable *for now*.** Twilio SMS stays
scaffolded-but-off. Email proves the loop. **Consequence:** until SMS or push lands, the
overdue alert is a *soft* promise — do not make hard safety guarantees in marketing yet.

## Alternatives considered

- **Pivot to the full Anti-Strava social network.** Rejected. It contradicts the safety
  positioning that is Upto's actual differentiator and would commit a solo effort to
  building a social graph, feed, and growth loop before the safety core is even solid.
- **Pure safety, kill all social.** Rejected as too austere — invite/accept/join solves
  a genuine, repeatedly-felt friction (group-chat-before-every-mission) and is cheap on
  top of the persistence + notifications already shipped.
- **Start live GPS now / ship social first.** Both rejected in favour of hardening the
  existing safety promise first. Streaming a position is pointless if the escalation path
  or the elevation numbers underneath it are shaky.
- **Mandate SMS for overdue now.** Considered (it's the one moment a phone should buzz),
  but deferred on cost/setup grounds with the explicit caveat above.

## Consequences

- `squad-social-vision.md` is demoted to **rejected/parked**: it is no longer a roadmap
  driver. The two surviving pieces (invite/accept/join, recap) live in
  `social-triplink-sharing.md`; the squad feed is a future-session stub; the rest is
  explicitly declined.
- `vision.md`'s "What Upto is NOT" gets sharpened: still not a fitness tracker / feed /
  leaderboard, but lightweight trip-coordination social is now *in*.
- The roadmap gains an explicit gate: **no live-GPS work starts until the safety core is
  hardened.** This is the anti-tangent rule.
- Marketing copy must not over-claim escalation reliability until SMS/push ships.
- A future "squad feed" grilling session is a known, named piece of work.

## Reconsider if

- Users start asking "can I see what my friends are doing?" in volume — the demand signal
  that the squad feed (or more social) is worth defining.
- A competitor ships a credible "Check In" safety primitive and the differentiation
  window starts closing.
- The safety core proves *harder* to harden than expected — if so, live GPS slips
  further, it does not jump the queue.
- SMS/push escalation ships — at which point the marketing-caveat consequence lifts.
