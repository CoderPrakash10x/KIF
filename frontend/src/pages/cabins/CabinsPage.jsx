import { useEffect, useId, useState } from 'react';
import { Building2, Calendar, MoreHorizontal, Plus, Power, Settings, Users as UsersIcon, Wrench } from 'lucide-react';
import { PERMISSIONS as P } from '../../constants/roles';
import { useCan } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import useFields from '../../hooks/useFields';
import useQueryParam from '../../hooks/useQueryParam';
import useRowAction from '../../hooks/useRowAction';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState } from '../../components/common/Feedback';
import Button, { IconButton } from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Dropdown from '../../components/ui/Dropdown';
import { StatCard, StatGrid } from '../../components/ui/Card';
import { FilterSelect, Input, Select, SearchInput, Textarea } from '../../components/forms/Form';
import UserPicker from '../../components/forms/UserPicker';
import Pagination from '../../components/tables/Pagination';
import { ConfirmDialog, FormFooter, Modal } from '../../components/modals/Modal';
import { dayOf, fmtDate, fmtShortDate } from '../../utils/format';
import { todayISO } from '../../utils/time';

const STATUSES = ['FREE', 'REQUESTED', 'RESERVED', 'OCCUPIED', 'EXPIRED', 'MAINTENANCE'];

function AllotModal({ cabin, onClose, onDone }) {
  const formId = useId();
  const free = useApi(() => api.get('/cabins', { status: 'FREE', limit: 100 }), []);
  const f = useFields({ cabinId: cabin?._id || '', startupName: '', startDate: todayISO(), endDate: '', purpose: '' });
  const [founder, setFounder] = useState(null);
  const [members, setMembers] = useState([]);
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => {
    const e = {};
    if (!v.cabinId) e.cabinId = 'Choose a cabin.';
    if (!founder) e.founderId = 'Select the primary contact.';
    if (!v.startDate) e.startDate = 'Choose a start date.';
    if (!v.endDate) e.endDate = 'Choose an end date.';
    else if (v.startDate && v.endDate <= v.startDate) e.endDate = 'End date must be after the start date.';
    return e;
  };
  const submit = e => {
    e.preventDefault();
    run(validate, () => api.post('/cabins/allotments/direct', {
      cabinId: v.cabinId, founderId: founder._id, members: members.map(m => m._id), startupName: v.startupName.trim() || undefined,
      startDate: v.startDate, endDate: v.endDate, purpose: v.purpose.trim() || undefined,
    }), { onDone: () => { onDone(); onClose(); } });
  };
  const options = (free.data?.data || []).map(c => ({ value: c._id, label: `${c.cabinNumber} · seats ${c.capacity}` }));
  return (
    <Modal open onClose={onClose} size="lg" title="New allotment" description="Assign a free cabin to a founder or team." dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Allot cabin" />}>
      <form id={formId} onSubmit={submit} noValidate className="form-grid">
        <Select label="Cabin" required placeholder={options.length ? 'Select a free cabin' : 'No free cabins'} options={options} value={v.cabinId} onChange={e => f.set('cabinId', e.target.value)} error={errors.cabinId} />
        <Input label="Startup / team name" placeholder="e.g. NeuroLeaf" {...f.input('startupName')} error={errors.startupName} />
        <div className="span-2"><UserPicker label="Primary contact" required value={founder} onChange={setFounder} error={errors.founderId} /></div>
        <div className="span-2"><UserPicker label="Additional members" multiple value={members} onChange={setMembers} hint="Optional. Search and add team members." error={errors.members} /></div>
        <Input label="Start date" type="date" required {...f.input('startDate')} error={errors.startDate} />
        <Input label="End date" type="date" required min={v.startDate} {...f.input('endDate')} error={errors.endDate} />
        <Textarea label="Purpose" wrapperClass="span-2" placeholder="What will the team work on?" {...f.input('purpose')} error={errors.purpose} />
      </form>
    </Modal>
  );
}

function CabinForm({ cabin, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ cabinNumber: cabin?.cabinNumber || '', name: cabin?.name || '', type: cabin?.type || 'CABIN', capacity: String(cabin?.capacity || 4), location: cabin?.location || '' });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => {
    const e = {};
    if (!cabin && !v.cabinNumber.trim()) e.cabinNumber = 'Enter the cabin number.';
    if (!(Number(v.capacity) >= 1)) e.capacity = 'Capacity must be at least 1.';
    return e;
  };
  const body = () => ({ ...(cabin ? {} : { cabinNumber: v.cabinNumber.trim() }), name: v.name.trim() || undefined, type: v.type, capacity: Number(v.capacity), location: v.location.trim() || undefined });
  return (
    <Modal open onClose={onClose} size="md" title={cabin ? `Manage space · ${cabin.cabinNumber}` : 'Add cabin'} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={cabin ? 'Save changes' : 'Add cabin'} />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => (cabin ? api.patch(`/cabins/${cabin._id}`, body()) : api.post('/cabins', body())), { onDone: () => { onDone(); onClose(); } }); }}>
        {!cabin && <Input label="Cabin number" required placeholder="C-113" {...f.input('cabinNumber')} error={errors.cabinNumber} />}
        <Input label="Display name" {...f.input('name')} error={errors.name} />
        <Select label="Type" options={[{ value: 'CABIN', label: 'Cabin' }, { value: 'CO_WORKING_DESK', label: 'Co-working desk' }]} value={v.type} onChange={e => f.set('type', e.target.value)} />
        <Input label="Seating capacity" type="number" min="1" required {...f.input('capacity')} error={errors.capacity} />
        <Input label="Location" wrapperClass="span-2" placeholder="Ground floor" {...f.input('location')} error={errors.location} />
      </form>
    </Modal>
  );
}

