import React from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isLoginPage = location.pathname === '/login';
  // Public watcher view has its own full-bleed layout (no header/footer)
  const isPublicView = location.pathname.startsWith('/triplink/');

  const showChrome = !isHomePage && !isLoginPage && !isPublicView;

  return (
    <div className="d-flex flex-column min-vh-100">
      {showChrome && <Header />}
      <main className="flex-grow-1">
        {children}
      </main>
      {showChrome && <Footer />}
    </div>
  );
};