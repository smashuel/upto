# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

This is a **single-context** repo: one React/Vite frontend + one Express backend
(`backend-server.js`), not a monorepo. There is one glossary and one ADR home.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary (ubiquitous language).
- **`brain/decisions/`** — the ADRs. **This repo keeps ADRs in `brain/decisions/`, not
  `docs/adr/`.** Read the ADRs that touch the area you're about to work in.
- For broader project orientation, also see `brain/project/status.md` (always-true
  snapshot), `brain/project/roadmap.md`, and the relevant `brain/features/*.md`.

If `CONTEXT.md` doesn't exist yet, **proceed silently**. Don't flag its absence; don't
suggest creating it upfront. The `/domain-modeling` skill (reached via
`/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms
actually get resolved.

## ADR home: `brain/decisions/`

ADRs live in `brain/decisions/`, sequentially numbered with a **3-digit** prefix
(`008-au-tiles-no-backend-proxy.md`, `009-native-auth-capability-share-tokens.md`).
When `/domain-modeling` decides an ADR is warranted, write it there with the **next
number in sequence** — do **not** create a `docs/adr/` folder. This keeps the brain
the single source of truth and avoids a second, competing ADR home.

Use the ADR format from `.claude/skills/domain-modeling/ADR-FORMAT.md`.

## File structure

```
/
├── CONTEXT.md                ← domain glossary (repo root)
├── brain/
│   └── decisions/            ← ADRs live here (008-…, 009-…)
├── docs/agents/              ← this skills-config (issue tracker, labels, domain)
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to
synonyms the glossary explicitly avoids. Note that `Adventure` is a legacy alias for
`TripLink` — prefer `TripLink` in new code and writing.

If the concept you need isn't in the glossary yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap (note it
for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-009 (native-auth capability share tokens) — but worth reopening because…_
