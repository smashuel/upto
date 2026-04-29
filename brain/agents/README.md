---
type: index
tags: [agents, skills]
---

# Agents & Skills

Registry of Claude Code skills and (future) agents configured for this project. Each skill lives under `.claude/skills/<name>/SKILL.md`.

## Skills (invoked via `/skill-name`)

| Skill | When to use | Source |
|-------|-------------|--------|
| `/build-check` | After edits — runs `tsc --noEmit` + `npm run lint`, then fixes the errors | `.claude/skills/build-check/SKILL.md` |
| `/check-backend` | Diagnose Linode health — health endpoint, PM2 status, Nginx, logs, disk/memory | `.claude/skills/check-backend/SKILL.md` |
| `/deploy` | Deploy backend to Linode — pre-flight (TS, SSH, git), then `deploy.sh` | `.claude/skills/deploy/SKILL.md` |
| `/review-map` | Read-only audit of Cesium stack — init, imagery, terrain, lifecycle, managers | `.claude/skills/review-map/SKILL.md` |
| `/map-ux` | Implement next-step map UX work from [plans/map-ux-overhaul.md](../plans/map-ux-overhaul.md) | `.claude/skills/map-ux/` |

## How Claude picks one

- User says "deploy" → `/deploy`
- Anything red-text from TypeScript or lint → `/build-check` before claiming done
- Map behaviour weird → `/review-map` first (read-only audit), then targeted fix
- Backend 502s or Vercel shows "API down" → `/check-backend`
- Working through the map UX plan → `/map-ux`

## Writing a new skill

1. Create `.claude/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`, `when_to_use`)
2. Register it here
3. If the skill modifies settings/hooks, include the settings.json fragment in its SKILL.md

## Agents (TODO)

No project-specific agents configured yet. Candidate ideas:
- `triplink-reviewer` — reviews a submitted TripLink for safety gaps (missing w3w, no emergency exit, ambitious time estimate)
- `doc-sync-watcher` — checks cache freshness weekly, alerts if sync fails
- `trail-ingester` — batch-adds TrailForks/Hiking Project integrations when credentials land
