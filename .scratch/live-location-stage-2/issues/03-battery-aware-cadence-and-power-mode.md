# Slice 3 — Battery-aware cadence + profile power-mode

Status: ready-for-agent
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
Covers user stories: 6, 7, 8, 9, 23

## What to build

Replace Stage 1's two hardcoded sampling constants with a single pure policy function that
decides how often and how precisely the device samples, given trip status, foreground/background
state, battery level/charging, and the traveller's chosen power mode. This is where the
"battery-aware sampling lands in Stage 2" promise (roadmap) is delivered and tuned.

Confirmed context + result shape (from the PRD design; refine names in implementation):

```
resolveSampleCadence(ctx: {
  status: 'active' | 'overdue' | other;      // sample only while active | overdue
  liveSharing: 'with-trip' | 'owner-only' | 'off';
  appState: 'foreground' | 'background';
  batteryLevel: number | null;               // 0..1, null when unknown → treat conservatively
  isCharging: boolean;
  powerMode: 'adaptive' | 'battery-saver';   // from user profile, default 'adaptive'
}): { intervalMs: number; distanceFilterM: number; enableHighAccuracy: boolean } | null
```

Returns `null` when the device should not sample at all — folding in Stage 1's status/`off`
gate. Otherwise it **widens the interval / lowers accuracy** when backgrounded, in
battery-saver mode, or on low/unknown battery, and **tightens** when foreground and/or charging.
The background source (Slice 2) consumes this cadence rather than a fixed timer. All thresholds
are named, tunable constants; the coarse Stage 1 band is a starting floor, not a ceiling —
never sample faster just because native allows it.

Add a new user-profile setting `powerMode: 'adaptive' | 'battery-saver'`, default `adaptive`
(absent/legacy → adaptive), persisted on the user record and exposed as a toggle on the Profile
page, read into the cadence context.

## Acceptance criteria

- [ ] `resolveSampleCadence(ctx)` is a pure function, unit-tested under `node --test`
      (prior art `shouldBroadcastPosition` / `describeLiveness`): status not active/overdue → `null`;
      `off` → `null`; foreground+adaptive+charging → tightest cadence; background widens vs
      foreground; battery-saver widens further than adaptive at the same inputs; low battery
      widens vs high; `overdue` still samples; unknown battery treated conservatively; monotonic
      sanity (background/battery-saver interval ≥ foreground/adaptive for the same trip).
- [ ] The two hardcoded Stage 1 constants are removed; the native + web sources both derive
      cadence from `resolveSampleCadence`.
- [ ] `powerMode` is added to the user profile (default `adaptive`), persisted, and toggleable
      on the Profile page.
- [ ] Verified on-device: battery-saver noticeably widens sampling vs adaptive over a real
      session; charging tightens it.

## Blocked by

- Slice 2 (02-native-background-location) — cadence bites where backgrounding does; the
  background source is its primary consumer.
