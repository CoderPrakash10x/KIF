import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import RootBoundary from './components/common/RootBoundary';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/pages.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootBoundary>
      <App />
    </RootBoundary>
  </StrictMode>,
);
