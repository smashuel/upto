import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogIn, Map as MapIcon } from 'lucide-react';
import { api, ApiError, type TripSummary } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { TripRow } from '../components/trips/TripRow';

// Visual grouping of statuses, in display order.
const GROUPS: { key: string; label: string; statuses: TripSummary['status'][] }[] = [
  { key: 'attention', label: 'Needs attention', statuses: ['overdue'] },
  { key: 'active',    label: 'Active now',      statuses: ['active'] },
  { key: 'planned',   label: 'Planned',         statuses: ['planned'] },
  { key: 'completed', label: 'Completed',       statuses: ['completed'] },
];

export const MyTrips: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn, sessionToken, loading: authLoading, logout } = useAuth();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!sessionToken) { setLoading(false); return; }
    let cancelled = false;
    api.listMyTrips(sessionToken)
      .then(t => { if (!cancelled) setTrips(t); })
      .catch(err => {
        if (cancelled) return;
        // Stale session → sign out and bounce to login (Phase 5 hygiene).
        if (err instanceof ApiError && err.status === 401) {
          logout();
          navigate('/login');
          return;
        }
        setError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authLoading, sessionToken, logout, navigate]);

  if (authLoading || loading) {
    return (
      <div className="profile-page">
        <div className="profile-container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <div className="adventure-spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="profile-page">
        <div className="profile-container" style={{ maxWidth: 480 }}>
          <header className="profile-header">
            <h1 className="profile-name">Your trips</h1>
            <p className="profile-email">Sign in to see your trip history.</p>
          </header>
          <div className="profile-empty-state" style={{ paddingTop: 0 }}>
            <button type="button" className="create-submit"
              onClick={() => navigate('/login')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <LogIn size={16} />
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-container">

        <header className="profile-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 className="profile-name">Your trips</h1>
            <p className="profile-email">
              {trips.length === 0 ? 'No trips yet' : `${trips.length} trip${trips.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button type="button" className="create-submit"
            onClick={() => navigate('/create')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Plus size={16} />
            New trip
          </button>
        </header>

        {error && (
          <div className="profile-empty-state">
            <p>Couldn't load your trips. Check your connection and try again.</p>
          </div>
        )}

        {!error && trips.length === 0 && (
          <div className="profile-empty-state" style={{ textAlign: 'center' }}>
            <MapIcon size={32} style={{ color: 'var(--upto-text-muted)', marginBottom: 12 }} />
            <p style={{ marginBottom: 20 }}>
              You haven't planned any trips yet. Create your first TripLink so someone always knows where you are.
            </p>
            <button type="button" className="create-submit"
              onClick={() => navigate('/create')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Plus size={16} />
              Plan your first trip
            </button>
          </div>
        )}

        {!error && GROUPS.map(group => {
          const groupTrips = trips.filter(t => group.statuses.includes(t.status));
          if (groupTrips.length === 0) return null;
          return (
            <section className="profile-section" key={group.key}>
              <h2 className="profile-section-label">{group.label}</h2>
              <div style={{
                border: '1.5px solid var(--upto-border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}>
                {groupTrips.map(trip => <TripRow key={trip.id} trip={trip} />)}
              </div>
            </section>
          );
        })}

      </div>
    </div>
  );
};
