import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageSkeleton } from '@/components/LoadingSkeleton';

const LoginPage          = lazy(() => import('@/pages/Login/LoginPage'));
const RegisterPage       = lazy(() => import('@/pages/Register/RegisterPage'));
const CampaignsPage      = lazy(() => import('@/pages/Campaigns/CampaignsPage'));
const NewCampaignPage    = lazy(() => import('@/pages/NewCampaign/NewCampaignPage'));
const CampaignDetailPage = lazy(() => import('@/pages/CampaignDetail/CampaignDetailPage'));
const RecipientsPage     = lazy(() => import('@/pages/Recipients/RecipientsPage'));

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
      <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>
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
          path="/register"
          element={
            <RedirectIfAuth>
              <RegisterPage />
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
        <Route
          path="/recipients"
          element={
            <RequireAuth>
              <RecipientsPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/campaigns" replace />} />
        <Route path="*" element={<Navigate to="/campaigns" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
