import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/common/Feedback';
import AppShell from '../layouts/AppShell';

export default function ProtectedRoute() {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();
  if (booting) return <LoadingState label="Restoring your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <AppShell />;
}
