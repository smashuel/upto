# PRD — Live location (Stage 1: web foreground pipeline)

Status: ready-for-agent
Created: 2026-07-05
Related: [ADR 010 — safety-first direction](../../brain/decisions/010-product-direction-safety-first-social-leash.md), [ADR 011 — Capacitor shell](../../brain/decisions/011-capacitor-mobile-shell.md), [ADR 012 — TripLink lifecycle module](../../brain/decisions/012-triplink-lifecycle-module.md), [ADR 014 — settle window](../../brain/decisions/014-settle-window-is-a-real-state.md), [CONTEXT.md](../../CONTEXT.md), [features/triplink-route-persistence.md](../../brain/features/triplink-route-persistence.md), roadmap Phase 2 Stage 1

## Problem Statement

A Watcher opens a shared TripLink to answer one question: *where is the traveller right
now, and are they OK?* Today the shared view can only show them where the traveller
**planned** to go (the static route) and where they **last checked in** (a static pin,
minutes or hours old). During an active trip there is no way to see the traveller's
*current* position — the single most useful piece of live safety information.

Worse, the view currently gives no signal about how old the "last check-in" pin is
relative to now, so a watcher can mistake a stale point for a current one. On a
safety tool that is a dangerous ambiguity: a pin two hours old, shown with no
qualification, reads as "they are here."

Two things are missing at once: (1) a live position when the traveller is sharing one,
and (2) an **honest** account of liveness when they are not — so a watcher always knows
whether what they are looking at is current, stale, or simply not being shared.

## Solution

While a traveller has the active-trip page open, their device streams its current
position to the backend, which broadcasts it over the existing SSE channel to everyone
watching the TripLink. The Watcher view shows a **live marker** on the planned-route map,
rendered on the same basemap and framing the planner used, updating in near-real-time.

