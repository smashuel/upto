---
type: index
---

# Upto Brain

The persistent memory + second brain for the Upto project. Edit freely in Obsidian — Claude Code reads and writes these files directly (no MCP needed; the Obsidian vault IS this repo).

## Map

| Folder | What lives here |
|--------|-----------------|
| [project/](project/) | Vision, roadmap, status, deployment — the always-true overview |
| [features/](features/) | One file per feature, including status and files touched |
| [plans/](plans/) | Phased implementation plans (map UX, database migration, auth, …) |
| [research/](research/) | Competitor audits, UX research, spikes, experimental notes |
| [decisions/](decisions/) | Architectural Decision Records (ADRs) — *why* we chose X over Y |
| [agents/](agents/) | Registry of skills and agents, with guidance on when to use each |
| [journal/](journal/) | Dated notes for in-progress threads — temporary scratch, cleaned out regularly |

## Frontmatter convention

Every note should open with YAML frontmatter:

```yaml
---
type: feature | plan | decision | research | agent | project | journal
status: shipped | in-progress | planned | archived | draft
related: [path/to/source.ts, brain/other-note.md]
tags: [map, safety, emergency, …]
---
```

This lets Claude filter by Grep and Obsidian group by the Dataview plugin.

## Status values

- **shipped** — feature is in `main` and working
- **in-progress** — actively being built; see `related` for the PR/branch
- **planned** — scoped but not started
- **draft** — rough thoughts, not yet scoped
- **archived** — superseded or abandoned (kept for history)

## How Claude uses this

**Before acting** on non-trivial work:
1. Read [project/status.md](project/status.md) for current focus + recent shipped
2. Read the relevant file in [features/](features/) or [plans/](plans/)
3. If debugging, grep [journal/](journal/) for prior notes on the symptom

**After acting**, update the brain in the same session:
- Feature shipped → tick [roadmap.md](project/roadmap.md), bump feature `status`, update [status.md](project/status.md)
- Non-trivial bug fix → dated journal entry with symptom + root cause + fix. Promote invariants to [decisions/](decisions/)
- Architecture choice → numbered ADR in [decisions/](decisions/) (Context / Decision / Alternatives / Consequences / Reconsider-if)
- New multi-phase work → new plan file under [plans/](plans/)
- Noticed stale feature doc while working → fix it in the same PR

End turns with an explicit "Brain: updated X / nothing to update" so nothing gets dropped silently.

## How you use this

- Add `status: planned` features under [features/](features/) before asking Claude to implement — gives both of you a spec to align on.
- Drop design inspiration / competitor screenshots into [research/](research/).
- Review [project/roadmap.md](project/roadmap.md) periodically to keep priorities honest.
- Clear [journal/](journal/) entries once the work ships (move the "why" into [decisions/](decisions/) if it matters).

## What stays OUTSIDE brain/

- **CLAUDE.md** (project root) — the file Claude always loads; it indexes this brain.
- **Source code, tests, configs** — the code is authoritative; the brain describes the *why* and *what-next*.
