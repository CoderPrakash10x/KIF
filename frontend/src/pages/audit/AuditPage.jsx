import { useState } from 'react';
import { Download, Layers, Lock, ScrollText, ShieldCheck, Cog } from 'lucide-react';
import { PERMISSIONS as P } from '../../constants/roles';
import { useCan } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, toUserMessage } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { StatCard, StatGrid } from '../../components/ui/Card';
import { FilterSelect, Input, SearchInput } from '../../components/forms/Form';
import UserPicker from '../../components/forms/UserPicker';
import DataTable from '../../components/tables/DataTable';
import { Modal } from '../../components/modals/Modal';
import { fmtDateTime, titleCase } from '../../utils/format';

export default function AuditPage() {
  const can = useCan();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(null);
  const dq = useDebounce(search).trim();
  const filters = { search: dq, module, action, actorId: actor?._id, from, to };

  const list = useServerList('/audit-logs', filters, { pageSize: 20 });
  const meta = useApi(() => api.get('/audit-logs/meta'), []);
  const m = meta.data?.data || { modules: [], actions: [] };
  const detail = useApi(() => api.get(`/audit-logs/${selected._id}`), [selected?._id], { enabled: !!selected });
  const filtered = !!(dq || module || action || actor || from || to);
  const clear = () => { setSearch(''); setModule(''); setAction(''); setActor(null); setFrom(''); setTo(''); };
  const exportCsv = async () => {
    try { await api.download('/audit-logs/export', filters, 'kif-audit-log.csv'); toast.success('Audit log exported.'); } catch (e) { toast.error(toUserMessage(e)); }
  };

  const columns = [
    { key: 'timestamp', header: 'Timestamp', render: l => <span className="nowrap">{fmtDateTime(l.timestamp)}</span> },
    { key: 'actor', header: 'Actor', render: l => <span className="cell-stack"><strong>{l.performedBy?.name || 'System'}</strong><small>{titleCase(l.role || (l.isSystemGenerated ? 'System' : ''))}</small></span> },
    { key: 'action', header: 'Action', render: l => titleCase(l.action) },
    { key: 'module', header: 'Module', render: l => <Badge tone="gray" dot={false}>{titleCase(l.module)}</Badge> },
    { key: 'resource', header: 'Resource', render: l => <span className="cell-stack"><span>{l.resourceType || '—'}</span><small className="mono">{l.resourceId ? String(l.resourceId).slice(-8) : ''}</small></span> },
  ];
  const d = detail.data?.data;

  return (
    <div className="page">
      <PageHeader title="Audit Logs" description="A chronological, read-only record of who did what and when."
        actions={can(P.AUDIT_VIEW) && <Button icon={Download} onClick={exportCsv}>Export CSV</Button>} />
      <StatGrid>
        <StatCard icon={ScrollText} label="Total events" value={m.total ?? 0} />
        <StatCard icon={ShieldCheck} tone="blue" label="Admin actions" value={m.adminActions ?? 0} />
        <StatCard icon={Cog} tone="purple" label="System events" value={m.system ?? 0} />
        <StatCard icon={Layers} tone="amber" label="Modules affected" value={m.modules.length} />
      </StatGrid>
      <p className="notice notice--info"><Lock size={16} aria-hidden="true" /> Audit records are immutable: there are no edit or delete operations, in the interface or the API.</p>
      <div className="toolbar toolbar--wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search action, module or resource" label="Search audit logs" />
        <FilterSelect label="Module" value={module} onChange={setModule} options={m.modules.map(x => ({ value: x, label: titleCase(x) }))} allLabel="All modules" />
        <FilterSelect label="Action" value={action} onChange={setAction} options={m.actions.map(x => ({ value: x, label: titleCase(x) }))} allLabel="All actions" />
        <div className="toolbar__picker"><UserPicker label="Actor" value={actor} onChange={setActor} placeholder="Any user" status="" /></div>
        <Input label="From date" type="date" wrapperClass="toolbar__date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
        <Input label="To date" type="date" wrapperClass="toolbar__date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
      </div>
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} /> : (
        <DataTable columns={columns} rows={list.rows} caption="Audit events" onRowClick={setSelected} pageSizes={[20, 50, 100]}
          server={{ page: list.page, totalPages: list.pagination.totalPages, total: list.pagination.total, size: list.size, onPage: list.setPage, onSize: list.setSize, loading: list.loading }}
          empty={<EmptyState icon={ScrollText} title="No audit events found" description={filtered ? 'No events match your filters.' : 'Activity will be recorded here.'} action={filtered && <Button onClick={clear}>Clear filters</Button>} />} />
      )}
      {selected && (
        <Modal open onClose={() => setSelected(null)} size="lg" title={titleCase(selected.action)} description={`Event ${selected._id}`} footer={<Button onClick={() => setSelected(null)}>Close</Button>}>
          <dl className="detail-list">
            <div><dt>Timestamp</dt><dd>{fmtDateTime(selected.timestamp)}</dd></div>
            <div><dt>Actor</dt><dd>{selected.performedBy?.name || 'System'} <span className="muted">({titleCase(selected.role) || 'system'})</span></dd></div>
            <div><dt>Module</dt><dd>{titleCase(selected.module)}</dd></div>
            <div><dt>Resource</dt><dd className="mono">{selected.resourceType} {selected.resourceId}</dd></div>
            <div><dt>IP address</dt><dd className="mono">{selected.ipAddress || '—'}</dd></div>
          </dl>
          {detail.loading && !d ? <p className="muted">Loading details…</p> : d && (d.oldValue || d.newValue) && (
            <>
              {d.oldValue && <><h3 className="subhead">Before</h3><pre className="code-block">{JSON.stringify(d.oldValue, null, 2)}</pre></>}
              {d.newValue && <><h3 className="subhead">After</h3><pre className="code-block">{JSON.stringify(d.newValue, null, 2)}</pre></>}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
