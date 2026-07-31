# 06 — Adding a map note along a route crashes the TripLink

Status: fixed pending device re-verify (2026-07-31)
Priority: high — data loss
Surfaced: on-device (iPhone), 2026-07-31
Area: src/services/NoteManager.ts, TripPlanningMap.tsx

## What to build

Placing a note on a point along the route crashes the TripLink. The user loses in-progress
planning work, which makes the notes feature unusable and risks losing an entire draft trip.

Reproduce: open Map & route, draw a route, switch to Note mode, tap a point on/near the route,
enter note text.

## Investigation (2026-07-31)

The `window.prompt()` hypothesis was **wrong**. A React `NoteModal` was already wired as the
input path; the `prompt()` branch was dead code for non-React callers (now removed anyway,
since WKWebView handles `prompt()` badly and it was a hang-or-crash waiting to be reached).

Two other hypotheses were checked and ruled out:

- **Clamped billboards in 2D.** The wizard opens in `SCENE2D`, so a `CLAMP_TO_GROUND` billboard
  throwing there would have fit perfectly. Read the Cesium source: the `DeveloperError` guard is
  on `Model`, not `Billboard`, and only fires when there is no scene at all. Not this.
- **Circular structure on save.** Notes carry live Cesium objects (`position`, `entity`), which
  would throw if `JSON.stringify`d — but `onNoteAdded` has no caller, so they never reach form
  state. Not this. (That absence is its own problem — issue 10.)

One **provable** defect was found: the icon data URIs were built as
`data:image/svg+xml;utf8,<svg ...>` with raw `<`, `>`, `"` and space characters — all excluded
from a URI by RFC 3986 — and `;utf8`, which is not a valid media-type parameter (`charset` is).
Desktop browsers are lenient; WebKit is stricter, and a Cesium billboard whose image fails to
decode raises inside the render loop. That fits "works on web, crashes in the app", but it is
not *proven* to be the crash the user hit.

So the fix does both: correct the provable defect, and make the whole path failure-safe so that
whatever the cause, the trip survives and the error becomes reportable.

## Acceptance criteria

- [ ] Adding a note at a point on the route works on iOS in the native shell.
- [ ] Note text is entered via an in-app modal, not `window.prompt()`.
- [ ] Cancelling note entry leaves the map and the route untouched.
- [ ] A failure anywhere in note creation is caught and surfaced as a toast — the TripLink
      draft, route, and waypoints survive.
- [ ] Notes still round-trip into TripLink form state and persist with the trip.

## Blocked by

- None.
