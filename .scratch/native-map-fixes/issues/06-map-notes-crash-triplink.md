# 06 — Adding a map note along a route crashes the TripLink

Status: done (2026-07-31) — root cause was a nested <form>; fixed at 40c3558, verified on device
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

## Update — 2026-07-31, after abc9aa6

Still crashes on a build confirmed to include the icon-encoding fix and the up-front icon
decode. That kills the data-URI theory: three specific hypotheses have now been proposed and
each has been ruled out by evidence rather than by trying a fix and hoping.

Changed approach. Rather than guess at a fourth cause, the failure is now **contained and
made legible**:

- **`ErrorBoundary`** (new, `src/components/ErrorBoundary.tsx`). There was no error boundary
  anywhere in the app, so React 18 unmounted the *whole tree* on any uncaught throw. That is
  precisely why a map failure read as "the TripLink crashed" — the blast radius, not the bug.
  The map and the trip form are each wrapped now; the form's boundary sits inside
  `FormProvider` so `useForm` state survives and "Try again" restores the step.
- **`scene.renderError`** capture, with `showRenderLoopErrors: false`. Cesium render-loop
  failures are asynchronous — they occur inside `scene.render()`, long after the call that
  queued the work returned — so neither a `try/catch` at the call site nor a React error
  boundary can observe them. This listener is the only thing that can.
- Both surfaces display the error text and are selectable, because a TestFlight build has no
  readable console without a Mac.

**Next step is a report, not a fix**: place a note and read back whichever appears — the red
"Map rendering error" banner, or the "map stopped working" panel. That message names the
actual cause and this stops being guesswork.

## Update — 2026-07-31, after 99c7657

Neither surface fired. On a build confirmed to contain both the error boundary and the
`scene.renderError` listener, placing a note still ends with a fresh "New TripLink" page and
every entry cleared — no boundary panel, no render-error banner.

**That is the most informative result so far, because it rules out an exception entirely.**
If anything had thrown in React, the boundary would have caught it. If anything had thrown in
Cesium's render loop, `renderError` would have caught it. Nothing in JS ever saw a failure —
so this was never a crash in the sense assumed by issues 06 and its three dead hypotheses.

Losing *all* form state means the whole JS context went away. Only two things do that:

| Cause | Fingerprint |
|---|---|
| The document unloaded with JS alive (navigation, reload, stray form submit) | `pagehide` fires |
| The runtime was destroyed (WKWebView content-process kill, i.e. out of memory) | no JS runs at all |

Capacitor's `webViewWebContentProcessDidTerminate` reloads the current URL, so a process kill
on `/create` reproduces the reported symptom exactly — as does a navigation back to it.

### Shipped

- **`src/services/crashBreadcrumb.ts`** (10 tests). Records a stage in `localStorage` before
  a note is placed and clears it `NOTE_SETTLE_MS` later — held open past the synchronous call
  because Cesium renders the billboard asynchronously. A `pagehide` listener marks the
  breadcrumb, which is the discriminator above. `CrashReportBanner` reads it at the next boot
  and names the verdict, since `localStorage` is the only channel that survives both causes.
- **Nested `<form>` fixed** — a real bug found while investigating, and a live candidate for
  the "navigation" branch. `NoteModal` rendered a `<form>` inside the wizard's `<form>`
  (`CreateAdventure.tsx`), which HTML forbids. React synthetic events bubble through the React
  tree, so submitting the note also ran the wizard's `handleSubmit(onSubmit)` — which calls
  `navigate('/login')` when there is no session. The modal is now portalled to `<body>` (fixes
  DOM form ownership and native submission) *and* stops propagation (fixes the React path;
  the portal alone does not, because synthetic events cross portal boundaries).

### Next step

Place a note, then relaunch and read the yellow banner at the top. It will say either
"the page navigated or reloaded" or "the app was terminated by the system (most likely out of
memory)". Those two answers lead to completely different fixes, and this finally distinguishes
them with evidence.

## Resolved — 2026-07-31, at 40c3558

**Cause: a nested `<form>`.** `NoteModal` rendered a `<form>` inside the trip wizard's
`<form>`, which HTML forbids. React synthetic events bubble through the React tree, so
submitting a note also ran the wizard's `handleSubmit(onSubmit)` — which navigates when there
is no session, throwing away the whole in-progress trip. There was never an exception, which
is why the error boundary and `scene.renderError` both stayed silent and why three rounds of
guessing at Cesium-side causes found nothing.

Fixed by portalling the modal to `<body>` (DOM form ownership and native submission) plus
`stopPropagation` (the React path — a portal alone does not stop synthetic bubbling).
Confirmed on device: the note submitted and the wizard survived.

Kept regardless, because both earn their place independently of this bug: the error
boundaries bound the blast radius of any future throw, and the crash breadcrumb distinguishes
a lost document from a killed runtime — neither of which is otherwise observable on TestFlight.
