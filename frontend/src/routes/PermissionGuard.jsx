import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../constants/roles';

// UX-level gate. The backend independently authorises every request.
export default function PermissionGuard({ permission, any, children, fallback = null }) {
  const { user } = useAuth();
  const list = any || [permission];
  return user && list.some(p => hasPermission(user.role, p)) ? children : fallback;
}
