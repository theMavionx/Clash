import { useState, memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSend, useUI, usePlayer } from '../hooks/useGodot';
import { useLayout } from '../hooks/useIsMobile';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePacifica } from '../hooks/usePacifica';
import { useAvantis } from '../hooks/useAvantis';
import { useDex, DEX_CONFIG } from '../contexts/DexContext';
import { useFarcaster } from '../hooks/useFarcaster';
import { cartoonBtn } from '../styles/theme';
import TradingViewWidget from './TradingViewWidget';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import FundingHistory from './FundingHistory';
import QuestsTab from './QuestsTab';
import TradeIdeaModal from './TradeIdeaModal';
import { useElfaSignals } from '../hooks/useElfaSignals';
import FilterPopup from './FilterPopup';
import pacificaLogo from '../assets/pacifica.png';
import elfaBadge from '../assets/photo_5976518637193465030_x.jpg';

const TABS = [
  { id: 'Trade', icon: <svg className="tab-icon-trade" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path className="trend-line" d="m19 9-5 5-4-4-3 3"/></svg>, label: 'Trade' },
  { id: 'Positions', icon: <svg className="tab-icon-positions" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect className="briefcase-body" width="20" height="14" x="2" y="7" rx="2" ry="2"/><path className="handle" d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, label: 'Positions' },
  { id: 'Orders', icon: <svg className="tab-icon-orders" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line className="order-line" x1="8" y1="6" x2="21" y2="6"/><line className="order-line" x1="8" y1="12" x2="21" y2="12"/><line className="order-line" x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>, label: 'Orders' },
  { id: 'Quests', icon: <svg className="tab-icon-quests" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><g className="sword-group"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></g></svg>, label: 'Quests' },
  { id: 'Account', icon: <svg className="tab-icon-account" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path className="avatar-body" d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle className="avatar-head" cx="12" cy="7" r="4"/></svg>, label: 'Account' },
];

const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'SUI', 'TRUMP'];

// Format price — no decimals for big numbers, appropriate precision for small
const fmtPrice = (p) => {
  if (p >= 1000) return p.toLocaleString(undefined, {maximumFractionDigits: 0});
  if (p >= 1) return p.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  return p.toPrecision(4);
};

// Token icons — served locally from /tokens/{SYM}.png
const TOKEN_COLORS = {
  BTC:'#F7931A',ETH:'#627EEA',SOL:'#9945FF',DOGE:'#C2A633',XRP:'#23292F',
  SUI:'#4DA2FF',TRUMP:'#FFD700',BNB:'#F3BA2F',HYPE:'#00D4AA',ENA:'#7C3AED',
  PAXG:'#E4CE4F',ZEC:'#F4B728',XMR:'#FF6600',AVAX:'#E84142',ADA:'#0033AD',
  DOT:'#E6007A',LINK:'#2A5ADA',ARB:'#213147',OP:'#FF0420',NEAR:'#000',
  GOLD:'#FFD700',SILVER:'#C0C0C0',CL:'#1a1a1a',NATGAS:'#4CAF50',
};
// US equities known to have Parqet logo coverage (verified by probing).
const STOCK_SYMBOLS = new Set([
  'AAPL','AMZN','MSFT','NVDA','TSLA','GOOGL','GOOG','META','NFLX','AMD',
  'COIN','HOOD','MSTR','INTC','SPY','QQQ','DIS','IBM','ORCL','PYPL',
  'PLTR','SMCI','GME','BA','WMT','MCD','SBUX','BABA','KO','PEP',
  'JPM','BAC','GS','WFC','V','MA','CRCL',
]);
// Commodities map (Avantis uses CL/NATGAS/COPPER/GOLD/SILVER; Parqet carries
// the big ones by ticker). Unknown → letter fallback.
const COMMODITY_SYMBOLS = new Set(['CL','COPPER','GOLD','SILVER','NATGAS','BRENT']);

// Canonicalise a display symbol (strip "/USD" pair suffix, upper-case) so
// lookup keys are stable no matter which hook produced the value.
function canonSym(sym) {
  return String(sym || '').toUpperCase().split('/')[0].trim();
}

// Module-level caches: once a URL is known-good (or all sources failed) for a
// symbol, NEVER hit the network again from any TokenIcon mount. This prevents
// the 1000+ repeated 404s on re-renders / picker scrolls.
const logoCache = new Map(); // sym → resolved URL
const logoFailed = new Set(); // sym → definitely no logo found

