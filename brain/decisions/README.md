---
type: index
---

# Decisions (ADRs)

Architectural Decision Records. One file per decision — what we chose, why, what we rejected, what would make us reconsider.

## Format

```markdown
---
type: decision
status: accepted | proposed | superseded
related: [files or other decisions]
tags: [...]
---

# NNN — Short title

## Context
What forced the decision?

## Decision
What did we choose?

## Alternatives considered
What did we reject, and why?

## Consequences
What becomes easier / harder? What's now locked in?

## Reconsider if
Future trigger that should make us revisit.
```

Number ADRs sequentially: `001-cesium-via-cdn.md`, `002-triplink-localstorage.md`, etc.

## Candidate ADRs to backfill

Existing non-obvious choices that deserve a record:
- **001 — Cesium loaded via CDN not npm** (disk-space optimisation; tradeoff: `any` types everywhere)
- **002 — TripLink localStorage persistence** (temporary — blocker for auth/sharing/check-ins)
- **003 — DOC alerts never cached** (safety-critical invariant; do not add a cache layer)
- **004 — LINZ key kept server-side** (proxy tile endpoint; frontend fallback for dev only)
- **005 — Cesium `scene3DOnly: false`** (required for `morphTo2D` to work; otherwise morph silently fails)
- **006 — What3words shown alongside coordinates, never alone** (SAR-compatibility invariant)
- **007 — `/api/*` proxied via `vercel.json` rewrite, not serverless function** (replaced the serverless approach — see commits `b82fbba`/`6e0ee9e`/`d99ca5c`)
