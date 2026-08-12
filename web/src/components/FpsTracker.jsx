import { useEffect, useState, memo } from 'react';

const FPS_DROP_THRESHOLD = 40;
const FPS_CRITICAL_THRESHOLD = 25;
const HISTORY_SIZE = 120;

function FpsTracker() {
  const [perf, setPerf] = useState(null);

  useEffect(() => {
    function onPerf(e) {
      setPerf(e.detail);
    }
    window.addEventListener('godot-perf', onPerf);
    return () => window.removeEventListener('godot-perf', onPerf);
  }, []);

  if (!perf) return null;

  const fpsColor = perf.fps >= 55 ? '#44ff44'
    : perf.fps >= FPS_DROP_THRESHOLD ? '#aaff44'
    : perf.fps >= FPS_CRITICAL_THRESHOLD ? '#ffaa00'
    : '#ff4444';

  return (
    <div
      id="godot-perf-tracker"
      data-fps={perf.fps ?? ''}
      data-draw-calls={perf.draw_calls ?? ''}
      data-objects={perf.objects ?? ''}
      data-nodes={perf.nodes ?? ''}
      data-state={perf.state ?? ''}
      data-troops={perf.troops ?? ''}
      data-process-ms={perf.process_ms ?? ''}
      data-physics-ms={perf.physics_ms ?? ''}
      data-navigation-ms={perf.navigation_ms ?? ''}
      style={styles.container}
    >
      <span style={{ ...styles.fpsNumber, color: fpsColor }}>{perf.fps}</span>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: '50%',
    left: 8,
    transform: 'translateY(-50%)',
    zIndex: 100,
    pointerEvents: 'none',
    fontFamily: 'monospace',
    textShadow: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fpsNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 1,
    opacity: 0.8,
  },
};

export default memo(FpsTracker);
