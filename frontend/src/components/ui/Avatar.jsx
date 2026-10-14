import { initials } from '../../utils/format';

const hash = s => [...(s || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);

export default function Avatar({ name, src, size = 32, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };
  if (src) return <img className={`avatar ${className}`.trim()} src={src} alt="" style={style} />;
  return (
    <span className={`avatar avatar--c${hash(name) % 6} ${className}`.trim()} style={style} aria-hidden="true">
      {initials(name) || '?'}
    </span>
  );
}
