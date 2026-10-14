import { Component } from 'react';

// Last line of defence: a render crash outside the app shell must never leave a blank white page.
export default class RootBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[KIF-RMS] fatal render error', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <div>
          <h1>Something went wrong</h1>
          <p>The app hit an unexpected problem. Your data is safe.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 18px', borderRadius: 8, border: 0, background: '#0b8374', color: '#fff', cursor: 'pointer' }}>Reload</button>
        </div>
      </main>
    );
  }
}