function tokenLogoSources(sym) {
  const s = canonSym(sym);
  const low = s.toLowerCase();
  const srcs = [
    `/tokens/${s}.svg`,
    `/tokens/${s}.png`,
  ];
  if (STOCK_SYMBOLS.has(s) || COMMODITY_SYMBOLS.has(s)) {
    // Parqet covers US equities and major commodities.
    srcs.push(`https://assets.parqet.com/logos/symbol/${s}?format=png`);
  } else {
    // Crypto: Coincap first (broad coverage, small PNGs), Spothq as backup.
    srcs.push(`https://assets.coincap.io/assets/icons/${low}@2x.png`);
    srcs.push(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@latest/svg/color/${low}.svg`);
  }
  return srcs;
}

const TokenIcon = ({sym, size = 20}) => {
  const canon = canonSym(sym);
  const bg = TOKEN_COLORS[canon] || '#a3906a';

  // Resolved from cache? Skip straight to the image.
  const cached = logoCache.get(canon);
  const [srcIdx, setSrcIdx] = useState(0);
  const [failed, setFailed] = useState(logoFailed.has(canon));

  // Rebuild sources once per symbol (not every render) to avoid thrash.
  const sources = useMemo(() => (cached ? [cached] : tokenLogoSources(canon)), [canon, cached]);

  useEffect(() => {
    setSrcIdx(0);
    setFailed(logoFailed.has(canon));
  }, [canon]);

  const onImgError = useCallback(() => {
    if (srcIdx < sources.length - 1) {
      setSrcIdx(srcIdx + 1);
    } else {
      logoFailed.add(canon);
      setFailed(true);
    }
  }, [srcIdx, sources.length, canon]);

  const onImgLoad = useCallback((e) => {
    // Only cache successful remote URLs — local /tokens may change at build.
    const url = sources[srcIdx];
    if (url && !logoCache.has(canon)) logoCache.set(canon, url);
  }, [sources, srcIdx, canon]);

  return (
    <div style={{width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden'}}>
      {!failed ? (
        <img
          src={sources[srcIdx]}
          alt=""
          width={size}
          height={size}
          style={{borderRadius: '50%', objectFit: 'cover'}}
          onError={onImgError}
          onLoad={onImgLoad}
        />
      ) : (
        <span style={{fontSize: size * 0.5, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%'}}>
          {canon.charAt(0)}
        </span>
      )}
    </div>
  );
};

const SignalIcon = ({ type, size = 14 }) => {
  if (type === '🔥') return (
    <svg width={size} height={size} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-label="hot">
      <path fill="#FF6B35" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176A7.55 7.55 0 0 1 6.648 6.61a.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248Z" />
      <path fill="#FFD54A" d="M15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.545 3.75 3.75 0 0 1 3.255 3.717Z" />
    </svg>
  );
  if (type === '📈') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
  if (type === '📉') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  );
  if (type === '💀') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a3906a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm6 0a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5z" />
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
      <path d="M12 13c-2 0-3 1-3 3s1 3 3 3 3-1 3-3-1-3-3-3z" />
    </svg>
  );
  return null;
};

// Symbol picker dropdown with logo, max leverage, price, 24h change
const SymbolPicker = memo(function SymbolPicker({ markets, prices, symbol, onSelect, fullscreen, signals }) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    return markets.map(m => {
      const p = prices.find(pr => pr.symbol === m.symbol);
      const mark = p ? parseFloat(p.mark) : 0;
      const yest = p ? parseFloat(p.yesterday_price || 0) : 0;
      const change = yest > 0 ? ((mark - yest) / yest) * 100 : 0;
      return {
        symbol: m.symbol,
        // Prefer the human-readable pair ("USD/JPY") when present; falls back
        // to the symbol key for legacy Pacifica markets that only ship base.
        label: m.pair || m.symbol,
        iconSym: m.base || m.symbol,
        maxLev: m.max_leverage,
        mark,
        change,
      };
    }).filter(r => !search || r.label.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [markets, prices, search]);

  return (
    <div style={{maxHeight: fullscreen ? '75vh' : 350, display: 'flex', flexDirection: 'column', gap: 6, flex: 1}}>
      <input
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
        style={{padding: '6px 10px', border: '2px solid #d4c8b0', borderRadius: 8, background: '#fdf8e7', fontSize: 13, fontWeight: 700, color: '#5C3A21', outline: 'none'}}
      />
      <div className="grad-scrollbar" style={{overflowY: 'auto', flex: 1}}>
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: '"Inter","Segoe UI",sans-serif'}}>
          <thead><tr>
            <th style={SP.th}>Symbol</th>
            <th style={{...SP.th, textAlign: 'right'}}>Price</th>
            <th style={{...SP.th, textAlign: 'right'}}>24h</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.symbol} onClick={() => onSelect(r.symbol)}
              style={{...SP.row, background: r.symbol === symbol ? '#e8dfc8' : 'transparent', cursor: 'pointer'}}>
              <td style={SP.td}>
                <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
                  <TokenIcon sym={r.iconSym} size={18} />
                  <span style={{fontWeight: 900, color: '#5C3A21'}}>{r.label}</span>
                  <span style={{fontSize: 10, fontWeight: 800, color: '#a3906a'}}>{r.maxLev}x</span>
                  {(() => {
                    // If signals are loaded but this symbol isn't in the top-N trending feed,
                    // we know Elfa has no chatter for it → show 💀 "quiet" badge.
                    const loaded = signals && Object.keys(signals).length > 0;
                    const sig = signals && signals[r.symbol];
                    if (!loaded) return null;
                    const badge = sig ? sig.badge : '💀';
                    const label = sig ? sig.label : 'quiet';
                    if (badge === '·') return null;
                    return (
                      <span title={label} style={{display: 'inline-flex', alignItems: 'center'}}>
                        <SignalIcon type={badge} size={14} />
                      </span>
                    );
                  })()}
                </div>
              </td>
              <td style={{...SP.td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#5C3A21'}}>
                {r.mark > 0 ? fmtPrice(r.mark) : '—'}
              </td>
              <td style={{...SP.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: r.change >= 0 ? '#4CAF50' : '#E53935'}}>
                {r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}%
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
});

const SP = {
  th: { padding: '4px 8px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase', borderBottom: '2px solid #d4c8b0' },
  td: { padding: '6px 8px', borderBottom: '1px solid #e8dfc8' },
  row: { transition: 'background 0.1s' },
};

// ==================== ORDERS LIST (mobile/tab card view) ====================
const OrdersList = memo(function OrdersList({ orders, cancelOrder }) {
  if (!orders.length) {
    return (
      <div style={S.empty}>
        <div style={{opacity: 0.3, color: '#5C3A21'}}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </div>
        <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Orders</div>
      </div>
    );
  }
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      {orders.map((o, i) => {
        const sym = o.symbol || o.s;
        const side = o.side || o.d;
        const rawPrice = parseFloat(o.price || o.ip || 0);
        const stopPrice = parseFloat(o.stop_price || o.sp || 0);
        const price = rawPrice > 0 ? rawPrice : stopPrice;
        const rawAmt = o.initial_amount || o.amount || o.a;
        const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full position';
        const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
        const isBid = side === 'bid';
        const isTP = type.includes('TAKE') || type.includes('TP');
        const isSL = type.includes('STOP LOSS') || type.includes('SL');
        const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
        return (
          <div key={i} style={S.posCard}>
            <div style={S.row}>
              <span style={{fontSize: 16, fontWeight: 900}}>{sym}</span>
              <span style={{fontSize: 10, fontWeight: 800, color: typeColor, background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{type}</span>
              <span style={{fontSize: 13, fontWeight: 900, color: isBid ? '#4CAF50' : '#E53935'}}>
                {isBid ? 'BUY' : 'SELL'}
              </span>
              <button style={S.cancelBtn} onClick={() => cancelOrder(sym, o.order_id || o.i, o.pair_index, o.trade_index)}>✕</button>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Price: ${parseFloat(price).toLocaleString()}</span>
              <span style={S.detail}>Amount: {amt}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ==================== POSITIONS LIST (mobile/tab card view) ====================
const PositionsList = memo(function PositionsList({
  positions, prices, dataReady, leverageSettings, marginModes, loading, error,
  closePosition, setTpsl, clearError,
}) {
  const [expandedPos, setExpandedPos] = useState(null);
  const [closePct, setClosePct] = useState(100);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');

  if (!positions.length) {
    return (
      <div style={S.empty}>
        <div style={{opacity: 0.3, color: '#5C3A21'}}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        </div>
        <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>{dataReady ? 'No Positions' : 'Loading...'}</div>
      </div>
    );
  }
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start'}}>
      {positions.map((pos, i) => {
        const mark = prices.find(p => p.symbol === pos.symbol)?.mark;
        const entryP = parseFloat(pos.entry_price);
        const markP = mark ? parseFloat(mark) : 0;
        const amt = parseFloat(pos.amount);
        const margin = parseFloat(pos.margin || 0);
        const pnlVal = markP ? (markP - entryP) * amt * (pos.side === 'bid' ? 1 : -1) : 0;
        const setLev = (margin > 0 && entryP > 0 && amt > 0) ? Math.round((amt * entryP) / margin) : (leverageSettings[pos.symbol] || 1);
        const posValueUsd = markP ? amt * markP : amt * entryP;
        const pnlPct = entryP && markP ? ((markP - entryP) / entryP * 100 * (pos.side === 'bid' ? 1 : -1) * (typeof setLev === 'number' ? setLev : 1)) : 0;
        const pnlColor = pnlVal >= 0 ? '#4CAF50' : '#E53935';
        const posKey = `${pos.symbol}-${pos.side}`;
        const expanded = expandedPos?.startsWith(posKey) ? expandedPos.split(':')[1] : null;

        return (
          <div key={i} style={S.posCard}>
            <div style={S.row}>
              <span style={{fontSize: 16, fontWeight: 900}}>{pos.symbol}</span>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                {(() => {
                  const isIso = pos.is_isolated ?? marginModes?.[pos.symbol];
                  return (
                    <span style={{fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, border: '1px solid', borderColor: isIso ? '#FF9800' : '#4CAF50', color: isIso ? '#FF9800' : '#4CAF50', background: 'rgba(255,255,255,0.4)'}}>
                      {isIso ? 'ISO' : 'CROSS'}
                    </span>
                  );
                })()}
                <span style={{fontSize: 11, fontWeight: 800, color: '#a3906a', background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{setLev}x</span>
                <span style={{fontSize: 13, fontWeight: 900, color: pos.side === 'bid' ? '#4CAF50' : '#E53935'}}>
                  {pos.side === 'bid' ? 'LONG' : 'SHORT'}
                </span>
              </div>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Size: {pos.amount} <span style={{color: '#a3906a'}}>(${posValueUsd.toFixed(2)})</span></span>
              <span style={S.detail}>Entry: ${parseFloat(pos.entry_price).toLocaleString()}</span>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Mark: {markP ? `$${markP.toLocaleString()}` : '—'}</span>
              <span style={{fontSize: 14, fontWeight: 900, color: pnlColor}}>
                {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
              </span>
            </div>

            {/* Action buttons */}
            <div style={{display: 'flex', gap: 6, marginTop: 4}}>
              <button style={S.btnRed} onClick={() => { setClosePct(100); setExpandedPos(expanded === 'close' ? null : `${posKey}:close`); }}>Close</button>
              <button style={S.btnBlue} onClick={() => setExpandedPos(expanded === 'tpsl' ? null : `${posKey}:tpsl`)}>TP/SL</button>
            </div>

            {/* Close slider */}
            {expanded === 'close' && (
              <div style={S.expandPanel}>
                <div style={S.row}>
                  <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>Close {closePct}%</span>
                  <span style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>
                    {(parseFloat(pos.amount) * closePct / 100).toFixed(6)} {pos.symbol}
                  </span>
                </div>
                <input type="range" min="5" max="100" step="5" value={closePct} className="grad-slider" onChange={e => setClosePct(Number(e.target.value))} style={{...S.slider, '--val': `${((closePct - 5) / 95) * 100}%`}} />
                <div style={S.sliderLabels}><span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                <button style={{...S.btnRed, width: '100%'}} onClick={() => closePosition(pos.symbol, pos.side, String(parseFloat(pos.amount) * closePct / 100), pos.pair_index, pos.trade_index)} disabled={loading}>
                  {loading ? 'Closing...' : `Close ${closePct}%`}
                </button>
              </div>
            )}

            {/* TP/SL */}
            {expanded === 'tpsl' && (
              <div style={{...S.expandPanel, ...S.row}}>
                <input type="number" placeholder="TP Price" value={tpPrice} onChange={e => setTpPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                <input type="number" placeholder="SL Price" value={slPrice} onChange={e => setSlPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                <button style={S.btnBlue} onClick={async () => {
                  await setTpsl(pos.symbol, pos.side === 'bid' ? 'ask' : 'bid', tpPrice || null, slPrice || null, pos.pair_index, pos.trade_index);
                  setTpPrice(''); setSlPrice(''); setExpandedPos(null);
                }} disabled={!tpPrice && !slPrice}>Set</button>
              </div>
            )}
          </div>
        );
      })}

      {error && <div style={S.errorBar} onClick={clearError}>{error}</div>}
    </div>
  );
});

// ==================== BOTTOM PANEL (fullscreen table view) ====================
const BottomPanel = memo(function BottomPanel({
  bottomH, bottomTab, setBottomTab,
  showFilter, setShowFilter, btmFilters, setBtmFilters,
  btmSymbols, sortOptionsForTab, hasActiveFilters,
  filteredPositions, filteredOrders,
  prices, walletAddr, dataReady, leverageSettings,
  closePosition, cancelOrder, dex,
}) {
  // Avantis has no order-flow history or funding payments exposed via a
  // public API like Pacifica, so we hide those tabs entirely on that DEX.
  const tabs = [
    { id: 'positions', label: `Positions (${filteredPositions.length})` },
    { id: 'orders', label: `Orders (${filteredOrders.length})` },
    ...(dex === 'avantis' ? [] : [
      { id: 'history', label: 'History' },
      { id: 'funding', label: 'Funding' },
    ]),
  ];

  return (
    <div style={{...S.bottomPanel, height: bottomH}}>
      <div style={{...S.bottomTabs, position: 'relative'}}>
        {tabs.map(t => (
          <button key={t.id} style={bottomTab === t.id ? S.bottomTabActive : S.bottomTabBtn} onClick={() => { setBottomTab(t.id); setShowFilter(false); }}>
            {t.label}
          </button>
        ))}
        <button
          style={{...S.filterBtn, ...(hasActiveFilters ? S.filterBtnActive : {})}}
          onClick={() => setShowFilter(v => !v)}
          title="Filters"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46"/></svg>
          {hasActiveFilters && <span style={S.filterDot} />}
        </button>
        <FilterPopup
          visible={showFilter}
          onClose={() => setShowFilter(false)}
          filters={btmFilters}
          onChange={setBtmFilters}
          symbols={btmSymbols}
          showSide={bottomTab !== 'funding' || true}
          sortOptions={sortOptionsForTab}
        />
      </div>
      <div style={S.bottomContent}>
        {bottomTab === 'positions' && (
          filteredPositions.length ? (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Symbol</th><th style={S.th}>Side</th><th style={S.th}>Size</th>
                <th style={S.th}>Entry</th><th style={S.th}>Mark</th><th style={S.th}>PnL</th>
                <th style={S.th}>PnL %</th><th style={S.th}>Lev</th><th style={S.th}></th>
              </tr></thead>
              <tbody>{filteredPositions.map((p, i) => {
                const mark = prices.find(pr => pr.symbol === p.symbol)?.mark;
                const entryPrice = parseFloat(p.entry_price);
                const markPrice = mark ? parseFloat(mark) : 0;
                const tblAmt = parseFloat(p.amount);
                const tblMargin = parseFloat(p.margin || 0);
                const pnlVal = markPrice ? (markPrice - entryPrice) * tblAmt * (p.side === 'bid' ? 1 : -1) : 0;
                const lev = (tblMargin > 0 && entryPrice > 0 && tblAmt > 0) ? Math.round((tblAmt * entryPrice) / tblMargin) : (leverageSettings[p.symbol] || 1);
                const tblPosValue = markPrice ? tblAmt * markPrice : tblAmt * entryPrice;
                const pnlPct = entryPrice && markPrice ? ((markPrice - entryPrice) / entryPrice * 100 * (p.side === 'bid' ? 1 : -1) * (typeof lev === 'number' ? lev : 1)) : 0;
                const pnlColor = pnlVal >= 0 ? '#4CAF50' : '#E53935';
                return (
                  <tr key={i} style={S.tr}>
                    <td style={S.td}>{p.symbol}</td>
                    <td style={{...S.td, color: p.side === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{p.side === 'bid' ? 'LONG' : 'SHORT'}</td>
                    <td style={S.td}>{p.amount} <span style={{color: '#a3906a', fontSize: 11}}>(${tblPosValue.toFixed(2)})</span></td>
                    <td style={S.td}>${entryPrice.toLocaleString()}</td>
                    <td style={S.td}>{markPrice ? `$${markPrice.toLocaleString()}` : '—'}</td>
                    <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)}</td>
                    <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</td>
                    <td style={S.td}>{lev}x</td>
                    <td style={S.td}>
                      <button style={S.tblCloseBtn} onClick={() => closePosition(p.symbol, p.side, p.amount, p.pair_index, p.trade_index)}>Close</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>{!dataReady ? 'Loading...' : hasActiveFilters ? 'No positions match filters' : 'No open positions'}</div>
        )}
        {bottomTab === 'orders' && (
          filteredOrders.length ? (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Symbol</th><th style={S.th}>Side</th><th style={S.th}>Type</th>
                <th style={S.th}>Price</th><th style={S.th}>Amount</th><th style={S.th}></th>
              </tr></thead>
              <tbody>{filteredOrders.map((o, i) => {
                const sym = o.symbol || o.s;
                const side = o.side || o.d;
                const rawPrice = parseFloat(o.price || o.ip || 0);
                const stopPrice = parseFloat(o.stop_price || o.sp || 0);
                const price = rawPrice > 0 ? rawPrice : stopPrice;
                const rawAmt = o.initial_amount || o.amount || o.a;
                const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full';
                const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
                const isTP = type.includes('TAKE') || type.includes('TP');
                const isSL = type.includes('STOP LOSS') || type.includes('SL');
                const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
                return (
                  <tr key={i} style={S.tr}>
                    <td style={S.td}>{sym}</td>
                    <td style={{...S.td, color: side === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{side === 'bid' ? 'BUY' : 'SELL'}</td>
                    <td style={{...S.td, color: typeColor, fontWeight: 700}}>{type}</td>
                    <td style={S.td}>${price.toLocaleString()}</td>
                    <td style={S.td}>{amt}</td>
                    <td style={S.td}>
                      <button style={S.tblCloseBtn} onClick={() => cancelOrder(sym, o.order_id || o.i, o.pair_index, o.trade_index)}>Cancel</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>{!dataReady ? 'Loading...' : hasActiveFilters ? 'No orders match filters' : 'No open orders'}</div>
        )}
        {bottomTab === 'history' && dex !== 'avantis' && (
          <TradeHistory walletAddr={walletAddr} filters={btmFilters} />
        )}
        {bottomTab === 'funding' && dex !== 'avantis' && (
          <FundingHistory walletAddr={walletAddr} filters={btmFilters} />
        )}
      </div>
    </div>
  );
});

function FuturesPanel() {
  const { setFuturesOpen } = useSend();
  const { connected, select, wallets, connect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { isInFrame: inFrame } = useFarcaster();
  const player = usePlayer();
  const { dex } = useDex();
  // Branch on DEX: usePacifica for Solana-signed trading, useAvantis for
  // the custodial Base flow. Both hooks expose the same interface shape.
  const pacificaHook = usePacifica();
  const avantisHook = useAvantis();
  const trading = dex === 'avantis' ? avantisHook : pacificaHook;
  const {
    walletAddr, account, positions, orders, prices, markets, walletUsdc, leverageSettings, marginModes, dataReady,
    loading, error, clearError, goldEarned, clearGoldEarned,
    placeMarketOrder, placeLimitOrder, cancelOrder, setLeverage: setLeverageApi,
    closePosition, depositToPacifica, withdraw, setTpsl, setMarginMode,
  } = trading;
  // For Pacifica: wallet needs adapter or Privy. For Avantis: walletAddr is
  // the custodial Base address, provisioned on first fetch by the hook.
  const hasWallet = dex === 'avantis'
    ? !!walletAddr
    : (!!walletAddr || connected || !!player?.wallet);

  const { isMobile } = useLayout();
  // Drag state — ref-based: zero React re-renders during drag, no listener leaks
  const posRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('[data-nodrag]')) return;
    // On mobile, panel is fixed/centered — dragging would just throw layout off.
    if (isMobile) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const startX = clientX - posRef.current.x;
    const startY = clientY - posRef.current.y;

    const onMove = (ev) => {
      const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      posRef.current = { x: moveX - startX, y: moveY - startY };
      if (panelRef.current) {
        panelRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
      }
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    };
    setIsDragging(true);
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, [isMobile]);

  const [activeTab, setActiveTab] = useState('Trade');
  const [symbol, setSymbol] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(() => leverageSettings[symbol] || 20);
  const [showLeverage, setShowLeverage] = useState(false);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [tradeIdeaOpen, setTradeIdeaOpen] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const elfaSignals = useElfaSignals();
  const [amountInUsdc, setAmountInUsdc] = useState(true);
  const [sizePct, setSizePct] = useState(0);
  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [fullscreen, setFullscreen] = useState(window.innerWidth < 600);
  const [bottomTab, setBottomTab] = useState('positions');
  const [expandedPos, setExpandedPos] = useState(null);
  const [closePct, setClosePct] = useState(100);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const defaultFilters = { symbol: 'All', side: 'All', sortBy: 'time', sortDir: 'desc' };
  const [btmFilters, setBtmFilters] = useState(defaultFilters);

  // Resizable panel sizes (percentages / pixels)
  const [bottomH, setBottomH] = useState(160);
  const [obWidth, setObWidth] = useState(160);
  const [chartPct, setChartPct] = useState(55);

  const bottomHRef = useRef(bottomH);
  bottomHRef.current = bottomH;
  const obWidthRef = useRef(obWidth);
  obWidthRef.current = obWidth;

  const dragBottom = useCallback((e) => {
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startH = bottomHRef.current;
    const onMove = (ev) => {
      const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      setBottomH(Math.max(60, Math.min(500, startH - (moveY - startY))));
    };
    const onUp = () => { 
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); 
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
      document.body.style.cursor = ''; document.body.style.userSelect = ''; 
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, []);

  const dragOb = useCallback((e) => {
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const startW = obWidthRef.current;
    const onMove = (ev) => {
      const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setObWidth(Math.max(80, Math.min(350, startW + (moveX - startX))));
    };
    const onUp = () => { 
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); 
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
      document.body.style.cursor = ''; document.body.style.userSelect = ''; 
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, []);

  const dragChart = useCallback((e) => {
    const onMove = (ev) => {
      const container = panelRef.current;
      if (!container) return;
      const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const rect = container.getBoundingClientRect();
      const pct = ((moveX - rect.left) / rect.width) * 100;
      setChartPct(Math.max(20, Math.min(70, pct)));
    };
    const onUp = () => { 
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); 
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
      document.body.style.cursor = ''; document.body.style.userSelect = ''; 
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive: false}); window.addEventListener('touchend', onUp);
  }, []);

  const handleClose = useCallback(() => setFuturesOpen(false), [setFuturesOpen]);

  // Cleanup leverage debounce timer on unmount
  useEffect(() => () => clearTimeout(levTimerRef.current), []);

  // Sync leverage from Pacifica settings when symbol changes or settings load
  useEffect(() => {
    if (leverageSettings[symbol]) setLeverage(leverageSettings[symbol]);
  }, [symbol, leverageSettings]);

  const currentPrice = useMemo(() => {
    return prices.find(p => p.symbol === symbol)?.mark || null;
  }, [prices, symbol]);

  const maxLev = useMemo(() => {
    return markets.find(m => m.symbol === symbol)?.max_leverage || 100;
  }, [markets, symbol]);

  const pacBalance = parseFloat(account?.balance || 0);
  const currentMarket = useMemo(() => markets.find(m => m.symbol === symbol), [markets, symbol]);
  const fr = currentMarket ? parseFloat(currentMarket.funding_rate || 0) : 0;

  // Convert USDC amount to token amount, rounded to lot size
  const lotSize = useMemo(() => {
    return markets.find(m => m.symbol === symbol)?.lot_size || '0.00001';
  }, [markets, symbol]);

  const tokenAmount = useMemo(() => {
    if (!amount || !currentPrice) return '';
    if (!amountInUsdc) return amount;
    const raw = parseFloat(amount) / parseFloat(currentPrice);
    const lot = parseFloat(lotSize);
    return String(Math.floor(raw / lot) * lot);
  }, [amount, currentPrice, amountInUsdc, lotSize]);

  const maxUsdc = pacBalance * leverage;

  const handleSizePct = useCallback((pct) => {
    setSizePct(pct);
    if (pacBalance > 0 && currentPrice) {
      const usdcVal = (maxUsdc * pct / 100).toFixed(2);
      setAmount(amountInUsdc ? usdcVal : String((parseFloat(usdcVal) / parseFloat(currentPrice)).toFixed(6)));
    }
  }, [pacBalance, currentPrice, maxUsdc, amountInUsdc]);

  const levTimerRef = useRef(null);
  const handleLeverageChange = useCallback((val) => {
    const v = Math.min(Number(val), maxLev);
    setLeverage(v);
    // Debounce — send to API only after 2s of no movement
    if (levTimerRef.current) clearTimeout(levTimerRef.current);
    levTimerRef.current = setTimeout(() => setLeverageApi(symbol, v), 2000);
  }, [maxLev, symbol, setLeverageApi]);

  const handleTrade = useCallback(async (side) => {
    const qty = amountInUsdc ? tokenAmount : amount;
    if (!qty || parseFloat(qty) <= 0) return;
    // Avantis on-chain min notional = $100. If the user's position size is
    // below that, the tx will revert (BELOW_MIN_POS). Catch it here with a
    // clear message so they can bump leverage or collateral.
    if (dex === 'avantis') {
      const collateralUsdc = amountInUsdc ? parseFloat(amount) : parseFloat(tokenAmount) * (currentPrice || 0);
      const notional = collateralUsdc * leverage;
      if (notional > 0 && notional < 100) {
        alert(`Avantis requires position size ≥ $100. Yours: $${notional.toFixed(2)} (${collateralUsdc.toFixed(2)} USDC × ${leverage}x). Increase leverage or collateral.`);
        return;
      }
    }
    // Pacifica-only: flush any pending leverage change before placing the
    // order so the server sees the right leverage on fill. Avantis takes
    // leverage per-trade as a direct argument, so no pre-flush needed.
    if (dex !== 'avantis' && levTimerRef.current) {
      clearTimeout(levTimerRef.current);
      levTimerRef.current = null;
      const serverLev = leverageSettings[symbol];
      if (leverage !== serverLev) {
        await setLeverageApi(symbol, leverage);
      }
    }
    if (orderType === 'market') {
      // 5th arg (leverage) is only read by useAvantis; usePacifica ignores it.
      await placeMarketOrder(symbol, side, qty, '0.5', leverage);
    } else {
      if (!limitPrice) return;
      await placeLimitOrder(symbol, side, limitPrice, qty, 'GTC', leverage);
    }
    setAmount('');
    setSizePct(0);
  }, [amount, tokenAmount, limitPrice, symbol, orderType, amountInUsdc, placeMarketOrder, placeLimitOrder, leverage, leverageSettings, setLeverageApi, dex]);

  // ==================== TRADE CONTROLS (reusable) ====================
  // Symbol info bar — token + market data (above chart)
  const curPriceData = useMemo(() => prices.find(p => p.symbol === symbol), [prices, symbol]);
  const change24h = useMemo(() => {
    if (!curPriceData) return 0;
    const yest = parseFloat(curPriceData.yesterday_price || 0);
    const mark = parseFloat(curPriceData.mark || 0);
    return yest > 0 ? ((mark - yest) / yest) * 100 : 0;
  }, [curPriceData]);
  const vol24h = curPriceData ? parseFloat(curPriceData.volume_24h || 0) : 0;
  const oi = curPriceData ? parseFloat(curPriceData.open_interest || 0) : 0;
  const oracle = curPriceData ? parseFloat(curPriceData.oracle || 0) : 0;

  const renderSymbolBar = () => (
    <>
      <div style={{...S.symbolBar, ...(fullscreen ? {background: '#e8dfc8', borderBottom: '3px solid #d4c8b0'} : {})}}>
        <button style={{...S.symbolBtn, padding: '6px 10px', gap: 6, whiteSpace: 'nowrap', flexShrink: 0}} onClick={() => setShowSymbolPicker(!showSymbolPicker)} data-nodrag>
          <TokenIcon sym={symbol} size={20} />
          <span style={{fontSize: 15, fontWeight: 900}}>{symbol}</span>
          {(() => {
            const loaded = elfaSignals && Object.keys(elfaSignals).length > 0;
            if (!loaded) return null;
            const sig = elfaSignals[symbol];
            const badge = sig ? sig.badge : '💀';
            const label = sig ? sig.label : 'quiet';
            if (badge === '·') return null;
            return (
              <span title={label} style={{display: 'inline-flex', alignItems: 'center'}}>
                <SignalIcon type={badge} size={14} />
              </span>
            );
          })()}
          {!isMobile && !fullscreen && currentPrice && <span style={{fontSize: 13, color: '#5C3A21', fontWeight: 700}}>${fmtPrice(parseFloat(currentPrice))}</span>}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {fullscreen && !isMobile && (
          <>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Mark</span><span style={S.infoCellValue}>{currentPrice ? fmtPrice(parseFloat(currentPrice)) : '—'}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Oracle</span><span style={S.infoCellValue}>{oracle > 0 ? fmtPrice(oracle) : '—'}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>24h</span><span style={{...S.infoCellValue, color: change24h >= 0 ? '#4CAF50' : '#E53935'}}>{change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Volume</span><span style={S.infoCellValue}>${vol24h >= 1e6 ? (vol24h/1e6).toFixed(1)+'M' : vol24h >= 1e3 ? (vol24h/1e3).toFixed(0)+'K' : vol24h.toFixed(0)}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>OI</span><span style={S.infoCellValue}>${oi >= 1e6 ? (oi/1e6).toFixed(1)+'M' : oi >= 1e3 ? (oi/1e3).toFixed(0)+'K' : oi.toFixed(0)}</span></div>
            <div style={S.infoCell}><span style={S.infoCellLabel}>Funding</span><span style={{...S.infoCellValue, color: fr >= 0 ? '#4CAF50' : '#E53935'}}>{fr >= 0 ? '+' : ''}{(fr * 100).toFixed(4)}%</span></div>
          </>
        )}
        <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: (isMobile || !fullscreen) ? 4 : 8, flexShrink: 0}}>
          {dex === 'avantis' ? (
            // Avantis has no cross margin — every position is isolated per-trade.
            // Render a read-only badge rather than a clickable toggle.
            <div
              style={{...S.marginSwapBtn, padding: '6px 10px', fontSize: 12, gap: 4, cursor: 'default', opacity: 0.85}}
              title="Avantis uses isolated margin per trade (no cross mode)"
            >
              <span style={{color: '#FF9800', fontWeight: 900}}>Isolated</span>
            </div>
          ) : (
            <button style={{...S.marginSwapBtn, padding: '6px 10px', fontSize: 12, gap: 4}} onClick={() => setMarginMode(symbol, !marginModes[symbol])} title={marginModes[symbol] ? 'Isolated margin' : 'Cross margin'}>
              <span style={{color: marginModes[symbol] ? '#FF9800' : '#4CAF50', fontWeight: 900}}>
                {marginModes[symbol] ? 'Isolated' : 'Cross'}
              </span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink: 0}}>
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>
          )}
          <div style={{...S.balBadge, padding: '4px 8px'}}>
            <span style={{fontSize: 8, fontWeight: 700, color: '#a3906a', lineHeight: 1}}>BALANCE</span>
            <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21', lineHeight: 1.1}}>${pacBalance.toFixed(2)}</span>
          </div>
        </div>
      </div>
      {showSymbolPicker && (
        <div style={{position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60}} onClick={() => setShowSymbolPicker(false)}>
          <div style={{width: fullscreen ? 480 : '90%', maxWidth: 600, maxHeight: '80vh', background: '#fdf8e7', border: '5px solid #d4c8b0', borderRadius: 16, padding: 12, boxShadow: '0 15px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column'}} onClick={e => e.stopPropagation()}>
            <SymbolPicker markets={markets} prices={prices} symbol={symbol} onSelect={(s) => { setSymbol(s); setShowSymbolPicker(false); }} fullscreen={fullscreen} signals={elfaSignals} />
          </div>
        </div>
      )}
    </>
  );

  const renderTradeControls = () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8, ...(fullscreen ? {width: '100%', overflowY: 'auto', overflowX: 'hidden', padding: 10, scrollbarWidth: 'none'} : {})}}>

      {/* Deposit/Withdraw row */}
      {pacBalance === 0 && (
        <div style={S.noBalanceHint} onClick={() => setActiveTab('Account')}>
          No balance — go to Account tab to deposit USDC
        </div>
      )}

      {/* Trade controls */}
      <div style={S.tradeBox}>
        <div style={S.row}>
          <button style={orderType === 'market' ? S.typeActive : S.typeBtn} onClick={() => setOrderType('market')}>Market</button>
          <button style={orderType === 'limit' ? S.typeActive : S.typeBtn} onClick={() => setOrderType('limit')}>Limit</button>
        </div>

        <div style={S.row}>
          <div style={{flex: 2, display: 'flex', flexDirection: 'column', gap: 3}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={S.label}>Amount</span>
              <button style={S.unitToggle} onClick={() => setAmountInUsdc(!amountInUsdc)}>
                {amountInUsdc ? 'USDC' : symbol}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{marginLeft: 3}}>
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              </button>
            </div>
            <input type="number" placeholder={amountInUsdc ? '100' : '0.01'} value={amount}
              onChange={e => { setAmount(e.target.value); setSizePct(0); }} style={S.input} />
          </div>
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 3}}>
            <span style={S.label}>Leverage</span>
            <button style={S.levBtn} onClick={() => setShowLeverage(!showLeverage)}>
              {leverage}x
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{transform: showLeverage ? 'rotate(180deg)' : '', transition: '0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        {/* Size slider — % of max buying power */}
        <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: 11, fontWeight: 700, color: '#a3906a'}}>
              {sizePct}% of ${maxUsdc.toFixed(0)} buying power
            </span>
            {amountInUsdc && amount && currentPrice && (
              <span style={{fontSize: 11, fontWeight: 700, color: '#5C3A21'}}>
                ≈ {parseFloat(tokenAmount).toFixed(6)} {symbol}
              </span>
            )}
          </div>
          <input type="range" min="0" max="100" step="5" value={sizePct} className="grad-slider"
            onChange={e => handleSizePct(Number(e.target.value))} style={{...S.slider, '--val': `${sizePct}%`}} />
          <div style={S.sliderLabels}>
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>

        {orderType === 'limit' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
            <span style={S.label}>Limit Price</span>
            <input type="number" placeholder={currentPrice || '0'} value={limitPrice} onChange={e => setLimitPrice(e.target.value)} style={S.input} />
          </div>
        )}

        {/* Leverage modal */}
        {showLeverage && (
          <>
            <div style={S.levBackdrop} onClick={() => setShowLeverage(false)} />
            <div style={S.levModal}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{fontSize: 16, fontWeight: 900, color: '#5C3A21'}}>Adjust Leverage</span>
                <button style={S.levCloseBtn} onClick={() => setShowLeverage(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{fontSize: 48, fontWeight: 900, color: '#5C3A21', textAlign: 'center', padding: '10px 0'}}>{leverage}x</div>
              <input type="range" min="1" max={maxLev} value={leverage} className="grad-slider" onChange={e => handleLeverageChange(e.target.value)} style={{...S.slider, '--val': `${maxLev > 1 ? ((leverage - 1) / (maxLev - 1)) * 100 : 0}%`}} />
              <div style={S.sliderLabels}><span>1x</span><span>{Math.floor(maxLev/4)}x</span><span>{Math.floor(maxLev/2)}x</span><span>{Math.floor(maxLev*3/4)}x</span><span>{maxLev}x</span></div>
              <div style={{display: 'flex', gap: 6, marginTop: 6}}>
                {[1, 5, 10, 20, 50].filter(v => v <= maxLev).map(v => (
                  <button key={v} style={leverage === v ? S.levPresetActive : S.levPreset}
                    onClick={() => handleLeverageChange(v)}>{v}x</button>
                ))}
              </div>
              {leverage > maxLev * 0.5 && (
                <div style={{fontSize: 11, color: '#E53935', fontWeight: 700, textAlign: 'center', marginTop: 4}}>
                  High leverage increases liquidation risk
                </div>
              )}
            </div>
          </>
        )}

        {error && <div style={S.errorBar} onClick={clearError}>{error}</div>}

        <div style={S.row}>
          <button style={{...cartoonBtn('#4CAF50','#2E7D32'), ...S.tradeBtn}} onClick={() => handleTrade('bid')} disabled={loading}>
            <span style={S.tradeBtnText}>{loading ? '...' : 'LONG'}</span>
          </button>
          <button style={{...cartoonBtn('#E53935','#B71C1C'), ...S.tradeBtn}} onClick={() => handleTrade('ask')} disabled={loading}>
            <span style={S.tradeBtnText}>{loading ? '...' : 'SHORT'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  // ==================== BOTTOM PANEL (fullscreen) ====================
  const btmSymbols = useMemo(() => {
    return markets.map(m => m.symbol).sort();
  }, [markets]);

  const sortOptionsForTab = useMemo(() => {
    if (bottomTab === 'positions') return [
      { value: 'symbol', label: 'Symbol' }, { value: 'size', label: 'Size' }, { value: 'pnl', label: 'PnL' },
    ];
    if (bottomTab === 'orders') return [
      { value: 'symbol', label: 'Symbol' }, { value: 'price', label: 'Price' },
    ];
    if (bottomTab === 'history') return [
      { value: 'time', label: 'Time' }, { value: 'symbol', label: 'Symbol' }, { value: 'size', label: 'Size' }, { value: 'price', label: 'Price' },
    ];
    if (bottomTab === 'funding') return [
      { value: 'time', label: 'Time' }, { value: 'symbol', label: 'Symbol' }, { value: 'amount', label: 'Amount' },
    ];
    return [{ value: 'time', label: 'Time' }];
  }, [bottomTab]);

  // Apply filters to positions
  const filteredPositions = useMemo(() => {
    let list = positions;
    if (btmFilters.symbol !== 'All') list = list.filter(p => p.symbol === btmFilters.symbol);
    if (btmFilters.side !== 'All') {
      const wantBid = btmFilters.side === 'Long';
      list = list.filter(p => wantBid ? p.side === 'bid' : p.side === 'ask');
    }
    const dir = btmFilters.sortDir === 'asc' ? 1 : -1;
    if (btmFilters.sortBy === 'symbol') list = [...list].sort((a, b) => dir * a.symbol.localeCompare(b.symbol));
    else if (btmFilters.sortBy === 'size') list = [...list].sort((a, b) => dir * (parseFloat(b.amount) * parseFloat(prices.find(pr => pr.symbol === b.symbol)?.mark || 0) - parseFloat(a.amount) * parseFloat(prices.find(pr => pr.symbol === a.symbol)?.mark || 0)));
    else if (btmFilters.sortBy === 'pnl') list = [...list].sort((a, b) => {
      const pnl = (p) => { const m = parseFloat(prices.find(pr => pr.symbol === p.symbol)?.mark || 0); return m ? (m - parseFloat(p.entry_price)) * parseFloat(p.amount) * (p.side === 'bid' ? 1 : -1) : 0; };
      return dir * (pnl(b) - pnl(a));
    });
    return list;
  }, [positions, btmFilters, prices]);

  // Apply filters to orders
  const filteredOrders = useMemo(() => {
    let list = orders;
    if (btmFilters.symbol !== 'All') list = list.filter(o => (o.symbol || o.s) === btmFilters.symbol);
    if (btmFilters.side !== 'All') {
      const wantBid = btmFilters.side === 'Long';
      list = list.filter(o => { const s = o.side || o.d; return wantBid ? s === 'bid' : s === 'ask'; });
    }
    const dir = btmFilters.sortDir === 'asc' ? 1 : -1;
    if (btmFilters.sortBy === 'symbol') list = [...list].sort((a, b) => dir * (a.symbol || a.s || '').localeCompare(b.symbol || b.s || ''));
    else if (btmFilters.sortBy === 'price') list = [...list].sort((a, b) => dir * (parseFloat(b.price || b.ip || 0) - parseFloat(a.price || a.ip || 0)));
    return list;
  }, [orders, btmFilters]);

  const hasActiveFilters = btmFilters.symbol !== 'All' || btmFilters.side !== 'All';

  // ==================== NOT CONNECTED (skip in Farcaster — wallet auto-connects) ====================
  if (!hasWallet && !inFrame) {
    return (
      <>
        <style>{animCSS}</style>
        <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
          ...(fullscreen ? S.containerFull : S.container),
          ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
          transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={S.header} onPointerDown={handlePointerDown}>
            <span style={S.headerTitle}>Futures Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 20}}>
            {dex === 'avantis' ? (
              <>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(180deg, #0EA5E9 0%, #0369A1 100%)',
                  border: '4px solid #0284C7',
                  boxShadow: '0 5px 0 #0284C7, 0 8px 16px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 44,
                  filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
                }}>⚡</div>
                <div style={{
                  color: '#5C3A21', fontSize: 18, fontWeight: 900,
                  textAlign: 'center', letterSpacing: '0.5px',
                }}>Provisioning your Base wallet…</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#0369A1', fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.5px',
                }}>
                  <span className="avantis-spin-dot" style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#0EA5E9',
                    animation: 'av-pulse 1.2s ease-in-out infinite',
                  }} />
                  <span>AVANTIS · BASE MAINNET</span>
                </div>
                <div style={{
                  color: '#8a7252', fontSize: 12, fontWeight: 600,
                  textAlign: 'center', maxWidth: 280, lineHeight: 1.4,
                }}>
                  Creating a custodial Base (EVM) wallet for Avantis perps trading.<br />
                  Takes a few seconds — we'll bring you right to the orderbook.
                </div>
                <style>{`@keyframes av-pulse { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }`}</style>
              </>
            ) : (
              <>
                <div style={{fontSize: 48, filter: 'grayscale(60%)'}}>🔗</div>
                <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900, textAlign: 'center'}}>Connect Wallet to Trade</div>
                <button
                  style={{...cartoonBtn('#9945FF', '#7B36CC'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
                  onClick={() => {
                    if (inFrame) {
                      const fc = wallets.find(w => w.adapter.name === 'Farcaster');
                      if (fc) { select(fc.adapter.name); setTimeout(() => connect().catch(() => {}), 100); }
                      else openWalletModal(true);
                    } else {
                      openWalletModal(true);
                    }
                  }}
                >
                  <span>CONNECT WALLET</span>
                </button>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  // ==================== TRADE TAB ====================
  const renderTrade = () => {
    // Funding rate badge (top-right of chart) — only for non-fullscreen
    const fundingBadge = currentMarket ? (
      <div style={S.fundingOverlay}>
        <span style={S.fundingOLabel}>FUNDING</span>
        <span style={{...S.fundingOValue, color: fr >= 0 ? '#4CAF50' : '#E53935'}}>
          {fr >= 0 ? '+' : ''}{(fr * 100).toFixed(4)}%
        </span>
      </div>
    ) : null;

    // Floating pill — bottom-right of chart, opposite TradingView logo.
    // Single button opens the Trade Idea modal (chart + narrative in one).
    const explainBadge = (
      <button
        data-nodrag
        onClick={() => setTradeIdeaOpen(true)}
        className="explain-chart-pill"
        title="Get a trade idea (entry / TP / SL)"
        aria-label="Trade Idea"
      >
        <img src={elfaBadge} alt="" className="explain-q" />
        <span className="explain-label">Trade idea</span>
      </button>
    );

    if (fullscreen) {
      if (isMobile) {
        return (
          <div style={{display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden'}}>
            {renderSymbolBar()}
            {/* Top: chart */}
            <div style={{flex: 1, position: 'relative', minHeight: 0}}>
              <TradingViewWidget symbol={symbol} positions={positions} orders={orders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
              {fundingBadge}
            </div>

            {/* Bottom: Trade controls */}
            <div style={{flexShrink: 0, paddingBottom: 10, background: '#e8dfc8', borderTop: '2px solid #d4c8b0'}}>
              {renderTradeControls()}
            </div>
          </div>
        );
      }

      return (
        <div style={{display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden'}}>
          {renderSymbolBar()}
          {/* Top: chart + orderbook + controls */}
          <div style={{display: 'flex', flex: 1, overflow: 'hidden'}}>
            <div style={{flex: `0 0 ${chartPct}%`, maxWidth: `${chartPct}%`, position: 'relative'}}>
              <TradingViewWidget symbol={symbol} positions={positions} orders={orders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
            </div>
            {dex !== 'avantis' && (
              <>
                {/* Drag handle: chart ↔ orderbook */}
                <div style={S.dragHandleV} onMouseDown={dragChart} />
                <div style={{flex: `0 0 ${obWidth}px`, overflow: 'hidden'}}>
                  <OrderBook symbol={symbol} />
                </div>
                {/* Drag handle: orderbook ↔ controls */}
                <div style={S.dragHandleV} onMouseDown={dragOb} />
              </>
            )}
            <div style={{flex: 1, minWidth: 0, overflow: 'hidden'}}>{renderTradeControls()}</div>
          </div>
          {/* Drag handle: top ↔ bottom */}
          <div style={S.dragHandleH} onMouseDown={dragBottom} />
          {/* Bottom: positions/orders panel */}
          <BottomPanel
            bottomH={bottomH}
            bottomTab={bottomTab}
            setBottomTab={setBottomTab}
            showFilter={showFilter}
            setShowFilter={setShowFilter}
            btmFilters={btmFilters}
            setBtmFilters={setBtmFilters}
            btmSymbols={btmSymbols}
            sortOptionsForTab={sortOptionsForTab}
            hasActiveFilters={hasActiveFilters}
            filteredPositions={filteredPositions}
            filteredOrders={filteredOrders}
            prices={prices}
            walletAddr={walletAddr}
            dataReady={dataReady}
            leverageSettings={leverageSettings}
            closePosition={closePosition}
            cancelOrder={cancelOrder}
            dex={dex}
          />
        </div>
      );
    }
    // Normal (mobile) layout: symbol bar, chart with funding overlay, controls
    return (
      <>
        {renderSymbolBar()}
        <div style={{...S.chartArea, position: 'relative'}}>
          <TradingViewWidget symbol={symbol} positions={positions} orders={orders} currentPrice={currentPrice} chartOverlay={explainBadge} dex={dex} />
          {fundingBadge}
        </div>
        {renderTradeControls()}
      </>
    );
  };

  // ==================== POSITIONS TAB ====================
  const renderPositions = () => {
    if (!positions.length) {
      return (
        <div style={S.empty}>
          <div style={{opacity: 0.3, color: '#5C3A21'}}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>{dataReady ? 'No Positions' : 'Loading...'}</div>
        </div>
      );
    }
    return (
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start'}}>
        {positions.map((pos, i) => {
          const mark = prices.find(p => p.symbol === pos.symbol)?.mark;
          const entryP = parseFloat(pos.entry_price);
          const markP = mark ? parseFloat(mark) : 0;
          const amt = parseFloat(pos.amount);
          const margin = parseFloat(pos.margin || 0);
          const pnlVal = markP ? (markP - entryP) * amt * (pos.side === 'bid' ? 1 : -1) : 0;
          const setLev = (margin > 0 && entryP > 0 && amt > 0) ? Math.round((amt * entryP) / margin) : (leverageSettings[pos.symbol] || 1);
          const posValueUsd = markP ? amt * markP : amt * entryP;
          const pnlPct = entryP && markP ? ((markP - entryP) / entryP * 100 * (pos.side === 'bid' ? 1 : -1) * (typeof setLev === 'number' ? setLev : 1)) : 0;
          const pnlColor = pnlVal >= 0 ? '#4CAF50' : '#E53935';
          const posKey = `${pos.symbol}-${pos.side}`;
          const expanded = expandedPos?.startsWith(posKey) ? expandedPos.split(':')[1] : null;

          return (
            <div key={i} style={S.posCard}>
              <div style={S.row}>
                <span style={{fontSize: 16, fontWeight: 900}}>{pos.symbol}</span>
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  {(() => {
                    const isIso = pos.is_isolated ?? marginModes?.[pos.symbol];
                    return (
                      <span style={{fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, border: '1px solid', borderColor: isIso ? '#FF9800' : '#4CAF50', color: isIso ? '#FF9800' : '#4CAF50', background: 'rgba(255,255,255,0.4)'}}>
                        {isIso ? 'ISO' : 'CROSS'}
                      </span>
                    );
                  })()}
                  <span style={{fontSize: 11, fontWeight: 800, color: '#a3906a', background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{setLev}x</span>
                  <span style={{fontSize: 13, fontWeight: 900, color: pos.side === 'bid' ? '#4CAF50' : '#E53935'}}>
                    {pos.side === 'bid' ? 'LONG' : 'SHORT'}
                  </span>
                </div>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Size: {pos.amount} <span style={{color: '#a3906a'}}>(${posValueUsd.toFixed(2)})</span></span>
                <span style={S.detail}>Entry: ${parseFloat(pos.entry_price).toLocaleString()}</span>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Mark: {markP ? `$${markP.toLocaleString()}` : '—'}</span>
                <span style={{fontSize: 14, fontWeight: 900, color: pnlColor}}>
                  {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                </span>
              </div>

              {/* Action buttons */}
              <div style={{display: 'flex', gap: 6, marginTop: 4}}>
                <button style={S.btnRed} onClick={() => { setClosePct(100); setExpandedPos(expanded === 'close' ? null : `${posKey}:close`); }}>Close</button>
                <button style={S.btnBlue} onClick={() => setExpandedPos(expanded === 'tpsl' ? null : `${posKey}:tpsl`)}>TP/SL</button>
              </div>

              {/* Close slider */}
              {expanded === 'close' && (
                <div style={S.expandPanel}>
                  <div style={S.row}>
                    <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>Close {closePct}%</span>
                    <span style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>
                      {(parseFloat(pos.amount) * closePct / 100).toFixed(6)} {pos.symbol}
                    </span>
                  </div>
                  <input type="range" min="5" max="100" step="5" value={closePct} className="grad-slider" onChange={e => setClosePct(Number(e.target.value))} style={{...S.slider, '--val': `${((closePct - 5) / 95) * 100}%`}} />
                  <div style={S.sliderLabels}><span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                  <button style={{...S.btnRed, width: '100%'}} onClick={() => closePosition(pos.symbol, pos.side, String(parseFloat(pos.amount) * closePct / 100), pos.pair_index, pos.trade_index)} disabled={loading}>
                    {loading ? 'Closing...' : `Close ${closePct}%`}
                  </button>
                </div>
              )}

              {/* TP/SL */}
              {expanded === 'tpsl' && (
                <div style={{...S.expandPanel, ...S.row}}>
                  <input type="number" placeholder="TP Price" value={tpPrice} onChange={e => setTpPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                  <input type="number" placeholder="SL Price" value={slPrice} onChange={e => setSlPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                  <button style={S.btnBlue} onClick={async () => {
                    await setTpsl(pos.symbol, pos.side === 'bid' ? 'ask' : 'bid', tpPrice || null, slPrice || null, pos.pair_index, pos.trade_index);
                    setTpPrice(''); setSlPrice(''); setExpandedPos(null);
                  }} disabled={!tpPrice && !slPrice}>Set</button>
                </div>
              )}
            </div>
          );
        })}

        {error && <div style={S.errorBar} onClick={clearError}>{error}</div>}
      </div>
    );
  };

  // ==================== ORDERS TAB ====================
  const renderOrders = () => {
    if (!orders.length) {
      return (
        <div style={S.empty}>
          <div style={{opacity: 0.3, color: '#5C3A21'}}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Orders</div>
        </div>
      );
    }
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {orders.map((o, i) => {
          const sym = o.symbol || o.s;
          const side = o.side || o.d;
          const rawPrice = parseFloat(o.price || o.ip || 0);
          const stopPrice = parseFloat(o.stop_price || o.sp || 0);
          const price = rawPrice > 0 ? rawPrice : stopPrice;
          const rawAmt = o.initial_amount || o.amount || o.a;
          const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full position';
          const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
          const isBid = side === 'bid';
          const isTP = type.includes('TAKE') || type.includes('TP');
          const isSL = type.includes('STOP LOSS') || type.includes('SL');
          const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
          return (
            <div key={i} style={S.posCard}>
              <div style={S.row}>
                <span style={{fontSize: 16, fontWeight: 900}}>{sym}</span>
                <span style={{fontSize: 10, fontWeight: 800, color: typeColor, background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{type}</span>
                <span style={{fontSize: 13, fontWeight: 900, color: isBid ? '#4CAF50' : '#E53935'}}>
                  {isBid ? 'BUY' : 'SELL'}
                </span>
                <button style={S.cancelBtn} onClick={() => cancelOrder(sym, o.order_id || o.i, o.pair_index, o.trade_index)}>✕</button>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Price: ${parseFloat(price).toLocaleString()}</span>
                <span style={S.detail}>Amount: {amt}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ==================== RENDER ====================
  // ==================== ACCOUNT TAB ====================
  const renderAccount = () => {
    const equity = parseFloat(account?.account_equity || 0);
    const available = parseFloat(account?.available_to_withdraw || 0);
    const marginUsed = parseFloat(account?.total_margin_used || 0);

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {/* Wallet address */}
        <div style={S.fullCard}>
          <div style={S.row}>
            <span style={S.label}>Connected Wallet</span>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <span style={{fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#5C3A21'}}>
                {walletCopied ? 'Copied' : `${walletAddr?.slice(0, 6)}...${walletAddr?.slice(-4)}`}
              </span>
              <button
                title="Copy full address"
                onClick={async () => {
                  if (!walletAddr) return;
                  try { await navigator.clipboard.writeText(walletAddr); } catch {}
                  setWalletCopied(true);
                  setTimeout(() => setWalletCopied(false), 1500);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, padding: 0, borderRadius: 6,
                  background: walletCopied ? 'rgba(67,160,71,0.18)' : 'rgba(0,0,0,0.08)',
                  border: `1px solid ${walletCopied ? 'rgba(46,125,50,0.5)' : 'rgba(92,58,33,0.3)'}`,
                  cursor: 'pointer', color: walletCopied ? '#2E7D32' : '#5C3A21',
                  transition: 'all 0.15s ease',
                }}
              >
                {walletCopied ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Wallet USDC */}
        <div style={S.fullCard}>
          <div style={S.row}>
            <span style={S.label}>Wallet USDC</span>
            <span style={{fontSize: 18, fontWeight: 900, color: '#5C3A21'}}>
              ${walletUsdc !== null ? walletUsdc.toFixed(2) : '—'}
            </span>
          </div>
        </div>

        {/* Pacifica balances */}
        <div style={{display: 'flex', gap: 8}}>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Trading Balance</span>
            <span style={S.balCardValue}>${pacBalance.toFixed(2)}</span>
          </div>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Equity</span>
            <span style={S.balCardValue}>${equity.toFixed(2)}</span>
          </div>
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Margin Used</span>
            <span style={S.balCardValue}>${marginUsed.toFixed(2)}</span>
          </div>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Withdrawable</span>
            <span style={S.balCardValue}>${available.toFixed(2)}</span>
          </div>
        </div>

        {/* Deposit — Pacifica: vault TX via wallet. Avantis: custodial address. */}
        {dex === 'avantis' ? (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#0EA5E9'}}>Deposit USDC</span>
              {walletUsdc !== null && <span style={S.detail}>Custodial: ${walletUsdc.toFixed(2)}</span>}
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(14,165,233,0.08)',
                border: '2px dashed rgba(14,165,233,0.35)',
                borderRadius: 10, padding: '8px 10px',
              }}>
                <code style={{
                  flex: 1, fontSize: 11, fontFamily: 'monospace',
                  color: '#0369A1', wordBreak: 'break-all', lineHeight: 1.3,
                }}>{walletAddr || 'loading…'}</code>
                <button
                  style={{
                    ...S.btnSmall, padding: '6px 10px', fontSize: 10,
                    background: '#0EA5E9', color: '#fff',
                    border: '2px solid #0284C7', whiteSpace: 'nowrap',
                  }}
                  onClick={async () => { if (walletAddr) try { await navigator.clipboard.writeText(walletAddr); } catch {} }}
                  disabled={!walletAddr}
                >COPY</button>
              </div>
              <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700, lineHeight: 1.35}}>
                Send <b>USDC</b> + a little <b>ETH</b> (~0.003) to this address on the <b>Base</b> network. Balance updates automatically.
              </span>
            </div>
          </div>
        ) : (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#4CAF50'}}>Deposit USDC</span>
              {walletUsdc !== null && <span style={S.detail}>Wallet: ${walletUsdc.toFixed(2)}</span>}
            </div>
            <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
              <input type="number" placeholder="Min 10 USDC" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
              <button style={{...S.depositBtn, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={async () => {
                if (!depositAmt || parseFloat(depositAmt) < 10) return;
                const r = await depositToPacifica(depositAmt);
                if (!r?.error) setDepositAmt('');
              }} disabled={loading}>
                {loading ? '...' : 'Deposit'}
              </button>
            </div>
            <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700}}>
              Sends USDC from your wallet to Pacifica. Needs ~0.005 SOL for gas.
            </span>
          </div>
        )}

        {/* Withdraw — Pacifica: withdraw from vault to user's Solana wallet.
            Avantis: ERC20 transfer from custodial Base wallet to a user-
            supplied address. Available funds differ per flow. */}
        {dex === 'avantis' ? (
          (walletUsdc || 0) > 0 && (
            <div style={S.fullCard}>
              <div style={S.row}>
                <span style={{...S.label, color: '#0369A1'}}>Withdraw USDC</span>
                <span style={S.detail}>Custodial: ${(walletUsdc || 0).toFixed(2)}</span>
              </div>
              <input
                type="text"
                placeholder="Destination Base address (0x…)"
                value={withdrawTo}
                onChange={e => setWithdrawTo(e.target.value.trim())}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                style={{...S.input, width: '100%', padding: '8px 10px', fontSize: 12, fontFamily: 'monospace'}}
              />
              <div style={{display: 'flex', gap: 6, alignItems: 'stretch', marginTop: 6}}>
                <input type="number" placeholder="Amount USDC" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                  style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
                <button
                  style={{...S.btnSmall, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px'}}
                  onClick={() => setWithdrawAmt(String(Math.floor((walletUsdc || 0) * 100) / 100))}
                >MAX</button>
                <button
                  style={{
                    flex: 2, whiteSpace: 'nowrap', padding: '8px 4px',
                    background: '#0EA5E9', color: '#fff',
                    border: '2px solid #0284C7', borderRadius: 8,
                    fontWeight: 900, fontSize: 12, cursor: 'pointer',
                    boxShadow: '0 2px 0 #0284C7',
                  }}
                  onClick={async () => {
                    const r = await withdraw(withdrawAmt, withdrawTo);
                    if (!r?.error) { setWithdrawAmt(''); }
                  }}
                  disabled={loading || !withdrawAmt || !withdrawTo}
                >{loading ? '...' : 'Withdraw'}</button>
              </div>
              <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700}}>
                Sends USDC to the entered Base address. Close positions first to free locked collateral.
              </span>
            </div>
          )
        ) : (available > 0 && (
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#9945FF'}}>Withdraw USDC</span>
              <span style={S.detail}>Max: ${available.toFixed(2)}</span>
            </div>
            <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
              <input type="number" placeholder="Amount" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
              <button style={{...S.btnSmall, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={() => setWithdrawAmt(String(Math.floor(available * 100) / 100))}>MAX</button>
              <button style={{...S.btnPurple, flex: 2, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={async () => {
                const r = await withdraw(withdrawAmt);
                if (!r?.error) setWithdrawAmt('');
              }} disabled={loading || !withdrawAmt}>
                {loading ? '...' : 'Withdraw'}
              </button>
            </div>
          </div>
        ))}

        {/* Account stats */}
        <div style={S.fullCard}>
          <span style={S.label}>Account Info</span>
          {[
            ['Positions', account?.positions_count || 0],
            ['Open Orders', account?.orders_count || 0],
            ['Fee Tier', account?.fee_level ?? '—'],
            ['Maker Fee', account?.maker_fee ? (parseFloat(account.maker_fee) * 100).toFixed(3) + '%' : '—'],
            ['Taker Fee', account?.taker_fee ? (parseFloat(account.taker_fee) * 100).toFixed(3) + '%' : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{...S.row, padding: '4px 0', borderBottom: '1px solid #d4c8b0'}}>
              <span style={S.detail}>{k}</span>
              <span style={{fontSize: 13, fontWeight: 800, color: '#5C3A21'}}>{v}</span>
            </div>
          ))}
        </div>

        {error && <div style={S.errorBar} onClick={clearError}>{error}</div>}
      </div>
    );
  };

  const renderContent = () => {
    if (activeTab === 'Trade') return renderTrade();
    if (activeTab === 'Positions') return renderPositions();
    if (activeTab === 'Orders') return renderOrders();
    if (activeTab === 'Account') return renderAccount();
    if (activeTab === 'Quests') return <QuestsTab />;
  };

  return (
    <>
      <style>{animCSS}</style>
      <div ref={panelRef} className={fullscreen ? "futures-fullscreen" : ""} style={{
        ...(fullscreen ? S.containerFull : S.container),
        ...((!fullscreen && isMobile) ? { right: 8, left: 8, top: 8, bottom: 80, width: 'auto', borderRadius: 16, border: '4px solid #d4c8b0' } : {}),
        transform: (fullscreen || isMobile) ? undefined : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
        transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div style={S.header} onPointerDown={handlePointerDown}>
          <div className="futures-tabs-scroll" style={{display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none'}}>
            {TABS.map(t => {
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} className={`tab-btn ${active ? 'active' : ''}`} style={{...(active ? S.tabActive : S.tabInactive), flexShrink: 0}}>
                  {t.icon}
                  {active && <span style={{fontSize: 14, fontWeight: 800}}>{t.label}</span>}
                </button>
              );
            })}
          </div>
          <div style={{display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 8}}>
            <button data-nodrag onClick={() => setFullscreen(!fullscreen)} style={S.headerBtn} title={fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
              {fullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              )}
            </button>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="futures-panel-body" style={S.body}>
          <div key={activeTab} style={{animation: 'fadeIn 0.25s ease-out', display: 'flex', flexDirection: 'column', gap: 10, height: '100%'}}>
            {renderContent()}
          </div>
        </div>

        {/* Powered by DEX footer — switches logo + label per active DEX */}
        <div style={S.pacificaFooter}>
          {dex === 'avantis' ? (
            <>
              <span style={S.pacificaText}>Powered by</span>
              <img
                src={DEX_CONFIG.avantis.logo}
                alt="Avantis"
                style={{
                  height: 14, width: 'auto', objectFit: 'contain',
                  // Tint white SVG to Avantis blue on the light footer bg.
                  filter: 'brightness(0) saturate(100%) invert(49%) sepia(88%) saturate(1854%) hue-rotate(173deg) brightness(93%) contrast(97%)',
                }}
              />
            </>
          ) : (
            <>
              <img src={pacificaLogo} alt="Pacifica" style={S.pacificaLogo} />
              <span style={S.pacificaText}>Powered by</span>
              <span style={S.pacificaBrand}>Pacifica</span>
            </>
          )}
        </div>

        {tradeIdeaOpen && (
          <TradeIdeaModal
            symbol={symbol}
            currentPrice={currentPrice}
            onClose={() => setTradeIdeaOpen(false)}
            onApply={(idea) => {
              // Pre-fill the order form with the suggested idea.
              setOrderType('limit');
              setLimitPrice(String(idea.entry));
              setAmountInUsdc(true);
              // Size → small default, user adjusts leverage/amount before confirming.
              setAmount('');
              setSizePct(0);
            }}
          />
        )}

        {/* Gold earned notification */}
        {goldEarned && (
          <div style={S.goldPopup}>
            <div style={{...S.goldIcon, color: '#FFD700'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </div>
            <span style={S.goldText}>+{goldEarned.amount.toLocaleString()} Gold</span>
            <span style={S.goldReason}>{goldEarned.reason}</span>
            <button style={S.goldClose} onClick={() => clearGoldEarned()}>✕</button>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(FuturesPanel);

const animCSS = `
  .futures-tabs-scroll::-webkit-scrollbar { display: none; }

  /* Floating Explain pill — starts as a circle (just "?"), expands on hover to show "Explain" */
  .explain-chart-pill {
    position: absolute; bottom: 8px; right: 8px; z-index: 20;
    display: inline-flex; align-items: center;
    height: 28px; width: 28px; padding: 0;
    background: rgba(255, 255, 255, 0.92);
    color: #5C3A21;
    border: 2px solid #5C3A21;
    border-radius: 999px;
    cursor: pointer; overflow: hidden;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transition: width 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), padding 0.22s ease, background 0.15s ease;
    font-family: inherit;
  }
  .explain-chart-pill:hover,
  .explain-chart-pill:focus-visible {
    width: 112px;
    padding: 0 10px 0 4px;
    background: #fff;
    outline: none;
  }
  .explain-chart-pill .explain-q {
    width: 22px; height: 22px; flex-shrink: 0;
    margin-left: 1px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }
  .explain-chart-pill .explain-label {
    max-width: 0; opacity: 0;
    overflow: hidden; white-space: nowrap;
    font-size: 12px; font-weight: 800;
    margin-left: 0;
    transition: max-width 0.22s ease, opacity 0.15s ease 0.05s, margin-left 0.22s ease;
  }
  .explain-chart-pill:hover .explain-label,
  .explain-chart-pill:focus-visible .explain-label {
    max-width: 100px; opacity: 1; margin-left: 6px;
  }
  /* On touch devices — stay as a circle; a tap just opens the modal */
  @media (hover: none) {
    .explain-chart-pill:hover { width: 28px; padding: 0; }
    .explain-chart-pill:hover .explain-label { max-width: 0; opacity: 0; margin-left: 0; }
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 0 rgba(232, 184, 48, 0.6); }
    50% { box-shadow: 0 0 12px rgba(232, 184, 48, 0.9); }
  }
  /* Gradient Scrollbar */
  .grad-scrollbar::-webkit-scrollbar { width: 8px; }
  .grad-scrollbar::-webkit-scrollbar-track { background: #fdf8e7; border-radius: 4px; }
  .grad-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #d4c8b0 0%, #bba882 100%); border-radius: 4px; border: 1px solid #fdf8e7; }
  .grad-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #bba882 0%, #a3906a 100%); }

  /* Gradient Range Slider */
  .grad-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 8px;
    background: linear-gradient(90deg, #5C3A21 0%, #5C3A21 var(--val, 0%), #d4c8b0 var(--val, 0%), #d4c8b0 100%);
    border-radius: 4px;
    outline: none;
    cursor: pointer;
  }
  .grad-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fdf8e7;
    border: 4px solid #5C3A21;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    cursor: pointer;
  }
  .grad-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fdf8e7;
    border: 4px solid #5C3A21;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    cursor: pointer;
  }

  .futures-panel-body::-webkit-scrollbar { display: none; }
  .futures-panel-body { overflow-x: hidden !important; }
  .futures-panel-body input[type=number]::-webkit-inner-spin-button,
  .futures-panel-body input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .futures-panel-body input[type=number] { -moz-appearance: textfield; }
  @keyframes slideDown { from { opacity:0; transform:scaleY(0.95); } to { opacity:1; transform:scaleY(1); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }

  /* Tab Icon Animations */
  @keyframes drawLine {
    0% { stroke-dashoffset: 20; }
    100% { stroke-dashoffset: 0; }
  }
  .tab-icon-trade .trend-line { stroke-dasharray: 20; stroke-dashoffset: 0; }
  .tab-btn:hover .tab-icon-trade .trend-line, .tab-btn.active .tab-icon-trade .trend-line {
    animation: drawLine 0.6s ease-out forwards;
  }
  
  @keyframes briefcase-pop {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.1, 0.9) translateY(2px); }
  }
  @keyframes handle-pop {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .tab-icon-positions .handle { transform-origin: center; }
  .tab-icon-positions .briefcase-body { transform-origin: bottom center; }
  .tab-btn:hover .tab-icon-positions .handle, .tab-btn.active .tab-icon-positions .handle {
    animation: handle-pop 0.5s ease;
  }
  .tab-btn:hover .tab-icon-positions .briefcase-body, .tab-btn.active .tab-icon-positions .briefcase-body {
    animation: briefcase-pop 0.5s ease;
  }

  @keyframes order-slide {
    0% { transform: translateX(-6px); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
  }
  .tab-icon-orders .order-line { opacity: 1; }
  .tab-btn:hover .tab-icon-orders .order-line, .tab-btn.active .tab-icon-orders .order-line {
    animation: order-slide 0.4s both;
  }
  .tab-btn:hover .tab-icon-orders .order-line:nth-child(2), .tab-btn.active .tab-icon-orders .order-line:nth-child(2) { animation-delay: 0.1s; }
  .tab-btn:hover .tab-icon-orders .order-line:nth-child(3), .tab-btn.active .tab-icon-orders .order-line:nth-child(3) { animation-delay: 0.2s; }
  
  @keyframes head-bob {
    0%, 100% { transform: translateY(0) rotate(0); }
    25% { transform: translateY(-2px) rotate(-10deg); }
    75% { transform: translateY(-2px) rotate(10deg); }
  }
  @keyframes body-shrug {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.9); }
  }
  .tab-icon-account .avatar-head { transform-origin: center 7px; }
  .tab-icon-account .avatar-body { transform-origin: bottom center; }
  .tab-btn:hover .tab-icon-account .avatar-head, .tab-btn.active .tab-icon-account .avatar-head {
    animation: head-bob 0.6s ease-in-out;
  }
  .tab-btn:hover .tab-icon-account .avatar-body, .tab-btn.active .tab-icon-account .avatar-body {
    animation: body-shrug 0.6s ease-in-out;
  }
  
  @keyframes sword-swing {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-25deg); }
  }
  .tab-icon-quests .sword-group { transform-origin: 16px 16px; }
  .tab-btn:hover .tab-icon-quests .sword-group, .tab-btn.active .tab-icon-quests .sword-group {
    animation: sword-swing 0.5s ease-out;
  }

