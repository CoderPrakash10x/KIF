export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    e.currentTarget.parentElement.children[next]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1} className={`tabs__tab ${value === t.id ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)} onKeyDown={e => onKey(e, i)}
        >
          {t.label}
          {t.count != null && <span className="tabs__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value} type="button" aria-pressed={value === o.value} aria-label={o.icon && !o.label ? o.ariaLabel : undefined}
          className={`seg__btn ${value === o.value ? 'is-active' : ''}`} onClick={() => onChange(o.value)}
        >
          {o.icon && <o.icon size={16} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
