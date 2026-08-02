# 08 — The blue location indicator needs a page refresh to clear after switching sharing off

Status: INSTRUMENTED 2026-08-03 — a failed removal now tells the traveller. Reproduce and read the result.
Priority: high — this is the privacy guarantee, and right now we cannot see whether it held
Surfaced: Slice 02 device matrix test 7, 2026-08-03 (iPhone 16 / iOS 26.4.1, build 25E253 / `9f98dc1`)
Area: `src/services/nativeBackgroundPositionSource.ts` (`removeById`), `src/pages/ActiveTrip.tsx`

## What happens

Switching live sharing to **Off** should remove the native watcher within a second or two, and
iOS should drop the blue location indicator. On device it did eventually clear, but — verbatim —
*"this required a refresh and so took longer than a few seconds, it didn't really respond in a
'live' manner."*

The indicator is the one thing a traveller can trust about whether their phone is still being
asked for its location. If it lingers, either the watcher really was still running (a privacy
failure) or it wasn't and the OS was slow to catch up (a cosmetic one). **Those are very
different bugs and we currently cannot tell them apart**, which is the actual defect to fix
first.

## Why we can't tell

```js
private removeById(id: string): void {
  this.plugin.removeWatcher({ id }).catch(() => {});
}
```

That `.catch(() => {})` was written so a failed teardown could not throw out of a React effect
cleanup — still right. But it also means a **failed removal is indistinguishable from a
successful one**, on the exact path that implements "off collects nothing". The most
safety-relevant operation in the source is its least observable one.

Note the unit suite passes here and always will: it asserts `removeWatcher` was *called*, which
is all a fake plugin can tell us. Whether iOS acted on it is below the seam — precisely the
class of thing the device matrix exists to catch.

## What to build

1. **Make the failure visible first.** Record the outcome of `removeWatcher` — success and
   failure — through the existing `crashBreadcrumb` recorder, which was built for exactly this
   (no console on TestFlight). Keep swallowing the rejection; just stop discarding the fact.
2. **Then reproduce** and read the breadcrumb: did removal report success while the indicator
   stayed up, or did it fail?
3. Only then fix. If removal is failing, likely candidates are a stale id after a restart or a
   race with a concurrent `addWatcher`. If it is succeeding, this is iOS indicator lag and the
   ticket closes as cosmetic with the finding recorded.

Resist skipping to step 3. Issue 06 in the native-map-fixes sweep cost four rounds by guessing
at causes before the evidence existed; the instrument built there is the one to reuse here.

## Acceptance criteria

- [ ] A failed `removeWatcher` is observable on device without a debugger.
- [ ] Reproduced with instrumentation, and the two explanations distinguished in writing.
- [ ] If the watcher was genuinely still running: fixed, and covered by a test at the source's
      boundary.
- [ ] Switching to `off` drops the blue indicator within a couple of seconds, with no refresh.

## Blocked by

- None.
