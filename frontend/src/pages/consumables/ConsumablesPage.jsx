import { useEffect, useId, useState } from 'react';
import { History, MoreHorizontal, Package, Pencil, Plus } from 'lucide-react';
import { PERMISSIONS as P } from '../../constants/roles';
import { useCan } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import useFields from '../../hooks/useFields';
import useQueryParam from '../../hooks/useQueryParam';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState, ListSkeleton } from '../../components/common/Feedback';
import Button, { IconButton } from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Dropdown from '../../components/ui/Dropdown';
import { StatCard, StatGrid } from '../../components/ui/Card';
import { Input, SearchInput, Select, Textarea } from '../../components/forms/Form';
import DataTable from '../../components/tables/DataTable';
import { FormFooter, Modal } from '../../components/modals/Modal';
import { fmtDateTime, titleCase } from '../../utils/format';

const CATEGORIES = ['3D Printing', 'Electronics', 'Office', 'Lab Materials', 'Other'];
const stateOf = c => (c.currentQuantity <= c.lowStockThreshold ? 'LOW' : c.currentQuantity <= c.lowStockThreshold * 1.5 ? 'WATCH' : 'HEALTHY');

function ItemForm({ item, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ itemName: item?.itemName || '', category: item?.category || '', unit: item?.unit || '', currentQuantity: String(item?.currentQuantity ?? 0), lowStockThreshold: String(item?.lowStockThreshold ?? ''), location: item?.location || '', supplier: item?.supplier || '' });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => {
    const e = {};
    if (!v.itemName.trim()) e.itemName = 'Enter the item name.';
    if (!v.category) e.category = 'Choose a category.';
    if (!v.unit.trim()) e.unit = 'Enter a unit (e.g. rolls).';
    if (!item && (v.currentQuantity === '' || Number(v.currentQuantity) < 0)) e.currentQuantity = 'Quantity cannot be negative.';
    if (v.lowStockThreshold === '' || Number(v.lowStockThreshold) < 0) e.lowStockThreshold = 'Threshold must be zero or more.';
    return e;
  };
  const body = () => ({ itemName: v.itemName.trim(), category: v.category, unit: v.unit.trim(), lowStockThreshold: Number(v.lowStockThreshold), location: v.location.trim() || undefined, supplier: v.supplier.trim() || undefined, ...(item ? {} : { currentQuantity: Number(v.currentQuantity) }) });
  return (
    <Modal open onClose={onClose} size="lg" title={item ? `Edit ${item.itemName}` : 'Add consumable'} description={item ? 'Use Stock in / Record usage to change quantities so history stays accurate.' : 'Add a new item to the stock register.'} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={item ? 'Save changes' : 'Add item'} />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => (item ? api.patch(`/consumables/${item._id}`, body()) : api.post('/consumables', body())), { onDone: () => { onDone(); onClose(); } }); }}>
        <Input label="Item name" required wrapperClass="span-2" {...f.input('itemName')} error={errors.itemName} />
        <Select label="Category" required placeholder="Select category" options={CATEGORIES} value={v.category} onChange={e => f.set('category', e.target.value)} error={errors.category} />
        <Input label="Unit" required placeholder="rolls, packs, pcs…" {...f.input('unit')} error={errors.unit} />
        {!item && <Input label="Opening quantity" type="number" min="0" step="any" required {...f.input('currentQuantity')} error={errors.currentQuantity} />}
        <Input label="Low-stock threshold" type="number" min="0" step="any" required hint="Admins are alerted at or below this level." {...f.input('lowStockThreshold')} error={errors.lowStockThreshold} />
        <Input label="Supplier" {...f.input('supplier')} />
        <Input label="Storage location" {...f.input('location')} />
      </form>
    </Modal>
  );
}

function StockModal({ item, mode, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ quantity: '', reason: '' });
  const { busy, errors, run } = useSubmit();
  const usage = mode === 'out';
  const validate = () => {
    const e = {}; const n = Number(f.values.quantity);
    if (f.values.quantity === '' || !(n > 0)) e.quantity = 'Enter a quantity greater than zero.';
    else if (usage && n > item.currentQuantity) e.quantity = `Usage cannot exceed available stock (${item.currentQuantity} ${item.unit}).`;
    if (f.values.reason.trim().length < 2) e.reason = usage ? 'Say what it was used for (project / module).' : 'Add a short note (e.g. supplier delivery).';
    return e;
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`${usage ? 'Record usage' : 'Stock in'} · ${item.itemName}`} description={`In stock: ${item.currentQuantity} ${item.unit}`} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={usage ? 'Record usage' : 'Add stock'} />}>
      <form id={formId} noValidate className="stack" onSubmit={e => { e.preventDefault(); run(validate, () => api.post(`/consumables/${item._id}/stock-${mode}`, { quantity: Number(f.values.quantity), reason: f.values.reason.trim() }), { onDone: () => { onDone(); onClose(); } }); }}>
        <Input label={`Quantity (${item.unit})`} type="number" min="0" step="any" required {...f.input('quantity')} error={errors.quantity} />
        <Textarea label={usage ? 'Used for' : 'Note'} required rows={2} placeholder={usage ? 'e.g. Workshop soldering session' : 'e.g. Delivery from supplier'} {...f.input('reason')} error={errors.reason} />
      </form>
    </Modal>
  );
}

