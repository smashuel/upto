import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { App as CapacitorApp } from '@capacitor/app';
import { detectPlatform } from '../services/positionSource';
import { parseAuthDeepLink } from '../services/oauthReturn';
import { useAuth } from './useAuth';

/**
 * Completes Google sign-in in the native shell.
 *
 * The OAuth flow leaves the app entirely: Capacitor hands any navigation outside the app's own
 * origin to the system browser, so the user signs in with Google in Safari and the backend
 * redirects to `world.upto.app://app/login?session=…`. iOS routes that back to us as an
 * `appUrlOpen` event, and this is what listens for it.
 *
 * It deliberately does **not** rely on the Login page's own `?session=` handling: by the time
 * the deep link arrives the app is being *resumed*, Login may already be mounted (its effect
 * runs once on mount and would not re-fire), or the user may have started sign-in from a
 * different screen entirely. Handling it here means the token lands wherever they were.
 */
export function useAuthDeepLink(): void {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    // Web never receives these — the browser completes OAuth by ordinary navigation, which
    // Login.tsx already handles. Registering anyway would be harmless but misleading.
    if (detectPlatform() === 'web') return;

    let cancelled = false;
    const handle = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const link = parseAuthDeepLink(url);
      if (!link || cancelled) return;

      if (link.error) {
        toast.error(
          link.error === 'google_cancelled'
            ? 'Google sign-in was cancelled.'
            : 'Google sign-in failed — please try again.',
        );
        navigate('/login', { replace: true });
        return;
      }

      if (link.session) {
        loginWithToken(link.session)
          .then(() => navigate('/', { replace: true }))
          .catch(() => {
            toast.error('Google sign-in failed — please try again.');
            navigate('/login', { replace: true });
          });
      }
    });

    return () => {
      cancelled = true;
      // addListener resolves to the handle asynchronously; remove it whenever it lands.
      handle.then((h) => h.remove()).catch(() => {});
    };
  }, [navigate, loginWithToken]);
}
