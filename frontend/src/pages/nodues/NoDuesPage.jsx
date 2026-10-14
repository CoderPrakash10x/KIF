import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useRowAction from '../../hooks/useRowAction';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState, PageSkeleton } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Textarea } from '../../components/forms/Form';
import UserPicker from '../../components/forms/UserPicker';
import DataTable from '../../components/tables/DataTable';
import { Modal } from '../../components/modals/Modal';
import { fmtDate, fmtDateTime, titleCase } from '../../utils/format';

const MODULES = [['cabin', 'Cabins'], ['hardware', 'Hardware'], ['room', 'Room bookings'], ['requests', 'Requests']];

function Checks({ record }) {
  return (
    <ul className="rows">
      {MODULES.map(([k, label]) => {
        const c = record.moduleChecks?.[k] || {};
        return (
          <li key={k} className="row">
            <div className="row__main">
              <p className="row__title">{label}</p><p className="row__sub">{c.remarks || '—'}</p>
              {c.pendingItems?.length > 0 && <ul className="chips">{c.pendingItems.map(i => <li key={i}>{i}</li>)}</ul>}
            </div>
            <Badge status={c.status} />
          </li>
        );
      })}
    </ul>
  );
}

// Member view: start / re-check my own no-dues clearance (spec section 6).
export function MyNoDuesPage() {
  const rowAction = useRowAction();
  const q = useApi(async () => {
    try { return await api.get('/no-dues/my-status'); } catch (e) { if (e instanceof ApiError && e.status === 404) return { data: null }; throw e; }
  }, []);
  const raw = q.data?.data;
  const rec = raw && raw._id ? raw : null; // backend answers 200 {status:'NOT_STARTED'} when nothing exists yet
  if (q.loading && !q.data) return <PageSkeleton />;
  if (q.error && !q.data) return <div className="page"><ErrorState onRetry={q.reload} /></div>;
  return (
    <div className="page">
      <PageHeader title="No-dues clearance" description="Check that nothing is pending across cabins, hardware, rooms and requests before you exit." />
      {!rec ? (
        <EmptyState icon={ShieldCheck} title="No clearance started" description="Start a check to see what is still pending against your name."
          action={<Button variant="primary" loading={rowAction.pending === 'init'} onClick={() => rowAction.run('init', () => api.post('/no-dues/initiate', {}), { onDone: q.reload })}>Start no-dues check</Button>} />
      ) : (
        <Card title="Clearance status" description={`Last checked ${fmtDateTime(rec.lastCheckedAt)}`} actions={<Badge status={rec.overallStatus} />}>
          <Checks record={rec} />
          {rec.reviewRemarks && <p className="notice notice--info">Admin remarks: {rec.reviewRemarks}</p>}
          <div className="form-actions">
            {rec.certificateUrl && <a className="btn btn--secondary btn--md" href={rec.certificateUrl} target="_blank" rel="noreferrer">Download certificate</a>}
            <Button variant="primary" loading={rowAction.pending === 'recheck'} onClick={() => rowAction.run('recheck', () => api.post(`/no-dues/${rec._id}/recheck`), { onDone: q.reload })}>Re-check now</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// Admin view: review clearances, or start one for an exiting user.
export default function NoDuesAdminPage() {
  const list = useServerList('/no-dues', {}, { pageSize: 10 });
  const [sel, setSel] = useState(null);
  const [starting, setStarting] = useState(false);
  const [person, setPerson] = useState(null);
  const [remarks, setRemarks] = useState('');
  const { busy, run } = useSubmit();
  const review = decision => run(null, () => api.post(`/no-dues/${sel._id}/review`, { decision, remarks: remarks.trim() || undefined }), { onDone: () => { setSel(null); setRemarks(''); list.reload(); } });
  const columns = [
    { key: 'user', header: 'Person', render: r => <span className="cell-stack"><strong>{r.userId?.name || '—'}</strong><small>{titleCase(r.userId?.role)} · {r.userId?.startupName || r.userId?.department || ''}</small></span> },
    { key: 'status', header: 'Status', render: r => <Badge status={r.overallStatus} /> },
    { key: 'by', header: 'Started by', render: r => titleCase(r.initiatedBy) },
    { key: 'checked', header: 'Last checked', render: r => fmtDate(r.lastCheckedAt) },
    { key: 'actions', header: 'Action', align: 'right', render: r => <Button size="sm" variant="primary" onClick={() => setSel(r)}>Review</Button> },
  ];
  return (
    <div className="page">
      <PageHeader title="No-dues" description="One-click clearance across cabins, hardware, rooms and requests."
        actions={<Button variant="primary" onClick={() => setStarting(true)}>Start for a user</Button>} />
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} /> : (
        <DataTable columns={columns} rows={list.rows} caption="No-dues requests" onRowClick={setSel}
          server={{ page: list.page, totalPages: list.pagination.totalPages, total: list.pagination.total, size: list.size, onPage: list.setPage, onSize: list.setSize, loading: list.loading }}
          empty={<EmptyState icon={ShieldCheck} title="No clearance requests" description="Requests appear when someone starts one or you start it for them." />} />
      )}
      {sel && (
        <Modal open onClose={() => setSel(null)} size="lg" title={`No-dues · ${sel.userId?.name}`} dismissible={!busy}
          footer={<><Button onClick={() => setSel(null)} disabled={busy}>Close</Button><Button variant="danger" disabled={busy || sel.status !== 'IN_REVIEW'} onClick={() => review('REJECT')}>Reject</Button><Button variant="primary" loading={busy} disabled={sel.status !== 'IN_REVIEW'} onClick={() => review('APPROVE')}>Approve &amp; issue certificate</Button></>}>
          <div className="detail-head"><Badge status={sel.overallStatus} /></div>
          <Checks record={sel} />
          {sel.status !== 'IN_REVIEW' && <p className="notice notice--info">Only requests that have auto-cleared (In review) can be approved or sent back.</p>}
          <Textarea label="Remarks" hint="Optional." value={remarks} onChange={e => setRemarks(e.target.value)} />
        </Modal>
      )}
      {starting && (
        <Modal open onClose={() => setStarting(false)} size="sm" title="Start no-dues check" description="Runs the clearance check for the selected person." dismissible={!busy}
          footer={<><Button onClick={() => setStarting(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!person} onClick={() => run(null, () => api.post('/no-dues/initiate', { userId: person._id }), { onDone: () => { setStarting(false); setPerson(null); list.reload(); } })}>Start check</Button></>}>
          <UserPicker label="Person" required value={person} onChange={setPerson} status="" />
        </Modal>
      )}
    </div>
  );
}
