import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';
import { usePlayer } from '../hooks/useGodot';
import GoldRewardToast from './GoldRewardToast';


const GAME_API = import.meta.env.VITE_GAME_API || '/api';

const QUOTE_TICKERS = new Set([
  'USD', 'USDC', 'USDT', 'USDE', 'DAI', 'AUSD',
  'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD',
]);

const SYMBOL_ALIASES = {
  XBT: 'BTC',
  WBTC: 'BTC',
  TBTC: 'BTC',
  WETH: 'ETH',
  WSOL: 'SOL',
  WBNB: 'BNB',
  WAVAX: 'AVAX',
  WMATIC: 'MATIC',
  POL: 'MATIC',
  WTIOIL: 'WTI',
  USOIL: 'WTI',
  BRENTOIL: 'BRENT',
  UKOIL: 'BRENT',
};

function cleanSymbolText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/^\$/, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^A-Z0-9./:_-]+/g, ' ')
    .trim();
}

function canonicalTicker(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  return SYMBOL_ALIASES[raw] || raw;
}

function tickerVariants(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return [];
  const out = new Set([canonicalTicker(raw)]);
  const scaled = raw.match(/^(?:1000|10000|1000000|1K|1M)([A-Z][A-Z0-9]{1,})$/);
  if (scaled) out.add(canonicalTicker(scaled[1]));
  return [...out].filter(Boolean);
}

