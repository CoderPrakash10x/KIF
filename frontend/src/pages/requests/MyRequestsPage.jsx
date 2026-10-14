import { useEffect, useId, useState } from 'react';
import { CalendarPlus, ClipboardCheck, Plus } from 'lucide-react';
import { ROLES } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import useFields from '../../hooks/useFields';
import useQueryParam from '../../hooks/useQueryParam';
import useRowAction from '../../hooks/useRowAction';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Segmented, Tabs } from '../../components/ui/Tabs';
import { Input, SearchInput, Select, Textarea } from '../../components/forms/Form';
import DataTable from '../../components/tables/DataTable';
import { ConfirmDialog, FormFooter, Modal } from '../../components/modals/Modal';
import { RequestDetail, whenText } from './RequestsPage';
import { TYPE_LABEL, resourceLabel } from '../../utils/request';
import { fmtDate, fmtShortDate, titleCase } from '../../utils/format';
import { addDays, todayISO } from '../../utils/time';

function NewRequestModal({ onClose, onDone }) {
  const { user } = useAuth();
  const formId = useId();
  const [type, setType] = useState('CABIN');
  const f = useFields({ resourceId: '', startDate: todayISO(), endDate: addDays(todayISO(), 90), quantity: '1', startupName: user.startupName || '', purpose: '' });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const options = useApi(() => (type === 'CABIN' ? api.get('/cabins', { status: 'FREE', limit: 100 }) : api.get('/hardware', { limit: 100 })), [type]);
  const items = (options.data?.data || []).filter(i => (type === 'CABIN' ? true : i.condition === 'WORKING' && i.availableQuantity > 0));
  const picked = items.find(i => i._id === v.resourceId);
  const opts = items.map(i => ({ value: i._id, label: type === 'CABIN' ? `Cabin ${i.cabinNumber} · seats ${i.capacity}` : `${i.itemName} (${i.availableQuantity} available)` }));

  const validate = () => {
    const e = {};
    if (!v.resourceId) e.resourceId = 'Choose a resource.';
    if (v.purpose.trim().length < 5) e.purpose = 'Describe why you need this (at least 5 characters).';
    if (!v.endDate) e.endDate = type === 'CABIN' ? 'Choose an end date.' : 'Choose the expected return date.';
    if (type === 'CABIN' && !v.startDate) e.startDate = 'Choose a start date.';
    if (v.startDate && v.endDate && v.endDate <= v.startDate) e.endDate = 'End date must be after the start date.';
    if (type === 'HARDWARE' && picked && Number(v.quantity) > picked.availableQuantity) e.quantity = `Only ${picked.availableQuantity} available.`;
    return e;
  };
  const body = () => (type === 'CABIN'
    ? { type, resourceId: v.resourceId, startDate: v.startDate, endDate: v.endDate, purpose: v.purpose.trim(), metadata: { startupName: v.startupName.trim() || undefined } }
    : { type, resourceId: v.resourceId, startDate: todayISO(), endDate: v.endDate, purpose: v.purpose.trim(), metadata: { quantity: Number(v.quantity) || 1 } });

  return (
    <Modal open onClose={onClose} title="New request" description="An admin reviews every request. Room slots are requested from Bookings." dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Submit request" />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => api.post('/requests', body()), { onDone: () => { onDone(); onClose(); } }); }}>
        <Select label="Request type" required options={[{ value: 'CABIN', label: 'Cabin / co-working space' }, { value: 'HARDWARE', label: 'Hardware' }]} value={type} onChange={e => { setType(e.target.value); f.set('resourceId', ''); }} />
        <Select label={type === 'CABIN' ? 'Cabin' : 'Item'} required placeholder={options.loading ? 'Loading…' : opts.length ? 'Select…' : 'Nothing available right now'} options={opts} value={v.resourceId} onChange={e => f.set('resourceId', e.target.value)} error={errors.resourceId} />
        {type === 'CABIN' && <Input label="Start date" type="date" required min={todayISO()} {...f.input('startDate')} error={errors.startDate} />}
        <Input label={type === 'CABIN' ? 'End date' : 'Expected return'} type="date" required min={v.startDate || todayISO()} {...f.input('endDate')} error={errors.endDate} />
        {type === 'HARDWARE' && picked?.type === 'QUANTITY_BASED' && <Input label="Quantity" type="number" min="1" max={picked.availableQuantity} required {...f.input('quantity')} error={errors.quantity} />}
        {type === 'CABIN' && <Input label="Startup / team name" wrapperClass="span-2" {...f.input('startupName')} />}
        <Textarea label="Purpose" required wrapperClass="span-2" placeholder="What will you use it for?" {...f.input('purpose')} error={errors.purpose} />
      </form>
    </Modal>
  );
}

