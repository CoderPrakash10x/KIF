import { useEffect, useId, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import useFields from '../../hooks/useFields';
import useSubmit from '../../hooks/useSubmit';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/forms/Form';
import UserPicker from '../../components/forms/UserPicker';
import { FormFooter, Modal } from '../../components/modals/Modal';
import { fmtDate, fmtDateTime, titleCase } from '../../utils/format';
import { addDays, todayISO } from '../../utils/time';

export const CATEGORIES = ['Laptop', '3D Printer', 'Microcontroller', 'Camera', 'Audio', 'Test Equipment', 'Tools', 'Display', 'Compute', 'VR', 'Other'];
export const CONDITIONS = [{ value: 'WORKING', label: 'Working' }, { value: 'UNDER_REPAIR', label: 'Under repair' }, { value: 'DAMAGED', label: 'Damaged' }, { value: 'LOST', label: 'Lost' }];
const done = (onDone, onClose) => () => { onDone(); onClose(); };

// Walk-up issue: admin hands stock straight to a person (no prior request).
export function IssueDirectModal({ item, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ quantity: '1', expectedReturnDate: addDays(todayISO(), 7) });
  const [person, setPerson] = useState(null);
  const { busy, errors, run } = useSubmit();
  const validate = () => {
    const e = {};
    if (!person) e.userId = 'Select a recipient.';
    if (!(Number(f.values.quantity) >= 1)) e.quantity = 'Enter at least 1.';
    else if (Number(f.values.quantity) > item.availableQuantity) e.quantity = `Only ${item.availableQuantity} available.`;
    if (!f.values.expectedReturnDate) e.expectedReturnDate = 'Choose the expected return date.';
    return e;
  };
  return (
    <Modal open onClose={onClose} title={`Issue ${item.itemName}`} description={`${item.availableQuantity} of ${item.totalQuantity} available`} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Issue hardware" />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => api.post(`/hardware/${item._id}/issue-direct`, { userId: person._id, quantity: Number(f.values.quantity), expectedReturnDate: f.values.expectedReturnDate }), { onDone: done(onDone, onClose) }); }}>
        <div className="span-2"><UserPicker label="Recipient" required value={person} onChange={setPerson} error={errors.userId} /></div>
        {item.type === 'QUANTITY_BASED' && <Input label="Quantity" type="number" min="1" max={item.availableQuantity} required {...f.input('quantity')} error={errors.quantity} />}
        <Input label="Expected return" type="date" required min={todayISO()} {...f.input('expectedReturnDate')} error={errors.expectedReturnDate} />
      </form>
    </Modal>
  );
}

// Approved request waiting at the counter -> hand the item over.
export function IssueTxnModal({ txn, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ expectedReturnDate: (txn.expectedReturnDate || addDays(todayISO(), 7)).slice(0, 10) });
  const { busy, errors, run } = useSubmit();
  return (
    <Modal open onClose={onClose} size="sm" title="Hand over item" description={`${txn.hardwareId?.itemName} → ${txn.requestedBy?.name}`} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Mark as issued" />}>
      <form id={formId} noValidate className="stack" onSubmit={e => { e.preventDefault(); run(() => (f.values.expectedReturnDate ? {} : { expectedReturnDate: 'Choose a date.' }), () => api.post(`/hardware/transactions/${txn._id}/issue`, f.values), { onDone: done(onDone, onClose) }); }}>
        <p className="modal__text">Quantity: {txn.quantity}</p>
        <Input label="Expected return" type="date" required {...f.input('expectedReturnDate')} error={errors.expectedReturnDate} />
      </form>
    </Modal>
  );
}

// Returned item -> inspect and record its condition.
export function InspectModal({ txn, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ condition: 'WORKING', damageNotes: '' });
  const { busy, errors, run } = useSubmit();
  const bad = f.values.condition !== 'WORKING';
  return (
    <Modal open onClose={onClose} size="sm" title="Inspect returned item" description={`${txn.hardwareId?.itemName} · ${txn.requestedBy?.name}`} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Record inspection" />}>
      <form id={formId} noValidate className="stack" onSubmit={e => { e.preventDefault(); run(() => (bad && f.values.damageNotes.trim().length < 5 ? { damageNotes: 'Describe the problem (at least 5 characters).' } : {}), () => api.post(`/hardware/transactions/${txn._id}/inspect`, { condition: f.values.condition, damageNotes: f.values.damageNotes.trim() || undefined }), { onDone: done(onDone, onClose) }); }}>
        <Select label="Condition on return" required options={CONDITIONS} value={f.values.condition} onChange={e => f.set('condition', e.target.value)} />
        {bad && <Textarea label="Notes" required {...f.input('damageNotes')} error={errors.damageNotes} />}
      </form>
    </Modal>
  );
}

