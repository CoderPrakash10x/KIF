import { Link } from 'react-router-dom';
import { Bell, Building2, ClipboardCheck, Clock, Cpu, DoorOpen } from 'lucide-react';
import { ROLES } from '../../constants/roles';
import { useAuth, useBase } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import PageHeader from '../../components/common/PageHeader';
import QueryBoundary from '../../components/common/QueryBoundary';
import { EmptyState } from '../../components/common/Feedback';
import { EventRows, RequestRows, ViewAll } from '../../components/common/Widgets';
import Badge from '../../components/ui/Badge';
import { Card, StatCard, StatGrid } from '../../components/ui/Card';
import { todayISO } from '../../utils/time';
import { fmtDate, fmtShortDate, fmtTimeRange, timeAgo } from '../../utils/format';

const SUB = {
  FOUNDER: 'Your startup workspace: requests, bookings and anything allotted to you.',
  INTERN: 'Your workspace: requests, bookings and anything assigned to you.',
  STUDENT: 'Your requests, bookings and upcoming events at a glance.',
};

export default function MemberDashboard() {
  const { user } = useAuth();
  const base = useBase();
  const summary = useApi(() => api.get('/dashboard/summary'), []);
  const reqs = useApi(() => api.get('/requests/my-requests', { limit: 5 }), []);
  const bookings = useApi(() => api.get('/rooms/bookings/my', { limit: 5, status: 'APPROVED' }), []);
  const events = useApi(() => api.get('/events', { upcoming: 'true', limit: 4 }), []);
  const notes = useApi(() => api.get('/notifications', { limit: 4 }), []);
  const hw = useApi(() => api.get('/hardware/my-transactions', { limit: 20 }), []);
  const cabins = useApi(() => api.get('/cabins/my-history', { limit: 5 }), [], { enabled: user.role !== ROLES.STUDENT });
  const s = summary.data?.data;
  const held = (hw.data?.data || []).filter(t => ['ISSUED', 'OVERDUE', 'APPROVED'].includes(t.status));
  const activeCabins = (cabins.data?.data || []).filter(a => ['ACTIVE', 'APPROVED', 'RESERVED'].includes(a.status));
  const today = todayISO();
  const upcoming = (bookings.data?.data || []).filter(b => (b.date || '').slice(0, 10) >= today);
  const first = user.name.split(' ')[0];

  return (
    <div className="page">
      <PageHeader title={`Welcome back, ${first}`} description={SUB[user.role]} />
      <QueryBoundary query={summary}>
        {s && (
          <>
            <StatGrid>
              <StatCard icon={ClipboardCheck} tone="amber" label="My requests" value={s.requests.total} hint={`${s.requests.pending} pending`} to={`${base}/requests`} />
              <StatCard icon={DoorOpen} tone="blue" label="Upcoming bookings" value={s.upcomingBookings} to={`${base}/bookings`} />
              <StatCard icon={Cpu} tone="purple" label="Hardware with me" value={s.hardwareHeld} hint={s.hardwareOverdue ? `${s.hardwareOverdue} overdue` : 'Nothing overdue'} to={`${base}/requests`} />
              <StatCard icon={Bell} label="Unread notifications" value={s.unreadNotifications} to={`${base}/notifications`} />
            </StatGrid>
            <div className="grid-2">
              <Card title="My requests" actions={<ViewAll to="/requests" />}>
                {(reqs.data?.data || []).length ? <RequestRows requests={reqs.data.data} showRequester={false} /> : <EmptyState compact title="No requests yet" description="Request a cabin or hardware, or book a room." action={<Link to={`${base}/requests`} className="btn btn--primary btn--sm">Make a request</Link>} />}
              </Card>
              <Card title="My upcoming bookings" actions={<ViewAll to="/bookings" />}>
                {upcoming.length ? (
                  <ul className="rows">{upcoming.map(b => (
                    <li key={b._id} className="row"><div className="row__main"><p className="row__title">{b.roomId?.roomName || 'Room'}</p><p className="row__sub">{fmtShortDate(b.date)} · {fmtTimeRange(b.startTime, b.endTime)}</p></div><Badge status={b.status} /></li>
                  ))}</ul>
                ) : <EmptyState compact title="No upcoming bookings" action={<Link to={`${base}/bookings`} className="btn btn--primary btn--sm">Book a room</Link>} />}
              </Card>
            </div>
            {user.role !== ROLES.STUDENT && (
              <div className="grid-2">
                <Card title="My cabin & hardware">
                  {activeCabins.length || held.length ? (
                    <ul className="rows">
                      {activeCabins.map(a => <li key={a._id} className="row"><Building2 size={16} className="row__icon" aria-hidden="true" /><div className="row__main"><p className="row__title">Cabin {a.cabinId?.cabinNumber} · {a.startupName || 'Allotment'}</p><p className="row__sub">Until {fmtDate(a.endDate)}</p></div><Badge status={a.status} /></li>)}
                      {held.map(t => <li key={t._id} className="row"><Cpu size={16} className="row__icon" aria-hidden="true" /><div className="row__main"><p className="row__title">{t.hardwareId?.itemName} ×{t.quantity}</p><p className="row__sub">{t.expectedReturnDate ? `Due ${fmtDate(t.expectedReturnDate)}` : 'Awaiting hand-over'}</p></div><Badge status={t.status} /></li>)}
                    </ul>
                  ) : <EmptyState compact title="Nothing allotted" description="Cabins and hardware assigned to you appear here." />}
                </Card>
                <Card title="Needs your attention">
                  {s.hardwareOverdue || s.requests.pending ? (
                    <ul className="rows">
                      {s.hardwareOverdue > 0 && <li className="row"><Link to={`${base}/requests`} className="row__link"><Clock size={16} className="row__icon" data-tone="red" aria-hidden="true" />{s.hardwareOverdue} hardware item{s.hardwareOverdue > 1 ? 's are' : ' is'} overdue. Please return.</Link></li>}
                      {s.requests.pending > 0 && <li className="row"><Link to={`${base}/requests`} className="row__link"><Clock size={16} className="row__icon" data-tone="amber" aria-hidden="true" />{s.requests.pending} request{s.requests.pending > 1 ? 's are' : ' is'} awaiting a decision.</Link></li>}
                    </ul>
                  ) : <EmptyState compact title="You are all caught up" />}
                </Card>
              </div>
            )}
            <div className="grid-2">
              <Card title="Upcoming events" actions={<ViewAll to="/events" />}><EventRows events={events.data?.data || []} /></Card>
              <Card title="Recent notifications" actions={<ViewAll to="/notifications" />}>
                {(notes.data?.data || []).length ? (
                  <ul className="rows">{notes.data.data.map(n => <li key={n._id} className="row"><div className="row__main"><p className="row__title">{n.title}</p><p className="row__sub">{timeAgo(n.createdAt)}</p></div>{!n.read && <Badge tone="blue" dot={false}>New</Badge>}</li>)}</ul>
                ) : <EmptyState compact title="No notifications" />}
              </Card>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
