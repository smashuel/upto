# 10 — Sampling cadence feels too slow at ~3 minutes

Status: needs-decision — a battery trade, not a bug
Priority: medium
Surfaced: Slice 02 device matrix test 4, 2026-08-03 — *"Longest gap observed: 3 minutes (i think we should lower this)"*
Area: `LIVE_SAMPLE_INTERVAL_MS` in `src/pages/ActiveTrip.tsx`; `src/utils/sampleCadence.ts` (Slice 3)

## What happens

Nothing is broken. Background tracking held for the full 20-minute locked-in-pocket test with a
steady ~3-minute cadence — that is the Stage 1 contract working as designed. The request is that
3 minutes feels too coarse to watch.

## The trade, stated plainly

The ~3-minute floor is a deliberate battery invariant from Stage 1
([plans/live-location.md](../../../brain/plans/live-location.md)), not an arbitrary default. The
scenario it protects is the one the app exists for: a multi-day trip where the phone must still
have charge when something goes wrong. A tracker that gives beautiful minute-by-minute updates
and a dead battery at hour 30 has failed at the only moment that counted.

Two things make this less of a straight trade than it looks:

- **The radio is already on.** A watcher is registered for the whole trip either way, so a large
  part of the cost is already being paid. Increasing the *reporting* rate is not proportional to
  battery cost — which means a modest reduction may be nearly free, and needs measuring rather
  than arguing about.
- **Different phases want different cadences.** Walking a ridge in bad weather is not the same as
  sitting in a hut overnight. That is exactly what Slice 3's already-built and already-tested
  `resolveSampleCadence` exists to express.

## What to build

This is **Slice 3's seam, already TDD'd and waiting** — `resolveSampleCadence` is done; what is
missing is the consumer and the power-mode UI. The right move is to bring that forward rather
than hardcode a smaller constant here, because a constant just relocates the argument.

Suggested shape for the decision:
- A traveller-facing choice with honest labels (something like Endurance / Balanced / Detailed)
  that states the battery consequence rather than hiding it.
- Tighter cadence while `overdue` regardless of mode — the period watchers most need it.

Before choosing numbers, get the measurement this run did not capture: battery at trip start was
recorded (28% at 08:23) but no end reading, so the current drain is unknown.

## Acceptance criteria

- [ ] A real battery figure for the current ~3-minute cadence over a multi-hour trip.
- [ ] The cadence is chosen by `resolveSampleCadence`, not a hardcoded constant in ActiveTrip.
- [ ] Any faster mode states its battery cost to the traveller before they pick it.
- [ ] The default remains conservative — a fresh install must not quietly become a battery drain.

## Blocked by

- Needs the battery measurement, and a product call on the modes. Related:
  [issue 07](07-stationary-traveller-produces-no-fixes.md) pushes the same dial the other way.
