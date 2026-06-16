import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Star, Plus, Trash2, AlertTriangle, Phone, Mail, MessageSquare } from 'lucide-react';
import type { SavedContact } from '../../config/api';
import { api } from '../../config/api';

const EMERGENCY_RED = 'var(--upto-danger, oklch(60% 0.18 25))';

/**
 * Shape passed back to /start. Mirrors the embedded Contact in adventure.ts.
 */
export interface PickedContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  isEmergency?: boolean;
  savedContactId?: number;
}

interface AdHocForm {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

const BLANK_AD_HOC: AdHocForm = { name: '', relationship: '', phone: '', email: '' };

interface Props {
  sessionToken: string;
  /** Called whenever the selection changes — parent reads to drive the Start button. */
  onChange: (picked: PickedContact[]) => void;
}

export const RecipientPicker: React.FC<Props> = ({ sessionToken, onChange }) => {
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [adHoc, setAdHoc] = useState<PickedContact[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [addingOneOff, setAddingOneOff] = useState(false);
  const [adHocForm, setAdHocForm] = useState<AdHocForm>(BLANK_AD_HOC);
  const [adHocError, setAdHocError] = useState<string | null>(null);

  // Fetch contacts + pre-select emergency-circle.
  useEffect(() => {
    if (!sessionToken) return;
    api.getContacts(sessionToken)
      .then(contacts => {
        setSavedContacts(contacts);
        const emergencyIds = new Set(contacts.filter(c => c.is_emergency).map(c => c.id));
        setSelectedIds(emergencyIds);
        // First emergency contact becomes primary by default.
        const firstEmergency = contacts.find(c => c.is_emergency);
        if (firstEmergency) setPrimaryId(`saved-${firstEmergency.id}`);
      })
      .catch(() => { /* silent — picker just shows empty state */ })
      .finally(() => setLoading(false));
  }, [sessionToken]);

  // Build the final PickedContact[] whenever selection changes.
  const picked = useMemo<PickedContact[]>(() => {
    const fromSaved: PickedContact[] = savedContacts
      .filter(c => selectedIds.has(c.id))
      .map(c => ({
        id: `saved-${c.id}`,
        name: c.name,
        relationship: c.relationship || '',
        phone: c.phone || '',
        email: c.email || '',
        isPrimary: primaryId === `saved-${c.id}`,
        isEmergency: c.is_emergency,
        savedContactId: c.id,
      }));
    const merged = [...fromSaved, ...adHoc].map(c => ({
      ...c,
      isPrimary: c.id === primaryId,
    }));
    // Ensure exactly one primary if anyone is picked.
    if (merged.length > 0 && !merged.some(c => c.isPrimary)) {
      merged[0] = { ...merged[0], isPrimary: true };
    }
    return merged;
  }, [savedContacts, selectedIds, adHoc, primaryId]);

  useEffect(() => { onChange(picked); }, [picked, onChange]);

  // Group savedContacts: emergency → favourites → others.
  const emergencyCircle = savedContacts.filter(c => c.is_emergency);
  const favourites      = savedContacts.filter(c => !c.is_emergency && c.is_favourite);
  const others          = savedContacts.filter(c => !c.is_emergency && !c.is_favourite);

  const toggleSaved = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddAdHoc = () => {
    if (!adHocForm.name.trim()) { setAdHocError('Name is required'); return; }
    if (!adHocForm.phone.trim() && !adHocForm.email.trim()) { setAdHocError('Phone or email is required'); return; }
    const newContact: PickedContact = {
      id: `adhoc-${Date.now()}`,
      name: adHocForm.name.trim(),
      relationship: adHocForm.relationship.trim(),
      phone: adHocForm.phone.trim(),
      email: adHocForm.email.trim(),
      isPrimary: false,
    };
    setAdHoc(prev => [...prev, newContact]);
    setAdHocForm(BLANK_AD_HOC);
    setAdHocError(null);
    setAddingOneOff(false);
  };

  const handleRemoveAdHoc = (id: string) => {
    setAdHoc(prev => prev.filter(c => c.id !== id));
    if (primaryId === id) setPrimaryId(null);
  };

  return (
    <div>
      <p style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
        color: 'var(--upto-text-muted)',
        margin: '0 0 12px',
      }}>
        Pick who gets notified when you start. Your emergency circle is checked by default.
      </p>

      {loading && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', color: 'var(--upto-text-muted)' }}>
          Loading your contacts…
        </p>
      )}

