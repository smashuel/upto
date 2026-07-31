# 07 — Simplify the map control set: unclear and redundant buttons

Status: partly done (2026-07-31) — flagged controls removed; wider rethink still open
Surfaced: on-device (iPhone), 2026-07-31
Area: TripPlanningMap.tsx (overlay control clusters)

## What to build

The map currently shows four clusters of icon-only buttons. On a phone, in fullscreen, several
are unclear or redundant. User feedback, verbatim in intent:

| Control | Where | Current behaviour | Feedback |
|---------|-------|-------------------|----------|
| Eye | top-left | "View" mode — the non-drawing default | "what does the eye do?" — reads as a visibility toggle, not a mode |
| Waypoint (pin) | top-left | Click-to-place a standalone waypoint | Redundant — the route drawer already places points |
| Note | top-left | Place a note | Purpose overlaps waypoint; also crashes (issue 06) |
| My location (navigation arrow) | bottom-left | Fly to current position | "don't think it's necessary" |
| Reset view | bottom-left | Return to default camera | "don't think it's necessary" |

The underlying problem is that mode buttons (Eye/Waypoint/Route/Note) and action buttons
(location, reset, export, flyover) look identical and sit in unlabelled icon stacks, so the
mode model isn't discoverable.

Decide and implement a reduced set. Options to weigh, not a prescription:
- Drop the standalone Waypoint mode if the route drawer covers the need; keep waypoints as an
  output of route drawing.
- Make the mode cluster a labelled segmented control (View / Draw / Note) so "Eye" isn't a
  mystery icon.
- Move My location + Reset view behind a single overflow control, or drop Reset view.

Removals must not orphan data: existing TripLinks with standalone waypoints/notes must still
render them.

## Acceptance criteria

- [ ] Every remaining map control's purpose is evident without hovering (label, or an icon
      whose meaning is unambiguous in context).
- [ ] No two controls do substantially the same thing.
- [ ] Saved TripLinks containing waypoints and notes still display them correctly, even if the
      authoring control for them is removed.
- [ ] The reduced set is comfortable to reach one-handed in fullscreen on a phone.

## Blocked by

- Needs a product decision from the user on which controls survive. Sequence after issue 06
  (notes crash), since that affects whether Note mode is kept at all.
