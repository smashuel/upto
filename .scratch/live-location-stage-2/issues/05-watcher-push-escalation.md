# Slice 5 — Watcher push escalation on overdue

Status: ready-for-agent
Parent: [.scratch/live-location-stage-2/PRD.md](../PRD.md)
Covers user stories: 15, 16, 26

## What to build

Add a native escalation channel: when a trip goes overdue, watchers who have the native app
installed and notifications granted receive a **push** on their lock screen, *alongside* the
existing overdue email. ADR 011 flagged Capacitor push as the candidate native escalation
channel — this builds it, watcher-only.

Wire Capacitor Push Notifications: an app user (traveller or watcher) who opens the app
registers a device token; the backend associates tokens with the user and, for watchers, with
the trips they watch (reusing the existing account/contact model, not a new identity path).
The **existing 60s overdue trigger** in the notification module now *also* dispatches a push to
watchers with registered tokens — one escalation event, two transports (push + email). Do not
open a parallel escalation path.

Coverage is honest by design: push reaches watchers who installed the app and granted
notifications; **email stays the universal channel** for everyone else (a watcher with only a
share link in a browser gets no push, and that's expected — never a regression in who gets
alerted). Traveller-directed push (check-in reminders, "you're overdue, tap to extend") is out
of scope — that's the roadmap's check-in-reminder fast-follow.

This slice needs only the shell (Slice 1) for registration and is independent of the
background-location work (Slices 2–4) — it can run in parallel.

## Implementation notes (from skill review 2026-07-09)

- **Plugin:** `@capacitor/push-notifications` (APNs on iOS, FCM on Android). The overdue push
  is a **visible alert** notification, so the plugin's caveats *"iOS does not support
  silent/background push"* and *"Android won't fire callbacks for data-only notifications when
  killed"* do **not** bite here — we're not using push to wake the app or resume tracking, only
  to alert a watcher. Good: keeps push off the background-reliability critical path.
- **Apple split (matters given the pending Apple account):** the **Android/FCM half is not
  Apple-blocked** — token registration + `google-services.json` + backend FCM dispatch can be
  built and (with a device) verified now. The **iOS half needs an APNs auth key from the Apple
  Developer account** and the Push Notifications capability in Xcode, so it batches with the
  Codemagic/TestFlight iOS-enablement pass. Build FCM first; APNs follows the account.
- **Android 13+** needs the `POST_NOTIFICATIONS` runtime permission
  (`checkPermissions()` / `requestPermissions()`) before tokens deliver notifications.
- **Backend:** associate device tokens with the user (and, for watchers, watched trips) reusing
  the existing account/contact model; the existing 60s overdue trigger in `notifications.js`
  gains a push dispatch **alongside** the email — one event, two transports. APNs/FCM secrets
  stay server-side (never committed), same rule as `deploy.sh`.

## Acceptance criteria

- [ ] Capacitor Push Notifications wired; app users register a device token, associated with
      the user and (for watchers) the trips they watch.
- [ ] The existing overdue trigger dispatches a push to watchers with registered tokens *in
      addition to* the overdue email — reusing the notification module, not a parallel path.
- [ ] A watcher with the app + notifications granted receives an overdue push on their lock
      screen while the overdue email still arrives (verified end-to-end on a real device).
- [ ] A watcher without the app still receives the overdue email — push is strictly additive,
      no regression in alert coverage.
- [ ] Push credentials/setup (APNs / FCM) documented for the deployment runbook; secrets kept
      server-side (never committed), consistent with existing env-var handling.

## Blocked by

- Slice 1 (01-capacitor-shell-and-source-seam) — needs the shell for push registration. Independent
  of Slices 2–4; can run in parallel.