// Flag an item as damaged / under repair (only offered when nothing is currently issued).
export function ConditionModal({ item, mode, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ notes: '' });
  const { busy, errors, run } = useSubmit();
  const condition = mode === 'repair' ? 'UNDER_REPAIR' : 'DAMAGED';
  const asset = item.type === 'ASSET_BASED';
  return (
    <Modal open onClose={onClose} size="sm" title={mode === 'repair' ? `Send to repair · ${item.itemName}` : `Report damage · ${item.itemName}`} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={mode === 'repair' ? 'Send to repair' : 'Report damage'} tone={mode === 'repair' ? 'primary' : 'danger'} />}>
      <form id={formId} noValidate className="stack" onSubmit={e => { e.preventDefault(); run(() => (mode === 'damage' && f.values.notes.trim().length < 5 ? { notes: 'Describe the damage (at least 5 characters).' } : {}), () => api.patch(`/hardware/${item._id}`, { condition, ...(asset ? { availableQuantity: 0 } : {}), description: [item.description, f.values.notes.trim() && `[${condition}] ${f.values.notes.trim()}`].filter(Boolean).join('\n') }), { onDone: done(onDone, onClose) }); }}>
        {!asset && <p className="notice notice--warn">The whole lot will be flagged. Use inspection on returns for single damaged units.</p>}
        <Textarea label="Notes" required={mode === 'damage'} {...f.input('notes')} error={errors.notes} />
      </form>
    </Modal>
  );
}

