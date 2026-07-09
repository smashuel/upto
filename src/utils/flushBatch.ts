// The pure store-and-forward decision for live location Stage 2 Slice 4. A background sampler
// in the backcountry hits long no-signal stretches; Stage 1 was fire-and-forget, so every
// failed POST was silently dropped and a whole valley vanished from the watcher's view. Fixes
// taken while offline are buffered on-device; on reconnect this decides what to send.
//
// Stage 2 is deliberately LAST-KNOWN-ONLY (no breadcrumb trail — user-confirmed scope), so the
// flush COALESCES the queue to the single most-recent meaningful event rather than replaying the
// buffer. A watcher staring at a stale marker snaps to the traveller's real *current* position
// the moment signal returns — never an hours-old replay. The queue exists for delivery
// reliability, not history. Pure so it's verifiable without a device or a network.
// See .scratch/live-location-stage-2/issues/04-offline-store-and-forward.md.

export interface QueuedFix {
  kind: 'fix';
  lat: number;
  lng: number;
  accuracy: number;
  /** ISO timestamp captured when the fix arrived on the device. */
  timestamp: string;
}

export interface QueuedUnavailable {
  kind: 'unavailable';
  reason?: string;
  timestamp: string;
}

export type QueuedEvent = QueuedFix | QueuedUnavailable;

/**
 * Pure: decide what to POST on flush. Returns an empty batch while offline or when the queue is
 * empty; otherwise coalesces to the single newest event by timestamp (last-known-only). The
 * caller drains the queue of whatever it successfully sends, so a subsequent call over an emptied
 * queue returns nothing (no double-send).
 *
 * `now` (the same device clock that stamped the queued fixes) guards against clock skew: a
 * captured fix is always stamped in the past relative to a later flush, so the only way an event
 * can be future-stamped is a mid-session backward clock jump — an anomaly, not a real newest.
 * We drop it rather than let a bogus future point win the coalesce and masquerade as current,
 * which is exactly the stale/false "current position" the safety contract forbids.
 */
export function nextFlushBatch(queue: QueuedEvent[], now: Date, online: boolean): QueuedEvent[] {
  if (!online) return [];

  const nowMs = now.getTime();
  let newest: QueuedEvent | null = null;
  let newestMs = -Infinity;

  for (const event of queue) {
    const ms = Date.parse(event.timestamp);
    if (Number.isNaN(ms)) continue;
    if (ms > nowMs) continue; // clock-skew guard: never let a future stamp win
    if (ms > newestMs) {
      newest = event;
      newestMs = ms;
    }
  }

  return newest ? [newest] : [];
}
