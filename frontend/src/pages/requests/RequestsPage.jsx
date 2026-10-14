import { useEffect, useState } from 'react';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import useQueryParam from '../../hooks/useQueryParam';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { StatCard, StatGrid } from '../../components/ui/Card';
import { Segmented, Tabs } from '../../components/ui/Tabs';
import { SearchInput, Textarea } from '../../components/forms/Form';
import DataTable from '../../components/tables/DataTable';
import { Modal } from '../../components/modals/Modal';
import { TYPE_LABEL, resourceLabel } from '../../utils/request';
import { dayOf, fmtDate, fmtDateTime, fmtShortDate, fmtTimeRange } from '../../utils/format';

export function whenText(r) {
  if (r.type === 'ROOM') return `${fmtShortDate(dayOf(r.startDate))} · ${fmtTimeRange(r.startTime, r.endTime)}`;
  if (r.startDate && r.endDate) return `${fmtShortDate(dayOf(r.startDate))} – ${fmtShortDate(dayOf(r.endDate))}`;
  if (r.endDate) return `Return by ${fmtShortDate(dayOf(r.endDate))}`;
  return '—';
}

export function RequestDetail({ r, admin, onClose, onDecided }) {
  const [remarks, setRemarks] = useState('');
  const [deciding, setDeciding] = useState(null);
  const { busy, errors, run } = useSubmit();
  const pending = admin && r.status === 'PENDING';
  const decide = decision => { setDeciding(decision); run(null, () => api.post(`/requests/${r._id}/${decision}`, { remarks: remarks.trim() || undefined }), { onDone: () => { onDecided?.(); onClose(); } }); };
  const meta = r.metadata || {};
  return (
    <Modal open onClose={onClose} title={`Request ${r.requestNumber}`} description={`${TYPE_LABEL[r.type]} request`} dismissible={!busy}
      footer={pending ? (
        <>
          <Button onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="danger" icon={X} loading={busy && deciding === 'reject'} disabled={busy} onClick={() => decide('reject')}>Reject</Button>
          <Button variant="primary" icon={Check} loading={busy && deciding === 'approve'} disabled={busy} onClick={() => decide('approve')}>Approve</Button>
        </>
      ) : <Button onClick={onClose}>Close</Button>}>
      <div className="detail-head"><Badge status={r.status} /><Badge tone="gray" dot={false}>{TYPE_LABEL[r.type]}</Badge></div>
      <dl className="detail-list">
        <div><dt>Resource</dt><dd>{resourceLabel(r)}</dd></div>
        {admin && <div><dt>Requester</dt><dd>{r.requestedBy?.name} <span className="muted">({r.requestedBy?.email})</span></dd></div>}
        <div><dt>Requested on</dt><dd>{fmtDateTime(r.createdAt)}</dd></div>
        <div><dt>When</dt><dd>{whenText(r)}</dd></div>
        {meta.quantity && <div><dt>Quantity</dt><dd>{meta.quantity}</dd></div>}
        {meta.startupName && <div><dt>Startup / team</dt><dd>{meta.startupName}</dd></div>}
        {meta.attendees && <div><dt>Attendees</dt><dd>{meta.attendees}</dd></div>}
        {meta.equipment?.length > 0 && <div className="span-2"><dt>Equipment</dt><dd>{meta.equipment.join(', ')}</dd></div>}
        <div className="span-2"><dt>Purpose</dt><dd>{r.purpose}</dd></div>
        {r.status !== 'PENDING' && (
          <>
            <div><dt>Reviewed by</dt><dd>{r.reviewedBy?.name || '—'}</dd></div>
            <div><dt>Reviewed on</dt><dd>{r.reviewedAt ? fmtDate(r.reviewedAt) : '—'}</dd></div>
            <div className="span-2"><dt>Admin remarks</dt><dd>{r.adminRemarks || '—'}</dd></div>
          </>
        )}
      </dl>
      {pending && <Textarea label="Remarks" hint="Optional. The requester sees this." maxLength={300} value={remarks} onChange={e => setRemarks(e.target.value)} error={errors.remarks} />}
    </Modal>
  );
}