function ReasonModal({ title, cta, tone = 'primary', hint, required, onClose, action, onDone }) {
  const formId = useId();
  const f = useFields({ reason: '' });
  const { busy, errors, run } = useSubmit();
  return (
    <Modal open onClose={onClose} size="sm" title={title} dismissible={!busy} footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={cta} tone={tone} />}>
      <form id={formId} noValidate className="stack" onSubmit={e => { e.preventDefault(); run(() => (required && !f.values.reason.trim() ? { reason: 'Please give a reason.' } : {}), () => action(f.values.reason.trim()), { onDone: () => { onDone(); onClose(); } }); }}>
        {hint && <p className="modal__text">{hint}</p>}
        <Textarea label="Reason" required={required} {...f.input('reason')} error={errors.reason} />
      </form>
    </Modal>
  );
}

function DetailModal({ cabin, onClose }) {
  const hist = useApi(() => api.get(`/cabins/${cabin._id}/history`, { limit: 20 }), [cabin._id]);
  const a = cabin.currentAllotment;
  return (
    <Modal open onClose={onClose} title={`Cabin ${cabin.cabinNumber}`} description={`${cabin.location || '—'} · seats ${cabin.capacity}`} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="detail-head"><Badge status={cabin.status} /></div>
      {a ? (
        <dl className="detail-list">
          <div><dt>Startup / team</dt><dd>{a.startupName || a.founderId?.startupName || '—'}</dd></div>
          <div><dt>Primary contact</dt><dd>{a.founderId?.name || '—'}</dd></div>
          <div><dt>Start date</dt><dd>{fmtDate(a.startDate)}</dd></div>
          <div><dt>End date</dt><dd>{fmtDate(a.endDate)}</dd></div>
          <div className="span-2"><dt>Purpose</dt><dd>{a.purpose || '—'}</dd></div>
        </dl>
      ) : <p className="muted">{cabin.maintenanceReason || 'No current allotment.'}</p>}
      <h3 className="subhead">Allotment history</h3>
      {hist.loading ? <p className="muted">Loading…</p> : (hist.data?.data || []).length ? (
        <ul className="rows">{hist.data.data.map(h => (
          <li key={h._id} className="row"><div className="row__main"><p className="row__title">{h.startupName || h.founderId?.name || 'Allotment'}</p><p className="row__sub">{fmtDate(h.startDate)} – {fmtDate(h.endDate)}</p></div><Badge status={h.status} /></li>
        ))}</ul>
      ) : <p className="muted">No previous allotments.</p>}
    </Modal>
  );
}

