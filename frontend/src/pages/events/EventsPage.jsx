import { useEffect, useId, useState } from 'react';
import { Award, Ban, CalendarDays, Check, CheckCheck, MapPin, MoreHorizontal, Pencil, Plus, Send, Users as UsersIcon } from 'lucide-react';
import { PERMISSIONS as P } from '../../constants/roles';
import { useCan } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useFields from '../../hooks/useFields';
import useRowAction from '../../hooks/useRowAction';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/common/Feedback';
import Button, { IconButton } from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Dropdown from '../../components/ui/Dropdown';
import { Tabs } from '../../components/ui/Tabs';
import { Checkbox, Input, Textarea } from '../../components/forms/Form';
import Pagination from '../../components/tables/Pagination';
import { ConfirmDialog, FormFooter, Modal } from '../../components/modals/Modal';
import { dayOfMonth, fmtDate, fmtTimeRange, monthOf, pluralize } from '../../utils/format';
import { todayISO } from '../../utils/time';

function EventForm({ event, onClose, onDone }) {
  const formId = useId();
  const listId = useId();
  const rooms = useApi(() => api.get('/rooms', { limit: 50 }), []);
  const f = useFields({
    title: event?.title || '', venue: event?.venue || '', date: event?.date?.slice(0, 10) || '', startTime: event?.startTime || '', endTime: event?.endTime || '',
    capacity: String(event?.capacity ?? ''), description: event?.description || '', certificateEnabled: !!event?.certificateEnabled, publishImmediately: false,
  });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => {
    const e = {};
    if (v.title.trim().length < 3) e.title = 'Enter a title (at least 3 characters).';
    if (!v.venue.trim()) e.venue = 'Enter the venue.';
    if (!v.date) e.date = 'Choose a date.'; else if (!event && v.date < todayISO()) e.date = 'Date cannot be in the past.';
    if (!v.startTime) e.startTime = 'Choose a start time.';
    if (!v.endTime) e.endTime = 'Choose an end time.'; else if (v.startTime && v.endTime <= v.startTime) e.endTime = 'End time must be after the start time.';
    if (!v.description.trim()) e.description = 'Add a short description.';
    return e;
  };
  const body = () => ({
    title: v.title.trim(), venue: v.venue.trim(), date: v.date, startTime: v.startTime, endTime: v.endTime, description: v.description.trim(),
    capacity: v.capacity ? Number(v.capacity) : 0, certificateEnabled: v.certificateEnabled, ...(event ? {} : { publishImmediately: v.publishImmediately }),
  });
  return (
    <Modal open onClose={onClose} size="lg" title={event ? 'Edit event' : 'Create event'} description="Venues that are bookable rooms are locked automatically for the event time." dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={event ? 'Save changes' : v.publishImmediately ? 'Create & publish' : 'Save draft'} />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => (event ? api.patch(`/events/${event._id}`, body()) : api.post('/events', body())), { onDone: () => { onDone(); onClose(); } }); }}>
        <Input label="Title" required wrapperClass="span-2" {...f.input('title')} error={errors.title} />
        <Input label="Venue" required list={listId} placeholder="Choose or type a venue" {...f.input('venue')} error={errors.venue} />
        <datalist id={listId}>{[...(rooms.data?.data || []).map(r => r.roomName), 'Main Atrium', 'Maker Lab', 'Seminar Hall', 'Conference Room B'].map(x => <option key={x} value={x} />)}</datalist>
        <Input label="Capacity" type="number" min="0" hint="0 = unlimited" {...f.input('capacity')} error={errors.capacity} />
        <Input label="Date" type="date" required min={event ? undefined : todayISO()} {...f.input('date')} error={errors.date} />
        <span />
        <Input label="Start time" type="time" required {...f.input('startTime')} error={errors.startTime} />
        <Input label="End time" type="time" required {...f.input('endTime')} error={errors.endTime} />
        <Textarea label="Description" required wrapperClass="span-2" rows={4} {...f.input('description')} error={errors.description} />
        <div className="span-2 stack">
          <Checkbox label="Issue certificates to attendees after the event" checked={v.certificateEnabled} onChange={e => f.set('certificateEnabled', e.target.checked)} />
          {!event && <Checkbox label="Publish immediately (visible to everyone)" checked={v.publishImmediately} onChange={e => f.set('publishImmediately', e.target.checked)} />}
        </div>
      </form>
    </Modal>
  );
}

