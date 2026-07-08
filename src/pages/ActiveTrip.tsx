import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Check, MapPin, Clock, Share2, Copy, CheckCircle2, Shield, MessageSquare, Mail, Star, CheckCheck, Radio, Users, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../config/api';
import { what3wordsService } from '../services/what3words';
import { TripPlanningMap } from '../components/map/TripPlanningMap';
import { applyLifecycleEvent } from '../utils/lifecycleReducer';
import { LIVE_STALE_MS } from '../utils/liveness';
import { selectPositionSource, createPositionSource, detectPlatform } from '../services/positionSource';
import type { TripLink } from '../types/adventure';

// How often this device samples + reports its position (live location Stage 1). Coarse by
// design — battery matters on a phone in the backcountry. See brain/plans/live-location.md.
const LIVE_SAMPLE_INTERVAL_MS = 3 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalMins = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ── Check-in panel (inline, not a modal) ─────────────────────────────────────

interface CheckInPanelProps {
  shareToken: string;
  onCheckedIn: (timestamp: string) => void;
}

const CheckInPanel: React.FC<CheckInPanelProps> = ({ shareToken, onCheckedIn }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [locationW3w, setLocationW3w] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleGetLocation = async () => {
    setFetchingLocation(true);
    try {
      const result = await what3wordsService.getCurrentLocationWhat3Words();
      if (result?.coordinates) {
        // Capture coords for the map pin; w3w is a nice-to-have on top.
        setCoords({ lat: result.coordinates.lat, lng: result.coordinates.lng });
        if (result.words) setLocationW3w(result.words);
      } else {
        toast.error('Could not get location');
      }
    } catch {
      toast.error('Location unavailable');
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await api.checkIn(shareToken, {
        message: message.trim() || undefined,
        locationW3w: locationW3w.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      });
      onCheckedIn(result.timestamp);
      setOpen(false);
      setMessage('');
      setLocationW3w('');
      setCoords(null);
      toast.success("Checked in — your watchers can see you're safe");
    } catch {
      toast.error('Check-in failed — try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        className="active-trip-checkin-btn"
        onClick={() => setOpen(true)}
      >
        <CheckCircle2 size={22} />
        I'm OK — Check In
      </button>
    );
  }

  return (
    <div className="active-trip-checkin-panel">
      <p className="active-trip-checkin-label">Optional: add a note or location</p>

      <textarea
        className="create-input create-textarea"
        placeholder="All good, just passed the hut…"
        rows={2}
        value={message}
        onChange={e => setMessage(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          className="create-input"
          placeholder="what3words location (optional)"
          value={locationW3w}
          onChange={e => setLocationW3w(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="active-trip-action-btn"
          onClick={handleGetLocation}
          disabled={fetchingLocation}
          title="Get current location"
        >
          <MapPin size={16} />
          {fetchingLocation ? '…' : 'Locate'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="create-submit"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          <Check size={16} />
          {submitting ? 'Sending…' : 'Confirm Check-in'}
        </button>
        <button
          type="button"
          className="active-trip-action-btn"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ── Live-sharing control (Slice 03) ──────────────────────────────────────────
// The persistent consent surface: a three-way toggle that doubles as the "you are
// broadcasting" indicator, so the traveller always knows who can see them. Mutable mid-trip.

type LiveSharing = 'with-trip' | 'owner-only' | 'off';

interface LiveSharingControlProps {
  value: LiveSharing;
  denied: boolean;
  onChange: (next: LiveSharing) => void;
}

const SHARING_OPTIONS: { value: LiveSharing; label: string; icon: React.ReactNode }[] = [
  { value: 'with-trip', label: 'Watchers', icon: <Radio size={14} /> },
  { value: 'owner-only', label: 'Only me', icon: <Users size={14} /> },
  { value: 'off', label: 'Off', icon: <EyeOff size={14} /> },
];

const LiveSharingControl: React.FC<LiveSharingControlProps> = ({ value, denied, onChange }) => {
  // Status line — honest about what each mode means for watchers. Denial only matters while
  // broadcasting (owner-only/off aren't publishing anything to be denied).
  const status: { dot: string; text: string } =
    value === 'with-trip'
      ? denied
        ? { dot: 'var(--upto-danger, oklch(60% 0.18 25))', text: 'Location access denied — watchers see your last check-in only. Enable location for this site to share live.' }
        : { dot: '#2563eb', text: 'Sharing your live location with watchers.' }
      : value === 'owner-only'
        ? { dot: 'var(--upto-text-muted)', text: 'Only you can see your live location — watchers see your last check-in only.' }
        : { dot: 'var(--upto-text-muted)', text: 'Live location off — watchers see your last check-in only.' };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <MapPin size={14} style={{ color: 'var(--upto-text-muted)' }} />
        <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--upto-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
          Live location
        </h2>
      </div>
      <div role="radiogroup" aria-label="Who can see your live location" style={{ display: 'flex', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden' }}>
        {SHARING_OPTIONS.map(opt => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 8px',
                fontFamily: 'var(--font-ui)', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer', border: 'none',
                background: active ? 'var(--upto-primary)' : 'white',
                color: active ? 'white' : 'var(--upto-text-secondary)',
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
      <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--upto-text-secondary)', marginTop: 8, marginBottom: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.dot, flexShrink: 0 }} />
        {status.text}
      </p>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const ActiveTrip: React.FC = () => {
  const { tripLinkId } = useParams<{ tripLinkId: string }>();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('token') || '';

  const [tripLink, setTripLink] = useState<TripLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Live-location privacy (Slice 03). Who sees this device's position, mutable mid-trip.
  // Default with-trip (safe common case); synced from the stored TripLink once loaded.
  const [liveSharing, setSharingState] = useState<'with-trip' | 'owner-only' | 'off'>('with-trip');
  // The device's own freshest fix, rendered on the owner's map regardless of sharing (it's
  // their own location). For owner-only this is the ONLY source — nothing is POSTed.
  const [ownPosition, setOwnPosition] = useState<{ lat: number; lng: number; timestamp: string } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const now = useNow(30000);

  const shareUrl = shareToken
    ? `${window.location.origin}/triplink/${shareToken}`
    : '';

  // Prefer the backend's current state (it reflects who got notified on Start),
  // fall back to localStorage if offline.
  useEffect(() => {
    let cancelled = false;
    const localFallback = () => {
      const stored = JSON.parse(localStorage.getItem('triplinks') || '[]');
      const found = stored.find((t: TripLink) => t.id === tripLinkId);
      if (found) {
        setTripLink(found);
        setLastCheckIn(found.lastCheckIn || null);
        setSharingState(found.liveSharing ?? 'with-trip');
      }
    };
    if (shareToken) {
      api.getTripLink(shareToken)
        .then(t => {
          if (cancelled) return;
          setTripLink(t);
          setLastCheckIn(t.lastCheckIn || null);
          setSharingState(t.liveSharing ?? 'with-trip');
        })
        .catch(() => { if (!cancelled) localFallback(); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      localFallback();
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [tripLinkId, shareToken]);

  // Live lifecycle updates — same SSE stream the watcher view trusts. Every event runs
  // through the shared reducer, so the owner's status (and the overdue banner driven off
  // it) always agrees with what watchers see, and the banner clears the instant the
  // traveller checks in. No status re-derivation here — that rule lives in the reducer.
  useEffect(() => {
    if (!shareToken || !tripLink) return;
    const es = api.subscribeToEvents(shareToken, {
      onStatus: (d) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'status', status: d.status, startedAt: d.startedAt }) : prev);
      },
      onCheckin: (d) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'checkin', status: d.status, timestamp: d.timestamp, message: d.message, locationW3w: d.locationW3w, lat: d.lat, lng: d.lng }) : prev);
        setLastCheckIn(d.timestamp);
      },
      onOverdue: (d) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'overdue', overdueSince: d.overdueSince }) : prev);
      },
      onPosition: (d) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'position', sharing: d.sharing, timestamp: d.timestamp, lat: d.lat, lng: d.lng, accuracy: d.accuracy }) : prev);
      },
    });
    return () => es.close();
  }, [shareToken, !!tripLink]); // intentionally limited — avoid re-subscribing on unrelated state changes

  // Live location: while the trip is active/overdue, sample this device's position through a
  // PositionSource (Stage 2 Slice 1 seam) — foreground web today, native background in Slice 2.
  // Coarse by design (battery): a ~3-min getCurrentPosition, not a continuous watchPosition.
  // Privacy is enforced HERE by NOT publishing (Slice 03): 'off' doesn't sample at all;
  // 'owner-only' samples for the owner's own map but never POSTs; 'with-trip' POSTs so the
  // server broadcasts to watchers. The source is a fix producer only — this policy stays in the
  // consumer, so swapping the source (Slice 2) leaves it untouched. Starting the source only
  // inside this effect keeps the permission prompt contextual (fires when the trip is live and
  // sharing is on — never a cold prompt on load).
  useEffect(() => {
    if (!shareToken) return;
    const status = tripLink?.status;
    if (status !== 'active' && status !== 'overdue') return;
    if (liveSharing === 'off') return; // enforced: never sample when sharing is off

    const source = createPositionSource(
      selectPositionSource(detectPlatform()),
      { intervalMs: LIVE_SAMPLE_INTERVAL_MS },
    );
    if (!source) return; // environment can't supply positions (SSR / unsupported browser)

    source.start({
      onFix: (fix) => {
        setLocationDenied(false);
        // Always keep the owner's own marker current — it's their device's truth.
        setOwnPosition({ lat: fix.lat, lng: fix.lng, timestamp: fix.timestamp });
        if (liveSharing !== 'with-trip') return; // owner-only: render locally, never POST
        api.reportPosition(shareToken, {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          sharing: 'live',
        }).catch(() => {}); // fire-and-forget — a dropped sample is caught by the next tick
      },
      onUnavailable: (reason) => {
        if (reason === 'denied') setLocationDenied(true);
        if (liveSharing !== 'with-trip') return; // owner-only/off never signal watchers
        // Permission denied or fix failed — tell watchers tracking is unavailable so the
        // last-known point isn't shown as current (honest degradation).
        api.reportPosition(shareToken, { sharing: 'unavailable' }).catch(() => {});
      },
    });
    // Best-effort "tracking stopped" beacon when the page is closed/hidden — the one
    // transport that survives unload. Staleness is the floor if it doesn't land. Only meaningful
    // while broadcasting; owner-only/off aren't publishing anything to retract.
    const onHide = () => { if (liveSharing === 'with-trip') api.beaconPositionUnavailable(shareToken); };
    window.addEventListener('pagehide', onHide);
    return () => {
      source.stop();
      window.removeEventListener('pagehide', onHide);
    };
  }, [shareToken, tripLink?.status, liveSharing]);

  // Toggle who sees the live position, mid-trip. Optimistic + persisted. When leaving
  // with-trip, immediately tell watchers to stop showing the live point (they don't learn the
  // new liveSharing until they reload, so an explicit 'unavailable' keeps them honest now).
  const handleSetSharing = useCallback(async (next: 'with-trip' | 'owner-only' | 'off') => {
    if (!shareToken) return;
    const prev = liveSharing;
    if (next === prev) return;
    setSharingState(next);
    if (prev === 'with-trip' && next !== 'with-trip') {
      api.reportPosition(shareToken, { sharing: 'unavailable' }).catch(() => {});
    }
    try {
      await api.setLiveSharing(shareToken, next);
    } catch {
      setSharingState(prev); // rollback on failure
      toast.error('Could not update live sharing');
    }
  }, [shareToken, liveSharing]);

  const handleCheckedIn = useCallback((timestamp: string) => {
    // Optimistic — the SSE echo reconciles authoritative status; the reducer dedups it.
    setLastCheckIn(timestamp);
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast.success('Link copied');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast.error('Could not copy');
    }
  };

  const handleComplete = async () => {
    if (!shareToken) return;
    setCompleting(true);
    try {
      await api.completeTrip(shareToken);
      // Optimistic — route through the reducer so the overdueSince-iff-overdue invariant
      // holds (completing straight from overdue must clear a stale overdueSince).
      setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'status', status: 'completed' }) : prev);
    } catch {
      toast.error('Could not mark complete — try again');
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="create-page">
        <div className="create-container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <div className="adventure-spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--upto-text-muted)', fontFamily: 'var(--font-ui)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  // ── Completed state ───────────────────────────────────────────────────────────
  if (tripLink?.status === 'completed') {
    const startedAt = tripLink.startedAt ? new Date(tripLink.startedAt) : null;
    const completedMs = startedAt ? Date.now() - startedAt.getTime() : null;
    return (
      <div className="create-page">
        <div className="create-container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'oklch(49% 0.14 155 / 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <CheckCheck size={36} style={{ color: 'var(--upto-success)' }} />
          </div>

          <h1 className="create-title" style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', marginBottom: 8 }}>
            Trip complete
          </h1>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '1.1rem', color: 'var(--upto-text-secondary)', marginBottom: 4 }}>
            Glad you're back safely.
          </p>
          {tripLink.title && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.9rem', color: 'var(--upto-text-muted)', marginBottom: 32 }}>
              {tripLink.title}
              {completedMs ? ` · ${formatDuration(completedMs)}` : ''}
            </p>
          )}

          {tripLink.emergencyContacts && tripLink.emergencyContacts.length > 0 && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', color: 'var(--upto-text-secondary)', marginBottom: 32, maxWidth: 320, margin: '0 auto 32px' }}>
              Your {tripLink.emergencyContacts.length} watcher{tripLink.emergencyContacts.length === 1 ? '' : 's'} can see you're back — no further alerts will be sent.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, margin: '0 auto' }}>
            <Link
              to="/trips"
              className="create-submit"
              style={{ justifyContent: 'center', textDecoration: 'none' }}
            >
              View my trips
            </Link>
            <Link
              to="/create"
              className="active-trip-action-btn"
              style={{ justifyContent: 'center', textDecoration: 'none' }}
            >
              Plan another trip
            </Link>
          </div>

          <p style={{
            fontFamily: 'var(--font-ui)', fontSize: '0.78rem',
            color: 'var(--upto-text-muted)', marginTop: 40,
          }}>
            Strava sync coming soon — your trip data will be waiting.
          </p>
        </div>
      </div>
    );
  }

  // ── Active / overdue state ─────────────────────────────────────────────────
  // Read-only route map: centre on the first route point, else the trip location.
  const routeCenter: [number, number] | undefined =
    tripLink?.routes?.[0]?.waypoints?.[0]?.coordinates ??
    (tripLink?.location?.coordinates && tripLink.location.coordinates[0] !== 0
      ? tripLink.location.coordinates
      : undefined);
  const hasRoute = (tripLink?.routes?.length ?? 0) > 0;
  // Most recent check-in that shared coordinates → map pin.
  const lastCheckInCoords = (() => {
    const ci = tripLink?.checkIns?.find(c => c.lat != null && c.lng != null);
    return ci ? { lat: ci.lat as number, lng: ci.lng as number } : null;
  })();
  // Live location: the traveller's own current position (from this device's sampling loop), so
  // they can confirm tracking is working. Shown for with-trip and owner-only alike — it's their
  // own location — and hidden only when sharing is off. Greyed when the last fix has gone stale.
  const ownFixAgeMs = ownPosition ? now.getTime() - Date.parse(ownPosition.timestamp) : null;
  const ownFixStale = ownFixAgeMs != null && ownFixAgeMs >= LIVE_STALE_MS;
  const liveCoords = liveSharing !== 'off' && ownPosition
    ? { lat: ownPosition.lat, lng: ownPosition.lng }
    : null;

  // Timing
  const startedAt = tripLink?.startedAt ? new Date(tripLink.startedAt) : null;
  const expectedReturn = tripLink?.expectedReturnTime ? new Date(tripLink.expectedReturnTime) : null;
  const elapsedMs = startedAt ? now.getTime() - startedAt.getTime() : null;
  const remainingMs = expectedReturn ? expectedReturn.getTime() - now.getTime() : null;
  const isNearReturn = remainingMs !== null && remainingMs > 0 && remainingMs < 30 * 60 * 1000;
  // Overdue is the server's call (lifecycle status, 15-min grace) — never local time-math,
  // so the owner agrees with the watcher and the banner clears live on check-in. The clock
  // above is kept only for the duration labels.
  const isOverdue = tripLink?.status === 'overdue';

  return (
    <div className="create-page">
      <div className="create-container" style={{ paddingTop: 48 }}>

        {/* ── Title ── */}
        <div style={{ marginBottom: 32 }}>
          <h1 className="create-title" style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}>
            {tripLink?.title || 'Active Trip'}
          </h1>
          {tripLink?.activityType && (
            <span className="activity-pill is-selected" style={{ marginTop: 8 }}>
              {tripLink.activityType}
            </span>
          )}
        </div>

        {/* ── Route overview map ── */}
        {(hasRoute || routeCenter) && (
          <div style={{ marginBottom: 24, borderRadius: 12, overflow: 'hidden', border: '1.5px solid var(--upto-border)' }}>
            <TripPlanningMap
              readOnly
              height="320px"
              initialMode="2d-topo"
              plannedBasemap={tripLink?.plannedBasemap}
              // Stable center only — the live marker is framed by the map's own bounds-fit
              // (Slice 04), not by re-centering on every fix.
              center={lastCheckInCoords ? [lastCheckInCoords.lat, lastCheckInCoords.lng] : routeCenter}
              initialRoutes={tripLink?.routes ?? []}
              checkInMarker={lastCheckInCoords}
              liveMarker={liveCoords}
              liveMarkerStale={ownFixStale}
            />
          </div>
        )}

        {/* ── Live-location sharing control ── */}
        <LiveSharingControl value={liveSharing} denied={locationDenied} onChange={handleSetSharing} />

        {/* ── Overdue banner ── */}
        {isOverdue && (
          <div className="active-trip-overdue-banner">
            <Clock size={18} />
            {remainingMs !== null && remainingMs < 0
              ? `Overdue by ${formatDuration(Math.abs(remainingMs))} — check in now`
              : 'Overdue — check in now'}
          </div>
        )}

        {/* ── Near-return nudge ── */}
        {isNearReturn && !isOverdue && (
          <div className="active-trip-nudge">
            <Clock size={16} />
            {formatDuration(remainingMs!)} until expected return — check in soon
          </div>
        )}

        {/* ── Timing strip ── */}
        <div className="active-trip-timing">
          {elapsedMs !== null && (
            <div className="active-trip-stat">
              <span className="active-trip-stat-value">{formatDuration(elapsedMs)}</span>
              <span className="active-trip-stat-label">elapsed</span>
            </div>
          )}
          {expectedReturn && (
            <div className="active-trip-stat">
              <span className="active-trip-stat-value">
                {expectedReturn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="active-trip-stat-label">back by</span>
            </div>
          )}
          {lastCheckIn && (
            <div className="active-trip-stat">
              <span className="active-trip-stat-value">
                {new Date(lastCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="active-trip-stat-label">last check-in</span>
            </div>
          )}
        </div>

        {/* ── Watchers panel — who got the Start notification ── */}
        {tripLink?.emergencyContacts && tripLink.emergencyContacts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={14} style={{ color: 'var(--upto-danger, oklch(60% 0.18 25))' }} />
              <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--upto-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                Watchers notified
              </h2>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              border: '1.5px solid var(--upto-border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              {tripLink.emergencyContacts.map(c => {
                const channels = [];
                if (c.phone) channels.push(<span key="sms" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', color: 'var(--upto-text-muted)' }}><MessageSquare size={11} />SMS</span>);
                if (c.email && !c.phone) channels.push(<span key="email" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', color: 'var(--upto-text-muted)' }}><Mail size={11} />Email</span>);
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '10px 14px', background: 'white',
                    borderBottom: '1px solid var(--upto-border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--upto-text)' }}>
                          {c.name}
                        </span>
                        {c.relationship && (
                          <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.78rem', color: 'var(--upto-text-muted)' }}>
                            {c.relationship}
                          </span>
                        )}
                        {c.isPrimary && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-ui)', fontSize: '0.68rem', fontWeight: 600, color: 'var(--upto-success)', background: 'oklch(49% 0.14 155 / 0.12)', borderRadius: 4, padding: '1px 6px' }}>
                            <Star size={9} />Primary
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                      {channels}
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: 'var(--upto-text-muted)', marginTop: 6, marginBottom: 0 }}>
              Notified when you started. They'll get an alert if you go overdue.
            </p>
          </div>
        )}

        {/* ── Check-in ── */}
        {shareToken && (
          <CheckInPanel shareToken={shareToken} onCheckedIn={handleCheckedIn} />
        )}

        {/* ── Share link reminder ── */}
        {shareUrl && (
          <div className="active-trip-share">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Share2 size={15} style={{ color: 'var(--upto-text-muted)', flexShrink: 0 }} />
              <span className="active-trip-share-label">Watchers link</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="create-success-url input"
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.8125rem',
                  color: 'var(--upto-text-secondary)',
                  background: 'var(--upto-surface-raised)',
                  border: '1.5px solid var(--upto-border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                className="create-success-copy"
                style={{ background: copiedLink ? 'var(--upto-success)' : 'var(--upto-primary)' }}
                onClick={handleCopyLink}
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* ── Complete trip ── */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--upto-border)' }}>
          <button
            type="button"
            className="create-success-preview"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleComplete}
            disabled={completing}
          >
            {completing ? 'Completing…' : "I'm back — Complete Trip"}
          </button>
        </div>

      </div>
    </div>
  );
};
