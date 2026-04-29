---
type: feature
status: backlog
related: [brain/plans/social-triplink-sharing.md, brain/features/emergency-contacts-account-level.md, brain/features/triplink-route-persistence.md, src/pages/ActiveTrip.tsx, src/pages/PublicAdventureView.tsx, backend-server.js]
tags: [social, squads, vision, future, anti-strava]
---

# Squad Social Vision

Captured 2026-04-22 from a user-supplied spec. **Backlog / future consideration only** — this is not the next phase. The persistence + auth hardening plan finishes first; nothing here gets built until that lands and we re-evaluate priorities.

## Vision

Upto re-positions as **"the Anti-Strava for real adventurers"**: a social app where you complete real-world outdoor missions with friends, with built-in safety that actually works. No segments. No KOMs. Just squads, missions, and the confidence that someone's watching your back.

The central feature is **Check In** — proactive, social, impossible to ignore safety:

| Step | What happens |
|------|--------------|
| 1. Plan | Set route, expected return time, Home Base contact |
| 2. Share | Squad + 1 Home Base contact get a live tracking link |
| 3. Execute | App tracks GPS path vs planned route in low-power background |
| 4. Verify | At expected return, 15-minute window to manually check in |
| 5. Escalate | Miss the window → Home Base auto-notified with last-known location, planned route, photo timestamps |

The social layer drives engagement:

- **Squad Watch** — squad members can see if you've started your check-in; can send a "you good?" nudge if you're running late
- **Streaks** — consecutive safe returns ("47 missions, 47 check-ins"); gamified responsibility, *not* public leaderboards
- **Route Deviations** — geofence triggers an "Exploring or lost?" prompt; one tap updates the squad
- **Post-Mission Recap** — auto-generated summary: planned vs actual, photos, "Checked in safe at 6:47 PM" badge

The viral loop: every safety invite is a growth channel. Home Base contacts (parents, partners) are non-outdoor users brought into the app by their adventurer's safety setup; over time they convert to participants.

The 2026 angle: privacy-first. Encrypted, no data selling, deleted 30 days post-mission. The trust moat that Strava (data controversies) and AllTrails (corporate ownership) can't match.

## How it overlaps with what's already shipped

A surprising amount of the safety primitive **already exists** — see the audit notes in [brain/project/status.md](../project/status.md) "Recent shipped" (2026-04-22).

- **TripLink lifecycle** — `planned → active → overdue → completed`, **15-minute grace** (matches the spec exactly), implemented in [backend-server.js](../../backend-server.js)
- **Manual check-in** — `POST /api/triplinks/:token/checkin` with what3words location + optional message; the [ActiveTrip.tsx](../../src/pages/ActiveTrip.tsx) page hosts a check-in panel
- **Watcher view** — [PublicAdventureView.tsx](../../src/pages/PublicAdventureView.tsx) is essentially the spec's "Home Base view": primary-contact CTA, status badge that pulses red on overdue, check-in history, last-check-in stamp
- **SSE live updates** — watchers see check-ins in real time over the existing event stream
- **Overdue checker** — 60-second interval flips status and broadcasts an `overdue` event when grace expires
- **Per-trip emergency contacts with `isPrimary`** — close to the "Home Base" role, just under a different name

The two specifically-mentioned-in-spec safety mechanics that are **missing**:

- **Auto-escalation transport** — overdue is detected and broadcast over SSE, but no email/SMS transport reaches a human who isn't already on the page. This is **Phase 3 of the in-flight persistence-and-auth plan**, not net-new work.
- **Live GPS tracking** — the app today is plan-only; ActiveTrip is passive (no background location, no actual route).

## Net-new pieces (the actual social layer)

What this vision *adds* on top of what's shipped or already in flight:

