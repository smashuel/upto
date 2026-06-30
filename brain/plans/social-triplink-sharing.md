---
type: plan
status: draft
related: [src/types/adventure.ts, src/types/user.ts, src/pages/Profile.tsx, backend-server.js, brain/features/emergency-contacts-account-level.md, brain/features/triplink-route-persistence.md]
tags: [social, sharing, postgres, auth, invitations, friends, research]
---

# Social TripLink Sharing — Multi-Phase Plan

Turn a TripLink from a one-way safety broadcast into something with a social dimension: the owner can send it to their contacts/favourites, recipients can **accept** or **join**, and joined participants show up on the in-trip map. Removes the current friction of needing a side-channel group chat before any mission.

> **Status:** draft, but **greenlit in principle** — this is the "invite/accept/join" feature confirmed in-scope by [ADR 010](../decisions/010-product-direction-safety-first-social-leash.md). **Sequenced 3rd**: it starts only *after* the safety core is hardened and live GPS. This is a scoping doc, not an execution plan — still needs competitor research + schema design before any Phase 2+ code.
>
> **Dependency update (2026-06-29):** the "all unshipped" dependencies below are now mostly **shipped** — Postgres, native auth, email transport, and account-level emergency contacts are all live. The "Auth choice (TBD)" in Phase 1 is settled: **native scrypt auth** ([ADR 009](../decisions/009-native-auth-capability-share-tokens.md)). The remaining hard precondition is [triplink-route-persistence.md](../features/triplink-route-persistence.md) for the in-trip shared view (Phase 4).

## Why this exists

User's original framing: *"When you've generated a TripLink, you should be able to send it out to a bunch of people and have it possible that they can accept or join. This would make it easier — you don't have to start a group chat before going out on a big mission. Have the option to quickly send it out to a bunch of people whether they're in your favourites or not."*

This is complementary to — not a replacement for — the emergency-contacts model. Emergency contacts are the safety fallback (notified on SOS / overdue). Social contacts are the people actually going on the trip or rooting for it from home. Some overlap, distinct roles.

## Dependencies (all unshipped)

- **Postgres** — localStorage is not a multi-user store.
- **User auth** — can't invite *users* who don't exist.
- **Notification transports** (email at minimum) — accept/decline invites land in an inbox.
- **[triplink-route-persistence.md](../features/triplink-route-persistence.md)** — joined participants need the route to render on their device.
- **[emergency-contacts-account-level.md](../features/emergency-contacts-account-level.md)** — contacts list lives on the account; reuse it for the social pool.

---

## Phase 0 — Competitor research

**Candidate specialist subagent: `competitor-ux-researcher`.** Brief it on Upto's safety-first framing and ask for a structured audit of how these products handle the invite → accept → join → shared-in-trip flow:

| Product | Audit focus |
|---------|-------------|
| Strava | Groups, segments, following vs. friending, privacy zones |
| AllTrails | Trip sharing, plan sharing, following |
| Komoot | Tour sharing, participant following, discussion threads |
| FarOut (Guthook) | Comment sharing, section tracking, group coordination |
| Polarsteps | Trip invitations, co-editing, follower view |

Output: `brain/research/social-sharing-competitor-patterns.md` with:

- Invitation flow diagrams per product
- Privacy defaults (public / followers-only / invite-only)
- Notification channels (email / push / in-app)
- How "joined" differs from "followed" / "subscribed"
- What information participants see about each other (position? ETA? check-in status?)
- Friction points users complain about (App Store / Reddit reviews)

Only after that research do we lock in Upto's model.

## Phase 1 — Schema design

**Candidate specialist subagent: `schema-architect`** (DB expert). Brief with the research output + Upto's auth choice (TBD) + TripLink shape from `adventure.ts`.

Straw-man tables (subject to research refinements):

```sql
-- user already exists once auth lands
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  -- ...auth fields
  created_at TIMESTAMPTZ DEFAULT now()
);

-- per-user address book. same table hosts emergency contacts (via role flag).
CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- null if contact isn't an Upto user yet
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_favourite BOOLEAN DEFAULT false,
  is_emergency BOOLEAN DEFAULT false,
  notify_email BOOLEAN DEFAULT true,
  notify_sms BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE triplinks (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ...wizard fields, planned_route jsonb, planned_basemap text
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE triplink_invitations (
  id UUID PRIMARY KEY,
  triplink_id UUID NOT NULL REFERENCES triplinks(id) ON DELETE CASCADE,
  invited_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  invited_email TEXT, -- for non-users; becomes an account-link invite
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE triplink_participants (
  triplink_id UUID NOT NULL REFERENCES triplinks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'joined', 'follower')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (triplink_id, user_id)
);
```

Open questions for the schema agent:

- Do we distinguish **joined** (actually going) from **follower** (just watching from home)?
- Do non-users get a "soft" invite (by email, with a sign-up link) or is sign-up a prerequisite to being invited?
- Privacy: can invitees see each other's contact details, or only display names?
- Does a declined invite soft-delete or hard-delete?
- Indexes: primary access patterns are "my outgoing invitations", "my incoming invitations", "participants on this trip" — design accordingly.

## Phase 2 — UI: share + recipient picker

- "Share" button on a saved TripLink (wizard review step + TripLink detail view).
- Picker backed by the account's `contacts` list, with a toggle between "Favourites" and "All contacts". Search by name/email.
- Optional: "Also invite by email" input for people not yet in the address book.
- Multi-select + send.
- Confirmation toast with "N invitations sent".

## Phase 3 — Accept / decline flow

- Invitee receives email (reuses the emergency-notifications transport, once shipped).
- Deep link lands them on `/invitations/:id` with Accept / Decline / Join buttons.
- If logged in: one-click.
- If not logged in: prompt sign-in / sign-up first, invitation is preserved and applied post-auth.
- Declined invites stay visible to the owner (so they know who won't be there).

## Phase 4 — In-trip shared view

- Joined participants' current positions appear on the TripLink's map alongside the owner's live GPS (same canvas as [triplink-route-persistence.md](../features/triplink-route-persistence.md)'s rehydrated route).
- Off-route / overdue alerts fan out to the full participant group — not just emergency contacts — so the people on the trip also see "Alex is 500 m south of the planned line".
- Privacy toggle: a participant can share **with trip** / **with owner only** / **off**. Sensible defaults likely "with trip" for the duration of the trip only.

## Non-goals (explicit)

- Public feeds, activity streams, likes, comments — this is not a Strava clone. Upto's core is safety + planning; the social layer exists to reduce coordination friction, not to create a social network.
- Public TripLink discovery ("find trips near me"). Out of scope for v1.
- Group chat / messaging inside the app. The whole point of the feature is to replace the need for a side-channel chat, not reinvent one. Defer.

## Risk / watch list

- **Privacy by default.** Location data is sensitive. Every default on this plan should err on the side of "less shared" — opt-in, not opt-out.
- **Spam vector.** Inviting arbitrary emails from a free account could be abused. Rate-limit invitations per user per day; cap email invites to non-users.
- **Emergency-contact confusion.** Clearly separate "social invitees" from "emergency contacts" in the UI so users don't think accepting an invite makes someone their emergency contact.

## Entry criteria (when to pick this up)

All three of:

1. Postgres + auth shipped
2. Notification transports (email at minimum) shipped
3. [emergency-contacts-account-level.md](../features/emergency-contacts-account-level.md) shipped (establishes the contacts table this plan builds on)
