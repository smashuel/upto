import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout';
import CrashReportBanner from './components/CrashReportBanner';
import { useAuthDeepLink } from './hooks/useAuthDeepLink';
import { Home } from './pages/Home';
import { CreateTripLink } from './pages/CreateAdventure';
import { ActiveTrip } from './pages/ActiveTrip';
import { PublicAdventureView } from './pages/PublicAdventureView';
import { ViewAdventure } from './pages/ViewAdventure';
import { Login } from './pages/Login';
import { Profile } from './pages/Profile';
import { MyTrips } from './pages/MyTrips';
import { NotFound } from './pages/NotFound';
import './styles/globals.css';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Renders nothing — it exists so the Google-OAuth deep-link listener sits INSIDE the Router
 * (it navigates once the session token arrives). Native only; see useAuthDeepLink.
 */
function AuthDeepLinkListener() {
  useAuthDeepLink();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthDeepLinkListener />
        <CrashReportBanner />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<CreateTripLink />} />
            <Route path="/my-trip/:tripLinkId" element={<ActiveTrip />} />
            <Route path="/triplink/:token" element={<PublicAdventureView />} />
            <Route path="/triplink/:id" element={<ViewAdventure />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/trips" element={<MyTrips />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--adventure-primary)',
              color: 'white',
              borderRadius: '0.5rem',
              padding: '1rem',
            },
          }}
        />
      </Router>
    </QueryClientProvider>
  );
}

export default App;