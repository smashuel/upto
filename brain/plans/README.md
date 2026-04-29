---
type: index
---

# Plans

Phased implementation plans — multi-step work that doesn't fit in a single feature file.

## Active

- [map-ux-overhaul.md](map-ux-overhaul.md) — Phases 1–5 of the Cesium map polish (all shipped)

## How to use this folder

- One file per plan
- `status: planned | in-progress | shipped | archived`
- When a phase ships, update its checkbox/table row; don't archive the whole plan until all phases are done
- Plans that get superseded → move to `archived` (keep the file for history) and link the replacement
- Link back to affected files in `related:` frontmatter so Grep finds them
