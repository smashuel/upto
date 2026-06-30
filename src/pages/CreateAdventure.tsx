import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mountain, Bike, Waves, Snowflake, MapPin,
  Activity, Footprints, ChevronDown, Route,
  Clock, ArrowRight, Check, Copy, ExternalLink, Play, AlertTriangle, Shield,
  type LucideIcon
} from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import toast from 'react-hot-toast';
import { TripLinkLocationStep } from '../components/forms/AdventureLocationStep';
import { RecipientPicker, type PickedContact } from '../components/forms/RecipientPicker';
import { GuidePaceEstimator } from '../components/guidepace/GuidePaceEstimator';
import { api } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import type { TripLink, ActivityType, LatLng, TripRoute } from '../types/adventure';
import type { What3WordsLocation } from '../types/what3words';

// ── Types ─────────────────────────────────────────────────────────

export interface TripLinkFormData {
  activityType: ActivityType | '';
  title: string;
  description: string;
  startDate: string;
  expectedReturnTime: string;
  location: {
    name: string;
    coordinates?: LatLng;
    what3words?: string;
    what3wordsDetails?: What3WordsLocation;
  };
  waypoints: Array<{ name: string; coordinates: LatLng; elevation?: number }>;
  routes?: TripRoute[];
  emergencyContacts: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    relationship: string;
    isPrimary: boolean;
    savedContactId?: number;
  }>;
  useGuidePace?: boolean;
}

// Best-effort offline-read cache. NOT a source of truth — the backend is.
// Bounded + deduped + non-throwing so it can never grow unbounded, throw on
// quota, or hold data that contradicts the server.
function cacheTripLinkOffline(tripLink: { id: string }): void {
  try {
    const existing = JSON.parse(localStorage.getItem('triplinks') || '[]');
    const deduped = Array.isArray(existing) ? existing.filter((t: { id: string }) => t.id !== tripLink.id) : [];
    deduped.unshift(tripLink);
    localStorage.setItem('triplinks', JSON.stringify(deduped.slice(0, 20)));
  } catch {
    /* quota / private mode — losing the offline cache is harmless */
  }
}

// ── Activity Types ────────────────────────────────────────────────

const ACTIVITIES: Array<{
  value: ActivityType;
  label: string;
  Icon: LucideIcon;
}> = [
  { value: 'hiking',        label: 'Hiking',     Icon: Footprints },
  { value: 'trail-running', label: 'Trail Run',  Icon: Activity   },
  { value: 'climbing',      label: 'Climbing',   Icon: Mountain   },
  { value: 'cycling',       label: 'Cycling',    Icon: Bike       },
  { value: 'water-sports',  label: 'Water',      Icon: Waves      },
  { value: 'winter-sports', label: 'Winter',     Icon: Snowflake  },
  { value: 'other',         label: 'Other',      Icon: MapPin     },
];

// ── Expandable Section ────────────────────────────────────────────

interface ExpandSectionProps {
  icon: LucideIcon;
  label: string;
  hint: string;
  badge?: string;
  children: React.ReactNode;
}

