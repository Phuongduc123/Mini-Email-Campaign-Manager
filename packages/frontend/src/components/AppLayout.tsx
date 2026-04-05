import { ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';

const NAV_LINKS = [
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/recipients', label: 'Recipients' },
];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, refreshToken, logout } = useAuthStore();

  const handleLogout = async () => {
    if (refreshToken) {
      try { await authApi.logout(refreshToken); } catch { /* ignore */ }
    }
    logout();
    queryClient.clear();
    navigate('/login');
  };

  // Derive initials for avatar
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() ?? '?';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">

          {/* Brand */}
          <div className="flex items-center gap-6 shrink-0">
            <Link to="/campaigns" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                Mailer
              </span>
            </Link>

            {/* Nav links */}
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map(({ to, label }) => {
                const active = location.pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* User pill */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center select-none">
                {initials}
              </div>
              <span className="hidden sm:block text-sm text-slate-600 max-w-[160px] truncate">
                {user?.email}
              </span>
            </div>

            <div className="w-px h-4 bg-slate-200" />

            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
