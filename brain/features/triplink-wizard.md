---
type: feature
status: shipped
related: [src/pages/CreateAdventure.tsx, src/components/forms/]
tags: [wizard, forms, triplink]
---

# TripLink Wizard

Multi-step form at `/create` that walks the user from activity choice to a shareable plan. Core product surface.

## Steps (current)

| # | Step | File | What it captures |
|---|------|------|------------------|
| 1 | Overview | `TripOverviewStep.tsx` (wraps TripTypeSelectionStep + TripTitleStep) | Activity type (hiking/climbing/skiing/cycling), title, dates |
| 2 | Location & Route | `AdventureLocationStep.tsx` | 3D map, waypoints, route drawing, w3w for parking/primary/emergency-exit |
| 3 | Trip Details | `TripDetailsStep.tsx` | Description, (planned) GuidePace time estimation |
| 4 | Emergency Contacts | `AdventureContactsStep.tsx` | Contact list, escalation settings, notification prefs |
| 5 | Review & Share | `AdventurePreview.tsx` + `AdventureShareLink.tsx` | Preview + generate shareable link |

## State + persistence

- Shared form state via `react-hook-form` + `useFormContext`
- On submit → saved to **localStorage** (no backend DB yet — see [roadmap.md](../project/roadmap.md) "Persistence")
- `Adventure` type is the legacy alias; new code uses `TripLink` directly — both defined in `src/types/adventure.ts`

## Lazy-mounted sections

`CreateAdventure.tsx` wraps the heavy steps (Route & Map, Time Estimation, Emergency Contacts) in `ExpandSection` with a `hasOpened` flag — Cesium only loads when the user expands Route & Map. This keeps initial TTI fast.

## Not in the wizard right now

- **AdventureScheduleStep** — component exists but was pulled out; schedule isn't collected
- **GuidePace** — time-estimation components exist (`src/components/guidepace/`) but aren't wired into `TripDetailsStep`

## Known gaps

- No draft recovery (reload loses state)
- No validation story on the Review step (user can submit half-filled plans)
- No way to edit an existing TripLink after creation
