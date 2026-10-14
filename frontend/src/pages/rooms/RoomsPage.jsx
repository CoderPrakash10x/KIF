import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, Clock, MapPin, Pencil, Plus, UserCog, Users as UsersIcon, X } from 'lucide-react';
import { PERMISSIONS as P, ROLES } from '../../constants/roles';
import { useAuth, useBase, useCan } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import useRowAction from '../../hooks/useRowAction';
import PageHeader from '../../components/common/PageHeader';
import QueryBoundary from '../../components/common/QueryBoundary';
import { EmptyState } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import { Card, StatCard, StatGrid } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { ConfirmDialog } from '../../components/modals/Modal';
import { BlockModal, BookingModal } from './RoomModals';
import { QrCard } from '../hardware/HardwareModals';
import { AssignAdminModal, ManageRoomModal } from './RoomAdminModals';
import { Timeline, WeekStrip, buildSegments, normBooking, CLOSE, OPEN } from './RoomTimeline';
import { fmtDate, fmtShortDate, fmtTime, fmtTimeRange } from '../../utils/format';
import { addDays, toMin, todayISO } from '../../utils/time';

export default function RoomsPage() {
  const can = useCan();
  const { user } = useAuth();
  const isSA = user.role === ROLES.SUPER_ADMIN;
  const base = useBase();
  const rowAction = useRowAction();
  const today = todayISO();
  const [roomId, setRoomId] = useState(null);
  const [weekStart, setWeekStart] = useState(today);
  const [date, setDate] = useState(today);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // Admins receive only the rooms they are assigned to (server-side); the Super Admin receives all six.
  const rooms = useApi(() => api.get('/rooms', { limit: 50, managed: 'true' }), []);
  const list = rooms.data?.data || [];
  const room = list.find(r => r._id === roomId) || list[0];
  const rid = room?._id;
  const manage = can(P.ROOM_MANAGE) && (isSA || !!rooms.data?.data?.find(r => r.canManage));

  const week = useApi(() => api.get('/rooms/bookings/all', { roomId: rid, fromDate: weekStart, toDate: addDays(weekStart, 6), limit: 100 }), [rid, weekStart], { enabled: !!rid });
  const pending = useApi(() => api.get('/requests', { type: 'ROOM', status: 'PENDING', limit: 10 }), []);
  const bookings = useMemo(() => (week.data?.data || []).filter(b => b.status !== 'CANCELLED' && b.status !== 'REJECTED').map(normBooking), [week.data]);
  const segments = useMemo(() => buildSegments(bookings, date), [bookings, date]);
  const refresh = () => { week.reload(); pending.reload(); rooms.reload(); };

  const load = d => {
    const mins = bookings.filter(b => b.date === d);
    const total = mins.reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0);
    return { count: mins.length, pct: Math.min(100, Math.round((total / (toMin(CLOSE) - toMin(OPEN))) * 100)) };
  };
  const shift = n => { const next = addDays(weekStart, n * 7); if (next < today) return; setWeekStart(next); setDate(next); };
  const decide = (req, decision) => rowAction.run(`${decision}-${req._id}`, () => api.post(`/requests/${req._id}/${decision}`, {}), { onDone: refresh });
  const roomPending = (pending.data?.data || []).filter(r => String(r.resourceId?._id || r.resourceId) === rid);

  const actions = b => (
    <>
      {b.maintenance && manage && <Button size="sm" loading={rowAction.pending === `un-${b.id}`} onClick={() => rowAction.run(`un-${b.id}`, () => api.post(`/rooms/bookings/${b.id}/unblock-maintenance`), { onDone: refresh })}>Reopen slot</Button>}
      {!b.maintenance && manage && ['APPROVED', 'PENDING'].includes(b.status) && b.date >= today && <Button size="sm" variant="ghost" onClick={() => setConfirm(b)}>Cancel booking</Button>}
    </>
  );

  return (
    <div className="page">
      <PageHeader title="Rooms" description={isSA ? 'Slot-based time in all six KIF rooms. Assign each room an administrator.' : 'Slot-based time in the rooms you administer.'}
        actions={manage && <><Button icon={Ban} onClick={() => setModal({ type: 'block', initial: { roomId: rid, date } })} disabled={!rid}>Block time</Button><Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'book', initial: { roomId: rid, date } })} disabled={!rid}>Book a room</Button></>} />
      <QueryBoundary query={rooms}>
        {!room ? <EmptyState title={isSA ? 'No rooms configured' : 'No rooms assigned to you'} description={isSA ? 'Run the migration to create the six rooms.' : 'The Super Admin assigns each room to an administrator. Once you are assigned, it appears here.'} /> : (
          <>
            <StatGrid>
              <StatCard icon={Clock} label="Bookings this week" value={bookings.length} hint={room.roomName} />
              <StatCard icon={Clock} tone="amber" label="Awaiting approval" value={roomPending.length} hint={room.assignedAdmin ? `Admin: ${room.assignedAdmin.name}` : 'No administrator assigned'} />
              <StatCard icon={UsersIcon} tone="purple" label="Capacity" value={room.capacity ?? '—'} hint={room.capacity ? 'People' : 'Not configured'} />
            </StatGrid>
            <Tabs label="Rooms" value={rid} onChange={setRoomId} tabs={list.map(r => ({ id: r._id, label: r.roomName }))} />
            <div className="rooms-layout">
              <div className="rooms-main">
                <WeekStrip weekStart={weekStart} date={date} onDate={setDate} onShift={shift} load={load} />
                <Card title={`${room.roomName} · ${fmtDate(date)}`} description={`Open ${fmtTime(OPEN)} – ${fmtTime(CLOSE)}. Bookings are limited to 4 hours.`}>
                  <div className={week.loading ? 'is-loading' : ''}>
                    <Timeline segments={segments} canBook={manage} canBlock={manage} showName renderActions={actions}
                      onBook={(startTime, endTime) => setModal({ type: 'book', initial: { roomId: rid, date, start: startTime, end: endTime } })}
                      onBlock={(startTime, endTime) => setModal({ type: 'block', initial: { roomId: rid, date, start: startTime, end: endTime } })} />
                  </div>
                </Card>
              </div>
              <aside className="rooms-side">
                {isSA && (
                  <Card title="Room administrators" description="Who approves requests for each room.">
                    <ul className="rows room-admin-list">{list.map(r => (
                      <li key={r._id} className="row">
                        <div className="row__main"><p className="row__title">{r.roomName}</p><p className="row__sub">{r.assignedAdmin ? r.assignedAdmin.name : 'Unassigned (Super Admin only)'}</p></div>
                        <Button size="sm" icon={UserCog} onClick={() => setModal({ type: 'assign', room: r })} aria-label={`${r.assignedAdmin ? 'Change' : 'Assign'} administrator for ${r.roomName}`}>{r.assignedAdmin ? 'Change' : 'Assign'}</Button>
                      </li>
                    ))}</ul>
                  </Card>
                )}
                <Card title="Pending room requests" description="Approve to create the booking.">
                  {roomPending.length ? (
                    <ul className="rows">{roomPending.map(r => (
                      <li key={r._id} className="row">
                        <div className="row__main"><p className="row__title">{r.requestedBy?.name}</p><p className="row__sub">{fmtShortDate(r.startDate)} · {fmtTimeRange(r.startTime, r.endTime)}</p></div>
                        <Button size="sm" variant="primary" icon={Check} loading={rowAction.pending === `approve-${r._id}`} onClick={() => decide(r, 'approve')} aria-label="Approve" />
                        <Button size="sm" icon={X} loading={rowAction.pending === `reject-${r._id}`} onClick={() => decide(r, 'reject')} aria-label="Reject" />
                      </li>
                    ))}</ul>
                  ) : <EmptyState compact title="Nothing waiting" />}
                  <p className="card__foot-link"><Link to={`${base}/requests`} className="link-action">Open approval inbox</Link></p>
                </Card>
                <Card title="About this room" actions={room.canManage && <Button size="sm" icon={Pencil} onClick={() => setModal({ type: 'manage', room })}>Manage room</Button>}>
                  {room.setupRequired && room.canManage && <p className="notice notice--warn">Capacity or location has not been confirmed yet.</p>}
                  <dl className="meta meta--stack">
                    <div><dt><MapPin size={14} aria-hidden="true" /> Location</dt><dd>{room.location || '—'}</dd></div>
                    <div><dt><UsersIcon size={14} aria-hidden="true" /> Capacity</dt><dd>{room.capacity ? `${room.capacity} people` : 'Not configured'}</dd></div>
                    <div><dt><Clock size={14} aria-hidden="true" /> Hours</dt><dd>{fmtTimeRange(OPEN, CLOSE)}</dd></div>
                  </dl>
                  <ul className="chips" aria-label="Equipment">{(room.equipmentList || []).map(e => <li key={e.name}>{e.name}</li>)}</ul>
                  <h3 className="subhead">Room QR code</h3>
                  <QrCard type="room" id={room._id} />
                </Card>
              </aside>
            </div>
          </>
        )}
      </QueryBoundary>
      {modal?.type === 'assign' && <AssignAdminModal room={modal.room} onClose={() => setModal(null)} onDone={refresh} />}
      {modal?.type === 'manage' && <ManageRoomModal room={modal.room} onClose={() => setModal(null)} onDone={refresh} />}
      {modal?.type === 'book' && <BookingModal initial={modal.initial} rooms={list} mode="direct" onClose={() => setModal(null)} onDone={refresh} />}
      {modal?.type === 'block' && <BlockModal initial={modal.initial} rooms={list} onClose={() => setModal(null)} onDone={refresh} />}
      <ConfirmDialog open={!!confirm} title="Cancel this booking?" tone="danger" confirmLabel="Cancel booking" busy={rowAction.pending === 'cancel'}
        message={confirm ? `${fmtDate(confirm.date)}, ${fmtTimeRange(confirm.start, confirm.end)}. The slot will be released.` : ''} onCancel={() => setConfirm(null)}
        onConfirm={() => rowAction.run('cancel', () => api.post(`/rooms/bookings/${confirm.id}/cancel`), { onDone: () => { setConfirm(null); refresh(); } })} />
    </div>
  );
}
