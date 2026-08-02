# 020 — 30-second sampling cadence (down from 3 minutes)

Date: 2026-08-03
Status: Accepted — **provisional until the battery cost is measured**

## Context

Stage 1 fixed the live-location sampling floor at ~3 minutes and treated it as a battery
invariant (grilled 2026-07-05, carried into `resolveSampleCadence` as `FG_FLOOR_MS`). The
reasoning was that a multi-day trip must not flatten the phone: a tracker that dies at hour 30
has failed at the only moment that counted.

The Slice 2 device matrix (2026-08-03) ran that cadence on a real iPhone. Background tracking
**held** — 20 minutes locked in a pocket, steady ~3-minute updates. The verdict on the number
itself was different: *"Longest gap observed: 3 minutes (i think we should lower this)."*

There is a safety argument behind that preference, not just impatience. A 3-minute-old position
for someone walking is a ~250 m uncertainty circle, and for someone on a bike or in a vehicle
it is far larger. Watchers also read cadence as evidence of life — a marker that moves is
reassurance a marker that sits still cannot give.

## Decision

**`FG_FLOOR_MS` becomes 30 seconds.** `BG_BASE_MS` moves from 6 minutes to 60 seconds, keeping
the 2× background-is-wider ratio.

The *invariant* is unchanged and still enforced: nothing in `resolveSampleCadence` samples faster
than the floor, whatever the inputs say. What moved is the floor's **value**.

This is accepted **provisionally**. The battery cost was not measured before the change, so
[batteryUsage.ts](../../src/utils/batteryUsage.ts) was added in the same commit to measure it on
the next trip — a per-trip readout on the ActiveTrip screen showing percent used and a projected
%/h. It refuses to project from a sample under 20 minutes, because a rate extrapolated from four
minutes of walking is noise that will get quoted in the next decision.

Paired with this, `distanceFilter` drops from 10 m to 0 (issue 07): a distance filter and a time
cadence are different axes, and applying both meant a stationary traveller produced no fixes at
all. The time throttle now solely sets the pace.

## Alternatives considered

- **Keep 3 minutes.** Rejected by the person who ran the matrix, on the grounds above. Worth
  recording that the *reliability* case for 3 minutes was never the issue — it worked.
- **Wire the full Slice 3 power-mode policy first** (adaptive / battery-saver, chosen by the
  traveller). The right end state, and `resolveSampleCadence` already exists and is tested. But
  it needs a UI, persistence, and battery/foreground inputs, and choosing sensible mode values
  still requires the measurement this change is designed to produce. Sequenced after, not before.
- **Tighten only while `overdue`.** Attractive — it targets the period watchers most need — but
  it optimises the wrong half: most of the risk window is the trip going wrong *before* anyone
  knows it is overdue.

## Consequences

- **The web changed too.** `ActiveTrip` derives its interval from `FG_FLOOR_MS`, so browser
  sessions now sample every 30 s as well. Consistent with the product promise, and comfortably
  inside the position endpoint's rate limit (30 req/min per token — 30 s is 2/min, 15× headroom),
  but it is a 6× increase in position POSTs per active trip. Watch server load if usage grows.
- **`LIVE_STALE_MS` is now loose relative to the cadence.** At 10 minutes, a watcher tolerates 20
  missed samples before anything is said. Deliberately left alone: brief dropouts in valleys and
  tunnels are normal in the backcountry, and a threshold that flaps between "live" and "paused"
  would be worse than one that is slow. Revisit with the same battery data.
- **Battery is now visible to the traveller**, which is itself a small honesty win — the cost of
  tracking them is not hidden.
- The floor is pinned by a test that names this ADR, so changing it again requires changing a
  test that says out loud that it is a safety-vs-battery decision.

## Reconsider if

The measured drain makes a full-day trip unsafe. The rough bar: an all-day walk (say 10 hours)
must not need more than about half a charge on a healthy phone, because the traveller has to
have battery left for the emergency the app exists for.

If it fails that bar, the answer is **not** simply reverting to 3 minutes — it is finishing
Slice 3, so the traveller chooses the trade knowingly (Endurance / Balanced / Detailed) with the
consequence stated, and the app widens automatically on low battery. `resolveSampleCadence`
already implements that policy; only its consumer is missing.
