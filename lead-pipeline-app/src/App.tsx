import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthPage } from '@/components/AuthPage';
import { useAuth } from '@/hooks/AuthContext';
import { HomePage } from '@/pages/HomePage';
import { GuidePage } from '@/pages/GuidePage';

// Lazy so the Vega chart bundle loads only on the dashboard routes.
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DrillPage = lazy(() =>
  import('@/pages/DrillPage').then((m) => ({ default: m.DrillPage })),
);

function AuthGuard({
  children,
  requireAuth,
}: {
  children: React.ReactNode;
  requireAuth: boolean;
}) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) return <Navigate to="/auth" replace />;
  if (!requireAuth && isAuthenticated) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      {/* ensure all new routes require auth */}
      <Routes>
        <Route
          path="/auth"
          element={
            <AuthGuard requireAuth={false}>
              <AuthPage />
            </AuthGuard>
          }
        />
        <Route
          path="/"
          element={
            <AuthGuard requireAuth={true}>
              <HomePage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard"
          element={
            <AuthGuard requireAuth={true}>
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center text-faint">
                    Loading dashboard…
                  </div>
                }
              >
                <DashboardPage />
              </Suspense>
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard/drill/:dim/:value"
          element={
            <AuthGuard requireAuth={true}>
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-faint">Loading…</div>}>
                <DrillPage />
              </Suspense>
            </AuthGuard>
          }
        />
        <Route
          path="/guide"
          element={
            <AuthGuard requireAuth={true}>
              <GuidePage />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
