const escapeCell = value => {
  let s = value == null ? '' : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns) {
  const head = columns.map(c => escapeCell(c.header)).join(',');
  const body = rows.map(r => columns.map(c => escapeCell(c.value(r))).join(','));
  return [head, ...body].join('\n');
}

export function downloadCsv(filename, rows, columns) {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
