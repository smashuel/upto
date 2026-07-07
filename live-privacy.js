// Live-location privacy guard — the server-side "enforce by not publishing" gate.
//
// The client already declines to POST for owner-only/off, but the shared capability-token
// SSE stream means a stale or hostile client can't be the only line of defence: the position
// endpoint re-checks the trip's CURRENT stored `liveSharing` on every fix before broadcasting.
// Pure so it can be unit-tested off the DB (see live-privacy.test.js) and reused wherever the
// question "may this position reach watchers?" is asked. See brain/plans/live-location.md.
//
// Only 'with-trip' broadcasts. `undefined`/`null` mean the field predates this feature — those
// legacy trips default to with-trip (their clients never POST, so they stay dark regardless).
// Any other/unrecognised value fails closed: privacy is the safe default.
export function shouldBroadcastPosition(liveSharing) {
  return liveSharing === 'with-trip' || liveSharing == null;
}
