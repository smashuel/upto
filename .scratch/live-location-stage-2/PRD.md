# PRD — Live location (Stage 2: Capacitor shell — reliable background location + push)

Status: ready-for-agent
Created: 2026-07-08
Related: [ADR 010 — safety-first direction](../../brain/decisions/010-product-direction-safety-first-social-leash.md), [ADR 011 — Capacitor shell](../../brain/decisions/011-capacitor-mobile-shell.md), [ADR 012 — TripLink lifecycle module](../../brain/decisions/012-triplink-lifecycle-module.md), [Stage 1 PRD](../live-location/PRD.md), [plans/live-location.md](../../brain/plans/live-location.md), [features/notification-transport.md](../../brain/features/notification-transport.md), [CONTEXT.md](../../CONTEXT.md), roadmap Phase 2 Stage 2

## Problem Statement

Stage 1 shipped an honest live-location pipeline, but it only works **while the traveller
has the trip page open in the foreground**. The moment the phone screen locks or the app is
backgrounded — which is what a phone actually does in a pocket on a real trip — the browser
stops sampling, the marker goes stale, and the watcher's view degrades to "paused, last
known Nm ago." For a *safety* tool that is the whole ballgame: the traveller is walking, the
screen is off, and their watchers can no longer see where they are. "We lost their location
when the phone went in their pocket" (ADR 011) defeats the feature.

Three linked gaps follow from having no native shell:

1. **No background location.** Safari / a pure web app cannot keep updating position once
   backgrounded or locked — the exact situation of an active trip.
2. **No resilience to signal loss.** A phone in a backcountry valley has no connectivity for
   hours. Stage 1 is fire-and-forget: every failed POST is silently dropped, so a long dead
   zone erases the traveller's positions for that whole stretch even after signal returns.
3. **No native escalation channel.** When a trip goes overdue, the only transport that
   reaches a human is email (Stage 1 / notification-transport). ADR 011 flagged Capacitor
   push as the candidate native escalation channel; without the shell it can't exist.

And the constraint that makes all of this hard: **battery.** Location services and radios
are the biggest drain on a phone, and users need the battery to last a multi-day trip.
Background sampling makes battery management acute rather than optional (plan §Cadence).

## Solution

**Wrap the existing React/Vite app in a Capacitor native shell** (ADR 011), shipped to the
App Store and Play Store, *additively* — the web app keeps deploying to Vercel exactly as
today; the native build is a second target over the same codebase, not a fork.

Inside the shell, the traveller's position keeps streaming **even when the app is
backgrounded or the screen is locked**, via a Capacitor background-geolocation plugin. Every
layer downstream of the position source is **unchanged from Stage 1** — the same
`api.reportPosition` → SSE `position` → `applyLifecycleEvent` → live marker →
`describeLiveness` chain, with the same privacy model (`with-trip` / `owner-only` / `off`)
and the same honest-degradation contract. Stage 2 only changes *how fixes are produced* and
*how reliably they are delivered*.

Three things get built on top of that swap:

1. **Battery-aware, adaptive sampling.** A single policy function decides how often and how
   precisely to sample from trip status, foreground/background state, battery level, and the
   traveller's chosen power mode — widening the interval and dropping accuracy when
   backgrounded or low on battery, tightening when foreground or charging. The traveller can
   pick **Adaptive** (default) or **Battery saver** in their profile; battery saver samples
   more conservatively throughout. This replaces Stage 1's two hardcoded interval constants.

2. **Store-and-forward for dead zones.** Fixes taken while offline are buffered on the
   device and delivered when connectivity returns, coalesced to the most recent (still
   **last-known-only** — no breadcrumb trail in this stage), so a watcher who was staring at
   a stale marker snaps to the traveller's real current position the moment signal comes
   back, instead of losing the whole offline stretch.

