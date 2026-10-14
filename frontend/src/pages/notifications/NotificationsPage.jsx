import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth, useBase } from '../../context/AuthContext';
import { isAdminRole } from '../../constants/roles';
import { useUnread } from '../../context/UnreadContext';
import { api } from '../../lib/api';
import { useServerList } from '../../hooks/useApi';
import useRowAction from '../../hooks/useRowAction';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Segmented } from '../../components/ui/Tabs';
import Pagination from '../../components/tables/Pagination';
import { Modal } from '../../components/modals/Modal';
import { fmtDateTime, timeAgo, titleCase } from '../../utils/format';

const ADMIN_LINKS = { Request: '/requests', HardwareTransaction: '/hardware', Hardware: '/hardware', Cabin: '/cabins', CabinAllotment: '/cabins', RoomBooking: '/rooms', Event: '/events', Consumable: '/consumables', NoDuesRequest: '/no-dues' };
// Members have no cabin/hardware/room admin pages; point them at the nearest page they do have.
const MEMBER_LINKS = { Request: '/requests', HardwareTransaction: '/requests', Hardware: '/requests', Cabin: '/requests', CabinAllotment: '/dashboard', RoomBooking: '/bookings', Event: '/events', EventRegistration: '/events', NoDuesRequest: '/no-dues' };

export default function NotificationsPage() {
  const base = useBase();
  const { user } = useAuth();
  const LINKS = isAdminRole(user.role) ? ADMIN_LINKS : MEMBER_LINKS;
  const navigate = useNavigate();
  const unread = useUnread();
  const rowAction = useRowAction();
  const [filter, setFilter] = useState('');
  const [openN, setOpenN] = useState(null);
  const list = useServerList('/notifications', { read: filter || undefined }, { pageSize: 15 });
  const total = list.extra.unread ?? unread.count;

  const sync = () => { list.reload(); unread.refresh(); };
  const setRead = (n, read) => rowAction.run(n._id, () => api.post(`/notifications/${n._id}/read`, { read }), { success: read ? 'Marked as read.' : 'Marked as unread.', onDone: sync });
  const open = n => { setOpenN(n); if (!n.read) api.post(`/notifications/${n._id}/read`, { read: true }).then(sync).catch(() => {}); };
  const target = n => (LINKS[n.relatedResourceType] && `${base}${LINKS[n.relatedResourceType]}`) || null;

  return (
    <div className="page">
      <PageHeader title="Notifications" description={total ? `You have ${total} unread notification${total > 1 ? 's' : ''}.` : 'You are all caught up.'}
        actions={<Button icon={CheckCheck} disabled={!total} loading={rowAction.pending === 'all'} onClick={() => rowAction.run('all', () => api.post('/notifications/read-all'), { onDone: sync })}>Mark all read</Button>} />
      <div className="toolbar">
        <div className="toolbar__end">
          <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: '', label: 'All' }, { value: 'false', label: 'Unread' }, { value: 'true', label: 'Read' }]} />
        </div>
      </div>
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} /> : list.rows.length ? (
        <>
          <ul className={`notes ${list.loading ? 'is-loading' : ''}`}>
            {list.rows.map(n => (
              <li key={n._id} className={`note ${n.read ? '' : 'is-unread'}`}>
                <button type="button" className="note__main" onClick={() => open(n)}>
                  <span className="note__icon" data-cat={n.relatedResourceType === 'Request' ? 'Requests' : n.relatedResourceType === 'Consumable' ? 'Inventory' : 'System'}><Bell size={18} aria-hidden="true" /></span>
                  <span className="note__text"><span className="note__title">{!n.read && <span className="note__dot" aria-label="Unread" />}{n.title}</span><span className="note__msg">{n.message}</span></span>
                  <span className="note__meta"><Badge tone="gray" dot={false}>{titleCase(n.type)}</Badge><span>{timeAgo(n.createdAt)}</span></span>
                </button>
                <Button size="sm" variant="ghost" loading={rowAction.pending === n._id} onClick={() => setRead(n, !n.read)}>{n.read ? 'Mark unread' : 'Mark read'}</Button>
              </li>
            ))}
          </ul>
          <Pagination page={list.page} pages={list.pagination.totalPages} total={list.pagination.total} size={list.size} sizes={[15, 30, 50]} onPage={list.setPage} onSize={list.setSize} />
        </>
      ) : <EmptyState icon={Bell} title="No notifications" description={filter ? 'Nothing matches this filter.' : 'New activity will show up here.'} />}
      {openN && (
        <Modal open onClose={() => setOpenN(null)} title={openN.title} description={fmtDateTime(openN.createdAt)}
          footer={<><Button onClick={() => setOpenN(null)}>Close</Button>{target(openN) && <Button variant="primary" onClick={() => { const t = target(openN); setOpenN(null); navigate(t); }}>Open</Button>}</>}>
          <div className="detail-head"><Badge tone="gray" dot={false}>{titleCase(openN.type)}</Badge></div>
          <p className="modal__text">{openN.message}</p>
        </Modal>
      )}
    </div>
  );
}
