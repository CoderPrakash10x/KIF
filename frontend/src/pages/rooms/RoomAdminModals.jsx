import { useId, useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import useFields from '../../hooks/useFields';
import useSubmit from '../../hooks/useSubmit';
import Button from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/forms/Form';
import { FormFooter, Modal } from '../../components/modals/Modal';

// Super Admin: choose the administrator for one room, then confirm the change before it is saved.
export function AssignAdminModal({ room, onClose, onDone }) {
  const admins = useApi(() => api.get('/users', { role: 'ADMIN', status: 'ACTIVE', limit: 100 }), []);
  const [choice, setChoice] = useState(room.assignedAdmin?._id || '');
  const [confirming, setConfirming] = useState(false);
  const { busy, run } = useSubmit();
  const list = admins.data?.data || [];
  const current = room.assignedAdmin?.name || 'Unassigned';
  const next = choice ? list.find(a => a._id === choice)?.name || 'selected administrator' : 'Unassigned';
  const unchanged = (room.assignedAdmin?._id || '') === choice;

  const save = () => run(null, () => api.put(`/rooms/${room._id}/admin`, { adminId: choice || null }), { onDone: () => { onDone(); onClose(); } });

  return (
    <Modal open onClose={onClose} size="sm" title={`Administrator · ${room.roomName}`} dismissible={!busy}
      description="Only this Admin (and you, as Super Admin) can approve requests and manage bookings for this room."
      footer={confirming
        ? <><Button onClick={() => setConfirming(false)} disabled={busy}>Back</Button><Button variant="primary" loading={busy} onClick={save}>Confirm change</Button></>
        : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={unchanged || admins.loading} onClick={() => setConfirming(true)}>Review change</Button></>}>
      {confirming ? (
        <div className="stack" role="alertdialog" aria-label="Confirm administrator change">
          <p className="modal__text">Change the administrator of <strong>{room.roomName}</strong> from <strong>{current}</strong> to <strong>{next}</strong>?</p>
          <p className="notice notice--warn">Requests that are still pending stay in place and are decided by the new administrator. Existing bookings are not changed.</p>
        </div>
      ) : (
        <Select label="Administrator" placeholder={admins.loading ? 'Loading…' : undefined} value={choice} onChange={e => setChoice(e.target.value)}
          options={[{ value: '', label: 'Unassigned (Super Admin only)' }, ...list.map(a => ({ value: a._id, label: `${a.name} (${a.email})` }))]}
          hint={admins.error ? 'Admins could not be loaded.' : 'Only active users with the Admin role can be assigned. Assigning a room grants no other privileges.'} />
      )}
    </Modal>
  );
}

// Assigned admin or Super Admin: confirm the setup values of a room (capacity / location / description).
export function ManageRoomModal({ room, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ capacity: room.capacity ? String(room.capacity) : '', location: room.location || '', description: room.description || '' });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => (v.capacity !== '' && !(Number(v.capacity) >= 1) ? { capacity: 'Capacity must be at least 1.' } : {});
  const body = () => ({ ...(v.capacity !== '' ? { capacity: Number(v.capacity) } : {}), location: v.location.trim() || undefined, description: v.description.trim() || undefined });
  return (
    <Modal open onClose={onClose} size="md" title={`Manage room · ${room.roomName}`} description="Setup values shown to members when they book." dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Save changes" />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => api.patch(`/rooms/${room._id}`, body()), { onDone: () => { onDone(); onClose(); } }); }}>
        <Input label="Capacity (people)" type="number" min="1" hint="Leave empty until confirmed." {...f.input('capacity')} error={errors.capacity} />
        <Input label="Location" {...f.input('location')} error={errors.location} />
        <Textarea label="Description" wrapperClass="span-2" rows={3} {...f.input('description')} />
      </form>
    </Modal>
  );
}
