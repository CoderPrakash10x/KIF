import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AREAS, PERMISSIONS as P, homePath } from '../constants/roles';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import PermissionGuard from './PermissionGuard';
import RoleArea from './RoleRoute';
import { LoadingState } from '../components/common/Feedback';

const page = loader => lazy(loader);
const Login = page(() => import('../pages/auth/Login'));
const Register = page(() => import('../pages/auth/Register'));
const VerifyEmail = page(() => import('../pages/auth/VerifyEmail'));
const ForgotPassword = page(() => import('../pages/auth/ForgotPassword'));
const ResetPassword = page(() => import('../pages/auth/ResetPassword'));
const StatusPage = page(() => import('../pages/errors/StatusPage'));

const Profile = page(() => import('../pages/profile/ProfilePage'));
const Notifications = page(() => import('../pages/notifications/NotificationsPage'));
const Events = page(() => import('../pages/events/EventsPage'));

// Admin / Super Admin area. `permission` narrows access further inside the area.
const ADMIN_PAGES = [
  { path: 'dashboard', Page: page(() => import('../pages/dashboard/AdminDashboard')) },
  { path: 'cabins', Page: page(() => import('../pages/cabins/CabinsPage')) },
  { path: 'hardware', Page: page(() => import('../pages/hardware/HardwarePage')) },
  { path: 'rooms', Page: page(() => import('../pages/rooms/RoomsPage')) },
  { path: 'consumables', Page: page(() => import('../pages/consumables/ConsumablesPage')) },
  { path: 'requests', Page: page(() => import('../pages/requests/RequestsPage')) },
  { path: 'events', Page: Events },
  { path: 'analytics', Page: page(() => import('../pages/analytics/AnalyticsPage')), permission: P.ANALYTICS_VIEW },
  { path: 'audit-logs', Page: page(() => import('../pages/audit/AuditPage')), permission: P.AUDIT_VIEW },
  { path: 'users', Page: page(() => import('../pages/users/UsersPage')), permission: P.USER_VIEW },
  { path: 'no-dues', Page: page(() => import('../pages/nodues/NoDuesPage')) },
  { path: 'notifications', Page: Notifications },
  { path: 'profile', Page: Profile },
];

// Founder / Intern / Student share one personal workspace; the backend scopes data to the caller.
const MEMBER_PAGES = [
  { path: 'dashboard', Page: page(() => import('../pages/dashboard/MemberDashboard')) },
  { path: 'requests', Page: page(() => import('../pages/requests/MyRequestsPage')) },
  { path: 'bookings', Page: page(() => import('../pages/rooms/BookingsPage')) },
  { path: 'events', Page: Events },
  { path: 'no-dues', Page: page(() => import('../pages/nodues/NoDuesPage').then(m => ({ default: m.MyNoDuesPage }))) },
  { path: 'notifications', Page: Notifications },
  { path: 'profile', Page: Profile },
];

const forbidden = <Navigate to="/403" replace />;

function areaRoutes(area, pages) {
  return (
    <Route key={area} element={<RoleArea area={area} />}>
      <Route path={`/${area}`} element={<Navigate to={`/${area}/dashboard`} replace />} />
      {pages.map(({ path, Page, permission }) => (
        <Route
          key={path} path={`/${area}/${path}`}
          element={permission ? <PermissionGuard permission={permission} fallback={forbidden}><Page /></PermissionGuard> : <Page />}
        />
      ))}
    </Route>
  );
}

function RootRedirect() {
  const { user, booting } = useAuth();
  if (booting) return <LoadingState label="Loading KIF-RMS…" />;
  return <Navigate to={user ? homePath(user.role) : '/login'} replace />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState label="Loading KIF-RMS…" />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/403" element={<StatusPage code={403} />} />
        <Route path="/404" element={<StatusPage code={404} />} />
        <Route element={<ProtectedRoute />}>
          {areaRoutes('admin', ADMIN_PAGES)}
          {AREAS.filter(a => a !== 'admin').map(a => areaRoutes(a, MEMBER_PAGES))}
        </Route>
        <Route path="*" element={<StatusPage code={404} />} />
      </Routes>
    </Suspense>
  );
}
