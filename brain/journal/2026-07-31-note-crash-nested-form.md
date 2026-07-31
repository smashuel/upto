# Map notes "crashed the TripLink" — a nested `<form>`, not a Cesium fault

Date: 2026-07-31
Area: map / trip wizard
Commits: `402a797` (fix + instrument), `40c3558` (instrument), `6fcdc50` (rendering + persistence)

## Symptom

On iOS (TestFlight), adding a note to a location on the route returned the user to a fresh
"New TripLink" page with every field cleared. Reported as the map crashing the trip.

## Root cause

`NoteModal` rendered a `<form>` inside the trip wizard's `<form>` in `CreateAdventure`. HTML
forbids nesting form elements, and React synthetic events bubble through the *React* tree, so
submitting the note also ran the wizard's `handleSubmit(onSubmit)`. That navigates when there
is no session, discarding the in-progress trip.

Nothing ever threw. That is why it was so hard to find:

- A React error boundary cannot see it — there is no error.
- `scene.renderError` cannot see it — Cesium was never involved.
- The whole JS context goes away, so no logging inside the session survives it.

Three specific hypotheses (a `window.prompt` fallback, billboards clamped in 2D, SVG data-URI
encoding) were each proposed and ruled out by evidence before the real cause surfaced. The
turning point was the *absence* of a signal: after shipping both error boundaries and a
render-error listener and seeing neither fire, an exception was excluded by elimination, which
narrowed it to "the document went away" and pointed straight at navigation.

## Fix

Portal the modal to `<body>` — which fixes DOM form ownership and native submission — *and*
call `stopPropagation`. The portal alone is not enough: React synthetic events cross portal
boundaries, so the wizard's handler would still run.

## Invariant worth keeping

**A modal rendered from inside a form must not carry its own `<form>` unless it is portalled
out and stops propagation.** The trip wizard wraps every step in one `<form>`, so any dialog
opened from a step is exposed to this. It fails silently in the direction of data loss.

## Kept deliberately

Both diagnostic layers stay, because each is useful independently of this bug:

- `ErrorBoundary` around the map and the trip form (the form's boundary sits *inside*
  `FormProvider`, so `useForm` state survives and "Try again" restores the step). Before this
  there was no boundary anywhere in the app, so any uncaught throw unmounted the entire tree.
- `crashBreadcrumb` + `CrashReportBanner`. `pagehide` fires when a document unloads with JS
  alive and cannot fire when the runtime is killed; combined with the gap to the next boot,
  that separates a navigation from an iOS content-process kill. Capacitor reloads the current
  URL after a kill, so the two are otherwise indistinguishable from the outside — and there is
  no readable console on a TestFlight build.

## Related

- Notes previously reached nothing: see `.scratch/native-map-fixes/issues/10-*`, now shipped.
- Note emblems were invisible on iOS for an unrelated reason (SVG data URIs with no intrinsic
  size — WebKit refuses to decode them); emblems are now painted on a canvas.
