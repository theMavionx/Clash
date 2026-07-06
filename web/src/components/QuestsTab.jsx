import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import goldIcon from '../assets/resources/gold_bar.png';
import woodIcon from '../assets/resources/wood_bar.png';
import stoneIcon from '../assets/resources/stone_bar.png';
import { usePlayer } from '../hooks/useGodot';
import GoldRewardToast from './GoldRewardToast';
import { GOLD_REWARD_PANEL_TOAST_STYLE } from './goldRewardToastStyles';
import { useDex } from '../contexts/DexContext';
import { readEncryptedCredential, writeEncryptedCredential } from '../lib/encryptedCredentialStorage';
import { pacificaFetch } from '../lib/pacificaClient';
import { listStoredPacificaMasters, readPacificaAgent } from '../lib/pacificaAgentStorage';


const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const FUTURES_API = import.meta.env.VITE_FUTURES_API || '/api/futures';
const LIGHTER_STORAGE_KEY = 'clash_lighter_credentials_v1';
const HIBACHI_STORAGE_KEY = 'clash_hibachi_credentials_v1';
const LIGHTER_AUTH_TOKEN_DEADLINE_SECONDS = 600;
const LIGHTER_AUTH_TOKEN_REFRESH_SKEW_MS = 90_000;
const PACIFICA_BUILDER_CODE = 'clashofperps';
const PACIFICA_QUEST_HISTORY_MAX_PAGES = 8;
const PACIFICA_QUEST_HISTORY_PAGE_LIMIT = 200;

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
  const p = task?.params || {};
  const candidates = [
    p.symbol,
    p.ticker,
    p.market,
    p.asset,
    p.base,
    p.token,
    p.pair,
    Array.isArray(p.symbols) ? p.symbols[0] : '',
  ];
  for (const value of candidates) {
    const raw = String(value || '').trim();
    if (!raw || raw === '*' || raw.toLowerCase() === 'any') continue;
    const canonical = extractTickerCandidates(raw)
      .filter(Boolean)
      .sort((a, b) => a.length - b.length)[0] || raw.toUpperCase().replace(/^\$/, '');
    if (canonical) return canonical;
  }
  return '';
}

function taskTradableOnMarkets(task, markets) {
  const sym = taskSymbol(task);
  if (!sym) return true;
  if (!Array.isArray(markets) || markets.length === 0) return true;
  const available = marketTickerSet(markets);
  return extractTickerCandidates(sym).some(v => available.has(v));
}

function isLikelySolanaAddress(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || '').trim());
}

function classifyTradeSide(side) {
  const s = String(side || '').toLowerCase();
  const isClose = s.includes('close');
  const isLong = s.includes('long') || s === 'buy' || s.includes('buy') || s === 'bid';
  const isShort = s.includes('short') || s === 'sell' || s.includes('sell') || s === 'ask';
  return { isClose, isLong, isShort, isOpen: !isClose };
}

function taskMatchesSide(tradeSide, wantSide) {
  const wanted = String(wantSide || 'any').toLowerCase();
  if (!wanted || wanted === 'any') return true;
  const side = classifyTradeSide(tradeSide);
  if (wanted === 'long') return side.isLong && !side.isShort;
  if (wanted === 'short') return side.isShort && !side.isLong;
  return true;
}

function taskMatchesSymbol(tradeSymbol, wantSymbol) {
  const wanted = String(wantSymbol || '').trim();
  if (!wanted || wanted === '*' || wanted.toLowerCase() === 'any') return true;
  const wantedVariants = new Set(extractTickerCandidates(wanted));
  return extractTickerCandidates(tradeSymbol).some(v => wantedVariants.has(v));
}

