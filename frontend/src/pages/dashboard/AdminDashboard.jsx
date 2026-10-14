import { AlertTriangle, Building2, ClipboardCheck, Cpu, DoorOpen, Package, UserX, Users } from 'lucide-react';
import { ROLES } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import PageHeader from '../../components/common/PageHeader';
import QueryBoundary from '../../components/common/QueryBoundary';
import { ActivityRows, EventRows, RequestRows, ViewAll } from '../../components/common/Widgets';
import { Card, ProgressBar, StatCard, StatGrid } from '../../components/ui/Card';
import { ROLE_LABELS } from '../../constants/roles';
import { pct } from '../../utils/format';

const tone = v => (v >= 85 ? 'red' : v >= 65 ? 'amber' : 'primary');

export default function AdminDashboard() {
  const { user } = useAuth();
  const sa = user.role === ROLES.SUPER_ADMIN;
  const summary = useApi(() => api.get('/dashboard/summary'), []);
  const pending = useApi(() => api.get('/requests', { status: 'PENDING', limit: 5 }), []);
  const events = useApi(() => api.get('/events', { upcoming: 'true', limit: 4 }), []);
  const audit = useApi(() => api.get('/audit-logs', { limit: 6 }), []);
  const s = summary.data?.data;
  const first = user.name.replace(/^Dr\.\s*/, '').split(' ')[0];

  return (
    <div className="page">
      <PageHeader title={`Welcome back, ${first}`} description={sa ? 'Organisation-wide overview of people, resources and activity.' : 'Operational snapshot: what needs approval and what needs attention.'} />
      <QueryBoundary query={summary}>
        {s && (
          <>
            <StatGrid>
              {sa && <StatCard icon={Users} label="Total users" value={s.users.total} hint={`${s.users.active} active`} to="/admin/users" />}
              {sa && <StatCard icon={UserX} tone="amber" label="Awaiting approval" value={s.users.pending} hint={`${s.users.unverified || 0} unverified · ${s.users.deactivated} deactivated`} to="/admin/users" />}
              <StatCard icon={ClipboardCheck} tone="amber" label="Pending requests" value={s.requests.pending} hint="Need a decision" to="/admin/requests" />
              <StatCard icon={Building2} label="Cabins in use" value={s.cabins.inUse} hint={`${s.cabins.total} total · ${s.cabins.byStatus.FREE || 0} free`} to="/admin/cabins" />
              <StatCard icon={Cpu} tone="purple" label="Hardware available" value={s.hardware.available} hint={`of ${s.hardware.total} units`} to="/admin/hardware" />
              <StatCard icon={DoorOpen} tone="blue" label="Room utilisation" value={`${s.rooms.utilization}%`} hint="Next 7 days" to="/admin/rooms" />
              <StatCard icon={Package} tone="red" label="Low-stock items" value={s.consumables.low} hint={`${s.consumables.watch} on watch`} to="/admin/consumables" />
              {s.counterActions > 0 && <StatCard icon={AlertTriangle} tone="amber" label="Hardware counter queue" value={s.counterActions} hint="Hand-overs & inspections" to="/admin/hardware" />}
            </StatGrid>
            <div className="grid-2">
              <Card title="Workspace utilisation" description="Live from allotments, issues and the next 7 days of bookings.">
                <div className="stack">
                  <ProgressBar label="Cabins" value={s.cabins.utilization} tone={tone(s.cabins.utilization)} detail={`${s.cabins.inUse} in use`} />
                  <ProgressBar label="Rooms (next 7 days)" value={s.rooms.utilization} tone={tone(s.rooms.utilization)} />
                  <ProgressBar label="Hardware issued" value={pct(s.hardware.issued, s.hardware.total)} tone={tone(pct(s.hardware.issued, s.hardware.total))} detail={`${s.hardware.issued} of ${s.hardware.total} units`} />
                </div>
              </Card>
              <Card title="Pending requests" actions={<ViewAll to="/requests" />}><RequestRows requests={pending.data?.data || []} review /></Card>
            </div>
            {sa && (
              <div className="grid-2">
                <Card title="People by role">
                  <div className="stack">
                    {Object.entries(s.users.byRole).map(([role, n]) => <ProgressBar key={role} label={ROLE_LABELS[role] || role} value={pct(n, s.users.total)} detail={n} />)}
                  </div>
                </Card>
                <Card title="Account status" description="Verified registrations wait here for Super Admin approval.">
                  <div className="stack">
                    <ProgressBar label="Active" value={pct(s.users.active, s.users.total)} detail={s.users.active} />
                    <ProgressBar label="Awaiting approval" value={pct(s.users.pending, s.users.total)} tone="amber" detail={s.users.pending} />
                    <ProgressBar label="Deactivated" value={pct(s.users.deactivated, s.users.total)} tone="red" detail={s.users.deactivated} />
                  </div>
                </Card>
              </div>
            )}
            <div className="grid-2">
              <Card title="Recent activity" actions={<ViewAll to="/audit-logs" />}><ActivityRows logs={audit.data?.data || []} /></Card>
              <Card title="Upcoming events" actions={<ViewAll to="/events" />}><EventRows events={events.data?.data || []} /></Card>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