function HistoryModal({ item, onClose }) {
  const hist = useApi(() => api.get(`/consumables/${item._id}/history`, { limit: 50 }), [item._id]);
  const rows = hist.data?.data || [];
  return (
    <Modal open onClose={onClose} title={`History · ${item.itemName}`} description={`Current stock: ${item.currentQuantity} ${item.unit}`} footer={<Button onClick={onClose}>Close</Button>}>
      {hist.loading && !hist.data ? <ListSkeleton rows={3} /> : !rows.length ? <EmptyState compact title="No movements yet" /> : (
        <ul className="rows rows--timeline">{rows.map(h => (
          <li key={h._id} className="row"><span className="timeline-dot" data-tone={h.type === 'STOCK_OUT' ? 'amber' : 'primary'} aria-hidden="true" />
            <div className="row__main"><p className="row__title">{titleCase(h.type)}: {h.type === 'STOCK_OUT' ? '−' : '+'}{h.quantity} {item.unit}</p><p className="row__sub">{h.reason} · {h.performedBy?.name || '—'} · balance {h.newQuantity}</p></div>
            <span className="row__time">{fmtDateTime(h.createdAt)}</span></li>
        ))}</ul>
      )}
    </Modal>
  );
}

export default function ConsumablesPage() {
  const can = useCan();
  const q = useQueryParam('q');
  const [search, setSearch] = useState(q);
  const [category, setCategory] = useState('');
  const [low, setLow] = useState('');
  const [modal, setModal] = useState(null);
  useEffect(() => setSearch(q), [q]);
  const dq = useDebounce(search).trim();
  const manage = can(P.CONSUMABLE_MANAGE);
  const list = useServerList('/consumables', { category, search: dq, lowStock: low || undefined }, { pageSize: 10 });
  const summary = useApi(() => api.get('/consumables/summary'), []);
  const s = summary.data?.data || {};
  const refresh = () => { list.reload(); summary.reload(); };
  const open = (type, item) => setModal({ type, item });
  const close = () => setModal(null);
  const moreTrigger = props => <IconButton icon={MoreHorizontal} label="More actions" {...props} />;

  const columns = [
    { key: 'itemName', header: 'Item', render: c => <span className="cell-stack"><strong>{c.itemName}</strong><small>{c.category}</small></span> },
    { key: 'qty', header: 'In stock', render: c => <strong>{c.currentQuantity} <span className="muted">{c.unit}</span></strong> },
    { key: 'threshold', header: 'Threshold', render: c => `${c.lowStockThreshold} ${c.unit}` },
    { key: 'state', header: 'Status', render: c => <Badge status={stateOf(c)} /> },
    { key: 'location', header: 'Storage', render: c => c.location || '—' },
    { key: 'actions', header: 'Actions', align: 'right', render: c => (
      <div className="row-actions">
        {manage && <Button size="sm" variant="primary" onClick={() => open('in', c)}>Stock in</Button>}
        {manage && <Button size="sm" onClick={() => open('out', c)}>Record usage</Button>}
        <Dropdown trigger={moreTrigger} label={`Actions for ${c.itemName}`} items={[{ label: 'View history', icon: History, onClick: () => open('history', c) }, manage && { label: 'Edit item', icon: Pencil, onClick: () => open('edit', c) }]} />
      </div>) },
  ];

  return (
    <div className="page">
      <PageHeader title="Consumables" description="Stock register for lab and office supplies, with low-stock alerts."
        actions={manage && <Button variant="primary" icon={Plus} onClick={() => open('add')}>Add item</Button>} />
      <StatGrid>
        <StatCard icon={Package} label="Total items" value={s.total ?? 0} />
        <StatCard icon={Package} tone="red" label="Low stock" value={s.low ?? 0} hint="At or below threshold" />
        <StatCard icon={Package} tone="amber" label="Watch" value={s.watch ?? 0} hint="Within 50% of threshold" />
        <StatCard icon={Package} tone="green" label="Healthy" value={s.healthy ?? 0} />
      </StatGrid>
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, category or supplier" label="Search consumables" />
        <Select compact hideLabel label="Category" placeholder="All categories" options={CATEGORIES} value={category} onChange={e => setCategory(e.target.value)} />
        <Select compact hideLabel label="Stock" placeholder="All stock levels" options={[{ value: 'true', label: 'Low stock only' }]} value={low} onChange={e => setLow(e.target.value)} />
      </div>
      {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} /> : (
        <DataTable columns={columns} rows={list.rows} caption="Consumables inventory"
          server={{ page: list.page, totalPages: list.pagination.totalPages, total: list.pagination.total, size: list.size, onPage: list.setPage, onSize: list.setSize, loading: list.loading }}
          empty={<EmptyState icon={Package} title="No items found" description="No consumables match your search or filters." action={<Button onClick={() => { setSearch(''); setCategory(''); setLow(''); }}>Clear filters</Button>} />} />
      )}
      {modal?.type === 'add' && <ItemForm onClose={close} onDone={refresh} />}
      {modal?.type === 'edit' && <ItemForm item={modal.item} onClose={close} onDone={refresh} />}
      {(modal?.type === 'in' || modal?.type === 'out') && <StockModal item={modal.item} mode={modal.type} onClose={close} onDone={refresh} />}
      {modal?.type === 'history' && <HistoryModal item={modal.item} onClose={close} />}
    </div>
  );
}