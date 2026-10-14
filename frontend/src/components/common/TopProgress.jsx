import { useEffect, useState, useSyncExternalStore } from 'react';
import { getBusy, subscribeBusy } from '../../lib/api';


export default function TopProgress() {
  const busy = useSyncExternalStore(subscribeBusy, getBusy) > 0;
  const [phase, setPhase] = useState('idle'); 
  useEffect(() => {
    if (busy) {
      const t = setTimeout(() => setPhase('run'), 150);
      return () => clearTimeout(t);
    }
    if (phase === 'run') {
      setPhase('done');
      const t = setTimeout(() => setPhase('idle'), 350);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [busy, phase]);
  if (phase === 'idle') return null;
  return <div className={`top-progress top-progress--${phase}`} role="progressbar" aria-label="Loading" aria-busy={phase === 'run'}><i /></div>;
}