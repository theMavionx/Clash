import { useEffect, useRef, memo } from 'react';

const GODOT_FILES = '/godot'; // Path to exported Godot files

const canvasStyle = {
  width: '100%',
  height: '100%',
  display: 'block',
  outline: 'none',
};

function GodotCanvas({ onEngineReady }) {
  const canvasRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const script = document.createElement('script');
    script.src = `${GODOT_FILES}/Work.js`;
    script.onload = () => {
      const GODOT = window.Engine || window.Godot;
      if (!GODOT) {
        console.error('Godot engine not found');
        return;
      }

      const engine = new GODOT();
      engine.startGame({
        canvas: canvasRef.current,
        executable: `${GODOT_FILES}/Work`,
        args: [],
      }).then(() => {
        console.log('Godot game started');
        if (onEngineReady) onEngineReady(engine);
      }).catch(err => {
        console.error('Godot start error:', err);
      });
    };
    document.body.appendChild(script);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="godot-canvas"
      tabIndex={0}
      style={canvasStyle}
    />
  );
}

export default memo(GodotCanvas);