function RegistrationsModal({ event, onClose, onChange }) {
  const rowAction = useRowAction();
  const regs = useApi(() => api.get(`/events/${event._id}/registrations`, { status: 'REGISTERED', limit: 100 }), [event._id]);
  const rows = regs.data?.data || [];
  const totalRegs = regs.data?.pagination?.total ?? rows.length;
  const mark = (id, status) => rowAction.run(id + status, () => api.post(`/events/registrations/${id}/attendance`, { status }), { onDone: regs.reload });
  const certs = () => rowAction.run('certs', () => api.post(`/events/${event._id}/generate-certificates`), { onDone: () => { regs.reload(); onChange(); } });
  return (
    <Modal open onClose={onClose} size="lg" title={`Registrations · ${event.title}`} description={`${totalRegs} registered${totalRegs > rows.length ? ` (showing first ${rows.length})` : ''} · mark attendance, then generate certificates`}
      footer={<><Button onClick={onClose}>Close</Button>{event.certificateEnabled && <Button variant="primary" icon={Award} loading={rowAction.pending === 'certs'} onClick={certs}>Generate certificates</Button>}</>}>
      {regs.loading && !regs.data ? <ListSkeleton rows={3} /> : !rows.length ? <EmptyState compact title="No registrations yet" /> : (
        <ul className="rows">{rows.map(r => (
          <li key={r._id} className="row">
            <div className="row__main"><p className="row__title">{r.userId?.name}</p><p className="row__sub">{r.userId?.email}{r.userId?.startupName ? ` · ${r.userId.startupName}` : ''}</p></div>
            <Badge status={r.attendanceStatus} />
            <Button size="sm" icon={Check} aria-label={`Mark ${r.userId?.name} present`} loading={rowAction.pending === r._id + 'ATTENDED'} onClick={() => mark(r._id, 'ATTENDED')}>Present</Button>
            <Button size="sm" variant="ghost" loading={rowAction.pending === r._id + 'NOT_ATTENDED'} onClick={() => mark(r._id, 'NOT_ATTENDED')}>Absent</Button>
            {r.certificateUrl && <a className="link-action" href={r.certificateUrl} target="_blank" rel="noreferrer">Certificate</a>}
          </li>
        ))}</ul>
      )}
    </Modal>
  );
}

