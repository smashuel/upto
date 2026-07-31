# 07 — Simplify the map control set: unclear and redundant buttons

Status: done (2026-07-31) — reduced set accepted on device
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

- [x] Every remaining map control's purpose is evident without hovering (label, or an icon
      whose meaning is unambiguous in context).
- [x] No two controls do substantially the same thing.
- [x] Saved TripLinks containing waypoints and notes still display them correctly, even if the
      authoring control for them is removed.
- [x] The reduced set is comfortable to reach one-handed in fullscreen on a phone.

## Blocked by

- Needs a product decision from the user on which controls survive. Sequence after issue 06
  (notes crash), since that affects whether Note mode is kept at all.

## Resolved — 2026-07-31

The reduced control set is accepted on device. Removed **Waypoint**, **My location** and
**Reset view**; **Edit route** is hidden on touch (see issue 08). What survives is Layers,
Route draw, Note, and fullscreen — each with a distinct job.

Nothing that renders was removed, only authoring controls: saved TripLinks holding waypoints
still display them, which was the criterion that mattered. The "wider rethink" this issue
opened with is closed as answered — the smaller set is comfortable one-handed and no two
controls overlap.
