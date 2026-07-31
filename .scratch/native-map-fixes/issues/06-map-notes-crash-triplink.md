# 06 — Adding a map note along a route crashes the TripLink

Status: ready-for-agent
Priority: high — data loss
Surfaced: on-device (iPhone), 2026-07-31
Area: src/services/NoteManager.ts, TripPlanningMap.tsx

## What to build

Placing a note on a point along the route crashes the TripLink. The user loses in-progress
planning work, which makes the notes feature unusable and risks losing an entire draft trip.

Reproduce: open Map & route, draw a route, switch to Note mode, tap a point on/near the route,
enter note text.

Strong suspect: `NoteManager` still uses `window.prompt()` for note input (a long-standing
known gap — see CLAUDE.md "Known Issues"). `window.prompt()` is **not implemented in iOS
WKWebView** the way it is in a desktop browser — Capacitor's WebView can return null or block,
and any code that assumes a string back will throw. This is a native-shell-specific failure
mode, which fits "works on web, crashes in the app".

Replace the `window.prompt()` call with a proper in-app modal/form (already flagged as needed),
and make note placement failure-safe: a note that cannot be created must never take down the
wizard or discard the route.

## Acceptance criteria

- [ ] Adding a note at a point on the route works on iOS in the native shell.
- [ ] Note text is entered via an in-app modal, not `window.prompt()`.
- [ ] Cancelling note entry leaves the map and the route untouched.
- [ ] A failure anywhere in note creation is caught and surfaced as a toast — the TripLink
      draft, route, and waypoints survive.
- [ ] Notes still round-trip into TripLink form state and persist with the trip.

## Blocked by

- None.
