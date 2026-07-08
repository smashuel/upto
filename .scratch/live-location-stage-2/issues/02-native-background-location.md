# Slice 2 — Native background location (survives lock / background / kill)

Status: ready-for-agent
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
Covers user stories: 1, 2, 3, 4, 5, 13, 14, 18, 17 (regression)

## What to build

Back the `native-background` `PositionSource` (from Slice 1) with a Capacitor
background-geolocation plugin so the traveller's position keeps streaming **while the app is
backgrounded or the screen is locked** — the situation of a real active trip with the phone in
a pocket. Fixes flow into the same unchanged Stage 1 pipeline; this slice changes only *how
fixes are produced*.

**This is the ADR-011 make-or-break wall.** iOS "always" background reliability is the risk;
if the chosen plugin can't hold it, ADR 011's reconsider-clause (native module / React Native)
is live. Choosing the specific plugin is part of this slice.

Permission is requested **contextually with a rationale** (extending Stage 1's
never-cold-on-load principle): "always allow" when the trip goes active with sharing on.
"While using the app" degrades **honestly** to foreground-only tracking with a clear notice —
same honest-degradation contract, not a silent failure. Tracking must resume automatically if
the OS kills and relaunches the app mid-trip, and must keep running while the trip is
`overdue` (the period watchers most need it), not just `active`.

Privacy parity is strict: `off` must genuinely **stop the native sampler** (collect nothing),
not merely not-publish; `owner-only` renders locally and never POSTs; `with-trip` POSTs. The
server guard (`shouldBroadcastPosition` against stored `liveSharing`) is unchanged and remains
the backstop. Respect the platform's own persistent background-location indicator so the
traveller is never unknowingly broadcasting.

## Acceptance criteria

- [ ] A Capacitor background-geolocation plugin is chosen and wired behind the
      `native-background` source; the choice + iOS-"always" rationale is recorded (candidate ADR
      note).
- [ ] Position keeps updating with the app backgrounded and the screen locked, verified on a
      real iOS device (and Android).
- [ ] Tracking resumes automatically after an OS-kill relaunch mid-trip.
- [ ] "Always allow" is requested contextually with a rationale; "while using" degrades to
      foreground-only with an explicit notice; denial is reflected in the ActiveTrip chip (Stage
      1 contract).
- [ ] `off` stops the native sampler entirely (nothing collected); `owner-only` never POSTs;
      `with-trip` POSTs — verified in the native shell.
- [ ] Tracking continues while the trip is `overdue`, not only `active`.
- [ ] Watcher-side liveness labels (fresh / stale / unavailable) behave exactly as Stage 1 —
      background tracking just makes `fresh` more common (regression check, no new rules).
- [ ] On-device test matrix executed and recorded: {iOS, Android} × {foreground, backgrounded,
      locked, killed-then-relaunched}. A green unit suite is necessary but **not** the acceptance
      gate for this slice — the matrix is.

## Blocked by

- Slice 1 (01-capacitor-shell-and-source-seam) — needs the shell and the `PositionSource` seam.
