import { Component } from 'react';
import { reportLazyChunkError } from '../lib/clientLogger';

function forceReload() {
  const current = new URL(window.location.href);
  current.searchParams.set('_reload', String(Date.now()));
  try {
    window.location.reload();
  } catch {
    window.location.replace(current.toString());
    return;
  }
  window.setTimeout(() => {
    try {
      window.location.replace(current.toString());
    } catch {
      window.location.href = current.toString();
    }
  }, 250);
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
    return this.props.fallback || (
      <div style={styles.box}>
        <div style={styles.title}>Error loading game UI</div>
        <button
          type="button"
          style={styles.button}
          onClick={(event) => {
            event.preventDefault();
            event.currentTarget.disabled = true;
            event.currentTarget.textContent = 'Reloading...';
            forceReload();
          }}
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
    zIndex: 99999,
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
  },
};