`;

const S = {
  containerFull: {
    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%',
    background: '#e8dfc8', border: '0px solid #d4c8b0', borderRadius: 0,
    display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden', zIndex: 100,
    boxShadow: '0 0 0 rgba(0,0,0,0)', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  container: {
    position: 'fixed', top: 20, right: 20, bottom: 150, width: 400, maxWidth: 'calc(100vw - 16px)',
    background: '#e8dfc8', border: '6px solid #d4c8b0', borderRadius: 24,
    display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden', zIndex: 100,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
    cursor: 'grab', userSelect: 'none',
  },
  headerTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21' },
  tabActive: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
    background: '#fdf8e7', border: '3px solid #bba882', borderRadius: 12,
    color: '#333', boxShadow: '0 3px 0 #bba882', transform: 'translateY(-1px)', cursor: 'default',
    minHeight: 36,
  },
  tabInactive: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
    background: '#bba882', border: '3px solid #a3906a', borderRadius: 12,
    color: '#333', boxShadow: '0 3px 0 #a3906a', cursor: 'pointer', padding: 0,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
  },
  body: {
    flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto', overflowX: 'hidden', background: '#fdf8e7', scrollbarWidth: 'none',
  },
  pacificaFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '6px 12px', borderTop: '3px solid #d4c8b0',
    background: 'linear-gradient(90deg, #e8dfc8 0%, #fdf8e7 50%, #e8dfc8 100%)',
    flexShrink: 0,
  },
  pacificaLogo: { width: 20, height: 20, objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' },
  pacificaText: { fontSize: 10, fontWeight: 700, color: '#a3906a', letterSpacing: '0.05em', textTransform: 'uppercase' },
  pacificaBrand: { fontSize: 11, fontWeight: 900, color: '#5C3A21', letterSpacing: '0.08em', textTransform: 'uppercase' },
  symbolBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '4px 15px',
    background: 'transparent', flexShrink: 0,
    overflowX: 'auto', scrollbarWidth: 'none', minHeight: 0,
  },
  infoCell: { display: 'flex', flexDirection: 'column', gap: 0, width: 90, flexShrink: 0 },
  infoCellLabel: { fontSize: 9, fontWeight: 700, color: '#a3906a', textTransform: 'uppercase', lineHeight: 1 },
  infoCellValue: { fontSize: 13, fontWeight: 900, color: '#5C3A21', fontFamily: 'monospace', whiteSpace: 'nowrap', lineHeight: 1.2 },
  fundingOverlay: {
    position: 'absolute', top: 5, right: 10, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 6,
    pointerEvents: 'none',
  },
  fundingOLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', letterSpacing: '0.04em' },
  fundingOValue: { fontSize: 11, fontWeight: 900, fontFamily: 'monospace' },
  // Common
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: '#5C3A21', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' },
  detail: { fontSize: 12, fontWeight: 700, color: '#77573d' },
  input: {
    background: '#fff', border: '3px solid #d4c8b0', borderRadius: 10,
    padding: '9px 10px', color: '#333', fontSize: 15, fontWeight: 700, outline: 'none',
  },
  errorBar: {
    background: '#E5393520', border: '2px solid #E53935', borderRadius: 8,
    padding: '7px 10px', color: '#B71C1C', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flex: 1, gap: 12, opacity: 0.5,
  },
  // Trade
  chartArea: {
    width: '100%', flex: 1, minHeight: 200, background: '#fff', borderRadius: 12,
    border: '4px solid #d4c8b0', overflow: 'hidden', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)',
    position: 'relative',
  },
  chartFullscreen: {
    width: '100%', flex: 3, minHeight: 400, background: '#fff', borderRadius: 12,
    border: '4px solid #d4c8b0', overflow: 'hidden', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)',
    position: 'relative',
  },
  headerBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#1E88E5', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
  },
  symbolBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 10, cursor: 'pointer', color: '#333',
  },
  balBadge: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    padding: '3px 10px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
  },
  chips: {
    display: 'flex', flexWrap: 'wrap', gap: 5, padding: 8,
    background: '#e8dfc8', borderRadius: 10, border: '2px solid #d4c8b0', animation: 'slideDown 0.2s',
  },
  chip: {
    padding: '5px 10px', background: '#fdf8e7', border: '2px solid #d4c8b0',
    borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#5C3A21',
  },
  chipActive: {
    padding: '5px 10px', background: '#4CAF50', border: '2px solid #2E7D32',
    borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#fff',
  },
  depositRow: {
    display: 'flex', gap: 6, background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 10, padding: 8,
  },
  depositBtn: {
    padding: '8px 14px', background: '#4CAF50', border: '2px solid #2E7D32', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer',
  },
  tradeBox: {
    display: 'flex', flexDirection: 'column', gap: 10, background: '#e8dfc8',
    padding: 12, borderRadius: 14, border: '3px solid #d4c8b0',
  },
  typeBtn: {
    flex: 1, padding: '7px', background: '#d4c8b0', border: '2px solid #bba882',
    borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12, color: '#5C3A21', textTransform: 'uppercase',
  },
  typeActive: {
    flex: 1, padding: '7px', background: '#fdf8e7', border: '2px solid #bba882',
    borderRadius: 8, fontWeight: 800, fontSize: 12, color: '#333', textTransform: 'uppercase',
    boxShadow: '0 2px 0 #bba882',
  },
  levBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300,
  },
  levModal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 320, background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 20,
    padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: '0 15px 40px rgba(0,0,0,0.4)', zIndex: 301,
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  levCloseBtn: {
    width: 28, height: 28, borderRadius: '50%', background: '#E53935', border: '2px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  marginSwapBtn: {
    padding: '8px 12px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
    fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    height: '100%', boxSizing: 'border-box', whiteSpace: 'nowrap', flexShrink: 0,
    lineHeight: 1,
  },
  levPreset: {
    flex: 1, padding: '8px 0', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
    fontWeight: 800, fontSize: 13, color: '#5C3A21', cursor: 'pointer', textAlign: 'center',
  },
  levPresetActive: {
    flex: 1, padding: '8px 0', background: '#4CAF50', border: '2px solid #2E7D32', borderRadius: 8,
    fontWeight: 800, fontSize: 13, color: '#fff', cursor: 'pointer', textAlign: 'center',
    boxShadow: '0 2px 0 #2E7D32',
  },
  unitToggle: {
    padding: '2px 8px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 6,
    fontSize: 10, fontWeight: 800, color: '#5C3A21', cursor: 'pointer', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center',
  },
  levBtn: {
    width: '100%', background: '#fff', border: '3px solid #d4c8b0', borderRadius: 10,
    padding: '9px 10px', color: '#333', fontSize: 15, fontWeight: 800, cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  sliderBox: {
    background: '#fdf8e7', border: '2px solid #d4c8b0', borderRadius: 10, padding: 10,
    display: 'flex', flexDirection: 'column', gap: 6, animation: 'slideDown 0.2s',
  },
  slider: { width: '100%', cursor: 'pointer', accentColor: '#E53935' },
  sliderLabels: { display: 'flex', justifyContent: 'space-between', color: '#a3906a', fontSize: 11, fontWeight: 700 },
  tradeBtn: { flex: 1, padding: '11px 6px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tradeBtnText: { color: '#fff', fontSize: 20, fontWeight: 900, textShadow: '0 2px 0 rgba(0,0,0,0.4)' },
  // Positions
  posCard: {
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5,
    flex: '0 1 380px',
  },
  fullCard: {
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5,
    width: '100%',
  },
  expandPanel: {
    display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
    animation: 'slideDown 0.2s ease-out',
  },
  btnRed: {
    flex: 1, padding: '8px', background: '#E53935', border: '2px solid #B71C1C', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #B71C1C', textAlign: 'center',
  },
  btnBlue: {
    padding: '8px 12px', background: '#1E88E5', border: '2px solid #1565C0', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #1565C0',
  },
  btnPurple: {
    padding: '8px 12px', background: '#9945FF', border: '2px solid #7B36CC', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #7B36CC',
  },
  btnSmall: {
    padding: '8px 10px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 8,
    fontWeight: 800, fontSize: 12, color: '#5C3A21', cursor: 'pointer',
  },
  noBalanceHint: {
    padding: '8px 12px', background: '#FFF3E0', border: '2px solid #FF9800', borderRadius: 8,
    color: '#E65100', fontSize: 12, fontWeight: 700, textAlign: 'center', cursor: 'pointer',
  },
  balCard: {
    flex: 1, background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  balCardLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase' },
  balCardValue: { fontSize: 18, fontWeight: 900, color: '#5C3A21' },
  cancelBtn: {
    width: 26, height: 26, borderRadius: '50%', background: '#E53935', border: '2px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, padding: 0,
  },
  goldPopup: {
    position: 'absolute', bottom: 12, left: 12, right: 12,
    background: 'linear-gradient(135deg, #FFD700 0%, #FFA000 100%)',
    border: '3px solid #E65100', borderRadius: 14,
    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
    boxShadow: '0 6px 20px rgba(255,160,0,0.4)',
    animation: 'fadeIn 0.3s ease-out',
  },
  goldIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  goldText: { fontSize: 18, fontWeight: 900, color: '#5C3A21', textShadow: '0 1px 0 rgba(255,255,255,0.5)' },
  goldReason: { fontSize: 11, fontWeight: 700, color: '#7B5B00', flex: 1, textAlign: 'right' },
  // Bottom panel (fullscreen)
  bottomPanel: {
    background: '#e8dfc8',
    display: 'flex', flexDirection: 'column', minHeight: 60,
    overflow: 'hidden', flexShrink: 0,
  },
  bottomTabs: {
    display: 'flex', gap: 0, background: '#d4c8b0', flexShrink: 0,
  },
  bottomTabBtn: {
    padding: '6px 20px', background: 'transparent', border: 'none',
    fontSize: 12, fontWeight: 700, color: '#77573d', cursor: 'pointer',
    borderBottom: '2px solid transparent',
  },
  bottomTabActive: {
    padding: '6px 20px', background: '#e8dfc8', border: 'none',
    fontSize: 12, fontWeight: 800, color: '#5C3A21', cursor: 'default',
    borderBottom: '2px solid #4CAF50',
  },
  dragHandleV: {
    width: 6, cursor: 'col-resize', background: '#d4c8b0', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
  dragHandleH: {
    height: 6, cursor: 'row-resize', background: '#bba882', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
  bottomContent: { flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', position: 'relative' },
  filterBtn: {
    marginLeft: 'auto', padding: '4px 8px', background: 'transparent', border: 'none',
    cursor: 'pointer', color: '#77573d', display: 'flex', alignItems: 'center', gap: 4, position: 'relative',
  },
  filterBtnActive: { color: '#4CAF50' },
  filterDot: {
    position: 'absolute', top: 2, right: 2, width: 6, height: 6,
    borderRadius: '50%', background: '#4CAF50',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th: { padding: '4px 12px', textAlign: 'left', color: '#a3906a', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', background: '#e8dfc8' },
  td: { padding: '4px 12px', color: '#5C3A21', fontSize: 12, borderBottom: '1px solid #d4c8b0' },
  tr: { background: '#fdf8e7' },
  tblCloseBtn: {
    padding: '2px 8px', background: '#E53935', border: 'none', borderRadius: 4,
    color: '#fff', fontWeight: 800, fontSize: 10, cursor: 'pointer',
  },
  goldClose: {
    width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.15)',
    border: 'none', color: '#5C3A21', fontWeight: 900, fontSize: 13,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
};
