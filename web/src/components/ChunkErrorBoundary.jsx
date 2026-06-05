import { Component } from 'react';
import { reportLazyChunkError } from '../lib/clientLogger';

function forceReload() {
  const current = new URL(window.location.href);
  current.searchParams.set('_reload', String(Date.now()));
  try {
    window.location.replace(current.toString());
    return;
  } catch {
    // Fall through to the simplest browser navigation APIs below.
  }
  try {
    window.location.href = current.toString();
    return;
  } catch {
    // Last resort for constrained embedded browsers.
  }
  try { window.location.reload(); } catch {}
}

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    reportLazyChunkError(error, {
      chunk_name: this.props.name || 'react_boundary',
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const handleReload = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (this.reloading) return;
      this.reloading = true;
      const target = event?.currentTarget || event?.target;
      if (target) {
        target.disabled = true;
        target.textContent = 'Reloading...';
      }
      forceReload();
    };
    return this.props.fallback || (
      <div style={styles.box}>
        <div style={styles.title}>Error loading game UI</div>
        <button
          type="button"
          style={styles.button}
          onClick={handleReload}
          onPointerDown={handleReload}
          onMouseDown={handleReload}
          onTouchStart={handleReload}
        >
          Reload
        </button>
      </div>
    );
  }
}

const styles = {
  box: {
    position: 'fixed',
    inset: 0,
    zIndex: 2147483647,
    pointerEvents: 'auto',
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    background: '#0a0b1a',
    color: '#fff',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
  },
  button: {
    padding: '10px 22px',
    borderRadius: 8,
    border: '2px solid #5a3a22',
    background: 'linear-gradient(180deg, #ffe066, #e6b800)',
    color: '#2e1c10',
    fontWeight: 900,
    cursor: 'pointer',
    pointerEvents: 'auto',
    touchAction: 'manipulation',
    position: 'relative',
    zIndex: 1,
  },
};
