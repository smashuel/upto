// shouldRetractOnHide — whether a hidden document means "tell watchers tracking has stopped".
// Live location Stage 2 Slice 2.
//
// Stage 1 sent a `sharing: 'unavailable'` beacon on `pagehide`, which was right for the web:
// the tab is going away and the timer that produces fixes dies with it, so saying so is honest
// degradation rather than letting a stale point masquerade as current.
//
// The native shell breaks that assumption. `pagehide` fires there when the app is merely
// backgrounded — the phone going into a pocket, which is the *normal* state of a real trip and
// precisely when the background watcher takes over. Retracting then would report "paused, last
// known N min ago" about a traveller being tracked perfectly well: a false alarm on the most
// common state there is, and Slice 2's whole promise undone at the final step.

import type { Platform } from './positionSource.ts';

export type LiveSharing = 'with-trip' | 'owner-only' | 'off';

/**
 * Pure: should hiding the document retract the live position?
 *
 * Only when the web is publishing. `owner-only` and `off` are not publishing anything a watcher
 * can see, so there is nothing to retract; native keeps producing fixes while hidden, so
 * retracting would be a lie.
 */
export function shouldRetractOnHide(platform: Platform, sharing: LiveSharing): boolean {
  if (sharing !== 'with-trip') return false;
  return platform === 'web';
}
