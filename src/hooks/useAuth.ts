import { useState, useEffect, useCallback } from 'react';
import { api } from '../config/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: AuthUser | null;
  sessionToken: string | null;
  loading: boolean;
}

const SESSION_KEY = 'upto_session';

function loadSession(): { user: AuthUser | null; sessionToken: string | null } {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { user: null, sessionToken: null };
    return JSON.parse(raw);
  } catch {
    return { user: null, sessionToken: null };
  }
}

function saveSession(user: AuthUser, sessionToken: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user, sessionToken }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    const { user, sessionToken } = loadSession();
    return { user, sessionToken, loading: !!sessionToken };
  });

  // Validate stored session on mount
  useEffect(() => {
    const { sessionToken } = loadSession();
    if (!sessionToken) return;
    api.getMe(sessionToken)
      .then(user => setState({ user, sessionToken, loading: false }))
      .catch(() => {
        clearSession();
        setState({ user: null, sessionToken: null, loading: false });
      });
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    const { user, sessionToken } = await api.register(email, name, password);
    saveSession(user, sessionToken);
    setState({ user, sessionToken, loading: false });
    return user;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user, sessionToken } = await api.login(email, password);
    saveSession(user, sessionToken);
    setState({ user, sessionToken, loading: false });
    return user;
  }, []);

  const logout = useCallback(async () => {
    const { sessionToken } = loadSession();
    if (sessionToken) {
      try { await api.logout(sessionToken); } catch { /* ignore */ }
    }
    clearSession();
    setState({ user: null, sessionToken: null, loading: false });
  }, []);

  // Used after Google OAuth redirect — receives a token from the URL and validates it
  const loginWithToken = useCallback(async (sessionToken: string) => {
    const user = await api.getMe(sessionToken);
    saveSession(user, sessionToken);
    setState({ user, sessionToken, loading: false });
    return user;
  }, []);

  return {
    user: state.user,
    sessionToken: state.sessionToken,
    loading: state.loading,
    isLoggedIn: !!state.user,
    register,
    login,
    logout,
    loginWithToken,
  };
}
