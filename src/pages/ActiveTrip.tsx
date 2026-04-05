import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, MapPin, Clock, Share2, Copy, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../config/api';
import { what3wordsService } from '../services/what3words';
import type { TripLink } from '../types/adventure';

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
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleGetLocation = async () => {
    setFetchingLocation(true);
    try {
      const result = await what3wordsService.getCurrentLocationWhat3Words();
      if (result?.words) {
        setLocationW3w(result.words);
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
      });
      onCheckedIn(result.timestamp);
      setOpen(false);
      setMessage('');
      setLocationW3w('');
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

  const now = useNow(30000);

  const shareUrl = shareToken
    ? `${window.location.origin}/triplink/${shareToken}`
    : '';

  // Load from localStorage fallback (trip was just created, backend confirmed)
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('triplinks') || '[]');
    const found = stored.find((t: TripLink) => t.id === tripLinkId);
    if (found) {
      setTripLink(found);
      setLastCheckIn(found.lastCheckIn || null);
    }
    setLoading(false);
  }, [tripLinkId]);

  const handleCheckedIn = useCallback((timestamp: string) => {
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
      toast.success("Trip complete — glad you made it back safely!");
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

  // Timing
  const startedAt = tripLink?.startedAt ? new Date(tripLink.startedAt) : null;
  const expectedReturn = tripLink?.expectedReturnTime ? new Date(tripLink.expectedReturnTime) : null;
  const elapsedMs = startedAt ? now.getTime() - startedAt.getTime() : null;
  const remainingMs = expectedReturn ? expectedReturn.getTime() - now.getTime() : null;
  const isNearReturn = remainingMs !== null && remainingMs > 0 && remainingMs < 30 * 60 * 1000;
  const isOverdue = remainingMs !== null && remainingMs < 0;

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

        {/* ── Overdue banner ── */}
        {isOverdue && (
          <div className="active-trip-overdue-banner">
            <Clock size={18} />
            Overdue by {formatDuration(Math.abs(remainingMs!))} — check in now
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
            {completing ? 'Completing…' : 'I\'m back — Complete Trip'}
          </button>
          <p className="create-submit-hint" style={{ textAlign: 'center', marginTop: 8 }}>
            This will notify your watchers that you returned safely.
          </p>
        </div>

      </div>
    </div>
  );
};