function tradeNotionalUsd(trade) {
  const direct = Number(trade?._notional || trade?.notional_usd || trade?.volume_usd || trade?.volume);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const price = Number(trade?.price || 0);
  const amount = Number(trade?.amount || trade?.size || 0);
  const value = price * amount;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function tradeEventKey(trade) {
  return String(trade?.order_id || trade?.client_order_id || trade?.history_id || trade?.id || '');
}

function isAfterTaskSnapshot(task, trade) {
  const startId = Number(task?.snapshot?.trade_id_start || 0);
  const tradeId = Number(trade?.history_id || trade?.id || 0);
  return tradeId > startId;
}

function computeBrowserTaskProgress(task, trades) {
  if (!task?.started || task?.claimed_at || !Array.isArray(trades)) return null;
  const params = task.params || {};
  const symbol = taskSymbol(task) || params.symbol || 'any';
  const side = params.side || 'any';
  if (task.type === 'volume') {
    let volume = 0;
    for (const trade of trades) {
      if (!isAfterTaskSnapshot(task, trade)) continue;
      if (!taskMatchesSymbol(trade.symbol, symbol)) continue;
      if (!taskMatchesSide(trade.side, side)) continue;
      volume += tradeNotionalUsd(trade);
    }
    return volume;
  }
  if (task.type === 'positions') {
    let count = 0;
    const seen = new Set();
    for (const trade of trades) {
      if (!isAfterTaskSnapshot(task, trade)) continue;
      const key = tradeEventKey(trade);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      if (classifyTradeSide(trade.side).isClose) continue;
      if (!taskMatchesSymbol(trade.symbol, symbol)) continue;
      if (!taskMatchesSide(trade.side, side)) continue;
      count += 1;
    }
    return count;
  }
  return null;
}

async function pacificaQuestAccounts(player) {
  const out = new Set();
  const add = (value) => {
    const text = String(value || '').trim();
    if (isLikelySolanaAddress(text)) out.add(text);
  };
  add(player?.wallet);

  const masters = new Set([player?.wallet, ...listStoredPacificaMasters()].filter(Boolean));
  for (const master of masters) {
    try {
      const agent = await readPacificaAgent(master);
      add(agent?.agentPubkey);
    } catch {}
  }
  return [...out].slice(0, 8);
}

async function fetchPacificaBrowserTradesForQuests(player, tasks) {
  const started = (tasks || []).filter(t => t?.started && !t?.claimed_at && t?.snapshot);
  if (!started.length) return [];
  let minStartId = Infinity;
  for (const task of started) {
    const startId = Number(task?.snapshot?.trade_id_start || 0);
    if (Number.isFinite(startId) && startId >= 0) minStartId = Math.min(minStartId, startId);
  }
  if (!Number.isFinite(minStartId)) return [];

  const accounts = await pacificaQuestAccounts(player);
  const seen = new Set();
  const merged = [];
  for (const account of accounts) {
    let cursor = '';
    let crossedStart = false;
    for (let page = 0; page < PACIFICA_QUEST_HISTORY_MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        account,
        limit: String(PACIFICA_QUEST_HISTORY_PAGE_LIMIT),
        builder_code: PACIFICA_BUILDER_CODE,
      });
      if (cursor) params.set('cursor', cursor);
      const data = await pacificaFetch(`/trades/history?${params.toString()}`, { includeProxy: false });
      const rows = data?.success && Array.isArray(data.data) ? data.data : [];
      for (const trade of rows) {
        const id = Number(trade?.history_id || 0);
        if (id <= minStartId) {
          crossedStart = true;
          continue;
        }
        const key = String(id || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(trade);
      }
      if (crossedStart || !data?.has_more || !data?.next_cursor) break;
      cursor = data.next_cursor;
    }
  }
  return merged.sort((a, b) => Number(a.history_id || 0) - Number(b.history_id || 0));
}

function overlayPacificaBrowserProgress(tasks, browserTrades) {
  if (!Array.isArray(browserTrades) || !browserTrades.length) return tasks;
  return (tasks || []).map(task => {
    const browserValue = computeBrowserTaskProgress(task, browserTrades);
    if (browserValue == null) return task;
    const currentValue = Number(task.progress_value || 0);
    const progressValue = Math.max(currentValue, browserValue);
    const targetValue = Number(task.target_value || 0);
    return {
      ...task,
      progress_value: progressValue,
      target_value: targetValue,
      progress: targetValue > 0 ? Math.min(1, progressValue / targetValue) : 0,
      progress_source: 'browser_pacifica',
    };
  });
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
  const taskSym = taskSymbol(t);
  const sym = taskSym || 'any token';
  const side = p.side && String(p.side).toLowerCase() !== 'any' ? String(p.side).toUpperCase() : '';
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

const QUEST_ELIGIBILITY_BADGES = {
  soldiers_only: 'Soldiers',
  demon_king: 'Demon King',
  dragon: 'Dragon',
  demon_or_dragon: 'NFT Elite',
  demon_and_dragon: 'Demon + Dragon',
};

function questEligibilityBadge(task) {
  const cfg = task?.eligibility || task?.params?.eligibility || {};
  const mode = String(cfg.mode || 'all');
  if (mode === 'all') return '';
  return String(cfg.label || '').trim() || QUEST_ELIGIBILITY_BADGES[mode] || 'Exclusive';
}

function questProgressRatio(task) {
  const target = Number(task?.target_value || 0);
  if (target <= 0) return 0;
  const value = Number(task?.progress_value || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value / target));
}