function extractTickerCandidates(value) {
  const text = cleanSymbolText(value);
  if (!text) return [];
  const out = new Set();
  const push = (part) => {
    const clean = String(part || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return;
    for (const quote of QUOTE_TICKERS) {
      if (clean.length > quote.length + 1 && clean.endsWith(quote)) {
        tickerVariants(clean.slice(0, -quote.length)).forEach(v => out.add(v));
      }
    }
    tickerVariants(clean).forEach(v => out.add(v));
  };

  for (const chunk of text.split(/\s+/)) {
    if (!chunk) continue;
    push(chunk);
    const dotted = chunk.split('.');
    if (dotted.length > 1) push(dotted[dotted.length - 1]);
    const parts = chunk.split(/[/:_-]/).filter(Boolean);
    if (parts.length) {
      push(parts[0]);
      if (parts.length > 1 && QUOTE_TICKERS.has(parts[0])) push(parts.join(''));
    }
  }
  return [...out];
}

function marketTickerSet(markets) {
  const set = new Set();
  for (const m of markets || []) {
    if (!m) continue;
    const raw = m._raw || m._phoenix || {};
    const values = [
      m.symbol, m.base, m.pair, m.market_name, m.marketName, m.name,
      m.pyth_symbol, m.icon_symbol,
      raw.symbol, raw.base, raw.from, raw.pair, raw.name,
      raw.market_name, raw.marketName,
      raw.feed?.attributes?.symbol,
    ];
    values.flatMap(extractTickerCandidates).forEach(v => set.add(v));
  }
  return set;
}

function taskSymbol(task) {
  const s = task?.params?.symbol;
  if (!s || s === '*' || String(s).toLowerCase() === 'any') return '';
  return String(s).toUpperCase();
}

function taskTradableOnMarkets(task, markets) {
  const sym = taskSymbol(task);
  if (!sym) return true;
  if (!Array.isArray(markets) || markets.length === 0) return true;
  const available = marketTickerSet(markets);
  return extractTickerCandidates(sym).some(v => available.has(v));
}

function fmtVal(v, type) {
  if (v == null) return '0';
  if (type === 'volume' || type === 'daily_trade_gold' || type === 'combo_volume_attack') {
    return Math.floor(Number(v)).toLocaleString();
  }
  return String(Math.floor(Number(v)));
}

function describeTask(t) {
  const p = t.params || {};
  const sym = (p.symbol && p.symbol !== 'ANY' && p.symbol !== 'any') ? p.symbol.toUpperCase() : 'any token';
  const side = p.side && p.side !== 'any' ? p.side.toUpperCase() : '';
  switch (t.type) {
    case 'volume':
      return `Trade $${Number(p.target_volume || 0).toLocaleString()} volume on ${sym}${side ? ' (' + side + ')' : ''}`;
    case 'positions':
      return `Open ${p.target_positions || 0} positions on ${sym}${side ? ' (' + side + ')' : ''}`;
    case 'combo_volume_attack':
      return `Trade $${Number(p.target_volume || 0).toLocaleString()} on ${sym} + win ${p.target_wins || 0} attacks`;
    case 'daily_trade_gold':
      return `Earn ${Number(p.target_gold || 0).toLocaleString()} gold from trading in ${p.window_hours || 24}h`;
    default: return '';
  }
}

function QuestCard({ task, onStart, onClaim, loading }) {
  const pct = task.target_value > 0 ? Math.min(1, task.progress_value / task.target_value) : 0;
  const isDone = task.target_value > 0 && task.progress_value >= task.target_value;
  const isClaimed = !!task.claimed_at;
  const autoRestarted = isClaimed && task.repeatable && Number(task.cooldown_hours || 0) <= 0;
  const canReClaim = isClaimed && task.repeatable && !autoRestarted;
  const showClaimed = isClaimed && !task.repeatable;

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={S.cardTitle}>{task.title}</span>
        {showClaimed && <span style={S.badgeDone}>Claimed</span>}
        {task.repeatable && <span style={S.badgeRepeat}>{autoRestarted ? 'Active again' : 'Repeatable'}</span>}
      </div>
      {task.description && <div style={S.cardDesc}>{task.description}</div>}
      <div style={S.cardAuto}>{describeTask(task)}</div>

      {task.started && (
        <div style={S.progressWrap}>
          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${pct * 100}%` }} />
          </div>
          <div style={S.progressText}>
            {fmtVal(task.progress_value, task.type)} / {fmtVal(task.target_value, task.type)}
          </div>
        </div>
      )}

      <div style={S.rewardRow}>
        <div style={S.rewards}>
          {task.reward_gold > 0 && (
            <span style={S.rewardGold}>
              +{task.reward_gold.toLocaleString()}
              <img src={goldIcon} alt="Gold" style={S.rewardIcon} />
            </span>
          )}
          {task.reward_wood > 0 && (
            <span style={S.rewardWood}>
              +{task.reward_wood.toLocaleString()}
              <img src={woodIcon} alt="Wood" style={S.rewardIcon} />
            </span>
          )}
          {task.reward_ore > 0 && (
            <span style={S.rewardOre}>
              +{task.reward_ore.toLocaleString()}
              <img src={stoneIcon} alt="Ore" style={S.rewardIcon} />
            </span>
          )}
        </div>

        {!task.started ? (
          <button style={S.btnStart} onClick={() => onStart(task.id)} disabled={loading}>Start</button>
        ) : isDone && (!isClaimed || autoRestarted) ? (
          <button style={S.btnClaim} onClick={() => onClaim(task.id)} disabled={loading}>Claim</button>
        ) : canReClaim && isClaimed ? (
          <button style={S.btnStart} onClick={() => onStart(task.id)} disabled={loading}>Restart</button>
        ) : isClaimed && !autoRestarted ? (
          <span style={S.doneLabel}>✓</span>
        ) : (
          <button style={S.btnRefresh} onClick={() => onClaim(task.id)} disabled={loading}>Refresh</button>
        )}
      </div>
    </div>
  );
}

function QuestsTab({ markets = [] }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  // Subscribe to the reactive player state so this component re-runs when
  // the token arrives. Previously we read `window._playerToken` at mount,
  // which is a stale snapshot — in Farcaster mini-apps the SDK → auto-login
  // → state-push chain can finish AFTER QuestsTab mounts, so the initial
  // read was null, the early-return fired, and setLoaded(true) never ran →
  // users saw an infinite "Loading quests…" spinner.
  const player = usePlayer();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);

  const fetchTasks = useCallback(async (tok) => {
    if (!tok) { setLoaded(true); return; }
    try {
      const r = await fetch(`${GAME_API}/tasks`, { headers: { 'x-token': tok } });
      if (!r.ok) throw new Error('status ' + r.status);
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      // Surface non-2xx so the user sees why the list is empty instead of
      // staring at a silent "No quests available" — Farcaster users hit this
      // when their token hasn't finished propagating and the 401 was swallowed.
      setError('Could not load quests — ' + (e?.message || 'network error'));
    }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    fetchTasks(token);
    // Poll while mounted; also refetches whenever token changes (e.g. after
    // auto-login completes or the user switches accounts).
    const iv = setInterval(() => fetchTasks(token), 20000);
    return () => clearInterval(iv);
  }, [fetchTasks, token]);

  const handleStart = useCallback(async (id) => {
    if (!token) { setError('Not signed in yet — try again in a moment.'); return; }
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${GAME_API}/tasks/${id}/start`, {
        method: 'POST',
        headers: { 'x-token': token, 'Content-Type': 'application/json' },
      });
      const j = await r.json();
      if (!r.ok) setError(j.error || 'Failed');
      await fetchTasks(token);
    } finally { setLoading(false); }
  }, [fetchTasks, token]);

  const handleClaim = useCallback(async (id) => {
    if (!token) { setError('Not signed in yet — try again in a moment.'); return; }
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${GAME_API}/tasks/${id}/claim`, {
        method: 'POST',
        headers: { 'x-token': token, 'Content-Type': 'application/json' },
      });
      const j = await r.json();
      if (j.ok && j.completed) {
        const reward = {
          gold: Number(j.reward?.gold || 0),
          wood: Number(j.reward?.wood || 0),
          ore: Number(j.reward?.ore || 0),
        };
        if (reward.gold || reward.wood || reward.ore) {
          window.onGodotMessage?.({ action: 'resources_add', data: reward });
          fetch(`${GAME_API}/resources`, { headers: { 'x-token': token } })
            .then(rr => rr.ok ? rr.json() : null)
            .then(resources => {
              if (!resources) return;
              window.onGodotMessage?.({
                action: 'resources',
                data: {
                  gold: Number(resources.gold || 0),
                  wood: Number(resources.wood || 0),
                  ore: Number(resources.ore || 0),
                },
              });
            })
            .catch(() => {});
        }
        if (reward.gold > 0) {
          setFlash({
            amount: reward.gold,
            reason: j.reward?.reason || 'Quest reward',
          });
          setTimeout(() => setFlash(null), 2500);
        }
      } else if (j.ok === false) {
        setError('Not completed yet');
      } else if (!r.ok) {
        setError(j.error || 'Failed');
      }
      await fetchTasks(token);
    } finally { setLoading(false); }
  }, [fetchTasks, token]);

  const visibleTasks = useMemo(
    () => tasks.filter(t => taskTradableOnMarkets(t, markets)),
    [tasks, markets],
  );

  if (!loaded) {
    return (
      <div style={{...S.empty, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12}}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: 'rgba(92,58,33,0.15)',
          borderTopColor: '#e8b830',
          animation: 'qt-spin 0.9s linear infinite',
        }} />
        <div style={S.emptyTitle}>Loading quests…</div>
        <style>{`@keyframes qt-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!visibleTasks.length) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⚔️</div>
        <div style={S.emptyTitle}>{tasks.length ? 'No quests for this DEX' : 'No quests available'}</div>
        <div style={S.emptyDesc}>{tasks.length ? 'Switch DEX or check back later.' : 'Check back later for new quests from the admin.'}</div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      {flash && (
        <GoldRewardToast
          amount={flash.amount}
          reason={flash.reason || 'Quest reward'}
          onClose={() => setFlash(null)}
          style={S.flash}
        />
      )}
      {error && <div style={S.error} onClick={() => setError(null)}>{error}</div>}
      {visibleTasks.map(t => (
        <QuestCard key={t.id} task={t} onStart={handleStart} onClaim={handleClaim} loading={loading} />
      ))}
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    background: 'linear-gradient(180deg, #fdf8e7 0%, #f3ebd1 100%)',
    border: '2px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
    boxShadow: '0 2px 4px rgba(92, 58, 33, 0.08)',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: 900, color: '#5C3A21' },
  cardDesc: { fontSize: 12, color: '#8a7252', fontWeight: 600 },
  cardAuto: { fontSize: 11, color: '#a3906a', fontStyle: 'italic', fontWeight: 600 },
  progressWrap: { display: 'flex', flexDirection: 'column', gap: 4 },
  progressBar: { height: 8, background: '#e4d9b8', borderRadius: 4, overflow: 'hidden', border: '1px solid #c4b894' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #e8b830 0%, #d49820 100%)', transition: 'width 0.3s' },
  progressText: { fontSize: 11, fontWeight: 700, color: '#5C3A21', textAlign: 'right' },
  rewardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 },
  rewards: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  rewardGold: { fontSize: 12, fontWeight: 900, color: '#b8860b', background: '#fff5cc', padding: '3px 8px', borderRadius: 6, border: '1px solid #e8b830', display: 'flex', alignItems: 'center', gap: 4 },
  rewardWood: { fontSize: 12, fontWeight: 900, color: '#4d7a2e', background: '#e8f5d8', padding: '3px 8px', borderRadius: 6, border: '1px solid #6ab344', display: 'flex', alignItems: 'center', gap: 4 },
  rewardOre: { fontSize: 12, fontWeight: 900, color: '#566878', background: '#dde5ea', padding: '3px 8px', borderRadius: 6, border: '1px solid #8a9aaa', display: 'flex', alignItems: 'center', gap: 4 },
  rewardIcon: { width: 16, height: 16, objectFit: 'contain' },

  btnStart: {
    padding: '6px 14px', background: 'linear-gradient(180deg, #6ab344 0%, #4d7a2e 100%)',
    color: '#fff', fontWeight: 900, fontSize: 12, border: '2px solid #3a5e22', borderRadius: 8,
    cursor: 'pointer', textShadow: '1px 1px 0 rgba(0,0,0,0.3)',
  },
  btnClaim: {
    padding: '6px 14px', background: 'linear-gradient(180deg, #e8b830 0%, #b8860b 100%)',
    color: '#fff', fontWeight: 900, fontSize: 12, border: '2px solid #8a5f00', borderRadius: 8,
    cursor: 'pointer', textShadow: '1px 1px 0 rgba(0,0,0,0.3)', animation: 'pulse-glow 1.5s infinite',
  },
  btnRefresh: {
    padding: '6px 14px', background: '#d4c8b0', color: '#5C3A21',
    fontWeight: 800, fontSize: 12, border: '2px solid #a3906a', borderRadius: 8, cursor: 'pointer',
  },
  doneLabel: { fontSize: 18, fontWeight: 900, color: '#6ab344' },
  badgeDone: { fontSize: 10, fontWeight: 800, color: '#4d7a2e', background: '#e8f5d8', padding: '2px 6px', borderRadius: 4, border: '1px solid #6ab344' },
  badgeRepeat: { fontSize: 10, fontWeight: 800, color: '#5C3A21', background: '#fff5cc', padding: '2px 6px', borderRadius: 4, border: '1px solid #e8b830' },
  empty: { textAlign: 'center', padding: 40, color: '#8a7252' },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21', marginBottom: 6 },
  emptyDesc: { fontSize: 12, fontWeight: 600 },
  flash: { marginBottom: 0 },
  error: { background: '#fee', border: '2px solid #c33', color: '#c33', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
};

export default memo(QuestsTab);