export default function CabinsPage() {
  const can = useCan();
  const rowAction = useRowAction();
  const q = useQueryParam('q');
  const [search, setSearch] = useState(q);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  useEffect(() => setSearch(q), [q]);
  const dq = useDebounce(search).trim();
  const manage = can(P.CABIN_MANAGE);

  const list = useServerList('/cabins', { status, search: dq }, { pageSize: 12 });
  const summary = useApi(() => api.get('/dashboard/summary'), []);
  const by = summary.data?.data?.cabins?.byStatus || {};
  const total = summary.data?.data?.cabins?.total ?? 0;
  const refresh = () => { list.reload(); summary.reload(); };
  const open = (type, cabin) => setModal({ type, cabin });
  const close = () => setModal(null);
  const moreTrigger = props => <IconButton icon={MoreHorizontal} label="More actions" {...props} />;

  const menu = c => [
    manage && c.currentAllotment && c.status === 'RESERVED' && { label: 'Activate allotment', icon: Calendar, onClick: () => rowAction.run(c._id, () => api.post(`/cabins/allotments/${c.currentAllotment._id}/activate`), { onDone: refresh }) },
    manage && c.currentAllotment && { label: 'End allotment (vacate)', icon: Power, danger: true, onClick: () => open('vacate', c) },
    manage && c.status === 'MAINTENANCE' && { label: 'Clear maintenance', icon: Wrench, onClick: () => rowAction.run(c._id, () => api.post(`/cabins/${c._id}/maintenance/clear`), { onDone: refresh }) },
    manage && c.status === 'FREE' && { label: 'Set maintenance', icon: Wrench, onClick: () => open('maintenance', c) },
    manage && { label: 'Manage space', icon: Settings, onClick: () => open('space', c) },
    manage && c.status === 'FREE' && { label: 'Deactivate cabin', icon: Power, danger: true, onClick: () => open('deactivate', c) },
  ];

  return (
    <div className="page">
      <PageHeader title="Cabins" description="Manage cabin availability, allotments and occupancy."
        actions={manage && <><Button icon={Plus} onClick={() => open('add')}>Add cabin</Button><Button variant="primary" icon={Plus} onClick={() => open('allot')}>New allotment</Button></>} />
      <StatGrid>
        <StatCard icon={Building2} label="Total" value={total} />
        <StatCard icon={Building2} tone="green" label="Available" value={by.FREE || 0} />
        <StatCard icon={Building2} tone="blue" label="Occupied" value={by.OCCUPIED || 0} hint={`${by.REQUESTED || 0} requested`} />
        <StatCard icon={Building2} tone="purple" label="Reserved" value={by.RESERVED || 0} />
        <StatCard icon={Wrench} tone="amber" label="Maintenance" value={by.MAINTENANCE || 0} />
      </StatGrid>
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search cabin number, name or location" label="Search cabins" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUSES.map(s => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }))} allLabel="All statuses" />
      </div>
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} description="Cabins could not be loaded." /> : !list.rows.length && !list.loading ? (
        <EmptyState icon={Building2} title="No cabins found" description="No cabins match your search or filters." action={<Button onClick={() => { setSearch(''); setStatus(''); }}>Clear filters</Button>} />
      ) : (
        <>
          <div className={`res-grid ${list.loading ? 'is-loading' : ''}`}>
            {list.rows.map(c => {
              const a = c.currentAllotment;
              return (
                <article key={c._id} className="res-card">
                  <header className="res-card__head">
                    <div><h3 className="res-card__title">Cabin {c.cabinNumber}</h3><p className="res-card__sub">{c.location || '—'} · seats {c.capacity}</p></div>
                    <Badge status={c.status} />
                  </header>
                  <div className="res-card__body">
                    {a ? (
                      <>
                        <p className="res-card__occupant">{a.startupName || a.founderId?.startupName || a.founderId?.name}{c.status === 'EXPIRED' && <Badge status="Expired" />}</p>
                        <dl className="meta">
                          <div><dt><UsersIcon size={14} aria-hidden="true" /> Contact</dt><dd>{a.founderId?.name || '—'}</dd></div>
                          <div><dt><Calendar size={14} aria-hidden="true" /> Period</dt><dd>{fmtShortDate(dayOf(a.startDate))} – {fmtShortDate(dayOf(a.endDate))}</dd></div>
                        </dl>
                        {a.purpose && <p className="res-card__purpose">{a.purpose}</p>}
                      </>
                    ) : <p className="muted">{c.status === 'MAINTENANCE' ? c.maintenanceReason || 'Under maintenance.' : 'Ready for allotment.'}</p>}
                  </div>
                  <footer className="res-card__foot">
                    <Button size="sm" onClick={() => open('detail', c)}>Details</Button>
                    {manage && c.status === 'FREE' && <Button size="sm" variant="primary" icon={Plus} onClick={() => open('allot', c)}>New allotment</Button>}
                    <Dropdown trigger={moreTrigger} items={menu(c)} label={`Actions for ${c.cabinNumber}`} />
                  </footer>
                </article>
              );
            })}
          </div>
          <Pagination page={list.page} pages={list.pagination.totalPages} total={list.pagination.total} size={list.size} sizes={[12, 24, 48]} onPage={list.setPage} onSize={list.setSize} />
        </>
      )}

      {modal?.type === 'allot' && <AllotModal cabin={modal.cabin} onClose={close} onDone={refresh} />}
      {(modal?.type === 'add' || modal?.type === 'space') && <CabinForm cabin={modal.cabin} onClose={close} onDone={refresh} />}
      {modal?.type === 'detail' && <DetailModal cabin={modal.cabin} onClose={close} />}
      {modal?.type === 'maintenance' && <ReasonModal title={`Maintenance · ${modal.cabin.cabinNumber}`} cta="Mark under maintenance" required hint="The cabin cannot be allotted or requested until maintenance is cleared." onClose={close} onDone={refresh} action={reason => api.post(`/cabins/${modal.cabin._id}/maintenance`, { reason })} />}
      {modal?.type === 'vacate' && <ReasonModal title={`End allotment · ${modal.cabin.cabinNumber}`} cta="End allotment" tone="danger" hint={`This ends the allotment for ${modal.cabin.currentAllotment?.startupName || 'the current team'} and frees the cabin.`} onClose={close} onDone={refresh} action={reason => api.post(`/cabins/allotments/${modal.cabin.currentAllotment._id}/vacate`, { reason })} />}
      <ConfirmDialog open={modal?.type === 'deactivate'} tone="danger" title={`Deactivate ${modal?.cabin?.cabinNumber}?`} confirmLabel="Deactivate" busy={rowAction.pending === 'deact'}
        message="The cabin is removed from lists and can no longer be allotted. Allotment history is kept." onCancel={close}
        onConfirm={() => rowAction.run('deact', () => api.del(`/cabins/${modal.cabin._id}`), { onDone: () => { close(); refresh(); } })} />
    </div>
  );
}
