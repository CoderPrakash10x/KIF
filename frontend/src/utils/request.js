// Display helpers for backend Request documents (resourceId is populated server-side).
export const REQUEST_TYPES = ['CABIN', 'HARDWARE', 'ROOM', 'EVENT'];
export const TYPE_LABEL = { CABIN: 'Cabin', HARDWARE: 'Hardware', ROOM: 'Room', EVENT: 'Event' };

export function resourceLabel(r) {
  const x = r.resourceId;
  if (!x || typeof x !== 'object') return TYPE_LABEL[r.type] || 'Resource';
  if (r.type === 'CABIN') return `Cabin ${x.cabinNumber}`;
  if (r.type === 'ROOM') return x.roomName;
  if (r.type === 'HARDWARE') return x.itemName;
  return x.title || 'Event';
}
