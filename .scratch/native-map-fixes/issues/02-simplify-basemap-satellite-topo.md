# 02 — Collapse basemap to just "Satellite" + "Topo" (auto-region topo)

Status: done (2026-07-31)
Surfaced: on-device feedback, 2026-07-31
Area: src/services/BasemapSuggest.ts (pure resolver + tests), TripPlanningMap.tsx (layers panel)

## What to build

The layers panel currently exposes four basemaps grouped by country — **New Zealand**
(Satellite / LINZ Topo) and **Australia** (GA National / NSW Topo). The user doesn't want to
pick a country or a specific topo product. Collapse to **two** choices: **Satellite** and
**Topo**. "Topo" is region-agnostic — it auto-resolves to the correct regional topo from the
map viewport (LINZ in NZ, GA/NSW in Australia), switching automatically as the map crosses
regions. The region detection already exists in `BasemapSuggest` (`suggestBasemap`).

This changes the basemap override model from four concrete topo layers to a small set:
`satellite | topo | auto` (where `topo` = "region-appropriate topo, follow the viewport").
Keep the pure resolver the single source of truth and update its tests. The user-facing panel
becomes two buttons; the internal per-region resolution stays but is no longer user-selectable.

## Acceptance criteria

- [ ] The layers panel shows exactly two basemap options: **Satellite** and **Topo** (no
      NZ/AU groupings, no GA/NSW/LINZ product names as separate buttons).
- [ ] With **Topo** selected, the map shows LINZ topo in NZ and GA/NSW topo in Australia
      automatically, and switches as the viewport crosses between regions.
- [ ] With **Satellite** selected, satellite shows everywhere.
- [ ] `BasemapSuggest`'s resolver is updated to the `satellite | topo | auto` model and its
      unit tests are updated + green.
- [ ] Persisted `plannedBasemap` values `topo-linz` / `topo-ga` / `topo-nsw` migrate to `topo`
      on read (back-compat); `satellite` unchanged.
- [ ] Attribution still reflects the *actual* rendered topo source (© LINZ vs GA vs NSW).

## Blocked by

- None. Touches the same `BasemapSuggest` / layers-panel code as issue 01 — sequence after 01
  if both are in flight, to avoid churn.
