---
type: feature
status: shipped
related: [notifications.js, backend-server.js, deploy.sh, src/components/forms/AdventureContactsStep.tsx, src/types/adventure.ts]
tags: [safety, notifications, sms, twilio, transport]
---

# Notification Transport — SMS via Twilio (stub-when-no-creds)

Phase 3 of [plans/persistence-and-auth.md](../plans/persistence-and-auth.md). Turns Upto from a planning tool into a working safety system: when a trip starts, watchers get an SMS with the share URL. When a trip goes overdue, the emergency-circle subset gets an alert SMS.

## Shipped (2026-05-27)

### Adapter — [notifications.js](../../notifications.js)

Single file at the repo root (deployed to Linode alongside `backend-server.js`). Two exported functions plus an internal `sendSms`:

- `sendSms(to, body)` — calls Twilio's REST API via native `fetch` (no SDK dep). If `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` aren't all set, runs in **stub mode**: logs `[sms STUB] would send to <to>: <body>` and returns success. Lets us deploy + wire end-to-end before the Twilio account exists.
- `notifyTripStart(tripLink)` — fires on trip start. Messages every embedded contact with a phone number, regardless of `isEmergency`.
- `notifyTripOverdue(tripLink)` — fires when the overdue checker flips a trip to `overdue`. Messages only contacts where `isEmergency === true` and a phone is present.

### Triggers — [backend-server.js](../../backend-server.js)

- `PATCH /api/triplinks/:token/start` → after broadcasting the status change to SSE, fire `notifyTripStart` asynchronously (fire-and-forget; doesn't delay the response, errors log)
- The 60-second overdue checker → after the `UPDATE ... SET status = 'overdue'` succeeds and the SSE broadcast goes, fire `notifyTripOverdue` on that row only

Both use `.catch(err => console.error(...))` so a Twilio outage never blocks state transitions or other trips in the same sweep.

### `isEmergency` snapshot on embedded contacts

Adds `isEmergency?: boolean` to the `Contact` type in [src/types/adventure.ts](../../src/types/adventure.ts). When the wizard builds a contact entry from the user's emergency-circle list in [AdventureContactsStep.tsx](../../src/components/forms/AdventureContactsStep.tsx), it snapshots the contact's `is_emergency` flag at save time. Ad-hoc contacts (manually added during the wizard) default to `undefined` (treated as false).

Snapshot model preserves the audit trail — a later toggle on Profile doesn't retroactively change which historical trips would have alerted whom.

### Wizard UX

- Inline warning under any included contact missing a phone number: `⚠ Won't be notified — add a phone number` (in danger-red). Shown on both the emergency-circle list and the ad-hoc list.
- No banner-level summary — the per-row warnings are enough.

### Env handling

`deploy.sh` now:

- Bundles `notifications.js` alongside `backend-server.js` in the upload tar
- Generates `ecosystem.config.cjs` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` reading from `process.env` (empty string fallback)
- Conditionally writes those three to the on-server `.env` only if set in the deployer's shell — keeps the file clean when stubbed

Once the user creates their Twilio account, the workflow to go live:

```bash
export TWILIO_ACCOUNT_SID='AC...'
export TWILIO_AUTH_TOKEN='...'
export TWILIO_PHONE_NUMBER='+1...'    # the Twilio sender number
bash deploy.sh
```

Or add the three keys to `.env` and run the deploy normally — they get auto-sourced by the script.

## Smoke test (2026-05-27, post-deploy)

Hit `PATCH /api/triplinks/<token>/start` against a planned TripLink. Backend logs showed:
```
[notify] start: no contacts with phones for trip triplink-...
```
Confirms the dispatcher ran end-to-end. Status was rolled back via SQL afterwards to leave the test TripLink untouched.

## Message format

Start (single segment, ~140 chars):
```
Upto: <title> just started. Track them: <url>. Expected back ~<HH:MM>.
You'll only hear from us again if something's wrong.
```

Overdue:
```
⚠️ Upto: <title> is OVERDUE. Expected back <HH:MM>. Last check-in: <HH:MM or 'no check-in'>. Details: <url>
```

Times formatted in `Pacific/Auckland` (NZ default). Worth revisiting if we ever ship to AU/EU.

## Explicitly NOT done in this phase

- **Email transport** — user chose SMS-only. Existing email-only contacts won't be reached. The wizard warning makes this explicit per contact.
- **Completion confirmation** — user said no (avoid notification fatigue).
- **Check-in reminders** — separate Phase 3 sub-item, deferred.
- **Twilio account setup** — user does this, then sets the three env vars.
- **Phone number normalization (E.164)** — passed through as-is; Twilio errors on invalid numbers and we log the response.
- **Idempotency for overdue** — relies on the status transition being one-shot (`WHERE status = 'active'` filter on the overdue checker), so a transition only fires once per trip lifetime.
- **Notification log table** — could add later if we need delivery auditing or retry. For now, `pm2 logs` is the source of truth.

## Cross-references

- [features/emergency-contacts-account-level.md](emergency-contacts-account-level.md) — Phase 2; defines what "emergency circle" means on the account
- [plans/persistence-and-auth.md](../plans/persistence-and-auth.md) — Phase 3 row checked off; only Phase 4 (tie-up + localStorage demote) remains
- [features/squad-social-vision.md](squad-social-vision.md) — long-horizon backlog; revisit once Phase 3 is proven in prod with real SMS