export function ItemModal({ item, onClose, onDone }) {
  const formId = useId();
  const f = useFields({
    itemName: item?.itemName || '', category: item?.category || '', type: item?.type || 'ASSET_BASED', assetTag: item?.assetTag || '',
    totalQuantity: String(item?.totalQuantity ?? 1), location: item?.location || '', description: item?.description || '',
  });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => {
    const e = {};
    if (!v.itemName.trim()) e.itemName = 'Enter the item name.';
    if (!v.category) e.category = 'Choose a category.';
    if (!(Number(v.totalQuantity) >= 1)) e.totalQuantity = 'Quantity must be at least 1.';
    return e;
  };
  const body = () => {
    const b = { itemName: v.itemName.trim(), category: v.category, location: v.location.trim() || undefined, description: v.description.trim() || undefined };
    if (!item) Object.assign(b, { type: v.type, totalQuantity: Number(v.totalQuantity), availableQuantity: Number(v.totalQuantity), assetTag: v.type === 'ASSET_BASED' ? v.assetTag.trim() || undefined : undefined });
    return b;
  };
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.itemName}` : 'Add hardware'} description={item ? 'Stock levels change through issue / return workflows.' : 'Register a new item in the hardware register.'} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={item ? 'Save changes' : 'Add hardware'} />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => (item ? api.patch(`/hardware/${item._id}`, body()) : api.post('/hardware', body())), { onDone: done(onDone, onClose) }); }}>
        <Input label="Item name" required wrapperClass="span-2" {...f.input('itemName')} error={errors.itemName} />
        <Select label="Category" required placeholder="Select category" options={CATEGORIES} value={v.category} onChange={e => f.set('category', e.target.value)} error={errors.category} />
        {!item && <Select label="Tracking" options={[{ value: 'ASSET_BASED', label: 'Single asset (tagged)' }, { value: 'QUANTITY_BASED', label: 'Quantity lot' }]} value={v.type} onChange={e => f.set('type', e.target.value)} />}
        {!item && v.type === 'ASSET_BASED' && <Input label="Asset tag" placeholder="KIF-HW-0100" {...f.input('assetTag')} error={errors.assetTag} />}
        {!item && <Input label="Total quantity" type="number" min="1" required {...f.input('totalQuantity')} error={errors.totalQuantity} />}
        <Input label="Location" {...f.input('location')} />
        <Textarea label="Description" wrapperClass="span-2" rows={2} {...f.input('description')} />
      </form>
    </Modal>
  );
}

export function DetailModal({ item, onClose }) {
  const hist = useApi(() => api.get(`/hardware/${item._id}/history`, { limit: 20 }), [item._id]);
  return (
    <Modal open onClose={onClose} title={item.itemName} description={`${item.assetTag || 'Lot'} · ${item.category}`} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="detail-head"><Badge status={item.condition} /><Badge tone="gray" dot={false}>{item.availableQuantity} of {item.totalQuantity} available</Badge></div>
      <dl className="detail-list">
        <div><dt>Tracking</dt><dd>{item.type === 'ASSET_BASED' ? 'Single asset' : 'Quantity lot'}</dd></div>
        <div><dt>Location</dt><dd>{item.location || '—'}</dd></div>
        {item.description && <div className="span-2"><dt>Notes</dt><dd style={{ whiteSpace: 'pre-line' }}>{item.description}</dd></div>}
      </dl>
      <h3 className="subhead">QR code</h3>
      <QrCard type="hardware" id={item._id} />
      <h3 className="subhead">Transaction history</h3>
      {hist.loading ? <p className="muted">Loading…</p> : (hist.data?.data || []).length ? (
        <ul className="rows rows--timeline">{hist.data.data.map(t => (
          <li key={t._id} className="row"><span className="timeline-dot" data-tone="primary" aria-hidden="true" />
            <div className="row__main"><p className="row__title">{titleCase(t.status)} · {t.requestedBy?.name || '—'} ×{t.quantity}</p><p className="row__sub">{t.issueDate ? `Issued ${fmtDate(t.issueDate)}` : 'Not yet issued'}{t.expectedReturnDate ? ` · due ${fmtDate(t.expectedReturnDate)}` : ''}</p></div>
            <span className="row__time">{fmtDateTime(t.updatedAt)}</span></li>
        ))}</ul>
      ) : <p className="muted">No transactions yet.</p>}
    </Modal>
  );
}

// CSV import goes straight to POST /hardware/bulk-import (validated server-side).
export function ImportModal({ onClose, onDone }) {
  const fileId = useId();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const { busy, run } = useSubmit();
  return (
    <Modal open onClose={onClose} size="md" title="Import hardware from CSV" description="Columns: itemName, category, type (ASSET_BASED | QUANTITY_BASED), totalQuantity, assetTag, condition, location." dismissible={!busy}
      footer={<><Button onClick={onClose} disabled={busy}>Close</Button><Button variant="primary" loading={busy} disabled={!file} onClick={() => run(null, () => api.upload('/hardware/bulk-import', 'file', file).then(r => { setResult(r.data); onDone(); return r; }))}>Import</Button></>}>
      <div className="stack">
        <Field id={fileId} label="CSV file" hint={file?.name || 'Choose a .csv file.'}><input id={fileId} type="file" accept=".csv,text/csv" className="input" onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); }} /></Field>
        {result && <p className="notice notice--info" role="status">{typeof result === 'object' ? JSON.stringify(result.summary || result).slice(0, 300) : String(result)}</p>}
      </div>
    </Modal>
  );
}

// QR / barcode check-in (spec section 6): a handheld scanner types the code + Enter; phones/laptops can use the camera.
export function ScanModal({ onClose, onFound }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const videoRef = useRef(null);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  const resolve = async value => {
    const c = (value ?? code).trim();
    if (!c || busy) return;
    setBusy(true); setError('');
    try {
      const res = await api.get('/qr/resolve', { code: c });
      onFound(res.data); // parent swaps this modal for the matching one
    } catch (e) { setError(e.message || 'No match for that code.'); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!camera) return undefined;
    let stream; let timer; let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
        timer = setInterval(async () => {
          if (stopped || !videoRef.current) return;
          const found = await detector.detect(videoRef.current).catch(() => []);
          if (found[0]?.rawValue) { stopped = true; setCamera(false); resolve(found[0].rawValue); }
        }, 400);
      } catch { setError('Camera is not available. Type the code instead.'); setCamera(false); }
    })();
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  return (
    <Modal open onClose={onClose} size="sm" title="Scan or look up an asset" description="Scan the asset QR / barcode, or type the asset tag." dismissible={!busy}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!code.trim()} onClick={() => resolve()}>Look up</Button></>}>
      <form className="stack" noValidate onSubmit={e => { e.preventDefault(); resolve(); }}>
        <Input label="Asset tag or scanned code" placeholder="KIF-HW-0001" value={code} onChange={e => setCode(e.target.value)} error={error} data-autofocus autoComplete="off" />
        {supported && <Button icon={Camera} onClick={() => setCamera(c => !c)}>{camera ? 'Stop camera' : 'Scan with camera'}</Button>}
        {camera && <video ref={videoRef} className="scan-video" muted playsInline aria-label="Camera preview" />}
      </form>
    </Modal>
  );
}

export function QrCard({ type, id }) {
  const qr = useApi(() => api.get(`/qr/${type}/${id}`), [type, id]);
  const d = qr.data?.data;
  if (!d) return <p className="muted">{qr.error ? 'QR code unavailable.' : 'Generating QR code…'}</p>;
  return (
    <div className="qr-card">
      <img src={d.dataUrl} alt={`QR code for ${d.label}`} width="160" height="160" />
      <div><p className="row__title">{d.label}</p><p className="mono muted">{d.code}</p><Button size="sm" onClick={() => window.print()}>Print</Button></div>
    </div>
  );
}
