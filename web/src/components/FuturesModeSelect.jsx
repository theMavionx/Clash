// First-time mode selection screen for the futures panel. Shown when the
// player's `futures_mode` server column is NULL — i.e. they've never picked
// between Pro and Basic. Once they pick, the choice is persisted server-
// side and this component never renders again (until they explicitly
// switch from the profile toggle, which sets it back to a real value).
//
// Visual style mirrors the parchment / cartoon look of RegisterPanel.

import { memo, useState } from 'react';
import { useFuturesMode } from '../contexts/FuturesModeContext';

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
    <div style={S.body}>
      <div style={S.title}>CHOOSE YOUR MODE</div>
      <div style={S.subtitle}>
        Pick how the futures panel feels. You can switch any time from your profile.
      </div>
      <div style={S.cards}>
        <button
          onClick={() => pick('basic')}
          style={{...S.card, ...S.cardBasic, ...(busy === 'basic' ? S.cardBusy : {})}}
          disabled={!!busy}
        >
          <div style={S.cardIcon}>🌱</div>
          <div style={S.cardName}>BASIC</div>
          <div style={S.cardDesc}>
            Simplified UI. Market orders only, no advanced widgets — perfect
            if you just want to trade and earn gold.
          </div>
          <div style={S.cardCta}>{busy === 'basic' ? 'Saving…' : 'Pick Basic'}</div>
        </button>

        <button
          onClick={() => pick('pro')}
          style={{...S.card, ...S.cardPro, ...(busy === 'pro' ? S.cardBusy : {})}}
          disabled={!!busy}
        >
          <div style={S.cardIcon}>⚡</div>
          <div style={S.cardName}>PRO</div>
          <div style={S.cardDesc}>
            Full feature set: limit orders, leverage slider, AI trade ideas,
            funding history, full chart and orderbook.
          </div>
          <div style={S.cardCta}>{busy === 'pro' ? 'Saving…' : 'Pick Pro'}</div>
        </button>
      </div>
      {onClose && (
        <button onClick={onClose} style={S.skipBtn}>
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
    fontSize: 24, fontWeight: 900, color: '#5C3A21',
    letterSpacing: '1px', textAlign: 'center',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  subtitle: {
    fontSize: 13, fontWeight: 600, color: '#8a7252',
    textAlign: 'center', maxWidth: 460, marginBottom: 8,
    lineHeight: 1.5,
  },
  cards: {
    display: 'flex', gap: 16, width: '100%',
    flexWrap: 'wrap', justifyContent: 'center',
  },
  card: {
    flex: '1 1 240px', maxWidth: 320, minHeight: 240,
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    border: '4px solid #d4c8b0', borderRadius: 18, padding: 18,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 10, cursor: 'pointer',
    boxShadow: '0 6px 16px rgba(92, 58, 33, 0.18)',
    transition: 'all 0.15s ease',
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  cardBasic: {
    borderColor: '#6ab344',
  },
  cardPro: {
    borderColor: '#0EA5E9',
  },
  cardBusy: {
    opacity: 0.7, cursor: 'wait', transform: 'scale(0.98)',
  },
  cardIcon: { fontSize: 40, lineHeight: 1, marginTop: 4 },
  cardName: {
    fontSize: 22, fontWeight: 900, color: '#5C3A21', letterSpacing: '1px',
  },
  cardDesc: {
    fontSize: 13, fontWeight: 600, color: '#77573d',
    textAlign: 'center', flex: 1, lineHeight: 1.5,
  },
  cardCta: {
    fontSize: 13, fontWeight: 800, color: '#5C3A21',
    background: '#e8dfc8', border: '2px solid #d4c8b0',
    padding: '8px 18px', borderRadius: 12,
  },
  skipBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#a3906a', fontSize: 12, fontWeight: 700,
    textDecoration: 'underline', marginTop: 8,
  },
};
