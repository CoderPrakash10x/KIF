const pad = n => String(n).padStart(2, '0');

export const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISODate(new Date());
export const parseISO = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
export const toMin = t => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
export const isSlotStarted = (date, start) =>
  date < todayISO() || (date === todayISO() && toMin(start) <= nowMinutes());
export const isSlotOver = (date, end) =>
  date < todayISO() || (date === todayISO() && toMin(end) <= nowMinutes());
export const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);