      {!loading && savedContacts.length === 0 && adHoc.length === 0 && (
        <div style={{
          padding: '14px 16px',
          background: 'var(--upto-surface-raised)',
          border: '1.5px solid var(--upto-border)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 12,
        }}>
          <AlertTriangle size={16} style={{ color: EMERGENCY_RED, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-secondary)', margin: 0 }}>
            No saved contacts yet — add one below to have someone notified, or start without watchers.
          </p>
        </div>
      )}

      {emergencyCircle.length > 0 && (
        <ContactGroup
          label="Emergency circle"
          icon={<Shield size={12} style={{ color: EMERGENCY_RED, flexShrink: 0 }} />}
          contacts={emergencyCircle}
          selectedIds={selectedIds}
          primaryId={primaryId}
          onToggle={toggleSaved}
          onSetPrimary={(savedId) => setPrimaryId(`saved-${savedId}`)}
        />
      )}

      {favourites.length > 0 && (
        <ContactGroup
          label="Favourites"
          icon={<Star size={12} style={{ color: 'oklch(72% 0.14 70)', flexShrink: 0 }} />}
          contacts={favourites}
          selectedIds={selectedIds}
          primaryId={primaryId}
          onToggle={toggleSaved}
          onSetPrimary={(savedId) => setPrimaryId(`saved-${savedId}`)}
        />
      )}

      {others.length > 0 && (
        <ContactGroup
          label="Other contacts"
          contacts={others}
          selectedIds={selectedIds}
          primaryId={primaryId}
          onToggle={toggleSaved}
          onSetPrimary={(savedId) => setPrimaryId(`saved-${savedId}`)}
        />
      )}

      {adHoc.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--upto-text-muted)', margin: '0 0 6px' }}>
            For this trip only
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden' }}>
            {adHoc.map(c => (
              <div key={c.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                background: 'white',
                borderBottom: '1px solid var(--upto-border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9375rem', color: 'var(--upto-text)' }}>{c.name}</span>
                    {c.relationship && (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--upto-text-muted)' }}>
                        {c.relationship}
                      </span>
                    )}
                    {c.id === primaryId && <PrimaryBadge />}
                  </div>
                  <ChannelHints phone={c.phone} email={c.email} />
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {c.id !== primaryId && (
                    <button type="button" className="active-trip-action-btn" style={{ padding: '6px 9px' }}
                      onClick={() => setPrimaryId(c.id)} title="Set as primary">
                      <Star size={13} />
                    </button>
                  )}
                  <button type="button" className="active-trip-action-btn" style={{ padding: '6px 9px', color: 'var(--upto-danger)' }}
                    onClick={() => handleRemoveAdHoc(c.id)} title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add one-off contact */}
      {addingOneOff ? (
        <div style={{ border: '1.5px solid var(--upto-border)', borderRadius: 10, padding: 16, background: 'white' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label">Name</label>
                <input className={`create-input${adHocError && !adHocForm.name ? ' has-error' : ''}`}
                  placeholder="e.g. Hut warden"
                  value={adHocForm.name}
                  onChange={e => { setAdHocForm(f => ({ ...f, name: e.target.value })); setAdHocError(null); }} />
              </div>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label">Relationship <span className="create-label-hint">Optional</span></label>
                <input className="create-input"
                  placeholder="e.g. Friend, Warden"
                  value={adHocForm.relationship}
                  onChange={e => setAdHocForm(f => ({ ...f, relationship: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label">Phone</label>
                <input className="create-input" type="tel"
                  placeholder="+64 21 …"
                  value={adHocForm.phone}
                  onChange={e => { setAdHocForm(f => ({ ...f, phone: e.target.value })); setAdHocError(null); }} />
              </div>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label">Email</label>
                <input className="create-input" type="email"
                  placeholder="name@example.com"
                  value={adHocForm.email}
                  onChange={e => { setAdHocForm(f => ({ ...f, email: e.target.value })); setAdHocError(null); }} />
              </div>
            </div>
            {adHocError && <p className="create-error">{adHocError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="create-submit" style={{ alignSelf: 'auto' }} onClick={handleAddAdHoc}>
                Add
              </button>
              <button type="button" className="active-trip-action-btn"
                onClick={() => { setAddingOneOff(false); setAdHocForm(BLANK_AD_HOC); setAdHocError(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="active-trip-action-btn"
          style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', marginTop: 8 }}
          onClick={() => setAddingOneOff(true)}>
          <Plus size={15} />
          Add a one-off contact for this trip
        </button>
      )}
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

interface ContactGroupProps {
  label: string;
  icon?: React.ReactNode;
  contacts: SavedContact[];
  selectedIds: Set<number>;
  primaryId: string | null;
  onToggle: (id: number) => void;
  onSetPrimary: (savedId: number) => void;
}

const ContactGroup: React.FC<ContactGroupProps> = ({ label, icon, contacts, selectedIds, primaryId, onToggle, onSetPrimary }) => (
  <div style={{ marginBottom: 14 }}>
    <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--upto-text-muted)', display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 6px' }}>
      {icon}
      {label}
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden' }}>
      {contacts.map(c => {
        const checked = selectedIds.has(c.id);
        const isPrimary = primaryId === `saved-${c.id}`;
        const noChannel = !c.phone && !c.email;
        return (
          <label key={c.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            background: checked ? 'white' : 'var(--upto-surface-sunken)',
            borderBottom: '1px solid var(--upto-border)',
            cursor: noChannel ? 'not-allowed' : 'pointer',
            opacity: noChannel ? 0.6 : 1,
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(c.id)}
              disabled={noChannel}
              style={{ flexShrink: 0, width: 16, height: 16, accentColor: c.is_emergency ? EMERGENCY_RED : 'var(--upto-primary)' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9375rem', color: checked ? 'var(--upto-text)' : 'var(--upto-text-muted)' }}>
                  {c.name}
                </span>
                {c.relationship && (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--upto-text-muted)' }}>
                    {c.relationship}
                  </span>
                )}
                {isPrimary && <PrimaryBadge />}
              </div>
              <ChannelHints phone={c.phone} email={c.email} />
              {noChannel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: EMERGENCY_RED }}>
                  <AlertTriangle size={11} />
                  <span>No phone or email — can't be notified</span>
                </div>
              )}
            </div>
            {checked && !isPrimary && (
              <button type="button" className="active-trip-action-btn" style={{ padding: '6px 9px', flexShrink: 0 }}
                onClick={(e) => { e.preventDefault(); onSetPrimary(c.id); }} title="Set as primary">
                <Star size={13} />
              </button>
            )}
          </label>
        );
      })}
    </div>
  </div>
);

const PrimaryBadge: React.FC = () => (
  <span style={{
    fontFamily: 'var(--font-ui)',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: 'var(--upto-success)',
    background: 'oklch(49% 0.14 155 / 0.12)',
    borderRadius: 4,
    padding: '1px 7px',
  }}>
    Primary
  </span>
);

const ChannelHints: React.FC<{ phone?: string; email?: string }> = ({ phone, email }) => {
  if (!phone && !email) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-ui)', fontSize: '0.78rem', color: 'var(--upto-text-muted)', marginTop: 2 }}>
      {phone && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MessageSquare size={11} />
          <Phone size={11} />
          {phone}
        </span>
      )}
      {email && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Mail size={11} />
          {email}
        </span>
      )}
    </div>
  );
};