function questSortRank(task) {
  const ratio = questProgressRatio(task);
  const isDone = Number(task?.target_value || 0) > 0 && Number(task?.progress_value || 0) >= Number(task?.target_value || 0);
  const isClaimed = !!task?.claimed_at;
  const isOneTimeClaimed = isClaimed && !task?.repeatable;
  if (isOneTimeClaimed) return 4;
  if (isDone && !isClaimed) return 0;
  if (isDone && task?.repeatable) return 0;
  if (task?.started) return 1;
  if (ratio > 0) return 2;
  return 3;
}

function sortQuestsForClaiming(list) {
  return [...(list || [])].sort((a, b) => {
    const rankDiff = questSortRank(a) - questSortRank(b);
    if (rankDiff) return rankDiff;
    const progressDiff = questProgressRatio(b) - questProgressRatio(a);
    if (Math.abs(progressDiff) > 0.000001) return progressDiff;
    const rewardA = Number(a?.reward_gold || 0) + Number(a?.reward_wood || 0) + Number(a?.reward_ore || 0);
    const rewardB = Number(b?.reward_gold || 0) + Number(b?.reward_wood || 0) + Number(b?.reward_ore || 0);
    if (rewardA !== rewardB) return rewardB - rewardA;
    return Number(a?.sort_order ?? a?.id ?? 0) - Number(b?.sort_order ?? b?.id ?? 0);
  });
}

function lighterTokenIsFresh(creds) {
  return !!(
    creds?.readOnlyToken
    && Number(creds?.readOnlyTokenExpiresAt || creds?.read_only_token_expires_at || 0) > Date.now() + LIGHTER_AUTH_TOKEN_REFRESH_SKEW_MS
  );
}

