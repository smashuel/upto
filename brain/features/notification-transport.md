---
type: feature
status: shipped
related: [notifications.js, backend-server.js, deploy.sh, src/components/forms/AdventureContactsStep.tsx, src/types/adventure.ts]
tags: [safety, notifications, email, sms, resend, twilio, transport]
---

# Notification Transport — Email-first (Resend), SMS-ready (Twilio)

Phase 3 of [plans/persistence-and-auth.md](../plans/persistence-and-auth.md). Turns Upto from a planning tool into a working safety system: when a trip starts, watchers get a message with the share URL. When a trip goes overdue, the emergency-circle subset gets an alert.

**Channel priority** (per contact, decided by `pickChannel` in [notifications.js](../../notifications.js)):

| Contact has… | Twilio configured? | Channel used |
|--------------|--------------------|--------------|
| phone + email | yes | SMS (preferred) |
| phone + email | no  | Email (Resend) |
| email only    | —   | Email (Resend) |
| phone only    | yes | SMS |
| phone only    | no  | SMS stub (logged) |
| neither       | —   | Skipped; wizard warns user pre-save |

The user explicitly chose email-via-Resend for v1 to avoid Twilio costs while solo-developing. The SMS path stays wired so flipping to Twilio later is a pure ops change (set three env vars + redeploy, no code).

## Shipped (2026-05-27)

### Adapter — [notifications.js](../../notifications.js)

Single file at the repo root, deployed to Linode alongside `backend-server.js`. Two adapters + a channel-picker + two dispatchers:

- `sendEmail(to, subject, body)` — calls Resend's REST API via native `fetch` (no SDK dep). If `RESEND_API_KEY` is unset, runs in **stub mode**: logs `[email STUB] would send to <to> (<subject>): <body>` and returns success.
- `sendSms(to, body)` — calls Twilio's REST API via native `fetch`. If any of `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` is unset, stubs to `[sms STUB] would send ...`.
- `dispatchToContact(contact, { subject, body })` — internal: picks SMS or email per contact (see priority table above).
- `notifyTripStart(tripLink)` — fires on trip start. Dispatches to every embedded contact via their best channel, regardless of `isEmergency`.
- `notifyTripOverdue(tripLink)` — fires when the overdue checker flips a trip to `overdue`. Dispatches to contacts where `isEmergency === true`.
- Both dispatchers log a one-line summary: `[notify] start trip=… → sms=N email=N stubbed=N failed=N skipped=N`

### Triggers — [backend-server.js](../../backend-server.js)

- `PATCH /api/triplinks/:token/start` accepts **optional `emergencyContacts: Contact[]`** in the request body. When present, the embedded snapshot in `data.emergencyContacts` is replaced via `jsonb_set(data, '{emergencyContacts}', $2::jsonb)` before the status transition. Then `notifyTripStart` runs **synchronously** so the response can carry a `{ notified, skipped }` summary back to the UI. Adds ~100–500ms latency vs. fire-and-forget; acceptable for a deliberate "I'm heading out" tap.
- The 60-second overdue checker → after `UPDATE ... SET status = 'overdue'` succeeds and the SSE broadcast goes, fire `notifyTripOverdue` fire-and-forget (errors log).

`notifyTripStart` returns `{ notified: [{name, channel, stubbed?}], skipped: [{name, reason}] }`. The frontend toasts off this shape:
- `Notified 2 watchers (1 SMS, 1 email)` — success
- `Notified 2 watchers (1 email) — stub mode` — Resend/Twilio not configured
- `Couldn't notify 1: <names>` — failures shown as a second error toast

### `isEmergency` snapshot on embedded contacts

Adds `isEmergency?: boolean` to the `Contact` type in [src/types/adventure.ts](../../src/types/adventure.ts). When the wizard builds a contact entry from the user's emergency-circle list in [AdventureContactsStep.tsx](../../src/components/forms/AdventureContactsStep.tsx), it snapshots the contact's `is_emergency` flag at save time. Ad-hoc contacts (manually added during the wizard) default to `undefined` (treated as false).

Snapshot model preserves the audit trail — a later toggle on Profile doesn't retroactively change which historical trips would have alerted whom.

### Wizard UX (redesigned 2026-06-05 after `/critique`)

The wizard's Emergency Contacts ExpandSection has been **removed**. The post-submit success screen now hosts a `RecipientPicker` ([src/components/forms/RecipientPicker.tsx](../../src/components/forms/RecipientPicker.tsx)) showing:

