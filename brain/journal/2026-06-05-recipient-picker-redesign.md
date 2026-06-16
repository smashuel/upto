---
type: journal
date: 2026-06-05
tags: [incident, ux, design, critique, notifications]
---

# 2026-06-05 — Recipient Picker redesign (Phase 3 v3)

## Symptom

User tested the Phase 3 v2 (Resend email) flow and reported: "tried Start, nothing came up in my inbox. it didnt give me a confirmation or prompt me or who to send through the link to from my contacts."

## Root cause (the real one)

Investigation found **two** stacked failures:

1. **Silent zero-watcher TripLink.** The wizard's Emergency Contacts ExpandSection lazy-mounted its component (`TripLinkContactsStep`). The auto-populate-from-emergency-circle effect ran *only on step mount*. Users who never opened the step (or scrolled past it to tap "Create TripLink") submitted with `emergencyContacts: []`. The TripLink saved with no contacts; `notifyTripStart` ran, found nothing, exited silently. Resend was never called.

2. **Resend domain not verified.** Even if contacts had been embedded, Resend's API was returning `403 — The upto.world domain is not verified` — the user hadn't completed (or hadn't yet had propagated) the Porkbun DNS verification. With fire-and-forget dispatch, this surfaced only in `pm2 logs`, never to the user.

The user experienced the combined effect: "nothing happens when I tap Start" with no visible explanation.

## Design critique scores (full critique above this entry in conversation)

| # | Heuristic | Score | Issue |
|---|-----------|-------|-------|
| 1 | Visibility of System Status | 0 | Start dispatched silently |
| 5 | Error Prevention | 0 | Could create no-watcher trip without warning |
| 9 | Error Recovery | 1 | Success screen identical for 0-watcher vs full-circle trips |

Total: 18/40. P0/P1 issues stacked on the safety-critical path.

## Decision — restructure the post-create flow

After the user said: *"once you have set up the triplink, it should take you to your list of contacts with favourites and emergency kin at the top (pre-selected) but then you can select/deselect from there to be sent the triplink"* — the chosen pattern:

```
1. Wizard form         → tap "Create TripLink" → TripLink saved (empty contacts)
2. RecipientPicker     ← the canonical "who gets notified" UI
   • Emergency Circle (pre-checked)
   • Favourites
   • Other contacts
   • Ad-hoc for this trip
3. "Notify N watchers" → backend updates JSONB + dispatches synchronously
4. Toast confirms     → "Notified 2 watchers (1 SMS, 1 email)"
5. ActiveTrip Watchers panel ← durable proof
```

Unifies the two share paradigms (manual `sms:`/`mailto:` buttons vs auto-dispatch) into one model. Replaces the wizard's optional contacts step entirely.

## What shipped

- **[src/components/forms/RecipientPicker.tsx](../../src/components/forms/RecipientPicker.tsx)** — new component with grouped contact lists, ad-hoc add form, channel hints, missing-channel warnings
- **[backend-server.js](../../backend-server.js)** — `PATCH /api/triplinks/:token/start` now accepts optional `emergencyContacts` in body; updates JSONB via `jsonb_set`; runs `notifyTripStart` synchronously to return `{ notified, skipped }`
- **[notifications.js](../../notifications.js)** — `notifyTripStart` now returns the per-recipient outcome shape instead of just logging
- **[src/config/api.ts](../../src/config/api.ts)** — `startTrip(shareToken, { emergencyContacts })` signature; returns the summary
- **[src/pages/CreateAdventure.tsx](../../src/pages/CreateAdventure.tsx)** — removed old per-contact `Text/Email/Copy` panel + removed Emergency Contacts ExpandSection; integrated RecipientPicker; toast off the summary; confirm-modal on zero-recipient Start; dynamic button text "Notify N watchers"
- **[src/pages/ActiveTrip.tsx](../../src/pages/ActiveTrip.tsx)** — fetches TripLink from backend (was localStorage-only); new Watchers panel between timing strip and check-in panel

## Verification

Backend smoke test with synthetic contact:
```
PATCH /api/triplinks/<token>/start
  body: { emergencyContacts: [{ name: "Test", email: "...", isEmergency: true, ... }] }
→ { ok: true, notified: [], skipped: [{ name: "Test", reason: "resend-error" }] }
```

This is the *correct* output — Resend returned 403 because the domain isn't verified. Frontend's error toast will now say "Couldn't notify 1: Test" so the failure is visible.

## Carry-forward

The user needs to actually complete the Porkbun DNS records for Resend domain verification. The DNS records are in their Resend dashboard at https://resend.com/domains. Once verified, the same /start call returns `notified: [{ name: "Test", channel: "email" }]` and a real email lands.

## Lessons

- **Lazy-mounted optional sections + crit-path data = silent footgun.** Don't bury value-prop data in optional UI surfaces. If the user can't complete the value prop without it, it's not optional.
- **Fire-and-forget is wrong for safety actions.** A user tapping "I'm heading out" wants confirmation. Add 100–500ms of latency for synchronous dispatch — they want to *know*.
- **The post-action screen is where trust is built.** ActiveTrip showing "Watchers notified" + delivery channels is the receipt that makes the user believe the system works.
- **Test the unhappy path.** I'd smoke-tested `/start` with an empty contacts array (returned 200 successfully but did nothing). I hadn't smoke-tested the happy path with contacts present. Both should be exercised before declaring done.