export default function EventsPage() {
  const can = useCan();
  const rowAction = useRowAction();
  const manage = can(P.EVENT_MANAGE);
  const [tab, setTab] = useState('upcoming');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);

  const tabs = manage
    ? [{ id: 'upcoming', label: 'Upcoming' }, { id: 'drafts', label: 'Drafts & proposals' }, { id: 'past', label: 'Past' }, { id: 'cancelled', label: 'Cancelled' }]
    : [{ id: 'upcoming', label: 'Upcoming' }, { id: 'mine', label: 'My registrations' }, { id: 'past', label: 'Past' }];
  const params = { upcoming: tab === 'upcoming' ? 'true' : undefined, status: { drafts: 'DRAFT', past: 'COMPLETED', cancelled: 'CANCELLED' }[tab] };
  const list = useServerList(tab === 'mine' ? '/events/my-registrations' : '/events', params, { pageSize: 9 });
  useEffect(() => { list.setPage(1); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => list.reload();
  const close = () => setModal(null);
  const moreTrigger = props => <IconButton icon={MoreHorizontal} label="More actions" {...props} />;

  // my-registrations rows are registrations with a populated event
  // Decide by the row's shape, not the tab: while switching tabs the previous tab's rows are still on screen for a moment.
  const isRegistration = r => !!r && typeof r.eventId === 'object' && r.eventId !== null && !r.title;
  const events = list.rows.map(r => (isRegistration(r) ? { ...r.eventId, registeredCount: undefined, myRegistration: { status: r.status, attendanceStatus: r.attendanceStatus }, certificateUrl: r.certificateUrl } : r)).filter(e => e && e._id && e.date);
  const rsvp = e => (['REGISTERED', 'WAITLISTED'].includes(e.myRegistration?.status)
    ? <Button size="sm" icon={Check} loading={rowAction.pending === e._id} onClick={() => rowAction.run(e._id, () => api.post(`/events/${e._id}/cancel-registration`), { onDone: refresh })}>{e.myRegistration.status === 'WAITLISTED' ? 'Waitlisted · leave' : 'Registered'}</Button>
    : <Button size="sm" variant="primary" loading={rowAction.pending === e._id} onClick={() => rowAction.run(e._id, () => api.post(`/events/${e._id}/register`), { onDone: refresh })}>Register</Button>);
  const canRsvp = e => e.status === 'PUBLISHED' && tab !== 'past';
  const menu = e => [
    manage && ['DRAFT', 'PUBLISHED'].includes(e.status) && { label: 'Edit event', icon: Pencil, onClick: () => setModal({ type: 'form', event: e }) },
    manage && e.status === 'DRAFT' && { label: 'Publish', icon: Send, onClick: () => rowAction.run(e._id, () => api.post(`/events/${e._id}/publish`), { onDone: refresh }) },
    manage && e.status !== 'DRAFT' && e.status !== 'CANCELLED' && { label: 'Registrations & attendance', icon: UsersIcon, onClick: () => setModal({ type: 'regs', event: e }) },
    manage && ['PUBLISHED', 'ONGOING'].includes(e.status) && { label: 'Mark completed', icon: CheckCheck, onClick: () => rowAction.run(e._id, () => api.post(`/events/${e._id}/complete`), { onDone: refresh }) },
    manage && ['DRAFT', 'PUBLISHED'].includes(e.status) && { label: 'Cancel event', icon: Ban, danger: true, onClick: () => setModal({ type: 'cancel', event: e }) },
  ];

  return (
    <div className="page">
      <PageHeader title="Events" description="Workshops, meetups and demo days across KIF."
        actions={manage && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Create event</Button>} />
      <Tabs label="When" value={tab} onChange={setTab} tabs={tabs} />
      {list.error && !events.length ? <ErrorState onRetry={list.reload} description="Events could not be loaded." /> : !events.length && !list.loading ? (
        <EmptyState icon={CalendarDays} title={tab === 'mine' ? 'No registrations yet' : `No ${tab === 'drafts' ? 'draft' : tab} events`} description={tab === 'upcoming' ? (manage ? 'Create an event to get started.' : 'Check back soon.') : 'Nothing to show here.'} />
      ) : (
        <>
          <div className={`res-grid res-grid--events ${list.loading ? 'is-loading' : ''}`}>
            {events.map(e => (
              <article key={e._id} className="res-card">
                <header className="res-card__head">
                  <span className="datechip datechip--lg"><strong>{dayOfMonth(e.date)}</strong><small>{monthOf(e.date)}</small></span>
                  <div className="res-card__headtext"><h3 className="res-card__title">{e.title}</h3><p className="res-card__sub">{fmtTimeRange(e.startTime, e.endTime)}</p></div>
                  {e.status !== 'PUBLISHED' && <Badge status={e.status} />}
                </header>
                <div className="res-card__body">
                  <dl className="meta">
                    <div><dt><MapPin size={14} aria-hidden="true" /> Venue</dt><dd>{e.venue}</dd></div>
                    {e.registeredCount !== undefined && <div><dt><UsersIcon size={14} aria-hidden="true" /> Registered</dt><dd>{e.registeredCount}{e.capacity ? ` / ${e.capacity}` : ''}</dd></div>}
                    {e.myRegistration && <div><dt>My registration</dt><dd><Badge status={e.myRegistration.status} /></dd></div>}
                    {tab === 'mine' && <div><dt>Attendance</dt><dd><Badge status={e.myRegistration?.attendanceStatus} /></dd></div>}
                  </dl>
                  {e.description && <p className="res-card__purpose">{e.description}</p>}
                </div>
                <footer className="res-card__foot">
                  <Button size="sm" onClick={() => setDetail(e)}>Details</Button>
                  {canRsvp(e) && can(P.EVENT_RSVP) && rsvp(e)}
                  {e.certificateUrl && <a className="btn btn--secondary btn--sm" href={e.certificateUrl} target="_blank" rel="noreferrer"><Award size={16} aria-hidden="true" />Certificate</a>}
                  <Dropdown trigger={moreTrigger} items={menu(e)} label={`Actions for ${e.title}`} />
                </footer>
              </article>
            ))}
          </div>
          <Pagination page={list.page} pages={list.pagination.totalPages} total={list.pagination.total} size={list.size} sizes={[9, 18, 36]} onPage={list.setPage} onSize={list.setSize} />
        </>
      )}
      {modal?.type === 'form' && <EventForm event={modal.event} onClose={close} onDone={refresh} />}
      {modal?.type === 'regs' && <RegistrationsModal event={modal.event} onClose={close} onChange={refresh} />}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={detail.title} description={`${fmtDate(detail.date)} · ${fmtTimeRange(detail.startTime, detail.endTime)}`}
          footer={<><Button onClick={() => setDetail(null)}>Close</Button>{canRsvp(detail) && can(P.EVENT_RSVP) && rsvp(detail)}</>}>
          <div className="detail-head"><Badge status={detail.status} />{detail.registeredCount !== undefined && <Badge tone="gray" dot={false}>{pluralize(detail.registeredCount, 'registration')}</Badge>}</div>
          <dl className="detail-list">
            <div><dt>Venue</dt><dd>{detail.venue}</dd></div>
            <div><dt>Capacity</dt><dd>{detail.capacity || 'Unlimited'}</dd></div>
            <div className="span-2"><dt>About</dt><dd>{detail.description}</dd></div>
            {detail.certificateEnabled && <div className="span-2"><dt>Certificate</dt><dd>Attendees receive a certificate after the event.</dd></div>}
          </dl>
        </Modal>
      )}
      <ConfirmDialog open={modal?.type === 'cancel'} tone="danger" title="Cancel this event?" confirmLabel="Cancel event" busy={rowAction.pending === 'cancel'}
        message={modal?.event ? `${modal.event.title} will be cancelled and registered attendees notified.` : ''} onCancel={close}
        onConfirm={() => rowAction.run('cancel', () => api.post(`/events/${modal.event._id}/cancel`, { reason: 'Cancelled by admin' }), { onDone: () => { close(); refresh(); } })} />
    </div>
  );
}