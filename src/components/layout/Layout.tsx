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

  return (
    <div className="d-flex flex-column min-vh-100">
      {!isHomePage && <Header />}
      <main className="flex-grow-1">
        {children}
      </main>
      {!isHomePage && <Footer />}
    </div>
  );
};