const CATEGORIES = [{ id: '', label: 'All' }, { id: 'CABIN', label: 'Cabins' }, { id: 'HARDWARE', label: 'Hardware' }, { id: 'ROOM', label: 'Rooms' }, { id: 'EVENT', label: 'Events' }];

// Unified approval inbox (spec 4.6): one list, tabbed by resource category.
export default function RequestsPage() {
  const q = useQueryParam('q');
  const [search, setSearch] = useState(q);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [selected, setSelected] = useState(null);
  useEffect(() => { setSearch(q); if (q) setStatus(''); }, [q]);
  const dq = useDebounce(search).trim();

  const list = useServerList('/requests', { type, status, search: dq }, { pageSize: 10 });
  const summary = useApi(() => api.get('/dashboard/summary'), []);
  const s = summary.data?.data?.requests || {};
  const refresh = () => { list.reload(); summary.reload(); };

  const columns = [
    { key: 'requestNumber', header: 'Request', render: r => <span className="mono">{r.requestNumber}</span> },
    { key: 'resource', header: 'Resource', render: r => <span className="cell-stack"><strong>{resourceLabel(r)}</strong><small>{TYPE_LABEL[r.type]}</small></span> },
    { key: 'requester', header: 'Requester', render: r => <span className="cell-stack"><strong>{r.requestedBy?.name || '—'}</strong><small>{r.requestedBy?.role?.toLowerCase()}</small></span> },
    { key: 'createdAt', header: 'Date', render: r => fmtDate(r.createdAt) },
    { key: 'details', header: 'Details', className: 'cell-wide', render: r => <span className="cell-stack"><span className="clamp-2">{r.purpose}</span><small>{whenText(r)}</small></span> },
    { key: 'status', header: 'Status', render: r => <Badge status={r.status} /> },
    { key: 'actions', header: 'Action', align: 'right', render: r => <Button size="sm" variant={r.status === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setSelected(r)}>{r.status === 'PENDING' ? 'Review' : 'View'}</Button> },
  ];
  const filtered = !!(dq || type || status !== 'PENDING');

  return (
    <div className="page">
      <PageHeader title="Requests" description="One approval inbox for cabin, hardware, room and event requests." />
      <StatGrid>
        <StatCard icon={ClipboardCheck} tone="amber" label="Pending" value={s.pending ?? 0} />
        <StatCard icon={Check} tone="green" label="Approved" value={s.approved ?? 0} />
        <StatCard icon={X} tone="red" label="Rejected" value={s.rejected ?? 0} />
        <StatCard icon={ClipboardCheck} label="Total" value={s.total ?? 0} />
      </StatGrid>
      <Tabs label="Request category" value={type} onChange={setType} tabs={CATEGORIES} />
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search request number or purpose" label="Search requests" />
        <div className="toolbar__end">
          <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
        </div>
      </div>
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} description="Requests could not be loaded." /> : (
        <DataTable columns={columns} rows={list.rows} caption="Requests" onRowClick={setSelected}
          server={{ page: list.page, totalPages: list.pagination.totalPages, total: list.pagination.total, size: list.size, onPage: list.setPage, onSize: list.setSize, loading: list.loading }}
          empty={<EmptyState icon={ClipboardCheck} title="No requests found" description={filtered ? 'No requests match your filters.' : 'Nothing is waiting for a decision.'} action={filtered && <Button onClick={() => { setSearch(''); setType(''); setStatus('PENDING'); }}>Reset filters</Button>} />} />
      )}
      {selected && <RequestDetail r={selected} admin onClose={() => setSelected(null)} onDecided={refresh} />}
    </div>
  );
}
