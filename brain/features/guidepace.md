---
type: feature
status: in-progress
related: [src/utils/TimeCalculator.ts, src/components/guidepace/, src/utils/RouteAnalyzer.ts]
tags: [guidepace, time-estimation, safety]
---

# GuidePace Time Estimation

Professional-grade time estimation for trip planning using industry-standard formulas — Munter Method (Swiss/IFMGA), Chauvin System, and a Technical System for climbing/skiing pitches. Designed to give guides (and competent recreationalists) a defensible time estimate.

## Formulas (all in `TimeCalculator.ts`)

### Munter Method
`time = (distance_km + ascent_km * 10) / rate`

Where `rate` varies by terrain/fitness/load: typical `4` for flat hiking, `3` for rough terrain, `6` descending.

### Chauvin System
More granular — separate rates for distance, ascent, and descent, each tuned by party fitness and pack weight.

### Technical System
For climbing/skiing: pitch count × average pitch time, plus approach/descent using Munter.

## Pace factors (UI — `PaceFactorControls.tsx`)

Sliders / selects for:
- Terrain difficulty
- Party fitness (1–5)
- Pack weight (kg)
- Weather severity
- Technical difficulty multiplier (for climbing)

Factors feed into all three formulas via a shared `PaceFactors` type.

## Route analysis (`RouteAnalyzer.ts`)

Segments a route by terrain change (detected from elevation gradient + terrain classification) so different segments get different rates. Returns:
- Segment list (distance, ascent, descent, terrain type)
- Hazards (steep descents, exposed ridges detected from slope thresholds)

## UI components (exist, not yet wired)

| Component | Role |
|-----------|------|
| `GuidePaceEstimator.tsx` | Top-level — runs all three calculators, shows comparison |
| `PaceFactorControls.tsx` | Pace-factor inputs |
| `RouteBreakdown.tsx` | Per-segment time + cumulative chart |
| `TimeEstimateSummary.tsx` | Final number + confidence range |

## The gap

**The calculator logic works. The UI components exist. Neither is called from the wizard.**

To wire up:
1. In `TripDetailsStep.tsx`, mount `GuidePaceEstimator` below the description field
2. Pass the drawn route (from `TrackDrawer.getLatestTrackPositions()` + elevation profile) as input
3. Persist the chosen estimate (which system + factors + final time) on the TripLink
4. Surface in `AdventurePreview` and public share view

See [project/roadmap.md](../project/roadmap.md) "Wizard polish" for status.

## Reference

Original design doc: formerly `markdown/GUIDEPACE_FEATURE.md` — content consolidated here during the brain migration.
