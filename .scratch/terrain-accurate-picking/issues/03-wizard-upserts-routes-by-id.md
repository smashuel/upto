# 03 — Wizard upserts routes by id

Status: done

## Parent

.scratch/terrain-accurate-picking/PRD.md

## What to build

The wizard's route-created handler currently appends every emitted route to the
form's route array. Committing an edit re-emits the same route (same id), so an
edited trip accumulates duplicate routes in the TripLink's stored data — one stale
copy per edit session, plus the final one.

Change the handler to upsert by route id: if a route with the same id already
exists in form state, replace it; otherwise append. The route array's shape in the
TripLink JSONB is unchanged — no schema or backend work. The "first waypoint seeds
the primary location" side effect should keep firing only when no primary location
is set, exactly as today.

## Acceptance criteria

- [ ] Drawing a route, entering edit mode, dragging a point, and committing the edit results in exactly one route in the saved TripLink data
- [ ] Repeated edit sessions on the same route still yield exactly one stored route, reflecting the latest geometry and stats
- [ ] Drawing a second, distinct route appends — both routes are stored
- [ ] Unit coverage for the upsert behaviour (same id replaces, new id appends)
- [ ] Manual verify: create a trip with a drawn-then-edited route; the review step and saved TripLink show one route, not duplicates
- [ ] `tsc --noEmit` and `npm run lint` stay green

## Blocked by

None - can start immediately.

## Comments

**2026-07-03 (agent):** Implemented alongside issue 06 (same wizard callback).
Pure helper `upsertRouteById` in [src/services/routeUpsert.ts](../../../src/services/routeUpsert.ts)
(same id replaces in place, new id appends, input not mutated), wired into
`AdventureLocationStep`'s `onRouteCreated`; the primary-location seeding still
fires only when unset. 4 unit tests green; tsc + lint green. **Outstanding:** the
"Manual verify" checkbox — draw-then-edit a route in the browser and confirm the
review step and saved TripLink hold one route.
