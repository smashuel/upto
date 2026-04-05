import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Trash2, Plus, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../config/api';
import type { SavedContact } from '../config/api';

// ── Sub-components ────────────────────────────────────────────────────────────

interface AddContactFormProps {
  sessionToken: string;
  onAdded: (contact: SavedContact) => void;
  onCancel: () => void;
}

const AddContactForm: React.FC<AddContactFormProps> = ({ sessionToken, onAdded, onCancel }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [isFavourite, setIsFavourite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!phone.trim() && !email.trim()) { setError('Phone or email is required'); return; }
    setSubmitting(true);
    try {
      const saved = await api.createContact(sessionToken, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        relationship: relationship.trim() || undefined,
        is_favourite: isFavourite,
      });
      onAdded(saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save contact');
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      border: '1.5px solid var(--upto-border)',
      borderRadius: 10,
      padding: 20,
      background: 'white',
      marginTop: 16,
    }}>
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="create-field" style={{ flex: '1 1 160px' }}>
              <label className="create-label" htmlFor="pc-name">Name</label>
              <input id="pc-name" className="create-input" placeholder="Jane Smith"
                value={name} onChange={e => { setName(e.target.value); setError(''); }} autoFocus />
            </div>
            <div className="create-field" style={{ flex: '1 1 160px' }}>
              <label className="create-label" htmlFor="pc-rel">
                Relationship <span className="create-label-hint">Optional</span>
              </label>
              <input id="pc-rel" className="create-input" placeholder="Partner, Flatmate…"
                value={relationship} onChange={e => setRelationship(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="create-field" style={{ flex: '1 1 160px' }}>
              <label className="create-label" htmlFor="pc-phone">Phone</label>
              <input id="pc-phone" className="create-input" type="tel" placeholder="+64 21 000 000"
                value={phone} onChange={e => { setPhone(e.target.value); setError(''); }} />
            </div>
            <div className="create-field" style={{ flex: '1 1 160px' }}>
              <label className="create-label" htmlFor="pc-email">Email</label>
              <input id="pc-email" className="create-input" type="email" placeholder="jane@example.com"
                value={email} onChange={e => { setEmail(e.target.value); setError(''); }} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.875rem', color: 'var(--upto-text-secondary)' }}>
            <input type="checkbox" checked={isFavourite} onChange={e => setIsFavourite(e.target.checked)} />
            Mark as favourite (appears first on every trip)
          </label>

          {error && <p className="create-error">{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="create-submit" style={{ alignSelf: 'auto' }} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save contact'}
            </button>
            <button type="button" className="active-trip-action-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, sessionToken, isLoggedIn, loading: authLoading, logout } = useAuth();

  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !sessionToken) return;
    setLoadingContacts(true);
    api.getContacts(sessionToken)
      .then(setContacts)
      .catch(() => { /* silently fail */ })
      .finally(() => setLoadingContacts(false));
  }, [isLoggedIn, sessionToken]);

  const handleToggleFavourite = async (contact: SavedContact) => {
    if (!sessionToken) return;
    const updated = { ...contact, is_favourite: !contact.is_favourite };
    // Optimistic update
    setContacts(prev => prev.map(c => c.id === contact.id ? updated : c));
    try {
      await api.updateContact(sessionToken, contact.id, { is_favourite: updated.is_favourite });
    } catch {
      // Revert on failure
      setContacts(prev => prev.map(c => c.id === contact.id ? contact : c));
    }
  };

  const handleDelete = async (id: number) => {
    if (!sessionToken) return;
    const prev = contacts;
    setContacts(contacts.filter(c => c.id !== id));
    try {
      await api.deleteContact(sessionToken, id);
    } catch {
      setContacts(prev);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await logout();
    navigate('/');
  };

  // ── Not logged in ──
  if (authLoading) {
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
            <h1 className="profile-name">Your profile</h1>
            <p className="profile-email">Sign in to manage contacts and view your trip history.</p>
          </header>

          <div className="profile-empty-state" style={{ paddingTop: 0 }}>
            <p style={{ marginBottom: 20 }}>
              An account lets you save contacts and reuse them on every trip — no re-entering the same numbers each time.
            </p>
            <button
              type="button"
              className="create-submit"
              onClick={() => navigate('/login')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <LogIn size={16} />
              Sign in or create account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const favourites = contacts.filter(c => c.is_favourite);
  const others = contacts.filter(c => !c.is_favourite);
  const sortedContacts = [...favourites, ...others];

  return (
    <div className="profile-page">
      <div className="profile-container">

        {/* ── Account header ── */}
        <header className="profile-header">
          <h1 className="profile-name">{user!.name}</h1>
          <p className="profile-email">{user!.email}</p>
        </header>

        {/* ── Saved contacts ── */}
        <section className="profile-section">
          <h2 className="profile-section-label">Saved contacts</h2>

          {loadingContacts && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', color: 'var(--upto-text-muted)' }}>
              Loading…
            </p>
          )}

          {!loadingContacts && sortedContacts.length === 0 && !addingContact && (
            <div className="profile-empty-state">
              <p>No saved contacts yet.</p>
              <p style={{ fontSize: '0.8125rem', marginTop: 4 }}>
                Add the people who should know where you are — they'll be available to select on every trip.
              </p>
            </div>
          )}

          {sortedContacts.length > 0 && (
            <div>
              {sortedContacts.map(contact => (
                <div key={contact.id} className="profile-contact-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="profile-contact-name">
                      {contact.is_favourite && (
                        <Star size={12} style={{ color: 'oklch(72% 0.14 70)', flexShrink: 0 }} />
                      )}
                      {contact.name}
                      {contact.relationship && (
                        <span style={{ fontWeight: 400, color: 'var(--upto-text-muted)', fontSize: '0.8125rem' }}>
                          {contact.relationship}
                        </span>
                      )}
                    </div>
                    <div className="profile-contact-details">
                      {[contact.phone, contact.email].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      className={`profile-contact-fav${contact.is_favourite ? ' is-fav' : ''}`}
                      onClick={() => handleToggleFavourite(contact)}
                      title={contact.is_favourite ? 'Remove favourite' : 'Mark as favourite'}
                    >
                      <Star size={15} fill={contact.is_favourite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className="active-trip-action-btn"
                      onClick={() => handleDelete(contact.id)}
                      title="Remove"
                      style={{ padding: '6px 9px', color: 'var(--upto-danger)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {addingContact ? (
            <AddContactForm
              sessionToken={sessionToken!}
              onAdded={(contact) => {
                setContacts(prev => [...prev, contact]);
                setAddingContact(false);
              }}
              onCancel={() => setAddingContact(false)}
            />
          ) : (
            <button
              type="button"
              className="active-trip-action-btn"
              onClick={() => setAddingContact(true)}
              style={{ marginTop: sortedContacts.length > 0 ? 16 : 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} />
              Add contact
            </button>
          )}
        </section>

        {/* ── Account section ── */}
        <section className="profile-section">
          <h2 className="profile-section-label">Account</h2>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 20,
            borderBottom: '1px solid var(--upto-border)',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9375rem', color: 'var(--upto-text)', marginBottom: 2 }}>
                {user!.name}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8125rem', color: 'var(--upto-text-muted)' }}>
                {user!.email}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              className="profile-signout-btn"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut size={14} />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
};
