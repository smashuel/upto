import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { CreateAdventure } from './pages/CreateAdventure';
import { ViewAdventure } from './pages/ViewAdventure';
import { Profile } from './pages/Profile';
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<CreateAdventure />} />
            <Route path="/adventure/:id" element={<ViewAdventure />} />
            <Route path="/profile" element={<Profile />} />
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