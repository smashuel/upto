---
type: plan
status: in-progress
related: [backend-server.js, src/config/api.ts, src/hooks/useAuth.ts, src/pages/CreateAdventure.tsx, src/pages/Profile.tsx, src/pages/PublicAdventureView.tsx, brain/features/emergency-contacts-account-level.md, brain/features/triplink-route-persistence.md, brain/plans/social-triplink-sharing.md]
tags: [persistence, auth, postgres, linode, security, hardening]
---

# Persistence + Auth — Hardening, Not Greenfield

**Rewritten 2026-04-22 after an audit of [backend-server.js](../../backend-server.js). The original plan assumed this was greenfield — most of it is already shipped.** See [decisions/009-native-auth-over-clerk.md](../decisions/) (to write) for why we're keeping what's here.

## What already exists (verified 2026-04-22)

- **Linode Postgres** at `localhost:5432`, database `upto_db`. Idempotent `initDB()` in [backend-server.js](../../backend-server.js) creates `users`, `contacts`, `triplinks` (JSONB `data` column), `check_ins` on startup.
- **Native auth**: scrypt password hashing (no bcrypt dep), session tokens stored on `users.session_token`, `requireAuth` middleware verifies `Authorization: Bearer <token>`. Endpoints: `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`.
- **Google OAuth**: full redirect + callback flow (`/api/auth/google`, `/api/auth/google/callback`), find-or-create user, redirects back to `/login?session=<token>`.
- **Contacts CRUD**: all four routes protected. `is_favourite` flag exists on the row.
- **TripLink lifecycle**: `POST /api/triplinks` (upsert by id), `GET /api/triplinks/:shareToken` (with joined check-ins), `PATCH /start`, `POST /checkin`, `PATCH /complete`. Status machine: `planned → active → overdue | completed`.
- **Real-time**: SSE stream at `GET /api/triplinks/:shareToken/events` with 25s heartbeat; broadcasts `status`, `checkin`, `overdue`.
- **Overdue checker**: 60s interval, 15-minute grace past `expected_return_time`, flips `status` to `overdue` and broadcasts.
- **Frontend wiring**: [useAuth.ts](../../src/hooks/useAuth.ts) persists session in localStorage and restores on load. [Profile.tsx](../../src/pages/Profile.tsx) runs contacts CRUD live. [CreateAdventure.tsx:198](../../src/pages/CreateAdventure.tsx#L198) calls `api.createTripLink(tripLink)` (keeps a localStorage copy as offline fallback). [ActiveTrip.tsx](../../src/pages/ActiveTrip.tsx) + [PublicAdventureView.tsx](../../src/pages/PublicAdventureView.tsx) exist.

This is not a "build the DB" plan. The DB exists and is in use. This plan closes the gaps between shipped and safe-to-leave-alone.

## Stack (no change)

- **Postgres**: existing Linode-local instance. Sub-ms connection, no extra vendor, already paid for as part of the VPS.
- **Auth**: native scrypt + session tokens + Google OAuth. Works, no JWT/webhook/third-party-dashboard overhead.
- **ORM**: none. Raw `pg` queries in [backend-server.js](../../backend-server.js). Fine at this scale — revisit only if query complexity grows.
- **Email transport**: to choose in Phase 4. Resend is the current frontrunner (generous free tier, simple HTTP API).

No Neon, no Clerk, no Drizzle. The earlier recommendation was written without reading the code.

## Actual gaps (in priority order)

| # | Gap | Risk today | Phase |
|---|-----|-----------|-------|
| 1 | DB password in plaintext at [backend-server.js:13](../../backend-server.js#L13) fallback | Credential in source control | 1 |
| 2 | TripLink write endpoints (`POST /api/triplinks`, `/start`, `/checkin`, `/complete`) not `requireAuth`-protected | Anyone with a share_token can tamper — and share_tokens appear in URLs | 1 |
| 3 | Wizard still collects emergency contacts inline; no link to account `contacts` rows | Blocks [emergency-contacts-account-level.md](../features/emergency-contacts-account-level.md) | 2 |
| 4 | No email/SMS transport — `overdue` is set in DB and broadcast over SSE but never reaches a human not currently watching the page | Safety story is incomplete | 3 |
| 5 | `PublicAdventureView.tsx` not end-to-end verified against DB-backed fetch | Unknown breakage | 4 |

---

## Phase 1 — Security hardening (do first)

Smallest, highest-leverage. Everything else builds on these endpoints being trustworthy.

### 1a. Move DB credentials out of source

- Remove the inline connection string at [backend-server.js:13](../../backend-server.js#L13). Throw on missing `DATABASE_URL` instead.
- Set `DATABASE_URL` in the PM2 env on Linode via `ecosystem.config.js` or `pm2 set`. Document in [CLAUDE.md](../../CLAUDE.md) Environment Variables.
- Rotate the `upto_user` password at the same time, since the current one is in the repo history.

### 1b. Decide the TripLink write auth model, then enforce it

Two viable models — pick one before writing code:

- **Capability model (lighter)**: treat `share_token` as an unguessable capability for `/start`, `/checkin`, `/complete` (what we have today). Requires tokens to be long + high-entropy + not logged. Good fit for "I gave my partner the URL and they should be able to hit check-in without signing in."
- **Owner-only model (stricter)**: require `requireAuth` for `POST /api/triplinks` always, and for mutating endpoints require either the owner's session **or** a valid share_token. Check-in stays usable by a non-owner.

**Recommendation**: owner-only on `POST /api/triplinks` and `DELETE`; capability model (share_token) on `/start`, `/checkin`, `/complete` — with token hardening (32-byte base64url, never echoed in logs, 1-req/sec rate limit per token).

Whichever wins, write it up briefly in [decisions/](../decisions/) as an ADR.

**Exit:** `curl` against each mutating endpoint without proper auth returns 401/403.

### 1c. Cleanup

- Audit `console.log` calls for leaked tokens / emails.
- Add a short README to [backend-server.js](../../backend-server.js) header comment listing which endpoints are public, which are capability-guarded, which are auth-guarded.

**Gate:** the audit checklist above passes; smoke test that existing frontend flows still work (sign in, create a TripLink, start it, check in, complete).

## Phase 2 — Emergency contacts live on the account

Implements [features/emergency-contacts-account-level.md](../features/emergency-contacts-account-level.md). All prereqs shipped — this is unblocked.

- Schema: add `is_emergency BOOLEAN DEFAULT FALSE` to `contacts` via idempotent `ALTER TABLE IF NOT EXISTS` in `initDB()` (matches the existing pattern).
- TripLink body: drop the inline contact fields; carry a `string[]` of contact IDs plus a per-trip opt-out list inside the existing JSONB `data`. No schema migration needed because TripLinks are JSONB.
- [AdventureContactsStep.tsx](../../src/components/forms/AdventureContactsStep.tsx) becomes a read-only "who will be notified" confirmation with per-trip opt-outs and a link to Profile.
- [Profile.tsx](../../src/pages/Profile.tsx) already has contacts CRUD — extend the row UI to toggle `is_emergency`.
- Migration for existing TripLinks: they keep their embedded contacts (a historical record of who *was* notified). New TripLinks use references.

**Gate:** a user can edit their emergency circle once on Profile; a new trip picks them up automatically without re-typing.

## Phase 3 — Notification transport — SHIPPED 2026-05-27

Turns `overdue` from a DB state into an outbound message. Two passes:

- **v1**: Twilio-only scaffold, stub-when-no-creds.
- **v2**: Added Resend (email) as the primary channel because the user prefers email-first while solo-dev (Twilio has per-message cost; Resend is free at this scale). Twilio path remains; flipping it on later is set-three-env-vars + redeploy.

See [features/notification-transport.md](../features/notification-transport.md) for the full shipped surface, channel-priority table, and going-live checklists for both providers.

Built:

- [notifications.js](../../notifications.js) — `sendSms` (Twilio) + `sendEmail` (Resend) + `dispatchToContact` channel-picker + `notifyTripStart` + `notifyTripOverdue`. Each adapter stubs to console when its creds are absent.
- Hooked into `PATCH /api/triplinks/:token/start` (all included contacts) and the 60s overdue checker on status transition (emergency-circle subset only).
- `isEmergency` snapshot added to the embedded contact shape so the overdue dispatcher knows who to filter by.
- Wizard warns inline when a contact has neither phone nor email — i.e. wouldn't be reached by any channel.
- `deploy.sh` bundles `notifications.js` and conditionally pass-throughs `RESEND_API_KEY`, `RESEND_FROM`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.

Smoke test: `PATCH /start` against a planned TripLink twice (once per pass) — dispatcher fired, log lines confirmed wiring, status rolled back via SQL each time.

**Investigated and rejected**: Gmail "send-as-user" via OAuth `gmail.send` scope. Google classifies it as a restricted scope requiring a full app-verification + CASA audit before production use — weeks of process for marginal trust benefit. Resend with a verified `upto.world` domain gets us ~90% of the deliverability win for ~20 min of DNS setup.

**Out of scope (deliberate)**:
- UI confirmation on Start (fire-and-forget; small follow-up: `/start` returns `{ notified, skipped }` → frontend toasts)
- Trip completion notification (user said no — avoid fatigue)
- Idempotency log table (`WHERE status = 'active'` on the overdue checker makes transitions one-shot)
- Phone E.164 normalization (Twilio errors on invalid; we log and move on)

**Going-live (email-first)**: verify `upto.world` in Resend → set `RESEND_API_KEY` → redeploy. Then `[email STUB]` logs flip to real sends. Twilio creds can be added later anytime to add SMS for phone-bearing contacts.

## Phase 4 — Tie-up + verification

- Verify [PublicAdventureView.tsx](../../src/pages/PublicAdventureView.tsx) end-to-end against a DB-stored TripLink (a non-owner URL should work without sign-in — this is a core user story).
- Remove the localStorage fallback at [CreateAdventure.tsx:200-203](../../src/pages/CreateAdventure.tsx#L200-L203) **or** demote it to an offline-write queue (only write to localStorage if the API call fails). Today it writes both paths on every save, which will drift.
- Add a small `/api/auth/me` smoke test that the frontend runs on boot — if it 401s, clear the stale session in localStorage rather than hanging on "loading".
- Audit [CLAUDE.md](../../CLAUDE.md) Known Issues + [brain/project/status.md](../project/status.md) against shipped reality (part of this plan's output — see [journal/](../journal/) for the audit log).

**Gate:** a full trip flow works on one device, a fresh browser on another device can view the public share URL, and the overdue email lands without manual intervention.

---

## Out of scope (explicit)

- **Migrating to Neon / Vercel Postgres.** Linode-local is sub-ms and free-at-margin; the switch buys us nothing until ops pain appears.
- **Replacing native auth with Clerk.** Native works. Revisit only if we need SAML / enterprise / magic links badly enough to offset the rewrite.
- **Adopting Drizzle.** Raw `pg` queries are readable at current volume. Add an ORM when a migration gets gnarly, not pre-emptively.
- **Twilio / SMS.** Email first. SMS is a Phase 5+ if users ask for it.
- **Social sharing.** See [plans/social-triplink-sharing.md](social-triplink-sharing.md). Unblocked by Phase 2; still a separate plan because of its scope.
- **Moving the backend to Vercel Functions.** Not without a bigger reason than "serverless".

## Critical files

| File | Phase | What changes |
|------|-------|--------------|
| [backend-server.js](../../backend-server.js) | 1 | Remove plaintext fallback; add `requireAuth` to owner-mutating TripLink endpoints; add `is_emergency` column in `initDB()` |
| `backend/transports/email.js` (new) | 3 | Transport wrapper + templates |
| [src/components/forms/AdventureContactsStep.tsx](../../src/components/forms/AdventureContactsStep.tsx) | 2 | Becomes read-only confirm with per-trip opt-outs |
| [src/pages/Profile.tsx](../../src/pages/Profile.tsx) | 2 | Add `is_emergency` toggle on contact rows |
| [src/pages/CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx) | 2, 4 | Switch emergency contact field to contact-id refs; demote localStorage write |
| [src/pages/PublicAdventureView.tsx](../../src/pages/PublicAdventureView.tsx) | 4 | E2E verify against DB fetch |
| [CLAUDE.md](../../CLAUDE.md) | 1, 4 | Update "Known Issues" to reflect shipped auth/DB; document `DATABASE_URL` as required |
| [brain/project/status.md](../project/status.md) | 4 | Bump "Known gaps" — DB + auth are no longer a gap |

## Verification per phase

1. `npx tsc --noEmit` clean (`/build-check`)
2. `npm run lint` clean
3. Backend healthy on Linode (`/check-backend`)
4. Phase-specific gate above

## Brain updates as phases land

- Phase 1: write the auth-model ADR under [decisions/](../decisions/). Update [CLAUDE.md](../../CLAUDE.md) env table.
- Phase 2: tick [features/emergency-contacts-account-level.md](../features/emergency-contacts-account-level.md) to `shipped`, move in [roadmap.md](../project/roadmap.md).
- Phase 3: write the transport-choice ADR. [status.md](../project/status.md) headline — Upto is now a functional safety tool, not just a planner.
- Phase 4: close the plan, correct any remaining stale claims in the brain, run [plans/social-triplink-sharing.md](social-triplink-sharing.md) Phase 0 (competitor research) as the next foundation piece.