3. **Push escalation to watchers.** When a trip goes overdue, watchers who have the native
   app installed and notifications granted receive a **push** alongside the existing overdue
   email — a faster, lock-screen-visible escalation channel. Email remains the universal
   fallback for watchers without the app.

This ships as the honest upgrade from Stage 1's "live while the page is open" to **"live for
the duration of the trip, screen on or off"** — the promise the safety pitch actually needs.

## User Stories

1. As a traveller, I want my position to keep updating while my phone is in my pocket with
   the screen locked, so that my watchers can see where I am without me keeping the app open.
2. As a traveller, I want tracking to survive the app being backgrounded (I switch to my
   camera, maps, or messages), so that using my phone normally doesn't blind my watchers.
3. As a traveller, I want tracking to resume automatically if the OS kills and relaunches the
   app, so that a low-memory kill mid-trip doesn't silently end my sharing.
4. As a traveller, I want to grant "always allow" background location with a clear
   explanation of why a safety app needs it, so that I understand the permission I'm giving.
5. As a traveller who only grants "while using the app," I want the app to keep working in
   the foreground and tell me background tracking is limited, so that the degraded state is
   honest rather than silently broken.
6. As a traveller on a multi-day trip, I want sampling to be gentle on my battery, so that
   sharing my location doesn't leave me with a dead phone when I most need it.
7. As a traveller, I want to choose a "Battery saver" mode in my profile, so that I can
   trade update frequency for battery life on long trips.
8. As a traveller, I want "Adaptive" to be the default power mode, so that the common case
   balances freshness and battery without me configuring anything.
9. As a traveller, I want sampling to widen automatically when my battery is low and tighten
   when I'm charging, so that the app spends power when it can afford to.
10. As a traveller walking through a valley with no signal, I want my positions buffered and
    sent as soon as I get reception, so that my watchers see my real current location the
    moment I'm back in range instead of an hours-old point.
11. As a traveller, I want the buffered-then-delivered position to reflect where I actually
    am now (most recent), so that reconnecting doesn't replay a stale point as current.
12. As a traveller, I want the "● Sharing live location with watchers" consent chip and the
    `with-trip` / `owner-only` / `off` control to work identically in the native app, so that
    my Stage 1 privacy choices carry over unchanged.
13. As a traveller who sets sharing to `off`, I want the background sampler to actually stop
    (not just not-publish), so that "off" genuinely collects nothing even in the native shell.
14. As a traveller, I want a persistent indication that background tracking is active, so
    that I'm never unknowingly broadcasting (respecting the platform's own background-location
    indicators).
15. As a watcher with the app installed, I want a push notification when a trip I'm watching
    goes overdue, so that I find out immediately without having to already be on the page.
16. As a watcher without the app, I want to still receive the overdue email, so that the push
    channel is an addition, never a regression in who gets alerted.
