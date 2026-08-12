// First-time mode selection screen for the futures panel. Shown when the
// player's `futures_mode` server column is NULL — i.e. they've never picked
// between Pro and Basic. Once they pick, the choice is persisted server-
// side and this component never renders again (until they explicitly
// switch from the profile toggle, which sets it back to a real value).
//
// Visual style mirrors the ClashBot Light terminal shell.

import { memo, useState } from 'react';
import { useFuturesMode } from '../contexts/FuturesModeContext';
import { uiButton } from '../styles/theme';

function FuturesModeSelect({ onClose }) {
  const { setMode } = useFuturesMode();
  const [busy, setBusy] = useState(null); // 'basic' | 'pro' | null

  const pick = async (m) => {
    if (busy) return;
    setBusy(m);
    await setMode(m);
    setBusy(null);
  };

  return (
    <div className="perps-mode-select" style={S.body}>
      <div style={S.title}>CHOOSE YOUR MODE</div>
      <div style={S.subtitle}>
        Pick how the futures panel feels. You can switch any time from your profile.
      </div>
      <div style={S.cards}>
        <button
          type="button"
          onClick={() => pick('basic')}
          style={{...S.card, ...S.cardBasic, ...(busy === 'basic' ? S.cardBusy : {})}}
          disabled={!!busy}
        >
          <div style={S.cardName}>BASIC</div>
          <div style={S.cardDesc}>
            Simplified UI. Market orders only, no advanced widgets — perfect
            if you just want to trade and earn gold.
          </div>
          <div style={S.cardCta}>{busy === 'basic' ? 'Saving…' : 'Pick Basic'}</div>
        </button>

        <button
          type="button"
          onClick={() => pick('pro')}
          style={{...S.card, ...S.cardPro, ...(busy === 'pro' ? S.cardBusy : {})}}
          disabled={!!busy}
        >
          <div style={S.cardName}>PRO</div>
          <div style={S.cardDesc}>
            Full feature set: limit orders, leverage slider, AI trade ideas,
            funding history, full chart and orderbook.
          </div>
          <div style={S.cardCta}>{busy === 'pro' ? 'Saving…' : 'Pick Pro'}</div>
        </button>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} style={S.skipBtn}>
          Decide later
        </button>
      )}
    </div>
  );
}

export default memo(FuturesModeSelect);

const S = {
  body: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '32px 24px', gap: 16,
    width: '100%', maxWidth: 720, margin: '0 auto',
  },
  title: {
    fontSize: 24, fontWeight: 750, color: 'var(--terminal-text)',
    letterSpacing: '1px', textAlign: 'center',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  subtitle: {
    fontSize: 13, fontWeight: 600, color: 'var(--terminal-text-muted)',
    textAlign: 'center', maxWidth: 460, marginBottom: 8,
    lineHeight: 1.5,
  },
  cards: {
    display: 'flex', gap: 16, width: '100%',
    flexWrap: 'wrap', justifyContent: 'center',
  },
  card: {
    ...uiButton('secondary'),
    flex: '1 1 240px', maxWidth: 320, minHeight: 240,
    background: 'var(--terminal-surface)',
    border: '1px solid var(--terminal-border)', borderRadius: 16, padding: 18,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 10, cursor: 'pointer',
    boxShadow: '0 8px 24px var(--terminal-shadow-soft)',
    transition: 'all 0.15s ease',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  cardBasic: {
    border: '1px solid var(--terminal-border)',
  },
  cardPro: {
    border: '1px solid var(--terminal-border)',
  },
  cardBusy: {
    opacity: 0.7, cursor: 'wait', transform: 'scale(0.98)',
  },
  cardName: {
    fontSize: 22, fontWeight: 750, color: 'var(--terminal-text)', letterSpacing: '0.5px',
  },
  cardDesc: {
    fontSize: 13, fontWeight: 600, color: 'var(--terminal-text-muted)',
    textAlign: 'center', flex: 1, lineHeight: 1.5,
  },
  cardCta: {
    fontSize: 13, fontWeight: 700, color: 'var(--terminal-brand-text)',
    background: 'var(--terminal-brand-soft)', border: '1px solid var(--terminal-orange)',
    padding: '9px 18px', borderRadius: 10,
  },
  skipBtn: uiButton('ghost', { alignSelf: 'center', minHeight: 34, fontSize: 12, textDecoration: 'underline', marginTop: 8 }),
};