// Founders / Interns propose an event; an Admin approves it (spec 4.5).
function ProposeEventModal({ onClose, onDone }) {
  const formId = useId();
  const f = useFields({ title: '', venue: '', date: '', startTime: '', endTime: '', capacity: '', description: '' });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => {
    const e = {};
    if (v.title.trim().length < 3) e.title = 'Enter a title (at least 3 characters).';
    if (!v.venue.trim()) e.venue = 'Enter the venue.';
    if (!v.date) e.date = 'Choose a date.'; else if (v.date < todayISO()) e.date = 'Date cannot be in the past.';
    if (!v.startTime) e.startTime = 'Choose a start time.';
    if (!v.endTime) e.endTime = 'Choose an end time.'; else if (v.startTime && v.endTime <= v.startTime) e.endTime = 'End time must be after the start time.';
    if (!v.description.trim()) e.description = 'Add a short description.';
    return e;
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Propose an event" description="Admins check the venue and time, then approve or reject." dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Send proposal" />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => api.post('/events/propose', { title: v.title.trim(), venue: v.venue.trim(), date: v.date, startTime: v.startTime, endTime: v.endTime, description: v.description.trim(), capacity: v.capacity ? Number(v.capacity) : 0 }), { onDone: () => { onDone(); onClose(); } }); }}>
        <Input label="Title" required wrapperClass="span-2" {...f.input('title')} error={errors.title} />
        <Input label="Venue" required placeholder="e.g. Main Atrium, AI / Neural Lab" {...f.input('venue')} error={errors.venue} />
        <Input label="Expected attendees" type="number" min="0" hint="Optional." {...f.input('capacity')} error={errors.capacity} />
        <Input label="Date" type="date" required min={todayISO()} {...f.input('date')} error={errors.date} />
        <span />
        <Input label="Start time" type="time" required {...f.input('startTime')} error={errors.startTime} />
        <Input label="End time" type="time" required {...f.input('endTime')} error={errors.endTime} />
        <Textarea label="Description" required wrapperClass="span-2" rows={4} {...f.input('description')} error={errors.description} />
      </form>
    </Modal>
  );
}