17. As a watcher, I want the live marker and its liveness labels ("updated 3m ago", "paused,
    last known 14m ago") to behave exactly as in Stage 1, so that background tracking just
    makes the fresh state more common, not a new set of rules to learn.
18. As the traveller, I want my position to keep flowing while the trip is `overdue`, not
    just `active`, so that the period when watchers most need my location is covered.
19. As a user, I want the app available in the App Store and Play Store, so that I can install
    it like any other app and receive updates.
20. As a returning web user, I want the website to keep working exactly as before, so that the
    native app is an option, not a forced migration.
21. As a developer, I want the native position source to feed the *same* `api.reportPosition`
    → SSE → reducer pipeline as the web source, so that only one set of downstream behaviour
    (broadcast, liveness, marker, privacy guard) exists and stays tested.
22. As a developer, I want the choice of which position source to use (native background vs
    web foreground) resolved in one pure, tested function of the platform, so that the branch
    is explicit and not scattered through the component.
23. As a developer, I want the sampling cadence decided by one pure, tested policy function of
    (status, app-state, battery, power-mode), so that the battery-vs-safety tradeoff lives in
    a single tunable place instead of hardcoded constants.
24. As a developer, I want the offline buffer's flush/coalesce decision in one pure, tested
    function, so that "what do we send when we reconnect" is verifiable without a device or a
    network.
25. As a maintainer, I want the background plugin, permission lifecycle, and push
    registration verified on real devices (not mocked), so that we don't ship a green test
    suite over a feature that doesn't survive a screen lock.
26. As a maintainer, I want push to reuse the existing notification module's overdue trigger,
    so that push and email escalate from the same event rather than a parallel path.
27. As a maintainer, I want Stage 2 to remain last-known-only (buffer coalesces to newest, no
    stored trail), so that we don't commit to a breadcrumb-history schema before it's decided.

## Implementation Decisions

### The seam-level changes (tested)

- **`selectPositionSource(platform) → 'native-background' | 'web-foreground'`** — NEW, thin
  pure function. Chooses the position source from the runtime platform (native Capacitor vs
  web). The current inline `getCurrentPosition` loop in ActiveTrip becomes the
  `web-foreground` implementation of a small `PositionSource` interface (start / stop /
  onFix / onUnavailable); a Capacitor background-geolocation plugin backs `native-background`.
  Everything the source emits flows into the **unchanged** Stage 1 pipeline
  (`api.reportPosition` → SSE `position` → `applyLifecycleEvent` → marker → `describeLiveness`
  → `shouldBroadcastPosition` server guard). The plugin/permission/background wiring is
  **below the seam** (on-device manual verify).

- **`resolveSampleCadence(context) → cadence | null`** — NEW pure policy function, the home
  for battery-aware sampling. Context and result shape (from this design; refine names in
  implementation):

  ```
  resolveSampleCadence(ctx: {
    status: 'active' | 'overdue' | other;      // sample only while active | overdue
    liveSharing: 'with-trip' | 'owner-only' | 'off';
    appState: 'foreground' | 'background';
    batteryLevel: number | null;               // 0..1, null when unknown
    isCharging: boolean;
    powerMode: 'adaptive' | 'battery-saver';   // from user profile, default 'adaptive'
  }): { intervalMs: number; distanceFilterM: number; enableHighAccuracy: boolean } | null
  ```

  Returns `null` when the device should not sample at all — folding in Stage 1's status/`off`
  gate (`off`, or status not in {`active`,`overdue`}). Otherwise it returns a cadence that
  **widens the interval / lowers accuracy** when `background`, `battery-saver`, or low/unknown
  battery, and **tightens** when `foreground` and/or `isCharging`. It **replaces the two
  hardcoded Stage 1 constants** (`LIVE_SAMPLE_INTERVAL_MS` and the persist cadence). Stage 1's
  battery invariant carries in hard: the coarse floor (roughly the Stage 1 ~3-min foreground /
  ~10-min-ish backgrounded band) is a starting point, not a ceiling — do not sample faster
  just because native allows it. All thresholds are named, tunable constants.

- **`nextFlushBatch(queue, now, online) → batch`** — NEW pure function for store-and-forward.
  When offline, fixes (and `unavailable` markers) accumulate in an on-device queue with
  timestamps. On reconnect, this decides what to POST: because Stage 2 is **last-known-only**,
  it **coalesces the queue to the single most-recent meaningful event** (newest live fix, or a
  trailing `unavailable` if that was last), discarding superseded intermediates — so
  reconnecting delivers the traveller's *current* position, never a replay of stale points.
  This deliberately keeps the door shut on breadcrumb history: the queue exists for delivery
  reliability, not to store a trail.

### The native shell

- **Capacitor added additively (ADR 011).** `npx cap init` + `ios`/`android` platforms over
  the existing build; web keeps deploying to Vercel unchanged. New ops surface enters the
  project for the first time: Xcode / Play Console, signing, app-store review latency
  (recorded as an ADR consequence). A native build/release runbook belongs in
  `brain/project/deployment.md` when this ships.

- **Background geolocation via a Capacitor plugin** (exact plugin is an implementation choice
  — evaluate a maintained background-geolocation plugin against iOS "always" background
  reliability, which ADR 011 names as the make-or-break wall; if it proves unreliable, ADR
  011's "reconsider if" clause puts a native module / React Native back on the table). The
  plugin is configured for the coarse, distance-filtered cadence from `resolveSampleCadence`,
  **not** a high-frequency `watchPosition` firehose.

- **iOS "always allow" permission, contextually requested with a rationale**, extending Stage
  1's contextual-permission principle (never a cold prompt on load). "While using the app"
  degrades honestly to foreground-only tracking with a clear notice — the same
  honest-degradation contract, not a silent failure.

- **Privacy parity.** `off` must *stop the native sampler*, not merely not-publish
  (the plugin genuinely collects nothing). `owner-only` renders locally, never POSTs.
  `with-trip` POSTs. The server guard (`shouldBroadcastPosition` against stored `liveSharing`)
  is unchanged and remains the backstop.

### Battery power-mode preference

- **New user-profile setting `powerMode: 'adaptive' | 'battery-saver'`, default `adaptive`.**
  Persisted on the user (a `preferences` field / column on `users`, or the existing user
  record — schema decision at implementation), exposed as a toggle on the Profile page, read
  into `resolveSampleCadence`'s context. Absent/legacy → treated as `adaptive`.

### Push escalation (watcher-only this stage)

- **Capacitor Push Notifications**: an app user (traveller or watcher) who opens the app
  registers a device token; the backend associates tokens with the user and, for watchers,
  with the trips they watch. This reuses the existing account/contact model rather than a new
  identity path.

- **Overdue push reuses the existing notification trigger.** When the 60s overdue sweep marks
  a trip overdue (notification-transport), it now **also** dispatches a push to watchers with
  registered tokens, *in addition to* the existing overdue email — one escalation event, two
  transports. Coverage is honest: push reaches watchers who installed the app and granted
  notifications; **email stays the universal channel** for everyone else (a watcher with only
  a share link in a browser gets no push, and that's expected).

- **Traveller-directed push (check-in reminders, "you're overdue — tap to extend") is
  explicitly out of scope** for Stage 2 — that's the roadmap's separate check-in-reminder
  fast-follow lane. Stage 2 push is escalation to watchers only.

## Testing Decisions

- **What a good test is here (unchanged philosophy):** given inputs, assert the derived
  output at the seam. No test reaches into the Capacitor plugin, the OS permission dialog,
  `navigator.geolocation`, the network stack, `EventSource`, or Cesium — those are
  implementation details below the seams, verified on real devices.

- **`resolveSampleCadence(ctx)`** (`node --test`, prior art `shouldBroadcastPosition` /
  `describeLiveness`). Cases: status not active/overdue → `null`; `off` → `null`; `active` +
  `foreground` + `adaptive` + charging → tightest cadence; `active` + `background` +
  `adaptive` → widened interval / lower accuracy vs foreground; `battery-saver` widens further
  than `adaptive` at the same inputs; low battery widens vs high battery; `overdue` still
  samples (never returns `null` for overdue-with-sharing); unknown battery (`null`) is treated
  conservatively (not as full); monotonic sanity — backgrounded/battery-saver interval ≥
  foreground/adaptive interval for the same trip.

- **`nextFlushBatch(queue, now, online)`** (`node --test`). Cases: `online === false` → empty
  batch (nothing sent); a queue of several live fixes coalesces to only the newest by
  timestamp; a trailing `unavailable` after live fixes flushes as `unavailable` (last signal
  wins); an empty queue → empty batch; out-of-order timestamps still resolve to the true
  newest; after a successful flush the queue is drained (no re-send of delivered fixes).

- **`selectPositionSource(platform)`** (`node --test`, trivial but pins the branch): native
  platform → `'native-background'`; web → `'web-foreground'`.

- **Reused, unchanged from Stage 1 (no new cases required, but must stay green):**
  `applyLifecycleEvent` `position` kind, `shouldBroadcastPosition`, `describeLiveness`,
  `mapFraming` — Stage 2 feeds the same pipeline, so these are the regression guard that the
  swap didn't change downstream behaviour.

- **Below the seams — explicitly on-device manual verify (the honest ceiling; ADR 013 scope):**
  background survival across screen-lock and app-background; OS-kill relaunch resuming
  tracking; iOS "always" vs "while using" permission paths; the plugin honouring the cadence;
  `off` truly stopping the sampler; battery drain over a multi-hour real trip; offline
  buffering across a real dead zone then delivery on reconnect; push registration and an
  actual overdue push landing on a watcher's lock screen while email also arrives. A device
  test matrix (iOS + Android, foreground/background/locked/killed, online/offline) is the
  Stage 2 acceptance gate — a green unit suite is necessary but **not** sufficient here.

## Out of Scope

- **Breadcrumb / movement-history trail** — Stage 2 stays last-known-only; the offline queue
  coalesces to newest and stores no path. A rendered track polyline + its retention/sampling
  schema is a later stage.
- **Traveller-directed push** — check-in reminders and "you're overdue, tap to extend" belong
  to the roadmap's check-in-reminder fast-follow, not here. Stage 2 push is watcher escalation
  only.
- **Off-route alerting and progress/late-running estimates** — enabled later by having route +
  live position on hand; not built here.
- **Notifying watchers when live sharing toggles or a single position goes stale** — the view
  stays honest on load and live (Stage 1), but only the *overdue* transition fires a push.
- **SMS escalation** — Twilio remains scaffolded-off (notification-transport); push is the new
  channel this stage, not SMS.
- **Authenticating the SSE stream / owner-vs-watcher stream identity** — unchanged from Stage
  1; `owner-only` is still enforced by not publishing.
- **Fast-follows** (GuidePace wiring, check-in reminder schedule) — separate interleaved lane.
- **Accuracy-radius circle / what3words on the live marker** — still deferred polish.

## Further Notes

- **The safety upgrade is background survival; everything else serves it.** The single most
  valuable outcome is that a locked phone in a pocket keeps its watchers informed. Battery
  policy, the offline queue, and push all exist to make that reliable and sustainable over a
  multi-day trip — they are not independent features.
- **The pipeline is reused, not rebuilt.** Stage 1 deliberately proved the whole
  permission → publish → broadcast → marker → liveness chain in the foreground so Stage 2 is a
  *source swap plus resilience*, not a rewrite. Keeping the three tested seams
  (`applyLifecycleEvent`, `shouldBroadcastPosition`, `describeLiveness`) untouched is the
  point — if a Stage 2 change forces edits there, that's a signal the swap leaked.
- **Native reliability is the real risk, and it's not unit-testable.** ADR 011 names iOS
  background as the make-or-break wall. The device test matrix, not the unit suite, is the
  acceptance gate; budget real-device time accordingly. If the plugin can't hold "always"
  background on iOS, ADR 011's reconsider-clause is live.
- **This PRD is large and should be sliced** (à la Stage 1's four tracer-bullet slices) before
  implementation — a natural cut: (1) Capacitor shell + native background source behind
  `selectPositionSource` feeding the existing pipeline (foreground parity first, then
  background); (2) `resolveSampleCadence` + the profile power-mode setting; (3)
  `nextFlushBatch` offline store-and-forward; (4) watcher push escalation. `/to-issues` on
  this PRD is the next act.
- **Kickoff alignment:** the roadmap names Stage 2 as the next Phase-2 bet, not yet scoped
  into issues. This PRD + a slicing pass is that scoping; the durable record moves to
  `brain/` when Stage 2 ships.
