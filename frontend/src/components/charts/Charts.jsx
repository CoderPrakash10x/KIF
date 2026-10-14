export function Legend({ series }) {
  return (
    <ul className="legend">
      {series.map(s => (
        <li key={s.name}><span className="legend__swatch" data-tone={s.tone} />{s.name}</li>
      ))}
    </ul>
  );
}

const niceMax = v => {
  if (v <= 10) return Math.max(5, Math.ceil(v / 5) * 5);
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
};

// Responsive column chart built from HTML so labels stay readable at any width.
export function BarChart({ labels, series, height = 200, unit = '', label }) {
  const max = niceMax(Math.max(...series.flatMap(s => s.values), 1));
  const showValues = labels.length <= 6;
  return (
    <div className="chart">
      {series.length > 1 && <Legend series={series} />}
      <div className="bars" style={{ '--chart-h': `${height}px` }} role="img" aria-label={label}>
        <div className="bars__grid" aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map(f => <span key={f}><i>{Math.round(max * f)}{unit}</i></span>)}
        </div>
        {labels.map((l, i) => (
          <div key={l} className="bars__col">
            <div className="bars__group">
              {series.map(s => (
                <div key={s.name} className="bar" data-tone={s.tone} style={{ height: `${(s.values[i] / max) * 100}%` }} title={`${s.name}, ${l}: ${s.values[i]}${unit}`}>
                  {showValues && series.length === 1 && <span className="bar__val">{s.values[i]}{unit}</span>}
                </div>
              ))}
            </div>
            <span className="bars__label">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({ labels, series, height = 200, unit = '', max: fixedMax, label }) {
  const max = fixedMax || niceMax(Math.max(...series.flatMap(s => s.values), 1));
  const x = i => (labels.length === 1 ? 50 : (i / (labels.length - 1)) * 100);
  const y = v => 100 - (v / max) * 100;
  return (
    <div className="chart">
      <Legend series={series.map(s => ({ ...s, name: `${s.name} (${s.values[s.values.length - 1]}${unit})` }))} />
      <div className="lines" style={{ '--chart-h': `${height}px` }} role="img" aria-label={label}>
        <div className="bars__grid" aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map(f => <span key={f}><i>{Math.round(max * f)}{unit}</i></span>)}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {series.map(s => (
            <polyline key={s.name} data-tone={s.tone} fill="none" vectorEffect="non-scaling-stroke" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          ))}
        </svg>
        <div className="lines__labels" aria-hidden="true">{labels.map(l => <span key={l}>{l}</span>)}</div>
      </div>
    </div>
  );
}

export function HBarList({ items, tone = 'primary', unit = '' }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <ul className="hbars">
      {items.map(i => (
        <li key={i.label}>
          <div className="hbars__row">
            <span className="hbars__label">{i.label}</span>
            <span className="hbars__value">{i.value}{unit}</span>
          </div>
          <div className="hbars__track"><div className="hbars__bar" data-tone={tone} style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
