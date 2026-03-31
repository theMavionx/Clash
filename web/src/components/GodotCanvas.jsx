import { useEffect, useRef, useState, memo } from 'react';
import loadingImage from '../assets/file_00000000ba347246b47ea0b6a8a5e057.png';

const GODOT_FILES = '/godot'; // Path to exported Godot files

const canvasStyle = {
  width: '100%',
  height: '100%',
  display: 'block',
  outline: 'none',
};

const overlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: '#0a0b1a', // Match App.jsx background
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center', // Center progress block within screen easily
  alignItems: 'center',
  zIndex: 1000,
  transition: 'opacity 0.5s ease',
};

const imgStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover', // Повертаємо повноцінний повноекранний вигляд
  zIndex: -1,
  opacity: 0.9,
};

const progressWrapperStyle = {
  position: 'absolute',
  bottom: '10%', // Золота середина
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const barContainerStyle = {
  width: '60%',
  maxWidth: '500px',
  height: '36px',
  backgroundColor: '#1f130c', // Темне дерево
  border: '4px solid #4a2e1b', // Рамка з дерева
  borderRadius: '18px',
  boxShadow: '0 8px 16px rgba(0,0,0,0.8), inset 0 6px 10px rgba(0,0,0,0.9)',
  overflow: 'hidden',
  position: 'relative',
};

function GodotCanvas({ onEngineReady }) {
  const canvasRef = useRef(null);
  const loadedRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

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

      const ESTIMATED_TOTAL = 20000000; 

      const handleProgress = (current, total) => {
        if (total > 0) {
          setProgress(Math.round((current / total) * 100));
        } else {
          const pct = Math.min(99, Math.round((current / ESTIMATED_TOTAL) * 100));
          setProgress(pct);
        }
      };

      const engine = new GODOT({ onProgress: handleProgress });

      engine.startGame({
        canvas: canvasRef.current,
        executable: `${GODOT_FILES}/Work`,
        args: [],
        onProgress: handleProgress,
      }).then(() => {
        setIsLoaded(true);
        console.log('Godot game started');
        if (onEngineReady) onEngineReady(engine);
      }).catch(err => {
        console.error('Godot start error:', err);
      });
    };
    document.body.appendChild(script);
  }, []);

  return (
    <>
      {!isLoaded && (
        <div style={overlayStyle}>
          <img src={loadingImage} alt="Loading..." style={imgStyle} />
          
          <div style={progressWrapperStyle}>
            <div style={barContainerStyle}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: `
                    repeating-linear-gradient(
                      -45deg,
                      transparent,
                      transparent 12px,
                      rgba(255, 255, 255, 0.15) 12px,
                      rgba(255, 255, 255, 0.15) 24px
                    ),
                    linear-gradient(180deg, #ffde59 0%, #ff914d 100%)
                  `,
                  borderRight: progress > 0 ? '3px solid #ffeba1' : 'none',
                  boxShadow: 'inset 0 4px 6px rgba(255,255,255,0.4)',
                  transition: 'width 0.1s linear',
                  borderRadius: '12px 0 0 12px',
                }}
              />
            </div>
            <div style={{ 
              color: '#fff', 
              marginTop: '16px', 
              fontFamily: '"Inter", "Segoe UI", sans-serif', 
              fontSize: '22px', 
              fontWeight: 900, 
              WebkitTextStroke: '1.5px #1a1a1a', // Outline в стилі ігрових кнопок
              textShadow: '0 4px 6px rgba(0,0,0,0.8)',
              letterSpacing: '1px'
            }}>
              ЗАВАНТАЖЕННЯ {progress}%
            </div>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        id="godot-canvas"
        tabIndex={0}
        style={canvasStyle}
      />
    </>
  );
}

export default memo(GodotCanvas);
