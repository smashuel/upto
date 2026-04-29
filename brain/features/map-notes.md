---
type: feature
status: in-progress
related: [src/services/NoteManager.ts, src/components/map/NoteModal.tsx]
tags: [map, notes, annotation]
---

# Map Notes

User-authored annotations pinned to a map location — "camp here", "rockfall hazard", "great view".

## Types + icons

`NOTE_ICONS` in `NoteManager.ts` maps:

| Type | Icon |
|------|------|
| `info` | info circle |
| `warning` | triangle |
| `accommodation` | bed |
| `photo` | camera |

## Input UX

**Currently broken on mobile**: `NoteManager.requestNoteContent()` still falls back to `window.prompt()` three times (title, content, type). This is the primary gap closed on this feature.

**Planned**: `NoteModal.tsx` (already scaffolded as `src/components/map/NoteModal.tsx`) — Bootstrap modal with:
- Title input
- Content textarea
- Type radio group (icons matching `NOTE_ICONS`)

Wiring: `NoteManager` gets a `onRequestNote` callback, parent component supplies it from state (opens `NoteModal`), callback resolves to `{ title, content, type } | null`.

## Known gaps

- `window.prompt()` fallback still live on `main`
- No edit-after-place UX — user has to delete and re-create
- Notes aren't yet included in the GPX export
