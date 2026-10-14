import { useMemo, useState } from 'react';
import { Clock, MapPin, Plus, Users as UsersIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import useRowAction from '../../hooks/useRowAction';
import PageHeader from '../../components/common/PageHeader';
import QueryBoundary from '../../components/common/QueryBoundary';
import { EmptyState } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { ConfirmDialog } from '../../components/modals/Modal';
import { BookingModal } from './RoomModals';
import { Timeline, WeekStrip, buildSegments, normBooking, CLOSE, OPEN } from './RoomTimeline';
import { fmtDate, fmtShortDate, fmtTime, fmtTimeRange } from '../../utils/format';
import { addDays, todayISO } from '../../utils/time';

// Member workspace: see open slots, request a booking, track and cancel your own.
export default function BookingsPage() {
  const rowAction = useRowAction();
  const today = todayISO();
  const [roomId, setRoomId] = useState(null);
  const [weekStart, setWeekStart] = useState(today);
  const [date, setDate] = useState(today);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const rooms = useApi(() => api.get('/rooms', { limit: 50 }), []);
  const list = rooms.data?.data || [];
  const room = list.find(r => r._id === roomId) || list[0];
  const rid = room?._id;

  const avail = useApi(() => api.get(`/rooms/${rid}/availability`, { date }), [rid, date], { enabled: !!rid });
  const mine = useApi(() => api.get('/rooms/bookings/my', { limit: 20 }), []);
  const myPending = useApi(() => api.get('/requests/my-requests', { type: 'ROOM', status: 'PENDING', limit: 20 }), []);
  const bookings = useMemo(() => (avail.data?.data || []).map(normBooking), [avail.data]);
  const segments = useMemo(() => buildSegments(bookings, date), [bookings, date]);
  const refresh = () => { avail.reload(); mine.reload(); myPending.reload(); };
  const shift = n => { const next = addDays(weekStart, n * 7); if (next < today) return; setWeekStart(next); setDate(next); };

  const upcoming = (mine.data?.data || []).filter(b => ['PENDING', 'APPROVED', 'ACTIVE'].includes(b.status) && (b.date || '').slice(0, 10) >= today);
  const pendingReqs = myPending.data?.data || [];
  const roomName = id => list.find(r => r._id === String(id?._id || id))?.roomName || 'Room';

  const actions = b => (b.mine && ['APPROVED', 'PENDING'].includes(b.status) ? <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'booking', id: b.id, label: `${fmtDate(b.date)}, ${fmtTimeRange(b.start, b.end)}` })}>Cancel booking</Button> : null);

  return (
    <div className="page">
      <PageHeader title="Bookings" description="Request time in the AI / Neural Lab or the Podcast Room. An admin approves each request."
        actions={<Button variant="primary" icon={Plus} onClick={() => setModal({ roomId: rid, date })} disabled={!rid}>Request a slot</Button>} />
      <QueryBoundary query={rooms}>
        {!room ? <EmptyState title="No rooms available" description="Rooms have not been set up yet." /> : (
          <>
            <Tabs label="Rooms" value={rid} onChange={setRoomId} tabs={list.map(r => ({ id: r._id, label: r.roomName }))} />
            <div className="rooms-layout">
              <div className="rooms-main">
                <WeekStrip weekStart={weekStart} date={date} onDate={setDate} onShift={shift} />
                <Card title={`${room.roomName} · ${fmtDate(date)}`} description={`Open ${fmtTime(OPEN)} – ${fmtTime(CLOSE)}. Bookings are limited to 4 hours.`}>
                  <div className={avail.loading ? 'is-loading' : ''}>
                    <Timeline segments={segments} canBook renderActions={actions} onBook={(s, e) => setModal({ roomId: rid, date, start: s, end: e })} />
                  </div>
                </Card>
              </div>
              <aside className="rooms-side">
                <Card title="My requests awaiting approval">
                  {pendingReqs.length ? (
                    <ul className="rows">{pendingReqs.map(r => (
                      <li key={r._id} className="row">
                        <div className="row__main"><p className="row__title">{roomName(r.resourceId)}</p><p className="row__sub">{fmtShortDate(r.startDate)} · {fmtTimeRange(r.startTime, r.endTime)}</p></div>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'request', id: r._id, label: `${fmtShortDate(r.startDate)} ${fmtTimeRange(r.startTime, r.endTime)}` })}>Cancel</Button>
                      </li>
                    ))}</ul>
                  ) : <EmptyState compact title="No pending requests" />}
                </Card>
                <Card title="My upcoming bookings">
                  {upcoming.length ? (
                    <ul className="rows">{upcoming.map(b => (
                      <li key={b._id} className="row"><div className="row__main"><p className="row__title">{b.roomId?.roomName || roomName(b.roomId)}</p><p className="row__sub">{fmtShortDate(b.date)} · {fmtTimeRange(b.startTime, b.endTime)}</p></div><Badge status={b.status} /></li>
                    ))}</ul>
                  ) : <EmptyState compact title="No upcoming bookings" description="Pick an open slot to request one." />}
                </Card>
                <Card title="About this room">
                  <dl className="meta meta--stack">
                    <div><dt><MapPin size={14} aria-hidden="true" /> Location</dt><dd>{room.location || '—'}</dd></div>
                    <div><dt><UsersIcon size={14} aria-hidden="true" /> Capacity</dt><dd>{room.capacity} people</dd></div>
                    <div><dt><Clock size={14} aria-hidden="true" /> Hours</dt><dd>{fmtTimeRange(OPEN, CLOSE)}</dd></div>
                  </dl>
                  <ul className="chips">{(room.equipmentList || []).map(e => <li key={e.name}>{e.name}</li>)}</ul>
                </Card>
              </aside>
            </div>
          </>
        )}
      </QueryBoundary>
      {modal && <BookingModal initial={modal} rooms={list} mode="request" onClose={() => setModal(null)} onDone={refresh} />}
      <ConfirmDialog open={!!confirm} tone="danger" title={confirm?.kind === 'request' ? 'Cancel this request?' : 'Cancel this booking?'} confirmLabel="Cancel" busy={rowAction.pending === 'cancel'}
        message={confirm ? `${confirm.label}. The slot will be released.` : ''} onCancel={() => setConfirm(null)}
        onConfirm={() => rowAction.run('cancel', () => (confirm.kind === 'request' ? api.post(`/requests/${confirm.id}/cancel`) : api.post(`/rooms/bookings/${confirm.id}/cancel`)), { onDone: () => { setConfirm(null); refresh(); } })} />
    </div>
  );
}