async function ensureLighterTaskCredentials(creds, baseHeaders) {
  const accountIndex = Number(creds?.accountIndex ?? creds?.account_index);
  const apiKeyIndex = Number(creds?.apiKeyIndex ?? creds?.api_key_index);
  const apiPrivateKey = String(creds?.apiPrivateKey ?? creds?.api_private_key ?? '').trim();
  if (!Number.isInteger(accountIndex) || accountIndex < 0) return null;
  if (lighterTokenIsFresh(creds)) {
    return {
      accountIndex,
      authToken: String(creds.readOnlyToken || creds.read_only_token || creds.authToken || '').trim(),
    };
  }
  if (!Number.isInteger(apiKeyIndex) || apiKeyIndex < 0 || !apiPrivateKey) {
    const existingToken = String(creds?.readOnlyToken || creds?.read_only_token || creds?.authToken || '').trim();
    return existingToken ? { accountIndex, authToken: existingToken } : null;
  }
  const res = await fetch(`${FUTURES_API}/lighter/auth-token`, {
    method: 'POST',
    headers: { ...baseHeaders, 'content-type': 'application/json', 'x-dex': 'lighter' },
    body: JSON.stringify({
      accountIndex,
      apiKeyIndex,
      apiPrivateKey,
      deadline: LIGHTER_AUTH_TOKEN_DEADLINE_SECONDS,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.auth_token) {
    const existingToken = String(creds?.readOnlyToken || creds?.read_only_token || creds?.authToken || '').trim();
    return existingToken ? { accountIndex, authToken: existingToken } : null;
  }
  const saved = {
    ...creds,
    accountIndex,
    apiKeyIndex,
    apiPrivateKey,
    readOnlyToken: data.auth_token,
    readOnlyTokenExpiresAt: Date.now() + (LIGHTER_AUTH_TOKEN_DEADLINE_SECONDS * 1000),
  };
  await writeEncryptedCredential(LIGHTER_STORAGE_KEY, saved);
  return { accountIndex, authToken: data.auth_token };
}

function normalizeHibachiTaskCredentials(creds) {
  if (!creds?.apiKey || !creds?.accountId || !creds?.privateKey) return null;
  return {
    apiKey: String(creds.apiKey),
    accountId: String(creds.accountId),
    privateKey: String(creds.privateKey),
  };
}

function QuestCard({ task, onStart, onClaim, loading, busyAction }) {
  const pct = task.target_value > 0 ? Math.min(1, task.progress_value / task.target_value) : 0;
  const isDone = task.target_value > 0 && task.progress_value >= task.target_value;
  const isClaimed = !!task.claimed_at;
  const autoRestarted = isClaimed && task.repeatable && Number(task.cooldown_hours || 0) <= 0;
  const canReClaim = isClaimed && task.repeatable && !autoRestarted;
  const showClaimed = isClaimed && !task.repeatable;
  const exclusiveBadge = questEligibilityBadge(task);
  const isStarting = busyAction === 'start';
  const isClaiming = busyAction === 'claim';
  const isRefreshing = busyAction === 'refresh';
  const nftBoostPct = Number(task.reward_boost?.nft_pct || 0);
  const taskNftBoostEnabled = !!task.reward_boost && task.reward_boost.task_enabled !== false;
  const showNftUnlock = taskNftBoostEnabled && nftBoostPct <= 0;

  function openDragonShop() {
    try {
      window.dispatchEvent(new CustomEvent('clash-open-nft-shop', {
        detail: {
          view: 'shop',
          request: { troop: 'FireDragon', collection: 'dragon' },
        },
      }));
    } catch {}
  }

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={S.cardTitle}>{task.title}</span>
        <span style={S.badgeRow}>
          {exclusiveBadge && <span style={S.badgeExclusive}>{exclusiveBadge}</span>}
          {showClaimed && <span style={S.badgeDone}>Claimed</span>}
          {task.repeatable && <span style={S.badgeRepeat}>{autoRestarted ? 'Active again' : 'Repeatable'}</span>}
        </span>
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
          {nftBoostPct > 0 && (
            <span style={S.rewardBoost}>Your NFT boost: {Math.round(nftBoostPct * 100) / 100}%</span>
          )}
        </div>

        {!task.started ? (
          <button style={S.btnStart} onClick={() => onStart(task.id)} disabled={loading}>{isStarting ? 'Starting...' : 'Start'}</button>
        ) : isDone && (!isClaimed || autoRestarted) ? (
          <button style={S.btnClaim} onClick={() => onClaim(task.id)} disabled={loading}>{isClaiming ? 'Claiming...' : 'Claim'}</button>
        ) : canReClaim && isClaimed ? (
          <button style={S.btnStart} onClick={() => onStart(task.id)} disabled={loading}>{isStarting ? 'Starting...' : 'Restart'}</button>
        ) : isClaimed && !autoRestarted ? (
          <span style={S.doneLabel}>✓</span>
        ) : (
          <button style={S.btnRefresh} onClick={() => onClaim(task.id)} disabled={loading}>{isRefreshing ? 'Refreshing...' : 'Refresh'}</button>
        )}
      </div>
      {showNftUnlock && (
        <div style={S.nftUnlockRow}>
          <span style={S.nftUnlockText}>Unlock up to 100% rewards boost with NFTs</span>
          <button type="button" style={S.nftUnlockBtn} onClick={openDragonShop}>Dragon shop</button>
        </div>
      )}
    </div>
  );
}

function QuestsTab({ markets = [] }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyTask, setBusyTask] = useState(null);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  // Subscribe to the reactive player state so this component re-runs when
  // the token arrives. Previously we read `window._playerToken` at mount,
  // which is a stale snapshot — in Farcaster mini-apps the SDK → auto-login
  // → state-push chain can finish AFTER QuestsTab mounts, so the initial
  // read was null, the early-return fired, and setLoaded(true) never ran →
  // users saw an infinite "Loading quests…" spinner.
  const player = usePlayer();
  const { dex } = useDex();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : null);

  const taskHeaders = useCallback(async (tok) => {
    const base = { 'x-token': tok };
    const activeDex = String(dex || '').toLowerCase();
    if (activeDex) base['x-dex'] = activeDex;
    if (activeDex === 'hibachi') {
      try {
        const creds = normalizeHibachiTaskCredentials(await readEncryptedCredential(HIBACHI_STORAGE_KEY));
        if (creds) {
          base['x-hibachi-api-key'] = creds.apiKey;
          base['x-hibachi-account-id'] = creds.accountId;
          base['x-hibachi-private-key'] = creds.privateKey;
        }
      } catch {
        // Quests should remain usable even if encrypted browser storage is unavailable.
      }
      return base;
    }
    if (activeDex !== 'lighter') return base;
    try {
      const creds = await readEncryptedCredential(LIGHTER_STORAGE_KEY);
      const lighterCreds = await ensureLighterTaskCredentials(creds, base);
      if (lighterCreds?.authToken) {
        base['x-lighter-account-index'] = String(lighterCreds.accountIndex);
        base['x-lighter-auth-token'] = lighterCreds.authToken;
      }
    } catch {
      // Quests should remain usable even if encrypted browser storage is unavailable.
    }
    return base;
  }, [dex]);

  const fetchTasks = useCallback(async (tok) => {
    if (!tok) { setLoaded(true); return; }
    try {
      const headers = await taskHeaders(tok);
      const activeDex = String(dex || '').toLowerCase();
      if (activeDex === 'pacifica') headers['x-skip-live-progress'] = 'browser';
      const r = await fetch(`${GAME_API}/tasks`, { headers });
      if (!r.ok) throw new Error('status ' + r.status);
      const data = await r.json();
      let nextTasks = Array.isArray(data) ? data : [];
      if (activeDex === 'pacifica') {
        try {
          const browserTrades = await fetchPacificaBrowserTradesForQuests(player, nextTasks);
          nextTasks = overlayPacificaBrowserProgress(nextTasks, browserTrades);
        } catch (e) {
          console.warn('[Quests] Pacifica browser progress refresh failed:', e?.message || e);
        }
      }
      setTasks(nextTasks);
    } catch (e) {
      // Surface non-2xx so the user sees why the list is empty instead of
      // staring at a silent "No quests available" — Farcaster users hit this
      // when their token hasn't finished propagating and the 401 was swallowed.
      setError('Could not load quests — ' + (e?.message || 'network error'));
    }
    finally { setLoaded(true); }
  }, [dex, player, taskHeaders]);

  useEffect(() => {
    fetchTasks(token);
    // Poll while mounted; also refetches whenever token changes (e.g. after
    // auto-login completes or the user switches accounts).
    const iv = setInterval(() => fetchTasks(token), 20000);
    const onTradeReward = () => fetchTasks(token);
    window.addEventListener('clash:trading-reward-claimed', onTradeReward);
    return () => {
      clearInterval(iv);
      window.removeEventListener('clash:trading-reward-claimed', onTradeReward);
    };
  }, [fetchTasks, token]);

  const handleStart = useCallback(async (id) => {
    if (!token) { setError('Not signed in yet — try again in a moment.'); return; }
    if (loading) return;
    setBusyTask({ id: Number(id), action: 'start' });
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${GAME_API}/tasks/${id}/start`, {
        method: 'POST',
        headers: { ...(await taskHeaders(token)), 'Content-Type': 'application/json' },
      });
      const j = await r.json();
      if (!r.ok) setError(j.error || 'Failed');
      await fetchTasks(token);
    } finally {
      setLoading(false);
      setBusyTask(null);
    }
  }, [fetchTasks, loading, taskHeaders, token]);

  const handleClaim = useCallback(async (id) => {
    if (!token) { setError('Not signed in yet — try again in a moment.'); return; }
    if (loading) return;
    const activeDex = String(dex || '').toLowerCase();
    const currentTask = tasks.find(t => Number(t.id) === Number(id));
    const currentTarget = Number(currentTask?.target_value || 0);
    const currentProgress = Number(currentTask?.progress_value || 0);
    const locallyComplete = currentTarget > 0 && currentProgress >= currentTarget;
    if (activeDex === 'pacifica' && currentTask?.started && !locallyComplete) {
      setBusyTask({ id: Number(id), action: 'refresh' });
      setLoading(true);
      setError(null);
      try { await fetchTasks(token); }
      finally {
        setLoading(false);
        setBusyTask(null);
      }
      return;
    }
    setBusyTask({ id: Number(id), action: 'claim' });
    setLoading(true); setError(null);
    try {
      const refreshResources = async () => {
        try {
          const rr = await fetch(`${GAME_API}/resources`, { headers: { 'x-token': token } });
          if (!rr.ok) return;
          const resources = await rr.json();
          const nextResources = {
            gold: Number(resources.gold || 0),
            wood: Number(resources.wood || 0),
            ore: Number(resources.ore || 0),
          };
          window.onGodotMessage?.({
            action: 'resources',
            data: nextResources,
          });
          window.godotBridge?.(JSON.stringify({ action: 'set_resources', data: nextResources }));
        } catch {}
      };
      const r = await fetch(`${GAME_API}/tasks/${id}/claim`, {
        method: 'POST',
        headers: { ...(await taskHeaders(token)), 'Content-Type': 'application/json' },
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
        }
        await refreshResources();
        if (reward.gold > 0) {
          setFlash({
            amount: reward.gold,
            reason: j.reward?.reason || 'Quest reward',
          });
          setTimeout(() => setFlash(null), 2500);
        }
      } else if (!r.ok) {
        setError(j.error || 'Failed');
      } else if (j.ok === false) {
        setError(j.retryable && j.error ? j.error : 'Not completed yet');
      }
      await fetchTasks(token);
    } finally {
      setLoading(false);
      setBusyTask(null);
    }
  }, [dex, fetchTasks, loading, taskHeaders, tasks, token]);

  const visibleTasks = useMemo(
    () => sortQuestsForClaiming(tasks.filter(t => taskTradableOnMarkets(t, markets))),
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
          style={GOLD_REWARD_PANEL_TOAST_STYLE}
        />
      )}
      {error && <div style={S.error} onClick={() => setError(null)}>{error}</div>}
      {visibleTasks.map(t => (
        <QuestCard
          key={t.id}
          task={t}
          onStart={handleStart}
          onClaim={handleClaim}
          loading={loading}
          busyAction={Number(busyTask?.id) === Number(t.id) ? busyTask.action : null}
        />
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
  rewardBoost: { fontSize: 11, fontWeight: 900, color: '#704214', background: '#fff0b8', padding: '3px 7px', borderRadius: 6, border: '1px solid #d8a62a', display: 'flex', alignItems: 'center' },
  rewardIcon: { width: 16, height: 16, objectFit: 'contain' },
  nftUnlockRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    background: '#fff7d6', border: '1px solid #e6c46b', borderRadius: 7,
    padding: '5px 7px', marginTop: 2,
  },
  nftUnlockText: { fontSize: 11, lineHeight: 1.2, fontWeight: 800, color: '#704214' },
  nftUnlockBtn: {
    flex: '0 0 auto', padding: '4px 8px', borderRadius: 7, border: '1px solid #a86d16',
    background: 'linear-gradient(180deg, #f0be35 0%, #c68419 100%)',
    color: '#fff', fontSize: 11, fontWeight: 900, cursor: 'pointer',
    textShadow: '1px 1px 0 rgba(0,0,0,0.22)',
  },

  btnStart: {
    minWidth: 86, padding: '6px 14px', background: 'linear-gradient(180deg, #6ab344 0%, #4d7a2e 100%)',
    color: '#fff', fontWeight: 900, fontSize: 12, border: '2px solid #3a5e22', borderRadius: 8,
    cursor: 'pointer', textShadow: '1px 1px 0 rgba(0,0,0,0.3)',
  },
  btnClaim: {
    minWidth: 86, padding: '6px 14px', background: 'linear-gradient(180deg, #e8b830 0%, #b8860b 100%)',
    color: '#fff', fontWeight: 900, fontSize: 12, border: '2px solid #8a5f00', borderRadius: 8,
    cursor: 'pointer', textShadow: '1px 1px 0 rgba(0,0,0,0.3)', animation: 'pulse-glow 1.5s infinite',
  },
  btnRefresh: {
    minWidth: 86, padding: '6px 14px', background: '#d4c8b0', color: '#5C3A21',
    fontWeight: 800, fontSize: 12, border: '2px solid #a3906a', borderRadius: 8, cursor: 'pointer',
  },
  doneLabel: { fontSize: 18, fontWeight: 900, color: '#6ab344' },
  badgeRow: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' },
  badgeExclusive: { fontSize: 10, fontWeight: 900, color: '#fff', background: 'linear-gradient(180deg, #8b5cf6 0%, #5b21b6 100%)', padding: '2px 6px', borderRadius: 4, border: '1px solid #4c1d95', textShadow: '1px 1px 0 rgba(0,0,0,0.25)' },
  badgeDone: { fontSize: 10, fontWeight: 800, color: '#4d7a2e', background: '#e8f5d8', padding: '2px 6px', borderRadius: 4, border: '1px solid #6ab344' },
  badgeRepeat: { fontSize: 10, fontWeight: 800, color: '#5C3A21', background: '#fff5cc', padding: '2px 6px', borderRadius: 4, border: '1px solid #e8b830' },
  empty: { textAlign: 'center', padding: 40, color: '#8a7252' },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21', marginBottom: 6 },
  emptyDesc: { fontSize: 12, fontWeight: 600 },
  error: { background: '#fee', border: '2px solid #c33', color: '#c33', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
};

export default memo(QuestsTab);
