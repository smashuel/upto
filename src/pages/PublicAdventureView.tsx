import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, Mail, Shield, MapPin, Clock, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../config/api';
import { TripPlanningMap } from '../components/map/TripPlanningMap';
import { applyLifecycleEvent } from '../utils/lifecycleReducer';
import { describeLiveness } from '../utils/liveness';
import type { TripLink, Contact } from '../types/adventure';

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(isoString?: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  planned:   { label: 'Planned',          color: 'oklch(100% 0 0 / 0.75)',  bg: 'oklch(100% 0 0 / 0.12)' },
  active:    { label: 'In progress',      color: 'oklch(82% 0.14 155)',     bg: 'oklch(49% 0.14 155 / 0.20)' },
  overdue:   { label: 'OVERDUE',          color: 'oklch(82% 0.18 25)',      bg: 'oklch(50% 0.20 25 / 0.25)' },
  completed: { label: 'Returned safely',  color: 'oklch(82% 0.14 155)',     bg: 'oklch(49% 0.14 155 / 0.20)' },
} as const;

// ── Main Page ─────────────────────────────────────────────────────────────────

export const PublicAdventureView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [tripLink, setTripLink] = useState<TripLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ticks so liveness ("updated 3m ago" → "paused") recomputes between SSE events.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!token) return;
    api.getTripLink(token)
      .then(data => setTripLink(data))
      .catch(() => setError('TripLink not found or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  // SSE live updates
  useEffect(() => {
    if (!token || !tripLink) return;
    // All three handlers funnel through the shared lifecycle reducer — the rule "trust
    // the server's resulting status; don't re-derive the state machine" lives there now
    // (ADR 012), shared with the owner's ActiveTrip view.
    const es = api.subscribeToEvents(token, {
      onStatus: (data) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'status', status: data.status, startedAt: data.startedAt }) : prev);
      },
      onCheckin: (data) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'checkin', status: data.status, timestamp: data.timestamp, message: data.message, locationW3w: data.locationW3w, lat: data.lat, lng: data.lng }) : prev);
      },
      onOverdue: (data) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'overdue', overdueSince: data.overdueSince }) : prev);
      },
      onPosition: (data) => {
        setTripLink(prev => prev ? applyLifecycleEvent(prev, { kind: 'position', sharing: data.sharing, timestamp: data.timestamp, lat: data.lat, lng: data.lng, accuracy: data.accuracy }) : prev);
      },
    });
    return () => es.close();
  }, [token, !!tripLink]); // intentionally limited — avoid re-subscribing on unrelated state changes

  // ── Loading ──
  if (loading) {
    return (
      <div className="public-view-page">
        <div className="public-view-backdrop" />
        <div className="public-view-scene" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="adventure-spinner" style={{ margin: '0 auto 16px', borderColor: 'oklch(100% 0 0 / 0.2)', borderTopColor: 'white' }} />
            <p style={{ color: 'oklch(100% 0 0 / 0.65)', fontFamily: 'var(--font-ui)', fontSize: '0.9rem' }}>
              Loading trip details…
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error / not found ──
  if (error || !tripLink) {
    return (
      <div className="public-view-page">
        <div className="public-view-backdrop" />
        <div className="public-view-scene" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="public-view-error">
            <AlertTriangle size={40} style={{ color: 'oklch(80% 0.18 25)', marginBottom: 16 }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(1.5rem, 5vw, 2rem)', textTransform: 'uppercase', color: 'white', marginBottom: 10 }}>
              TripLink not found
            </h2>
            <p style={{ color: 'oklch(100% 0 0 / 0.55)', fontFamily: 'var(--font-ui)', maxWidth: '36ch', margin: '0 auto' }}>
              {error || 'This link may have expired or the address is incorrect.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[tripLink.status] ?? STATUS_CONFIG.planned;
  const primaryContact = tripLink.emergencyContacts?.find((c: Contact) => c.isPrimary) ?? tripLink.emergencyContacts?.[0];
  const isOverdue = tripLink.status === 'overdue';

  // Read-only route map: centre on the first route point, else the trip location.
  const routeCenter: [number, number] | undefined =
    tripLink.routes?.[0]?.waypoints?.[0]?.coordinates ??
    (tripLink.location?.coordinates && tripLink.location.coordinates[0] !== 0
      ? tripLink.location.coordinates
      : undefined);
  const hasRoute = (tripLink.routes?.length ?? 0) > 0;
  const lastCheckInCoords = (() => {
    const ci = tripLink.checkIns?.find(c => c.lat != null && c.lng != null);
    return ci ? { lat: ci.lat as number, lng: ci.lng as number } : null;
  })();
  // Live location: honest degradation. Only a fresh/stale fix is placed on the map (greyed
  // when stale); an unavailable/not-shared trip shows no live marker and a qualifying notice
  // so the static check-in pin is never mistaken for a current position.
  const liveness = describeLiveness(tripLink, now);
  const isActive = tripLink.status === 'active' || tripLink.status === 'overdue';
  const liveCoords = (liveness === 'fresh' || liveness === 'stale') && tripLink.livePosition
    ? { lat: tripLink.livePosition.lat, lng: tripLink.livePosition.lng }
    : null;
  // 'not-shared' covers two cases: genuinely off/owner-only (say so) vs with-trip-but-no-fix-yet
  // (say nothing — the traveller has it on, we just don't have a point yet; a false "not
  // enabled" would be its own dishonesty).
  const explicitlyNotShared = tripLink.liveSharing === 'off' || tripLink.liveSharing === 'owner-only';
  const liveNotice: { text: string; tone: 'live' | 'warn' | 'muted' } | null = !isActive
    ? null
    : liveness === 'fresh'
      ? { text: `Live · updated ${timeAgo(tripLink.livePosition!.timestamp)}`, tone: 'live' }
      : liveness === 'stale'
        ? { text: `Live tracking paused — last known ${timeAgo(tripLink.livePosition!.timestamp)}, may not be current`, tone: 'warn' }
        : liveness === 'unavailable'
          ? { text: 'Live tracking unavailable — showing last check-in, which may not be their current location', tone: 'warn' }
          : explicitlyNotShared
            ? { text: 'Live tracking not enabled for this trip — last check-in may not be their current location', tone: 'muted' }
            : null;

  return (
    <div className="public-view-page">
      {/* Full-page backdrop — tints red when overdue */}
      <div className={`public-view-backdrop${isOverdue ? ' is-overdue' : ''}`} />

      <div className="public-view-scene">

        {/* ── Title over landscape ── */}
        <div className="public-view-hero">
          <p className="public-view-eyebrow">
            Trip plan · upto
            {tripLink.activityType && ` · ${tripLink.activityType}`}
          </p>
          <h1 className="public-view-title">{tripLink.title}</h1>
          <span
            className="public-view-status-badge"
            style={{ color: statusCfg.color, background: statusCfg.bg }}
          >
            {tripLink.status === 'active' && <span className="public-view-pulse" />}
            {tripLink.status === 'completed' && <CheckCircle2 size={12} />}
            {statusCfg.label}
          </span>
        </div>

        {/* ── Floating brief card ── */}
        <div className="public-view-brief">

          {/* Overdue banner — top of card */}
          {isOverdue && (
            <div className="public-view-overdue-banner">
              <AlertTriangle size={18} />
              <div>
                <strong>No check-in — overdue since {formatTime(tripLink.overdueSince)}</strong>
                <p style={{ margin: '3px 0 0', fontWeight: 400, fontSize: '0.85rem' }}>
                  If you're concerned for their safety, contact them or call emergency services.
                </p>
              </div>
            </div>
          )}

          <div className="public-view-brief-body">

            {/* ── Primary contact CTA — most prominent element ── */}
            {primaryContact && (
              <div className={`public-view-contact-cta ${isOverdue ? 'is-urgent' : ''}`}>
                <div className="public-view-contact-name">
                  <Shield size={15} />
                  {primaryContact.name}
                  {primaryContact.relationship && (
                    <span style={{ fontWeight: 400, color: 'var(--upto-text-muted)', fontSize: '0.8125rem' }}>
                      {primaryContact.relationship}
                    </span>
                  )}
                </div>
                <div className="public-view-contact-actions">
                  {primaryContact.phone && (
                    <a href={`tel:${primaryContact.phone}`} className={`public-view-call-btn${isOverdue ? ' is-urgent' : ''}`}>
                      <Phone size={15} /> Call
                    </a>
                  )}
                  {primaryContact.email && (
                    <a href={`mailto:${primaryContact.email}`} className="public-view-email-btn">
                      <Mail size={14} /> Email
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* ── Trip details ── */}
            <div className="public-view-details">
              {tripLink.location?.name && (
                <div className="public-view-detail-row">
                  <MapPin size={14} />
                  <span>{tripLink.location.name}</span>
                  {tripLink.location.what3words && (
                    <span className="public-view-w3w">
                      ///{tripLink.location.what3words}
                    </span>
                  )}
                </div>
              )}
              {tripLink.startDate && (
                <div className="public-view-detail-row">
                  <Calendar size={14} />
                  <span>Setting off {formatDateTime(tripLink.startDate)}</span>
                </div>
              )}
              {tripLink.expectedReturnTime && (
                <div className="public-view-detail-row">
                  <Clock size={14} />
                  <span>Expected back by {formatDateTime(tripLink.expectedReturnTime)}</span>
                </div>
              )}
              {tripLink.lastCheckIn && (
                <div className="public-view-detail-row" style={{ color: 'var(--upto-success)' }}>
                  <CheckCircle2 size={14} />
                  <span>Last check-in {timeAgo(tripLink.lastCheckIn)}</span>
                </div>
              )}
            </div>

            {/* ── Planned route map ── */}
            {(hasRoute || routeCenter) && (
              <div className="public-view-section">
                <h2 className="public-view-section-title">Planned route</h2>
                {liveNotice && (
                  <div
                    role="status"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      margin: '0 0 8px', padding: '7px 11px', borderRadius: 9,
                      fontFamily: 'var(--font-ui)', fontSize: '0.82rem', fontWeight: 500,
                      color: liveNotice.tone === 'live' ? 'oklch(45% 0.13 155)'
                        : liveNotice.tone === 'warn' ? 'oklch(50% 0.14 60)'
                        : 'var(--upto-text-muted)',
                      background: liveNotice.tone === 'live' ? 'oklch(90% 0.06 155 / 0.5)'
                        : liveNotice.tone === 'warn' ? 'oklch(92% 0.07 70 / 0.55)'
                        : 'var(--upto-surface-2, rgba(0,0,0,0.04))',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: liveNotice.tone === 'live' ? 'oklch(60% 0.16 155)'
                          : liveNotice.tone === 'warn' ? 'oklch(65% 0.17 60)' : 'oklch(60% 0 0)',
                      }}
                    />
                    {liveNotice.text}
                  </div>
                )}
                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--upto-border, rgba(0,0,0,0.1))' }}>
                  <TripPlanningMap
                    readOnly
                    height="300px"
                    initialMode="2d-topo"
                    plannedBasemap={tripLink.plannedBasemap}
                    // Stable center only — the live marker is framed by the map's own bounds-fit
                    // (Slice 04), not by re-centering the camera on every incoming fix.
                    center={lastCheckInCoords ? [lastCheckInCoords.lat, lastCheckInCoords.lng] : routeCenter}
                    initialRoutes={tripLink.routes ?? []}
                    checkInMarker={lastCheckInCoords}
                    liveMarker={liveCoords}
                    liveMarkerStale={liveness === 'stale'}
                  />
                </div>
              </div>
            )}

            {/* ── Description ── */}
            {tripLink.description && (
              <p className="public-view-description">{tripLink.description}</p>
            )}

            {/* ── Check-in history ── */}
            {tripLink.checkIns?.length > 0 && (
              <div className="public-view-section">
                <h2 className="public-view-section-title">Check-ins</h2>
                <div className="public-view-checkins">
                  {tripLink.checkIns.map((ci, i) => (
                    <div key={i} className="public-view-checkin">
                      <div className="public-view-checkin-time">{formatDateTime(ci.timestamp)}</div>
                      {ci.message && <p className="public-view-checkin-msg">{ci.message}</p>}
                      {ci.locationW3w && (
                        <span className="public-view-w3w">
                          ///{ci.locationW3w}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── All contacts ── */}
            {tripLink.emergencyContacts?.length > 0 && (
              <div className="public-view-section">
                <h2 className="public-view-section-title">Emergency Contacts</h2>
                <div className="public-view-contacts">
                  {tripLink.emergencyContacts.map((contact: Contact) => (
                    <div key={contact.id} className="public-view-contact-row">
                      <div>
                        <span className="public-view-contact-row-name">{contact.name}</span>
                        <span className="public-view-contact-row-rel">{contact.relationship}</span>
                        {contact.isPrimary && <span className="public-view-primary-tag">Primary</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="public-view-email-btn">
                            <Phone size={13} /> Call
                          </a>
                        )}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="public-view-email-btn">
                            <Mail size={13} /> Email
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── Footer ── */}
        <div className="public-view-footer">
          <Shield size={12} />
          Trip safety via <strong style={{ color: 'oklch(100% 0 0 / 0.55)' }}>upto</strong>
        </div>

      </div>
    </div>
  );
};
