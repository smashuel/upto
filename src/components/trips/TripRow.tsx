import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Users, ChevronRight, Mountain, Bike, Waves, Snowflake, Footprints, Activity } from 'lucide-react';
import type { TripSummary, TripStatus } from '../../config/api';

// ── Status presentation ─────────────────────────────────────────────────────
const STATUS_META: Record<TripStatus, { label: string; fg: string; bg: string }> = {
  overdue:   { label: 'Overdue',   fg: '#b3261e', bg: '#fdecea' },
  active:    { label: 'Active',    fg: '#2f6f4f', bg: 'oklch(49% 0.14 155 / 0.12)' },
  planned:   { label: 'Planned',   fg: '#5a6b7a', bg: 'oklch(60% 0.04 250 / 0.14)' },
  completed: { label: 'Completed', fg: '#7a857d', bg: 'oklch(60% 0.01 160 / 0.14)' },
};

const ACTIVITY_ICON: Record<string, typeof Mountain> = {
  hiking: Footprints,
  climbing: Mountain,
  skiing: Snowflake,
  cycling: Bike,
  kayaking: Waves,
};

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Where a trip row navigates, by status. */
function destination(trip: TripSummary): string {
  // Active/overdue/planned all open the creator view (which handles each state);
  // completed opens the same page in its completed layout.
  return `/my-trip/${trip.id}?token=${trip.shareToken}`;
}

interface TripRowProps {
  trip: TripSummary;
}

export const TripRow: React.FC<TripRowProps> = ({ trip }) => {
  const navigate = useNavigate();
  const status = STATUS_META[trip.status] ?? STATUS_META.planned;
  const Icon = (trip.activityType && ACTIVITY_ICON[trip.activityType]) || Activity;

  return (
    <button
      type="button"
      onClick={() => navigate(destination(trip))}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '14px 16px',
        background: 'white',
        border: 'none',
        borderBottom: '1px solid var(--upto-border)',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 9, flexShrink: 0,
        background: 'var(--upto-surface-raised)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--upto-text-secondary)',
      }}>
        <Icon size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{
            fontWeight: 600, fontSize: '0.95rem', color: 'var(--upto-text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {trip.title || 'Untitled trip'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.78rem', color: 'var(--upto-text-muted)' }}>
          {trip.locationName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
              <MapPin size={11} style={{ flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trip.locationName}</span>
            </span>
          )}
          {trip.watcherCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <Users size={11} />
              {trip.watcherCount}
            </span>
          )}
          <span style={{ flexShrink: 0 }}>{relativeTime(trip.startedAt || trip.createdAt)}</span>
        </div>
      </div>

      <span style={{
        flexShrink: 0,
        fontSize: '0.7rem', fontWeight: 600,
        color: status.fg, background: status.bg,
        padding: '3px 9px', borderRadius: 5,
      }}>
        {status.label}
      </span>
      <ChevronRight size={16} style={{ color: 'var(--upto-text-muted)', flexShrink: 0 }} />
    </button>
  );
};
