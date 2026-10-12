import { memo, useCallback, useEffect, useRef } from 'react';
import { useResources, useSend } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';

import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';

const ITEMS = [
  { key: 'gold', icon: goldIcon, indicator: 'var(--terminal-warning)', offset: { left: -22, top: '48%' } },
  { key: 'wood', icon: woodIcon, indicator: 'var(--terminal-long)', offset: { left: -14, top: '50%' } },
  { key: 'ore', icon: stoneIcon, indicator: 'var(--terminal-text-muted)', offset: { left: -14, top: '50%' } },
];

const fmtShort = (n) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(0) + 'K';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n || 0);
};

function ResourceBar() {
  const data = useResources();
  const { sendToGodot } = useSend();
  const caps = data.caps || { gold: 5000, wood: 5000, ore: 5000 };
  const { isMobile: mobile, isLandscape } = useLayout();

  // Publish icon screen positions to window so Godot's fly-to-icon animation
  // can target the real React HUD icons. Godot reads these via JavaScriptBridge.
  const barRef = useRef(null);
  const iconRefs = useRef({ gold: null, wood: null, ore: null });
  useEffect(() => {
    const publish = () => {
      const canvas = document.getElementById('godot-canvas');
      const canvasRect = canvas?.getBoundingClientRect?.();
      const canvasScaleX = canvas && canvasRect?.width
        ? canvas.width / canvasRect.width
        : (window.devicePixelRatio || 1);
      const canvasScaleY = canvas && canvasRect?.height
        ? canvas.height / canvasRect.height
        : (window.devicePixelRatio || 1);
      const out = {};
      const outCss = {};
      for (const key of ['gold', 'wood', 'ore']) {
        const el = iconRefs.current[key];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cssX = r.left + r.width / 2;
        const cssY = r.top + r.height / 2;
        out[key] = {
          x: Math.round((cssX - (canvasRect?.left || 0)) * canvasScaleX),
          y: Math.round((cssY - (canvasRect?.top || 0)) * canvasScaleY),
        };
        outCss[key] = {
          x: cssX,
          y: cssY,
        };
      }
      window.godotResourceIconPositions = out;
      // CSS-pixel variant for React-side overlays (purchase fly animation,
      // floating gain numbers). Godot coords above are converted through the
      // live canvas rect, which matters on phones where DPR is capped by the
      // Godot export and differs from window.devicePixelRatio.
      window.__clashResourceBarPositionsCss = outCss;
      return { godot: out, css: outCss };
    };
    const getPosition = (key, mode = 'godot') => {
      const positions = publish();
      const map = mode === 'css' ? positions.css : positions.godot;
      return map?.[key] ? JSON.stringify(map[key]) : '';
    };
    const publishBurst = () => {
      publish();
      let frames = 0;
      const tick = () => {
        publish();
        frames += 1;
        if (frames < 12) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    publish();
    window.__clashPublishResourceIconPositions = publish;
    window.__clashGetResourceIconPosition = getPosition;
    const ro = new ResizeObserver(publish);
    if (barRef.current) ro.observe(barRef.current);
    for (const el of Object.values(iconRefs.current)) if (el) ro.observe(el);
    window.addEventListener('resize', publish);
    window.addEventListener('orientationchange', publishBurst);
    window.addEventListener('scroll', publish, true);
    window.visualViewport?.addEventListener?.('resize', publishBurst);
    window.visualViewport?.addEventListener?.('scroll', publish);
    const iv = setInterval(publish, 2000); // catch layout shifts from mobile/orientation
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
      window.removeEventListener('orientationchange', publishBurst);
      window.removeEventListener('scroll', publish, true);
      window.visualViewport?.removeEventListener?.('resize', publishBurst);
      window.visualViewport?.removeEventListener?.('scroll', publish);
      clearInterval(iv);
      if (window.__clashPublishResourceIconPositions === publish) {
        delete window.__clashPublishResourceIconPositions;
      }
      if (window.__clashGetResourceIconPosition === getPosition) {
        delete window.__clashGetResourceIconPosition;
      }
    };
  }, [mobile, isLandscape]);

  useEffect(() => {
    window.__clashPublishResourceIconPositions?.();
  });

  const handleClick = useCallback((key) => {
    sendToGodot('add_resources', { resource: key });
  }, [sendToGodot]);

  return (
    <div ref={barRef} style={{ ...styles.bar, ...(mobile ? (isLandscape ? styles.barLandscape : styles.barMobile) : {}) }}>
      {ITEMS.map(({ key, icon, indicator, offset }) => {
        const current = data[key] || 0;
        const max = caps[key] || 5000;
        const pct = Math.min(100, (current / max) * 100);
        const full = current >= max;
        // Color shifts: green → yellow → red as it fills
        const barColor = indicator;

        return (
          <div key={key} style={styles.container}>
            <img
              ref={el => { iconRefs.current[key] = el; }}
              src={icon}
              alt={key}
              style={{
                ...styles.icon,
                ...(mobile ? styles.iconMobile : {}),
                ...(isLandscape ? { width: 40, height: 40 } : {}),
                left: mobile ? (offset?.left ?? -10) * 0.55 : (offset?.left ?? -10),
                top: offset?.top ?? '50%'
              }}
            />
            <div style={{ ...styles.pill, ...(mobile ? styles.pillMobile : {}), ...(isLandscape ? { minWidth: 110, height: 30, padding: '0 12px 0 34px' } : {}) }}>
              <div style={styles.textWrap}>
                <span style={{ ...styles.value, ...(mobile ? { fontSize: 13 } : {}) }}>{fmtShort(current)}</span>
                <span style={{ ...styles.maxValue, ...(mobile ? { fontSize: 9 } : {}) }}>/ {fmtShort(max)}</span>
              </div>
              <div style={{ ...styles.track, ...(mobile ? styles.trackMobile : {}) }}>
                <div style={{
                  ...styles.indicator,
                  background: barColor,
                  width: `${pct}%`,
                }} />
              </div>
              <button
                type="button"
                style={styles.hiddenButton}
                onClick={() => handleClick(key)}
                title={`Add ${key}`}
                aria-label={`Add ${key}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(ResourceBar);

const styles = {
  bar: {
    position: 'fixed',
    top: 16,
    right: 20,
    display: 'flex',
    flexDirection: 'row',
    gap: 25,
    pointerEvents: 'all',
    zIndex: 10,
    fontFamily: 'inherit',
  },
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: 48,
  },
  pill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 4,
    padding: '0 16px 0 52px',
    height: 40,
    boxSizing: 'border-box',
    border: '1px solid var(--terminal-border)',
    backgroundColor: 'rgba(17,20,27,0.95)',
    boxShadow: 'var(--terminal-shadow-card)',
    minWidth: 170,
    borderRadius: 999,
    position: 'relative',
    overflow: 'hidden',
  },
  track: {
    height: 6,
    borderRadius: 999,
    background: 'var(--terminal-surface-muted)',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  },
  trackMobile: {
    height: 4,
  },
  indicator: {
    height: '100%',
    borderRadius: 999,
    transition: 'width 0.4s ease-out, background-color 0.3s',
  },
  icon: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 74,
    height: 74,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
    pointerEvents: 'none',
    zIndex: 4,
  },
  textWrap: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    zIndex: 2,
    width: '100%',
    justifyContent: 'center',
    lineHeight: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--terminal-text)',
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
    letterSpacing: 0,
  },
  maxValue: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--terminal-text-muted)',
    fontVariantNumeric: 'tabular-nums',
    textShadow: 'none',
  },
  hiddenButton: {
    position: 'absolute',
    inset: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    zIndex: 3,
  },
  // Mobile portrait
  barMobile: {
    top: 8,
    right: 8,
    gap: 6,
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  // Mobile landscape — horizontal row, shifted right to avoid overlapping PlayerInfo
  barLandscape: {
    top: 6,
    right: 10,
    gap: 8,
    flexDirection: 'row',
  },
  pillMobile: {
    minWidth: 110,
    height: 30,
    gap: 3,
    padding: '0 12px 0 34px',
    borderRadius: 999,
  },
  iconMobile: {
    width: 48,
    height: 48,
  },
};
