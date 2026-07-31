# 10 — Map notes are never persisted to the TripLink

Status: done (2026-07-31) — notes persist on the TripLink; shipped at 6fcdc50
Surfaced: while fixing issue 06, 2026-07-31
Area: TripPlanningMap.tsx, AdventureLocationStep.tsx, src/types/adventure.ts

## What to build

Notes placed on the map are purely ephemeral. `TripPlanningMap` accepts an `onNoteAdded`
callback, but **no caller ever passes one**, and `TripLink` has no field to hold notes. A note
therefore lives only in `NoteManager`'s in-memory array: it disappears on reload, is not saved
with the trip, and is never seen by anyone the TripLink is shared with.

This was found while fixing the notes crash (issue 06) — the crash was the visible symptom, but
even once notes stop crashing they still don't survive the session.

Decide whether notes are a real TripLink concept before building this. If they are, they need a
field on the type, wiring through the wizard's form state, persistence in the JSONB `data`, and
rendering on the view pages (`PublicAdventureView`, `ActiveTrip`) — a note marking a hazard or a
bail-out point is exactly the sort of thing a watcher should see, which makes this
safety-relevant rather than cosmetic.

Sequence after issue 07, which asks the broader question of whether notes and waypoints should
both exist at all.

## Acceptance criteria

- [ ] Decision recorded: are map notes part of a TripLink, or a planning-only scratch layer?
- [ ] If persisted: notes survive reload, save with the trip, and render on the shared view.
- [ ] If not persisted: the UI makes their throwaway nature obvious, so nobody records a hazard
      expecting their contacts to see it.

## Blocked by

- Issue 07 (map control set) — decides whether notes survive as a feature.

## Decided and shipped — 2026-07-31, at 6fcdc50

**Notes are part of the TripLink.** The user's framing settles it: "when you send the trip
link out, the receiver can click on the note. It will say 'car park, aiming to leave around
8am'." A note is trip information for the recipient, not planning scratch.

`TripNote` on the TripLink, carried in the JSONB `data` (no backend change — the whole
TripLink is stored wholesale). `NoteManager.getSerializableNotes`/`loadNotes` handle the
round-trip; `TripPlanningMap` takes `initialNotes`; ActiveTrip and PublicAdventureView pass
them. Tapping a pin opens Cesium's info box: title as the entity `name` (the header), type,
body and coordinates as the description.
