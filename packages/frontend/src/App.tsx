import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import LoginPage from '@/pages/Login/LoginPage';
import CampaignsPage from '@/pages/Campaigns/CampaignsPage';
import NewCampaignPage from '@/pages/NewCampaign/NewCampaignPage';
import CampaignDetailPage from '@/pages/CampaignDetail/CampaignDetailPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/campaigns" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <LoginPage />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/campaigns"
          element={
            <RequireAuth>
              <CampaignsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/campaigns/new"
          element={
            <RequireAuth>
              <NewCampaignPage />
            </RequireAuth>
          }
        />
        <Route
          path="/campaigns/:id"
          element={
            <RequireAuth>
              <CampaignDetailPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/campaigns" replace />} />
        <Route path="*" element={<Navigate to="/campaigns" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
