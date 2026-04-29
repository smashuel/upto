---
type: feature
status: planned
related: [src/components/forms/AdventureContactsStep.tsx, src/pages/Profile.tsx, src/types/adventure.ts, src/types/user.ts]
tags: [wizard, auth, emergency, contacts, safety]
---

# Emergency Contacts — Account-Level, Not Per-Trip

Move emergency contacts out of the trip creation wizard and onto the user's account. Every trip inherits the account's contacts; the wizard confirms "who will be notified" rather than re-collecting them.

## Problem

`AdventureContactsStep` currently asks the user to enter names, phones, emails, and escalation preferences every single trip. In reality, a recreationalist's emergency circle doesn't change between a Monday tramp and a weekend climbing mission — it's the same 2–4 people. Consequences:

- Friction on trip creation. Users copy/paste or re-type the same contacts.
- Inconsistency risk. One trip might forget a contact who matters; another might have an outdated number.
- It's unclear *which* contacts receive the SOS / check-in / TripLink delivery today — the wizard collects them but the transport layer isn't wired, so the mapping has never been made explicit.

## Proposal

- Contacts live on the **user account** (Profile page). One place to edit.
- SOS, check-in reminders, overdue escalation, and TripLink delivery all read from the account list.
- The wizard's contacts step becomes a **read-only confirmation**: "These contacts will be notified" with a link to Profile to edit. Users can still opt a specific contact out of a specific trip (toggle), but the default is "all".
- Make the notification channels explicit on the account screen: per-contact choice of email / SMS / both, mirroring the data model that already exists in `adventure.ts`.

## Files

- [src/pages/Profile.tsx](../../src/pages/Profile.tsx) — currently a stub; gains a contacts CRUD UI
- [src/components/forms/AdventureContactsStep.tsx](../../src/components/forms/AdventureContactsStep.tsx) — becomes a read-only confirm screen with per-trip opt-out toggles
- [src/types/user.ts](../../src/types/user.ts) — add `emergencyContacts: Contact[]` to the User type
- [src/types/adventure.ts](../../src/types/adventure.ts) — contacts stored on the TripLink become a **reference** (array of contact IDs) rather than a full copy, plus per-trip overrides

## Blocker

Needs user auth + account model. Both unshipped. This is the same prereq gate as [triplink-route-persistence.md](triplink-route-persistence.md) and [../plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md).

## Migration

Existing localStorage TripLinks have full contact objects embedded. When the account model lands:

- First sign-in flow imports contacts from the user's most recent TripLink (if any) into their account, to avoid a cold-start empty state.
- Historical TripLinks keep their embedded contacts (snapshot of who *was* notified at that time — useful for audit).

## Relationship to other backlog

- Pairs naturally with [../plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md): the account's contact list doubles as the "who can I invite on a trip" pool (with a `is_favourite` flag separating the emergency circle from casual invitees).
- Enables the **notification transports** work (SES/Resend + Twilio) to have a single source of truth for recipients.
