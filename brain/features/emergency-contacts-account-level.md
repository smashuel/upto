---
type: feature
status: shipped
related: [src/components/forms/AdventureContactsStep.tsx, src/pages/Profile.tsx, src/config/api.ts, backend-server.js]
tags: [wizard, auth, emergency, contacts, safety]
---

# Emergency Contacts — Account-Level, Not Per-Trip

Emergency contacts now live on the user's account. Every new trip auto-inherits them; the wizard confirms "who will be notified" with per-trip opt-out toggles instead of re-asking.

## Shipped (Phase 2 of [plans/persistence-and-auth.md](../plans/persistence-and-auth.md), 2026-05-04)

- **Schema**: `is_emergency BOOLEAN DEFAULT FALSE` added to `contacts` via idempotent `ALTER TABLE` in [backend-server.js](../../backend-server.js) `initDB()`. GET returns it. POST/PATCH accept both `is_emergency` (snake_case, what the frontend sends) and `isEmergency` (camelCase, legacy).
- **Profile** ([Profile.tsx](../../src/pages/Profile.tsx)): Shield-icon toggle on each contact row + a small explainer line ("N in your emergency circle — auto-included on every new trip"). The Add-contact form has paired emergency / favourite checkboxes.
- **Wizard step** ([AdventureContactsStep.tsx](../../src/components/forms/AdventureContactsStep.tsx)) is now structured as:
  1. **Your emergency circle** — auto-populated from the account on first mount with per-trip include checkboxes, a "Primary" star toggle, and a `↗ Edit on Profile` link.
  2. **For this trip only** — ad-hoc contacts added during this wizard run (one-off hut warden, etc.).
  3. **Collapsible `<details>`** to add from any other (non-emergency) saved contact.
  4. Manual add form, with optional "save to my contacts for next time".
- **Auto-populate guard**: `useRef` ensures we populate the form *once* when the page mounts with an empty `emergencyContacts` form field and a non-empty emergency circle. User-driven removals don't re-trigger.
- **TripLink schema unchanged**: the wizard still embeds `emergencyContacts: Contact[]` snapshot at save-time. This preserves the audit trail (who *was* notified at this moment) and means existing TripLinks + the watcher view keep working without migration.

## Pre-existing bug fixed alongside

The contacts API was destructuring `isFavourite` (camelCase) from the request body while the frontend sent `is_favourite` (snake_case), so the favourite toggle had never actually persisted via the API — the UI was faking it optimistically. Backend now reads both casings. Favourites work properly for the first time.

## Guest / not-logged-in users

The step shows a sign-in nudge ("Sign in to use your saved emergency circle") plus the manual-add form. Guests can still add per-trip contacts; they just don't get the auto-include behaviour.

## Out of scope (intentional)

- **Per-contact notification channels** (email / SMS / both) — the data model exists but Phase 3 (email transport) is the right time to surface that UI.
- **TripLink `data` JSONB referencing contact IDs by ref** — the snapshot-on-save model is the chosen design. Audit trail > update-in-place. Means a later edit on Profile doesn't retroactively change historical TripLinks (which is correct for safety logs).

## Relationship to other backlog

- Pairs naturally with [../plans/social-triplink-sharing.md](../plans/social-triplink-sharing.md): the same account contact list will gain `is_squad` / `is_home_base` flags when that work picks up — same row, more roles.
- Unblocks Phase 3 (email transport) — the overdue checker now has a clear "who do we email" target via the snapshot embedded on each TripLink.