The traveller controls this per trip with a **live-sharing** setting — `with-trip`
(watchers see it, the default), `owner-only` (only the traveller's own screen), or `off`.

Crucially, the view is **honest about liveness** at all times, following the same
absent-not-zero principle Phase 1 established for terrain
([journal 07-03c](../../brain/journal/2026-07-03-honest-degradation.md)). A live point is
only ever presented as live while it is actually fresh. When sharing is on but no recent
fix has arrived (the traveller backgrounded the page, lost signal, or denied location
permission), or when sharing is `owner-only`/`off`, the watcher sees an explicit notice —
"Live tracking paused, last known 12m ago — may not be current" or "Live tracking not
enabled for this trip" — so a stale or absent position can never masquerade as a current
one.

This ships as an honest **"live while the traveller has the page open"** capability — real
value on day walks, and it validates the whole pipeline (permission → publish → broadcast →
marker → liveness) with real users before any Capacitor/background investment (Stage 2).

Riding along, because the live marker needs a canvas to render on: the **chosen basemap and
camera framing are persisted on the TripLink** — the unshipped half of
[triplink-route-persistence.md](../../brain/features/triplink-route-persistence.md) — so the
shared view opens on the same map the planner used instead of a default.

## User Stories

1. As a watcher of an active trip, I want to see the traveller's current position on the
   map, so that I know where they actually are rather than only where they planned to go.
2. As a watcher, I want the live marker to update on its own as the traveller moves, so
   that I don't have to refresh to get a current picture.
3. As a watcher who opens the link mid-trip, I want to immediately see the last-known live
   position (with its age), so that I get context without waiting for the next update.
4. As a watcher, I want a clear label telling me how fresh the position is ("updated 8s
   ago"), so that I can judge how much to trust it.
5. As a watcher, when the traveller's device stops sharing (backgrounded, lost signal, or
   denied permission), I want the view to tell me tracking is paused and show the last-known
   position with its age, so that I never mistake a stale point for a current one.
6. As a watcher of a trip where live sharing is off or owner-only, I want an explicit
   "live tracking not enabled for this trip" notice next to the last check-in, so that I
   understand the pin I'm seeing may not be their current location.
7. As a watcher, I want the live marker to be visually distinct from the static last-check-in
   pin and the planned route, so that I don't confuse the three.
8. As a watcher, I want the live marker to disappear (or freeze with a clear "trip ended"
   treatment) once the trip completes, so that I'm not shown a live position for a finished
   trip.
9. As a traveller on an active trip, I want my device to share my position while I have the
   trip page open, so that my watchers can see I'm progressing safely without me having to
   check in manually.
10. As a traveller, I want to be asked for location permission at a sensible moment and told
    why, so that I understand what I'm granting and to whom.
11. As a traveller who denies or later revokes location permission, I want the app to keep
    working and my watchers to be told tracking isn't available, so that the absence is
    honest rather than silent.
12. As a traveller, I want to choose per trip whether my live position is shared with
    watchers, kept to my own screen only, or off entirely, so that I control who sees my
    real-time movements.
13. As a traveller, I want `with-trip` sharing to be the default when I share a trip, so
    that the common safety case works without extra steps.
14. As a traveller who sets a trip to `owner-only`, I want my own screen to show my live
    position but nothing to reach my watchers, so that I can use tracking privately.
15. As a traveller who sets a trip to `off`, I want no live position collected or sent at
    all, so that I'm confident nothing is being streamed.
16. As a traveller, I want to see my own live marker on my active-trip screen, so that I can
    confirm the app is tracking me correctly.
17. As a traveller on a flaky connection, I want position sending to tolerate dropped
    requests without crashing or spamming, so that the feature degrades gracefully.
18. As a watcher opening a shared TripLink, I want the map to open on the same basemap and
    framing the planner used, so that the route (and any live marker) is legible immediately
    instead of on a default world view.
19. As the trip's creator, I want the basemap and camera I chose while planning to be saved
    with the trip, so that everyone who opens the link sees the map I intended.
20. As a developer, I want live position to flow through the one existing SSE-event reducer
    that already carries status/check-in/overdue, so that "apply an SSE event to TripLink
    state" stays in a single tested place.
21. As a developer, I want a position event to provably not disturb status, overdue, or
    check-in state, so that live tracking can never corrupt the lifecycle the safety core
    depends on.
22. As a developer, I want the liveness classification (fresh / stale / not-shared /
    unavailable) to live in one pure tested function, so that owner and watcher views agree
    and the honest-degradation rule can't drift.
23. As a developer, I want the privacy gate enforced on the server as well as the client, so
    that a stale or tampered client can't cause positions to be broadcast against the trip's
    setting.
24. As a maintainer, I want no new test framework added for this, so that the reducer and
    guard tests run under the existing `node --test` setup like the lifecycle tests.
25. As a maintainer, I want live positions to be last-known-only (not a stored breadcrumb
    history), so that Stage 1 stays small and we don't commit to a movement-track schema
    before Stage 2 decides sampling.

## Implementation Decisions

- **Extend the one client seam, `applyLifecycleEvent`, with a `position` event kind.**
  Every SSE event already funnels through this pure reducer (ADR 012); live position joins
  it rather than opening a parallel path. Confirmed extended event shape:

  ```
  applyLifecycleEvent(prev: TripLink, event:
    | { kind: 'status';   status; startedAt? }
    | { kind: 'checkin';  status?; timestamp; message?; locationW3w?; lat?; lng? }
    | { kind: 'overdue';  overdueSince }
    | { kind: 'position'; sharing: 'live' | 'unavailable'; timestamp; lat?; lng?; accuracy? }
  ): TripLink
  ```

  Rules it owns for `position`: on `sharing: 'live'` with coordinates, set
  `livePosition = { lat, lng, timestamp, accuracy }` **only if `timestamp` is newer than the
  current `livePosition.timestamp`** (monotonic — out-of-order/duplicate broadcasts are
  dropped); on `sharing: 'unavailable'`, record that the traveller's device is no longer
  supplying fixes (a `livePosition.sharing`/unavailable marker) while retaining the
  last-known coordinates for reference. A `position` event **never** touches `status`,
  `overdueSince`, `startedAt`, `lastCheckIn`, or `checkIns` — this isolation is a tested
  invariant.

- **New TripLink fields.** Extend the type with:
  - `liveSharing?: 'with-trip' | 'owner-only' | 'off'` — per-trip privacy, default treated
    as `with-trip` when absent (safe common case; legacy trips never POST so they stay dark).
  - `livePosition?: { lat; lng; timestamp; accuracy?; sharing? }` — last-known live fix only.
  - `plannedBasemap?: MapLayer` — the persistence rider; the canonical `MapLayer` type comes
    from `BasemapSuggest` (`'satellite' | 'topo-linz' | 'topo-ga' | 'topo-nsw'`). No
    `plannedCamera` (see the rider decision below).

- **`liveSharing` is a live toggle on ActiveTrip, not a wizard field (grilled 2026-07-05).**
  It's a runtime safety/privacy choice, not a planning attribute — a traveller's instinct to
  kill sharing arrives mid-trip — so it must be mutable while `active`/`overdue`. Default
  `with-trip`, surfaced as the "● Sharing live location with watchers" chip on ActiveTrip
  (which doubles as the toggle). The last-set value persists on the TripLink. Flipping to
  `off` mid-trip tears down the geolocation timer and fires one `unavailable` beacon so
  watchers see it stop. The backend guard always reads the *current* stored `liveSharing`.

- **Privacy is enforced primarily by not publishing, with a server guard behind it.**
  - `off` → the traveller's device never starts a geolocation watch; nothing is collected.
  - `owner-only` → the traveller's own screen renders its live position directly from the
    browser geolocation watch, but the device does **not** POST it; watchers get nothing.
    (This sidesteps the fact that owner and watcher share one capability-token SSE stream —
    the cleanest enforcement of "owner-only" is simply not to broadcast.)
  - `with-trip` → the device POSTs positions; the backend broadcasts them to the shared stream.
  - **Server guard (defense in depth):** the position endpoint reads the trip's stored
    `liveSharing` and refuses to broadcast unless it is `with-trip`, so a stale client can't
    override the trip's setting. This guard is a pure function, `shouldBroadcastPosition`.

- **New backend endpoint `POST /api/triplinks/:token/position`.** Capability-guarded by the
  share token and rate-limited via the existing `rateLimitByToken` (same as check-in), body
  `{ lat, lng, accuracy?, sharing: 'live' | 'unavailable' }`. When
  `shouldBroadcastPosition(liveSharing)` is true it (a) **broadcasts every POST** over the
  existing `broadcast(token, 'position', …)` seam (in-memory, cheap — watchers get the ~3-min
  sample cadence) and (b) **persists the last-known `livePosition` to the JSONB `data`
  coarsely — at most ~once per 10 min**, keeping the newest fix in memory between writes
  (overwrite, not append — no breadcrumb history in Stage 1). The coarse persist only exists
  to rehydrate a watcher who loads mid-trip; the next broadcast corrects it within a sample.
  Position is **not** a lifecycle transition and does **not** go through the lifecycle module.

- **Cadence + battery are first-class constraints (grilled 2026-07-05).** This runs on a
  phone (foreground now, background in Stage 2); location services and radios drain battery,
  so the pipeline is deliberately coarse. Four named, tunable constants: **sample ~3 min**,
  **broadcast per sample (~3 min)**, **DB persist ~10 min**, **fresh→stale ~10 min** (≈ 3
  missed samples). "Where were they in the last half hour" is the safety question, not
  second-by-second. Sampling uses **timed `getCurrentPosition` every ~3 min, not a continuous
  `watchPosition` firehose** — coarse at the source (the device), best for battery. See
  [brain/plans/live-location.md](../../brain/plans/live-location.md) for the battery rationale
  that carries into Stage 2.

- **`position` is a new SSE event name** alongside `status`/`checkin`/`overdue`; the API
  client's `subscribeToEvents` gains an `onPosition` handler that normalises the payload into
  the tagged `position` event before calling the reducer. The wire contract is the boundary;
  the reducer never touches `EventSource`.

- **Last-known position rehydrates on load.** `GET /api/triplinks/:token` returns
  `livePosition` and `liveSharing` so a watcher opening mid-trip sees the last-known point
  (with its age and liveness) immediately, before any live event arrives.

- **Liveness is a pure, local-clock derivation — never stored, never re-derived state.**
  A single classifier, `describeLiveness(tripLink, now)`, returns `fresh` | `stale` |
  `not-shared` | `unavailable`, driven by `liveSharing`, the presence/age of `livePosition`,
  and its `sharing` marker. It runs on a display tick (like the active-trip countdown clock)
  so the "updated Nm ago" / "paused Xm ago" copy stays live between events. fresh→stale is the
  ~10-min constant above. The four states + two lifecycle edges are the **complete set**
  (grilled 2026-07-05 — closed until proven otherwise):

  | State | When | Marker | Watcher copy |
  |---|---|---|---|
  | **fresh** | `with-trip`, position < 10 min old | pulsing | "Live · updated 3m ago" |
  | **stale** | `with-trip`, position ≥ 10 min old | **greyed, still shown** | "Live tracking paused — last known 14m ago, may not be current" |
  | **unavailable** | `with-trip`, latest signal was the `unavailable` beacon | none (fall back to check-in pin) | "Live tracking unavailable — showing last check-in" |
  | **not-shared** | `owner-only` / `off` / never started | none (check-in pin only) | "Live tracking not enabled for this trip — last check-in may not be their current location" |

  Edges: **`planned`** → no live UI at all (planned route only; streaming begins at `active`).
  **`completed`** → live marker **removed**, no liveness notice (a live position on a finished
  trip is misleading); map reverts to planned route + final check-in. The stale marker is kept
  **greyed rather than hidden** — "here's where they were 14 min ago" is useful for SAR as
  long as it's unmistakably labelled not-current. The safety invariant: **every degraded state
  (stale/unavailable/not-shared) carries the "may not be their current location" qualifier**,
  so a static pin is never shown bare.

- **Traveller sampling loop (owner view, below the seam).** ActiveTrip runs a **~3-min
  `getCurrentPosition` timer** while the trip is `active` **or** `overdue` and
  `liveSharing !== 'off'` (you most want a position when overdue — overdue never stops the
  stream). It POSTs each fix while `with-trip`, renders locally only while `owner-only`.
  Permission is requested **contextually** — when the trip goes active with sharing on, or
  when the traveller first toggles sharing on — with a one-line "share with the people
  watching this trip?" explainer, not a cold prompt on load. On permission denial or a
  `getCurrentPosition` error it POSTs a single `sharing: 'unavailable'` beacon (when
  `with-trip`) and reflects it in the ActiveTrip chip ("Location off — watchers see your last
  check-in only"). On tab close it makes a **best-effort `navigator.sendBeacon('unavailable')`
  on `pagehide` / `visibilitychange → hidden`** so watchers flip to "paused" within a cycle —
  but this is never relied on; the ~10-min stale threshold is the honest floor if the beacon
  doesn't land (crash, killed tab, dead battery). The timer is torn down on unmount and on
  completion.

- **Map live marker (below the seam).** `TripPlanningMap` gains a `liveMarker` prop (distinct
  styling from `checkInMarker` and the route) rendered read-only, mirroring the existing
  `checkInMarker` mechanism.

- **Persistence rider — `plannedBasemap` only, no `plannedCamera` (grilled 2026-07-05).**
  On TripLink save, `CreateAdventure` includes `plannedBasemap` (current `MapLayer` from
  `BasemapSuggest`). On view mount, `TripPlanningMap` honours a `plannedBasemap` prop,
  skipping viewport auto-resolve when present — so an AU trip opens on GA/NSW topo instead of
  defaulting to NZ LINZ. **No camera is persisted:** with a *moving* live marker we don't want
  a frozen planning camera fighting "keep the marker in view", so the view page's existing
  bounds-fit (`flyToRouteBounds`) is **extended to include the live point** rather than
  restoring a saved camera. Scene mode (2D/3D) is also not persisted — the watcher view stays
  in 2D topo (the sensible glance default). This completes the basemap half of
  [triplink-route-persistence.md](../../brain/features/triplink-route-persistence.md), whose
  route half already shipped.

## Testing Decisions

- **What a good test is here:** given prior TripLink state and an incoming event (or a
  `(tripLink, now)` pair), assert the derived output. No test reaches into React rendering,
  `EventSource`, `navigator.geolocation`, or Cesium — those are implementation details below
  the seams, verified by manual run-through.

- **Seam 1 — `applyLifecycleEvent` with the `position` kind** (primary; `node --test`, prior
  art [lifecycleReducer.test.ts](../../src/utils/lifecycleReducer.test.ts)). Cases: a `live`
  position sets `livePosition`; a newer-timestamp position replaces an older one; an
  older/duplicate-timestamp position is ignored (monotonic); an `unavailable` beacon marks
  the position not-current while retaining last-known coordinates; a `position` event leaves
  `status`, `overdueSince`, `startedAt`, `lastCheckIn`, and `checkIns` **unchanged**
  (isolation invariant); interleaving a `position` between `checkin`/`overdue` events does
  not disturb their results.

- **Seam 2 — `shouldBroadcastPosition(liveSharing)`** (`node --test`, prior art
  [triplink-lifecycle.test.js](../../triplink-lifecycle.test.js), same injected-deps /
  plain-data style). Cases: `with-trip` → true; `owner-only` → false; `off` → false;
  `undefined` → true (legacy default; note legacy trips never POST).

- **Seam 3 — `describeLiveness(tripLink, now)`** (`node --test`). Cases: `off`/`owner-only`
  → `not-shared`; `with-trip` with a recent `livePosition` → `fresh`; `with-trip` with a
  `livePosition` older than the threshold → `stale`; latest signal was an `unavailable`
  beacon → `unavailable`; `with-trip` with no `livePosition` yet → `not-shared` (nothing to
  present as live); a `completed` trip → not `fresh` regardless of position age (no live
  claim on a finished trip).

- **Below the seams (explicitly manual-verify, no harness added — per ADR 013/012 scope):**
  the geolocation watch + throttled POST loop, the permission-denied → `unavailable` beacon,
  the `EventSource` `onPosition` wiring, the Cesium `liveMarker` rendering, and the basemap/
  camera rehydrate. Verified by: start a trip on one device with `with-trip`, open the share
  link on another, confirm the live marker tracks and labels "updated Ns ago"; background the
  traveller's page and confirm the watcher flips to "paused, last known …"; deny permission
  and confirm the "not enabled/unavailable" notice; switch a trip to `owner-only` and confirm
  watchers get no marker while the owner still sees theirs; open a shared link and confirm it
  lands on the planner's basemap and framing.

## Out of Scope

- **Stage 2 — Capacitor shell**: reliable iOS/Android background location and push, and
  battery-aware sampling. This PRD is foreground-web only and says so in the UI copy.
- **Breadcrumb / movement history**: Stage 1 stores last-known position only. A persisted
  track of where the traveller has been (and its sampling/retention schema) is deferred to
  Stage 2.
- **Off-route alerting** ("you're 300m off your planned line") and progress/late-running
  estimates — enabled later by having both the planned route and live position on hand, but
  not built here (see the Stretch section of triplink-route-persistence.md).
- **Notifying watchers when live sharing toggles or a position goes stale** — the view is
  honest on load and live, but no push/email fires on these transitions in Stage 1.
- **Fast-follows** (GuidePace wiring into TripDetailsStep, check-in reminder schedule) — the
  roadmap's separate interleaved lane, not this PRD.
- **Authenticating the SSE stream / distinguishing owner vs watcher connections** — Stage 1
  enforces `owner-only` by not publishing, so the capability-token stream model is unchanged.
- **`plannedCamera` / persisted scene mode** — dropped (see the rider decision); framing is
  derived, not restored.
- **Accuracy-radius circle and what3words on the live marker** — `accuracy` is stored but not
  rendered as a circle in Stage 1; live position is coordinates only (w3w stays a check-in
  affordance). Both are later polish, not this PRD.

## Further Notes

- **Honest degradation is the safety point, not a nicety.** The most dangerous failure this
  feature could introduce is a stale point that looks current. `describeLiveness` and the
  watcher copy exist so that never happens — consistent with Phase 1's terrain
  absent-not-zero decision.
- **No lifecycle change and no deploy-ordering constraint on the client reducer** — but the
  backend `position` endpoint and the `onPosition` client handler form a contract, so the
  backend half should ship first (or same deploy) so watchers can receive what travellers
  send. The reducer's `position` branch is inert until events arrive.
- **The persistence rider is bundled deliberately**: the live marker is far less useful on a
  default world map, so shipping "live marker" and "open on the planner's canvas" together is
  what makes the watcher view actually legible. It also finally closes the long-open
  basemap/camera half of triplink-route-persistence.
- **Kickoff-act alignment:** the roadmap names Phase 2's kickoff as "write
  `brain/plans/live-location.md` and grill it." This PRD is the specified shape; the plan
  file + a grilling pass should precede implementation, and the durable record moves to
  `brain/` when Stage 1 ships.
```
