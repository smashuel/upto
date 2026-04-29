---
type: feature
status: planned
related: [src/components/forms/AdventureLocationStep.tsx, src/components/what3words/LocationDisplay.tsx]
tags: [wizard, ux, cleanup, what3words]
---

# Location Step — Under-Map Tidy

Backlog polish card. Not a behaviour change — just reducing visual weight under the Route & Map section of the wizard.

## Problem

Under the Cesium map in [AdventureLocationStep.tsx](../../src/components/forms/AdventureLocationStep.tsx), the UI currently stacks:

- A `LocationDisplay` card for **Primary location**
- A `LocationDisplay` card for **Parking**
- A `LocationDisplay` card for **Emergency exit**
- A paragraph-length "**What is what3words?**" explainer block
- Per-field w3w tip list ("Share what3words addresses", "Test pronunciation", etc.)

Three big cards + two chunks of copy push the wizard into a long scroll. The location info is already visible inline on map pins, so the cards feel redundant — and the w3w explainer belongs in onboarding / help, not the per-trip form.

## Proposal

- Collapse the three `LocationDisplay` blocks into a single compact row (or a chip/table) — "Primary · Parking · Exit" with the w3w address + copy button per entry.
- Remove the "What is what3words?" paragraph from the wizard. Move it to the Profile page (or surface as a `(i)` tooltip on first w3w field).
- Remove the inline w3w tip list on this step.
- Keep all underlying fields and form wiring intact — only visual density changes.

## Files

- [src/components/forms/AdventureLocationStep.tsx](../../src/components/forms/AdventureLocationStep.tsx) — primary target
- [src/components/what3words/LocationDisplay.tsx](../../src/components/what3words/LocationDisplay.tsx) — may gain a `variant="compact"` prop

## Blocker

None — no backend or data-model dependency. Safe to pick up any time.
