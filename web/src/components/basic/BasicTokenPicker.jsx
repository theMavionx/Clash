// Step 1 — Token grid. User taps a token to begin the flow.
// 24h % rendered as a colored pill (green/red) so newcomers can read sentiment
// at a glance without parsing numbers.

import { memo, useMemo, useState, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars -- used as JSX namespace (`motion.button`), false positive
import { motion } from 'framer-motion';
import { colors, shared } from './styles';

const PCT_GREEN = '#4caf50';
const PCT_RED = '#e53935';

// Brand-coloured fallback backgrounds matching the rest of the app
// (FilterPopup / FuturesPanel use the same palette).
const TOKEN_COLORS = {
  BTC:'#F7931A',ETH:'#627EEA',SOL:'#9945FF',DOGE:'#C2A633',XRP:'#23292F',
  SUI:'#4DA2FF',TRUMP:'#FFD700',BNB:'#F3BA2F',HYPE:'#00D4AA',ENA:'#7C3AED',
  PAXG:'#E4CE4F',ZEC:'#F4B728',XMR:'#FF6600',AVAX:'#E84142',ADA:'#0033AD',
  DOT:'#E6007A',LINK:'#2A5ADA',ARB:'#213147',OP:'#FF0420',NEAR:'#000',
  XAU:'#FFD700',XAG:'#C0C0C0',CL:'#1a1a1a',NATGAS:'#4CAF50',
};

// Build the candidate-URL list for a symbol. Tries local first (svg/png
// in /public/tokens/), then a public crypto CDN — covers tokens that
// Pacifica adds dynamically without a corresponding local asset (CHIP,
// new listings etc.) so the user sees a real logo instead of an "C"
// fallback.
function logoSources(sym) {
  const s = String(sym || '').toUpperCase();
  return [
    `/tokens/${s}.svg`,
    `/tokens/${s}.png`,
    `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`,
  ];
}

function TokenIcon({ sym, size = 28 }) {
  const bg = TOKEN_COLORS[sym] || colors.inkFaint;
  const sources = useMemo(() => logoSources(sym), [sym]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  // Reset state when symbol changes — TokenIcon may be reused via
  // memoization for different tokens; without this the failed-state from
  // a previous symbol could carry over.
  useEffect(() => {
    setIdx(0);
    setFailed(false);
  }, [sym]);

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {!failed ? (
        <img
          src={sources[idx]}
          alt=""
          width={size} height={size}
          style={{ borderRadius: '50%' }}
          onError={() => {
            if (idx < sources.length - 1) {
              setIdx(idx + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%',
          fontSize: size * 0.5, fontWeight: 900, color: '#fff',
        }}>
          {String(sym).charAt(0)}
        </span>
      )}
    </div>
  );
}

function pctColor(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return colors.inkFaint;
  if (n === 0) return colors.inkFaint;
  return n > 0 ? PCT_GREEN : PCT_RED;
}

function fmtPrice(p) {
  const n = Number(p);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtPct(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

// 24h-change pill is rendered as a tiny horizontal bar where the fill width
// scales to a ±10% range. Visual cue beats numeric reading for first-time
// traders.
function ChangeBar({ pct }) {
  const n = Number(pct) || 0;
  const clamped = Math.max(-10, Math.min(10, n));
  const fillPct = (Math.abs(clamped) / 10) * 100;
  const color = pctColor(n);
  return (
    <div style={{
      position: 'relative', width: '100%', height: 4,
      borderRadius: 2, background: 'rgba(92,58,33,0.08)',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: n >= 0 ? '50%' : `${50 - fillPct / 2}%`,
        width: `${fillPct / 2}%`,
        background: color,
        transition: 'all 0.3s ease',
      }} />
    </div>
  );
}

function BasicTokenPicker({ markets, prices, onPick }) {
  const [search, setSearch] = useState('');

  // Build a sorted, filtered list. 24h change is computed from
  // `yesterday_price` (Pacifica's actual field) — earlier I read a non-
  // existent `change_24h` key, hence the +0.00% on every card.
  const list = useMemo(() => {
    if (!Array.isArray(markets)) return [];
    const priceBy = {};
    if (Array.isArray(prices)) {
      for (const p of prices) priceBy[p.symbol] = p;
    }
    const q = search.trim().toLowerCase();
    return markets
      .filter(m => !q || m.symbol.toLowerCase().includes(q))
      .map(m => {
        const p = priceBy[m.symbol];
        const mark = p ? parseFloat(p.mark || p.mid || 0) : 0;
        const yest = p ? parseFloat(p.yesterday_price || 0) : 0;
        const change24h = yest > 0 ? ((mark - yest) / yest) * 100 : 0;
        return {
          symbol: m.symbol,
          // Icon symbol = base token (e.g. "BTC" for "BTC-USD" market).
          iconSym: m.base || m.symbol,
          price: mark,
          change24h,
          volume: Number(p?.volume_24h || 0),
          market: m,
        };
      })
      .sort((a, b) => b.volume - a.volume);
  }, [markets, prices, search]);

  return (
    // `grad-scrollbar` class — picks up the project-wide parchment-toned
    // scrollbar styles injected by FuturesPanel (matches ShopPanel,
    // SymbolPicker etc. so it doesn't feel like a bolted-on screen).
    <div className="grad-scrollbar" style={shared.page}>
      <h2 style={shared.title}>Pick a token</h2>
      <div style={shared.subtitle}>What do you want to trade?</div>

      <div style={S.searchWrap}>
        <span style={S.searchIcon}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search BTC, ETH, SOL…"
          style={S.searchInput}
        />
      </div>

      <div style={S.grid}>
        {list.length === 0 && (
          <div style={S.empty}>
            {markets?.length ? `No tokens match "${search}"` : 'Loading markets…'}
          </div>
        )}
        {list.map((t, i) => (
          <motion.button
            key={t.symbol}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.025, 0.4), duration: 0.2 }}
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPick(t.market)}
            style={S.card}
          >
            <div style={S.symbolRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <TokenIcon sym={t.iconSym} size={26} />
                <span style={S.symbol}>{t.symbol}</span>
              </div>
              <span style={{ ...S.pct, color: pctColor(t.change24h) }}>
                {fmtPct(t.change24h)}
              </span>
            </div>
            <div style={S.price}>${fmtPrice(t.price)}</div>
            <ChangeBar pct={t.change24h} />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default memo(BasicTokenPicker);

const S = {
  searchWrap: {
    position: 'relative', width: '100%',
    margin: '0 0 4px',
  },
  searchIcon: {
    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
    fontSize: 14, opacity: 0.5, pointerEvents: 'none',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px 10px 36px',
    fontSize: 14, fontWeight: 600, color: colors.ink,
    background: 'rgba(255,255,255,0.6)',
    border: `2px solid ${colors.border}`, borderRadius: 12,
    outline: 'none',
    fontFamily: 'inherit',
  },
  // Token grid scrolls via the parent's `overflow: auto` (shared.page).
  // No internal scrolling needed — the page handles it naturally because
  // Token picker is the only step that sets no fixed grid-template-rows.
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 10,
    paddingBottom: 4,
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center', padding: 32,
    fontSize: 14, color: colors.inkFaint, fontWeight: 600,
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: 12,
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    border: `2px solid ${colors.border}`, borderRadius: 14,
    cursor: 'pointer', textAlign: 'left',
    boxShadow: '0 2px 6px rgba(92,58,33,0.12)',
    fontFamily: 'inherit',
  },
  symbolRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 6,
  },
  symbol: {
    fontSize: 14, fontWeight: 900, color: colors.ink, letterSpacing: '0.4px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  pct: {
    fontSize: 11, fontWeight: 800,
    flexShrink: 0,
  },
  price: {
    fontSize: 18, fontWeight: 900, color: colors.ink,
    fontVariantNumeric: 'tabular-nums',
  },
};
