import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, Mail, Shield, MapPin, Clock, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../config/api';
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
    const es = api.subscribeToEvents(token, {
      onStatus: (data) => {
        setTripLink(prev => prev ? { ...prev, status: data.status, startedAt: data.startedAt ?? prev.startedAt } : prev);
      },
      onCheckin: (data) => {
        setTripLink(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            lastCheckIn: data.timestamp,
            status: prev.status === 'overdue' ? 'active' : prev.status,
            overdueSince: prev.status === 'overdue' ? undefined : prev.overdueSince,
            checkIns: [{ timestamp: data.timestamp, message: data.message, locationW3w: data.locationW3w }, ...prev.checkIns],
          };
        });
      },
      onOverdue: (data) => {
        setTripLink(prev => prev ? { ...prev, status: 'overdue', overdueSince: data.overdueSince } : prev);
      },
    });
    return () => es.close();
  }, [token, !!tripLink]); // eslint-disable-line react-hooks/exhaustive-deps

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
