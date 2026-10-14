import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Renders children only for the listed roles (in-page conditional UI).
export function RoleGuard({ allowedRoles, children, fallback = null }) {
  const { user } = useAuth();
  return user && allowedRoles.includes(user.role) ? children : fallback;
}

// Layout route for a role area (/admin, /founder, /intern, /student): wrong area -> /403.
export default function RoleArea({ area }) {
  const { area: myArea } = useAuth();
  return myArea === area ? <Outlet /> : <Navigate to="/403" replace />;
}
