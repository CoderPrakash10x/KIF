import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import Pagination from './Pagination';

// columns: [{ key, header, render?(row), sortable?, sortValue?(row), align?, className? }]
// On narrow screens rows become labelled cards (see .table-wrap in tables.css).
export default function DataTable({
  columns, rows, rowKey = '_id', onRowClick, empty, pageSize = 10, pageSizes = [10, 25, 50], defaultSort = null, caption, server = null,
}) {
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    const val = r => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  // `server` = { page, totalPages, total, size, onPage, onSize, loading }: rows are already the current page.
  const pages = server ? Math.max(1, server.totalPages) : Math.max(1, Math.ceil(sorted.length / size));
  useEffect(() => { if (!server) setPage(1); }, [rows.length, size, server]);
  const current = server ? server.page : Math.min(page, pages);
  const visible = server ? sorted : sorted.slice((current - 1) * size, current * size);

  const toggleSort = key =>
    setSort(s => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  if (!rows.length) return empty || null;

  const onRowKey = (e, row) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onRowClick(row); }
  };
  const onClick = (e, row) => {
    if (e.target.closest('button, a, input, select, textarea, [data-no-row]')) return;
    onRowClick(row);
  };

  return (
    <div className={`table-card ${server?.loading ? 'is-loading' : ''}`} aria-busy={server?.loading || undefined}>
      <div className="table-wrap">
        <table className="table">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map(c => {
                const active = sort?.key === c.key;
                const SortIcon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th key={c.key} scope="col" className={c.className} style={{ textAlign: c.align }} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sortable && !server ? (
                      <button type="button" className={`th-sort ${active ? 'is-active' : ''}`} onClick={() => toggleSort(c.key)}>
                        {c.header}
                        <SortIcon size={13} aria-hidden="true" />
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr
                key={row[rowKey]} className={onRowClick ? 'is-clickable' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? e => onClick(e, row) : undefined}
                onKeyDown={onRowClick ? e => onRowKey(e, row) : undefined}
              >
                {columns.map(c => (
                  <td key={c.key} data-label={typeof c.header === 'string' ? c.header : ''} className={c.className} style={{ textAlign: c.align }}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={current} pages={pages} total={server ? server.total : sorted.length} size={server ? server.size : size} sizes={pageSizes}
        onPage={server ? server.onPage : setPage} onSize={server ? server.onSize : setSize}
      />
    </div>
  );
}
