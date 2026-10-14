import { ChevronLeft, ChevronRight } from 'lucide-react';

function pageList(page, pages) {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const out = [];
  [...set].filter(p => p >= 1 && p <= pages).sort((a, b) => a - b).forEach((p, i, arr) => {
    if (i && p - arr[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

export default function Pagination({ page, pages, total, size, sizes, onPage, onSize }) {
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(total, page * size);
  return (
    <div className="pagination">
      <p className="pagination__info" aria-live="polite">Showing {from}–{to} of {total}</p>
      <div className="pagination__controls">
        <label className="pagination__size">
          <span>Rows</span>
          <select value={size} onChange={e => onSize(Number(e.target.value))} aria-label="Rows per page">
            {sizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <nav aria-label="Pagination" className="pagination__pages">
          <button type="button" className="icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === '…' ? <span key={`gap-${i}`} className="pagination__gap">…</span> : (
              <button key={p} type="button" className={`pagination__page ${p === page ? 'is-active' : ''}`} aria-current={p === page ? 'page' : undefined} aria-label={`Page ${p}`} onClick={() => onPage(p)}>
                {p}
              </button>
            ),
          )}
          <button type="button" className="icon-btn" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      </div>
    </div>
  );
}