const ExpandSection: React.FC<ExpandSectionProps> = ({
  icon: Icon,
  label,
  hint,
  badge,
  children,
}) => {
  const [open, setOpen] = useState(false);
  // Lazy-mount: children only render after the section is first opened.
  // Once mounted, they stay mounted so React/form/Cesium state survives collapse.
  const [hasOpened, setHasOpened] = useState(false);

  const toggle = () => {
    setOpen(o => {
      const next = !o;
      if (next) setHasOpened(true);
      return next;
    });
  };

  return (
    <div className="expand-section">
      <button
        type="button"
        className="expand-toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        <div className="expand-toggle-left">
          <div className={`expand-icon${open ? ' is-active' : ''}`}>
            <Icon size={17} />
          </div>
          <div className="expand-label-group">
            <span className="expand-label">
              {label}
              {badge && <span className="expand-badge">{badge}</span>}
            </span>
            <span className="expand-hint">{hint}</span>
          </div>
        </div>
        <ChevronDown
          size={17}
          className={`expand-chevron${open ? ' is-open' : ''}`}
        />
      </button>

      <div className={`expand-content${open ? ' is-open' : ''}`}>
        <div className="expand-inner">
          {hasOpened ? children : null}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────

export const CreateTripLink: React.FC = () => {
  const navigate = useNavigate();
  const { user, sessionToken } = useAuth();
  const [tripLinkId, setTripLinkId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  // Live selection from the post-create RecipientPicker. The user picks who gets
  // SMS/email on Start; the array is replayed into the TripLink at /start time.
  const [pickedContacts, setPickedContacts] = useState<PickedContact[]>([]);
  // Confirm-on-zero modal — fires only if the user taps Start with no recipients selected.
  const [confirmNoWatchers, setConfirmNoWatchers] = useState(false);

  const methods = useForm<TripLinkFormData>({
    mode: 'onBlur',
    defaultValues: {
      activityType: '',
      title: '',
      description: '',
      startDate: '',
      expectedReturnTime: '',
      location: { name: '' },
      waypoints: [],
      emergencyContacts: [],
    },
  });

  const {
    handleSubmit,
    register,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = methods;

  const activityType = watch('activityType');
  const formData = watch();

  // Derive badge text for optional sections
  const hasLocation = !!(formData.location?.name || (formData.waypoints?.length ?? 0) > 0);

  const shareUrl = shareToken
    ? `${window.location.origin}/triplink/${shareToken}`
    : '';

  const onSubmit = async (data: TripLinkFormData) => {
    if (!sessionToken || !user) {
      toast.error('Please sign in to create a TripLink');
      navigate('/login');
      return;
    }
    try {
      const id = `triplink-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const token = crypto.randomUUID();

      const tripLink: TripLink = {
        id,
        userId: user.id,
        title: data.title,
        description: data.description,
        activityType: (data.activityType || 'other') as ActivityType,
        // `datetime-local` inputs yield a zoneless wall-clock string ("…T08:08"). Convert
        // to an absolute instant in the browser's local zone before storing — otherwise the
        // naive string is reinterpreted as UTC at the `expected_return_time TIMESTAMPTZ`
        // boundary, shifting the time (and the overdue sweep) by the viewer's offset.
        startDate: data.startDate ? new Date(data.startDate).toISOString() : data.startDate,
        expectedReturnTime: data.expectedReturnTime
          ? new Date(data.expectedReturnTime).toISOString()
          : undefined,
        location: {
          name: data.location.name,
          coordinates: data.location.coordinates || [0, 0],
          what3words: data.location.what3words,
          what3wordsDetails: data.location.what3wordsDetails,
        },
        waypoints: data.waypoints,
        routes: data.routes || [],
        emergencyContacts: data.emergencyContacts,
        shareToken: token,
        status: 'planned',
        createdAt: new Date().toISOString(),
        checkIns: [],
      };

      // The backend is the source of truth. This await must succeed for the trip
      // to exist — if it throws we fall into catch and surface an error, and the
      // cache below is never written (so the cache can't disagree with the server).
      await api.createTripLink(sessionToken, tripLink);

      // Best-effort offline-read cache only — never a write of record. Bounded to
      // the 20 most recent and deduped by id; failures (quota, private mode) are
      // swallowed because losing the cache is harmless. ActiveTrip reads this only
      // when the backend fetch fails.
      cacheTripLinkOffline(tripLink);

      setTripLinkId(id);
      setShareToken(token);
      toast.success('TripLink created');
    } catch {
      toast.error('Failed to create TripLink — try again');
    }
  };

  // The actual fire — called either directly or after the no-watchers confirm modal.
  const performStartTrip = async () => {
    if (!shareToken || !tripLinkId) return;
    setStarting(true);
    try {
      const summary = await api.startTrip(shareToken, { emergencyContacts: pickedContacts });
      // Surface what actually happened so the user knows their people were told.
      if (summary.notified.length > 0) {
        const sms   = summary.notified.filter(n => n.channel === 'sms').length;
        const email = summary.notified.filter(n => n.channel === 'email').length;
        const parts = [];
        if (sms)   parts.push(`${sms} SMS`);
        if (email) parts.push(`${email} email`);
        const stubbed = summary.notified.some(n => n.stubbed);
        toast.success(
          `Notified ${summary.notified.length} watcher${summary.notified.length === 1 ? '' : 's'}` +
          (parts.length ? ` (${parts.join(', ')})` : '') +
          (stubbed ? ' — stub mode' : ''),
          { duration: 5000 },
        );
      } else if (pickedContacts.length === 0) {
        toast('Trip started — no watchers notified', { icon: '🏕️', duration: 4000 });
      }
      if (summary.skipped.length > 0) {
        toast.error(
          `Couldn't notify ${summary.skipped.length}: ${summary.skipped.map(s => s.name).join(', ')}`,
          { duration: 6000 },
        );
      }
      navigate(`/my-trip/${tripLinkId}?token=${shareToken}`);
    } catch {
      toast.error('Could not start trip — try again');
      setStarting(false);
    }
  };

  const handleStartTrip = () => {
    if (pickedContacts.length === 0) {
      setConfirmNoWatchers(true);
      return;
    }
    performStartTrip();
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy — try manually');
    }
  };

  return (
    <div className="create-page">
      <div className="create-container">

        {/* ── Header ── */}
        <header className="create-header">
          <h1 className="create-title">New TripLink</h1>
          <p className="create-subtitle">
            Quick to create — clear for anyone who needs it.
          </p>
        </header>

        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>

            {/* ── Activity Type Pills ── */}
            <div className="activity-pills" role="group" aria-label="Activity type">
              {ACTIVITIES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`activity-pill${activityType === value ? ' is-selected' : ''}`}
                  onClick={() => setValue('activityType', value, { shouldValidate: true })}
                  aria-pressed={activityType === value}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            {errors.activityType && (
              <p className="create-pill-error">{errors.activityType.message as string}</p>
            )}

            {/* ── Core Fields ── */}
            <div className="create-fields">

              {/* Trip name */}
              <div className="create-field">
                <label className="create-label" htmlFor="title">
                  Trip name
                </label>
                <input
                  id="title"
                  className={`create-input${errors.title ? ' has-error' : ''}`}
                  placeholder="e.g. Tongariro Alpine Crossing"
                  autoComplete="off"
                  {...register('title', {
                    required: 'Give your trip a name',
                    minLength: { value: 3, message: 'Name must be at least 3 characters' },
                  })}
                />
                {errors.title && (
                  <p className="create-error">{errors.title.message as string}</p>
                )}
              </div>

              {/* Plan / intentions */}
              <div className="create-field">
                <label className="create-label" htmlFor="description">
                  Your plan
                  <span className="create-label-hint">
                    Where, what, roughly how long — anything useful for rescue teams
                  </span>
                </label>
                <textarea
                  id="description"
                  className={`create-input create-textarea${errors.description ? ' has-error' : ''}`}
                  placeholder="Heading up the northern circuit. Expect 3–4 hours. Back at the car park by 3 pm."
                  rows={3}
                  {...register('description', {
                    required: 'Describe your plan briefly',
                    minLength: { value: 10, message: 'Add a bit more detail' },
                  })}
                />
                {errors.description && (
                  <p className="create-error">{errors.description.message as string}</p>
                )}
              </div>

              {/* Setting off + Expected return — side by side */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div className="create-field" style={{ flex: '1 1 200px' }}>
                  <label className="create-label" htmlFor="startDate">
                    Setting off
                    <span className="create-label-hint">Optional</span>
                  </label>
                  <input
                    id="startDate"
                    type="datetime-local"
                    className="create-input"
                    {...register('startDate')}
                  />
                </div>

                <div className="create-field" style={{ flex: '1 1 200px' }}>
                  <label className="create-label" htmlFor="expectedReturnTime">
                    Expected back by
                    <span className="create-label-hint">Used for overdue alerts</span>
                  </label>
                  <input
                    id="expectedReturnTime"
                    type="datetime-local"
                    className="create-input"
                    {...register('expectedReturnTime')}
                  />
                </div>
              </div>

            </div>

            {/* ── Submit ── */}
            {!tripLinkId && (
              <div className="create-submit-area" style={{ marginTop: 32 }}>
                <button
                  type="submit"
                  className="create-submit"
                  disabled={isSubmitting}
                >
                  Create TripLink
                  <ArrowRight size={18} />
                </button>
                <p className="create-submit-hint">
                  A title and plan is all you need. Add route, contacts, and timing below.
                </p>
              </div>
            )}

            {/* ── Success / Share ── */}
            {tripLinkId && (
              <div className="create-success" style={{ marginTop: 32 }}>
                <div className="create-success-header">
                  <div className="create-success-check">
                    <Check size={15} />
                  </div>
                  <h2 className="create-success-title">TripLink Created</h2>
                </div>
                <div className="create-success-body">
                  <div className="create-success-url">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      aria-label="Share link"
                    />
                    <button
                      type="button"
                      className={`create-success-copy${copied ? ' is-copied' : ''}`}
                      onClick={handleCopy}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      className="create-success-preview"
                      onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink size={14} />
                      Preview
                    </button>
                  </div>
                  <p className="create-success-hint">
                    Send this link to your emergency contacts before you head out.
                  </p>

                  {/* ── Recipient Picker — pick who gets SMS/email on Start ── */}
                  {sessionToken && (
                    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--upto-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Shield size={15} style={{ color: 'var(--upto-danger, oklch(60% 0.18 25))' }} />
                        <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--upto-text)', margin: 0 }}>
                          Who should we tell?
                        </h3>
                      </div>
                      <RecipientPicker sessionToken={sessionToken} onChange={setPickedContacts} />
                    </div>
                  )}

                  {/* ── Start Trip ── */}
                  <button
                    type="button"
                    className="create-submit"
                    style={{
                      marginTop: 20,
                      width: '100%',
                      justifyContent: 'center',
                      background: pickedContacts.length > 0 ? 'var(--upto-success)' : 'var(--upto-text-muted)',
                    }}
                    onClick={handleStartTrip}
                    disabled={starting}
                  >
                    <Play size={16} />
                    {starting
                      ? 'Starting…'
                      : pickedContacts.length > 0
                        ? `I'm heading out — Notify ${pickedContacts.length} watcher${pickedContacts.length === 1 ? '' : 's'}`
                        : "I'm heading out — Start with no watchers"}
                  </button>
                  {pickedContacts.length === 0 && (
                    <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.78rem', color: 'var(--upto-text-muted)', textAlign: 'center', marginTop: 6 }}>
                      No one will be told if you don't check in.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Confirm-no-watchers modal ── */}
            {confirmNoWatchers && (
              <div
                onClick={() => setConfirmNoWatchers(false)}
                style={{
                  position: 'fixed', inset: 0, background: 'oklch(20% 0 0 / 0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000,
                }}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    maxWidth: 420, width: '100%', background: 'white', borderRadius: 14,
                    padding: 24, boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <AlertTriangle size={22} style={{ color: 'var(--upto-danger, oklch(60% 0.18 25))', flexShrink: 0 }} />
                    <h3 style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '1.05rem', margin: 0, color: 'var(--upto-text)' }}>
                      Start with no watchers?
                    </h3>
                  </div>
                  <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', color: 'var(--upto-text-secondary)', lineHeight: 1.5, marginBottom: 18 }}>
                    No one will be notified that you've started, and no one will be alerted if you don't check in.
                    Are you sure?
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="active-trip-action-btn"
                      onClick={() => setConfirmNoWatchers(false)}
                    >
                      Pick contacts instead
                    </button>
                    <button
                      type="button"
                      className="create-submit"
                      style={{ background: 'var(--upto-danger, oklch(60% 0.18 25))', alignSelf: 'auto' }}
                      onClick={() => {
                        setConfirmNoWatchers(false);
                        performStartTrip();
                      }}
                    >
                      Start anyway
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Optional Sections ── */}
            <div className="create-optional-divider">
              <div className="create-optional-line" />
              <span className="create-optional-label">Add more detail</span>
              <div className="create-optional-line" />
            </div>

            <div className="expand-sections">
              <ExpandSection
                icon={Route}
                label="Route & Map"
                hint="Draw your intended route on a 3D map"
                badge={hasLocation ? 'Added' : undefined}
              >
                <TripLinkLocationStep />
              </ExpandSection>

              <ExpandSection
                icon={Clock}
                label="Time Estimation"
                hint="Guide-quality timing via GuidePace (Munter / Chauvin)"
              >
                <GuidePaceEstimator isVisible={true} />
              </ExpandSection>
            </div>

          </form>
        </FormProvider>
      </div>
    </div>
  );
};
