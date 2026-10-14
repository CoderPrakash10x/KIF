// Decorative, low-contrast SVG for the teal brand panel (resource-network motif). Pure presentation:
// hidden from assistive tech, never receives pointer events, and only animates when motion is allowed.
export default function AuthArt() {
  const nodes = [[120, 140], [330, 90], [520, 210], [260, 330], [470, 440], [90, 470], [610, 90], [650, 360]];
  const links = [[0, 1], [1, 2], [0, 3], [3, 2], [3, 4], [2, 6], [2, 7], [5, 3], [4, 7], [1, 6]];
  return (
    <svg className="auth-art" viewBox="0 0 720 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="aa-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#fff" strokeWidth="0.6" />
        </pattern>
        <radialGradient id="aa-glow" cx="78%" cy="12%" r="70%">
          <stop offset="0" stopColor="#7fe3d3" stopOpacity="0.22" />
          <stop offset="1" stopColor="#7fe3d3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="aa-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="aa-mask"><rect width="720" height="900" fill="url(#aa-fade)" /></mask>
      </defs>
      <rect width="720" height="900" fill="url(#aa-glow)" />
      <rect width="720" height="900" fill="url(#aa-grid)" opacity="0.07" mask="url(#aa-mask)" />
      {/* floor-plan style room outlines */}
      <g fill="none" stroke="#fff" strokeOpacity="0.10" strokeWidth="1.2">
        <path d="M430 560h220v140H520v90H430z" /><path d="M520 700V560" /><path d="M430 650h90" />
        <path d="M60 640h170v180H60z" /><path d="M60 720h170" /><path d="M145 640v80" />
      </g>
      {/* soft layered curves */}
      <g fill="none" stroke="#fff" strokeWidth="1.2">
        <path d="M-40 760C140 640 260 840 420 720S640 600 780 680" strokeOpacity="0.10" />
        <path d="M-40 810C150 700 280 880 440 770S650 660 780 740" strokeOpacity="0.07" />
        <path d="M-40 860C160 760 300 920 460 820S660 720 780 800" strokeOpacity="0.05" />
        <circle cx="610" cy="120" r="150" strokeOpacity="0.07" /><circle cx="610" cy="120" r="230" strokeOpacity="0.05" /><circle cx="610" cy="120" r="320" strokeOpacity="0.035" />
      </g>
      {/* connected nodes: spaces, people and resources */}
      <g stroke="#bff3ea" strokeOpacity="0.16" strokeWidth="1">
        {links.map(([a, b]) => <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />)}
      </g>
      <g className="auth-art__nodes" fill="#bff3ea">
        {nodes.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="9" fillOpacity="0.07" /><circle cx={x} cy={y} r="3.2" fillOpacity="0.38" /></g>)}
      </g>
    </svg>
  );
}
