import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mountain, Bike, Waves, Snowflake, MapPin,
  Activity, Footprints, ChevronDown, Route,
  Users, Clock, ArrowRight, Check, Copy, ExternalLink, Play,
  type LucideIcon
} from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import toast from 'react-hot-toast';
import { TripLinkLocationStep } from '../components/forms/AdventureLocationStep';
import { TripLinkContactsStep } from '../components/forms/AdventureContactsStep';
import { GuidePaceEstimator } from '../components/guidepace/GuidePaceEstimator';
import { api } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import type { TripLink, ActivityType, LatLng } from '../types/adventure';
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

  return (
    <div className="expand-section">
      <button
        type="button"
        className="expand-toggle"
        onClick={() => setOpen(o => !o)}
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
          {children}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────

export const CreateTripLink: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tripLinkId, setTripLinkId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

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
  const hasContacts = (formData.emergencyContacts?.length ?? 0) > 0;

  const shareUrl = shareToken
    ? `${window.location.origin}/triplink/${shareToken}`
    : '';

  const onSubmit = async (data: TripLinkFormData) => {
    try {
      const id = `triplink-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const token = crypto.randomUUID();

      const tripLink: TripLink = {
        id,
        userId: user?.id,
        title: data.title,
        description: data.description,
        activityType: (data.activityType || 'other') as ActivityType,
        startDate: data.startDate,
        expectedReturnTime: data.expectedReturnTime || undefined,
        location: {
          name: data.location.name,
          coordinates: data.location.coordinates || [0, 0],
          what3words: data.location.what3words,
          what3wordsDetails: data.location.what3wordsDetails,
        },
        waypoints: data.waypoints,
        emergencyContacts: data.emergencyContacts,
        shareToken: token,
        status: 'planned',
        createdAt: new Date().toISOString(),
        checkIns: [],
      };

      await api.createTripLink(tripLink);

      // Also keep in localStorage as fallback / offline cache
      const existing = JSON.parse(localStorage.getItem('triplinks') || '[]');
      existing.push(tripLink);
      localStorage.setItem('triplinks', JSON.stringify(existing));

      setTripLinkId(id);
      setShareToken(token);
      toast.success('TripLink created');
    } catch {
      toast.error('Failed to create TripLink — try again');
    }
  };

  const handleStartTrip = async () => {
    if (!shareToken || !tripLinkId) return;
    setStarting(true);
    try {
      await api.startTrip(shareToken);
      navigate(`/my-trip/${tripLinkId}?token=${shareToken}`);
    } catch {
      toast.error('Could not start trip — try again');
      setStarting(false);
    }
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

  const handleCopyFor = async (contactName: string) => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedFor(contactName);
      toast.success(`Link copied — send to ${contactName}`);
      setTimeout(() => setCopiedFor(null), 2500);
    } catch {
      toast.error('Could not copy');
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

                  {/* ── Contact sender — show contacts to copy link for each ── */}
                  {formData.emergencyContacts.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--upto-text-secondary)', marginBottom: 8 }}>
                        Send to your contacts
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 8, overflow: 'hidden' }}>
                        {formData.emergencyContacts.map(contact => (
                          <div key={contact.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 12, padding: '10px 14px', background: 'white',
                            borderBottom: '1px solid var(--upto-border)',
                          }}>
                            <div>
                              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: '0.875rem', color: 'var(--upto-text)' }}>
                                {contact.name}
                              </span>
                              {contact.relationship && (
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.775rem', color: 'var(--upto-text-muted)', marginLeft: 6 }}>
                                  {contact.relationship}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              {contact.phone && (
                                <a
                                  href={`sms:${contact.phone}?body=${encodeURIComponent(`My trip plan: ${shareUrl}`)}`}
                                  className="active-trip-action-btn"
                                  style={{ padding: '5px 10px', fontSize: '0.8125rem', textDecoration: 'none' }}
                                >
                                  Text
                                </a>
                              )}
                              {contact.email && (
                                <a
                                  href={`mailto:${contact.email}?subject=${encodeURIComponent('My trip plan')}&body=${encodeURIComponent(`Hi ${contact.name},\n\nHere's my trip plan in case anything goes wrong:\n${shareUrl}\n\nI'll check in when I'm back safely.`)}`}
                                  className="active-trip-action-btn"
                                  style={{ padding: '5px 10px', fontSize: '0.8125rem', textDecoration: 'none' }}
                                >
                                  Email
                                </a>
                              )}
                              <button
                                type="button"
                                className="active-trip-action-btn"
                                onClick={() => handleCopyFor(contact.name)}
                                style={{ padding: '5px 10px', fontSize: '0.8125rem', color: copiedFor === contact.name ? 'var(--upto-success)' : undefined }}
                              >
                                {copiedFor === contact.name ? <Check size={12} /> : <Copy size={12} />}
                                {copiedFor === contact.name ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="create-submit"
                    style={{ marginTop: 16, width: '100%', justifyContent: 'center', background: 'var(--upto-success)' }}
                    onClick={handleStartTrip}
                    disabled={starting}
                  >
                    <Play size={16} />
                    {starting ? 'Starting…' : "I'm heading out — Start Trip"}
                  </button>
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
                icon={Users}
                label="Emergency Contacts"
                hint="Who should we call if you don't check in?"
                badge={hasContacts ? `${formData.emergencyContacts.length} added` : undefined}
              >
                <TripLinkContactsStep />
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
