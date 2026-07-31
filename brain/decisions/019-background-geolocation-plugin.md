# 019 — @capacitor-community/background-geolocation for native background location

Date: 2026-08-01
Status: Accepted (provisional — the device matrix can overturn it, and that is the point)

## Context

Live location Stage 2 Slice 2 has to keep producing position fixes while the traveller's phone
is locked in a pocket. [ADR 011](011-capacitor-mobile-shell.md) named this the make-or-break
wall for the Capacitor bet: *"we lost their location when the phone went in their pocket"*
defeats the whole feature, and a safety app that only tracks people who are staring at it is not
a safety app.

The `PositionSource` seam from Slice 1 means the choice is confined to one class. What it is
**not** confined to is reliability: iOS "always" background location is notoriously the hardest
thing to hold, and the failure mode is silence, not an error.

## Decision

Use **`@capacitor-community/background-geolocation` v1.2.26**, behind
`NativeBackgroundPositionSource`.

Configured with:

- **`backgroundMessage` set.** Load-bearing, not cosmetic: without it the plugin only guarantees
  *foreground* updates. Omitting it would silently reduce this slice to what Stage 1 already
  did, and nothing would report the difference.
- **`stale: false`** — never hand a cached fix to a watcher as the traveller's current position.
- **`requestPermissions: true`**, called from `start()`, which only runs when a trip goes live
  with sharing on. The prompt is contextual by construction rather than by discipline.
- **`distanceFilter: 10 m`**, plus a **time throttle** at the Stage-1 cadence in our own code.

The plugin is reached through a small structural interface (`BackgroundWatcherPlugin`) rather
than its own type, so the source can be exercised against a fake off-device and so a plugin swap
has exactly one shape to satisfy.

## Alternatives considered

- **`@transistorsoft/capacitor-background-geolocation`** (paid, gold-standard iOS "always").
  Not rejected — **parked as the reconsider path**, see below. It costs money per app and was
  not worth committing to before the free option had been shown to fail.
- **`@capacitor/geolocation`** (the official plugin). Rejected: `watchPosition` does not survive
  backgrounding on iOS, which is the entire requirement.
- **A hand-written native module / React Native.** Rejected for now — ADR 011 already weighed
  this; it is the far end of the same reconsider path, not a first move.

## Consequences

- **Android needs no `ACCESS_BACKGROUND_LOCATION`.** The plugin uses a foreground service typed
  `location`, which is the sanctioned way to keep tracking while backgrounded, and it never
  references the background-location permission. Declaring it anyway would invite Play Store
  review scrutiny (Google requires written justification and a demo video) for a permission the
  app does not use. The plugin's own manifest merges in what it does need.
- **The traveller can always see tracking is on**: iOS shows the blue status bar, Android a
  persistent notification. We renamed that notification's channel from the default "Background
  Tracking" to "Trip location sharing" — a person must be able to tell *who* is collecting their
  location from the notification alone.
- **Simulated fixes are refused** by `toPositionFix` unless explicitly opted in. A software
  location broadcast to a watcher as real is a falsehood told in the one situation the app
  exists for. The cost is that the iOS Simulator can't exercise the pipeline without the flag.
- **A Capacitor-7 constraint that the CLI rewrites.** The published `Package.swift` pins
  `capacitor-swift-pm` `from: "7.0.0"`, which cannot satisfy our app's `exact: "8.4.1"`.
  `npx cap sync ios` rewrites it in `node_modules` to `from: "8.0.0"`, so it resolves — but only
  if **sync runs before the Xcode build**. The Codemagic pipeline does. Do not build the Xcode
  project directly from a fresh `npm ci` without syncing first; SPM resolution will fail with a
  version conflict that looks unrelated to this.
- **`cap sync` warns** "built for Capacitor 7, it might cause issues". Expected, and a standing
  reminder that this plugin is a version behind.

## Known limits, accepted on purpose

- **"While using" cannot be distinguished from "Always".** The plugin exposes no permission-state
  API — only `NOT_AUTHORIZED` on outright denial. So the PRD's explicit "background tracking is
  limited" notice is **not built**. A while-using traveller degrades through the existing
  liveness machinery instead: fixes stop when they background the app, and their watchers see
  "paused, last known N min ago". That is honest, just not labelled. Transistorsoft does expose
  authorization status — one more thing the reconsider path buys.
- **A stationary traveller produces no new fixes.** `distanceFilter` suppresses jitter, so
  somebody resting at a hut for an hour will read as stale to their watchers. Honest, but it can
  read as alarming. Watch for it in the device matrix before adding a heartbeat, because a
  heartbeat that re-sends a last-known position as if it were current would be exactly the kind
  of fabricated freshness this codebase refuses everywhere else.

## Reconsider if

The **on-device background matrix** shows iOS "always" is not held reliably — fixes stop after
some period locked, or fail to resume after an OS kill. That is a *slice outcome decided by the
device*, not something a unit suite can tell us, and it is the trigger for ADR 011's reconsider
clause: move to **Transistorsoft** first (same seam, paid, better iOS pedigree and a permission
API), and only then consider a native module.

Also reconsider if the plugin stops tracking Capacitor releases — it is already one major
version behind, and the `Package.swift` rewrite above is the CLI papering over that gap.
