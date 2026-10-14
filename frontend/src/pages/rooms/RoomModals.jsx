import { useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import useFields from '../../hooks/useFields';
import useSubmit from '../../hooks/useSubmit';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/forms/Form';
import UserPicker from '../../components/forms/UserPicker';
import { FormFooter, Modal } from '../../components/modals/Modal';
import { fmtTime } from '../../utils/format';
import { fromMin, toMin, todayISO } from '../../utils/time';
import { CLOSE, OPEN } from './RoomTimeline';

const TIMES = (() => { const o = []; for (let m = toMin(OPEN); m <= toMin(CLOSE); m += 30) o.push({ value: fromMin(m), label: fmtTime(fromMin(m)) }); return o; })();

function SlotFields({ f, errors, rooms, conflict }) {
  return (
    <>
      <Select label="Room" required options={rooms.map(r => ({ value: r._id, label: r.roomName }))} value={f.values.roomId} onChange={e => { f.set('roomId', e.target.value); f.set('equipment', []); }} />
      <Input label="Date" type="date" required min={todayISO()} {...f.input('date')} error={errors.date} />
      <Select label="Start time" required placeholder="Select" options={TIMES.slice(0, -1)} value={f.values.startTime} onChange={e => f.set('startTime', e.target.value)} error={errors.startTime} />
      <Select label="End time" required placeholder="Select" options={TIMES.slice(1)} value={f.values.endTime} onChange={e => f.set('endTime', e.target.value)} error={errors.endTime} />
      {conflict && <p className="notice notice--warn span-2" role="status"><AlertTriangle size={16} aria-hidden="true" />{conflict}</p>}
    </>
  );
}

const check = v => {
  const e = {};
  if (!v.date) e.date = 'Choose a date.';
  if (!v.startTime) e.startTime = 'Choose a start time.';
  if (!v.endTime) e.endTime = 'Choose an end time.';
  if (v.startTime && v.endTime && toMin(v.startTime) >= toMin(v.endTime)) e.endTime = 'End time must be after the start time.';
  else if (v.startTime && v.endTime && toMin(v.endTime) - toMin(v.startTime) > 240) e.endTime = 'Bookings are limited to 4 hours.';
  return e;
};

// mode "request": member asks for a slot (needs admin approval). mode "direct": admin books immediately.
export function BookingModal({ initial, rooms, mode, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ roomId: initial.roomId, date: initial.date, startTime: initial.start || '', endTime: initial.end || '', attendees: '1', purpose: '', equipment: [] });
  const [forUser, setForUser] = useState(null);
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const room = rooms.find(r => r._id === v.roomId) || rooms[0];
  const toggle = n => f.set('equipment', v.equipment.includes(n) ? v.equipment.filter(x => x !== n) : [...v.equipment, n]);
  const validate = () => {
    const e = check(v);
    if (!(Number(v.attendees) >= 1)) e.attendees = 'Enter at least 1 attendee.';
    else if (Number(v.attendees) > room.capacity) e.attendees = `${room.roomName} holds up to ${room.capacity} people.`;
    if (v.purpose.trim().length < 3) e.purpose = 'Every booking needs a purpose.';
    return e;
  };
  const action = () => (mode === 'direct'
    ? api.post('/rooms/bookings/direct', { roomId: v.roomId, date: v.date, startTime: v.startTime, endTime: v.endTime, purpose: v.purpose.trim(), bookedForUserId: forUser?._id })
    : api.post('/requests', { type: 'ROOM', resourceId: v.roomId, startDate: v.date, startTime: v.startTime, endTime: v.endTime, purpose: v.purpose.trim(), metadata: { attendees: Number(v.attendees), equipment: v.equipment } }));
  return (
    <Modal open onClose={onClose} size="lg" title={mode === 'direct' ? 'Book a room' : 'Request a room slot'} description={mode === 'direct' ? 'Direct bookings are confirmed immediately.' : 'An admin reviews your request. Overlapping slots are rejected.'} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel={mode === 'direct' ? 'Book room' : 'Send request'} />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, action, { onDone: () => { onDone(); onClose(); } }); }}>
        <SlotFields f={f} errors={errors} rooms={rooms} />
        <Input label="Attendees" type="number" min="1" step="1" required hint={`Capacity: ${room.capacity}`} {...f.input('attendees')} error={errors.attendees} />
        {mode === 'direct' && <UserPicker label="Booked for" hint="Optional. Defaults to you." value={forUser} onChange={setForUser} />}
        <Textarea label="Purpose" required wrapperClass="span-2" placeholder="What is this session for?" {...f.input('purpose')} error={errors.purpose} />
        {mode === 'request' && room.equipmentList?.length > 0 && (
          <Field id={`${formId}-eq`} label="Equipment needed" className="span-2" hint="Optional.">
            <div className="check-grid" id={`${formId}-eq`}>{room.equipmentList.map(i => <Checkbox key={i.name} label={i.name} checked={v.equipment.includes(i.name)} onChange={() => toggle(i.name)} />)}</div>
          </Field>
        )}
      </form>
    </Modal>
  );
}

export function BlockModal({ initial, rooms, onClose, onDone }) {
  const formId = useId();
  const f = useFields({ roomId: initial.roomId, date: initial.date, startTime: initial.start || '', endTime: initial.end || '', reason: '' });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => { const e = check(v); if (!v.reason.trim()) e.reason = 'Give a reason, e.g. maintenance.'; return e; };
  return (
    <Modal open onClose={onClose} title="Block time" description="Blocked time cannot be booked by anyone." dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Block time" />}>
      <form id={formId} noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => api.post('/rooms/bookings/block-maintenance', { roomId: v.roomId, date: v.date, startTime: v.startTime, endTime: v.endTime, reason: v.reason.trim() }), { onDone: () => { onDone(); onClose(); } }); }}>
        <SlotFields f={f} errors={errors} rooms={rooms} />
        <Input label="Reason" required wrapperClass="span-2" placeholder="e.g. Equipment maintenance" {...f.input('reason')} error={errors.reason} />
      </form>
    </Modal>
  );
}