- **Emergency Circle** group (pre-checked from `is_emergency`)
- **Favourites** group (sorted second)
- **Other contacts** group
- Per-trip ad-hoc contacts ("for this trip only")
- Add-a-one-off-contact form
- Channel hints per row (📱 SMS / ✉ Email)
- Phone+email = both shown; missing channel = row disabled with `⚠ No phone or email — can't be notified`

Start button text becomes dynamic:
- 0 picked: `I'm heading out — Start with no watchers` (muted color) + sub-line: "No one will be told if you don't check in."
- N picked: `I'm heading out — Notify N watcher(s)`

Tapping Start with 0 picked surfaces a **confirm modal** (`AlertTriangle`, "Start with no watchers? No one will be notified..."). Picking "Pick contacts instead" dismisses; "Start anyway" calls `performStartTrip()` directly.

This redesign closed four critical issues identified in [journal/2026-06-05-critique-and-redesign.md](../journal/) (notification flow critique):

1. Silent zero-watcher TripLinks (the contacts step was lazy-mounted; users skipped it)
2. Invisible dispatch on Start (no toast, no confirmation)
3. Two share paradigms (manual `sms:`/`mailto:` buttons + auto-dispatch coexisted)
4. ActiveTrip showed no proof anyone was notified

### Env handling

`deploy.sh`:

- Bundles `notifications.js` alongside `backend-server.js` in the upload
- Generates `ecosystem.config.cjs` with all five provider env vars (`TWILIO_*`, `RESEND_API_KEY`, `RESEND_FROM`) reading from `process.env` with empty-string fallback
- Conditionally writes them to the on-server `.env` only if set in the deployer's shell — keeps the file clean when stubbed

### Going-live: Resend (the email-first path)

1. Create a free [Resend](https://resend.com) account
2. Add `upto.world` as a domain in the dashboard → it shows DNS records to add (SPF, DKIM, MX)
3. Add those records via Vercel (or wherever the apex `upto.world` DNS lives)
4. Wait for Resend to verify (usually minutes)
5. Generate an API key
6. Add to `.env`:
   ```
   RESEND_API_KEY='re_...'
   RESEND_FROM='Upto Safety <safety@upto.world>'   # optional; defaults to this
   ```
7. `bash deploy.sh`
8. Verify: tap Start on a TripLink with an email-bearing contact → backend logs switch from `[email STUB]` to `[notify] start trip=... → email=N`. The contact gets the email.

### Going-live: Twilio (when SMS is wanted later)

```bash
export TWILIO_ACCOUNT_SID='AC...'
export TWILIO_AUTH_TOKEN='...'
export TWILIO_PHONE_NUMBER='+61...'   # E.164 — the purchased Twilio sender number
bash deploy.sh
```

The moment those three env vars are present, `dispatchToContact` flips SMS on automatically for phone-bearing contacts. No code change required.

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

- **UI confirmation on Start** — backend dispatches in fire-and-forget; the frontend gets a 200 and navigates. No "Notified 3 watchers" toast. Worth a small follow-up (`/start` returns `{ notified, skipped }` → frontend toasts).
- **Manual "Notify now" button** — the per-trip include checkboxes in the wizard already control who gets the Start message; no separate button.
- **Completion confirmation** — user said no (avoid notification fatigue).
- **Check-in reminders** — separate Phase 3 sub-item, deferred.
- **Gmail send-as-user** — investigated 2026-05-27: rejected because `gmail.send` is a Google "restricted scope" requiring an app-verification + CASA audit before production use. Resend with a verified `upto.world` domain gives most of the deliverability/trust win for ~20 min of DNS setup.
- **Phone number normalization (E.164)** — passed through; Twilio errors on invalid numbers and we log the response.
- **Idempotency for overdue** — relies on the status transition being one-shot (`WHERE status = 'active'` filter on the overdue checker).
- **Notification log table** — could add later for delivery auditing or retry. For now, `pm2 logs` is the source of truth.

## Cross-references

- [features/emergency-contacts-account-level.md](emergency-contacts-account-level.md) — Phase 2; defines what "emergency circle" means on the account
- [plans/persistence-and-auth.md](../plans/persistence-and-auth.md) — Phase 3 row checked off; only Phase 4 (tie-up + localStorage demote) remains
- [features/squad-social-vision.md](squad-social-vision.md) — long-horizon backlog; revisit once Phase 3 is proven in prod with real SMS
