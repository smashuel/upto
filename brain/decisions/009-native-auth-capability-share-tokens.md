---
type: decision
status: accepted
related: [backend-server.js, src/hooks/useAuth.ts, src/config/api.ts, src/pages/CreateAdventure.tsx, brain/plans/persistence-and-auth.md]
tags: [auth, security, triplinks, architecture]
---

# 009 — Keep native auth; use capability model for TripLink lifecycle tokens

## Context

A plan written on 2026-04-22 recommended swapping Upto's backend to Neon + Clerk + Drizzle. An audit of [backend-server.js](../../backend-server.js) that same day revealed the stack the plan was about to "introduce" was **already shipped**: Linode Postgres, scrypt password hashing, session tokens, Google OAuth, contacts CRUD, TripLink lifecycle, SSE broadcast, overdue checker.

So the real question isn't "what stack should we adopt" — it's "what do we protect, and how?" The new decision surface is two-part:

1. Do we replace native auth with Clerk now that we're hardening?
2. For TripLink lifecycle endpoints (`/start`, `/checkin`, `/complete`) — do we require the owner's session, or accept a share_token as a capability?

## Decision

**1. Keep native auth.** Scrypt + session-token Bearer is working, covers the use case (password + Google OAuth), and costs nothing to run. Clerk would be a rewrite of working code plus a new vendor relationship and recurring cost. Revisit only if we need SAML / enterprise SSO / magic-link flows badly enough to offset the migration.

**2. Split the TripLink endpoints:**

| Endpoint | Model | Rationale |
|----------|-------|-----------|
| `POST /api/triplinks` (create/update) | **Owner-only** — `requireAuth`, `user_id` derived from session (body's `userId` ignored). Existing-row ownership check returns 403. | Creating a TripLink is an identity-bearing act — it ties safety-contact data to a user. Must be authenticated. |
| `GET /api/triplinks/:shareToken` | **Public** (share_token required) | Share view is supposed to work for anyone the owner gave the URL to, without sign-in. |
| `PATCH /api/triplinks/:shareToken/start` | **Capability** (share_token) | The traveller often hands the URL to a partner who physically starts the trip. Requiring sign-in breaks that flow. |
| `POST /api/triplinks/:shareToken/checkin` | **Capability** (share_token) | Same reason — any trip member should be able to check in. |
| `PATCH /api/triplinks/:shareToken/complete` | **Capability** (share_token) | Same reason. |

Share_tokens are already `crypto.randomUUID()` (122 bits). Good enough as URL capabilities, comparable to industry-standard doc-sharing links.

## Alternatives considered

- **Move to Clerk.** Rejected. It replaces working code with third-party code, adds a dependency, and buys us nothing today. The things Clerk is famous for (magic links, SAML, user-management UI) aren't on our roadmap.
- **Require owner session on `/start`, `/checkin`, `/complete` too.** Rejected. Breaks the "pass the URL to your partner" use case that's core to how this app gets used on a mission. The safety story is stronger when anyone on the trip can check in, not just whoever is signed in on their phone.
- **Drop `user_id` entirely, treat everything as capability.** Rejected. Without user ownership we can't build account-level emergency contacts, can't scope "my trips", can't hold anyone accountable for abuse.
- **Add Drizzle now.** Deferred. Raw `pg` queries are readable at current volume. Bring in an ORM when a migration starts being painful to write by hand, not before.

## Consequences

- The plaintext DB password fallback at [backend-server.js:13](../../backend-server.js#L13) is gone; `DATABASE_URL` is now required. The password still needs rotating separately on the Linode host — the old value is in git history.
- `api.createTripLink` now takes a `sessionToken` arg. Callers that can't produce one (anonymous flow) are rejected at the UI layer with a redirect to `/login`.
- Frontend [CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx) refuses to submit without a session — this is a UX behaviour change that will affect anyone who previously created TripLinks without signing up. They had no way to retrieve them anyway (no account to attach to), so the functional loss is marginal.
- Capability-guarded endpoints (`/start`, `/checkin`, `/complete`) are vulnerable to **griefing** if a share_token leaks. Mitigations to add when needed:
  - Per-token rate limit (1 req/sec)
  - Idempotency: a second `complete` call is a no-op, a second `start` returns 200 silently
  - `share_token` never logged
  - Audit trail on state transitions (who hit the endpoint from which IP)
- Future social-sharing plan ([plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md)) will need a distinction between *participants* (can check in) and *followers* (read-only). That's a Phase 2+ concern — the current capability model is strictly a stepping stone.

## Reconsider if

- We start seeing griefing against `/checkin` or `/complete` in production logs.
- A partner product integration requires SSO/SAML.
- We add a feature where non-owners need to mutate owner-only fields (e.g., social invitations). At that point the auth matrix gets revisited wholesale.
- Multi-tenant or B2B pivot — a user-management-heavy roadmap tips the Clerk calculus.
