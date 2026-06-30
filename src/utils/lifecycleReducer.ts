// The one seam where the client applies a TripLink lifecycle SSE event to local state.
//
// Pure: no React, no EventSource. Both the owner view (ActiveTrip) and the watcher view
// (PublicAdventureView) funnel their SSE handlers through here so the rule "trust the
// server's resulting status; never re-derive the state machine on the client" lives in
// exactly one tested place (see ADR 012 — the lifecycle module puts `status` on the wire,
// the client must not infer transitions itself).
//
// `import type` keeps this runtime-free of the types layer so `node --test
// --experimental-strip-types` can load it directly.
import type { TripLink, CheckIn } from '../types/adventure.ts';

/** An SSE lifecycle event, already normalised from its EventSource payload. */
export type LifecycleEvent =
  | { kind: 'status'; status: TripLink['status']; startedAt?: string }
  | {
      kind: 'checkin';
      status?: TripLink['status'];
      timestamp: string;
      message?: string;
      locationW3w?: string;
      lat?: number;
      lng?: number;
    }
  | { kind: 'overdue'; overdueSince: string };

function checkInFromEvent(e: Extract<LifecycleEvent, { kind: 'checkin' }>): CheckIn {
  return {
    timestamp: e.timestamp,
    message: e.message,
    locationW3w: e.locationW3w,
    lat: e.lat,
    lng: e.lng,
  };
}

// Invariant the reducer maintains: `overdueSince` is set iff `status === 'overdue'`.
export function applyLifecycleEvent(prev: TripLink, event: LifecycleEvent): TripLink {
  switch (event.kind) {
    case 'status':
      return {
        ...prev,
        status: event.status,
        startedAt: event.startedAt ?? prev.startedAt,
        overdueSince: event.status === 'overdue' ? prev.overdueSince : undefined,
      };

    case 'overdue':
      return { ...prev, status: 'overdue', overdueSince: event.overdueSince };

    case 'checkin': {
      // Trust the server's resulting status; `?? prev.status` only guards the deploy gap
      // where an old backend's broadcast predates status-on-the-wire.
      const status = event.status ?? prev.status;
      // The originating tab also receives its own broadcast — dedup by timestamp so an
      // optimistically-shown check-in is not counted twice.
      const alreadyPresent = prev.checkIns.some(c => c.timestamp === event.timestamp);
      return {
        ...prev,
        lastCheckIn: event.timestamp,
        status,
        overdueSince: status === 'overdue' ? prev.overdueSince : undefined,
        checkIns: alreadyPresent
          ? prev.checkIns
          : [checkInFromEvent(event), ...prev.checkIns],
      };
    }
  }
}
