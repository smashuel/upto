---
type: journal
date: 2026-07-31
related: [.scratch/native-map-fixes/README.md, brain/plans/live-location.md, brain/decisions/018-one-route-per-triplink.md, brain/journal/2026-07-31-note-crash-nested-form.md]
tags: [capacitor, ios, testing, map, live-gps, phase-2]
---

# The first real-device run found eleven defects a green suite had passed

Live-location Stage 2, Slice 01 (Capacitor shell) reached a real iPhone via TestFlight today and
closed. The slice itself went fine. The interesting result is what the device found.

## What happened

The build that installed on the phone had passed `tsc --noEmit`, `npm run lint`, and the full
suite (145 node-test + 52 vitest) — verified on the committed tree in isolation, not just the
working directory. Driving it on an actual phone surfaced **eleven** distinct defects. All are
now closed; the index is [.scratch/native-map-fixes/](../../.scratch/native-map-fixes/README.md).

Severity was not evenly spread:

- **One data-loss bug.** Placing a note on the map wiped the entire in-progress trip plan.
- **Six rendering / interaction defects** — satellite and 3D terrain not rendering natively, an
  uneven 2D LOD split across the viewport, gestures escaping the map into the wizard, a cramped
  embedded map, sluggish pan/zoom, and controls that were unclear or unreachable behind the notch.
- **Two product gaps** that were never bugs: map notes were purely ephemeral (nobody could ever
  receive one), and nothing stopped several routes being drawn on one TripLink.
- **Two UX simplifications** the user asked for once they were holding the thing.

## Why none of it was catchable off-device

Worth being precise, because "write more tests" is the wrong lesson here.

- **The rendering defects were WebKit-specific.** SVG data URIs without intrinsic `width`/`height`
  decode fine in desktop Chrome and are *refused* by WebKit — so a note emblem that worked
  everywhere in development rendered as bare text on the phone.
- **The LOD split came from a scene-mode difference** (`EllipsoidTerrainProvider` in 2D has
  negligible geometric error, so the quadtree stops refining several levels earlier than 3D's
  world terrain). Correct in every environment; visibly wrong only on a real screen.
- **The safe-area problems needed a notch.** `env(safe-area-inset-*)` reports 0 until the view
  settles inside the Capacitor WebView, which is how a Done button ended up visible but not
  reliably tappable.
- **The two product gaps needed a user, not a device.** They surfaced because someone was
  actually trying to plan a trip and expected a recipient to be able to read their note.

## The one that cost the most

The note crash took four rounds. Three plausible Cesium-side hypotheses got chased first — and
the actual cause was a nested `<form>`: `NoteModal` rendered a `<form>` inside the wizard's
`<form>`, so submitting a note also ran the wizard's `handleSubmit`, which navigates away when
there's no session. Full write-up: [2026-07-31-note-crash-nested-form.md](2026-07-31-note-crash-nested-form.md).

**The transferable lesson is about evidence, not about forms.** Nothing ever threw. The error
boundary stayed silent, `scene.renderError` stayed silent. Once both catchers were shipped and
*neither fired*, the absence of a signal became the evidence: an exception was excluded, which
left "the document went away" and pointed straight at navigation. Three rounds were spent
guessing before the absence was treated as information.

## What changed as a result

- **On-device time is the gate for every remaining Stage 2 slice**, not a formality after the
  suite goes green. The Slice 2 PRD already said "a green unit suite is necessary but not
  sufficient" — this run is the observed proof of it in this codebase.
- **Two diagnostics were kept after their bug was fixed**, because they earn their place
  independently: the map error boundaries bound the blast radius of any future throw, and the
  crash breadcrumb distinguishes a lost document from a killed runtime. On TestFlight there is
  no console to read, so an iOS content-process kill is otherwise unobservable.
- **Two decisions came out of it** rather than patches: notes are TripLink data
  ([issue 10](../../.scratch/native-map-fixes/issues/10-map-notes-not-persisted.md)) and a
  TripLink holds exactly one route ([ADR 018](../decisions/018-one-route-per-triplink.md)).

## Carried forward

Drag-to-edit a route point still doesn't work on touch — the Edit control is hidden there rather
than fixed, so redrawing is the whole mobile editing story. Deferred deliberately: the real fix
needs a touch handler that claims the gesture before Cesium's camera controller sees it, which is
gesture-priority work, not a tweak.
