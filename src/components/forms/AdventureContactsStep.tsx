import React, { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Trash2, Star, LogIn } from 'lucide-react';
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

  // Load saved contacts if logged in
  useEffect(() => {
    if (!isLoggedIn || !sessionToken) return;
    setLoadingSaved(true);
    api.getContacts(sessionToken)
      .then(setSavedContacts)
      .catch(() => { /* silently fail */ })
      .finally(() => setLoadingSaved(false));
  }, [isLoggedIn, sessionToken]);

  // IDs of contacts already added from the saved list
  const addedSavedIds = new Set(
    contacts.map(c => c.savedContactId).filter(Boolean)
  );

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

  const handleAddFromSaved = (sc: SavedContact) => {
    addContact({
      name: sc.name,
      relationship: sc.relationship || '',
      phone: sc.phone || '',
      email: sc.email || '',
      savedContactId: sc.id,
    });
  };

  const handleAdd = async () => {
    if (!validate()) return;

    // Optionally save to contacts list
    if (saveForLater && isLoggedIn && sessionToken) {
      try {
        const saved = await api.createContact(sessionToken, {
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          relationship: form.relationship.trim() || undefined,
          is_favourite: false,
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

  return (
    <div>
      {/* ── Added contacts list ── */}
      {contacts.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden' }}>
          {contacts.map(contact => (
            <div
              key={contact.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '14px 16px', background: 'white',
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
      )}

      {/* ── Saved contacts (logged-in users) ── */}
      {isLoggedIn && !adding && savedContacts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', marginBottom: 8 }}>
            Your saved contacts
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: '1.5px solid var(--upto-border)', borderRadius: 10, overflow: 'hidden' }}>
            {savedContacts.map(sc => {
              const alreadyAdded = addedSavedIds.has(sc.id);
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
                    onClick={() => handleAddFromSaved(sc)}
                    disabled={alreadyAdded}
                    style={{ padding: '6px 12px', fontSize: '0.8125rem', opacity: alreadyAdded ? 0.5 : 1 }}
                  >
                    {alreadyAdded ? 'Added' : '+ Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompt to sign in if not logged in and no contacts yet */}
      {!isLoggedIn && contacts.length === 0 && !adding && (
        <div style={{
          marginBottom: 14, padding: '12px 14px',
          background: 'var(--upto-surface-raised)', border: '1.5px solid var(--upto-border)',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <LogIn size={15} style={{ color: 'var(--upto-text-muted)', flexShrink: 0 }} />
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', margin: 0 }}>
            <Link to="/login" style={{ color: 'var(--upto-primary)', fontWeight: 600 }}>Sign in</Link>{' '}
            to use your saved contacts here.
          </p>
        </div>
      )}

      {loadingSaved && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)', marginBottom: 10 }}>
          Loading your contacts…
        </p>
      )}

      {/* ── Add contact form ── */}
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
          Add a contact manually
        </button>
      )}

      {contacts.length === 0 && !adding && (
        <p className="create-label-hint" style={{ marginTop: 10, textAlign: 'center' }}>
          At least one contact means watchers know who to call.
        </p>
      )}
    </div>
  );
};