| Piece | Notes |
|-------|-------|
| **Squad** as a first-class concept | Distinct from emergency contacts. Per-user list of friends who can see in-progress trips and send nudges. Schema-wise, simplest path is role flags (`is_squad`, `is_home_base`) on the existing `contacts` table |
| **Squad feed** | A `/squad` page listing in-progress + recent missions across the user's squad. Defer; needs auth + invitations to be useful |
| **Invite / accept / join flow** | Already covered in concept by [plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md) — `triplink_invitations` and `triplink_participants`. That plan is the more concrete slice of this vision |
| **Post-mission recap card** | Auto-generated on completion; planned-route render + check-in timeline + return-safely badge. Shareable URL the squad sees |
| **Quiet streak counter** | Per-user counter of consecutive safe returns. Visible on profile and feed. Explicitly **no public leaderboards or KOM-style boards** — that's the Strava model the positioning rejects |
| **Route deviation detection** | Geofence around planned route → "Exploring or lost?" prompt. Requires live GPS first |
| **Live GPS path + offline cached map tiles** | Big technical bet. Browser-PWA can do this on Android; iOS background location is hard without a native (Capacitor) shell. Separate plan when prioritised |
| **PWA / native shell** | Precondition for live GPS. Investigate as its own track |
| **Photo proof** with GPS metadata + timestamp | Lightweight version: photo upload during check-in. Heavy version: ML anti-cheat. v1 is the lightweight version |
| **Squad Challenge templates** | "Summit 3 peaks", "Multi-pitch with rotating leader", "Build a snow shelter and overnight". Pre-baked mission shapes that pull check-in cadence (e.g. mandatory hourly overnight pings). v2 |
| **Branding rewrite** | "Anti-Strava" copy on homepage, taglines, onboarding. Worthwhile but separate from any engineering work |

## Explicitly NOT on our roadmap (even if/when this gets built)

The spec includes several things we'd actively decline:

- **Public leaderboards / KOMs / segments** — this is the Strava pattern the positioning explicitly rejects. Streaks stay private/quiet
- **Satellite-fallback partnerships** (Garmin / Zoleo) in v1 — commercial deal, deferred to v2+
- **Insurance partner** ("Upto Rescue" tier) — commercial; v3+
- **Paid tiers** (Pro / Squad / Rescue) — no billing infra; capture pricing intent only when product-market fit is proven
- **ML anti-cheat for proof-of-mission** — meaningful only after a feed exists; v3+
- **Open-sourcing the Check In protocol** — positioning copy, not an engineering blocker. Defer until there's a v1 protocol worth opening
- **Selling location data of any kind** — ever. The privacy moat is the moat

## Why this is parked, not started

After audit on 2026-04-22 we agreed:

1. The persistence + auth hardening plan ([plans/persistence-and-auth.md](../plans/persistence-and-auth.md)) needs to finish — Phase 2 (account-level emergency contacts) and especially **Phase 3 (email transport)** are prerequisites. "Auto-escalation" is hollow without email actually leaving the building.
2. The wizard-polish + map-UX backlog has shorter-payoff items.
3. Mobile / live-GPS is the long pole of the full vision and deserves its own scoping pass.
4. The existing [plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md) is already a more concrete slice of the social layer (invitations, participants, in-trip view) — when this comes off the backlog, that's where the work continues.

## When to revisit

- After persistence-and-auth Phase 3 ships (email transport working in prod).
- If users start asking *"can I see what my friends are doing?"* in feedback — the demand signal that says safety alone isn't enough.
- If a competitor (Strava / AllTrails / Komoot) builds something like Check In and the differentiation window starts closing.

## Cross-references

- [plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md) — the more concrete slice (invitations, accept/decline, in-trip squad view). Status `draft`. When this vision is picked up, that plan is where work lands.
- [features/emergency-contacts-account-level.md](emergency-contacts-account-level.md) — moves contacts off the wizard; prereq for `is_squad` / `is_home_base` role flags.
- [features/triplink-route-persistence.md](triplink-route-persistence.md) — `SerializableTrack` on the TripLink; prereq for the post-mission recap card.
