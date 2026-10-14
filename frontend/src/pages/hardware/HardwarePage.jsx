import { useEffect, useState } from 'react';
import { AlertTriangle, Cpu, Download, MoreHorizontal, Pencil, Plus, ScanLine, Upload, Wrench } from 'lucide-react';
import { PERMISSIONS as P } from '../../constants/roles';
import { useCan } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import useQueryParam from '../../hooks/useQueryParam';
import useRowAction from '../../hooks/useRowAction';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState } from '../../components/common/Feedback';
import Button, { IconButton } from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Dropdown from '../../components/ui/Dropdown';
import { StatCard, StatGrid } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { FilterSelect, SearchInput } from '../../components/forms/Form';
import DataTable from '../../components/tables/DataTable';
import { CATEGORIES, ConditionModal, DetailModal, ImportModal, InspectModal, IssueDirectModal, IssueTxnModal, ItemModal, ScanModal } from './HardwareModals';
import { downloadCsv } from '../../utils/csv';
import { fmtShortDate } from '../../utils/format';

export default function HardwarePage() {
  const can = useCan();
  const toast = useToast();
  const rowAction = useRowAction();
  const q = useQueryParam('q');
  const [tab, setTab] = useState('register');
  const [search, setSearch] = useState(q);
  const [category, setCategory] = useState('');
  const [modal, setModal] = useState(null);
  useEffect(() => setSearch(q), [q]);
  const dq = useDebounce(search).trim();
  const manage = can(P.HARDWARE_MANAGE);

  const list = useServerList('/hardware', { category, search: dq }, { pageSize: 10 });
  const queue = useServerList('/hardware/pending-actions', {}, { pageSize: 10 });
  const summary = useApi(() => api.get('/hardware/summary'), []);
  const s = summary.data?.data || {};
  const refresh = () => { list.reload(); queue.reload(); summary.reload(); };
  const open = (type, item) => setModal({ type, item });
  const close = () => setModal(null);
  const moreTrigger = props => <IconButton icon={MoreHorizontal} label="More actions" {...props} />;

  const exportCsv = async () => {
    const res = await api.get('/hardware', { category, search: dq, limit: 1000 });
    downloadCsv('kif-hardware-register.csv', res.data, [
      { header: 'Asset tag', value: r => r.assetTag }, { header: 'Item', value: r => r.itemName }, { header: 'Category', value: r => r.category },
      { header: 'Total', value: r => r.totalQuantity }, { header: 'Available', value: r => r.availableQuantity }, { header: 'Condition', value: r => r.condition }, { header: 'Location', value: r => r.location },
    ]);
    toast.success(`Exported ${res.data.length} item${res.data.length === 1 ? '' : 's'}.`);
  };

  const idle = h => h.availableQuantity === h.totalQuantity;
  const menu = h => [
    { label: 'Edit item', icon: Pencil, onClick: () => open('edit', h) },
    h.condition === 'WORKING' && idle(h) && { label: 'Report damage', icon: AlertTriangle, onClick: () => open('damage', h) },
    h.condition === 'WORKING' && idle(h) && { label: 'Send to repair', icon: Wrench, onClick: () => open('repair', h) },
    h.condition !== 'WORKING' && { label: 'Mark repaired', onClick: () => rowAction.run(h._id, () => api.patch(`/hardware/${h._id}`, { condition: 'WORKING', ...(h.type === 'ASSET_BASED' ? { availableQuantity: h.totalQuantity } : {}) }), { success: 'Item is back in service.', onDone: refresh }) },
  ];

  const columns = [
    { key: 'assetTag', header: 'Asset tag', render: h => <span className="mono">{h.assetTag || '—'}</span> },
    { key: 'itemName', header: 'Item', render: h => <strong>{h.itemName}</strong> },
    { key: 'category', header: 'Category' },
    { key: 'availability', header: 'Availability', render: h => `${h.availableQuantity} of ${h.totalQuantity}` },
    { key: 'status', header: 'Status', render: h => (h.condition !== 'WORKING' ? <Badge status={h.condition} /> : h.availableQuantity === 0 ? <Badge status="Issued" /> : <Badge status="Available" />) },
    { key: 'location', header: 'Location', render: h => h.location || '—' },
    { key: 'actions', header: 'Actions', align: 'right', render: h => (
      <div className="row-actions">
        {manage && h.condition === 'WORKING' && h.availableQuantity > 0 && <Button size="sm" variant="primary" onClick={() => open('issue', h)}>Issue</Button>}
        <Button size="sm" onClick={() => open('detail', h)}>View</Button>
        {manage && <Dropdown trigger={moreTrigger} items={menu(h)} label={`Actions for ${h.itemName}`} />}
      </div>) },
  ];

  const queueColumns = [
    { key: 'item', header: 'Item', render: t => <span className="cell-stack"><strong>{t.hardwareId?.itemName}</strong><small>{t.hardwareId?.assetTag || `×${t.quantity}`}</small></span> },
    { key: 'person', header: 'Person', render: t => t.requestedBy?.name || '—' },
    { key: 'status', header: 'Waiting for', render: t => (t.status === 'APPROVED' ? <Badge tone="blue">Hand-over</Badge> : <Badge tone="amber">Inspection</Badge>) },
    { key: 'qty', header: 'Qty', render: t => t.quantity },
    { key: 'due', header: 'Due', render: t => (t.expectedReturnDate ? fmtShortDate(t.expectedReturnDate) : '—') },
    { key: 'actions', header: 'Action', align: 'right', render: t => <Button size="sm" variant="primary" onClick={() => open(t.status === 'APPROVED' ? 'issueTxn' : 'inspect', t)}>{t.status === 'APPROVED' ? 'Issue' : 'Inspect'}</Button> },
  ];

  const server = l => ({ page: l.page, totalPages: l.pagination.totalPages, total: l.pagination.total, size: l.size, onPage: l.setPage, onSize: l.setSize, loading: l.loading });

  return (
    <div className="page">
      <PageHeader title="Hardware" description="Register of KIF equipment, who holds it and what condition it is in."
        actions={<>
          {manage && <Button icon={ScanLine} onClick={() => open('scan')}>Scan</Button>}
          <Button icon={Download} onClick={exportCsv}>Export CSV</Button>
          {manage && <Button icon={Upload} onClick={() => open('import')}>Import CSV</Button>}
          {manage && <Button variant="primary" icon={Plus} onClick={() => open('add')}>Add hardware</Button>}
        </>} />
      <StatGrid>
        <StatCard icon={Cpu} label="Total units" value={s.total ?? 0} hint={`${s.items ?? 0} items`} />
        <StatCard icon={Cpu} tone="green" label="Available" value={s.available ?? 0} />
        <StatCard icon={Cpu} tone="blue" label="Issued" value={s.issued ?? 0} />
        <StatCard icon={Wrench} tone="amber" label="Under repair" value={s.repair ?? 0} />
        <StatCard icon={AlertTriangle} tone="red" label="Damaged / lost" value={s.damaged ?? 0} />
      </StatGrid>
      <Tabs label="Hardware sections" value={tab} onChange={setTab} tabs={[{ id: 'register', label: 'Register' }, { id: 'queue', label: 'Counter queue', count: queue.pagination.total }]} />
      {tab === 'register' ? (
        <>
          <div className="toolbar">
            <SearchInput value={search} onChange={setSearch} placeholder="Search item, tag, category or serial" label="Search hardware" />
            <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORIES} allLabel="All categories" />
          </div>
          {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} description="Hardware could not be loaded." /> : (
            <DataTable columns={columns} rows={list.rows} caption="Hardware register" server={server(list)}
              empty={<EmptyState icon={Cpu} title="No hardware found" description="No assets match your search or filters." action={<Button onClick={() => { setSearch(''); setCategory(''); }}>Clear filters</Button>} />} />
          )}
        </>
      ) : (
        <DataTable columns={queueColumns} rows={queue.rows} caption="Counter queue" server={server(queue)}
          empty={<EmptyState icon={Cpu} title="Nothing waiting at the counter" description="Approved requests to hand over and returned items to inspect appear here." />} />
      )}

      {modal?.type === 'scan' && <ScanModal onClose={close} onFound={r => { if (r.type === 'HARDWARE') setModal({ type: r.item.availableQuantity > 0 && r.item.condition === 'WORKING' ? 'issue' : 'detail', item: r.item }); else toast.info(`That code is for ${r.item.roomName}. Open Rooms to manage it.`); }} />}
      {modal?.type === 'add' && <ItemModal onClose={close} onDone={refresh} />}
      {modal?.type === 'edit' && <ItemModal item={modal.item} onClose={close} onDone={refresh} />}
      {modal?.type === 'import' && <ImportModal onClose={close} onDone={refresh} />}
      {modal?.type === 'issue' && <IssueDirectModal item={modal.item} onClose={close} onDone={refresh} />}
      {modal?.type === 'issueTxn' && <IssueTxnModal txn={modal.item} onClose={close} onDone={refresh} />}
      {modal?.type === 'inspect' && <InspectModal txn={modal.item} onClose={close} onDone={refresh} />}
      {modal?.type === 'damage' && <ConditionModal item={modal.item} mode="damage" onClose={close} onDone={refresh} />}
      {modal?.type === 'repair' && <ConditionModal item={modal.item} mode="repair" onClose={close} onDone={refresh} />}
      {modal?.type === 'detail' && <DetailModal item={modal.item} onClose={close} />}
    </div>
  );
}
