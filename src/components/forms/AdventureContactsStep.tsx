import React, { useState, useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Trash2, Star, LogIn, Shield, ExternalLink, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TripLinkFormData } from '../../pages/CreateAdventure';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../config/api';
import type { SavedContact } from '../../config/api';

interface ContactForm {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

const BLANK: ContactForm = { name: '', relationship: '', phone: '', email: '' };

const EMERGENCY_RED = 'var(--upto-danger, oklch(60% 0.18 25))';

function buildEmbeddedContact(sc: SavedContact, isPrimary: boolean) {
  return {
    id: `contact-${sc.id}-${Date.now()}`,
    name: sc.name,
    relationship: sc.relationship || '',
    phone: sc.phone || '',
    email: sc.email || '',
    isPrimary,
    isEmergency: sc.is_emergency,   // snapshot at save time — drives overdue SMS targeting
    savedContactId: sc.id,
  };
}

export const TripLinkContactsStep: React.FC = () => {
  const { watch, setValue } = useFormContext<TripLinkFormData>();
  const contacts = watch('emergencyContacts') || [];
  const { isLoggedIn, sessionToken } = useAuth();

  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [form, setForm] = useState<ContactForm>(BLANK);
  const [adding, setAdding] = useState(false);
  const [saveForLater, setSaveForLater] = useState(false);
  const [errors, setErrors] = useState<Partial<ContactForm>>({});

  // Once-per-mount guard for auto-populating from emergency circle.
  const didAutoPopulate = useRef(false);

  // Load saved contacts if logged in
  useEffect(() => {
    if (!isLoggedIn || !sessionToken) return;
    setLoadingSaved(true);
    api.getContacts(sessionToken)
      .then(setSavedContacts)
      .catch(() => { /* silently fail */ })
      .finally(() => setLoadingSaved(false));
  }, [isLoggedIn, sessionToken]);

  const emergencyCircle = savedContacts.filter(c => c.is_emergency);
  const otherSavedContacts = savedContacts.filter(c => !c.is_emergency);

  // Auto-include the user's emergency circle on first wizard visit (when contacts is empty
  // and the circle has members). Runs once per mount — user can still toggle individuals off.
  useEffect(() => {
    if (didAutoPopulate.current) return;
    if (contacts.length > 0) return;        // user already has something here, don't trample
    if (emergencyCircle.length === 0) return;
    didAutoPopulate.current = true;
    setValue(
      'emergencyContacts',
      emergencyCircle.map((sc, i) => buildEmbeddedContact(sc, i === 0)),
      { shouldValidate: true },
    );
  }, [emergencyCircle.length]);

  // Helpers
  const isIncluded = (sc: SavedContact) =>
    contacts.some(c => c.savedContactId === sc.id);

  const toggleIncluded = (sc: SavedContact) => {
    if (isIncluded(sc)) {
      // Remove this saved contact from the trip
      const updated = contacts.filter(c => c.savedContactId !== sc.id);
      if (updated.length > 0 && !updated.some(c => c.isPrimary)) {
        updated[0] = { ...updated[0], isPrimary: true };
      }
      setValue('emergencyContacts', updated, { shouldValidate: true });
    } else {
      // Add this saved contact to the trip
      const newContact = buildEmbeddedContact(sc, contacts.length === 0);
      setValue('emergencyContacts', [...contacts, newContact], { shouldValidate: true });
    }
  };

  const validate = (): boolean => {
    const e: Partial<ContactForm> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.phone.trim() && !form.email.trim())
      e.phone = 'Phone or email is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const addContact = (contact: {
    name: string; relationship: string; phone: string; email: string;
    savedContactId?: number;
  }) => {
    const newContact = {
      id: `contact-${Date.now()}`,
      name: contact.name.trim(),
      relationship: contact.relationship.trim(),
      phone: contact.phone.trim(),
      email: contact.email.trim(),
      isPrimary: contacts.length === 0,
      savedContactId: contact.savedContactId,
    };
    setValue('emergencyContacts', [...contacts, newContact], { shouldValidate: true });
  };

  const handleAdd = async () => {
    if (!validate()) return;
    if (saveForLater && isLoggedIn && sessionToken) {
      try {
        const saved = await api.createContact(sessionToken, {
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          relationship: form.relationship.trim() || undefined,
          is_favourite: false,
          is_emergency: false,
        });
        setSavedContacts(prev => [...prev, saved]);
        addContact({ ...form, savedContactId: saved.id });
      } catch {
        addContact(form);
      }
    } else {
      addContact(form);
    }
    setForm(BLANK);
    setErrors({});
    setSaveForLater(false);
    setAdding(false);
  };

  const handleRemove = (id: string) => {
    const updated = contacts.filter(c => c.id !== id);
    if (updated.length > 0 && !updated.some(c => c.isPrimary)) {
      updated[0] = { ...updated[0], isPrimary: true };
    }
    setValue('emergencyContacts', updated, { shouldValidate: true });
  };

  const handleSetPrimary = (id: string) => {
    setValue(
      'emergencyContacts',
      contacts.map(c => ({ ...c, isPrimary: c.id === id })),
      { shouldValidate: true }
    );
  };

  const handleChange = (field: keyof ContactForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  // Ad-hoc contacts on this trip (not backed by a saved contact)
  const adHocContacts = contacts.filter(c => !c.savedContactId);

  return (
    <div>
      {/* ── Emergency circle (logged-in only) ───────────────────────────── */}
      {isLoggedIn && emergencyCircle.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={13} style={{ color: EMERGENCY_RED, flexShrink: 0 }} />
              <span>Who will be notified — your <strong>emergency circle</strong></span>
            </p>
            <Link to="/profile" style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: 'var(--upto-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Edit on Profile <ExternalLink size={11} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden' }}>
            {emergencyCircle.map(sc => {
              const included = isIncluded(sc);
              const trip = contacts.find(c => c.savedContactId === sc.id);
              const isPrimary = trip?.isPrimary;
              return (
                <label
                  key={sc.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    background: included ? 'white' : 'var(--upto-surface-sunken)',
                    borderBottom: '1px solid var(--upto-border)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => toggleIncluded(sc)}
                    style={{ flexShrink: 0, accentColor: EMERGENCY_RED, width: 16, height: 16 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9375rem', color: included ? 'var(--upto-text)' : 'var(--upto-text-muted)' }}>
                        {sc.name}
                      </span>
                      {sc.relationship && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--upto-text-muted)' }}>
                          {sc.relationship}
                        </span>
                      )}
                      {isPrimary && (
                        <span style={{
                          fontFamily: 'var(--font-ui)', fontSize: '0.7rem', fontWeight: 600,
                          color: 'var(--upto-success)', background: 'oklch(49% 0.14 155 / 0.12)',
                          borderRadius: 4, padding: '1px 7px'
                        }}>
                          Primary
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)' }}>
                      {[sc.phone, sc.email].filter(Boolean).join(' · ')}
                    </div>
                    {included && !sc.phone && !sc.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: EMERGENCY_RED }}>
                        <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                        <span>Won't be notified — add a phone or email</span>
                      </div>
                    )}
                  </div>
                  {included && !isPrimary && (
                    <button
                      type="button"
                      className="active-trip-action-btn"
                      onClick={(e) => { e.preventDefault(); const trip = contacts.find(c => c.savedContactId === sc.id); if (trip) handleSetPrimary(trip.id); }}
                      title="Set as primary"
                      style={{ padding: '6px 9px', flexShrink: 0 }}
                    >
                      <Star size={13} />
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* ── No emergency circle yet (logged-in only) ───────────────────── */}
      {isLoggedIn && !loadingSaved && emergencyCircle.length === 0 && (
        <div style={{
          marginBottom: 14, padding: '12px 14px',
          background: 'var(--upto-surface-raised)', border: '1.5px solid var(--upto-border)',
          borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <Shield size={15} style={{ color: EMERGENCY_RED, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-secondary)', margin: 0 }}>
            You don't have an <strong>emergency circle</strong> set up yet.{' '}
            <Link to="/profile" style={{ color: 'var(--upto-primary)', fontWeight: 600 }}>Mark contacts on your Profile</Link>{' '}
            to have them auto-included on every trip.
          </p>
        </div>
      )}

      {/* ── Sign-in prompt (guests) ────────────────────────────────────── */}
      {!isLoggedIn && contacts.length === 0 && !adding && (
        <div style={{
          marginBottom: 14, padding: '12px 14px',
          background: 'var(--upto-surface-raised)', border: '1.5px solid var(--upto-border)',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <LogIn size={15} style={{ color: 'var(--upto-text-muted)', flexShrink: 0 }} />
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', margin: 0 }}>
            <Link to="/login" style={{ color: 'var(--upto-primary)', fontWeight: 600 }}>Sign in</Link>{' '}
            to use your saved emergency circle here, or add contacts below for this trip only.
          </p>
        </div>
      )}

      {loadingSaved && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', marginBottom: 10 }}>
          Loading your contacts…
        </p>
      )}

      {/* ── Ad-hoc / one-off contacts for this trip ─────────────────────── */}
      {adHocContacts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', marginBottom: 8 }}>
            For this trip only
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden' }}>
            {adHocContacts.map(contact => (
              <div
                key={contact.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '12px 14px', background: 'white',
                  borderBottom: '1px solid var(--upto-border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9375rem', color: 'var(--upto-text)' }}>
                      {contact.name}
                    </span>
                    {contact.relationship && (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', color: 'var(--upto-text-muted)' }}>
                        {contact.relationship}
                      </span>
                    )}
                    {contact.isPrimary && (
                      <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: '0.7rem', fontWeight: 600,
                        color: 'var(--upto-success)', background: 'oklch(49% 0.14 155 / 0.12)',
                        borderRadius: 4, padding: '1px 7px'
                      }}>
                        Primary
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)' }}>
                    {[contact.phone, contact.email].filter(Boolean).join(' · ')}
                  </div>
                  {!contact.phone && !contact.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontFamily: 'var(--font-ui)', fontSize: '0.75rem', color: EMERGENCY_RED }}>
                      <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                      <span>Won't be notified — add a phone or email</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!contact.isPrimary && (
                    <button type="button" className="active-trip-action-btn"
                      onClick={() => handleSetPrimary(contact.id)} title="Set as primary"
                      style={{ padding: '7px 10px' }}>
                      <Star size={14} />
                    </button>
                  )}
                  <button type="button" className="active-trip-action-btn"
                    onClick={() => handleRemove(contact.id)} title="Remove"
                    style={{ padding: '7px 10px', color: 'var(--upto-danger)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Other (non-emergency) saved contacts — collapsible add-from-list ── */}
      {isLoggedIn && !adding && otherSavedContacts.length > 0 && (
        <details style={{ marginBottom: 14 }}>
          <summary style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', cursor: 'pointer', padding: '4px 0' }}>
            Add from your other saved contacts ({otherSavedContacts.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
            {otherSavedContacts.map(sc => {
              const alreadyAdded = contacts.some(c => c.savedContactId === sc.id);
              return (
                <div key={sc.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '11px 14px', background: alreadyAdded ? 'var(--upto-surface-sunken)' : 'white',
                  borderBottom: '1px solid var(--upto-border)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {sc.is_favourite && <Star size={12} style={{ color: 'var(--upto-accent)', flexShrink: 0 }} />}
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: '0.875rem', color: alreadyAdded ? 'var(--upto-text-muted)' : 'var(--upto-text)' }}>
                        {sc.name}
                      </span>
                      {sc.relationship && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.775rem', color: 'var(--upto-text-muted)' }}>
                          {sc.relationship}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.775rem', color: 'var(--upto-text-muted)' }}>
                      {[sc.phone, sc.email].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="active-trip-action-btn"
                    onClick={() => addContact({
                      name: sc.name,
                      relationship: sc.relationship || '',
                      phone: sc.phone || '',
                      email: sc.email || '',
                      savedContactId: sc.id,
                    })}
                    disabled={alreadyAdded}
                    style={{ padding: '6px 12px', fontSize: '0.8125rem', opacity: alreadyAdded ? 0.5 : 1 }}
                  >
                    {alreadyAdded ? 'Added' : '+ Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ── Add manually ─────────────────────────────────────────────────── */}
      {adding ? (
        <div style={{ border: '1.5px solid var(--upto-border)', borderRadius: 10, padding: 20, background: 'white' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label" htmlFor="c-name">Name</label>
                <input id="c-name" className={`create-input${errors.name ? ' has-error' : ''}`}
                  placeholder="e.g. Jane Smith" value={form.name}
                  onChange={e => handleChange('name', e.target.value)} />
                {errors.name && <p className="create-error">{errors.name}</p>}
              </div>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label" htmlFor="c-rel">
                  Relationship <span className="create-label-hint">Optional</span>
                </label>
                <input id="c-rel" className="create-input" placeholder="e.g. Partner, Friend"
                  value={form.relationship} onChange={e => handleChange('relationship', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label" htmlFor="c-phone">Phone</label>
                <input id="c-phone" className={`create-input${errors.phone ? ' has-error' : ''}`}
                  type="tel" placeholder="+64 21 000 000" value={form.phone}
                  onChange={e => handleChange('phone', e.target.value)} />
                {errors.phone && <p className="create-error">{errors.phone}</p>}
              </div>
              <div className="create-field" style={{ flex: '1 1 160px' }}>
                <label className="create-label" htmlFor="c-email">Email</label>
                <input id="c-email" className="create-input" type="email"
                  placeholder="jane@example.com" value={form.email}
                  onChange={e => handleChange('email', e.target.value)} />
              </div>
            </div>

            {isLoggedIn && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.875rem', color: 'var(--upto-text-secondary)' }}>
                <input type="checkbox" checked={saveForLater}
                  onChange={e => setSaveForLater(e.target.checked)} />
                Save to my contacts for next time
              </label>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button type="button" className="create-submit" style={{ alignSelf: 'auto' }} onClick={handleAdd}>
                Add Contact
              </button>
              <button type="button" className="active-trip-action-btn"
                onClick={() => { setAdding(false); setErrors({}); setForm(BLANK); setSaveForLater(false); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="active-trip-action-btn"
          style={{ width: '100%', justifyContent: 'center', padding: '12px 16px' }}
          onClick={() => setAdding(true)}
        >
          <Plus size={16} />
          {emergencyCircle.length > 0 || adHocContacts.length > 0 ? 'Add a one-off contact for this trip' : 'Add a contact manually'}
        </button>
      )}

      {contacts.length === 0 && !adding && emergencyCircle.length === 0 && (
        <p className="create-label-hint" style={{ marginTop: 10, textAlign: 'center' }}>
          At least one contact means watchers know who to call.
        </p>
      )}
    </div>
  );
};