export default function MyRequestsPage() {
  const { user } = useAuth();
  const rowAction = useRowAction();
  const q = useQueryParam('q');
  const [tab, setTab] = useState('requests');
  const [search, setSearch] = useState(q);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => setSearch(q), [q]);
  const dq = useDebounce(search).trim();
  const canPropose = user.role === ROLES.FOUNDER || user.role === ROLES.INTERN;

  const list = useServerList('/requests/my-requests', { status, search: dq }, { pageSize: 10 });
  const hw = useServerList('/hardware/my-transactions', {}, { pageSize: 10 });
  const refresh = () => { list.reload(); hw.reload(); };

  const columns = [
    { key: 'requestNumber', header: 'Request', render: r => <span className="mono">{r.requestNumber}</span> },
    { key: 'resource', header: 'Resource', render: r => <span className="cell-stack"><strong>{resourceLabel(r)}</strong><small>{TYPE_LABEL[r.type]}</small></span> },
    { key: 'createdAt', header: 'Requested', render: r => fmtDate(r.createdAt) },
    { key: 'details', header: 'Details', className: 'cell-wide', render: r => <span className="cell-stack"><span className="clamp-2">{r.purpose}</span><small>{whenText(r)}</small></span> },
    { key: 'status', header: 'Status', render: r => <Badge status={r.status} /> },
    { key: 'actions', header: 'Action', align: 'right', render: r => (
      <div className="row-actions">
        <Button size="sm" onClick={() => setSelected(r)}>View</Button>
        {r.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: r._id, label: r.requestNumber })}>Cancel</Button>}
      </div>) },
  ];
  const hwColumns = [
    { key: 'item', header: 'Item', render: t => <span className="cell-stack"><strong>{t.hardwareId?.itemName}</strong><small>{t.hardwareId?.assetTag || `×${t.quantity}`}</small></span> },
    { key: 'status', header: 'Status', render: t => <Badge status={t.status} /> },
    { key: 'issued', header: 'Issued', render: t => (t.issueDate ? fmtShortDate(t.issueDate) : '—') },
    { key: 'due', header: 'Due back', render: t => (t.expectedReturnDate ? fmtShortDate(t.expectedReturnDate) : '—') },
    { key: 'actions', header: 'Action', align: 'right', render: t => (['ISSUED', 'OVERDUE'].includes(t.status)
      ? <Button size="sm" variant="primary" loading={rowAction.pending === t._id} onClick={() => rowAction.run(t._id, () => api.post(`/hardware/transactions/${t._id}/return`), { success: 'Return recorded. An admin will inspect the item.', onDone: refresh })}>Return</Button>
      : <span className="muted">{titleCase(t.status)}</span>) },
  ];
  const server = l => ({ page: l.page, totalPages: l.pagination.totalPages, total: l.pagination.total, size: l.size, onPage: l.setPage, onSize: l.setSize, loading: l.loading });

  return (
    <div className="page">
      <PageHeader title="My requests" description="Track what you have asked for and return hardware you hold."
        actions={<>{canPropose && <Button icon={CalendarPlus} onClick={() => setModal('event')}>Propose event</Button>}<Button variant="primary" icon={Plus} onClick={() => setModal('request')}>New request</Button></>} />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ id: 'requests', label: 'Requests' }, { id: 'hardware', label: 'Hardware I hold', count: hw.pagination.total }]} />
      {tab === 'requests' ? (
        <>
          <div className="toolbar">
            <SearchInput value={search} onChange={setSearch} placeholder="Search request number or purpose" label="Search requests" />
            <div className="toolbar__end">
              <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'COMPLETED', label: 'Returned / done' }]} />
            </div>
          </div>
          {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} /> : (
            <DataTable columns={columns} rows={list.rows} caption="My requests" onRowClick={setSelected} server={server(list)}
              empty={<EmptyState icon={ClipboardCheck} title="No requests yet" description={search || status ? 'No requests match your filters.' : 'Ask for a cabin or hardware, or request a room slot from Bookings.'} action={<Button variant="primary" onClick={() => setModal('request')}>New request</Button>} />} />
          )}
        </>
      ) : <DataTable columns={hwColumns} rows={hw.rows} caption="Hardware I hold" server={server(hw)} empty={<EmptyState title="No hardware" description="Approved and issued items appear here, with a Return button." />} />}

      {modal === 'request' && <NewRequestModal onClose={() => setModal(null)} onDone={refresh} />}
      {modal === 'event' && <ProposeEventModal onClose={() => setModal(null)} onDone={refresh} />}
      {selected && <RequestDetail r={selected} onClose={() => setSelected(null)} />}
      <ConfirmDialog open={!!confirm} tone="danger" title="Cancel this request?" confirmLabel="Cancel request" busy={rowAction.pending === 'cancel'} message={confirm ? `${confirm.label} will be withdrawn and any held resource released.` : ''} onCancel={() => setConfirm(null)}
        onConfirm={() => rowAction.run('cancel', () => api.post(`/requests/${confirm.id}/cancel`), { onDone: () => { setConfirm(null); refresh(); } })} />
    </div>
  );
}
