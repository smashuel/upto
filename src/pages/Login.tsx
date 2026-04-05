import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { API_CONFIG } from '../config/api';

// Google "G" logo as an inline SVG — no external asset needed
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, loginWithToken, isLoggedIn } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const from = (location.state as { from?: string })?.from || '/';

  // Handle redirect back from Google OAuth (?session=TOKEN or ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionToken = params.get('session');
    const oauthError = params.get('error');

    if (oauthError) {
      setError(
        oauthError === 'google_cancelled'
          ? 'Google sign-in was cancelled.'
          : 'Google sign-in failed — please try again.'
      );
      // Clean the URL
      navigate('/login', { replace: true });
      return;
    }

    if (sessionToken) {
      setGoogleLoading(true);
      loginWithToken(sessionToken)
        .then(() => navigate(from, { replace: true }))
        .catch(() => {
          setError('Google sign-in failed — please try again.');
          setGoogleLoading(false);
          navigate('/login', { replace: true });
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If already logged in, redirect away
  useEffect(() => {
    if (isLoggedIn) navigate(from, { replace: true });
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (!name.trim()) { setError('Name is required'); setSubmitting(false); return; }
        await register(email.trim(), name.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = () => {
    // Full-page redirect to backend OAuth endpoint — passes current origin
    // so the backend knows where to redirect back after auth
    const origin = window.location.origin;
    window.location.href = `${API_CONFIG.BASE_URL}/api/auth/google?origin=${encodeURIComponent(origin)}`;
  };

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setEmail('');
    setPassword('');
    setName('');
  };

  if (googleLoading) {
    return (
      <div className="login-page">
        <div className="login-landscape">
          <div className="login-landscape-inner">
            <img src="/Fresh Teal Logo for Upto with Aqua Accents (1).png" alt="upto" className="login-landscape-logo" />
            <div>
              <p className="login-landscape-tagline">Know where you are.<br />Know someone knows.</p>
            </div>
            <span className="login-landscape-credit">New Zealand · upto.world</span>
          </div>
        </div>
        <div className="login-form-panel">
          <div className="login-form-inner" style={{ textAlign: 'center' }}>
            <div className="adventure-spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--upto-text-muted)', fontSize: '0.9rem' }}>
              Signing you in…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">

      {/* ── Left: landscape photo panel ── */}
      <div className="login-landscape">
        <div className="login-landscape-inner">
          <img
            src="/Fresh Teal Logo for Upto with Aqua Accents (1).png"
            alt="upto"
            className="login-landscape-logo"
          />
          <div>
            <p className="login-landscape-tagline">
              Know where you are.<br />
              Know someone knows.
            </p>
            <p className="login-landscape-sub">
              Save your contacts once, pull them into any trip. Your people are always one step from knowing you're safe.
            </p>
          </div>
          <span className="login-landscape-credit">New Zealand · upto.world</span>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="login-form-panel">
        <div className="login-form-inner">

          <h1 className="login-form-heading">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="login-form-sub">
            {mode === 'login'
              ? 'Access your saved contacts and trip history.'
              : 'Save contacts once, use them on every trip.'}
          </p>

          {/* ── Google button ── */}
          <button
            type="button"
            className="google-signin-btn"
            onClick={handleGoogleSignIn}
          >
            <GoogleLogo />
            Continue with Google
          </button>

          {/* ── Divider ── */}
          <div className="login-divider">
            <span>or</span>
          </div>

          {/* ── Email / password form ── */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="create-fields">

              {mode === 'register' && (
                <div className="create-field">
                  <label className="create-label" htmlFor="name">Your name</label>
                  <input
                    id="name"
                    className="create-input"
                    placeholder="e.g. Sam Booth"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
              )}

              <div className="create-field">
                <label className="create-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  className="create-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="create-field">
                <label className="create-label" htmlFor="password">
                  Password
                  {mode === 'register' && (
                    <span className="create-label-hint">At least 8 characters</span>
                  )}
                </label>
                <input
                  id="password"
                  className="create-input"
                  type="password"
                  placeholder={mode === 'register' ? 'Choose a password' : 'Your password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                />
              </div>

            </div>

            {error && (
              <p className="create-error" style={{ marginTop: 12 }}>{error}</p>
            )}

            <div className="create-submit-area" style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="create-submit"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={submitting}
              >
                {submitting
                  ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                  : (mode === 'login' ? 'Sign in' : 'Create account')}
              </button>
            </div>
          </form>

          <p className="login-switch-row">
            {mode === 'login' ? (
              <>No account yet?{' '}
                <button type="button" className="login-switch-btn" onClick={() => switchMode('register')}>
                  Create one
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button type="button" className="login-switch-btn" onClick={() => switchMode('login')}>
                  Sign in
                </button>
              </>
            )}
          </p>

          <div className="login-anon-note">
            No account needed for a quick trip —<br />
            an account just saves your contacts for next time.
          </div>

        </div>
      </div>

    </div>
  );
};
