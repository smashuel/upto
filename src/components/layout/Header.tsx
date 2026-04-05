import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, LogIn, LogOut, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoggedIn, logout } = useAuth();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-header-logo">
          <img
            src="/Fresh Teal Logo for Upto with Aqua Accents (1).png"
            alt="upto"
            height="44"
          />
        </Link>

        <nav className="site-header-nav">
          <Link
            to="/create"
            className={`site-header-link${isActive('/create') ? ' is-active' : ''}`}
          >
            <Plus size={15} />
            New TripLink
          </Link>

          {isLoggedIn ? (
            <>
              <span className="site-header-user">
                <User size={14} />
                {user!.name.split(' ')[0]}
              </span>
              <button
                type="button"
                className="site-header-link site-header-link--ghost"
                onClick={handleLogout}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={`site-header-link site-header-link--ghost${isActive('/login') ? ' is-active' : ''}`}
            >
              <LogIn size={14} />
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};