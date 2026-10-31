import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeFor } from './AuthContext';
import LoadingBlock from '../components/LoadingBlock';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return <LoadingBlock fullPage />;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return <Outlet />;
}

