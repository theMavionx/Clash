import { useEffect, useMemo, useRef, useState } from 'react';
import { adminDelete, adminDownload, adminGet, adminPatch, adminPost, adminPut, clearAdminKey, getStoredAdminKey, storeAdminKey } from './api';
import {
  DEX_LABELS,
  PRIZE_PRESETS,
  TOURNAMENT_DEXES,
  buildPayouts,
  defaultMegaConfig,
  emptyTournament,
  emptyLuckyRaiderEvent,
  fmtTime,
  fmtUsd,
  formToTournamentBody,
  normalizeMegaConfig,
  normalizeLuckyRaiderManualWinners,
  normalizeReward,
  normalizeRewardConfig,
  rewardConfigPreset5000,
  rewardConfigPresetLuckyRaider,
  rewardDefaults,
  tournamentToForm,
  validateTournamentStep,
} from './tournamentUtils';

function utcTextToDatetimeLocal(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  return normalized.replace(/Z$/u, '').slice(0, 16);
}

function datetimeLocalToUtcText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const withSeconds = text.length === 16 ? `${text}:00` : text;
  return withSeconds.replace('T', ' ');
}

function parseUtcDateMs(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  return Date.parse((text.includes('T') ? text : text.replace(' ', 'T')) + (/[zZ]$/u.test(text) ? '' : 'Z'));
}

function formatUtcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addUtcDays(day, count) {
  const dayMs = 24 * 60 * 60 * 1000;
  return formatUtcDay(Date.parse(`${day}T00:00:00Z`) + count * dayMs);
}

function dailyPoolAwardMinutes(value) {
  const match = String(value || '00:00').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  const hours = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minutes = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return hours * 60 + minutes;
}

function dailyPoolRoundDayFromMs(ms, awardMinutes) {
  const day = formatUtcDay(ms);
  const cutoffMs = Date.parse(`${day}T00:00:00Z`) + awardMinutes * 60 * 1000;
  return ms >= cutoffMs ? addUtcDays(day, 1) : day;
}

function tournamentUtcDays(form, limit = 31) {
  const scheduleStart = form.scoring_mode === 'daily_pool' ? (form.daily_pool_enabled_at || form.start_at) : form.start_at;
  const startMs = parseUtcDateMs(scheduleStart);
  if (!Number.isFinite(startMs)) return [];
  const endMsRaw = parseUtcDateMs(form.end_at);
  const dayMs = 24 * 60 * 60 * 1000;
  const awardMinutes = dailyPoolAwardMinutes(form.daily_pool_award_time_utc || '00:00');
  const firstDay = form.scoring_mode === 'daily_pool'
    ? dailyPoolRoundDayFromMs(startMs, awardMinutes)
    : formatUtcDay(startMs);
  const first = Date.parse(`${firstDay}T00:00:00Z`);
  const lastSource = Number.isFinite(endMsRaw) ? Math.max(startMs, endMsRaw - 1) : first + 6 * dayMs;
  const lastDay = form.scoring_mode === 'daily_pool'
    ? dailyPoolRoundDayFromMs(lastSource, awardMinutes)
    : formatUtcDay(lastSource);
  const last = Date.parse(`${lastDay}T00:00:00Z`);
  const count = Math.max(1, Math.min(limit, Math.floor((last - first) / dayMs) + 1));
  return Array.from({ length: count }, (_, idx) => formatUtcDay(first + idx * dayMs));
}

function dailyPoolAutoPoints(base, pct, index) {
  const points = Math.max(1, Number(base) || 1000) * Math.pow(1 + (Number(pct) || 0) / 100, Math.max(0, index));
  return Math.max(1, Math.round(points));
}

function nowUtcText() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function utcDaySchedule(offsetDays = 0) {
  const dayMs = 24 * 60 * 60 * 1000;
  const base = new Date();
  const start = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offsetDays, 0, 0, 0);
  const end = start + dayMs;
  return {
    starts_at: new Date(start).toISOString().slice(0, 19).replace('T', ' '),
    ends_at: new Date(end).toISOString().slice(0, 19).replace('T', ' '),
  };
}

function taskScheduleState(task) {
  if (!task?.active) return { label: 'inactive', badge: 'off' };
  const now = Date.now();
  const startMs = task.starts_at ? Date.parse(String(task.starts_at).replace(' ', 'T') + 'Z') : NaN;
  const endMs = task.ends_at ? Date.parse(String(task.ends_at).replace(' ', 'T') + 'Z') : NaN;
  if (Number.isFinite(startMs) && startMs > now) return { label: 'scheduled', badge: 'gold' };
  if (Number.isFinite(endMs) && endMs <= now) return { label: 'expired', badge: 'off' };
  return { label: task.starts_at || task.ends_at ? 'live window' : 'active', badge: 'green' };
}

function repeatProgressionLabel(task) {
  const cfg = task?.params?.repeat_progression;
  if (!cfg?.enabled) return '';
  const mode = String(cfg.mode || 'percent').toLowerCase();
  if (mode === 'manual') return `manual targets: ${cfg.values || cfg.value || '-'}`;
  if (mode === 'multiplier') return `x${Number(cfg.value ?? cfg.multiplier ?? 1).toLocaleString()} per claim`;
  return `+${Number(cfg.value ?? cfg.percent ?? 0).toLocaleString()}% per claim`;
}

const NAV = [
  { id: 'overview', label: 'Overview', hint: 'Live health and workload', icon: 'OV' },
  { id: 'players', label: 'Players', hint: 'Accounts, resources, tools', icon: 'PL' },
  { id: 'mm-bots', label: 'MM Bots WL', hint: 'Button access grants', icon: 'MM' },
  { id: 'tournaments', label: 'Tournaments', hint: 'Events, rewards, scoring', icon: 'TN' },
  { id: 'replays', label: 'Battle Replays', hint: 'Verification history', icon: 'BR' },
  { id: 'tasks', label: 'Tasks', hint: 'Quest config and progress', icon: 'TS' },
  { id: 'stats', label: 'Stats', hint: 'Activity and devices', icon: 'ST' },
  { id: 'clash', label: '$CLASH', hint: 'Buybacks and burns', icon: 'CT' },
  { id: 'earnings', label: 'Earnings', hint: 'Revenue analytics', icon: 'ER' },
  { id: 'referrals', label: 'Referrals', hint: 'Invites, commissions, payouts', icon: 'RF' },
  { id: 'shop', label: 'Shop', hint: 'Billing and AI chat', icon: 'SH' },
  { id: 'sanctum', label: 'clashSOL', hint: 'LST growth and daily Gold', icon: 'LS' },
  { id: 'marketplace', label: 'Marketplace', hint: 'Custodial orders', icon: 'MP' },
  { id: 'nft', label: 'NFT / Bridge', hint: 'Supply and bridge state', icon: 'NF' },
  { id: 'logs', label: 'Logs', hint: 'Server logs', icon: 'LG' },
  { id: 'client', label: 'Client Logs', hint: 'Browser diagnostics', icon: 'CL' },
  { id: 'ai-reports', label: 'AI Log Reports', hint: 'Daily incident reports', icon: 'AI' },
  { id: 'feedback', label: 'Feedback', hint: 'Player reports', icon: 'FB' },
  { id: 'phantom-bots', label: 'Phantom Bots', hint: 'Live MM bots & 24h results', icon: 'PB' },
  { id: 'elfa', label: 'Elfa', hint: 'Signal stats', icon: 'EF' },
];

const SIMPLE_LOADERS = {
  replays: () => adminGet('/admin/replays'),
  tasks: () => Promise.all([
    adminGet('/admin/tasks'),
    adminGet('/admin/tasks-summary'),
    adminGet('/admin/tasks-nft-reward-boosts'),
  ]).then(([tasks, summary, nftRewardBoosts]) => ({ tasks, summary, nftRewardBoosts })),
  stats: () => Promise.all([
    adminGet('/admin/stats'),
    adminGet('/admin/matchmaking/stats?days=7').catch((error) => ({ error: error.message })),
  ]).then(([stats, matchmaking]) => ({ ...stats, matchmaking })),
  clash: () => adminGet('/admin/clash-transactions'),
  earnings: () => Promise.all([
    adminGet('/admin/earnings'),
    adminGet('/admin/revenue-analytics').catch((error) => ({ error: error.message })),
    adminGet('/admin/exchange-balances?days=30&limit=2000').catch((error) => ({ error: error.message })),
  ]).then(([earnings, revenue, exchangeBalances]) => ({ earnings, revenue, exchangeBalances })),
  referrals: () => adminGet('/admin/referrals'),
  shop: () => Promise.all([
    adminGet('/admin/shop'),
    adminGet('/admin/ai-chat/billing').catch((error) => ({ error: error.message })),
  ]).then(([shop, aiBilling]) => ({ shop, aiBilling })),
  sanctum: () => adminGet('/admin/sanctum?limit=200'),
  marketplace: () => adminGet('/admin/marketplace/custodial/stats?limit=500'),
  nft: () => adminGet('/admin/nft-analytics'),
  logs: () => adminGet('/admin/logs?limit=200'),
  client: () => adminGet('/admin/client-logs?since_min=60&limit=250'),
  'ai-reports': () => adminGet('/admin/ai-log-reports?limit=20'),
  feedback: () => adminGet('/admin/feedback?limit=200'),
  'phantom-bots': () => adminGet('/admin/phantom-bots?hours=24'),
  elfa: () => adminGet('/admin/elfa/stats'),
};

const TASK_TYPES = [
  { id: 'volume', label: 'Trading volume' },
  { id: 'positions', label: 'Positions opened' },
  { id: 'combo_volume_attack', label: 'Volume + accepted attack' },
  { id: 'daily_trade_gold', label: 'Daily trade gold' },
];

const TASK_SIDES = [
  { id: 'any', label: 'Any side' },
  { id: 'long', label: 'Long only' },
  { id: 'short', label: 'Short only' },
];

const TASK_ELIGIBILITY_OPTIONS = [
  { id: 'all', label: 'Everyone', badge: 'Everyone' },
  { id: 'soldiers_only', label: 'Soldiers only', badge: 'Soldiers' },
  { id: 'demon_king', label: 'Demon King holders', badge: 'Demon King' },
  { id: 'dragon', label: 'Dragon holders', badge: 'Dragon' },
  { id: 'demon_or_dragon', label: 'Demon King or Dragon', badge: 'NFT Elite' },
  { id: 'demon_and_dragon', label: 'Demon King and Dragon', badge: 'Demon + Dragon' },
];

function normalizeTaskEligibilityConfig(params) {
  const raw = params?.eligibility && typeof params.eligibility === 'object' ? params.eligibility : {};
  const option = TASK_ELIGIBILITY_OPTIONS.find((item) => item.id === raw.mode) || TASK_ELIGIBILITY_OPTIONS[0];
  return { mode: option.id, label: String(raw.label || '').trim() };
}

function taskEligibilityAdminLabel(taskOrParams) {
  const params = taskOrParams?.params ? taskOrParams.params : taskOrParams;
  const source = params?.eligibility ? params : { eligibility: taskOrParams?.eligibility };
  const cfg = normalizeTaskEligibilityConfig(source || {});
  if (cfg.mode === 'all') return '';
  const option = TASK_ELIGIBILITY_OPTIONS.find((item) => item.id === cfg.mode);
  return cfg.label || option?.badge || 'Exclusive';
}

function applyAdminTableLabels(root = document) {
  root.querySelectorAll?.('.admin-table').forEach((table) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => cell.textContent.trim());
    if (!headers.length) return;
    table.querySelectorAll('tbody tr').forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        if (cell.tagName === 'TD') cell.setAttribute('data-label', headers[index] || '');
      });
    });
  });
}

export default function AdminApp() {
  const [key, setKey] = useState(getStoredAdminKey);
  const [authed, setAuthed] = useState(false);
  const [active, setActive] = useState('overview');
  const [players, setPlayers] = useState([]);
  const [replays, setReplays] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [simpleData, setSimpleData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const skipNextActiveRefresh = useRef(false);

  async function login(nextKey = key) {
    setError('');
    setLoading(true);
    try {
      const [playersData, replaysData, tournamentsData] = await Promise.all([
        adminGet('/admin/players', { key: nextKey }),
        adminGet('/admin/replays', { key: nextKey }),
        adminGet('/admin/tournaments', { key: nextKey }),
      ]);
      storeAdminKey(nextKey);
      setKey(nextKey);
      setPlayers(Array.isArray(playersData) ? playersData : (playersData.players || []));
      setReplays(Array.isArray(replaysData) ? replaysData : (replaysData.replays || []));
      setTournaments(tournamentsData.tournaments || []);
      setLastRefresh(new Date());
      skipNextActiveRefresh.current = true;
      setAuthed(true);
    } catch (err) {
      setError(err.message || 'Invalid admin key');
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAdminKey();
    setAuthed(false);
    setKey('');
  }

  async function refreshCore() {
    const [playersData, replaysData, tournamentsData] = await Promise.all([
      adminGet('/admin/players'),
      adminGet('/admin/replays'),
      adminGet('/admin/tournaments'),
    ]);
    setPlayers(Array.isArray(playersData) ? playersData : (playersData.players || []));
    setReplays(Array.isArray(replaysData) ? replaysData : (replaysData.replays || []));
    setTournaments(tournamentsData.tournaments || []);
    setLastRefresh(new Date());
  }

  async function refreshActive() {
    setError('');
    setLoading(true);
    try {
      if (active === 'overview' || active === 'players' || active === 'mm-bots' || active === 'tournaments' || active === 'replays') {
        await refreshCore();
      }
      if (SIMPLE_LOADERS[active]) {
        const data = await SIMPLE_LOADERS[active]();
        setSimpleData((prev) => ({ ...prev, [active]: data }));
      }
    } catch (err) {
      if (err.status === 403) setAuthed(false);
      setError(err.message || 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }

  function stopNumberWheel(event) {
    if (event.target?.matches?.('input[type="number"], input[data-number-input="true"]')) {
      event.preventDefault();
    }
  }

  useEffect(() => {
    if (key) login(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (skipNextActiveRefresh.current) {
      skipNextActiveRefresh.current = false;
      return;
    }
    refreshActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, authed]);

  useEffect(() => {
    if (!authed) return undefined;
    const id = setInterval(() => {
      if (active === 'overview' || active === 'players' || active === 'mm-bots') refreshCore().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [active, authed]);

  useEffect(() => {
    if (!authed || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return undefined;
    const root = document.getElementById('admin-root') || document;
    let frame = 0;
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyAdminTableLabels(root);
      });
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [authed]);

  if (!authed) {
    return (
      <div className="admin-app" onWheelCapture={stopNumberWheel}>
        <div className="admin-login">
          <form className="admin-login-box" onSubmit={(event) => { event.preventDefault(); login(key); }}>
            <div className="admin-login-title">Clash Admin</div>
            <div className="admin-login-sub">Operations panel for players, tournaments, rewards, logs, marketplace, and bridge state.</div>
            <label className="admin-field">
              <span className="admin-label">Admin key</span>
              <input className="admin-input" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoFocus />
            </label>
            {error && <div className="admin-error" style={{ marginTop: 12 }}>{error}</div>}
            <button className="admin-btn primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 14 }}>
              {loading ? 'Checking...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const current = NAV.find((item) => item.id === active) || NAV[0];

  return (
    <div className="admin-app" onWheelCapture={stopNumberWheel}>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <div className="admin-brand-name">Clash Admin</div>
            <div className="admin-brand-sub">Production operations</div>
          </div>
          <nav className="admin-nav admin-scroll">
            {NAV.map((item) => (
              <button key={item.id} className={'admin-nav-button' + (active === item.id ? ' active' : '')} onClick={() => setActive(item.id)}>
                <span className="admin-nav-icon">{item.icon}</span>
                <span>
                  <span>{item.label}</span>
                  <span className="admin-card-sub" style={{ display: 'block' }}>{item.hint}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="admin-main">
          <header className="admin-topbar">
            <div className="admin-title">
              <h1>{current.label}</h1>
              <p>{current.hint}{lastRefresh ? ` · refreshed ${lastRefresh.toLocaleTimeString()}` : ''}</p>
            </div>
            <div className="admin-actions">
              {error && <span className="admin-badge red">{error}</span>}
              <button className="admin-btn" onClick={refreshActive} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
              <button className="admin-btn ghost" onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="admin-content admin-scroll">
            {active === 'overview' && <Overview players={players} replays={replays} tournaments={tournaments} setActive={setActive} />}
            {active === 'players' && <PlayersPanel players={players} reload={refreshCore} />}
            {active === 'mm-bots' && <MmBotsAccessPanel players={players} reload={refreshCore} />}
            {active === 'tournaments' && <TournamentsPanel tournaments={tournaments} reload={refreshCore} />}
            {active === 'replays' && <ReplaysPanel replays={replays} />}
            {active === 'stats' && <StatsPanel data={simpleData.stats} />}
            {active === 'clash' && <ClashTransactionsPanel data={simpleData.clash} reload={refreshActive} />}
            {active === 'tasks' && <TasksPanel data={simpleData.tasks} reload={refreshActive} />}
            {active === 'client' && <ClientLogsPanel data={simpleData.client} reload={refreshActive} />}
            {active === 'logs' && <ServerLogsPanel data={simpleData.logs} reload={refreshActive} />}
            {active === 'earnings' && <EarningsPanel data={simpleData.earnings} reload={refreshActive} />}
            {active === 'referrals' && <ReferralsPanel data={simpleData.referrals} reload={refreshActive} />}
            {active === 'shop' && <ShopPanel data={simpleData.shop} />}
            {active === 'sanctum' && <SanctumAdminPanel data={simpleData.sanctum} reload={refreshActive} />}
            {active === 'marketplace' && <MarketplacePanel data={simpleData.marketplace} reload={refreshActive} />}
            {active === 'nft' && <NftPanel data={simpleData.nft} />}
            {active === 'feedback' && <FeedbackPanel data={simpleData.feedback} />}
            {active === 'ai-reports' && <AiReportsPanel data={simpleData['ai-reports']} reload={refreshActive} />}
            {active === 'phantom-bots' && (
              <PhantomBotsPanel
                data={simpleData['phantom-bots']}
                reload={async (hours = 24) => {
                  setLoading(true);
                  try {
                    const data = await adminGet(`/admin/phantom-bots?hours=${hours}`);
                    setSimpleData((prev) => ({ ...prev, 'phantom-bots': data }));
                    setLastRefresh(new Date());
                  } catch (err) {
                    setError(err.message || 'Failed to load phantom bots');
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            )}
            {active === 'elfa' && <ElfaPanel data={simpleData.elfa} />}
            {!['overview', 'players', 'mm-bots', 'tournaments', 'replays', 'stats', 'clash', 'tasks', 'client', 'logs', 'earnings', 'referrals', 'shop', 'sanctum', 'marketplace', 'nft', 'feedback', 'ai-reports', 'phantom-bots', 'elfa'].includes(active) && (
              <GenericDataPanel id={active} data={simpleData[active]} reload={refreshActive} />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function Overview({ players, replays, tournaments, setActive }) {
  const stats = useMemo(() => {
    const online = players.filter((p) => p.online).length;
    const active24 = players.filter((p) => p.active_24h).length;
    const activeTournaments = tournaments.filter((t) => t.status === 'active').length;
    const rejected = replays.filter((r) => r.verified_result === 'rejected').length;
    return [
      { label: 'Players', value: players.length },
      { label: 'Online now', value: online, tone: 'green' },
      { label: 'Active 24h', value: active24, tone: 'blue' },
      { label: 'Active tournaments', value: activeTournaments, tone: 'gold' },
      { label: 'Rejected replays', value: rejected, tone: rejected ? 'red' : 'green' },
    ];
  }, [players, replays, tournaments]);

  return (
    <div className="admin-grid">
      <StatsGrid stats={stats} />
      <div className="admin-grid two">
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-card-title">Tournament Workbench</div>
              <div className="admin-card-sub">Create, edit, inspect leaderboards, and manage daily scoring from one place.</div>
            </div>
            <button className="admin-btn primary" onClick={() => setActive('tournaments')}>Open</button>
          </div>
          <div className="admin-card-body">
            <MiniList rows={tournaments.slice(0, 6).map((t) => ({
              title: `#${t.id} ${t.name}`,
              meta: `${t.status} · ${t.phase || '-'} · ${t.participants || 0} active players`,
              badge: t.dex_scope === 'all' ? 'ALL' : (DEX_LABELS[t.dex] || t.dex || '-'),
            }))} />
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-card-title">Player Operations</div>
              <div className="admin-card-sub">Resources, trophies, max village presets, and account resets are grouped per player.</div>
            </div>
            <button className="admin-btn primary" onClick={() => setActive('players')}>Open</button>
          </div>
          <div className="admin-card-body">
            <MiniList rows={players.slice(0, 6).map((p) => ({
              title: p.name || p.id,
              meta: `${p.dex || 'no dex'} · ${p.trophies || 0} trophies · ${p.buildings_count || 0} buildings`,
              badge: p.online ? 'ONLINE' : (p.active_24h ? '24h' : 'OFF'),
            }))} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsGrid({ stats }) {
  return (
    <div className="admin-stats">
      {stats.map((stat) => (
        <div className="admin-stat" key={stat.label}>
          <div className="admin-stat-value" style={{ color: toneColor(stat.tone) }}>{stat.value}</div>
          <div className="admin-stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function MiniList({ rows }) {
  if (!rows.length) return <div className="admin-help">No rows yet.</div>;
  return (
    <div className="admin-grid" style={{ gap: 8 }}>
      {rows.map((row, index) => (
        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(148,163,184,.16)', paddingBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 900 }}>{row.title}</div>
            <div className="admin-card-sub">{row.meta}</div>
          </div>
          <span className="admin-badge gold">{row.badge}</span>
        </div>
      ))}
    </div>
  );
}

function PlayersPanel({ players, reload }) {
  const [search, setSearch] = useState('');
  const [dex, setDex] = useState('all');
  const [profileTarget, setProfileTarget] = useState(null);
  const [selectedTools, setSelectedTools] = useState(null);
  const [mmGrantInput, setMmGrantInput] = useState('');
  const [mmBusy, setMmBusy] = useState('');
  const [mmMessage, setMmMessage] = useState('');
  const filtered = useMemo(() => players.filter((p) => {
    const hay = `${p.name || ''} ${p.id || ''} ${p.wallet || ''}`.toLowerCase();
    return (!search || hay.includes(search.toLowerCase())) && (dex === 'all' || (p.dex || '') === dex);
  }), [players, search, dex]);

  const stats = [
    { label: 'Players', value: players.length },
    { label: 'Online', value: players.filter((p) => p.online).length, tone: 'green' },
    { label: 'Active 7d', value: players.filter((p) => p.active_7d).length, tone: 'blue' },
    { label: 'Shielded', value: players.filter((p) => p.shield_active).length, tone: 'gold' },
    { label: 'MM avg win', value: averageMatchmakingRate(players), tone: 'green' },
    { label: 'Recovery 7d', value: num(players.reduce((sum, p) => sum + Number(p.matchmaking?.recovery_matches_7d || 0), 0)), tone: 'blue' },
    { label: 'Captcha flags', value: players.filter((p) => p.captcha_required || p.battle_risk?.captcha_required).length, tone: players.some((p) => p.captcha_required || p.battle_risk?.captcha_required) ? 'red' : 'green' },
    { label: 'MM Bots WL', value: players.filter((p) => p.mm_bots_enabled || p.mm_bots_access?.enabled).length, tone: 'gold' },
    { label: 'God Mode', value: players.filter((p) => p.god_mode_enabled || p.god_mode_access?.enabled).length, tone: 'gold' },
    { label: 'Banned', value: players.filter((p) => p.banned_at).length, tone: 'red' },
  ];

  async function setMmBotsAccess(player, enabled) {
    const id = player?.id || player?.name;
    if (!id) return;
    const label = `${enabled ? 'grant' : 'revoke'}:${id}`;
    setMmBusy(label);
    setMmMessage('');
    try {
      const result = await adminPost(`/admin/players/${encodeURIComponent(id)}/mm-bots-access`, {
        enabled,
        note: enabled ? 'admin ui grant' : 'admin ui revoke',
      });
      setMmMessage(`${result.access?.player_name || player.name || id}: MM Bots ${enabled ? 'enabled' : 'disabled'}.`);
      await reload();
    } catch (err) {
      setMmMessage(err.message || 'MM Bots access update failed');
    } finally {
      setMmBusy('');
    }
  }

  async function grantMmBotsByInput(event) {
    event?.preventDefault?.();
    const player = mmGrantInput.trim();
    if (!player) return;
    setMmBusy('grant-input');
    setMmMessage('');
    try {
      const result = await adminPost('/admin/mm-bots/access', {
        player,
        enabled: true,
        note: 'admin ui grant',
      });
      setMmMessage(`${result.access?.player_name || player}: MM Bots enabled.`);
      setMmGrantInput('');
      await reload();
    } catch (err) {
      setMmMessage(err.message || 'MM Bots access grant failed');
    } finally {
      setMmBusy('');
    }
  }

  return (
    <div className="admin-grid">
      <StatsGrid stats={stats} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Players</div>
            <div className="admin-card-sub">Search by name, id, or wallet. Open a read-first 360 profile; destructive actions stay in Tools.</div>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-toolbar">
            <div className="admin-filter-row">
              <input className="admin-input" placeholder="Search player / wallet" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="admin-select" value={dex} onChange={(e) => setDex(e.target.value)}>
                <option value="all">All DEXes</option>
                {TOURNAMENT_DEXES.map((d) => <option key={d} value={d}>{DEX_LABELS[d] || d}</option>)}
              </select>
            </div>
            <span className="admin-help">{filtered.length} shown</span>
          </div>
          <form className="admin-filter-row" onSubmit={grantMmBotsByInput} style={{ marginBottom: 12 }}>
            <input
              className="admin-input"
              placeholder="Grant MM Bots by name, id, or wallet"
              value={mmGrantInput}
              onChange={(e) => setMmGrantInput(e.target.value)}
            />
            <button className="admin-btn green" type="submit" disabled={!mmGrantInput.trim() || !!mmBusy}>
              {mmBusy === 'grant-input' ? 'Granting...' : 'Grant MM Bots'}
            </button>
            {mmMessage ? <span className={'admin-badge ' + (mmMessage.toLowerCase().includes('failed') || mmMessage.toLowerCase().includes('not found') ? 'red' : 'green')}>{mmMessage}</span> : null}
          </form>
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th><th>DEX</th><th>Wallet</th><th>Created</th><th>Trophies</th><th>Level</th><th>MM 7d</th><th>Risk</th><th>MM Bots</th><th>God Mode</th><th>Gold</th><th>Wood</th><th>Ore</th><th>Trade Vol</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id || p.name}>
                    <td data-label="Name">
                      <strong>{p.name}</strong>{p.banned_at ? <span className="admin-badge red" style={{ marginLeft: 8 }}>BANNED</span> : null}
                      <div className="admin-card-sub admin-mono">{p.id}</div>
                    </td>
                    <td data-label="DEX"><DexBadge dex={p.dex} /></td>
                    <td data-label="Wallet" className="admin-mono">{short(p.wallet)}</td>
                    <td data-label="Created" className="admin-mono">{fmtTime(p.created_at)}</td>
                    <td data-label="Trophies">{p.trophies}</td>
                    <td data-label="Level">{p.level}</td>
                    <td data-label="MM 7d"><MatchmakingPlayerCell player={p} /></td>
                    <td data-label="Risk"><BattleRiskBadges risk={p.battle_risk || p} /></td>
                    <td data-label="MM Bots">
                      <MmBotsAccessCell
                        player={p}
                        busy={mmBusy}
                        onToggle={setMmBotsAccess}
                      />
                    </td>
                    <td data-label="God Mode">
                      <span className={'admin-badge ' + (p.god_mode_enabled || p.god_mode_access?.enabled ? 'gold' : 'off')}>
                        {p.god_mode_enabled || p.god_mode_access?.enabled ? 'GOD MODE' : 'Off'}
                      </span>
                    </td>
                    <td data-label="Gold" style={{ color: 'var(--admin-gold)' }}>{num(p.gold)}</td>
                    <td data-label="Wood" style={{ color: 'var(--admin-wood)' }}>{num(p.wood)}</td>
                    <td data-label="Ore" style={{ color: '#b8c4d8' }}>{num(p.ore)}</td>
                    <td data-label="Trade Vol">{fmtUsd(p.trading_volume || 0)}</td>
                    <td data-label="Status"><PresenceBadge player={p} /></td>
                    <td data-label="Actions">
                      <div className="admin-filter-row">
                        <button className="admin-btn primary" onClick={() => setProfileTarget(p)}>Open</button>
                        <button className="admin-btn" onClick={() => setSelectedTools(p)}>Tools</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {profileTarget && (
        <PlayerProfileDrawer
          player={profileTarget}
          onClose={() => setProfileTarget(null)}
          onOpenTools={(player) => setSelectedTools(player)}
          reload={reload}
        />
      )}
      {selectedTools && <PlayerToolsDrawer player={selectedTools} onClose={() => setSelectedTools(null)} reload={reload} />}
    </div>
  );
}

function MmBotsAccessPanel({ players, reload }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [grantInput, setGrantInput] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (players || [])
      .map((player) => {
        const linkedWallets = Array.isArray(player.linked_wallets) ? player.linked_wallets : [];
        const walletText = linkedWallets.map((row) => row.wallet).filter(Boolean).join(' ');
        const enabled = !!(player.mm_bots_enabled || player.mm_bots_access?.enabled);
        return { ...player, linked_wallets: linkedWallets, mm_enabled: enabled, wallet_text: walletText };
      })
      .filter((player) => {
        if (status === 'enabled' && !player.mm_enabled) return false;
        if (status === 'off' && player.mm_enabled) return false;
        if (!needle) return true;
        const hay = `${player.name || ''} ${player.id || ''} ${player.wallet || ''} ${player.wallet_text || ''}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        if (a.mm_enabled !== b.mm_enabled) return a.mm_enabled ? -1 : 1;
        const au = Date.parse(`${a.mm_bots_access?.updated_at || a.last_seen_at || a.created_at || ''}Z`) || 0;
        const bu = Date.parse(`${b.mm_bots_access?.updated_at || b.last_seen_at || b.created_at || ''}Z`) || 0;
        return bu - au;
      });
  }, [players, search, status]);

  const stats = [
    { label: 'MM Bots WL', value: players.filter((p) => p.mm_bots_enabled || p.mm_bots_access?.enabled).length, tone: 'gold' },
    { label: 'Shown', value: rows.length, tone: 'blue' },
    { label: 'Searchable wallets', value: players.reduce((sum, p) => sum + (Array.isArray(p.linked_wallets) ? p.linked_wallets.length : (p.wallet ? 1 : 0)), 0), tone: 'green' },
  ];

  async function setAccess(player, enabled) {
    const identifier = player?.id || player?.name || player?.wallet;
    if (!identifier) return;
    const action = enabled ? 'grant' : 'revoke';
    setBusy(`${action}:${identifier}`);
    setMessage('');
    try {
      const result = await adminPost(`/admin/players/${encodeURIComponent(identifier)}/mm-bots-access`, {
        enabled,
        note: enabled ? 'admin mm bots wl grant' : 'admin mm bots wl revoke',
      });
      setMessage(`${result.access?.player_name || player.name || identifier}: MM Bots ${enabled ? 'enabled' : 'disabled'}.`);
      await reload();
    } catch (err) {
      setMessage(err.message || 'MM Bots access update failed');
    } finally {
      setBusy('');
    }
  }

  async function grantByInput(event) {
    event?.preventDefault?.();
    const identifier = grantInput.trim();
    if (!identifier) return;
    setBusy('grant-input');
    setMessage('');
    try {
      const result = await adminPost('/admin/mm-bots/access', {
        player: identifier,
        enabled: true,
        note: 'admin mm bots wl grant',
      });
      setMessage(`${result.access?.player_name || identifier}: MM Bots enabled.`);
      setGrantInput('');
      await reload();
    } catch (err) {
      setMessage(err.message || 'MM Bots access grant failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="admin-grid">
      <StatsGrid stats={stats} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">MM Bots Button Whitelist</div>
            <div className="admin-card-sub">Grant by player name, player id, login wallet, linked wallet, or DEX account wallet.</div>
          </div>
        </div>
        <div className="admin-card-body">
          <form className="admin-filter-row" onSubmit={grantByInput} style={{ marginBottom: 12 }}>
            <input
              className="admin-input"
              placeholder="Name, player id, or wallet"
              value={grantInput}
              onChange={(event) => setGrantInput(event.target.value)}
            />
            <button className="admin-btn green" type="submit" disabled={!grantInput.trim() || !!busy}>
              {busy === 'grant-input' ? 'Granting...' : 'Grant Access'}
            </button>
            {message ? <span className={'admin-badge ' + (/failed|not found|error/i.test(message) ? 'red' : 'green')}>{message}</span> : null}
          </form>
          <div className="admin-toolbar">
            <div className="admin-filter-row">
              <input className="admin-input" placeholder="Search name / id / wallet" value={search} onChange={(event) => setSearch(event.target.value)} />
              <select className="admin-select" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All players</option>
                <option value="enabled">Enabled only</option>
                <option value="off">Off only</option>
              </select>
            </div>
            <span className="admin-help">{rows.length} shown</span>
          </div>
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Player</th><th>DEX</th><th>Wallets</th><th>Status</th><th>Updated</th><th>Note</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((player) => {
                  const enabled = !!player.mm_enabled;
                  const action = enabled ? 'revoke' : 'grant';
                  const actionBusy = busy === `${action}:${player.id || player.name}`;
                  const wallets = player.linked_wallets?.length
                    ? player.linked_wallets
                    : (player.wallet ? [{ wallet: player.wallet, source: 'players.wallet' }] : []);
                  return (
                    <tr key={player.id || player.name}>
                      <td data-label="Player">
                        <strong>{player.name}</strong>
                        <div className="admin-card-sub admin-mono">{player.id}</div>
                      </td>
                      <td data-label="DEX"><DexBadge dex={player.dex} /></td>
                      <td data-label="Wallets">
                        {wallets.length ? wallets.slice(0, 4).map((row) => (
                          <div key={`${player.id}-${row.wallet}-${row.source}`} className="admin-card-sub admin-mono">
                            {short(row.wallet, 8, 6)} <span className="admin-help">{row.source}</span>
                          </div>
                        )) : <span className="admin-badge off">No wallet</span>}
                      </td>
                      <td data-label="Status"><span className={'admin-badge ' + (enabled ? 'green' : 'off')}>{enabled ? 'Enabled' : 'Off'}</span></td>
                      <td data-label="Updated" className="admin-mono">{fmtTime(player.mm_bots_access?.updated_at)}</td>
                      <td data-label="Note">{player.mm_bots_access?.note || '-'}</td>
                      <td data-label="Action">
                        <button
                          className={'admin-btn ' + (enabled ? 'danger' : 'green')}
                          onClick={() => setAccess(player, !enabled)}
                          disabled={!!busy}
                        >
                          {actionBusy ? 'Saving...' : enabled ? 'Revoke' : 'Grant'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr><td colSpan={7}><span className="admin-help">No players match this filter.</span></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const PLAYER_PROFILE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'base', label: 'Base' },
  { id: 'activity', label: 'Activity' },
  { id: 'trading', label: 'Trading' },
  { id: 'quests', label: 'Quests' },
  { id: 'nft', label: 'NFT' },
  { id: 'battles', label: 'Battles' },
  { id: 'support', label: 'Support & Logs' },
  { id: 'marketing', label: 'Marketing' },
];

function profileValue(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function profileUsd(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? fmtUsd(n) : '$0';
}

function profileDate(value) {
  return value ? fmtTime(value) : '-';
}

function profileJsonPreview(value) {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function ProfileMetricGrid({ items }) {
  return (
    <div className="player-profile-metrics">
      {(items || []).map((item) => (
        <div className="player-profile-metric" key={item.label}>
          <div className="player-profile-metric-value" style={{ color: toneColor(item.tone) }}>{item.value}</div>
          <div className="player-profile-metric-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function ProfileInfoGrid({ rows }) {
  return (
    <div className="player-profile-info">
      {(rows || []).map((row) => (
        <div className="player-profile-info-row" key={row.label}>
          <span>{row.label}</span>
          <strong className={row.mono ? 'admin-mono' : ''}>{profileValue(row.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function ProfileTable({ columns, rows, empty = 'No rows.' }) {
  if (!rows?.length) return <div className="admin-help">{empty}</div>;
  return (
    <div className="admin-table-wrap compact player-profile-table-wrap">
      <table className="admin-table player-profile-table">
        <thead>
          <tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || row.token_id || row.task_id || row.created_at || idx}>
              {columns.map((col) => {
                const raw = typeof col.render === 'function' ? col.render(row) : row[col.key];
                return <td key={col.key} data-label={col.label}>{raw}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileSection({ title, subtitle, children }) {
  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <div>
          <div className="admin-card-title">{title}</div>
          {subtitle && <div className="admin-card-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="admin-card-body admin-grid">{children}</div>
    </div>
  );
}

function ProfileFlags({ flags }) {
  if (!flags?.length) return <div className="admin-help">No computed risk or marketing flags.</div>;
  return (
    <div className="admin-filter-row">
      {flags.map((flag) => <span key={flag.key || flag.label} className={`admin-badge ${flag.tone || 'blue'}`}>{flag.label}</span>)}
    </div>
  );
}

function BattleRiskBadges({ risk }) {
  const flags = risk?.risk_flags || [];
  if (!flags.length) return <span className="admin-badge green">clean</span>;
  return (
    <div className="admin-filter-row">
      <span className="admin-badge red">captcha_required</span>
      {flags.slice(0, 2).map((flag) => (
        <span key={flag.code || flag.label} className={`admin-badge ${flag.tone || 'red'}`}>{flag.label}</span>
      ))}
      {flags.length > 2 ? <span className="admin-badge red">+{flags.length - 2}</span> : null}
    </div>
  );
}

function battleRiskReasonText(risk) {
  const flags = risk?.risk_flags || [];
  return flags.length ? flags.map((flag) => flag.label || flag.code).join(', ') : 'clean';
}

function battleRiskShipPatternText(risk) {
  const samples = Number(risk?.ship_deploy_samples_24h || 0);
  if (!samples) return '-';
  const repeats = Number(risk?.ship_deploy_top_repeats_24h || 0);
  const ratio = Number(risk?.ship_deploy_top_ratio_24h || 0);
  return `${repeats}/${samples} (${Math.round(ratio * 100)}%)`;
}

function PlayerProfileDrawer({ player, onClose, onOpenTools }) {
  const [tab, setTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadProfile() {
    setLoading(true);
    setError('');
    try {
      const data = await adminGet(`/admin/players/${encodeURIComponent(player.id || player.name)}/profile`);
      setProfile(data);
    } catch (err) {
      setError(err.message || 'Could not load player profile');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id, player?.name]);

  const p = profile?.player || player;
  const flags = profile?.marketing?.flags || [];
  return (
    <Drawer
      title={`Player Profile - ${p?.name || player.name}`}
      subtitle={`${p?.id || player.id || '-'} - created ${profileDate(p?.created_at)}`}
      onClose={onClose}
    >
      <div className="player-profile">
        <div className="player-profile-toolbar">
          <div className="admin-filter-row">
            {p?.banned_at && <span className="admin-badge red">BANNED</span>}
            <span className={`admin-badge ${p?.online ? 'green' : 'off'}`}>{p?.online ? 'Online' : 'Offline'}</span>
            {p?.dex && <DexBadge dex={p.dex} />}
            {flags.slice(0, 4).map((flag) => <span key={flag.key} className={`admin-badge ${flag.tone || 'blue'}`}>{flag.label}</span>)}
          </div>
          <div className="admin-filter-row">
            <button className="admin-btn" onClick={loadProfile} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh profile'}</button>
            <button className="admin-btn danger" onClick={() => onOpenTools?.(p)}>Open Tools</button>
          </div>
        </div>
        <div className="player-profile-tabs">
          {PLAYER_PROFILE_TABS.map((item) => (
            <button key={item.id} className={'player-profile-tab' + (tab === item.id ? ' active' : '')} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {loading && <div className="admin-help">Loading full player profile...</div>}
        {error && <div className="admin-error">{error}</div>}
        {!loading && !error && profile && (
          <div className="player-profile-content">
            {tab === 'overview' && <PlayerProfileOverview profile={profile} />}
            {tab === 'base' && <PlayerProfileBase profile={profile} />}
            {tab === 'activity' && <PlayerProfileActivity profile={profile} />}
            {tab === 'trading' && <PlayerProfileTrading profile={profile} />}
            {tab === 'quests' && <PlayerProfileQuests profile={profile} />}
            {tab === 'nft' && <PlayerProfileNft profile={profile} />}
            {tab === 'battles' && <PlayerProfileBattles profile={profile} />}
            {tab === 'support' && <PlayerProfileSupport profile={profile} />}
            {tab === 'marketing' && <PlayerProfileMarketing profile={profile} />}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function PlayerProfileOverview({ profile }) {
  const p = profile.player || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Gold', value: num(p.resources?.gold || 0), tone: 'gold' },
        { label: 'Wood', value: num(p.resources?.wood || 0), tone: 'green' },
        { label: 'Ore', value: num(p.resources?.ore || 0), tone: 'blue' },
        { label: 'Trophies', value: num(p.trophies || 0) },
        { label: 'Trade volume', value: profileUsd(profile.overview?.total_trade_volume || 0), tone: 'green' },
        { label: 'TH', value: profile.overview?.town_hall_level || 0, tone: 'gold' },
      ]} />
      <div className="admin-grid two">
        <ProfileSection title="Identity" subtitle="Login and linked wallet summary.">
          <ProfileInfoGrid rows={[
            { label: 'Player ID', value: p.id, mono: true },
            { label: 'Name', value: p.name },
            { label: 'Primary login wallet', value: short(profile.identity?.primary_login_wallet || p.wallet), mono: true },
            { label: 'DEX', value: DEX_LABELS[p.dex] || p.dex || '-' },
            { label: 'Futures mode', value: p.futures_mode || '-' },
            { label: 'Created', value: profileDate(p.created_at) },
            { label: 'Last seen', value: profileDate(p.last_seen_at) },
            { label: 'Name changes', value: profile.identity?.name_changes_count || 0 },
            { label: 'Last name change', value: profileDate(profile.identity?.last_name_change_at) },
            { label: 'Banned at', value: profileDate(p.banned_at) },
            { label: 'Ban reason', value: p.banned_reason || '-' },
            { label: 'Shield until', value: profileDate(p.shield_until) },
          ]} />
        </ProfileSection>
        <ProfileSection title="Quick Signals" subtitle="High-signal development and support markers.">
          <ProfileFlags flags={profile.marketing?.flags || []} />
          <ProfileInfoGrid rows={[
            { label: 'Buildings', value: profile.overview?.buildings_count || 0 },
            { label: 'Linked wallets', value: profile.overview?.wallets_count || 0 },
            { label: 'DEX accounts', value: profile.overview?.dex_accounts_count || 0 },
            { label: 'Active NFTs', value: profile.overview?.active_nfts || 0 },
            { label: 'Battle wins', value: profile.overview?.battle_wins || 0 },
            { label: 'Retention score', value: profile.marketing?.retention_score ?? '-' },
          ]} />
        </ProfileSection>
      </div>
      <ProfileSection title="Nickname History" subtitle="Canonical name changes. Older player_name fields in logs are historical snapshots and are not rewritten.">
        <ProfileTable
          columns={[
            { key: 'changed_at', label: 'Changed', render: (r) => profileDate(r.changed_at) },
            { key: 'old_name', label: 'From' },
            { key: 'new_name', label: 'To' },
            { key: 'source', label: 'Source' },
            { key: 'changed_by', label: 'Changed by', render: (r) => r.changed_by ? <span className="admin-mono">{short(r.changed_by, 8, 6)}</span> : '-' },
          ]}
          rows={profile.identity?.name_history || []}
          empty="No nickname changes recorded yet."
        />
      </ProfileSection>
      <ProfileSection title="Wallets" subtitle="All linked wallets and auth identities.">
        <ProfileTable
          columns={[
            { key: 'chain_type', label: 'Chain' },
            { key: 'address', label: 'Address', render: (r) => <span className="admin-mono">{r.address}</span> },
            { key: 'label', label: 'Label' },
            { key: 'is_primary', label: 'Primary', render: (r) => Number(r.is_primary || 0) ? 'Yes' : 'No' },
            { key: 'updated_at', label: 'Updated', render: (r) => profileDate(r.updated_at) },
          ]}
          rows={profile.identity?.wallets || []}
        />
      </ProfileSection>
    </div>
  );
}

function PlayerProfileBase({ profile }) {
  const base = profile.base || {};
  const diagnostics = base.diagnostics || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Town Hall', value: base.town_hall?.level || 0, tone: 'gold' },
        { label: 'Buildings', value: base.buildings_count || 0 },
        { label: 'Ports', value: diagnostics.ports || 0, tone: 'blue' },
        { label: 'Troops', value: (base.troop_levels || []).length },
        { label: 'Altar skills', value: (base.altar_skills || []).length },
        { label: 'Duplicate cells', value: (diagnostics.duplicate_cells || []).length, tone: diagnostics.duplicate_cells?.length ? 'red' : 'green' },
      ]} />
      <ProfileSection title="Building Groups" subtitle="Current server-side base composition grouped by type and level.">
        <ProfileTable
          columns={[
            { key: 'type', label: 'Type' },
            { key: 'count', label: 'Count' },
            { key: 'max_level', label: 'Max Lv' },
            { key: 'levels', label: 'Levels', render: (r) => profileJsonPreview(r.levels) },
          ]}
          rows={base.buildings_by_type || []}
        />
      </ProfileSection>
      <div className="admin-grid two">
        <ProfileSection title="Troop Levels">
          <ProfileTable columns={[{ key: 'troop_type', label: 'Troop' }, { key: 'level', label: 'Level' }]} rows={base.troop_levels || []} />
        </ProfileSection>
        <ProfileSection title="Altar Skills">
          <ProfileTable columns={[{ key: 'skill_id', label: 'Skill' }, { key: 'level', label: 'Level' }]} rows={base.altar_skills || []} />
        </ProfileSection>
      </div>
      <ProfileSection title="Diagnostics">
        <ProfileInfoGrid rows={[
          { label: 'Missing Town Hall', value: diagnostics.missing_town_hall },
          { label: 'Empty base', value: diagnostics.empty_base },
          { label: 'Duplicate cells', value: (diagnostics.duplicate_cells || []).length },
        ]} />
      </ProfileSection>
    </div>
  );
}

function PlayerProfileActivity({ profile }) {
  const activity = profile.activity || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Estimated hours', value: activity.all_time?.estimated_hours || 0, tone: 'blue' },
        { label: 'Sessions 7d', value: activity.last_7d?.sessions || 0 },
        { label: 'Sessions 30d', value: activity.last_30d?.sessions || 0 },
        { label: 'Active days 7d', value: activity.last_7d?.active_days || 0, tone: 'green' },
        { label: 'Active days 30d', value: activity.last_30d?.active_days || 0, tone: 'green' },
        { label: 'Avg session', value: `${activity.last_30d?.avg_session_minutes || 0}m` },
      ]} />
      <ProfileSection title="Session Estimate" subtitle="Derived from activity/client heartbeat events with a 30-minute inactivity gap.">
        <ProfileInfoGrid rows={[
          { label: 'First seen', value: profileDate(activity.all_time?.first_seen) },
          { label: 'Last action', value: profileDate(activity.all_time?.last_action) },
          { label: 'All sessions', value: activity.all_time?.sessions || 0 },
          { label: 'All active days', value: activity.all_time?.active_days || 0 },
        ]} />
      </ProfileSection>
      <ProfileSection title="Recent Sessions">
        <ProfileTable
          columns={[
            { key: 'start_at', label: 'Start', render: (r) => profileDate(r.start_at) },
            { key: 'end_at', label: 'End', render: (r) => profileDate(r.end_at) },
            { key: 'minutes', label: 'Minutes' },
            { key: 'events', label: 'Events' },
          ]}
          rows={activity.all_time?.recent_sessions || []}
        />
      </ProfileSection>
      <ProfileSection title="UTC Heatmap" subtitle="Compact event distribution for the last 30 days.">
        <div className="player-profile-heatmap">
          {(activity.heatmap?.hours || []).map((h) => <span key={h.hour} title={`${h.hour}:00 UTC · ${h.events} events`} style={{ opacity: 0.25 + Math.min(0.75, h.events / 20) }}>{String(h.hour).padStart(2, '0')}</span>)}
        </div>
      </ProfileSection>
    </div>
  );
}

function PlayerProfileTrading({ profile }) {
  const trading = profile.trading || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Total volume', value: profileUsd(trading.summary?.total_volume || 0), tone: 'green' },
        { label: 'Trade gold', value: num(trading.summary?.total_gold || 0), tone: 'gold' },
        { label: 'Futures rows', value: trading.summary?.futures_trade_rows || 0 },
        { label: 'Cached rows', value: trading.summary?.cached_trade_rows || 0 },
        { label: 'Last claim', value: profileDate(trading.summary?.latest_claim_at) },
      ]} />
      <ProfileSection title="DEX Reward Rows" subtitle="Per-DEX reward cursor and claimed volume state.">
        <ProfileTable
          columns={[
            { key: 'dex', label: 'DEX', render: (r) => <DexBadge dex={r.dex} /> },
            { key: 'wallet', label: 'Wallet', render: (r) => <span className="admin-mono">{short(r.wallet)}</span> },
            { key: 'total_volume', label: 'Volume', render: (r) => profileUsd(r.total_volume) },
            { key: 'total_gold', label: 'Gold', render: (r) => num(r.total_gold || 0) },
            { key: 'last_trade_id', label: 'Cursor' },
            { key: 'last_daily', label: 'Last daily', render: (r) => profileDate(r.last_daily) },
          ]}
          rows={trading.rewards || []}
        />
      </ProfileSection>
      <ProfileSection title="Latest Futures Trades">
        <ProfileTable
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'dex', label: 'DEX' },
            { key: 'symbol', label: 'Symbol' },
            { key: 'side', label: 'Side' },
            { key: 'notional_usd', label: 'Notional', render: (r) => profileUsd(r.notional_usd) },
            { key: 'status', label: 'Status' },
            { key: 'verified_source', label: 'Source' },
            { key: 'created_at', label: 'Time', render: (r) => profileDate(r.created_at) },
          ]}
          rows={trading.latest_futures_trades || []}
        />
      </ProfileSection>
      <ProfileSection title="Trading Gaps">
        <ProfileInfoGrid rows={[
          { label: 'Trades exist without gold', value: trading.suspicious?.trades_exist_without_gold },
          { label: 'Futures volume > reward volume', value: trading.suspicious?.futures_volume_without_rewards },
          { label: 'Reward cursor sum', value: trading.suspicious?.reward_trade_cursor_sum || 0 },
        ]} />
      </ProfileSection>
    </div>
  );
}

function PlayerProfileQuests({ profile }) {
  const quests = profile.quests || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Attempts', value: quests.summary?.attempts || 0 },
        { label: 'Claimed', value: quests.summary?.claimed || 0, tone: 'green' },
        { label: 'Failed', value: quests.summary?.failed || 0, tone: quests.summary?.failed ? 'red' : 'green' },
        { label: 'Last attempt', value: profileDate(quests.summary?.last_attempt_at) },
      ]} />
      <ProfileSection title="Current Task Progress">
        <ProfileTable
          columns={[
            { key: 'task_id', label: 'Task' },
            { key: 'title', label: 'Title' },
            { key: 'progress_value', label: 'Progress' },
            { key: 'target_value', label: 'Target' },
            { key: 'repeatable', label: 'Repeat', render: (r) => Number(r.repeatable || 0) ? 'Yes' : 'No' },
            { key: 'claimed_at', label: 'Claimed', render: (r) => profileDate(r.claimed_at) },
          ]}
          rows={quests.current || []}
        />
      </ProfileSection>
      <ProfileSection title="Claim Events">
        <ProfileTable
          columns={[
            { key: 'task_id', label: 'Task' },
            { key: 'task_title', label: 'Title' },
            { key: 'result', label: 'Result' },
            { key: 'progress_value', label: 'Progress' },
            { key: 'reward_gold', label: 'Gold' },
            { key: 'error_reason', label: 'Reason' },
            { key: 'created_at', label: 'Time', render: (r) => profileDate(r.created_at) },
          ]}
          rows={quests.claims || []}
        />
      </ProfileSection>
    </div>
  );
}

function PlayerProfileNft({ profile }) {
  const nft = profile.nft || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Active NFTs', value: nft.summary?.active || 0 },
        { label: 'Demon King', value: nft.summary?.demon_king || 0, tone: 'purple' },
        { label: 'Dragon', value: nft.summary?.dragon || 0, tone: 'gold' },
      ]} />
      <ProfileSection title="NFT Ownership Cache" subtitle="Active server cache by linked wallets.">
        <ProfileTable
          columns={[
            { key: 'collection', label: 'Collection' },
            { key: 'chain', label: 'Chain' },
            { key: 'token_id', label: 'Token', render: (r) => <span className="admin-mono">{short(r.token_id, 8, 6)}</span> },
            { key: 'wallet', label: 'Wallet', render: (r) => <span className="admin-mono">{short(r.wallet)}</span> },
            { key: 'level', label: 'Level' },
            { key: 'active', label: 'Active', render: (r) => Number(r.active || 0) ? 'Yes' : 'No' },
            { key: 'source', label: 'Source' },
            { key: 'updated_at', label: 'Updated', render: (r) => profileDate(r.updated_at) },
          ]}
          rows={nft.items || []}
        />
      </ProfileSection>
    </div>
  );
}

function PlayerProfileBattles({ profile }) {
  const battles = profile.battles || {};
  const risk = battles.risk || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Total', value: battles.summary?.total || 0 },
        { label: 'Attacks', value: battles.summary?.attacks || 0 },
        { label: 'Defenses', value: battles.summary?.defenses || 0 },
        { label: 'Wins', value: battles.summary?.attack_wins || 0, tone: 'green' },
        { label: 'Rejected', value: battles.summary?.rejected || 0, tone: battles.summary?.rejected ? 'red' : 'green' },
        { label: 'Captcha flag', value: risk.captcha_required ? 'YES' : 'No', tone: risk.captcha_required ? 'red' : 'green' },
      ]} />
      <ProfileSection title="Battle Risk" subtitle="Red flag means this account should be gated by CAPTCHA before future prize eligibility. Gameplay CAPTCHA is not enabled here.">
        <BattleRiskBadges risk={risk} />
        <ProfileInfoGrid rows={[
          { label: 'Attack starts 15m', value: risk.attack_starts_15m || 0 },
          { label: 'Attack starts 24h', value: risk.attack_starts_24h || 0 },
          { label: 'Submitted results 24h', value: risk.submitted_results_24h || 0 },
          { label: 'Accepted wins 24h', value: risk.accepted_wins_24h || 0 },
          { label: 'Rejected results 24h', value: risk.rejected_results_24h || 0 },
          { label: 'Latest IP', value: risk.last_ip || '-' },
          { label: 'Shared IP players 24h', value: risk.ip_players_24h || 0 },
          { label: 'Ship pattern 24h', value: battleRiskShipPatternText(risk) },
          { label: 'Ship pattern variants', value: risk.ship_deploy_distinct_patterns_24h || 0 },
          { label: 'Top ship coords', value: risk.ship_deploy_top_coords || '-' },
          { label: 'Reasons', value: battleRiskReasonText(risk) },
        ]} />
      </ProfileSection>
      <ProfileSection title="Recent Replays">
        <ProfileTable
          columns={[
            { key: 'id', label: 'Replay' },
            { key: 'role', label: 'Role' },
            { key: 'claimed_result', label: 'Claimed' },
            { key: 'verified_result', label: 'Verified' },
            { key: 'verification_reason', label: 'Reason' },
            { key: 'loot_gold', label: 'Gold' },
            { key: 'created_at', label: 'Time', render: (r) => profileDate(r.created_at) },
          ]}
          rows={battles.replays || []}
        />
      </ProfileSection>
      <ProfileSection title="Battle Sessions">
        <ProfileTable
          columns={[
            { key: 'id', label: 'Session', render: (r) => <span className="admin-mono">{short(r.id, 8, 6)}</span> },
            { key: 'role', label: 'Role' },
            { key: 'status', label: 'Status' },
            { key: 'surrendered_at', label: 'Surrender', render: (r) => profileDate(r.surrendered_at) },
            { key: 'created_at', label: 'Created', render: (r) => profileDate(r.created_at) },
          ]}
          rows={battles.sessions || []}
        />
      </ProfileSection>
    </div>
  );
}

function PlayerProfileSupport({ profile }) {
  const support = profile.support || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Errors 24h', value: support.stats?.recent_errors_24h || 0, tone: support.stats?.recent_errors_24h ? 'red' : 'green' },
        { label: 'Errors 7d', value: support.stats?.recent_errors_7d || 0, tone: support.stats?.recent_errors_7d ? 'red' : 'green' },
        { label: 'Open feedback', value: support.stats?.feedback_open || 0, tone: support.stats?.feedback_open ? 'gold' : 'green' },
      ]} />
      <ProfileSection title="Device / Page Context">
        <ProfileInfoGrid rows={[
          { label: 'Latest URL', value: support.stats?.latest_url },
          { label: 'Latest UA', value: support.stats?.latest_ua },
        ]} />
      </ProfileSection>
      <ProfileSection title="Latest Client Logs">
        <ProfileTable
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'level', label: 'Level' },
            { key: 'source', label: 'Source' },
            { key: 'message', label: 'Message' },
            { key: 'url', label: 'URL' },
            { key: 'created_at', label: 'Time', render: (r) => profileDate(r.created_at) },
          ]}
          rows={support.client_logs || []}
        />
      </ProfileSection>
      <ProfileSection title="Feedback Reports">
        <ProfileTable
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'kind', label: 'Kind' },
            { key: 'status', label: 'Status' },
            { key: 'message', label: 'Message' },
            { key: 'contact_type', label: 'Contact' },
            { key: 'created_at', label: 'Time', render: (r) => profileDate(r.created_at) },
          ]}
          rows={support.feedback || []}
        />
      </ProfileSection>
    </div>
  );
}

function PlayerProfileMarketing({ profile }) {
  const m = profile.marketing || {};
  return (
    <div className="admin-grid">
      <ProfileMetricGrid items={[
        { label: 'Account age', value: m.account_age_days == null ? '-' : `${m.account_age_days}d` },
        { label: 'Retention', value: `${m.retention_score || 0}/100`, tone: 'blue' },
        { label: 'Value', value: m.value_segment || '-' },
        { label: 'NFT segment', value: m.nft_holder_segment || '-' },
        { label: 'Trader', value: m.trader_segment || '-' },
      ]} />
      <ProfileSection title="Marketing Segments">
        <ProfileFlags flags={m.flags || []} />
        <ProfileInfoGrid rows={[
          { label: 'Acquisition wallet type', value: m.acquisition_wallet_type },
          { label: 'Acquisition DEX', value: m.acquisition_dex },
          { label: 'Value segment', value: m.value_segment },
          { label: 'NFT holder segment', value: m.nft_holder_segment },
          { label: 'Trader segment', value: m.trader_segment },
        ]} />
      </ProfileSection>
    </div>
  );
}

function PlayerToolsDrawer({ player, onClose, reload }) {
  const [resource, setResource] = useState({ gold: 5000, wood: 5000, ore: 5000 });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [godModeEnabled, setGodModeEnabled] = useState(!!(player.god_mode_enabled || player.god_mode_access?.enabled));
  const playerKey = encodeURIComponent(player.id || player.name);
  const playerIsBanned = !!player.banned_at;

  useEffect(() => {
    setGodModeEnabled(!!(player.god_mode_enabled || player.god_mode_access?.enabled));
  }, [player.god_mode_access?.enabled, player.god_mode_enabled, player.id]);

  async function run(label, fn) {
    if (busy) return;
    setBusy(label);
    setMessage('');
    try {
      const data = await fn();
      setMessage(data?.ok === false ? 'Request returned an error state.' : `${label} complete.`);
      await reload();
    } catch (err) {
      setMessage(err.message || 'Action failed');
    } finally {
      setBusy('');
    }
  }

  function banAccount() {
    const reason = window.prompt(`Ban reason for ${player.name}`, 'Suspicious reward wallet abuse');
    if (reason === null) return;
    const blacklistWallets = window.confirm(`Also blacklist all linked wallets for ${player.name}?`);
    run('Ban account', () => adminPost(`/admin/players/${playerKey}/ban`, {
      reason: reason.trim() || 'admin ban',
      blacklist_wallets: blacklistWallets,
    }));
  }

  function unbanAccount() {
    if (!window.confirm(`Unban ${player.name}? Wallet blacklist entries will stay unchanged.`)) return;
    run('Unban account', () => adminPost(`/admin/players/${playerKey}/unban`, {}));
  }

  function setGodModeAccess(enabled) {
    if (!enabled && !window.confirm(`Revoke God Mode Studio access for ${player.name}? Their open Studio session will be blocked on revalidation.`)) return;
    run(enabled ? 'Grant God Mode' : 'Revoke God Mode', async () => {
      const data = await adminPost(`/admin/players/${playerKey}/god-mode-access`, {
        enabled,
        note: enabled ? 'admin ui grant' : 'admin ui revoke',
      });
      setGodModeEnabled(!!data?.access?.enabled);
      return data;
    });
  }

  return (
    <Drawer title={`Player Tools · ${player.name}`} subtitle={`Created ${fmtTime(player.created_at)}. Dangerous actions are grouped here so the main table stays readable.`} onClose={onClose}>
      <div className="admin-grid">
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-card-title">God Mode Studio</div>
              <div className="admin-card-sub">Server-gated access to the isolated /godmodegg creator sandbox. This grant does not change the live village or economy.</div>
            </div>
            <span className={'admin-badge ' + (godModeEnabled ? 'gold' : 'off')}>{godModeEnabled ? 'GOD MODE' : 'OFF'}</span>
          </div>
          <div className="admin-card-body admin-grid">
            <div className="admin-help">
              {godModeEnabled
                ? `Enabled${player.god_mode_access?.updated_at ? ` · updated ${fmtTime(player.god_mode_access.updated_at)}` : ''}. Access is revalidated while the Studio is open.`
                : 'No Studio access. Nothing is granted until an admin enables it here.'}
            </div>
            <div className="admin-filter-row">
              <button
                className={'admin-btn ' + (godModeEnabled ? 'danger' : 'green')}
                type="button"
                disabled={!!busy}
                onClick={() => setGodModeAccess(!godModeEnabled)}
              >
                {busy === 'Grant God Mode' || busy === 'Revoke God Mode' ? 'Saving...' : godModeEnabled ? 'Revoke access' : 'Grant access'}
              </button>
              <a className="admin-btn" href="/godmodegg" target="_blank" rel="noreferrer">Open /godmodegg</a>
            </div>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Resources</div><div className="admin-card-sub">Apply exact amounts to this account.</div></div></div>
          <div className="admin-card-body admin-grid">
            <div className="admin-form-grid three">
              {['gold', 'wood', 'ore'].map((kind) => (
                <label className="admin-field" key={kind}>
                  <span className="admin-label">{kind.toUpperCase()}</span>
                  <input className="admin-input" type="number" value={resource[kind]} onChange={(e) => setResource((r) => ({ ...r, [kind]: Number(e.target.value) || 0 }))} />
                </label>
              ))}
            </div>
            <button className="admin-btn primary" onClick={() => run('Add resources', () => adminPost(`/admin/players/${encodeURIComponent(player.name)}/add-resources`, resource))}>Add resources</button>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Trophies</div><div className="admin-card-sub">Quick seasonal adjustments.</div></div></div>
          <div className="admin-card-body admin-filter-row">
            {[-500, -100, -10, 10, 100, 500].map((delta) => (
              <button className="admin-btn" key={delta} onClick={() => run(`Trophies ${delta > 0 ? '+' : ''}${delta}`, () => adminPost(`/admin/players/${encodeURIComponent(player.name)}/trophies`, { delta }))}>
                {delta > 0 ? '+' : ''}{delta}
              </button>
            ))}
            <button className="admin-btn danger" onClick={() => window.confirm(`Reset trophies for ${player.name}?`) && run('Reset trophies', () => adminPost(`/admin/players/${encodeURIComponent(player.name)}/reset-trophies`, {}))}>Reset to 0</button>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Village Presets</div><div className="admin-card-sub">Server-side building tools with auto placement.</div></div></div>
          <div className="admin-card-body admin-filter-row">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
              <button className="admin-btn" key={level} onClick={() => run(`Max village TH${level}`, () => adminPost(`/admin/players/${encodeURIComponent(player.name)}/max-village`, { town_hall_level: level }))}>TH {level}</button>
            ))}
            <button className="admin-btn green" onClick={() => run('Max everything', async () => {
              await adminPost(`/admin/players/${encodeURIComponent(player.name)}/max-village`, { town_hall_level: 10 });
              return adminPost(`/admin/players/${encodeURIComponent(player.name)}/add-resources`, { gold: 999999999, wood: 999999999, ore: 999999999 });
            })}>Max everything</button>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Moderation</div><div className="admin-card-sub">Soft-ban account access without deleting audit history.</div></div></div>
          <div className="admin-card-body admin-grid">
            {playerIsBanned ? (
              <div className="admin-help">Banned {fmtTime(player.banned_at)}{player.banned_reason ? ` - ${player.banned_reason}` : ''}</div>
            ) : (
              <div className="admin-help">Account is currently allowed to log in.</div>
            )}
            <div className="admin-filter-row">
              {playerIsBanned ? (
                <button className="admin-btn" onClick={unbanAccount}>Unban account</button>
              ) : (
                <button className="admin-btn danger" onClick={banAccount}>Ban account</button>
              )}
            </div>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Account Reset</div><div className="admin-card-sub">Use only when support or testing requires it.</div></div></div>
          <div className="admin-card-body admin-filter-row">
            <button className="admin-btn danger" onClick={() => window.confirm(`Reset account ${player.name}?`) && run('Reset player', () => adminPost(`/admin/players/${encodeURIComponent(player.name)}/reset`, {}))}>Reset account</button>
            <button className="admin-btn danger" onClick={() => window.confirm(`Delete player ${player.name}?`) && run('Delete player', () => adminDelete(`/admin/players/${encodeURIComponent(player.name)}`))}>Delete player</button>
          </div>
        </div>
        {(busy || message) && <div className={message?.toLowerCase().includes('fail') || message?.toLowerCase().includes('error') ? 'admin-error' : 'admin-help'}>{busy || message}</div>}
      </div>
    </Drawer>
  );
}

function TournamentsPanel({ tournaments, reload }) {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('tournaments');
  const [editing, setEditing] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [payoutsData, setPayoutsData] = useState(null);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const luckyEvents = tournaments.filter((t) => t.event_kind === 'lucky_raider');
  const normalEvents = tournaments.filter((t) => t.event_kind !== 'lucky_raider');
  const visibleEvents = viewMode === 'lucky_raider' ? luckyEvents : normalEvents;
  const filtered = visibleEvents.filter((t) => `${t.name || ''} ${t.id} ${t.dex || ''} ${t.status || ''}`.toLowerCase().includes(query.toLowerCase()));
  const active = tournaments.filter((t) => t.status === 'active' && !t.paused_at).length;
  const paused = tournaments.filter((t) => t.status === 'active' && !!t.paused_at).length;
  const draft = tournaments.filter((t) => t.status === 'draft').length;
  const ended = tournaments.filter((t) => t.status === 'ended').length;

  async function forceEnd(id) {
    if (!window.confirm(`Force-end tournament #${id}?`)) return;
    await adminPost(`/admin/tournaments/${id}/end`, {});
    await reload();
  }

  async function pauseTournament(tournament) {
    if (!window.confirm(`Pause tournament #${tournament.id} ${tournament.name}? Scoring and registrations will stop.`)) return;
    await adminPost(`/admin/tournaments/${tournament.id}/pause`, { reason: 'Temporarily paused by tournament admin' });
    await reload();
  }

  async function resumeTournament(tournament) {
    if (!window.confirm(`Resume tournament #${tournament.id} ${tournament.name}?`)) return;
    await adminPost(`/admin/tournaments/${tournament.id}/resume`, {});
    await reload();
  }

  async function deleteTournament(id) {
    if (!window.confirm(`Delete tournament #${id} and participant rows?`)) return;
    await adminDelete(`/admin/tournaments/${id}`);
    await reload();
  }

  async function openLeaderboard(tournament) {
    const data = await adminGet(`/tournaments/${tournament.id}/leaderboard?limit=100`);
    setLeaderboard(data);
  }

  async function loadLuckyPayouts() {
    setPayoutsLoading(true);
    try {
      const data = await adminGet('/admin/lucky-raider/payouts?status=all&limit=200');
      setPayoutsData(data);
    } finally {
      setPayoutsLoading(false);
    }
  }

  useEffect(() => {
    if (viewMode !== 'lucky_raider') return;
    loadLuckyPayouts().catch(() => {});
  }, [viewMode]);

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Tournaments', value: tournaments.length },
        { label: 'Lucky Raiders', value: luckyEvents.length, tone: 'blue' },
        { label: 'Active', value: active, tone: 'green' },
        { label: 'Paused', value: paused, tone: 'gold' },
        { label: 'Draft', value: draft, tone: 'gold' },
        { label: 'Ended', value: ended },
      ]} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">{viewMode === 'lucky_raider' ? 'Daily Lucky Raider Control' : 'Tournament Control'}</div>
            <div className="admin-card-sub">
              {viewMode === 'lucky_raider'
                ? 'Standalone daily raid lottery: tickets, winners, history, and rewards without a tournament leaderboard.'
                : 'Creation and editing uses a step wizard: schedule, eligibility, scoring, rewards, review.'}
            </div>
          </div>
          <div className="admin-actions">
            <button className={'admin-btn ' + (viewMode === 'tournaments' ? 'primary' : '')} onClick={() => setViewMode('tournaments')}>Tournaments</button>
            <button className={'admin-btn ' + (viewMode === 'lucky_raider' ? 'primary' : '')} onClick={() => setViewMode('lucky_raider')}>Daily Lucky Raider</button>
            {viewMode === 'lucky_raider'
              ? <button className="admin-btn green" onClick={() => setEditing(emptyLuckyRaiderEvent())}>Create Daily Lucky Raider</button>
              : <button className="admin-btn primary" onClick={() => setEditing(emptyTournament())}>Create tournament</button>}
          </div>
        </div>
        <div className="admin-card-body">
          {viewMode === 'lucky_raider' && (
            <div className="admin-card subtle" style={{ marginBottom: 12 }}>
              <div className="admin-card-head">
                <div>
                  <div className="admin-card-title">Lucky Daily Raider</div>
                  <div className="admin-card-sub">Use this for the daily “raid and win money” mechanic: tickets from winning attacks or volume, max tickets per day, editable prize places and history.</div>
                </div>
                <button className="admin-btn green" onClick={() => setEditing(emptyLuckyRaiderEvent())}>Create standalone Lucky Raider</button>
              </div>
            </div>
          )}
          {viewMode === 'lucky_raider' && (
            <LuckyRaiderPayoutCard
              data={payoutsData}
              loading={payoutsLoading}
              reload={loadLuckyPayouts}
            />
          )}
          <div className="admin-toolbar">
            <input className="admin-input" placeholder={viewMode === 'lucky_raider' ? 'Search lucky raider events' : 'Search tournaments'} value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="admin-help">{filtered.length} shown</span>
          </div>
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th><th>Name</th><th>DEX</th><th>Mode</th><th>Requirements</th><th>Phase</th><th>Players</th><th>Window</th><th>Prize</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="admin-mono">#{t.id}</td>
                    <td><strong>{t.name}</strong><div className="admin-card-sub">{t.description}</div></td>
                    <td>{t.dex_scope === 'all' ? <span className="admin-badge gold">All DEXes</span> : <DexBadge dex={t.dex} />}</td>
                    <td>
                      {t.event_kind === 'lucky_raider'
                        ? 'Lucky Raider'
                        : t.is_ranked_raid || t.battle_mode === 'ranked_raids'
                          ? 'Ranked raids'
                          : t.mode === 'dex_vs_dex'
                            ? 'DEX vs DEX'
                            : 'Individual'}
                    </td>
                    <td>
                      {(() => {
                        const luckyMinTh = t.event_kind === 'lucky_raider'
                          ? normalizeRewardConfig(t.reward_config || {}).lucky_daily_raider.min_town_hall_level
                          : 0;
                        const minTh = Number(luckyMinTh || t.min_town_hall_level || 0);
                        return minTh > 0 ? <span className="admin-badge gold">TH {minTh}+</span> : <span className="admin-card-sub">Any TH</span>;
                      })()}
                    </td>
                    <td>
                      <span className={'admin-badge ' + (t.phase === 'paused' ? 'gold' : t.status === 'active' ? 'green' : t.status === 'draft' ? 'gold' : 'off')}>{t.phase || t.status}</span>
                      {t.paused_at && <div className="admin-card-sub">Since {fmtTime(t.paused_at)}</div>}
                    </td>
                    <td>{t.participants || 0}<div className="admin-card-sub">{t.registered || 0} registered</div></td>
                    <td className="admin-mono">{fmtTime(t.start_at)}<br />{fmtTime(t.end_at)}</td>
                    <td><PrizeSummary tournament={t} /></td>
                    <td>
                      <div className="admin-filter-row">
                        <button className="admin-btn" onClick={() => setEditing(tournamentToForm(t))}>Edit</button>
                        <button className="admin-btn" onClick={() => openLeaderboard(t)}>Leaderboard</button>
                        {t.status === 'active' && !t.paused_at && <button className="admin-btn" onClick={() => pauseTournament(t)}>Pause</button>}
                        {t.status === 'active' && !!t.paused_at && <button className="admin-btn green" onClick={() => resumeTournament(t)}>Resume</button>}
                        {t.status !== 'ended' && <button className="admin-btn danger" onClick={() => forceEnd(t.id)}>End</button>}
                        <button className="admin-btn danger" onClick={() => deleteTournament(t.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {editing && <TournamentWizard initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
      {leaderboard && <LeaderboardDrawer data={leaderboard} onClose={() => setLeaderboard(null)} />}
    </div>
  );
}

function LuckyRaiderPayoutCard({ data, loading, reload }) {
  const settings = data?.settings || {};
  const config = data?.config || {};
  const summary = data?.summary || {};
  const payouts = data?.payouts || [];
  const pendingCount = Number(summary.by_status?.pending?.count || 0);
  const failedCount = Number(summary.by_status?.failed?.count || 0);
  const paidCount = Number(summary.by_status?.paid?.count || 0);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [draft, setDraft] = useState({
    auto_payout_enabled: false,
    manual_payout_enabled: true,
    wallet_link_required: true,
    max_batch_size: 10,
    max_attempts: 5,
    retry_seconds: 300,
  });

  useEffect(() => {
    if (!data?.settings) return;
    setDraft({
      auto_payout_enabled: !!settings.auto_payout_enabled,
      manual_payout_enabled: !!settings.manual_payout_enabled,
      wallet_link_required: settings.wallet_link_required !== false,
      max_batch_size: Number(settings.max_batch_size || 10),
      max_attempts: Number(settings.max_attempts || 5),
      retry_seconds: Number(settings.retry_seconds || 300),
    });
  }, [data?.settings, settings.auto_payout_enabled, settings.manual_payout_enabled, settings.wallet_link_required, settings.max_batch_size, settings.max_attempts, settings.retry_seconds]);

  async function runPayoutAction(label, fn) {
    if (busy) return;
    setBusy(label);
    setMessage('');
    try {
      const result = await fn();
      setMessage(result?.message || `${label} complete.`);
      await reload();
    } catch (err) {
      setMessage(err.message || `${label} failed.`);
    } finally {
      setBusy('');
    }
  }

  async function saveSettings() {
    await runPayoutAction('Save payout settings', async () => {
      const result = await adminPost('/admin/lucky-raider/payouts/settings', draft);
      return { message: `Payout settings saved. Auto ${result.settings?.auto_payout_enabled ? 'on' : 'off'}, wallet check ${result.settings?.wallet_link_required ? 'on' : 'off'}.` };
    });
  }

  async function previewPending(ids = []) {
    await runPayoutAction('Preview payouts', async () => {
      const result = await adminPost('/admin/lucky-raider/payouts/preview', {
        limit: draft.max_batch_size,
        max_attempts: draft.max_attempts,
        retry_seconds: draft.retry_seconds,
        ids,
      });
      setPreview(result);
      return { message: `Preview: ${result.sendable || 0} sendable, ${result.blocked || 0} blocked.` };
    });
  }

  async function payPending(ids = []) {
    const confirmPhrase = data?.confirm_phrase || 'PAY_LUCKY_RAIDER_CLASH';
    const scope = ids.length ? `${ids.length} selected payout` : `${pendingCount + failedCount} pending/failed payout`;
    if (!config.manualEnabled) {
      setMessage('Manual Lucky Raider payouts are disabled.');
      return;
    }
    if ((pendingCount + failedCount) <= 0 && ids.length === 0) {
      setMessage('No pending or failed Lucky Raider payouts to send.');
      return;
    }
    if (!window.confirm(`Send CLASH rewards for ${scope}? This signs real Solana token transfers.`)) {
      setMessage('Lucky Raider payout cancelled before sending.');
      return;
    }
    const typed = window.prompt(`Type ${confirmPhrase} to confirm real payout`, '');
    if (typed == null) {
      setMessage(`Lucky Raider payout not sent. Type ${confirmPhrase} to confirm.`);
      return;
    }
    if (typed.trim() !== confirmPhrase) {
      setMessage(`Confirmation mismatch. Expected ${confirmPhrase}; no payout sent.`);
      return;
    }
    await runPayoutAction('Pay Lucky Raider', async () => {
      const result = await adminPost('/admin/lucky-raider/payouts/run', {
        confirm: confirmPhrase,
        limit: draft.max_batch_size,
        max_attempts: draft.max_attempts,
        retry_seconds: draft.retry_seconds,
        ids,
      });
      if (result.skipped || result.reason) {
        return { message: `Payout skipped: ${result.reason || 'unknown reason'}.` };
      }
      const failedReasons = (result.results || [])
        .filter((row) => row?.ok === false && row?.error)
        .slice(0, 2)
        .map((row) => row.error)
        .join('; ');
      const suffix = failedReasons ? ` ${failedReasons}` : '';
      return { message: `Payout run: ${result.paid || 0} paid, ${result.failed || 0} failed, ${result.processed || 0} processed.${suffix}` };
    });
  }

  async function updateWallet(payout) {
    const next = window.prompt(`Solana payout wallet for ${payout.player_name || payout.player_id}`, payout.destination_wallet || payout.current_destination_wallet || '');
    if (next == null) return;
    const note = window.prompt('Audit note for wallet update', 'admin payout wallet correction') || '';
    await runPayoutAction('Update payout wallet', async () => {
      const result = await adminPatch(`/admin/lucky-raider/payouts/${encodeURIComponent(payout.id)}/destination`, { wallet: next, note });
      return { message: `Wallet updated for ${result.payout?.player_name || payout.player_name || payout.player_id}.` };
    });
  }

  const statusText = [
    config.payoutsEnabled ? 'env enabled' : 'env disabled',
    config.autoEnabled ? 'auto on' : 'auto off',
    config.manualEnabled ? 'manual on' : 'manual off',
    config.signerReady ? `signer ${short(config.signerAddress, 8, 5)}` : 'signer missing',
    config.clashMint ? `mint ${short(config.clashMint, 8, 5)}` : 'mint missing',
  ].join(' | ');

  return (
    <div className="admin-card subtle" style={{ marginBottom: 12 }}>
      <div className="admin-card-head">
        <div>
          <div className="admin-card-title">CLASH Reward Payouts</div>
          <div className="admin-card-sub">{statusText}{config.signerSource ? ` | key ${config.signerSource}` : ''}</div>
        </div>
        <div className="admin-filter-row">
          {message ? <span className={'admin-badge ' + (message.toLowerCase().includes('failed') ? 'red' : 'green')}>{message}</span> : null}
          <button className="admin-btn" onClick={reload} disabled={loading || !!busy}>{loading ? 'Loading...' : 'Reload'}</button>
          <button className="admin-btn" onClick={() => previewPending()} disabled={!!busy}>{busy === 'Preview payouts' ? 'Previewing...' : 'Preview pending'}</button>
          <button className="admin-btn green" onClick={() => payPending()} disabled={!!busy || !config.manualEnabled || (pendingCount + failedCount) <= 0}>Pay pending</button>
        </div>
      </div>
      <div className="admin-card-body admin-grid">
        <StatsGrid stats={[
          { label: 'Pending', value: num(pendingCount), tone: pendingCount ? 'gold' : 'green' },
          { label: 'Failed', value: num(failedCount), tone: failedCount ? 'red' : 'green' },
          { label: 'Paid', value: num(paidCount), tone: 'green' },
          { label: 'Reward USD', value: fmtMaybeUsd(summary.reward_usd || 0), tone: 'blue' },
        ]} />
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Auto payout after draw</span><select className="admin-select" value={draft.auto_payout_enabled ? '1' : '0'} onChange={(e) => setDraft((v) => ({ ...v, auto_payout_enabled: e.target.value === '1' }))}><option value="0">Off</option><option value="1">On</option></select></label>
          <label className="admin-field"><span className="admin-label">Manual payout button</span><select className="admin-select" value={draft.manual_payout_enabled ? '1' : '0'} onChange={(e) => setDraft((v) => ({ ...v, manual_payout_enabled: e.target.value === '1' }))}><option value="0">Off</option><option value="1">On</option></select></label>
          <label className="admin-field"><span className="admin-label">Require linked wallet</span><select className="admin-select" value={draft.wallet_link_required ? '1' : '0'} onChange={(e) => setDraft((v) => ({ ...v, wallet_link_required: e.target.value === '1' }))}><option value="1">On</option><option value="0">Off</option></select></label>
          <label className="admin-field"><span className="admin-label">Batch size</span><input className="admin-input" type="number" min="1" max="100" value={draft.max_batch_size} onChange={(e) => setDraft((v) => ({ ...v, max_batch_size: Number(e.target.value || 1) }))} /></label>
          <label className="admin-field"><span className="admin-label">Max attempts</span><input className="admin-input" type="number" min="1" max="50" value={draft.max_attempts} onChange={(e) => setDraft((v) => ({ ...v, max_attempts: Number(e.target.value || 1) }))} /></label>
          <label className="admin-field"><span className="admin-label">Retry seconds</span><input className="admin-input" type="number" min="0" max="86400" value={draft.retry_seconds} onChange={(e) => setDraft((v) => ({ ...v, retry_seconds: Number(e.target.value || 0) }))} /></label>
        </div>
        <div className="admin-filter-row">
          <button className="admin-btn primary" onClick={saveSettings} disabled={!!busy}>{busy === 'Save payout settings' ? 'Saving...' : 'Save payout settings'}</button>
          <span className="admin-help">Auto payout only runs when this switch is on and the env kill switch allows payouts. Manual sends require typed confirmation.</span>
        </div>
        {preview && (
          <CompactTable
            title="Latest Payout Preview"
            subtitle={`${preview.sendable || 0} sendable, ${preview.blocked || 0} blocked. No transaction was signed.`}
            columns={['Player', 'Day', 'Reward', 'Wallet', 'CLASH', 'Status']}
            rows={(preview.payouts || []).map((row) => [
              row.player_name || row.player_id,
              row.day_utc,
              fmtMaybeUsd(row.reward_amount_usd),
              <span className="admin-mono">{short(row.destination_wallet, 12, 8)}</span>,
              row.quote_ok ? `${num(row.clash_amount)} CLASH` : '-',
              row.quote_ok
                ? <span>{row.validation_warnings?.length ? <span className="admin-badge gold">ready with warning</span> : <span className="admin-badge green">ready</span>}</span>
                : <span className="admin-badge red">{(row.quote_error || row.validation_errors?.[0] || 'blocked').slice(0, 40)}</span>,
            ])}
          />
        )}
        <div className="admin-table-wrap compact admin-scroll">
          <table className="admin-table">
            <thead><tr><th>Created</th><th>Player</th><th>Draw</th><th>Reward</th><th>Wallet</th><th>Checks</th><th>Status</th><th>Tx / Error</th><th>Actions</th></tr></thead>
            <tbody>
              {payouts.length ? payouts.map((payout) => (
                <tr key={payout.id}>
                  <td>{fmtTime(payout.created_at)}<div className="admin-card-sub admin-mono">{short(payout.id, 14, 5)}</div></td>
                  <td><strong>{payout.player_name || '-'}</strong><div className="admin-card-sub admin-mono">{payout.player_id}</div></td>
                  <td>{payout.day_utc}<div className="admin-card-sub">#{payout.place} | {payout.tournament_name || `T${payout.tournament_id}`}</div></td>
                  <td>{fmtMaybeUsd(payout.reward_amount_usd)}<div className="admin-card-sub">{payout.reward_label || payout.reward_currency}</div></td>
                  <td className="admin-mono">{short(payout.destination_wallet || payout.current_destination_wallet, 14, 8)}</td>
                  <td>
                    {payout.wallet_valid ? <span className="admin-badge green">valid</span> : <span className="admin-badge red">invalid</span>}
                    {' '}
                    {payout.wallet_linked ? <span className="admin-badge green">linked</span> : <span className="admin-badge gold">not linked warning</span>}
                  </td>
                  <td>{statusBadge(payout.status)}<div className="admin-card-sub">attempts {payout.attempts || 0}</div></td>
                  <td>{payout.tx_hash ? <span className="admin-mono">{short(payout.tx_hash, 12, 8)}</span> : <span className="admin-card-sub">{(payout.error || payout.validation_errors?.join(', ') || payout.validation_warnings?.join(', ') || '-').slice(0, 120)}</span>}</td>
                  <td><div className="admin-filter-row">
                    {['pending', 'failed'].includes(payout.status) && <button className="admin-btn" onClick={() => updateWallet(payout)} disabled={!!busy}>Wallet</button>}
                    {['pending', 'failed'].includes(payout.status) && <button className="admin-btn" onClick={() => previewPending([payout.id])} disabled={!!busy}>Preview</button>}
                    {['pending', 'failed'].includes(payout.status) && <button className="admin-btn green" onClick={() => payPending([payout.id])} disabled={!!busy || !config.manualEnabled}>Pay</button>}
                  </div></td>
                </tr>
              )) : <tr><td colSpan={9}><span className="admin-help">No Lucky Raider CLASH payouts yet.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TournamentWizard({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() => tournamentToForm(initial));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(!initial?.id);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const isEdit = !!initial?.id;
  const isLuckyRaider = form.event_kind === 'lucky_raider';
  const steps = isLuckyRaider
    ? [
        { label: 'Schedule', validate: 0, hint: 'Event window' },
        { label: 'Lucky Raider', validate: 3, hint: 'Tickets and prizes' },
        { label: 'Review', validate: 4, hint: 'Final check' },
      ]
    : [
        { label: 'Schedule', validate: 0, hint: wizardHint(0) },
        { label: 'Eligibility', validate: 1, hint: wizardHint(1) },
        { label: 'Scoring', validate: 2, hint: wizardHint(2) },
        { label: 'Rewards', validate: 3, hint: wizardHint(3) },
        { label: 'Review', validate: 4, hint: wizardHint(4) },
      ];

  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function next() {
    const errors = validateTournamentStep(steps[step]?.validate ?? step, form);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setError('');
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  async function planWithAi() {
    const prompt = aiPrompt.trim();
    if (prompt.length < 8) {
      setError('Describe the tournament for AI in at least 8 characters.');
      return;
    }
    setAiPlanning(true);
    setError('');
    setAiResult(null);
    try {
      const result = await adminPost('/admin/tournaments/ai/plan', {
        prompt,
        current_draft: formToTournamentBody(form),
      });
      if (!result?.draft || typeof result.draft !== 'object') throw new Error('AI returned no tournament draft');
      setForm((previous) => tournamentToForm({
        ...formToTournamentBody(previous),
        ...result.draft,
        status: previous.status,
      }));
      setAiResult({
        model: result.model || '',
        summary: result.summary || 'Tournament draft applied.',
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      });
      setStep(0);
    } catch (err) {
      setError(err.message || 'AI tournament planning failed');
    } finally {
      setAiPlanning(false);
    }
  }

  async function save() {
    const allErrors = steps.flatMap((item) => validateTournamentStep(item.validate, form));
    if (allErrors.length) {
      setError(allErrors[0]);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = formToTournamentBody(form);
      if (isEdit) await adminPatch(`/admin/tournaments/${initial.id}`, body);
      else await adminPost('/admin/tournaments', body);
      await onSaved();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer title={isEdit ? `Edit ${isLuckyRaider ? 'Daily Lucky Raider' : 'Tournament'} #${initial.id}` : (isLuckyRaider ? 'Create Daily Lucky Raider' : 'Create Tournament')} subtitle={isLuckyRaider ? 'Standalone daily raid lottery. It does not require a normal tournament leaderboard.' : 'Guided setup keeps the form readable and validates each operational decision.'} onClose={onClose}>
      <div className="wizard">
        <div className="wizard-steps">
          {steps.map((item, idx) => (
            <button key={item.label} className={'wizard-step' + (step === idx ? ' active' : '')} onClick={() => setStep(idx)}>
              <span className="wizard-step-number">{idx + 1}</span>
              <span><strong>{item.label}</strong><span className="admin-card-sub" style={{ display: 'block' }}>{item.hint}</span></span>
            </button>
          ))}
        </div>
        <div className="wizard-panel">
          <div className={'tournament-ai-planner' + (aiOpen ? ' open' : '')}>
            <button className="tournament-ai-toggle" onClick={() => setAiOpen((value) => !value)}>
              <span>
                <strong>AI Tournament Builder</strong>
                <small>Describe the event. AI fills a reviewable draft but cannot save, activate, or pay rewards.</small>
              </span>
              <span aria-hidden="true">{aiOpen ? '-' : '+'}</span>
            </button>
            {aiOpen && (
              <div className="tournament-ai-body">
                <textarea
                  className="admin-textarea tournament-ai-prompt"
                  rows={4}
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  placeholder="Example: Create a 7-day Ostium volume tournament starting tomorrow at 22:00 UTC. Each day has its own $25k player target and $100 prize pool for top 3; final pool $1,000 for top 10."
                  disabled={aiPlanning}
                />
                <div className="tournament-ai-actions">
                  <span className="admin-help">Generated values apply to this wizard only. Review every tab, then save normally.</span>
                  <button className="admin-btn primary" onClick={planWithAi} disabled={aiPlanning || aiPrompt.trim().length < 8}>
                    {aiPlanning ? 'Planning tournament...' : 'Generate and apply draft'}
                  </button>
                </div>
                {aiResult && (
                  <div className="tournament-ai-result">
                    <strong>{aiResult.summary}</strong>
                    {aiResult.model && <span>Model: {aiResult.model}</span>}
                    {aiResult.warnings.map((warning, index) => <span key={index}>Review: {warning}</span>)}
                  </div>
                )}
              </div>
            )}
          </div>
          {error && <div className="admin-error">{error}</div>}
          {!isLuckyRaider && step === 0 && <TournamentScheduleStep form={form} update={update} />}
          {!isLuckyRaider && step === 1 && <TournamentEligibilityStep form={form} update={update} />}
          {!isLuckyRaider && step === 2 && <TournamentScoringStep form={form} update={update} />}
          {!isLuckyRaider && step === 3 && <TournamentRewardsStep form={form} update={update} />}
          {!isLuckyRaider && step === 4 && <TournamentReviewStep form={form} />}
          {isLuckyRaider && step === 0 && <TournamentScheduleStep form={form} update={update} />}
          {isLuckyRaider && step === 1 && <TournamentRewardsStep form={form} update={update} />}
          {isLuckyRaider && step === 2 && <TournamentReviewStep form={form} />}
          <div className="wizard-footer">
            <button className="admin-btn" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Back</button>
            <div className="admin-filter-row">
              <button className="admin-btn ghost" onClick={onClose}>Cancel</button>
              {step < steps.length - 1 && <button className="admin-btn" onClick={save} disabled={saving}>{saving ? 'Saving...' : (isEdit ? 'Save' : 'Create')}</button>}
              {step < steps.length - 1 ? (
                <button className="admin-btn primary" onClick={next}>Next</button>
              ) : (
                <button className="admin-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : (isEdit ? 'Save changes' : (isLuckyRaider ? 'Create Lucky Raider' : 'Create tournament'))}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function TournamentScheduleStep({ form, update }) {
  const isLuckyRaider = form.event_kind === 'lucky_raider';
  function updateTownHallRequirement(value) {
    const minTownHallLevel = Math.max(0, Math.min(20, Math.floor(Number(value || 0) || 0)));
    if (!isLuckyRaider) {
      update({ min_town_hall_level: minTownHallLevel });
      return;
    }
    const rewardConfig = normalizeRewardConfig(form.reward_config || {});
    update({
      min_town_hall_level: minTownHallLevel,
      reward_config: {
        ...rewardConfig,
        lucky_daily_raider: {
          ...rewardConfig.lucky_daily_raider,
          min_town_hall_level: minTownHallLevel,
        },
      },
    });
  }
  const displayedMinTownHall = isLuckyRaider
    ? (normalizeRewardConfig(form.reward_config || {}).lucky_daily_raider.min_town_hall_level || form.min_town_hall_level || 0)
    : (form.min_town_hall_level || 0);
  return (
    <div className="admin-card">
      <div className="admin-card-head"><div><div className="admin-card-title">Schedule and Identity</div><div className="admin-card-sub">Start here because every other choice depends on whether this is a draft, live event, or scheduled campaign.</div></div></div>
      <div className="admin-card-body admin-grid">
        <label className="admin-field"><span className="admin-label">Name</span><input className="admin-input" value={form.name} onChange={(e) => update({ name: e.target.value })} /></label>
        <label className="admin-field"><span className="admin-label">Description</span><textarea className="admin-textarea" value={form.description || ''} onChange={(e) => update({ description: e.target.value })} /></label>
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Status</span><select className="admin-select" value={form.status} onChange={(e) => update({ status: e.target.value })}><option value="draft">Draft</option><option value="active">Active</option><option value="ended">Ended</option></select></label>
          <DateTimeField label="Start at" value={form.start_at} onChange={(value) => update({ start_at: value })} />
          <DateTimeField label="End at" value={form.end_at} onChange={(value) => update({ end_at: value })} />
        </div>
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Pre-registration</span><select className="admin-select" value={form.preregistration_enabled ? '1' : '0'} onChange={(e) => update({ preregistration_enabled: e.target.value === '1' })}><option value="0">Disabled</option><option value="1">Enabled</option></select></label>
          <DateTimeField label="Registration opens" value={form.registration_opens_at} onChange={(value) => update({ registration_opens_at: value })} />
          <DateTimeField label="Registration closes" value={form.registration_closes_at} onChange={(value) => update({ registration_closes_at: value })} />
        </div>
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Twitter/X handle</span><select className="admin-select" value={form.registration_require_twitter ? '1' : '0'} onChange={(e) => update({ registration_require_twitter: e.target.value === '1' })}><option value="0">Optional</option><option value="1">Required to register</option></select></label>
          <div className="admin-help">When required, players must enter a valid @handle before joining or pre-registering.</div>
        </div>
        <div className="admin-card nested-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-card-title">Town Hall Requirement</div>
              <div className="admin-card-sub">
                {isLuckyRaider
                  ? 'Minimum Town Hall level required to receive Daily Lucky Raider tickets.'
                  : 'Minimum Town Hall level required to register or join this tournament.'}
              </div>
            </div>
          </div>
          <div className="admin-card-body admin-form-grid three">
            <NumberField label="Min Town Hall level" value={displayedMinTownHall} onChange={updateTownHallRequirement} />
            <div className="admin-help">Set 0 to allow every Town Hall level.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TournamentEligibilityStep({ form, update }) {
  const eligible = form.dex_scope === 'custom' ? form.eligible_dexes : (form.dex_scope === 'all' ? TOURNAMENT_DEXES : [form.dex]);
  const mega = normalizeMegaConfig(form.mega_config || {});
  function toggleDex(dex) {
    const set = new Set(form.eligible_dexes || []);
    if (set.has(dex)) set.delete(dex);
    else set.add(dex);
    update({ eligible_dexes: Array.from(set), dex: form.dex || dex });
  }
  function updateMega(patch) {
    update({ mega_config: normalizeMegaConfig({ ...mega, ...patch }) });
  }
  function setMegaTemplate(template) {
    update({ mega_config: defaultMegaConfig(true, template) });
  }
  function setMegaType(value) {
    if (value === 'standard') {
      updateMega({ enabled: false });
      return;
    }
    if (value === 'mega_flat') {
      update({ mega_config: normalizeMegaConfig({ ...mega, enabled: true, sectors: [] }) });
      return;
    }
    const next = mega.sectors?.length ? normalizeMegaConfig({ ...mega, enabled: true }) : defaultMegaConfig(true, mega.template || 'whale_dolphin_shrimp');
    update({ mega_config: next });
  }
  const megaType = !mega.enabled ? 'standard' : (mega.sectors?.length ? 'mega_sectors' : 'mega_flat');
  return (
    <div className="admin-grid">
      <div className="admin-card">
        <div className="admin-card-head"><div><div className="admin-card-title">Eligibility</div><div className="admin-card-sub">Choose who can join, then decide if the event is individual or team-based.</div></div></div>
        <div className="admin-card-body admin-grid">
          <div className="admin-form-grid three">
            <label className="admin-field"><span className="admin-label">DEX scope</span><select className="admin-select" value={form.dex_scope} onChange={(e) => update({ dex_scope: e.target.value })}><option value="single">Single DEX</option><option value="custom">Custom DEXes</option><option value="all">All DEXes</option></select></label>
            <label className="admin-field"><span className="admin-label">Primary DEX</span><select className="admin-select" value={form.dex} onChange={(e) => update({ dex: e.target.value, eligible_dexes: [e.target.value] })}>{TOURNAMENT_DEXES.map((d) => <option key={d} value={d}>{DEX_LABELS[d]}</option>)}</select></label>
            <label className="admin-field"><span className="admin-label">Mode</span><select className="admin-select" value={form.mode} onChange={(e) => update({ mode: e.target.value, dex_scope: e.target.value === 'dex_vs_dex' ? 'custom' : form.dex_scope })}><option value="individual">Individual</option><option value="dex_vs_dex">DEX vs DEX</option></select></label>
          </div>
          <div className="admin-form-grid three">
            <NumberField label="Min Town Hall" value={form.min_town_hall_level || 0} onChange={(v) => update({ min_town_hall_level: v })} />
          </div>
          {form.dex_scope === 'custom' && (
            <div className="admin-choice-grid">
              {TOURNAMENT_DEXES.map((d) => (
                <button key={d} className={'admin-choice' + ((form.eligible_dexes || []).includes(d) ? ' active' : '')} onClick={() => toggleDex(d)}>
                  <strong>{DEX_LABELS[d]}</strong>
                </button>
              ))}
            </div>
          )}
          <div className="admin-help">Selected: {eligible.map((d) => DEX_LABELS[d] || d).join(', ')}</div>
        </div>
      </div>
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Mega Tournament</div>
            <div className="admin-card-sub">Optional sectors split one tournament into Whale/Dolphin/Shrimp or A/B/C leaderboards. Sector volume can sum every DEX or only selected DEXes.</div>
          </div>
        </div>
        <div className="admin-card-body admin-grid">
          <div className="admin-form-grid three">
            <label className="admin-field">
              <span className="admin-label">Tournament type</span>
              <select className="admin-select" value={megaType} onChange={(e) => setMegaType(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="mega_flat">Mega without sectors</option>
                <option value="mega_sectors">Mega with sectors</option>
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-label">Sector template</span>
              <select className="admin-select" value={mega.template || 'whale_dolphin_shrimp'} onChange={(e) => setMegaTemplate(e.target.value)} disabled={megaType !== 'mega_sectors'}>
                <option value="whale_dolphin_shrimp">Whale / Dolphin / Shrimp</option>
                <option value="abc">Sector A / B / C</option>
              </select>
            </label>
            <div className="admin-help">{megaType === 'mega_flat' ? 'Players share one leaderboard, but mega reward schedules and lucky raider rules still apply.' : 'Players can join normally; they appear in the highest sector whose TH, trade, and volume rules they satisfy.'}</div>
          </div>
          {megaType === 'mega_sectors' && <MegaSectorEditor mega={mega} updateMega={updateMega} />}
          {megaType === 'mega_flat' && (
            <div className="admin-help">
              This mega tournament has no sectors. Use the Reward Schedule step for daily pools, final prizes, and Lucky Daily Raider settings.
            </div>
          )}
        </div>
      </div>
      {form.mode === 'dex_vs_dex' && (
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Team Rules</div><div className="admin-card-sub">Team score decides the winning DEX. Member reward metric decides player split inside the winning side.</div></div></div>
          <div className="admin-card-body admin-form-grid three">
            <label className="admin-field"><span className="admin-label">Team score by</span><MetricSelect value={form.team_score_by} onChange={(value) => update({ team_score_by: value })} /></label>
            <label className="admin-field"><span className="admin-label">Members rewarded by</span><MetricSelect value={form.team_member_reward_by} onChange={(value) => update({ team_member_reward_by: value })} /></label>
            <label className="admin-field"><span className="admin-label">Attack policy</span><select className="admin-select" value={form.attack_match_policy} onChange={(e) => update({ attack_match_policy: e.target.value })}><option value="all">Normal matchmaking</option><option value="enemy_or_non_participant">Block same-team attacks</option><option value="enemy_only">Enemy teams only</option></select></label>
          </div>
        </div>
      )}
    </div>
  );
}

function MegaSectorEditor({ mega, updateMega }) {
  const [activeSector, setActiveSector] = useState(0);
  const sectors = mega.sectors || [];
  function setSectors(next) {
    const normalized = normalizeMegaConfig({ ...mega, sectors: next }).sectors;
    updateMega({ sectors: normalized });
    setActiveSector((value) => Math.max(0, Math.min(value, Math.max(0, normalized.length - 1))));
  }
  function updateSector(index, patch) {
    const next = [...sectors];
    next[index] = { ...next[index], ...patch };
    setSectors(next);
  }
  function addSector() {
    const next = [...sectors, { id: `sector_${sectors.length + 1}`, name: `Sector ${sectors.length + 1}`, min_town_hall_level: 1, min_volume_usd: 0, min_daily_volume_usd: 0, min_trades: 0, dex_scope: 'all', dexes: [], prize_tiers: [], reward_config: normalizeRewardConfig({}) }];
    setSectors(next);
    setActiveSector(next.length - 1);
  }
  function removeSector(index) {
    setSectors(sectors.filter((_, i) => i !== index));
    setActiveSector((value) => Math.max(0, Math.min(value, sectors.length - 2)));
  }
  function updateSectorTier(sectorIndex, tierIndex, patch) {
    const sector = sectors[sectorIndex];
    const tiers = [...(sector.prize_tiers || [])];
    tiers[tierIndex] = { ...tiers[tierIndex], ...patch };
    updateSector(sectorIndex, { prize_tiers: tiers });
  }
  function removeSectorTier(sectorIndex, tierIndex) {
    const sector = sectors[sectorIndex];
    updateSector(sectorIndex, { prize_tiers: (sector.prize_tiers || []).filter((_, i) => i !== tierIndex) });
  }
  function addSectorTier(sectorIndex) {
    const sector = sectors[sectorIndex];
    updateSector(sectorIndex, { prize_tiers: [...(sector.prize_tiers || []), { volume_usd: 0, rewards: [normalizeReward(rewardDefaults('money'))] }] });
  }
  const current = sectors[activeSector] || null;
  return (
    <div className="admin-card nested-card">
      <div className="admin-card-head">
        <div>
          <div className="admin-card-title">Mega Sectors</div>
          <div className="admin-card-sub">Order matters: the first matching sector wins. Put Whale above Dolphin above Shrimp.</div>
        </div>
        <button className="admin-btn primary" onClick={addSector}>Add sector</button>
      </div>
      <div className="admin-card-body admin-grid">
        <div className="tier-pager">
          <button className="admin-btn" onClick={() => setActiveSector((value) => Math.max(0, value - 1))} disabled={activeSector === 0}>Previous sector</button>
          <div className="tier-pager-center">
            <strong>{current ? current.name : 'No sector'}</strong>
            <span className="admin-card-sub">{sectors.length ? `Sector ${activeSector + 1} of ${sectors.length}` : 'Add at least one sector'}</span>
          </div>
          <button className="admin-btn" onClick={() => setActiveSector((value) => Math.min(sectors.length - 1, value + 1))} disabled={activeSector >= sectors.length - 1}>Next sector</button>
        </div>
        <div className="tier-chip-row">
          {sectors.map((sector, idx) => (
            <button key={`${sector.id}-${idx}`} className={'tier-chip' + (idx === activeSector ? ' active' : '')} onClick={() => setActiveSector(idx)}>
              {sector.name}<span>{fmtUsd(sector.min_volume_usd || 0, 0)} total{Number(sector.min_daily_volume_usd || 0) > 0 ? ` · ${fmtUsd(sector.min_daily_volume_usd, 0)} daily` : ''}</span>
            </button>
          ))}
        </div>
        {current && (
          <div className="admin-grid">
            <div className="admin-form-grid three">
              <label className="admin-field"><span className="admin-label">Sector ID</span><input className="admin-input" value={current.id} onChange={(e) => updateSector(activeSector, { id: e.target.value })} /></label>
              <label className="admin-field"><span className="admin-label">Name</span><input className="admin-input" value={current.name} onChange={(e) => updateSector(activeSector, { name: e.target.value })} /></label>
              <label className="admin-field"><span className="admin-label">Description</span><input className="admin-input" value={current.description || ''} onChange={(e) => updateSector(activeSector, { description: e.target.value })} /></label>
            </div>
            <div className="admin-form-grid three">
              <NumberField label="Min Town Hall" value={current.min_town_hall_level} onChange={(v) => updateSector(activeSector, { min_town_hall_level: v })} />
              <NumberField label="Min volume $" value={current.min_volume_usd} onChange={(v) => updateSector(activeSector, { min_volume_usd: v })} />
              <NumberField label="Min trades / tx" value={current.min_trades} onChange={(v) => updateSector(activeSector, { min_trades: v })} />
              <NumberField label="Min daily volume $" value={current.min_daily_volume_usd || 0} onChange={(v) => updateSector(activeSector, { min_daily_volume_usd: v })} />
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span className="admin-label">Sector volume source</span>
                <select className="admin-select" value={current.dex_scope || 'all'} onChange={(e) => updateSector(activeSector, { dex_scope: e.target.value })}>
                  <option value="all">All DEXes summed</option>
                  <option value="tournament">Tournament eligible DEXes</option>
                  <option value="custom">Custom sector DEXes</option>
                </select>
              </label>
              <button className="admin-btn danger" onClick={() => removeSector(activeSector)}>Remove sector</button>
            </div>
            {current.dex_scope === 'custom' && (
              <div className="admin-choice-grid">
                {TOURNAMENT_DEXES.map((dex) => {
                  const active = (current.dexes || []).includes(dex);
                  return (
                    <button
                      key={dex}
                      className={'admin-choice' + (active ? ' active' : '')}
                      onClick={() => {
                        const set = new Set(current.dexes || []);
                        if (set.has(dex)) set.delete(dex);
                        else set.add(dex);
                        updateSector(activeSector, { dexes: Array.from(set) });
                      }}
                    >
                      <strong>{DEX_LABELS[dex]}</strong>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="admin-toolbar">
              <strong>Sector rewards</strong>
              <button className="admin-btn" onClick={() => addSectorTier(activeSector)}>Add sector reward tier</button>
            </div>
            {(current.prize_tiers || []).map((tier, tierIndex) => (
              <PrizeTierEditor
                key={tierIndex}
                tier={tier}
                index={tierIndex}
                updateTier={(idx, patch) => updateSectorTier(activeSector, idx, patch)}
                removeTier={(idx) => removeSectorTier(activeSector, idx)}
              />
            ))}
            {!(current.prize_tiers || []).length && <div className="admin-help">No sector-specific rewards yet. Add a tier if this sector needs its own prize pool.</div>}
            <RewardScheduleEditor
              title="Sector Reward Schedule"
              subtitle="Optional override for this sector. Leave empty to inherit the root tournament reward schedule."
              value={current.reward_config || {}}
              onChange={(reward_config) => updateSector(activeSector, { reward_config })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentScoringStep({ form, update }) {
  const total = Number(form.points_trophy_weight || 0) + Number(form.points_volume_weight || 0) + Number(form.points_pnl_weight || 0);
  const isRankedRaid = form.battle_mode === 'ranked_raids';
  return (
    <div className="admin-card">
      <div className="admin-card-head"><div><div className="admin-card-title">Scoring and ranked raids</div><div className="admin-card-sub">Trading activity always powers the tournament. Ranked raids can add capped attack and defense trophies to the same event.</div></div></div>
      <div className="admin-card-body admin-grid">
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Sort by</span><MetricSelect value={form.sort_by} onChange={(value) => update({ sort_by: value })} /></label>
          <label className="admin-field"><span className="admin-label">Scoring mode</span><select className="admin-select" value={form.scoring_mode} onChange={(e) => update({ scoring_mode: e.target.value })}><option value="live">Live scoring</option><option value="daily_pool">Daily point pool</option></select></label>
          <NumberField label="Daily pool points" value={form.daily_pool_points} onChange={(v) => update({ daily_pool_points: v })} />
        </div>

        {form.scoring_mode === 'daily_pool' && (
          <div className="admin-form-grid three">
            <DateTimeField label="Daily pool starts at" value={form.daily_pool_enabled_at} onChange={(value) => update({ daily_pool_enabled_at: value })} />
            <label className="admin-field"><span className="admin-label">Daily award time UTC</span><input className="admin-input" type="time" step="60" value={form.daily_pool_award_time_utc || '00:00'} onChange={(e) => update({ daily_pool_award_time_utc: e.target.value || '00:00' })} /></label>
            <div className="admin-help">Leave blank to keep the existing activation time.</div>
          </div>
        )}
        {form.scoring_mode === 'daily_pool' && <DailyPoolConfig form={form} update={update} />}

        <div className="admin-form-grid three">
          <NumberField label="Trophy weight %" value={form.points_trophy_weight} onChange={(v) => update({ points_trophy_weight: v })} />
          <NumberField label="Volume weight %" value={form.points_volume_weight} onChange={(v) => update({ points_volume_weight: v })} />
          <NumberField label="PnL weight %" value={form.points_pnl_weight} onChange={(v) => update({ points_pnl_weight: v })} />
        </div>
        <div className={Math.abs(total - 100) > 0.001 ? 'admin-error' : 'admin-help'}>Point weight total: {total}%</div>
        <div className="admin-form-grid three">
          <NumberField label="Gold boost" value={form.gold_boost} step="0.1" onChange={(v) => update({ gold_boost: v })} />
          <NumberField label="Seeker gold boost" value={form.seeker_gold_boost} step="0.1" onChange={(v) => update({ seeker_gold_boost: v })} />
          <NumberField label="Trophy boost" value={form.trophy_boost} step="0.1" onChange={(v) => update({ trophy_boost: v })} />
        </div>
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Shield after casual raid hours</span><input className="admin-input" type="number" value={form.shield_hours} onChange={(e) => update({ shield_hours: e.target.value })} /></label>
          <label className="admin-field"><span className="admin-label">Freeze account trophies</span><select className="admin-select" value={form.freeze_trophies ? '1' : '0'} onChange={(e) => update({ freeze_trophies: e.target.value === '1' })}><option value="1">Yes</option><option value="0">No</option></select></label>
          <label className="admin-field"><span className="admin-label">Seeker only</span><select className="admin-select" value={form.seeker_only ? '1' : '0'} onChange={(e) => update({ seeker_only: e.target.value === '1' })}><option value="0">No</option><option value="1">Yes</option></select></label>
        </div>

        <div className="admin-choice-grid">
          <ToggleChoice
            active={!isRankedRaid}
            title="Ranked raids off"
            subtitle="Only trading activity and ordinary raids contribute to this tournament."
            onClick={() => update({ battle_mode: 'casual' })}
          />
          <ToggleChoice
            active={isRankedRaid}
            title="Ranked raid add-on"
            subtitle="Adds daily attack limits, defense losses and net raid trophies to this same DEX tournament."
            onClick={() => update({ battle_mode: 'ranked_raids' })}
          />
        </div>

        {isRankedRaid && (
          <>
            <div className="admin-ranked-summary">
              <div>
                <strong>One combined DEX tournament</strong>
                <span>Volume, PnL, gold, daily points and rewards stay active. Ranked raid trophies use the same participant and daily ledgers.</span>
              </div>
              <div>
                <strong>Independent raid limits</strong>
                <span>Every simultaneous DEX tournament owns its own attack quota, defense cap and shield state.</span>
              </div>
            </div>
            <div className="admin-form-grid three">
              <NumberField label="Attacks per player / UTC day" value={form.ranked_daily_attack_limit} onChange={(v) => update({ ranked_daily_attack_limit: v })} />
              <NumberField label="Tournament shield after defense (hours)" value={form.ranked_shield_hours} step="0.5" onChange={(v) => update({ ranked_shield_hours: v })} />
              <NumberField label="Max defenses per player / UTC day" value={form.ranked_max_defenses_per_day} onChange={(v) => update({ ranked_max_defenses_per_day: v })} />
            </div>
            <div className="admin-form-grid three">
              <label className="admin-field">
                <span className="admin-label">Altar trophy bonus</span>
                <select className="admin-select" value={form.ranked_altar_bonus_enabled ? '1' : '0'} onChange={(e) => update({ ranked_altar_bonus_enabled: e.target.value === '1' })}>
                  <option value="0">Disabled for ranked raids</option>
                  <option value="1">Enabled</option>
                </select>
              </label>
              <div className="admin-field">
                <span className="admin-label">Fair defender capacity</span>
                <span className="admin-card-sub">Use 0 for unlimited defenses. Otherwise the defense cap must be at least the attack cap. Use 0 hours to disable tournament shields.</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DailyPoolConfig({ form, update }) {
  const mode = form.daily_pool_growth_mode || 'pct';
  const base = Math.max(1, Number(form.daily_pool_points) || 1000);
  const pct = Number(form.daily_pool_growth_pct) || 0;
  const multiplier = Number((1 + pct / 100).toFixed(6));
  const overrides = form.daily_pool_overrides && typeof form.daily_pool_overrides === 'object' ? form.daily_pool_overrides : {};
  const days = tournamentUtcDays(form, 60);

  function setMode(nextMode) {
    update({
      daily_pool_growth_mode: nextMode,
      daily_pool_growth_pct: nextMode === 'fixed' || nextMode === 'manual' ? 0 : pct,
    });
  }

  function setOverride(day, value) {
    const next = { ...overrides };
    const text = String(value ?? '').trim();
    if (!text) {
      delete next[day];
    } else {
      const numeric = Number(text.replace(',', '.'));
      if (Number.isFinite(numeric) && numeric > 0) next[day] = numeric;
    }
    update({ daily_pool_overrides: next });
  }

  function fillManualFromPreview() {
    const next = {};
    days.forEach((day, idx) => {
      next[day] = Number(overrides[day] || dailyPoolAutoPoints(base, pct, idx));
    });
    update({ daily_pool_overrides: next, daily_pool_growth_mode: 'manual', daily_pool_growth_pct: 0 });
  }

  function clearOverrides() {
    update({ daily_pool_overrides: {} });
  }

  return (
    <div className="admin-card nested-card">
      <div className="admin-card-head">
        <div>
          <div className="admin-card-title">Daily Point Pool</div>
          <div className="admin-card-sub">Days are award rounds labeled by their cutoff date. Manual values override the auto calculation.</div>
        </div>
        <div className="admin-filter-row">
          <button className="admin-btn ghost" onClick={fillManualFromPreview} disabled={!days.length}>Fill manual</button>
          <button className="admin-btn ghost" onClick={clearOverrides} disabled={!Object.keys(overrides).length}>Clear manual</button>
        </div>
      </div>
      <div className="admin-card-body admin-grid">
        <div className="admin-form-grid three">
          <label className="admin-field">
            <span className="admin-label">Pool mode</span>
            <select className="admin-select" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="fixed">Fixed every day</option>
              <option value="pct">Growth % per day</option>
              <option value="multiplier">Multiplier per day</option>
              <option value="manual">Manual per day</option>
            </select>
          </label>
          {mode === 'pct' && <NumberField label="Daily growth %" value={pct} step="0.1" onChange={(v) => update({ daily_pool_growth_pct: v, daily_pool_growth_mode: 'pct' })} />}
          {mode === 'multiplier' && <NumberField label="Daily multiplier" value={multiplier} step="0.01" onChange={(v) => update({ daily_pool_growth_pct: (Math.max(0.01, Number(v) || 1) - 1) * 100, daily_pool_growth_mode: 'multiplier' })} />}
          {(mode === 'fixed' || mode === 'manual') && <div className="admin-help">Auto growth is disabled. Use manual values below when a day needs a custom pool.</div>}
        </div>
        <div className="daily-pool-preview">
          {!days.length && <div className="admin-help">Set tournament start and end dates to edit daily pools by day.</div>}
          {days.map((day, idx) => {
            const auto = dailyPoolAutoPoints(base, mode === 'manual' || mode === 'fixed' ? 0 : pct, idx);
            const manual = overrides[day];
            return (
              <div className="daily-pool-row" key={day}>
                <div>
                  <strong>{day}</strong>
                  <span>{manual ? `manual, auto ${auto.toLocaleString()}` : `auto ${auto.toLocaleString()}`}</span>
                </div>
                <input
                  className="admin-input"
                  data-number-input="true"
                  type="text"
                  inputMode="numeric"
                  placeholder={String(auto)}
                  value={manual ?? ''}
                  onChange={(e) => setOverride(day, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TournamentRewardsStep({ form, update }) {
  const [activeTier, setActiveTier] = useState(0);
  const tiers = form.prize_tiers || [];
  const isLuckyRaider = form.event_kind === 'lucky_raider';

  function normalizeEditableTiers(next) {
    return (Array.isArray(next) ? next : []).map((tier) => ({
      volume_usd: Math.max(0, Number(tier.volume_usd) || 0),
      rewards: (Array.isArray(tier.rewards) ? tier.rewards : []).map(normalizeReward),
    })).filter((tier) => tier.volume_usd > 0 || tier.rewards.length > 0);
  }

  function setTiers(next) {
    const normalized = normalizeEditableTiers(next);
    update({ prize_tiers: normalized });
    setActiveTier((value) => Math.max(0, Math.min(value, Math.max(0, normalized.length - 1))));
  }
  function addTier() {
    const next = [...tiers, { volume_usd: 100000, rewards: [normalizeReward(rewardDefaults('money'))] }];
    setTiers(next);
    setActiveTier(next.length - 1);
  }
  function updateTier(index, patch) {
    const next = [...tiers];
    next[index] = { ...next[index], ...patch };
    setTiers(next);
  }
  function removeTier(index) {
    setTiers(tiers.filter((_, i) => i !== index));
    setActiveTier((value) => Math.max(0, Math.min(value, tiers.length - 2)));
  }
  const currentTier = tiers[activeTier] || null;
  if (isLuckyRaider) {
    return (
      <RewardScheduleEditor
        title="Daily Lucky Raider Settings"
        subtitle="Standalone raid lottery. Configure ticket rules, winner count, and reward rows without legacy tournament volume tiers."
        value={form.reward_config}
        onChange={(reward_config) => update({ reward_config })}
        luckyOnly
        allowPreset
      />
    );
  }
  return (
    <div className="admin-grid">
      <RewardScheduleEditor
        title="Reward Schedule"
        subtitle="Daily pools, final rewards, and Lucky Daily Raider are additive to legacy volume tiers."
        value={form.reward_config}
        onChange={(reward_config) => update({ reward_config })}
        tournamentDays={tournamentUtcDays(form, 60)}
        allowPreset
      />
      <div className="admin-card">
        <div className="admin-card-head">
          <div><div className="admin-card-title">Legacy Volume Tiers</div><div className="admin-card-sub">Prize tiers unlock by total tournament volume. Kept for backwards compatibility with older events.</div></div>
          <button className="admin-btn primary" onClick={addTier}>Add tier</button>
        </div>
        <div className="admin-card-body admin-grid">
          <div className="admin-form-grid">
            <label className="admin-field"><span className="admin-label">Prize currency</span><input className="admin-input" value={form.prize_currency} onChange={(e) => update({ prize_currency: e.target.value.toUpperCase() })} /></label>
            <label className="admin-field"><span className="admin-label">Rewards in COP</span><select className="admin-select" value={form.rewards_in_cop ? '1' : '0'} onChange={(e) => update({ rewards_in_cop: e.target.value === '1' })}><option value="0">No</option><option value="1">Yes</option></select></label>
          </div>
          {!tiers.length && <div className="admin-help">No legacy prize tiers configured. Tournament can use only the reward schedule above.</div>}
          {!!tiers.length && (
            <>
              <div className="tier-pager">
                <button className="admin-btn" onClick={() => setActiveTier((value) => Math.max(0, value - 1))} disabled={activeTier === 0}>Previous tier</button>
                <div className="tier-pager-center">
                  <strong>Tier {activeTier + 1} of {tiers.length}</strong>
                  <span className="admin-card-sub">Use Previous/Next to edit one tier at a time.</span>
                </div>
                <button className="admin-btn" onClick={() => setActiveTier((value) => Math.min(tiers.length - 1, value + 1))} disabled={activeTier >= tiers.length - 1}>Next tier</button>
              </div>
              <div className="tier-chip-row">
                {tiers.map((tier, idx) => (
                  <button
                    key={idx}
                    className={'tier-chip' + (idx === activeTier ? ' active' : '')}
                    onClick={() => setActiveTier(idx)}
                  >
                    Tier {idx + 1}<span>${Number(tier.volume_usd || 0).toLocaleString()}</span>
                  </button>
                ))}
              </div>
              {currentTier && <PrizeTierEditor tier={currentTier} index={activeTier} updateTier={updateTier} removeTier={removeTier} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RewardScheduleEditor({
  value,
  onChange,
  title = 'Reward Schedule',
  subtitle = '',
  allowPreset = false,
  luckyOnly = false,
  tournamentDays = [],
}) {
  const config = normalizeRewardConfig(value || {});
  const [manualWinnerDraft, setManualWinnerDraft] = useState('');
  function setConfig(next) {
    onChange(normalizeRewardConfig(next));
  }
  function updateList(key, next) {
    setConfig({ ...config, [key]: next });
  }
  function addPool(key, label) {
    const isDaily = key === 'daily_pools';
    const assignedDays = new Set((config.daily_pools || []).map((pool) => pool.day_utc).filter(Boolean));
    const nextDay = isDaily ? tournamentDays.find((day) => !assignedDays.has(day)) || '' : '';
    updateList(key, [...(config[key] || []), {
      enabled: true,
      label: nextDay ? `Rewards ${nextDay}` : label,
      ...(isDaily ? {
        day_utc: nextDay,
        volume_target_usd: 0,
        volume_target_scope: 'player',
      } : {}),
      top_n: isDaily ? 5 : 10,
      metric: 'points',
      rewards: [normalizeReward(rewardDefaults('money'))],
      payouts: [],
    }]);
  }
  function addEveryTournamentDay() {
    const existing = config.daily_pools || [];
    const byDay = new Map(existing.filter((pool) => pool.day_utc).map((pool) => [pool.day_utc, pool]));
    const generic = existing.filter((pool) => !pool.day_utc);
    const generated = tournamentDays.map((day, index) => byDay.get(day) || {
      enabled: true,
      label: `Day ${index + 1}`,
      day_utc: day,
      volume_target_usd: 0,
      volume_target_scope: 'player',
      top_n: 5,
      metric: 'points',
      rewards: [normalizeReward(rewardDefaults('money'))],
      payouts: [],
    });
    updateList('daily_pools', [...generic, ...generated]);
  }
  function updatePool(key, index, patch) {
    const next = [...(config[key] || [])];
    next[index] = { ...next[index], ...patch };
    updateList(key, next);
  }
  function removePool(key, index) {
    updateList(key, (config[key] || []).filter((_, idx) => idx !== index));
  }
  function updateLucky(patch) {
    setConfig({ ...config, lucky_daily_raider: { ...config.lucky_daily_raider, ...patch } });
  }
  function setManualWinners(next) {
    updateLucky({ manual_winners: normalizeLuckyRaiderManualWinners(next) });
  }
  function addManualWinner() {
    const next = normalizeLuckyRaiderManualWinners([...(config.lucky_daily_raider.manual_winners || []), manualWinnerDraft]);
    if (!next.length || next.length === (config.lucky_daily_raider.manual_winners || []).length) {
      setManualWinnerDraft('');
      return;
    }
    updateLucky({ manual_winners: next });
    setManualWinnerDraft('');
  }
  function removeManualWinner(index) {
    setManualWinners((config.lucky_daily_raider.manual_winners || []).filter((_, idx) => idx !== index));
  }
  function moveManualWinner(index, direction) {
    const next = [...(config.lucky_daily_raider.manual_winners || [])];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setManualWinners(next);
  }
  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <div><div className="admin-card-title">{title}</div><div className="admin-card-sub">{subtitle || 'Configure automatic reward blocks without changing the tournament scoring mode.'}</div></div>
        <div className="admin-actions">
          {allowPreset && <button className="admin-btn primary" onClick={() => onChange(rewardConfigPreset5000())}>Use $5k / 10 days preset</button>}
          {allowPreset && <button className="admin-btn" onClick={() => onChange(rewardConfigPresetLuckyRaider())}>Use Daily Lucky Raider preset</button>}
        </div>
      </div>
      <div className="admin-card-body admin-grid">
        {!luckyOnly && (
          <>
            <div className="admin-toolbar">
              <strong>Daily pools</strong>
              <div className="admin-actions">
                {!!tournamentDays.length && <button className="admin-btn" onClick={addEveryTournamentDay}>Create all {tournamentDays.length} days</button>}
                <button className="admin-btn" onClick={() => addPool('daily_pools', 'Daily Pool')}>Add daily pool</button>
              </div>
            </div>
            {(config.daily_pools || []).map((pool, index) => (
              <RewardSchedulePoolEditor
                key={`daily-${index}`}
                pool={pool}
                index={index}
                updatePool={(idx, patch) => updatePool('daily_pools', idx, patch)}
                removePool={(idx) => removePool('daily_pools', idx)}
                daily
                tournamentDays={tournamentDays}
              />
            ))}
            {!(config.daily_pools || []).length && <div className="admin-help">No daily reward pool configured.</div>}

            <div className="admin-toolbar">
              <strong>Final pools</strong>
              <button className="admin-btn" onClick={() => addPool('final_pools', 'Final Pool')}>Add final pool</button>
            </div>
            {(config.final_pools || []).map((pool, index) => (
              <RewardSchedulePoolEditor
                key={`final-${index}`}
                pool={pool}
                index={index}
                updatePool={(idx, patch) => updatePool('final_pools', idx, patch)}
                removePool={(idx) => removePool('final_pools', idx)}
              />
            ))}
            {!(config.final_pools || []).length && <div className="admin-help">No final reward pool configured.</div>}
          </>
        )}

        <div className="admin-card nested-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Lucky Daily Raider</div><div className="admin-card-sub">Automatic weighted daily draw. Tickets can come from UTC-day volume, winning attacks, or both.</div></div></div>
          <div className="admin-card-body admin-grid">
            <div className="admin-form-grid three">
              <label className="admin-field"><span className="admin-label">Enabled</span><select className="admin-select" value={config.lucky_daily_raider.enabled ? '1' : '0'} onChange={(e) => updateLucky({ enabled: e.target.value === '1' })}><option value="0">No</option><option value="1">Yes</option></select></label>
              <label className="admin-field"><span className="admin-label">Label</span><input className="admin-input" value={config.lucky_daily_raider.label} onChange={(e) => updateLucky({ label: e.target.value })} /></label>
              <label className="admin-field"><span className="admin-label">Draw time UTC</span><input className="admin-input" value={config.lucky_daily_raider.draw_time_utc} onChange={(e) => updateLucky({ draw_time_utc: e.target.value })} /></label>
            </div>
            <div className="admin-form-grid three">
              <label className="admin-field">
                <span className="admin-label">Ticket rule</span>
                <select className="admin-select" value={config.lucky_daily_raider.ticket_metric || 'volume'} onChange={(e) => updateLucky({ ticket_metric: e.target.value })}>
                  <option value="volume">Volume only</option>
                  <option value="attack_wins">Winning attacks only</option>
                  <option value="attack_wins_plus_volume">Winning attacks + volume bonus</option>
                  <option value="volume_or_attack_wins">Volume OR winning attacks</option>
                  <option value="volume_and_attack_wins">Volume AND winning attacks</option>
                </select>
              </label>
              <NumberField label="$ volume step" value={config.lucky_daily_raider.volume_per_ticket_usd} onChange={(v) => updateLucky({ volume_per_ticket_usd: v })} />
              <NumberField label="Winning attacks per ticket" value={config.lucky_daily_raider.attack_wins_per_ticket || 10} onChange={(v) => updateLucky({ attack_wins_per_ticket: v })} />
            </div>
            <div className="admin-form-grid three">
              <NumberField label="Min winning attacks" value={config.lucky_daily_raider.min_attack_wins || 0} onChange={(v) => updateLucky({ min_attack_wins: v })} />
              <NumberField label="Min Town Hall" value={config.lucky_daily_raider.min_town_hall_level || 0} onChange={(v) => updateLucky({ min_town_hall_level: v })} />
              <NumberField label="Winner places" value={config.lucky_daily_raider.winner_count || 1} onChange={(v) => updateLucky({ winner_count: v })} />
            </div>
            <div className="admin-form-grid three">
              <NumberField label="Max tickets" value={config.lucky_daily_raider.max_tickets} onChange={(v) => updateLucky({ max_tickets: v })} />
              <NumberField label="Max counted attacks" value={config.lucky_daily_raider.max_counted_attacks || config.lucky_daily_raider.max_tickets || 50} onChange={(v) => updateLucky({ max_counted_attacks: v })} />
              <NumberField label="Volume tickets per step" value={config.lucky_daily_raider.volume_tickets_per_step || 1} onChange={(v) => updateLucky({ volume_tickets_per_step: v })} />
              <NumberField label="Max volume tickets" value={config.lucky_daily_raider.max_volume_tickets || 0} onChange={(v) => updateLucky({ max_volume_tickets: v })} />
            </div>
            <div className="admin-help">Volume bonus is configurable: $ volume step grants N volume tickets, capped by Max volume tickets. Set Max volume tickets to 0 or use a non-volume ticket rule to disable the trading bonus.</div>
            <div className="admin-card nested-card manual-winners-card">
              <div className="admin-card-head">
                <div>
                  <div className="admin-card-title">Reserved winners</div>
                  <div className="admin-card-sub">Optional override for the next daily draw. Reserved winners fill places first, then remaining places are picked by weighted random.</div>
                </div>
                {!!(config.lucky_daily_raider.manual_winners || []).length && (
                  <button className="admin-btn danger" onClick={() => setManualWinners([])}>Clear</button>
                )}
              </div>
              <div className="admin-card-body admin-grid">
                <div className="admin-filter-row manual-winner-add">
                  <input
                    className="admin-input"
                    value={manualWinnerDraft}
                    onChange={(e) => setManualWinnerDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualWinner();
                      }
                    }}
                    placeholder="Nickname, player_id, login wallet, linked wallet, or trading wallet"
                  />
                  <button className="admin-btn primary" onClick={addManualWinner}>Add reserved winner</button>
                </div>
                <div className="manual-winner-list">
                  {(config.lucky_daily_raider.manual_winners || []).map((winner, index) => (
                    <div className="manual-winner-row" key={`${winner}-${index}`}>
                      <div className="manual-winner-place">#{index + 1}</div>
                      <div className="manual-winner-name">{winner}</div>
                      <div className="manual-winner-actions">
                        <button className="admin-btn" onClick={() => moveManualWinner(index, -1)} disabled={index === 0}>Up</button>
                        <button className="admin-btn" onClick={() => moveManualWinner(index, 1)} disabled={index >= (config.lucky_daily_raider.manual_winners || []).length - 1}>Down</button>
                        <button className="admin-btn danger" onClick={() => removeManualWinner(index)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {!(config.lucky_daily_raider.manual_winners || []).length && (
                    <div className="admin-help">No reserved winners. The draw will use weighted random for all winner places.</div>
                  )}
                </div>
                <label className="admin-field">
                  <span className="admin-label">Bulk edit</span>
                  <textarea
                    className="admin-textarea"
                    rows={3}
                    placeholder={'One player per line. Example:\ngggg1\nSmartDrop'}
                    value={(config.lucky_daily_raider.manual_winners || []).join('\n')}
                    onChange={(e) => setManualWinners(e.target.value)}
                  />
                  <span className="admin-card-sub">Save the tournament after editing. If a reserved winner cannot be resolved, the run stores it in manual_unresolved and fills the place randomly.</span>
                </label>
              </div>
            </div>
            <div className="admin-form-grid three">
              <label className="admin-field"><span className="admin-label">NFT required</span><select className="admin-select" value={config.lucky_daily_raider.require_nft ? '1' : '0'} onChange={(e) => updateLucky({ require_nft: e.target.value === '1' })}><option value="0">No</option><option value="1">Yes</option></select></label>
            </div>
            {config.lucky_daily_raider.require_nft && (
              <div className="admin-choice-grid">
                {[
                  ['demon_king', 'Demon King'],
                  ['dragon', 'Dragon'],
                ].map(([collection, label]) => {
                  const active = (config.lucky_daily_raider.required_collections || []).includes(collection);
                  return (
                    <button
                      key={collection}
                      className={'admin-choice' + (active ? ' active' : '')}
                      onClick={() => {
                        const set = new Set(config.lucky_daily_raider.required_collections || []);
                        if (set.has(collection)) set.delete(collection);
                        else set.add(collection);
                        updateLucky({ required_collections: Array.from(set) });
                      }}
                    >
                      <strong>{label}</strong>
                    </button>
                  );
                })}
              </div>
            )}
            <RewardRowsEditor
              rewards={config.lucky_daily_raider.rewards || []}
              onChange={(rewards) => updateLucky({ rewards })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RewardSchedulePoolEditor({
  pool,
  index,
  updatePool,
  removePool,
  daily = false,
  tournamentDays = [],
}) {
  function update(patch) {
    updatePool(index, patch);
  }
  return (
    <div className="admin-card nested-card">
      <div className="admin-card-head">
        <div><div className="admin-card-title">{pool.label || `Pool ${index + 1}`}</div><div className="admin-card-sub">Top winners and reward rows are fully editable.</div></div>
        <button className="admin-btn danger" onClick={() => removePool(index)}>Remove pool</button>
      </div>
      <div className="admin-card-body admin-grid">
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Enabled</span><select className="admin-select" value={pool.enabled ? '1' : '0'} onChange={(e) => update({ enabled: e.target.value === '1' })}><option value="0">No</option><option value="1">Yes</option></select></label>
          <label className="admin-field"><span className="admin-label">Label</span><input className="admin-input" value={pool.label || ''} onChange={(e) => update({ label: e.target.value })} /></label>
          <NumberField label="Top winners" value={pool.top_n || 5} onChange={(v) => update({ top_n: v })} />
            <label className="admin-field"><span className="admin-label">Metric</span><MetricSelect value={pool.metric || 'points'} onChange={(value) => update({ metric: value })} /></label>
        </div>
        {daily && (
          <div className="admin-form-grid three daily-reward-targets">
            <label className="admin-field">
              <span className="admin-label">Reward day UTC</span>
              {tournamentDays.length ? (
                <select className="admin-select" value={pool.day_utc || ''} onChange={(event) => update({ day_utc: event.target.value })}>
                  <option value="">Every tournament day</option>
                  {tournamentDays.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              ) : (
                <input className="admin-input" type="date" value={pool.day_utc || ''} onChange={(event) => update({ day_utc: event.target.value })} />
              )}
            </label>
            <NumberField label="Daily volume target ($)" value={pool.volume_target_usd || 0} onChange={(value) => update({ volume_target_usd: value })} />
            <label className="admin-field">
              <span className="admin-label">Target applies to</span>
              <select className="admin-select" value={pool.volume_target_scope || 'player'} onChange={(event) => update({ volume_target_scope: event.target.value })}>
                <option value="player">Each player</option>
                <option value="tournament">Whole tournament</option>
              </select>
            </label>
          </div>
        )}
        <RewardRowsEditor rewards={pool.rewards || []} onChange={(rewards) => update({ rewards })} />
      </div>
    </div>
  );
}

function RewardRowsEditor({ rewards, onChange }) {
  function updateReward(rewardIndex, patch) {
    const next = [...(rewards || [])];
    const reward = normalizeReward({ ...next[rewardIndex], ...patch });
    if ('pool_amount' in patch || 'winners' in patch || 'preset' in patch || 'type' in patch) reward.payouts = buildPayouts(reward);
    next[rewardIndex] = reward;
    onChange(next);
  }
  function addReward(type) {
    onChange([...(rewards || []), normalizeReward(rewardDefaults(type))]);
  }
  function removeReward(rewardIndex) {
    onChange((rewards || []).filter((_, idx) => idx !== rewardIndex));
  }
  return (
    <div className="admin-grid">
      {(rewards || []).map((reward, rewardIndex) => (
        <div className="reward-row" key={rewardIndex}>
          <div className="admin-form-grid three">
            <label className="admin-field"><span className="admin-label">Type</span><select className="admin-select" value={reward.type} onChange={(e) => updateReward(rewardIndex, rewardDefaults(e.target.value))}><option value="money">Money</option><option value="points">Points</option><option value="amp">AMP</option><option value="nft">NFT</option><option value="custom">Custom</option></select></label>
            <label className="admin-field"><span className="admin-label">Name</span><input className="admin-input" value={reward.label} onChange={(e) => updateReward(rewardIndex, { label: e.target.value })} /></label>
            <label className="admin-field"><span className="admin-label">Unit</span><input className="admin-input" value={reward.type === 'money' ? reward.currency : reward.unit} onChange={(e) => updateReward(rewardIndex, reward.type === 'money' ? { currency: e.target.value, unit: e.target.value } : { unit: e.target.value })} /></label>
          </div>
          <div className="admin-form-grid three">
            <NumberField label="Pool" value={reward.pool_amount} onChange={(v) => updateReward(rewardIndex, { pool_amount: v })} />
            <NumberField label="Winners" value={reward.winners} onChange={(v) => updateReward(rewardIndex, { winners: v })} />
            <label className="admin-field"><span className="admin-label">Preset</span><select className="admin-select" value={reward.preset} onChange={(e) => updateReward(rewardIndex, { preset: e.target.value })}>{PRIZE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
          </div>
          <div className="payout-grid">
            {(reward.payouts || []).map((payout, pIndex) => (
              <div className="admin-field" key={pIndex}>
                <span className="admin-label">Rank {payout.rank}</span>
                <input className="admin-input" type="number" value={payout.amount} onChange={(e) => {
                  const payouts = [...(reward.payouts || [])];
                  payouts[pIndex] = { ...payout, amount: Number(e.target.value) || 0 };
                  updateReward(rewardIndex, { payouts });
                }} />
              </div>
            ))}
          </div>
          <button className="admin-btn danger" onClick={() => removeReward(rewardIndex)}>Remove reward</button>
        </div>
      ))}
      <div className="admin-filter-row">
        {['money', 'points', 'amp', 'nft', 'custom'].map((type) => <button className="admin-btn" key={type} onClick={() => addReward(type)}>+ {type}</button>)}
      </div>
    </div>
  );
}

function PrizeTierEditor({ tier, index, updateTier, removeTier }) {
  function updateReward(rewardIndex, patch) {
    const rewards = [...(tier.rewards || [])];
    const reward = normalizeReward({ ...rewards[rewardIndex], ...patch });
    if ('pool_amount' in patch || 'winners' in patch || 'preset' in patch || 'type' in patch) reward.payouts = buildPayouts(reward);
    rewards[rewardIndex] = reward;
    updateTier(index, { rewards });
  }
  function addReward(type) {
    updateTier(index, { rewards: [...(tier.rewards || []), normalizeReward(rewardDefaults(type))] });
  }
  function removeReward(rewardIndex) {
    updateTier(index, { rewards: (tier.rewards || []).filter((_, i) => i !== rewardIndex) });
  }
  return (
    <div className="prize-tier">
      <div className="admin-toolbar">
        <label className="admin-field" style={{ minWidth: 220 }}>
          <span className="admin-label">Total volume unlock ($)</span>
          <input className="admin-input" type="number" value={tier.volume_usd} onChange={(e) => updateTier(index, { volume_usd: Number(e.target.value) || 0 })} />
        </label>
        <button className="admin-btn danger" onClick={() => removeTier(index)}>Remove tier</button>
      </div>
      {(tier.rewards || []).map((reward, rewardIndex) => (
        <div className="reward-row" key={rewardIndex}>
          <div className="admin-form-grid three">
            <label className="admin-field"><span className="admin-label">Type</span><select className="admin-select" value={reward.type} onChange={(e) => updateReward(rewardIndex, rewardDefaults(e.target.value))}><option value="money">Money</option><option value="points">Points</option><option value="amp">AMP</option><option value="nft">NFT</option><option value="custom">Custom</option></select></label>
            <label className="admin-field"><span className="admin-label">Name</span><input className="admin-input" value={reward.label} onChange={(e) => updateReward(rewardIndex, { label: e.target.value })} /></label>
            <label className="admin-field"><span className="admin-label">Unit</span><input className="admin-input" value={reward.type === 'money' ? reward.currency : reward.unit} onChange={(e) => updateReward(rewardIndex, reward.type === 'money' ? { currency: e.target.value, unit: e.target.value } : { unit: e.target.value })} /></label>
          </div>
          <div className="admin-form-grid three">
            <NumberField label="Pool" value={reward.pool_amount} onChange={(v) => updateReward(rewardIndex, { pool_amount: v })} />
            <NumberField label="Winners" value={reward.winners} onChange={(v) => updateReward(rewardIndex, { winners: v })} />
            <label className="admin-field"><span className="admin-label">Preset</span><select className="admin-select" value={reward.preset} onChange={(e) => updateReward(rewardIndex, { preset: e.target.value })}>{PRIZE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
          </div>
          <div className="payout-grid">
            {(reward.payouts || []).map((payout, pIndex) => (
              <div className="admin-field" key={pIndex}>
                <span className="admin-label">Rank {payout.rank}</span>
                <input className="admin-input" type="number" value={payout.amount} onChange={(e) => {
                  const payouts = [...(reward.payouts || [])];
                  payouts[pIndex] = { ...payout, amount: Number(e.target.value) || 0 };
                  updateReward(rewardIndex, { payouts });
                }} />
              </div>
            ))}
          </div>
          <button className="admin-btn danger" onClick={() => removeReward(rewardIndex)}>Remove reward</button>
        </div>
      ))}
      <div className="admin-filter-row">
        {['money', 'points', 'amp', 'nft', 'custom'].map((type) => <button className="admin-btn" key={type} onClick={() => addReward(type)}>+ {type}</button>)}
      </div>
    </div>
  );
}

function TournamentReviewStep({ form }) {
  const body = formToTournamentBody(form);
  return (
    <div className="admin-grid">
      <div className="admin-card">
        <div className="admin-card-head"><div><div className="admin-card-title">Review</div><div className="admin-card-sub">This is the payload that will be saved through the existing admin API.</div></div></div>
        <div className="admin-card-body">
          <pre className="admin-mono admin-scroll" style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 520 }}>{JSON.stringify(body, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function LeaderboardDrawer({ data, onClose }) {
  const rows = data.leaderboard || [];
  const t = data.tournament || {};
  const summary = data.summary || {};
  const [contactDrafts, setContactDrafts] = useState({});
  const [contactBusy, setContactBusy] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const contactKey = (row) => String(row.player_id || row.rank || '');
  const contactDraft = (row) => {
    const key = contactKey(row);
    return contactDrafts[key] || {
      wallet: row.reward_wallet_evm || row.reward_wallet_solana || '',
      twitter: row.twitter_handle || '',
    };
  };
  const setContactDraft = (row, patch) => {
    const key = contactKey(row);
    setContactDrafts((prev) => ({
      ...prev,
      [key]: { ...contactDraft(row), ...patch },
    }));
  };
  async function saveParticipantContact(row) {
    const key = contactKey(row);
    if (!t.id || !row.player_id || contactBusy) return;
    const draft = contactDraft(row);
    setContactBusy(key);
    setContactMessage('');
    try {
      const result = await adminPatch(`/admin/tournaments/${t.id}/participants/${encodeURIComponent(row.player_id)}/contact`, {
        reward_wallet: draft.wallet,
        twitter_handle: draft.twitter,
      });
      row.reward_wallet_evm = result.reward_wallet_evm || '';
      row.reward_wallet_solana = result.reward_wallet_solana || '';
      row.twitter_handle = result.twitter_handle || '';
      setContactDrafts((prev) => ({
        ...prev,
        [key]: {
          wallet: result.reward_wallet_evm || result.reward_wallet_solana || '',
          twitter: result.twitter_handle || '',
        },
      }));
      setContactMessage(`Saved contact for ${row.name || row.player_id}.`);
    } catch (err) {
      setContactMessage(err?.message || 'Contact save failed.');
    } finally {
      setContactBusy('');
    }
  }
  const visibleTotals = rows.reduce((acc, row) => {
    acc.trades_count += Number(row.trades_count || 0);
    acc.total_volume_usd += Number(row.volume_usd || 0);
    acc.pnl_usd += Number(row.pnl_usd || 0);
    acc.gold += Number(row.gold || 0);
    acc.trophies += Number(row.trophies || 0);
    return acc;
  }, { trades_count: 0, total_volume_usd: 0, pnl_usd: 0, gold: 0, trophies: 0 });
  const tournamentStats = {
    players: Number(summary.players ?? rows.length) || 0,
    trades_count: Number(summary.trades_count ?? visibleTotals.trades_count) || 0,
    total_volume_usd: Number(summary.total_volume_usd ?? t.prize_total_volume_usd ?? visibleTotals.total_volume_usd) || 0,
    pnl_usd: Number(summary.pnl_usd ?? visibleTotals.pnl_usd) || 0,
    gold: Number(summary.gold ?? visibleTotals.gold) || 0,
    trophies: Number(summary.trophies ?? visibleTotals.trophies) || 0,
  };
  return (
    <Drawer title={`Leaderboard · #${t.id} ${t.name || ''}`} subtitle={`${rows.length} players · sort ${data.sort_label || t.sort_by || '-'}`} onClose={onClose}>
      <div className="admin-stats" style={{ marginBottom: 16 }}>
        <div className="admin-stat">
          <div className="admin-stat-value" style={{ color: 'var(--admin-blue)' }}>{fmtUsd(tournamentStats.total_volume_usd, 0)}</div>
          <div className="admin-stat-label">Total volume</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-value">{tournamentStats.trades_count.toLocaleString()}</div>
          <div className="admin-stat-label">Total trades</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-value">{tournamentStats.players.toLocaleString()}</div>
          <div className="admin-stat-label">Active players</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-value" style={{ color: tournamentStats.pnl_usd >= 0 ? 'var(--admin-green)' : 'var(--admin-red)' }}>{fmtUsd(tournamentStats.pnl_usd, 2)}</div>
          <div className="admin-stat-label">Total PnL</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-value" style={{ color: 'var(--admin-gold)' }}>{Math.round(tournamentStats.gold).toLocaleString()}</div>
          <div className="admin-stat-label">Gold earned</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-value">{Math.round(tournamentStats.trophies).toLocaleString()}</div>
          <div className="admin-stat-label">Trophies</div>
        </div>
      </div>
      {contactMessage ? <div className={/fail|error|required/i.test(contactMessage) ? 'admin-error' : 'admin-help'} style={{ marginBottom: 12 }}>{contactMessage}</div> : null}
      <div className="admin-table-wrap admin-scroll">
        <table className="admin-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Sector</th><th>Top DEX</th><th>Team</th><th>Trading wallet</th><th>Score</th><th>Trophies</th><th>Gold</th><th>Trades</th><th>Volume</th><th>PnL</th><th>Prize / Contact</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const rewardWallet = compactWallet(r.reward_wallet_evm || r.reward_wallet_solana);
              const tradingWallet = compactWallet(r.trading_wallet);
              const dexBreakdown = Array.isArray(r.dex_breakdown) ? r.dex_breakdown.slice(0, 4) : [];
              const draft = contactDraft(r);
              const busyKey = contactBusy === contactKey(r);
              return (
                <tr key={r.player_id || r.rank}>
                  <td>{r.rank}</td>
                  <td>
                    <strong>{r.name || short(r.wallet)}</strong>
                    {r.wallet ? <div className="admin-card-sub admin-mono admin-wallet-line">{short(r.wallet, 10, 6)}</div> : null}
                  </td>
                  <td>
                    {r.mega_sector_name || '-'}
                    {r.town_hall_level ? <div className="admin-card-sub">TH {r.town_hall_level}</div> : null}
                  </td>
                  <td>
                    {r.top_dex_label || r.trading_dex || '-'}
                    {dexBreakdown.map((item) => (
                      <div key={item.dex} className="admin-card-sub">{item.label}: {fmtUsd(item.volume_usd || 0, 0)}</div>
                    ))}
                  </td>
                  <td>{r.team_label || r.dex || '-'}</td>
                  <td>
                    {tradingWallet || '-'}
                    {r.trading_account_id ? <div className="admin-card-sub admin-mono admin-wallet-line">Acct {short(r.trading_account_id, 10, 6)}</div> : null}
                    {(r.trading_dex || r.trading_chain_type) ? <div className="admin-card-sub">{[r.trading_dex, r.trading_chain_type].filter(Boolean).join(' · ')}</div> : null}
                  </td>
                  <td>{Number(r.score || 0).toFixed(2)}</td>
                  <td>{r.trophies || 0}</td>
                  <td>{r.gold || 0}</td>
                  <td>{r.trades_count || 0}</td>
                  <td>{fmtUsd(r.volume_usd || 0)}</td>
                  <td style={{ color: Number(r.pnl_usd || 0) >= 0 ? 'var(--admin-green)' : 'var(--admin-red)' }}>{fmtUsd(r.pnl_usd || 0, 2)}</td>
                  <td>
                    {Number(r.prize_amount || 0) > 0 ? fmtUsd(r.prize_amount, 2) : '-'}
                    {rewardWallet ? <div className="admin-card-sub admin-mono admin-wallet-line">{rewardWallet}</div> : null}
                    {r.twitter_handle ? <div className="admin-card-sub">{r.twitter_handle}</div> : null}
                    <div className="admin-grid" style={{ gap: 6, marginTop: 8, minWidth: 220 }}>
                      <input
                        className="admin-input admin-mono"
                        value={draft.wallet}
                        onChange={(e) => setContactDraft(r, { wallet: e.target.value })}
                        placeholder="Reward wallet"
                        style={{ minWidth: 0 }}
                      />
                      <input
                        className="admin-input"
                        value={draft.twitter}
                        onChange={(e) => setContactDraft(r, { twitter: e.target.value })}
                        placeholder="@twitter"
                        style={{ minWidth: 0 }}
                      />
                      <button className="admin-btn" onClick={() => saveParticipantContact(r)} disabled={busyKey}>
                        {busyKey ? 'Saving...' : 'Save contact'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

function ReplaysPanel({ replays }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const rows = replays.filter((r) => {
    const resultOk = filter === 'all' || r.verified_result === filter;
    const hay = `${r.attacker_name || ''} ${r.defender_name || ''}`.toLowerCase();
    return resultOk && (!search || hay.includes(search.toLowerCase()));
  });
  return (
    <div className="admin-card">
      <div className="admin-card-head"><div><div className="admin-card-title">Battle Replays</div><div className="admin-card-sub">Verification result history with sticky headers and horizontal scroll.</div></div></div>
      <div className="admin-card-body">
        <div className="admin-toolbar">
          <div className="admin-filter-row">
            <select className="admin-select" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select>
            <input className="admin-input" placeholder="Attacker or defender" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="admin-help">{rows.length} shown</span>
        </div>
        <div className="admin-table-wrap admin-scroll">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Attacker</th><th>Defender</th><th>Claimed</th><th>Verified</th><th>Reason</th><th>TH HP</th><th>Destroyed</th><th>Loot</th><th>Duration</th><th>Date</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td className="admin-mono">{r.id}</td><td>{r.attacker_name}</td><td>{r.defender_name}</td><td>{r.claimed_result}</td><td><span className={'admin-badge ' + (r.verified_result === 'accepted' ? 'green' : 'red')}>{r.verified_result}</span></td><td>{r.verification_reason}</td><td>{r.sim_th_hp_pct != null ? Math.round(r.sim_th_hp_pct * 100) + '%' : '-'}</td><td>{r.sim_buildings_destroyed || 0}</td><td>G:{r.loot_gold || 0} W:{r.loot_wood || 0} O:{r.loot_ore || 0}</td><td>{r.duration_sec ? Math.round(r.duration_sec) + 's' : '-'}</td><td className="admin-mono">{fmtTime(r.created_at)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ data }) {
  if (!data) return <LoadingCard title="Stats" />;
  const dexRows = data.dex?.players_by_dex || [];
  const rewardRows = data.dex?.rewards_by_dex || [];
  const activityRows = data.activity?.by_dex || [];
  const thRows = data.player_analytics?.town_hall?.distribution || [];
  const deviceRows = data.devices?.summary || [];
  const playerRows = data.player_analytics?.players || [];
  const mm = data.matchmaking || {};
  const mmSummary = mm.summary || {};
  const troopBalance = mm.troop_balance || {};
  const mmDecided = Number(mmSummary.decided_raids || 0);
  const mmRaids = Number(mmSummary.raids || 0);
  const mmRiskRows = mm.battle_risk_players || [];
  const mmTargetLow = Number(mm.target_band?.min ?? 0.55);
  const mmTargetHigh = Number(mm.target_band?.max ?? 0.6);
  const mmSuccess = Number.isFinite(Number(mmSummary.success_rate)) ? Number(mmSummary.success_rate) : null;
  const mmTone = mmSuccess == null ? 'gold' : (mmSuccess >= mmTargetLow && mmSuccess <= mmTargetHigh ? 'green' : 'red');
  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Players', value: data.players || 0 },
        { label: 'Online now', value: data.activity?.online_now || 0, tone: 'green' },
        { label: 'Active 24h', value: data.activity?.active_24h || 0, tone: 'blue' },
        { label: 'Buildings', value: data.buildings || 0 },
        { label: 'Replays', value: data.replays || 0 },
        { label: 'Memory MB', value: data.memory || 0, tone: 'gold' },
      ]} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Matchmaking Health</div>
            <div className="admin-card-sub">Last {mm.days || 7} days. Target win rate {formatPct(mmTargetLow)}-{formatPct(mmTargetHigh)} with bot recovery tracked separately.</div>
          </div>
          {mm.error ? <span className="admin-badge red">API error</span> : <span className={'admin-badge ' + (mmTone === 'green' ? 'green' : mmTone === 'red' ? 'red' : 'gold')}>{formatPct(mmSuccess)}</span>}
        </div>
        <div className="admin-card-body admin-grid">
          {mm.error ? <div className="admin-error">{mm.error}</div> : null}
          <StatsGrid stats={[
            { label: 'Raids', value: num(mmRaids) },
            { label: 'Decided', value: num(mmDecided), tone: 'blue' },
            { label: 'Win rate', value: formatPct(mmSuccess), tone: mmTone },
            { label: 'Bot matches', value: `${num(mmSummary.bot_matches || 0)} (${formatPct(mmRaids ? Number(mmSummary.bot_matches || 0) / mmRaids : null)})`, tone: 'gold' },
            { label: 'Recovery', value: num(mmSummary.recovery_matches || 0), tone: 'blue' },
            { label: 'Captcha flags', value: num(mm.captcha_required_count || mmRiskRows.length), tone: mmRiskRows.length ? 'red' : 'green' },
            { label: 'Avg base ratio', value: ratioText(mmSummary.avg_base_power_ratio), tone: 'green' },
          ]} />
          <CompactTable
            title="Battle Risk Flags"
            subtitle={`Red flag = captcha_required for future CAPTCHA/prize eligibility. Thresholds: ${mm.battle_risk_thresholds?.burstAttackStarts || 40}+ attacks/15m, >${mm.battle_risk_thresholds?.dailyAttackStartsExclusive || 500}/24h, or repeated ship deployment ${mm.battle_risk_thresholds?.shipDeployMinRepeats || 6}/${mm.battle_risk_thresholds?.shipDeployMinSamples || 8}+ at ${Math.round((mm.battle_risk_thresholds?.shipDeployMinRatio || 0.75) * 100)}%+.`}
            columns={['Player', 'DEX', '15m', '24h', 'Results', 'Ship pattern', 'Wins', 'Rejected', 'IP players', 'Reasons']}
            rows={mmRiskRows.map((row) => [
              row.name || short(row.player_id),
              DEX_LABELS[row.dex] || row.dex || '-',
              num(row.attack_starts_15m),
              num(row.attack_starts_24h),
              num(row.submitted_results_24h),
              battleRiskShipPatternText(row),
              num(row.accepted_wins_24h),
              num(row.rejected_results_24h),
              num(row.ip_players_24h),
              <BattleRiskBadges risk={row} />,
            ])}
          />
          <div className="admin-grid two">
            <CompactTable title="By Town Hall" subtitle="Success rate and bot usage grouped by attacker TH." columns={['TH', 'Raids', 'Win rate', 'Bot', 'Recovery', 'Base ratio']} rows={(mm.by_th || []).map((row) => [`TH ${row.attacker_th || 1}`, num(row.raids), formatPct(row.success_rate), num(row.bot_matches), num(row.recovery_matches), ratioText(row.avg_base_power_ratio)])} />
            <CompactTable title="By Target Type" subtitle="Live bases vs generated bot bases and selected difficulty bucket." columns={['Target', 'Bucket', 'Raids', 'Win rate', 'Recovery', 'Base ratio']} rows={(mm.by_target || []).map((row) => [row.target_type || '-', row.bucket || '-', num(row.raids), formatPct(row.success_rate), num(row.recovery_matches), ratioText(row.avg_base_power_ratio)])} />
          </div>
          <div className="admin-grid two">
            <CompactTable title="Players Matchmaking" subtitle="Per-player 7d telemetry used to spot players below the target band." columns={['Player', 'TH', 'Raids', 'Win rate', 'Bot share', 'Recovery']} rows={(mm.by_player || []).map((row) => [row.name || short(row.id), `TH ${row.th_level || 1}`, num(row.raids), formatPct(row.success_rate), formatPct(row.bot_share), num(row.recovery_matches)])} />
            <CompactTable title="Bot Base Inventory" subtitle="96 templates are kept in memory; temporary target rows are materialized only during selection." columns={['TH', 'Difficulty', 'Templates', 'Active targets']} rows={(mm.bot_templates || []).map((row) => {
              const active = (mm.active_bot_targets || []).find((target) => Number(target.th) === Number(row.th) && String(target.difficulty || '') === String(row.difficulty || ''));
              return [`TH ${row.th}`, row.difficulty, num(row.templates), num(active?.active_targets || 0)];
            })} />
          </div>
          <div className="admin-card" style={{ boxShadow: 'none' }}>
            <div className="admin-card-head">
              <div>
                <div className="admin-card-title">Troop Balance Analytics</div>
                <div className="admin-card-sub">
                  Server-accepted decided battles only. {num(troopBalance.analyzed_battles || 0)} of {num(troopBalance.accepted_replays || 0)} accepted replays analyzed; overall win rate {formatPct(troopBalance.overall_win_rate)}.
                  Summoned skeletons and split forms are excluded because they were not selected by the player. High/low win signals require at least {num(troopBalance.sample_thresholds?.directional || 10)} battles and show correlation, not proof of causation.
                </div>
              </div>
              {troopBalance.capped ? <span className="admin-badge gold">Latest {num(troopBalance.replay_limit)} only</span> : <span className="admin-badge green">Complete window</span>}
            </div>
            <div className="admin-card-body admin-grid">
              <div className="admin-grid two">
                <CompactTable
                  title="Unit Usage & Win Rate"
                  subtitle="Battle share measures how often a unit appears; deployed is the actual number placed."
                  columns={['Unit', 'Battles', 'Share', 'Deployed', 'Avg', 'Win rate', 'vs all', 'TH damage', 'Signal']}
                  rows={(troopBalance.by_unit || []).map((row) => [
                    row.label || row.troop_type,
                    num(row.battles),
                    formatPct(row.battle_share),
                    num(row.units_deployed),
                    Number(row.avg_deployed_per_battle || 0).toFixed(1),
                    formatPct(row.win_rate),
                    formatSignedPct(row.win_rate_delta),
                    formatPct(row.avg_town_hall_damage),
                    <TroopBalanceBadges row={row} />,
                  ])}
                />
                <CompactTable
                  title="Unit Pair Synergies"
                  subtitle="Two selected troop types appearing in the same accepted battle."
                  columns={['Pair', 'Battles', 'Share', 'Avg army', 'Win rate', 'vs all', 'Signal']}
                  rows={(troopBalance.by_pair || []).map((row) => [
                    row.label,
                    num(row.battles),
                    formatPct(row.battle_share),
                    Number(row.avg_deployed_per_battle || 0).toFixed(1),
                    formatPct(row.win_rate),
                    formatSignedPct(row.win_rate_delta),
                    <TroopBalanceBadges row={row} />,
                  ])}
                />
              </div>
              <div className="admin-grid two">
                <CompactTable
                  title="Exact Army Rosters"
                  subtitle="Exact unique troop-type roster, regardless of deployment order."
                  columns={['Roster', 'Battles', 'Share', 'Avg army', 'Win rate', 'vs all', 'Signal']}
                  rows={(troopBalance.by_roster || []).map((row) => [
                    row.label,
                    num(row.battles),
                    formatPct(row.battle_share),
                    Number(row.avg_deployed_per_battle || 0).toFixed(1),
                    formatPct(row.win_rate),
                    formatSignedPct(row.win_rate_delta),
                    <TroopBalanceBadges row={row} />,
                  ])}
                />
                <CompactTable
                  title="Unit Win Rate by Town Hall"
                  subtitle="Win-rate deviation is measured against all analyzed armies at the same attacker TH."
                  columns={['TH', 'Unit', 'Battles', 'TH share', 'Win rate', 'TH avg', 'vs TH', 'Signal']}
                  rows={(troopBalance.by_unit_town_hall || []).map((row) => [
                    `TH ${row.town_hall_level}`,
                    row.label || row.troop_type,
                    num(row.battles),
                    formatPct(row.battle_share),
                    formatPct(row.win_rate),
                    formatPct(row.town_hall_win_rate),
                    formatSignedPct(row.win_rate_delta),
                    <TroopBalanceBadges row={row} />,
                  ])}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="admin-grid two">
        <CompactTable title="DEX Adoption" subtitle="Player count, active buckets, and trading reward volume by DEX." columns={['DEX', 'Players', 'Online', '24h', '7d', 'Reward Gold', 'Reward Vol']} rows={dexRows.map((row) => {
          const activity = activityRows.find((r) => r.dex === row.dex) || {};
          const rewards = rewardRows.find((r) => r.dex === row.dex) || {};
          return [DEX_LABELS[row.dex] || row.dex || 'Unknown', row.n || 0, activity.online_now || 0, activity.active_24h || 0, activity.active_7d || 0, num(rewards.total_gold), fmtUsd(rewards.total_volume || 0)];
        })} />
        <CompactTable title="Town Hall Distribution" subtitle={`Average TH ${data.player_analytics?.town_hall?.average || 0}.`} columns={['TH', 'Players', 'Share']} rows={thRows.map((row) => [`TH ${row.th_level}`, row.players, `${row.pct || 0}%`])} />
      </div>
      <div className="admin-grid two">
        <CompactTable title="Device Families" subtitle="Built from player heartbeat and latest client log UA." columns={['Device', 'Players', 'Online', '24h', 'Latest']} rows={deviceRows.map((row) => [row.label, row.players, row.online_now, row.active_24h, fmtTime(row.latest_at)])} />
        <CompactTable title="Top Players" subtitle="Highest trophy accounts." columns={['Player', 'DEX', 'Trophies', 'Gold', 'Wood', 'Ore']} rows={(data.topPlayers || []).map((p) => [p.name, DEX_LABELS[p.dex] || p.dex || '-', p.trophies, num(p.gold), num(p.wood), num(p.ore)])} />
      </div>
      <div className="admin-card">
        <div className="admin-card-head">
          <div><div className="admin-card-title">Player Activity Export View</div><div className="admin-card-sub">Top 200 recent players with activity, sessions, battles, futures volume, and last action.</div></div>
        </div>
        <div className="admin-card-body">
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead><tr><th>Player</th><th>DEX</th><th>TH</th><th>Active 7d</th><th>Sessions</th><th>Avg Session</th><th>Battles</th><th>Futures Vol</th><th>Trades</th><th>Last Action</th></tr></thead>
              <tbody>
                {playerRows.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><div className="admin-card-sub admin-mono">{p.id}</div></td>
                    <td>{DEX_LABELS[p.dex] || p.dex}</td>
                    <td>{p.th_level}</td>
                    <td>{p.active_days_7d}</td>
                    <td>{p.sessions_7d}</td>
                    <td>{p.avg_session_min_7d}m</td>
                    <td>{p.accepted_battles_7d}/{p.battles_7d}</td>
                    <td>{fmtUsd(p.futures_volume_usd || 0)}</td>
                    <td>{p.futures_trades_count || 0}</td>
                    <td>{fmtTime(p.last_action_at)}<div className="admin-card-sub">{p.last_action || '-'}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function clashDatetimeLocalNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fmtClashAmount(value) {
  const raw = String(value ?? '0').trim() || '0';
  const [wholeRaw, fractionRaw = ''] = raw.split('.');
  let whole = wholeRaw;
  try { whole = BigInt(wholeRaw || '0').toLocaleString('en-US'); } catch { /* keep raw */ }
  const fraction = fractionRaw.replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} CLASH`;
}

function ClashTransactionsPanel({ data, reload }) {
  const summary = data?.clash || {};
  const rows = Array.isArray(data?.transactions) ? data.transactions : [];
  const [form, setForm] = useState({
    event_type: 'buyback',
    amount_clash: '',
    usd_value_usd: '',
    tx_signature: '',
    occurred_at: clashDatetimeLocalNow(),
    public_note: '',
  });
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function update(key, value) {
    setReviewing(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function publish(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const amount = form.amount_clash.trim();
    const signature = form.tx_signature.trim();
    if (!amount || Number(amount) <= 0) return setError('Enter a CLASH amount greater than zero.');
    if (!signature) return setError('Enter the Solana transaction signature.');
    const occurredAt = new Date(form.occurred_at);
    if (!Number.isFinite(occurredAt.getTime())) return setError('Choose a valid transaction date and time.');
    const label = form.event_type === 'burn' ? 'burn' : 'buyback';
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    const confirmation = [
      `Publish this ${label} transaction publicly?`,
      `Amount: ${amount} CLASH`,
      `USD value: ${form.usd_value_usd.trim() || '-'}`,
      `Occurred: ${occurredAt.toISOString()}`,
      `Signature: ${signature}`,
      'This ledger is append-only.',
    ].join('\n');
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    try {
      await adminPost('/admin/clash-transactions', {
        ...form,
        amount_clash: amount,
        usd_value_usd: form.usd_value_usd.trim() || null,
        tx_signature: signature,
        occurred_at: occurredAt.toISOString(),
        public_note: form.public_note.trim() || null,
      });
      setMessage(`${form.event_type === 'burn' ? 'Burn' : 'Buyback'} transaction published.`);
      setReviewing(false);
      setForm((current) => ({
        ...current,
        amount_clash: '',
        usd_value_usd: '',
        tx_signature: '',
        occurred_at: clashDatetimeLocalNow(),
        public_note: '',
      }));
      try {
        await reload();
      } catch (refreshError) {
        setMessage(`Transaction published, but history refresh failed: ${refreshError.message || 'refresh unavailable'}`);
      }
    } catch (err) {
      setError(err.message || 'Failed to publish transaction.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <LoadingCard title="$CLASH" />;

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Tokens bought back', value: fmtClashAmount(summary.bought_back_tokens), tone: 'green' },
        { label: 'Tokens burned', value: fmtClashAmount(summary.burned_tokens), tone: 'red' },
        { label: 'Published transactions', value: summary.transactions_count || 0, tone: 'gold' },
      ]} />

      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Publish $CLASH transaction</div>
            <div className="admin-card-sub">Buybacks and burns become public on /dashboard immediately. Published financial history is append-only.</div>
          </div>
          <span className="admin-badge gold">Solana mainnet</span>
        </div>
        <form className="admin-card-body admin-grid" onSubmit={publish}>
          <div className="admin-choice-grid">
            {[
              { id: 'buyback', label: 'Buyback', hint: 'Tokens purchased back' },
              { id: 'burn', label: 'Burn', hint: 'Tokens permanently burned' },
            ].map((option) => (
              <button
                key={option.id}
                className={'admin-choice' + (form.event_type === option.id ? ' active' : '')}
                type="button"
                onClick={() => update('event_type', option.id)}
                aria-pressed={form.event_type === option.id}
              >
                <strong>{option.label}</strong><span>{option.hint}</span>
              </button>
            ))}
          </div>
          <div className="admin-form-grid three">
            <label className="admin-field">
              <span className="admin-label">Amount (CLASH)</span>
              <input className="admin-input" inputMode="decimal" placeholder="1000000" value={form.amount_clash} onChange={(event) => update('amount_clash', event.target.value)} required />
            </label>
            <label className="admin-field">
              <span className="admin-label">{form.event_type === 'buyback' ? 'USD spent (optional)' : 'USD value (optional)'}</span>
              <input className="admin-input" inputMode="decimal" placeholder="0.00" value={form.usd_value_usd} onChange={(event) => update('usd_value_usd', event.target.value)} />
            </label>
            <label className="admin-field">
              <span className="admin-label">Occurred at</span>
              <input className="admin-input" type="datetime-local" value={form.occurred_at} onChange={(event) => update('occurred_at', event.target.value)} required />
            </label>
          </div>
          <label className="admin-field">
            <span className="admin-label">Solana transaction signature</span>
            <input className="admin-input admin-mono" autoComplete="off" value={form.tx_signature} onChange={(event) => update('tx_signature', event.target.value)} required />
          </label>
          <label className="admin-field">
            <span className="admin-label">Public note (optional, {form.public_note.length}/180)</span>
            <textarea className="admin-textarea" maxLength={180} value={form.public_note} onChange={(event) => update('public_note', event.target.value)} placeholder="This text will be visible to everyone on the public dashboard." />
          </label>
          {reviewing && (
            <div className="admin-card nested-card" role="region" aria-label="Transaction review">
              <div className="admin-card-head">
                <div><div className="admin-card-title">Review before publishing</div><div className="admin-card-sub">Confirm every public value. This financial record cannot be edited or deleted.</div></div>
                <span className={'admin-badge ' + (form.event_type === 'burn' ? 'red' : 'green')}>{form.event_type === 'burn' ? 'Burn' : 'Buyback'}</span>
              </div>
              <div className="admin-card-body admin-grid">
                <div className="admin-form-grid three">
                  <div><div className="admin-label">Amount</div><strong>{fmtClashAmount(form.amount_clash)}</strong></div>
                  <div><div className="admin-label">USD value</div><strong>{form.usd_value_usd.trim() ? fmtUsd(Number(form.usd_value_usd)) : '-'}</strong></div>
                  <div><div className="admin-label">Occurred</div><strong>{new Date(form.occurred_at).toLocaleString()}</strong></div>
                </div>
                <div><div className="admin-label">Transaction signature</div><div className="admin-mono">{form.tx_signature.trim()}</div></div>
                <div><div className="admin-label">Public note</div><div>{form.public_note.trim() || '-'}</div></div>
                <div className="admin-help">This is an admin-published treasury record with a public Solscan reference. The server validates the Solana signature format; it does not infer the treasury meaning of the transaction.</div>
              </div>
            </div>
          )}
          {error && <div className="admin-error" role="alert">{error}</div>}
          {message && <div className="admin-help" role="status">{message}</div>}
          <div className="admin-toolbar" style={{ marginBottom: 0 }}>
            <span className="admin-help">Totals are calculated automatically from published transactions.</span>
            <div className="admin-filter-row">
              {reviewing && <button className="admin-btn" type="button" onClick={() => setReviewing(false)} disabled={busy}>Edit</button>}
              <button className="admin-btn primary" type="submit" disabled={busy}>{busy ? 'Publishing...' : reviewing ? 'Confirm and publish' : 'Review transaction'}</button>
            </div>
          </div>
        </form>
      </div>

      <div className="admin-card">
        <div className="admin-card-head">
          <div><div className="admin-card-title">Published history</div><div className="admin-card-sub">Newest transaction first. Signatures open in Solscan.</div></div>
        </div>
        <div className="admin-card-body">
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead><tr><th>Type</th><th>Amount</th><th>USD value</th><th>Occurred</th><th>Transaction</th><th>Public note</th></tr></thead>
              <tbody>
                {rows.length ? rows.map((row) => (
                  <tr key={row.id}>
                    <td><span className={'admin-badge ' + (row.event_type === 'burn' ? 'red' : 'green')}>{row.event_type === 'burn' ? 'Burn' : 'Buyback'}</span></td>
                    <td>{fmtClashAmount(row.amount_clash)}</td>
                    <td>{row.usd_value_usd == null ? '-' : fmtUsd(Number(row.usd_value_usd))}</td>
                    <td>{fmtTime(row.occurred_at)}</td>
                    <td><a className="admin-mono" href={row.explorer_url} target="_blank" rel="noreferrer">{short(row.tx_signature, 10, 8)} ↗</a></td>
                    <td>{row.public_note || '-'}</td>
                  </tr>
                )) : <tr><td colSpan={6}><span className="admin-help">No buyback or burn transactions published yet.</span></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function TasksPanel({ data, reload }) {
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const summary = data?.summary || {};
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const rows = tasks.filter((task) => `${task.title || ''} ${task.type || ''} ${task.description || ''}`.toLowerCase().includes(query.toLowerCase()));

  async function resetProgress(task) {
    if (!window.confirm(`Reset progress for "${task.title}"?`)) return;
    await adminPost(`/admin/tasks/${task.id}/reset-progress`, {});
    await reload();
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    await adminDelete(`/admin/tasks/${task.id}`);
    await reload();
  }

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Tasks', value: summary.total || tasks.length },
        { label: 'Active now', value: summary.active || tasks.filter((t) => taskScheduleState(t).label === 'active' || taskScheduleState(t).label === 'live window').length, tone: 'green' },
        { label: 'Started', value: summary.started || 0, tone: 'blue' },
        { label: 'Claimed', value: summary.claimed || 0, tone: 'gold' },
        { label: '24h Started', value: summary.last_24h?.started || 0 },
        { label: '24h Claimed', value: summary.last_24h?.claimed || 0 },
      ]} />
      <TaskNftRewardBoostCard settings={data?.nftRewardBoosts} tasks={data?.tasks || []} reload={reload} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div><div className="admin-card-title">Tasks</div><div className="admin-card-sub">Quest configuration, rewards, progress inspection, and player reset tools.</div></div>
          <button className="admin-btn primary" onClick={() => setEditing(emptyTaskForm())}>Create task</button>
        </div>
        <div className="admin-card-body">
          <div className="admin-toolbar">
            <input className="admin-input" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="admin-help">{rows.length} shown</span>
          </div>
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>Task</th><th>Type</th><th>Rewards</th><th>Status</th><th>Started</th><th>Current claimed</th><th>Paid claims</th><th>Avg Progress</th><th>Last Activity</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((task) => {
                  const schedule = taskScheduleState(task);
                  return (
                  <tr key={task.id}>
                    <td className="admin-mono">#{task.id}</td>
                    <td>
                      <strong>{task.title}</strong>
                      <div className="admin-card-sub">{task.description}</div>
                      {taskEligibilityAdminLabel(task) ? <div><span className="admin-badge purple">Exclusive: {taskEligibilityAdminLabel(task)}</span></div> : null}
                      {(task.starts_at || task.ends_at) ? <div className="admin-card-sub admin-mono">{task.starts_at || '-'} to {task.ends_at || '-'}</div> : null}
                    </td>
                    <td>
                      <span className="admin-badge blue">{task.type}</span>
                      {task.repeatable ? <div className="admin-card-sub">repeat {task.cooldown_hours || 0}h</div> : null}
                      {repeatProgressionLabel(task) ? <div className="admin-card-sub">{repeatProgressionLabel(task)}</div> : null}
                    </td>
                    <td>G:{task.reward_gold || 0} W:{task.reward_wood || 0} O:{task.reward_ore || 0}</td>
                    <td><span className={'admin-badge ' + schedule.badge}>{schedule.label}</span></td>
                    <td>{task.started_count || 0}</td>
                    <td>{task.claimed_count || 0}</td>
                    <td>
                      <strong>{task.paid_claim_count || 0}</strong>
                      <div className="admin-card-sub">{task.claim_attempt_count || 0} attempts</div>
                      {(task.paid_rewards?.gold || task.paid_rewards?.wood || task.paid_rewards?.ore) ? (
                        <div className="admin-card-sub">G:{task.paid_rewards.gold || 0} W:{task.paid_rewards.wood || 0} O:{task.paid_rewards.ore || 0}</div>
                      ) : null}
                    </td>
                    <td>{Math.round(Number(task.avg_progress || 0) * 100)}%</td>
                    <td>{fmtTime(task.last_paid_claim || task.last_claim || task.last_start)}</td>
                    <td><div className="admin-filter-row"><button className="admin-btn" onClick={() => setEditing(taskToForm(task))}>Edit</button><button className="admin-btn" onClick={() => setSelected(task)}>Players</button><button className="admin-btn danger" onClick={() => resetProgress(task)}>Reset</button><button className="admin-btn danger" onClick={() => deleteTask(task)}>Delete</button></div></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selected && <TaskPlayersDrawer task={selected} onClose={() => setSelected(null)} />}
      {editing && <TaskEditorDrawer task={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </div>
  );
}

const TASK_NFT_REWARD_BOOST_COLLECTIONS = [
  { key: 'demon_king', label: 'Demon King' },
  { key: 'dragon', label: 'Dragon' },
];
const TASK_NFT_REWARD_BOOST_RARITIES = [
  { key: 'common', label: 'Common' },
  { key: 'epic', label: 'Epic' },
  { key: 'legendary', label: 'Legendary' },
];

function emptyTaskNftRewardBoostSettings() {
  const collections = {};
  for (const spec of TASK_NFT_REWARD_BOOST_COLLECTIONS) {
    collections[spec.key] = {
      enabled: true,
      label: spec.label,
      base_pct: 0,
      extra_pct_per_additional: 0,
      max_extra_nfts: 0,
      rarity_pct: { common: 0, epic: 0, legendary: 0 },
    };
  }
  return { enabled: true, default_task_enabled: true, task_overrides: {}, rarity_mode: 'best', collections };
}

function normalizeTaskNftRewardBoostSettingsForAdmin(settings) {
  const base = emptyTaskNftRewardBoostSettings();
  const raw = settings && typeof settings === 'object' ? settings : {};
  const next = {
    ...base,
    ...raw,
    default_task_enabled: raw.default_task_enabled !== undefined ? !!raw.default_task_enabled : true,
    task_overrides: raw.task_overrides && typeof raw.task_overrides === 'object' ? { ...raw.task_overrides } : {},
    collections: { ...base.collections },
  };
  for (const spec of TASK_NFT_REWARD_BOOST_COLLECTIONS) {
    const rawCollection = raw.collections?.[spec.key] || {};
    next.collections[spec.key] = {
      ...base.collections[spec.key],
      ...rawCollection,
      rarity_pct: {
        ...base.collections[spec.key].rarity_pct,
        ...(rawCollection.rarity_pct || {}),
      },
    };
  }
  return next;
}

function TaskNftRewardBoostCard({ settings, tasks = [], reload }) {
  const [form, setForm] = useState(() => normalizeTaskNftRewardBoostSettingsForAdmin(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const taskRows = useMemo(() => [...(Array.isArray(tasks) ? tasks : [])]
    .sort((a, b) => Number(b.active || 0) - Number(a.active || 0) || Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || 0) - Number(b.id || 0)),
  [tasks]);

  useEffect(() => {
    setForm(normalizeTaskNftRewardBoostSettingsForAdmin(settings));
  }, [settings]);

  function updateRoot(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function setTaskOverride(taskId, value) {
    const key = String(taskId || '').trim();
    if (!key) return;
    setForm((prev) => {
      const nextOverrides = { ...(prev.task_overrides || {}) };
      if (value === 'inherit') delete nextOverrides[key];
      else nextOverrides[key] = value === 'on';
      return { ...prev, task_overrides: nextOverrides };
    });
  }

  function taskOverrideMode(taskId) {
    const key = String(taskId || '').trim();
    if (!Object.prototype.hasOwnProperty.call(form.task_overrides || {}, key)) return 'inherit';
    return form.task_overrides[key] ? 'on' : 'off';
  }

  function taskEffectiveEnabled(taskId) {
    const key = String(taskId || '').trim();
    if (Object.prototype.hasOwnProperty.call(form.task_overrides || {}, key)) return !!form.task_overrides[key];
    return !!form.default_task_enabled;
  }

  function updateCollection(collectionKey, patch) {
    setForm((prev) => ({
      ...prev,
      collections: {
        ...(prev.collections || {}),
        [collectionKey]: {
          ...((prev.collections || {})[collectionKey] || {}),
          ...patch,
        },
      },
    }));
  }

  function updateRarity(collectionKey, rarityKey, value) {
    setForm((prev) => {
      const current = (prev.collections || {})[collectionKey] || {};
      return {
        ...prev,
        collections: {
          ...(prev.collections || {}),
          [collectionKey]: {
            ...current,
            rarity_pct: {
              ...(current.rarity_pct || {}),
              [rarityKey]: Number(value) || 0,
            },
          },
        },
      };
    });
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      await adminPatch('/admin/tasks-nft-reward-boosts', form);
      setMessage('Saved');
      await reload();
    } catch (err) {
      setMessage(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <div>
          <div className="admin-card-title">Task NFT Reward Boosts</div>
          <div className="admin-card-sub">Global additive percent boosts for quest rewards. Count bonus stacks per extra NFT; rarity uses the best owned rarity per collection.</div>
        </div>
        <button className="admin-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save boosts'}</button>
      </div>
      <div className="admin-card-body admin-grid">
        <div className="admin-choice-grid">
          <ToggleChoice
            active={!!form.enabled}
            title="NFT task rewards enabled"
            subtitle="Master switch. When off, all tasks pay their base rewards plus existing altar bonuses only."
            onClick={() => updateRoot({ enabled: !form.enabled })}
          />
          <ToggleChoice
            active={!!form.default_task_enabled}
            title="Apply to every task by default"
            subtitle="Turn this off, then enable only selected tasks below."
            onClick={() => updateRoot({ default_task_enabled: !form.default_task_enabled })}
          />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Base NFT boost</th>
                <th>Each extra NFT (%)</th>
                <th>Max extra NFTs</th>
                {TASK_NFT_REWARD_BOOST_RARITIES.map((rarity) => <th key={rarity.key}>{rarity.label}</th>)}
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {TASK_NFT_REWARD_BOOST_COLLECTIONS.map((collection) => {
                const cfg = form.collections?.[collection.key] || {};
                const epicPct = Number(cfg.rarity_pct?.epic || 0) || 0;
                const extraPct = Number(cfg.extra_pct_per_additional || 0) || 0;
                const maxExtra = Number(cfg.max_extra_nfts || 0) || 0;
                return (
                  <tr key={collection.key}>
                    <td>
                      <strong>{collection.label}</strong>
                      <div><button className={'admin-btn ' + (cfg.enabled ? 'green' : 'ghost')} type="button" onClick={() => updateCollection(collection.key, { enabled: !cfg.enabled })}>{cfg.enabled ? 'Enabled' : 'Disabled'}</button></div>
                    </td>
                    <td>
                      <input className="admin-input" type="number" step="0.01" value={cfg.base_pct ?? 0} onChange={(e) => updateCollection(collection.key, { base_pct: Number(e.target.value) || 0 })} />
                      <div className="admin-card-sub">Example: 50 = +50%</div>
                    </td>
                    <td>
                      <input className="admin-input" type="number" step="0.01" value={cfg.extra_pct_per_additional ?? 0} onChange={(e) => updateCollection(collection.key, { extra_pct_per_additional: Number(e.target.value) || 0 })} />
                      <div className="admin-card-sub">10 = +10% for NFT #2, #3...</div>
                    </td>
                    <td>
                      <input className="admin-input" type="number" step="1" min="0" value={cfg.max_extra_nfts ?? 0} onChange={(e) => updateCollection(collection.key, { max_extra_nfts: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                      <div className="admin-card-sub">0 = unlimited. 5 means NFTs #2-#6.</div>
                    </td>
                    {TASK_NFT_REWARD_BOOST_RARITIES.map((rarity) => (
                      <td key={`${collection.key}-${rarity.key}`}>
                        <input className="admin-input" type="number" step="0.01" value={cfg.rarity_pct?.[rarity.key] ?? 0} onChange={(e) => updateRarity(collection.key, rarity.key, e.target.value)} />
                      </td>
                    ))}
                    <td><div className="admin-card-sub">Epic + 2 NFTs = +{Math.round((epicPct + extraPct) * 100) / 100}%{maxExtra ? `; max ${maxExtra + 1} counted` : ''}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Default</th>
                <th>Override</th>
                <th>Effective</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((task) => {
                const mode = taskOverrideMode(task.id);
                const effective = taskEffectiveEnabled(task.id);
                return (
                  <tr key={task.id}>
                    <td>
                      <strong>#{task.id} {task.title}</strong>
                      <div className="admin-card-sub">{task.type}{task.active ? '' : ' · inactive'}</div>
                    </td>
                    <td><span className={'admin-badge ' + (form.default_task_enabled ? 'green' : 'off')}>{form.default_task_enabled ? 'On' : 'Off'}</span></td>
                    <td>
                      <div className="admin-filter-row">
                        <button className={'admin-btn ' + (mode === 'inherit' ? 'primary' : 'ghost')} type="button" onClick={() => setTaskOverride(task.id, 'inherit')}>Inherit</button>
                        <button className={'admin-btn ' + (mode === 'on' ? 'green' : 'ghost')} type="button" onClick={() => setTaskOverride(task.id, 'on')}>On</button>
                        <button className={'admin-btn ' + (mode === 'off' ? 'danger' : 'ghost')} type="button" onClick={() => setTaskOverride(task.id, 'off')}>Off</button>
                      </div>
                    </td>
                    <td><span className={'admin-badge ' + (effective ? 'green' : 'off')}>{effective ? 'Boosted' : 'Base only'}</span></td>
                  </tr>
                );
              })}
              {!taskRows.length && (
                <tr><td colSpan={4}><span className="admin-card-sub">No tasks yet.</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {message ? <span className={'admin-badge ' + (/fail|error/i.test(message) ? 'red' : 'green')}>{message}</span> : null}
      </div>
    </div>
  );
}

function TaskEditorDrawer({ task, onClose, onSaved }) {
  const [form, setForm] = useState(task);
  const [error, setError] = useState('');
  const isNew = !form.id;
  const typeLabel = TASK_TYPES.find((item) => item.id === form.type)?.label || form.type;

  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function updateParam(name, value) {
    setForm((prev) => ({ ...prev, params: { ...(prev.params || {}), [name]: value } }));
  }

  function updateRepeatProgression(patch) {
    setForm((prev) => ({
      ...prev,
      params: {
        ...(prev.params || {}),
        repeat_progression: {
          enabled: false,
          mode: 'percent',
          value: 20,
          values: '',
          ...((prev.params || {}).repeat_progression || {}),
          ...patch,
        },
      },
    }));
  }

  function updateEligibility(patch) {
    setForm((prev) => ({
      ...prev,
      params: {
        ...(prev.params || {}),
        eligibility: {
          mode: 'all',
          label: '',
          ...normalizeTaskEligibilityConfig(prev.params || {}),
          ...patch,
        },
      },
    }));
  }

  async function saveTask() {
    const title = String(form.title || '').trim();
    if (!title) {
      setError('Title is required.');
      return;
    }
    const payload = taskFormToBody({ ...form, title });
    setError('');
    try {
      if (isNew) await adminPost('/admin/tasks', payload);
      else await adminPatch(`/admin/tasks/${form.id}`, payload);
      await onSaved();
    } catch (err) {
      setError(err.message || 'Task save failed');
    }
  }

  return (
    <Drawer title={isNew ? 'Create Task' : `Edit Task #${form.id}`} subtitle={`${typeLabel} - rewards and verifier params`} onClose={onClose}>
      <div className="admin-grid">
        {error && <div className="admin-error">{error}</div>}
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Basics</div><div className="admin-card-sub">These fields control what the player sees and how the quest is ordered.</div></div></div>
          <div className="admin-card-body admin-grid">
            <div className="admin-form-grid three">
              <label className="admin-field"><span className="admin-label">Type</span><select className="admin-select" value={form.type} onChange={(e) => update({ type: e.target.value })}>{TASK_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
              <label className="admin-field"><span className="admin-label">Title</span><input className="admin-input" value={form.title} onChange={(e) => update({ title: e.target.value })} /></label>
              <label className="admin-field"><span className="admin-label">Sort order</span><input className="admin-input" type="number" value={form.sort_order} onChange={(e) => update({ sort_order: Number(e.target.value) || 0 })} /></label>
            </div>
            <label className="admin-field"><span className="admin-label">Description</span><textarea className="admin-textarea" value={form.description} onChange={(e) => update({ description: e.target.value })} /></label>
            <div className="admin-choice-grid">
              <ToggleChoice active={form.active} title="Active" subtitle="Visible and claimable in the live quest list." onClick={() => update({ active: !form.active })} />
              <ToggleChoice active={form.repeatable} title="Repeatable" subtitle="Player can claim it again after cooldown." onClick={() => update({ repeatable: !form.repeatable })} />
            </div>
            {form.repeatable && (
              <div className="admin-card" style={{ background: 'rgba(15,23,42,0.72)' }}>
                <div className="admin-card-head">
                  <div>
                    <div className="admin-card-title">Repeat Progression</div>
                    <div className="admin-card-sub">Increase the next cycle target while keeping the same reward. Example: 100k +20% becomes 120k, then 144k.</div>
                  </div>
                </div>
                <div className="admin-card-body admin-grid">
                  <div className="admin-choice-grid">
                    <ToggleChoice
                      active={!!form.params?.repeat_progression?.enabled}
                      title="Progressive target"
                      subtitle="Each paid repeat claim raises the next target."
                      onClick={() => updateRepeatProgression({ enabled: !form.params?.repeat_progression?.enabled })}
                    />
                  </div>
                  {!!form.params?.repeat_progression?.enabled && (
                    <>
                      <div className="admin-form-grid three">
                        <label className="admin-field">
                          <span className="admin-label">Mode</span>
                          <select className="admin-select" value={form.params?.repeat_progression?.mode || 'percent'} onChange={(e) => updateRepeatProgression({ mode: e.target.value })}>
                            <option value="percent">Percent per claim</option>
                            <option value="multiplier">Multiplier per claim</option>
                            <option value="manual">Manual targets</option>
                          </select>
                        </label>
                        {(form.params?.repeat_progression?.mode || 'percent') !== 'manual' ? (
                          <label className="admin-field">
                            <span className="admin-label">{(form.params?.repeat_progression?.mode || 'percent') === 'multiplier' ? 'Multiplier' : 'Percent'}</span>
                            <input className="admin-input" type="number" step="0.01" value={form.params?.repeat_progression?.value ?? 20} onChange={(e) => updateRepeatProgression({ value: Number(e.target.value) || 0 })} />
                          </label>
                        ) : (
                          <label className="admin-field" style={{ gridColumn: 'span 2' }}>
                            <span className="admin-label">Manual target list</span>
                            <input className="admin-input admin-mono" placeholder="100000, 120000, 150000" value={form.params?.repeat_progression?.values || ''} onChange={(e) => updateRepeatProgression({ values: e.target.value })} />
                          </label>
                        )}
                      </div>
                      <div className="admin-help">
                        Percent and multiplier use the primary target field above as the base. Manual mode uses the list by claim number and repeats the last value after the list ends.
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="admin-card-sub">Schedule is UTC. Leave both fields empty for an always-available task.</div>
            <div className="admin-filter-row">
              <button className="admin-btn" type="button" onClick={() => update(utcDaySchedule(0))}>Today UTC daily</button>
              <button className="admin-btn" type="button" onClick={() => update(utcDaySchedule(1))}>Tomorrow UTC daily</button>
              <button className="admin-btn" type="button" onClick={() => update({ starts_at: nowUtcText(), ends_at: '' })}>Start now</button>
              <button className="admin-btn danger" type="button" onClick={() => update({ starts_at: '', ends_at: '' })}>Clear schedule</button>
            </div>
            <div className="admin-form-grid two">
              <label className="admin-field">
                <span className="admin-label">Starts at UTC</span>
                <input
                  className="admin-input admin-mono"
                  type="datetime-local"
                  step="1"
                  value={utcTextToDatetimeLocal(form.starts_at)}
                  onChange={(e) => update({ starts_at: datetimeLocalToUtcText(e.target.value) })}
                />
              </label>
              <label className="admin-field">
                <span className="admin-label">Ends at UTC</span>
                <input
                  className="admin-input admin-mono"
                  type="datetime-local"
                  step="1"
                  value={utcTextToDatetimeLocal(form.ends_at)}
                  onChange={(e) => update({ ends_at: datetimeLocalToUtcText(e.target.value) })}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Eligibility</div><div className="admin-card-sub">Controls which player segment can see, start, and claim this quest.</div></div></div>
          <div className="admin-card-body admin-grid">
            <div className="admin-form-grid two">
              <label className="admin-field">
                <span className="admin-label">Audience</span>
                <select
                  className="admin-select"
                  value={normalizeTaskEligibilityConfig(form.params || {}).mode}
                  onChange={(e) => updateEligibility({ mode: e.target.value })}
                >
                  {TASK_ELIGIBILITY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-label">Badge label</span>
                <input
                  className="admin-input"
                  placeholder="Optional custom badge"
                  value={normalizeTaskEligibilityConfig(form.params || {}).label}
                  onChange={(e) => updateEligibility({ label: e.target.value })}
                />
              </label>
            </div>
            <div className="admin-help">Soldiers only means players with no active Demon King and no active Dragon NFT. This is checked against player_nfts, not battle replay troop composition.</div>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Verifier Params</div><div className="admin-card-sub">Params are stored as JSON and consumed by the existing task verifier.</div></div></div>
          <div className="admin-card-body admin-grid">
            <div className="admin-form-grid three">
              <label className="admin-field"><span className="admin-label">Symbol</span><input className="admin-input" value={form.params.symbol || ''} placeholder="BTC, ETH, SOL..." onChange={(e) => updateParam('symbol', e.target.value.toUpperCase())} /></label>
              <label className="admin-field"><span className="admin-label">Side</span><select className="admin-select" value={form.params.side || 'any'} onChange={(e) => updateParam('side', e.target.value)}>{TASK_SIDES.map((side) => <option key={side.id} value={side.id}>{side.label}</option>)}</select></label>
              <label className="admin-field"><span className="admin-label">Target</span><input className="admin-input" type="number" value={taskPrimaryTarget(form)} onChange={(e) => update({ params: setTaskPrimaryTarget(form, Number(e.target.value) || 0) })} /></label>
            </div>
            {form.type === 'combo_volume_attack' && (
              <div className="admin-form-grid">
                <label className="admin-field"><span className="admin-label">Volume target</span><input className="admin-input" type="number" value={form.params.target_volume ?? 0} onChange={(e) => updateParam('target_volume', Number(e.target.value) || 0)} /></label>
                <label className="admin-field"><span className="admin-label">Accepted attacks target</span><input className="admin-input" type="number" value={form.params.target_wins ?? 1} onChange={(e) => updateParam('target_wins', Number(e.target.value) || 0)} /></label>
              </div>
            )}
            {form.type === 'daily_trade_gold' && (
              <div className="admin-form-grid">
                <label className="admin-field"><span className="admin-label">Window hours</span><input className="admin-input" type="number" value={form.params.window_hours || 24} onChange={(e) => updateParam('window_hours', Number(e.target.value) || 24)} /></label>
                <label className="admin-field"><span className="admin-label">Gold target</span><input className="admin-input" type="number" value={form.params.target_gold ?? 0} onChange={(e) => updateParam('target_gold', Number(e.target.value) || 0)} /></label>
              </div>
            )}
            <details>
              <summary className="admin-help">Raw params</summary>
              <textarea className="admin-textarea admin-mono" value={JSON.stringify(form.params || {}, null, 2)} onChange={(e) => {
                try {
                  update({ params: JSON.parse(e.target.value || '{}') });
                  setError('');
                } catch {
                  setError('Params JSON is invalid.');
                }
              }} />
            </details>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Rewards and Repeat</div><div className="admin-card-sub">Resource payout and cooldown after a repeated claim.</div></div></div>
          <div className="admin-card-body admin-form-grid three">
            <label className="admin-field"><span className="admin-label">Reward gold</span><input className="admin-input" type="number" value={form.reward_gold} onChange={(e) => update({ reward_gold: Number(e.target.value) || 0 })} /></label>
            <label className="admin-field"><span className="admin-label">Reward wood</span><input className="admin-input" type="number" value={form.reward_wood} onChange={(e) => update({ reward_wood: Number(e.target.value) || 0 })} /></label>
            <label className="admin-field"><span className="admin-label">Reward ore</span><input className="admin-input" type="number" value={form.reward_ore} onChange={(e) => update({ reward_ore: Number(e.target.value) || 0 })} /></label>
            <label className="admin-field"><span className="admin-label">Cooldown hours</span><input className="admin-input" type="number" value={form.cooldown_hours} onChange={(e) => update({ cooldown_hours: Number(e.target.value) || 0 })} /></label>
          </div>
        </div>
        <div className="wizard-footer">
          <button className="admin-btn" onClick={onClose}>Cancel</button>
          <button className="admin-btn primary" onClick={saveTask}>{isNew ? 'Create task' : 'Save task'}</button>
        </div>
      </div>
    </Drawer>
  );
}

function TaskPlayersDrawer({ task, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const eligibilityLabel = taskEligibilityAdminLabel(data?.task || task);
  useEffect(() => {
    let alive = true;
    adminGet(`/admin/tasks/${task.id}/players`).then((result) => {
      if (alive) setData(result);
    }).catch((err) => {
      if (alive) setError(err.message);
    });
    return () => { alive = false; };
  }, [task.id]);
  return (
    <Drawer title={`Task Players · ${task.title}`} subtitle={`${data?.started || 0} started · ${data?.claimed || 0} claimed${eligibilityLabel ? ` · Exclusive: ${eligibilityLabel}` : ''}`} onClose={onClose}>
      {error && <div className="admin-error">{error}</div>}
      {!data ? <div className="admin-help">Loading...</div> : (
        <div className="admin-table-wrap admin-scroll">
          {eligibilityLabel ? <div className="admin-help" style={{ margin: '0 0 12px' }}>Eligibility: <strong>{eligibilityLabel}</strong>. Players outside this segment do not see this quest and cannot start or claim it through the API.</div> : null}
          <table className="admin-table">
            <thead><tr><th>Player</th><th>Progress</th><th>Started</th><th>Claimed</th><th>Wallet</th></tr></thead>
            <tbody>{(data.players || []).map((row) => <tr key={row.player_id}><td><strong>{row.player_name || row.player_id}</strong><div className="admin-card-sub admin-mono">{row.player_id}</div></td><td>{row.progress_value || 0}/{row.target_value || 0}</td><td>{fmtTime(row.started_at)}</td><td>{row.claimed_at ? <span className="admin-badge green">{fmtTime(row.claimed_at)}</span> : <span className="admin-badge off">not claimed</span>}</td><td className="admin-mono">{short(row.wallet, 8, 6)}</td></tr>)}</tbody>
          </table>
          <div className="admin-help" style={{ margin: '12px 0 6px' }}>Lifetime repeat history comes from task_claim_events and does not reset with current progress.</div>
          <table className="admin-table">
            <thead><tr><th>Player</th><th>Paid claims</th><th>Attempts</th><th>Rewards paid</th><th>Last paid</th></tr></thead>
            <tbody>{(data.players || []).map((row) => <tr key={`${row.player_id}-lifetime`}><td><strong>{row.player_name || row.player_id}</strong><div className="admin-card-sub admin-mono">{row.player_id}</div></td><td><strong>{row.paid_claim_count || 0}</strong></td><td>{row.attempt_count || 0}<div className="admin-card-sub">{row.not_completed_count || 0} not ready · {row.blocked_count || 0} blocked</div></td><td>G:{row.paid_rewards?.gold || 0} W:{row.paid_rewards?.wood || 0} O:{row.paid_rewards?.ore || 0}</td><td>{fmtTime(row.last_paid_claim)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}

function ElfaPanel({ data }) {
  const stats = data?.stats || {};
  const errors = data?.errors || [];
  const symbolRows = Array.isArray(stats.symbols) ? stats.symbols : Object.entries(stats.symbols || {}).map(([symbol, value]) => ({ symbol, ...(typeof value === 'object' ? value : { count: value }) }));
  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'API key', value: data?.has_key ? 'set' : 'missing', tone: data?.has_key ? 'green' : 'red' },
        { label: 'Requests', value: stats.requests || stats.total || 0 },
        { label: 'Cache hits', value: stats.cache_hits || stats.cacheHits || 0, tone: 'blue' },
        { label: 'Errors', value: errors.length || stats.errors || 0, tone: errors.length || stats.errors ? 'red' : 'green' },
      ]} />
      <div className="admin-grid two">
        <CompactTable title="Popular Symbols" subtitle="Elfa signal usage by symbol." columns={['Symbol', 'Requests', 'Latest', 'Status']} rows={symbolRows.map((row) => [row.symbol || row[0] || '-', row.requests || row.count || row.n || 0, fmtTime(row.latest_at || row.last_at), statusBadge(row.status || 'ok')])} />
        <CompactTable title="Recent Errors" subtitle="Signal provider errors and throttling history." columns={['Time', 'Symbol', 'Message']} rows={errors.slice(0, 80).map((row, idx) => [fmtTime(row.created_at || row.time || row.ts), row.symbol || '-', row.message || row.error || String(row || idx)])} />
      </div>
      <div className="admin-card">
        <div className="admin-card-head"><div><div className="admin-card-title">Elfa Diagnostics</div><div className="admin-card-sub">Raw provider counters kept as a collapsible audit view.</div></div></div>
        <div className="admin-card-body"><pre className="admin-mono admin-scroll" style={{ overflow: 'auto', maxHeight: 360, whiteSpace: 'pre-wrap' }}>{JSON.stringify(stats, null, 2)}</pre></div>
      </div>
    </div>
  );
}

function ClientLogsPanel({ data, reload }) {
  const [level, setLevel] = useState('all');
  const [query, setQuery] = useState('');
  const rows = (data?.rows || []).filter((row) => {
    const hay = `${row.message || ''} ${row.source || ''} ${row.url || ''} ${row.player_name || ''} ${row.player_wallet || ''}`.toLowerCase();
    return (level === 'all' || row.level === level) && (!query || hay.includes(query.toLowerCase()));
  });
  const levels = Array.from(new Set((data?.rows || []).map((row) => row.level).filter(Boolean)));
  return (
    <div className="admin-card">
      <div className="admin-card-head"><div><div className="admin-card-title">Client Logs</div><div className="admin-card-sub">Browser-side errors and diagnostics grouped with player context.</div></div><button className="admin-btn" onClick={reload}>Reload</button></div>
      <div className="admin-card-body">
        <div className="admin-toolbar">
          <div className="admin-filter-row">
            <select className="admin-select" value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">All levels</option>{levels.map((l) => <option key={l} value={l}>{l}</option>)}</select>
            <input className="admin-input" placeholder="Search message, source, player" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <span className="admin-help">{rows.length} shown · retention {data?.retention_days || '-'}d</span>
        </div>
        <div className="admin-table-wrap admin-scroll">
          <table className="admin-table">
            <thead><tr><th>Player</th><th>Time</th><th>Level</th><th>Source</th><th>Message</th><th>URL / Payload</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.player_name || 'anonymous'}</strong><div className="admin-card-sub">{row.player_dex || '-'}</div></td><td className="admin-mono">{fmtTime(row.created_at)}</td><td><span className={'admin-badge ' + (row.level === 'error' || row.level === 'onerror' ? 'red' : row.level === 'warn' ? 'gold' : 'blue')}>{row.level}</span></td><td>{row.source || '-'}</td><td style={{ minWidth: 280, whiteSpace: 'pre-wrap' }}>{row.message}</td><td><div className="admin-card-sub" style={{ wordBreak: 'break-word' }}>{row.url || '-'}</div>{row.payload ? <details><summary className="admin-help">payload</summary><pre className="admin-mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.payload, null, 2)}</pre></details> : null}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ServerLogsPanel({ data, reload }) {
  const [type, setType] = useState('all');
  const rows = (Array.isArray(data) ? data : []).filter((row) => type === 'all' || row.type === type);
  const types = Array.from(new Set((Array.isArray(data) ? data : []).map((row) => row.type).filter(Boolean)));
  return (
    <div className="admin-card">
      <div className="admin-card-head"><div><div className="admin-card-title">Server Logs</div><div className="admin-card-sub">In-memory battle/economy/auth/error tail.</div></div><button className="admin-btn" onClick={reload}>Reload</button></div>
      <div className="admin-card-body">
        <div className="admin-toolbar"><select className="admin-select" value={type} onChange={(e) => setType(e.target.value)}><option value="all">All types</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select><span className="admin-help">{rows.length} shown</span></div>
        <div className="admin-table-wrap admin-scroll">
          <table className="admin-table">
            <thead><tr><th>Time</th><th>Type</th><th>Message</th><th>Data</th></tr></thead>
            <tbody>{rows.map((row, idx) => <tr key={idx}><td className="admin-mono">{fmtTime(row.ts || row.time || row.created_at)}</td><td><span className={'admin-badge ' + (row.type === 'error' ? 'red' : row.type === 'economy' ? 'gold' : 'blue')}>{row.type}</span></td><td>{row.msg || row.message}</td><td><pre className="admin-mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.data || {}, null, 2)}</pre></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EarningsPanel({ data, reload }) {
  const [localData, setLocalData] = useState(data || {});
  const [refreshingDex, setRefreshingDex] = useState('');
  const [refreshMessage, setRefreshMessage] = useState('');

  useEffect(() => {
    setLocalData(data || {});
  }, [data]);

  const refreshDex = async (dex) => {
    const key = String(dex || '').trim().toLowerCase();
    if (!key) return;
    setRefreshingDex(key);
    setRefreshMessage('');
    try {
      const result = await adminGet(`/admin/earnings/${encodeURIComponent(key)}?force=1`);
      const row = result.row || result[key] || result;
      setLocalData((prev) => {
        const prevEarnings = prev?.earnings || {};
        const resolvedDex = result.dex || key;
        const previousHistory = prevEarnings.snapshot_history || {};
        const incomingHistory = result.snapshot_history || null;
        const mergedHistory = incomingHistory ? {
          ...previousHistory,
          ...incomingHistory,
          dexes: {
            ...(previousHistory.dexes || {}),
            ...(incomingHistory.dexes || {}),
          },
          daily: [
            ...(previousHistory.daily || []).filter((entry) => entry.dex !== resolvedDex),
            ...(incomingHistory.daily || []),
          ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
        } : previousHistory;
        const nextEarnings = {
          ...prevEarnings,
          [resolvedDex]: { dex: resolvedDex, ...row },
          snapshot_history: mergedHistory,
          last_updated: result.last_updated || new Date().toISOString(),
          cached: false,
          age_ms: 0,
        };
        const rows = Object.entries(nextEarnings)
          .filter(([, value]) => value && typeof value === 'object' && ('earned_usd' in value || value.ok === false || 'error' in value));
        nextEarnings.total_usd = rows.reduce((sum, [, value]) => sum + (value.ok && Number.isFinite(Number(value.earned_usd)) ? Number(value.earned_usd) : 0), 0);
        return { ...(prev || {}), earnings: nextEarnings };
      });
      setRefreshMessage(`${DEX_LABELS[result.dex || key] || result.dex || key} refreshed`);
    } catch (err) {
      setRefreshMessage(`${DEX_LABELS[key] || key}: ${err.message || 'refresh failed'}`);
    } finally {
      setRefreshingDex('');
    }
  };

  const earnings = localData?.earnings || {};
  const revenue = localData?.revenue || {};
  const revenueWindows = Array.isArray(revenue.windows) ? revenue.windows : [];
  const windowAll = revenueWindows.find((row) => row.key === 'all') || revenueWindows[revenueWindows.length - 1] || {};
  const byDex = windowAll.dexes || revenue.dexes || revenue.by_dex || earnings.dexes || earnings.by_dex || {};
  const exactEarningsRows = Object.entries(earnings)
    .filter(([, value]) => value && typeof value === 'object' && ('earned_usd' in value || value.ok === false || 'error' in value))
    .map(([dex, value]) => ({ dex, earned_usd: 0, ...value }));
  const exactTotalUsd = Number.isFinite(Number(earnings.total_usd))
    ? Number(earnings.total_usd)
    : exactEarningsRows.reduce((sum, row) => sum + (Number(row.earned_usd) || 0), 0);
  const snapshotHistory = earnings.snapshot_history || {};
  const snapshotDexes = snapshotHistory.dexes || {};
  const snapshotWindows = snapshotHistory.windows || {};
  const snapshotDailyRows = (snapshotHistory.daily || [])
    .filter((row) => Number(row.snapshot_count || 0) > 0)
    .slice(0, 30 * Math.max(1, exactEarningsRows.length));
  const snapshotWindowRows = exactEarningsRows.map((row) => {
    const snapshot = snapshotDexes[row.dex] || {};
    const d30 = snapshot.d30 || {};
    return [
      DEX_LABELS[row.dex] || row.dex,
      snapshot.d1?.snapshot_count ? fmtMaybeUsd(snapshot.d1.earned_usd) : '-',
      snapshot.d7?.snapshot_count ? fmtMaybeUsd(snapshot.d7.earned_usd) : '-',
      d30.snapshot_count ? fmtMaybeUsd(d30.earned_usd) : '-',
      d30.snapshot_count || 0,
      d30.complete ? <span className="admin-badge green">complete</span> : <span className="admin-badge gold">collecting</span>,
      fmtTime(snapshot.last_snapshot_at),
    ];
  });
  const tournaments = revenue.tournaments || revenue.by_tournament || [];
  const balanceMetrics = localData?.exchangeBalances || {};
  const balanceSummary = balanceMetrics.summary || {};
  const balanceDexRows = Array.isArray(balanceMetrics.by_dex) ? balanceMetrics.by_dex : [];
  const balancePlayerRows = Array.isArray(balanceMetrics.by_player) ? balanceMetrics.by_player : [];
  const balanceAccountRows = Array.isArray(balanceMetrics.accounts) ? balanceMetrics.accounts : [];
  return (
    <div className="admin-grid" data-admin-feature="earnings-snapshot-history">
      <StatsGrid stats={[
        { label: 'Exact earned', value: fmtMaybeUsd(exactTotalUsd), tone: 'gold' },
        { label: 'Snapshot 24h', value: Object.keys(snapshotDexes).length ? fmtMaybeUsd(snapshotWindows.d1?.earned_usd) : '-', tone: 'green' },
        { label: 'Snapshot 7d', value: Object.keys(snapshotDexes).length ? fmtMaybeUsd(snapshotWindows.d7?.earned_usd) : '-', tone: 'green' },
        { label: 'Snapshot 30d', value: Object.keys(snapshotDexes).length ? fmtMaybeUsd(snapshotWindows.d30?.earned_usd) : '-', tone: 'green' },
        { label: 'Snapshot sources', value: num(Object.keys(snapshotDexes).length), tone: 'blue' },
      ]} />
      {refreshMessage && <div className="admin-card-sub">{refreshMessage}</div>}
      <div className="earnings-card-grid">
        {exactEarningsRows.map((row) => (
          <EarningsDexCard
            key={row.dex}
            row={row}
            snapshot={snapshotDexes[row.dex] || null}
            refreshing={refreshingDex === row.dex}
            onRefresh={() => refreshDex(row.dex)}
          />
        ))}
      </div>
      <CompactTable
        title="Snapshot Earnings Windows"
        subtitle="Only positive deltas between stored cumulative snapshots. Live values and local volume estimates are excluded."
        columns={['DEX', '24h', '7d', '30d', '30d samples', 'Coverage', 'Latest snapshot']}
        rows={snapshotWindowRows}
      />
      <CompactTable
        title="Daily Snapshot Records (30 days)"
        subtitle="UTC daily earnings reconstructed only from stored snapshots. A reset means claim, withdrawal, or a provider counter decrease and never subtracts income."
        columns={['UTC day', 'DEX', 'Earned', 'Closing cumulative', 'Snapshots', 'Resets']}
        rows={snapshotDailyRows.map((row) => [
          row.date,
          DEX_LABELS[row.dex] || row.dex,
          fmtMaybeUsd(row.earned_usd),
          row.closing_cumulative_usd == null ? '-' : fmtMaybeUsd(row.closing_cumulative_usd),
          row.snapshot_count || 0,
          row.reset_count || 0,
        ])}
      />
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Player Exchange Balances</div>
            <div className="admin-card-sub">
              Last account equity observed by the authenticated trading UI or MM-bot portfolio in the past {balanceMetrics.max_age_days || 30} days. Averages exclude zero balances; these values are telemetry, not provider-audited accounting. Updated {fmtTime(balanceMetrics.generated_at)}.
            </div>
          </div>
          {balanceMetrics.error ? <span className="admin-badge red">API error</span> : <span className="admin-badge blue">client observed</span>}
        </div>
        <div className="admin-card-body admin-grid">
          {balanceMetrics.error ? <div className="admin-error">{balanceMetrics.error}</div> : null}
          <StatsGrid stats={[
            { label: 'Total balance > 0', value: fmtMaybeUsd(balanceSummary.total_positive_balance_usd), tone: 'gold' },
            { label: 'Players > 0', value: num(balanceSummary.positive_players), tone: 'green' },
            { label: 'Avg player > 0', value: fmtMaybeUsd(balanceSummary.average_positive_player_usd), tone: 'green' },
            { label: 'Accounts > 0', value: num(balanceSummary.positive_accounts), tone: 'blue' },
            { label: 'Avg account > 0', value: fmtMaybeUsd(balanceSummary.average_positive_account_usd), tone: 'blue' },
            { label: 'Fresh accounts 24h', value: `${num(balanceSummary.fresh_24h_accounts)} / ${num(balanceSummary.tracked_accounts)}`, tone: 'purple' },
          ]} />
        </div>
      </div>
      <CompactTable
        title="Balances by Exchange"
        subtitle="Positive totals and averages from each player's latest observed account equity. Zero-balance accounts remain visible in the tracked count."
        columns={['DEX', 'Tracked', '> 0', 'Total > 0', 'Avg > 0', 'Max', 'Fresh 24h', 'Latest']}
        rows={balanceDexRows.map((row) => [
          DEX_LABELS[row.dex] || row.dex,
          num(row.tracked_accounts),
          num(row.positive_accounts),
          fmtMaybeUsd(row.total_positive_balance_usd),
          fmtMaybeUsd(row.average_positive_balance_usd),
          fmtMaybeUsd(row.max_balance_usd),
          `${num(row.fresh_24h_accounts)} / ${num(row.tracked_accounts)}`,
          fmtTime(row.latest_observed_at),
        ])}
      />
      <CompactTable
        title="Balances by Player"
        subtitle="Who has funds and on which exchanges. Total is the sum of the latest observed equity per DEX."
        columns={['Player', 'Total', 'Free', 'DEXes > 0', 'Exchange balances', 'Latest']}
        rows={balancePlayerRows.map((row) => [
          row.player_name || short(row.player_id),
          fmtMaybeUsd(row.total_balance_usd),
          fmtMaybeUsd(row.total_available_usd),
          `${num(row.positive_dexes)} / ${num(row.tracked_dexes)}`,
          (row.dexes || []).map((item) => `${DEX_LABELS[item.dex] || item.dex}: ${fmtMaybeUsd(item.balance_usd)}`).join(' · ') || '-',
          fmtTime(row.latest_observed_at),
        ])}
      />
      <CompactTable
        title="Latest Player / Exchange Accounts"
        subtitle={`Detailed latest snapshot, including linked wallet, collection source, and freshness. Showing up to ${num(balanceMetrics.account_limit || 2000)} accounts.`}
        columns={['Player', 'DEX', 'Balance', 'Free', 'Wallet', 'Source', 'Observed', 'Fresh']}
        rows={balanceAccountRows.map((row) => [
          row.player_name || short(row.player_id),
          DEX_LABELS[row.dex] || row.dex,
          fmtMaybeUsd(row.balance_usd),
          row.available_usd == null ? '-' : fmtMaybeUsd(row.available_usd),
          <span className="admin-mono">{short(row.wallet_address, 10, 5)}</span>,
          row.source || '-',
          fmtTime(row.observed_at),
          row.fresh_24h ? <span className="admin-badge green">24h</span> : <span className="admin-badge gold">stale</span>,
        ])}
      />
      <div className="admin-grid two">
        <CompactTable title="DEX Local Model" subtitle={`Local volume x configured rate analytics for comparison only. Updated ${fmtTime(revenue.last_updated)}.`} columns={['DEX', 'Estimated fee', 'Volume', 'Trades', 'Model', 'Configured']} rows={normalizeDexRows(byDex).map((row) => [DEX_LABELS[row.dex] || row.dex || '-', fmtMaybeUsd(row.estimated_fee_usd ?? row.fee_usd), fmtMaybeUsd(row.volume_usd ?? row.total_volume_usd), row.trades || row.trades_count || 0, row.rate_label || row.model || row.source_detail || '-', row.configured === false ? <span className="admin-badge off">no</span> : <span className="admin-badge green">yes</span>])} />
        <CompactTable title="Tournament Local Model" subtitle="Tournament volume attribution using configured fee models. Not exact provider earnings." columns={['Tournament', 'DEX', 'Players', 'Volume', 'Estimated fee']} rows={(tournaments || []).slice(0, 80).map((row) => [row.name || `#${row.tournament_id || row.id}`, DEX_LABELS[row.dex] || row.dex || '-', row.players || '-', fmtMaybeUsd(row.volume_usd), fmtMaybeUsd(row.estimated_fee_usd)])} />
      </div>
      <CompactTable title="Exact Earnings Sources" subtitle={`Live/cached source reads. Total ${fmtMaybeUsd(exactTotalUsd)}.`} columns={['DEX', 'Earned', 'Volume', 'Trades', 'Currency', 'Source']} rows={exactEarningsRows.map((row) => [DEX_LABELS[row.dex] || row.dex, fmtMaybeUsd(row.earned_usd), fmtMaybeUsd(row.volume_usd), row.trades ?? row.local_trades ?? '-', row.currency || '-', row.source_detail || row.source || row.note || '-'])} />
      <div className="admin-card">
        <div className="admin-card-head"><div><div className="admin-card-title">Earnings Audit</div><div className="admin-card-sub">Full source payload is available when finance needs to inspect a provider mismatch.</div></div><button className="admin-btn" onClick={reload}>Refresh</button></div>
        <div className="admin-card-body"><details><summary className="admin-help">Open raw provider payload</summary><pre className="admin-mono admin-scroll" style={{ overflow: 'auto', maxHeight: 420, whiteSpace: 'pre-wrap' }}>{JSON.stringify(localData || {}, null, 2)}</pre></details></div>
      </div>
    </div>
  );
}

function EarningsDexCard({ row, snapshot = null, refreshing = false, onRefresh }) {
  const accent = dexAccent(row.dex);
  const earned = fmtUsd(Number(row.earned_usd || 0), 4);
  const trades = row.trades ?? row.local_trades ?? row.matched_events ?? row.transfer_events ?? null;
  const volume = row.volume_usd ?? row.local_volume_usd ?? row.hyperliquid_cum_volume_usd ?? null;
  const note = row.note || row.source_detail || row.source || '';
  const address = row.address || row.subaccount || row.builder_id || row.latest_submission_idx || '';
  const sync = row.onchain_sync || row.sync_state || null;
  const syncLastBlock = sync?.native_usdc?.last_fetched_block || sync?.legacy_usdce?.last_fetched_block || sync?.last_fetched_block || row.onchain_scan_to_block || null;
  const syncLastRunBlocks = sync?.last_run_blocks ?? sync?.last_run_blocks_fetched ?? null;
  const extra = [
    trades != null ? `${num(trades)} trades` : '',
    volume != null ? `${fmtMaybeUsd(volume)} vol` : '',
    row.rebate_pct != null ? `${row.rebate_pct}% rebate` : '',
    row.builder_fee_pct != null ? `${row.builder_fee_pct}% fee` : '',
    row.withdrawable_usd != null ? `${fmtMaybeUsd(row.withdrawable_usd)} withdrawable` : '',
    row.unclaimed_rewards_usd != null ? `${fmtMaybeUsd(row.unclaimed_rewards_usd)} unclaimed` : '',
    row.estimated_fee_usd != null ? `estimate ${fmtMaybeUsd(row.estimated_fee_usd)}` : '',
    syncLastBlock ? `block ${num(syncLastBlock)}` : '',
    syncLastRunBlocks != null ? `+${num(syncLastRunBlocks)} blocks` : '',
  ].filter(Boolean);
  return (
    <div className="earnings-card" style={{ '--earnings-accent': accent }}>
      <div className="earnings-card-head">
        <div className="earnings-dex">{(DEX_LABELS[row.dex] || row.dex || '-').toUpperCase()}</div>
        <div className="earnings-card-actions">
          <div className="earnings-currency">{row.currency || '-'}</div>
          {onRefresh && (
            <button className="admin-btn earnings-refresh-btn" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? '...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
      <div className="earnings-amount">{earned}</div>
      <div className="earnings-window-grid">
        {[
          ['24h', snapshot?.d1],
          ['7d', snapshot?.d7],
          ['30d', snapshot?.d30],
        ].map(([label, value]) => (
          <div className="earnings-window" key={label}>
            <span>{label}</span>
            <strong>{value?.snapshot_count ? fmtUsd(Number(value.earned_usd || 0), 4) : '-'}</strong>
          </div>
        ))}
      </div>
      <div className="earnings-meta">
        {address ? <span className="admin-mono">{short(address, 10, 5)}</span> : null}
        {extra.map((item) => <span key={item}>{item}</span>)}
      </div>
      {note && <div className="earnings-note">{note}</div>}
    </div>
  );
}

function ReferralsPanel({ data, reload }) {
  const rows = data?.rows || [];
  const referrals = data?.referrals || [];
  const recent = data?.recent || [];
  const payouts = data?.payouts || [];
  const settings = data?.settings || { mode: 'selected', default_bps: data?.rate_bps || 1000 };
  const rate = Number(settings.default_bps || data?.rate_bps || 0) / 100;
  const [query, setQuery] = useState('');
  const [selectedReferrer, setSelectedReferrer] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [modeDraft, setModeDraft] = useState(settings.mode || 'selected');
  const [defaultRateDraft, setDefaultRateDraft] = useState(String(rate || 10));
  const [issueDraft, setIssueDraft] = useState({ player: '', code: '', commission: String(rate || 10), note: '' });

  useEffect(() => {
    setModeDraft(settings.mode || 'selected');
    setDefaultRateDraft(String(Number(settings.default_bps || 1000) / 100));
    setIssueDraft((prev) => ({ ...prev, commission: prev.commission || String(Number(settings.default_bps || 1000) / 100) }));
  }, [settings.mode, settings.default_bps]);

  const filteredRows = rows.filter((row) => {
    const hay = `${row.player_name || ''} ${row.player_id || ''} ${row.code || ''}`.toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });
  const totals = rows.reduce((acc, row) => {
    acc.invited += Number(row.invited_count || 0);
    acc.confirmed += Number(row.confirmed_usd || 0);
    acc.pending += Number(row.pending_usd || 0);
    acc.paid += Number(row.paid_usd || 0);
    acc.events += Number(row.events_count || 0);
    return acc;
  }, { invited: 0, confirmed: 0, pending: 0, paid: 0, events: 0 });
  const referralsByReferrer = referrals.reduce((acc, referral) => {
    const key = referral.referrer_player_id || '';
    if (!acc[key]) acc[key] = [];
    acc[key].push(referral);
    return acc;
  }, {});
  const filteredReferrals = referrals.filter((referral) => {
    const hay = `${referral.referrer_name || ''} ${referral.referred_name || ''} ${referral.referrer_player_id || ''} ${referral.referred_player_id || ''} ${referral.code || ''}`.toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });

  async function runAction(label, fn) {
    if (busy) return;
    setBusy(label);
    setMessage('');
    try {
      const result = await fn();
      setMessage(result?.message || `${label} complete.`);
      await reload();
    } catch (err) {
      setMessage(err.message || `${label} failed.`);
    } finally {
      setBusy('');
    }
  }

  async function syncFutures() {
    await runAction('Sync futures', async () => {
      const result = await adminPost('/admin/referrals/sync-futures', {});
      return { message: `Synced futures: ${result.inserted || 0} inserted, ${result.skipped || 0} skipped, ${result.scanned || 0} scanned.` };
    });
  }

  async function createPayout(row) {
    const destination = window.prompt(`Destination for ${row.player_name || row.player_id}`, '') || '';
    const note = window.prompt('Payout note', 'Referral commission payout') || '';
    await runAction('Create payout', async () => {
      const result = await adminPost(`/admin/referrals/${encodeURIComponent(row.player_id)}/payouts`, { destination, note });
      return { message: `Payout ${result.payout?.id || ''} requested for ${fmtMaybeUsd(result.payout?.amount_usd)}.` };
    });
  }

  async function markPaid(payout) {
    const txHash = window.prompt(`Tx hash for payout ${payout.id}`, payout.tx_hash || '') || '';
    if (!window.confirm(`Mark payout ${payout.id} as paid?`)) return;
    await runAction('Mark paid', async () => {
      const result = await adminPost(`/admin/referrals/payouts/${encodeURIComponent(payout.id)}/paid`, { txHash });
      return { message: `Payout ${result.payout?.id || payout.id} marked paid.` };
    });
  }

  async function saveSettings() {
    await runAction('Save settings', async () => {
      const result = await adminPost('/admin/referrals/settings', {
        mode: modeDraft,
        default_percent: Number(defaultRateDraft || 0),
      });
      const pct = Number(result.settings?.default_bps || 0) / 100;
      return { message: `Referral settings saved: ${result.settings?.mode || modeDraft}, ${pct}% default.` };
    });
  }

  async function issueReferral() {
    await runAction('Issue referral', async () => {
      const result = await adminPost('/admin/referrals/issue', {
        player: issueDraft.player,
        code: issueDraft.code,
        commission_percent: Number(issueDraft.commission || 0),
        note: issueDraft.note,
        active: true,
      });
      setIssueDraft({ player: '', code: '', commission: String(rate || 10), note: '' });
      return { message: `Referral issued: /r/${result.code?.code || ''}` };
    });
  }

  async function editReferral(row) {
    const nextRate = window.prompt(`Commission percent for ${row.player_name || row.player_id}`, String(Number(row.commission_bps || settings.default_bps || 1000) / 100));
    if (nextRate == null) return;
    const nextCode = window.prompt('Referral code', row.code || '') || row.code || '';
    const active = window.confirm('Keep this referral active and visible? OK = active, Cancel = hidden/disabled.');
    await runAction('Update referral', async () => {
      const result = await adminPost(`/admin/referrals/${encodeURIComponent(row.player_id)}/code`, {
        code: nextCode,
        commission_percent: Number(nextRate || 0),
        active,
        note: row.note || '',
      });
      return { message: `Referral updated: /r/${result.code?.code || nextCode}` };
    });
  }

  if (!data) return <LoadingCard title="Referrals" />;

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Referrers', value: num(rows.length), tone: 'blue' },
        { label: 'Invited players', value: num(referrals.length || totals.invited), tone: 'green' },
        { label: 'Confirmed', value: fmtMaybeUsd(totals.confirmed), tone: 'gold' },
        { label: 'Pending', value: fmtMaybeUsd(totals.pending), tone: totals.pending ? 'blue' : 'green' },
        { label: 'Paid', value: fmtMaybeUsd(totals.paid), tone: 'green' },
        { label: 'Events', value: num(totals.events) },
      ]} />

      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Referral Commissions</div>
            <div className="admin-card-sub">
              {settings.mode === 'all' ? 'Every player can expose a referral link.' : 'Referral links are hidden unless manually issued.'}
              {' '}Default commission: {rate || 10}%.
            </div>
          </div>
          <div className="admin-filter-row">
            {message ? <span className={'admin-badge ' + (message.toLowerCase().includes('failed') ? 'red' : 'green')}>{message}</span> : null}
            <button className="admin-btn" onClick={syncFutures} disabled={!!busy}>{busy === 'Sync futures' ? 'Syncing...' : 'Sync futures'}</button>
            <button className="admin-btn" onClick={reload} disabled={!!busy}>Reload</button>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-grid two">
            <div className="admin-card subtle">
              <div className="admin-card-title">Visibility</div>
              <div className="admin-form-grid">
                <label><span>Referral mode</span><select className="admin-input" value={modeDraft} onChange={(e) => setModeDraft(e.target.value)}>
                  <option value="selected">Selected users only</option>
                  <option value="all">Everyone</option>
                </select></label>
                <label><span>Default commission %</span><input className="admin-input" type="number" min="0" max="100" step="0.01" value={defaultRateDraft} onChange={(e) => setDefaultRateDraft(e.target.value)} /></label>
              </div>
              <div className="admin-filter-row" style={{ marginTop: 10 }}>
                <button className="admin-btn primary" onClick={saveSettings} disabled={!!busy}>{busy === 'Save settings' ? 'Saving...' : 'Save settings'}</button>
                <span className="admin-help">Selected mode hides referral boxes for everyone except issued users.</span>
              </div>
            </div>
            <div className="admin-card subtle">
              <div className="admin-card-title">Issue Referral</div>
              <div className="admin-form-grid">
                <label><span>Player id or exact name</span><input className="admin-input" value={issueDraft.player} onChange={(e) => setIssueDraft((v) => ({ ...v, player: e.target.value }))} placeholder="player id / nickname" /></label>
                <label><span>Custom code (optional)</span><input className="admin-input" value={issueDraft.code} onChange={(e) => setIssueDraft((v) => ({ ...v, code: e.target.value }))} placeholder="e.g. caencu" /></label>
                <label><span>Commission %</span><input className="admin-input" type="number" min="0" max="100" step="0.01" value={issueDraft.commission} onChange={(e) => setIssueDraft((v) => ({ ...v, commission: e.target.value }))} /></label>
                <label><span>Note</span><input className="admin-input" value={issueDraft.note} onChange={(e) => setIssueDraft((v) => ({ ...v, note: e.target.value }))} placeholder="optional admin note" /></label>
              </div>
              <div className="admin-filter-row" style={{ marginTop: 10 }}>
                <button className="admin-btn green" onClick={issueReferral} disabled={!!busy || !issueDraft.player.trim()}>{busy === 'Issue referral' ? 'Issuing...' : 'Issue / update'}</button>
              </div>
            </div>
          </div>
          <div className="admin-toolbar">
            <input className="admin-input" placeholder="Search referrer, id, or code" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="admin-help">{filteredRows.length} shown</span>
          </div>
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead><tr><th>Referrer</th><th>Code</th><th>Rate</th><th>Status</th><th>Invited</th><th>Confirmed</th><th>Pending</th><th>Paid</th><th>Events</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.player_id}>
                    <td><strong>{row.player_name || '-'}</strong><div className="admin-card-sub admin-mono">{row.player_id}</div></td>
                    <td><span className="admin-badge gold">{row.code}</span><div className="admin-card-sub admin-mono">/r/{row.code}</div></td>
                    <td>{Number(row.commission_bps || settings.default_bps || 0) / 100}%</td>
                    <td>{row.active && row.visible ? <span className="admin-badge green">visible</span> : row.active ? <span className="admin-badge">hidden</span> : <span className="admin-badge red">disabled</span>}</td>
                    <td><button className="admin-btn" onClick={() => setSelectedReferrer(row)}>{num(referralsByReferrer[row.player_id]?.length || row.invited_count)} referrals</button></td>
                    <td style={{ color: 'var(--admin-gold)' }}>{fmtMaybeUsd(row.confirmed_usd)}</td>
                    <td>{fmtMaybeUsd(row.pending_usd)}</td>
                    <td style={{ color: 'var(--admin-green)' }}>{fmtMaybeUsd(row.paid_usd)}</td>
                    <td>{num(row.events_count)}</td>
                    <td><div className="admin-filter-row"><button className="admin-btn" onClick={() => setSelectedReferrer(row)}>Open</button><button className="admin-btn" onClick={() => editReferral(row)} disabled={!!busy}>Edit</button><button className="admin-btn primary" onClick={() => createPayout(row)} disabled={!!busy || Number(row.confirmed_usd || 0) <= 0}>Create payout</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CompactTable title="All Referral Links" subtitle="Every bound referred player, grouped in the row by referrer and searchable from the same filter." columns={['Bound', 'Referrer', 'Referred Player', 'Code', 'Source', 'Confirmed', 'Pending', 'Paid', 'Events', 'Latest Event']} rows={filteredReferrals.slice(0, 500).map((row) => [fmtTime(row.bound_at), row.referrer_name || row.referrer_player_id, <span><strong>{row.referred_name || '-'}</strong><div className="admin-card-sub admin-mono">{row.referred_player_id}</div></span>, <span className="admin-badge gold">{row.code}</span>, row.source || '-', fmtMaybeUsd(row.confirmed_usd), fmtMaybeUsd(row.pending_usd), fmtMaybeUsd(row.paid_usd), num(row.events_count), fmtTime(row.latest_event_at)])} />

      <div className="admin-grid two">
        <CompactTable title="Recent Referral Events" subtitle="Newest immutable commission events after exact-source attribution." columns={['Time', 'Referrer', 'Referred', 'Kind', 'Source', 'Gross', 'Commission', 'Status']} rows={recent.slice(0, 120).map((row) => [fmtTime(row.created_at), row.referrer_name || row.referrer_player_id, row.referred_name || row.referred_player_id, row.revenue_kind, row.source_type, fmtMaybeUsd(row.gross_usd), fmtMaybeUsd(row.commission_usd), statusBadge(row.status)])} />
        <div className="admin-card">
          <div className="admin-card-head">
            <div><div className="admin-card-title">Referral Payouts</div><div className="admin-card-sub">Requested payouts reserve event rows; paid payouts close the ledger.</div></div>
          </div>
          <div className="admin-card-body">
            <div className="admin-table-wrap compact admin-scroll">
              <table className="admin-table">
                <thead><tr><th>Created</th><th>Referrer</th><th>Amount</th><th>Destination</th><th>Status</th><th>Tx</th><th>Actions</th></tr></thead>
                <tbody>
                  {payouts.length ? payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td>{fmtTime(payout.created_at)}<div className="admin-card-sub admin-mono">{short(payout.id, 12, 6)}</div></td>
                      <td>{payout.referrer_name || payout.referrer_player_id}</td>
                      <td>{fmtMaybeUsd(payout.amount_usd)}</td>
                      <td className="admin-mono">{short(payout.destination, 14, 8)}</td>
                      <td>{statusBadge(payout.status)}</td>
                      <td className="admin-mono">{short(payout.tx_hash, 12, 8)}</td>
                      <td>{payout.status === 'paid' ? <span className="admin-badge green">closed</span> : <button className="admin-btn green" onClick={() => markPaid(payout)} disabled={!!busy}>Mark paid</button>}</td>
                    </tr>
                  )) : <tr><td colSpan={7}><span className="admin-help">No payouts yet.</span></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {selectedReferrer && (
        <ReferralDetailsDrawer
          referrer={selectedReferrer}
          referrals={referralsByReferrer[selectedReferrer.player_id] || []}
          events={recent.filter((row) => row.referrer_player_id === selectedReferrer.player_id)}
          onClose={() => setSelectedReferrer(null)}
        />
      )}
    </div>
  );
}

function ReferralDetailsDrawer({ referrer, referrals, events, onClose }) {
  const totals = referrals.reduce((acc, row) => {
    acc.confirmed += Number(row.confirmed_usd || 0);
    acc.pending += Number(row.pending_usd || 0);
    acc.paid += Number(row.paid_usd || 0);
    acc.events += Number(row.events_count || 0);
    return acc;
  }, { confirmed: 0, pending: 0, paid: 0, events: 0 });
  return (
    <Drawer title={`Referrals · ${referrer.player_name || referrer.player_id}`} subtitle={`${referrals.length} invited players via /r/${referrer.code || '-'}`} onClose={onClose}>
      <div className="admin-grid">
        <StatsGrid stats={[
          { label: 'Invited', value: num(referrals.length), tone: 'green' },
          { label: 'Confirmed', value: fmtMaybeUsd(totals.confirmed), tone: 'gold' },
          { label: 'Pending', value: fmtMaybeUsd(totals.pending), tone: totals.pending ? 'blue' : 'green' },
          { label: 'Paid', value: fmtMaybeUsd(totals.paid), tone: 'green' },
          { label: 'Events', value: num(totals.events) },
        ]} />
        <div className="admin-table-wrap admin-scroll">
          <table className="admin-table">
            <thead><tr><th>Bound</th><th>Referred Player</th><th>Source</th><th>Confirmed</th><th>Pending</th><th>Paid</th><th>Events</th><th>Latest Event</th></tr></thead>
            <tbody>
              {referrals.length ? referrals.map((row) => (
                <tr key={row.referred_player_id}>
                  <td>{fmtTime(row.bound_at)}</td>
                  <td><strong>{row.referred_name || '-'}</strong><div className="admin-card-sub admin-mono">{row.referred_player_id}</div></td>
                  <td>{row.source || '-'}</td>
                  <td style={{ color: 'var(--admin-gold)' }}>{fmtMaybeUsd(row.confirmed_usd)}</td>
                  <td>{fmtMaybeUsd(row.pending_usd)}</td>
                  <td style={{ color: 'var(--admin-green)' }}>{fmtMaybeUsd(row.paid_usd)}</td>
                  <td>{num(row.events_count)}</td>
                  <td>{fmtTime(row.latest_event_at)}</td>
                </tr>
              )) : <tr><td colSpan={8}><span className="admin-help">This referrer has no bound referred players yet.</span></td></tr>}
            </tbody>
          </table>
        </div>
        <CompactTable title="Recent Events For This Referrer" subtitle="Limited to the recent events included in the admin referral payload." columns={['Time', 'Referred', 'Kind', 'Source', 'Gross', 'Commission', 'Status']} rows={events.slice(0, 80).map((row) => [fmtTime(row.created_at), row.referred_name || row.referred_player_id, row.revenue_kind, row.source_type, fmtMaybeUsd(row.gross_usd), fmtMaybeUsd(row.commission_usd), statusBadge(row.status)])} />
      </div>
    </Drawer>
  );
}

function townHallFlagStatusBadge(status) {
  const value = String(status || '').trim();
  if (value === 'active') return <span className="admin-badge green">active</span>;
  if (value === 'paid_not_uploaded') return <span className="admin-badge gold">paid, no upload</span>;
  if (value === 'replaced_or_restored') return <span className="admin-badge off">replaced / standard</span>;
  return <span className="admin-badge off">{value || 'unknown'}</span>;
}

function TownHallFlagPreview({ src }) {
  if (!src) return <span className="admin-badge off">no image</span>;
  return (
    <img
      src={src}
      alt="Town Hall flag"
      style={{
        width: 42,
        height: 42,
        objectFit: 'cover',
        borderRadius: 6,
        border: '1px solid rgba(255, 215, 0, 0.45)',
        background: '#f8fafc',
        display: 'block',
      }}
    />
  );
}

function TownHallFlagShopCard({ flags }) {
  const summary = flags?.summary || {};
  const recent = flags?.recent || [];
  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <div>
          <div className="admin-card-title">Town Hall Flags</div>
          <div className="admin-card-sub">
            Paid CLASH flag uploads. Buyers are counted from utility purchases; active flags are players currently showing a custom flag.
          </div>
        </div>
        <span className="admin-badge gold">{num(summary.unique_buyers)} buyers</span>
      </div>
      <div className="admin-card-body admin-grid">
        <StatsGrid stats={[
          { label: 'Flag buyers', value: num(summary.unique_buyers), tone: 'gold' },
          { label: 'Purchases', value: num(summary.purchases), tone: 'blue' },
          { label: 'Active flags', value: num(summary.active_custom_flags), tone: 'green' },
          { label: 'Paid no upload', value: num(summary.paid_not_uploaded), tone: summary.paid_not_uploaded ? 'gold' : 'green' },
          { label: 'Revenue', value: fmtMaybeUsd(summary.revenue_usd), tone: 'green' },
          { label: '24h', value: num(summary.purchases_24h), tone: summary.purchases_24h ? 'blue' : 'off' },
          { label: '7d', value: num(summary.purchases_7d), tone: summary.purchases_7d ? 'blue' : 'off' },
          { label: 'Last upload', value: fmtTime(summary.last_upload_at || summary.last_at) },
        ]} />
        <CompactTable
          title="Recent Flag Buyers"
          subtitle="Newest Town Hall flag purchases and whether each paid upload was consumed."
          columns={['Time', 'Player', 'Status', 'Preview', 'Chain', 'Price', 'Tx']}
          rows={recent.map((row) => [
            fmtTime(row.created_at),
            <span><strong>{row.name || row.player_id}</strong><div className="admin-card-sub admin-mono">{short(row.player_id, 8, 6)}</div></span>,
            townHallFlagStatusBadge(row.flag_status),
            <TownHallFlagPreview src={row.image_url} />,
            chainBadge(row.chain),
            fmtMaybeUsd(row.price_usd),
            <span className="admin-mono">{short(row.tx_hash, 10, 8)}</span>,
          ])}
        />
      </div>
    </div>
  );
}

function ShopPanel({ data }) {
  const shop = data?.shop || {};
  const billing = data?.aiBilling || {};
  const usage = billing.usage || {};
  const usageWindows = billing.usage_windows || {};
  const revenueSummary = billing.revenue_summary || {};
  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Purchases', value: shop.summary?.total_purchases || 0 },
        { label: 'Unique Buyers', value: shop.summary?.unique_buyers || 0, tone: 'blue' },
        { label: 'Revenue', value: fmtMaybeUsd(shop.summary?.total_revenue_usd), tone: 'green' },
        { label: '24h Revenue', value: fmtMaybeUsd(shop.summary?.last_24h_revenue_usd), tone: 'gold' },
        { label: 'AI Today', value: usage.today ?? usage.today_total ?? usageWindows.messages_today ?? 0 },
        { label: 'AI Credits', value: billing.balances?.outstanding_credits ?? billing.outstanding_credits ?? 0 },
        { label: 'Hermes 24h', value: usageWindows.hermes_events_24h ?? 0, tone: 'blue' },
        { label: 'Hermes Errors 24h', value: usageWindows.hermes_errors_24h ?? 0, tone: usageWindows.hermes_errors_24h ? 'red' : 'green' },
      ]} />
      <TownHallFlagShopCard flags={shop.town_hall_flags} />
      <div className="admin-grid two">
        <CompactTable title="Products" subtitle="Utility purchase totals by SKU." columns={['SKU', 'Title', 'Purchases', 'Buyers', 'Revenue', 'Last']} rows={(shop.by_sku || []).map((row) => [row.sku, row.title, row.purchases, row.unique_buyers, fmtMaybeUsd(row.revenue_usd), fmtTime(row.last_at)])} />
        <CompactTable title="Top Buyers" subtitle="Highest spenders across utility purchases." columns={['Player', 'DEX', 'Purchases', 'Spent', 'Last']} rows={(shop.top_buyers || []).map((row) => [row.name, DEX_LABELS[row.dex] || row.dex || '-', row.purchases, fmtMaybeUsd(row.spent_usd), fmtTime(row.last_at)])} />
      </div>
      <div className="admin-grid two">
        <CompactTable title="Payment Chains" subtitle={`Gross ${fmtMaybeUsd(shop.summary?.gross_sales_usd)}. Revenue excludes project-token value where appropriate.`} columns={['Chain', 'Purchases', 'Revenue', 'Gross', 'Latest']} rows={(billing.payments_by_chain || []).map((row) => [chainBadge(row.chain), row.purchases || row.payments || 0, fmtMaybeUsd(row.revenue_usd), fmtMaybeUsd(row.gross_sales_usd ?? row.gross_usd), fmtTime(row.latest_at || row.last_at)])} />
        <CompactTable title="AI Billing" subtitle={`Free daily limit ${billing.settings?.free_messages_per_day ?? '-'}. AI revenue ${fmtMaybeUsd(revenueSummary.revenue_usd ?? revenueSummary.total_revenue_usd)}.`} columns={['User', 'DEX', 'Today', '7d', 'All', 'Hermes Errors', 'Last']} rows={(billing.users || []).slice(0, 80).map((row) => [row.name || row.player_id, DEX_LABELS[row.dex] || row.dex || '-', row.today_used || 0, row.week_used || 0, row.total_used || 0, row.hermes_errors || 0, fmtTime(row.last_chat_at || row.last_mcp_at)])} />
      </div>
      <div className="admin-grid two">
        <CompactTable title="Payment Tokens" subtitle="Utility purchases grouped by chain and token." columns={['Chain', 'Token', 'Purchases', 'Revenue', 'Latest']} rows={(billing.payments_by_token || []).map((row) => [chainBadge(row.chain), short(row.token, 12, 8), row.purchases || row.payments || 0, fmtMaybeUsd(row.revenue_usd), fmtTime(row.latest_at || row.last_at)])} />
        <CompactTable title="Hermes Recent Errors" subtitle="Newest AI orchestration failures." columns={['Time', 'Player', 'Intent', 'Error']} rows={(billing.hermes_errors_recent || []).slice(0, 80).map((row) => [fmtTime(row.created_at), row.player_name || row.player_id || '-', row.intent || row.event_type || '-', row.error || row.response_preview || '-'])} />
      </div>
      <CompactTable title="Recent Purchases" subtitle="Newest utility purchases with chain and tx context." columns={['Time', 'Player', 'Product', 'Chain', 'Price', 'Tx']} rows={(shop.recent || []).map((row) => [fmtTime(row.created_at), row.name, row.title || row.sku, row.chain, fmtMaybeUsd(row.price_usd), short(row.tx_hash, 10, 8)])} />
    </div>
  );
}

function SanctumAdminPanel({ data, reload }) {
  const current = data?.settings?.current || {};
  const upcoming = data?.settings?.next || null;
  const summary = data?.summary || {};
  const [enabled, setEnabled] = useState(current.enabled !== false);
  const [rate, setRate] = useState(String(current.gold_per_clashsol ?? 2000));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function downloadExport(dataset) {
    setNotice('');
    try {
      await adminDownload(`/admin/sanctum/export.csv?dataset=${dataset}`, `clashsol-${dataset}.csv`);
    } catch (error) {
      setNotice(error.message || 'Could not download clashSOL audit export');
    }
  }

  useEffect(() => {
    setEnabled(current.enabled !== false);
    setRate(String(current.gold_per_clashsol ?? 2000));
  }, [current.enabled, current.gold_per_clashsol]);

  if (!data) return <LoadingCard title="clashSOL Growth & Rewards" />;

  const numericRate = Number(rate);
  const validRate = Number.isInteger(numericRate) && numericRate >= 0 && numericRate <= 1_000_000;
  const claimed = Number(summary.claims_30d || 0);
  const eligible = (data.daily || []).reduce((sum, row) => sum + Number(row.eligible_holders || 0), 0);
  const claimRate = eligible > 0 ? `${((claimed / eligible) * 100).toFixed(1)}%` : '0%';
  const measuredApy = Number(data?.status?.apy);
  const estimatedApy = Number(data?.status?.apyEstimate);
  const hasMeasuredApy = Number.isFinite(measuredApy) && measuredApy > 0;
  const hasEstimatedApy = !hasMeasuredApy && Number.isFinite(estimatedApy) && estimatedApy > 0;
  const apyValue = hasMeasuredApy ? measuredApy : (hasEstimatedApy ? estimatedApy : null);
  const apyPercent = apyValue == null ? null : (apyValue <= 1 ? apyValue * 100 : apyValue);
  const apyLabel = hasMeasuredApy ? 'Last epoch APY' : (hasEstimatedApy ? 'Estimated validator-peer APY' : 'APY pending');
  const tokenAmount = (value) => (Number(value || 0) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 });

  async function saveSettings() {
    if (!validRate || saving) return;
    const effective = upcoming?.effective_day_utc || 'the next UTC day';
    if (!window.confirm(`Apply ${numericRate.toLocaleString()} Gold per clashSOL from ${effective} 00:00 UTC? Existing entitlements will not change.`)) return;
    setSaving(true);
    setNotice('');
    try {
      const result = await adminPut('/admin/sanctum/settings', {
        enabled,
        gold_per_clashsol: numericRate,
      });
      setNotice(`Saved. New settings take effect ${result.settings?.next?.effective_day_utc || 'next UTC day'}.`);
      await reload();
    } catch (error) {
      setNotice(error.message || 'Could not save clashSOL settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Verified holders', value: num(summary.verified_holders || 0), tone: 'blue' },
        { label: 'Observed holders today', value: num(summary.current_holders || 0), tone: 'blue' },
        { label: 'Eligible today', value: num(summary.eligible_today || 0), tone: 'green' },
        { label: 'Verified clashSOL', value: Number(summary.clashsol_today || 0).toLocaleString(undefined, { maximumFractionDigits: 4 }), tone: 'blue' },
        { label: 'Average positive balance', value: Number(summary.avg_positive_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 4 }) },
        { label: 'Pending Gold', value: num(summary.pending_gold || 0), tone: Number(summary.pending_gold) > 0 ? 'gold' : 'off' },
        { label: 'Issued 24h', value: num(summary.issued_24h || 0), tone: 'gold' },
        { label: 'Issued 7d', value: num(summary.issued_7d || 0), tone: 'gold' },
        { label: 'Issued 30d', value: num(summary.issued_30d || 0), tone: 'gold' },
        { label: 'Claims 30d', value: num(summary.claims_30d || 0), tone: 'green' },
        { label: 'Claim participation', value: claimRate },
        { label: 'Swap users', value: num(summary.swap_users || 0), tone: 'blue' },
        { label: 'Completed swaps', value: num(summary.swaps_complete || 0), tone: 'green' },
        { label: 'Snapshot failures 24h', value: num(summary.snapshot_failures_24h || 0), tone: Number(summary.snapshot_failures_24h) > 0 ? 'red' : 'green' },
      ]} />

      <div className="admin-grid two">
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-card-title">Live clashSOL</div>
              <div className="admin-card-sub">Sanctum pool health and audited mint.</div>
            </div>
            <span className={`admin-badge ${data.status?.available ? 'green' : 'red'}`}>{data.status?.available ? 'live' : 'unavailable'}</span>
          </div>
          <div className="admin-card-body admin-grid">
            <div><strong>{data.status?.name || 'Clash Staked SOL'}</strong> · {data.status?.symbol || 'clashSOL'}</div>
            <div className="admin-mono" style={{ wordBreak: 'break-all' }}>{data.mint || data.status?.mint || '-'}</div>
            <div className="admin-card-sub">{apyLabel}: {apyPercent == null ? '—' : `${apyPercent.toFixed(2)}%`}{hasEstimatedApy ? ` (${num(data.status?.apyEstimatePeerCount || 0)} same-validator peers; not guaranteed)` : ''} · Last sample {fmtTime(summary.last_snapshot_at)} · {num(summary.samples_today || 0)} samples today</div>
            <a className="admin-btn" href="https://app.sanctum.so/explore/clashSOL" target="_blank" rel="noreferrer">Open on Sanctum</a>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-head"><div><div className="admin-card-title">Daily Gold settings</div><div className="admin-card-sub">Changes are append-only and start next UTC day.</div></div></div>
          <div className="admin-card-body admin-grid">
            <label className="admin-field">
              <span className="admin-label">Daily rewards</span>
              <select className="admin-input" value={enabled ? 'enabled' : 'disabled'} onChange={(event) => setEnabled(event.target.value === 'enabled')}>
                <option value="enabled">Enabled</option>
                <option value="disabled">Paused</option>
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-label">Gold per 1 clashSOL</span>
              <input className="admin-input" type="number" min="0" max="1000000" step="1" value={rate} onChange={(event) => setRate(event.target.value)} />
            </label>
            {!validRate && <div className="admin-error">Enter a whole number from 0 to 1,000,000.</div>}
            <div className="admin-filter-row">
              {[0.1, 1, 10].map(amount => <span className="admin-badge gold" key={amount}>{amount} clashSOL → {validRate ? Math.floor(amount * numericRate).toLocaleString() : '—'} Gold</span>)}
            </div>
            {upcoming && <div className="admin-card-sub">Scheduled: {upcoming.enabled ? 'enabled' : 'paused'}, {num(upcoming.gold_per_clashsol)} Gold from {upcoming.effective_day_utc} UTC.</div>}
            {notice && <div className={notice.startsWith('Saved') ? 'admin-badge green' : 'admin-error'}>{notice}</div>}
            <button className="admin-btn primary" type="button" disabled={!validRate || saving} onClick={saveSettings}>{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        </div>
      </div>

      <CompactTable
        title="Daily Reward Metrics"
        subtitle="Rewards mature next day from each wallet’s minimum observed balance across the UTC day."
        columns={['UTC day', 'Eligible holders', 'Eligible clashSOL', 'Claims', 'Claim rate', 'Gold issued']}
        rows={(data.daily || []).map(row => {
          const holders = Number(row.eligible_holders || 0);
          const claims = Number(row.claims || 0);
          return [row.reward_day_utc, num(holders), Number(row.eligible_clashsol || 0).toLocaleString(undefined, { maximumFractionDigits: 4 }), num(claims), holders ? `${((claims / holders) * 100).toFixed(1)}%` : '0%', num(row.gold_issued || 0)];
        })}
      />
      <CompactTable title="Recent Claims" subtitle="Player and wallet snapshots backing every Gold entitlement." columns={['Created', 'Player', 'Wallet', 'Reward day', 'Balance', 'Rate', 'Gold', 'Status', 'Claimed']} rows={(data.claims || []).map(row => [fmtTime(row.created_at), row.player_name || short(row.player_id, 8, 6), <span className="admin-mono">{short(row.wallet, 8, 6)}</span>, row.reward_day_utc, (Number(row.balance_atomics || 0) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 }), num(row.gold_per_clashsol), num(row.reward_gold), statusBadge(row.status), fmtTime(row.claimed_at)])} />
      <CompactTable title="Recent Swaps" subtitle="Sanctum intent and execution audit trail." columns={['Created', 'Player', 'Wallet', 'Direction', 'Input', 'Output', 'Status', 'Signature']} rows={(data.swaps || []).map(row => [fmtTime(row.created_at), row.player_name || short(row.player_id, 8, 6), <span className="admin-mono">{short(row.wallet, 8, 6)}</span>, row.direction === 'unstake' ? 'clashSOL → SOL' : 'SOL → clashSOL', tokenAmount(row.input_amount), tokenAmount(row.output_amount), statusBadge(row.status), <span className="admin-mono">{short(row.tx_signature, 10, 8)}</span>])} />
      <CompactTable title="Configuration History" subtitle="Append-only rate and pause audit; historical entitlements never change." columns={['Changed', 'Admin', 'State', 'Rate', 'Effective UTC day']} rows={(data.config_history || []).map(row => [fmtTime(row.created_at), row.changed_by || '-', row.enabled ? <span className="admin-badge green">enabled</span> : <span className="admin-badge off">paused</span>, num(row.gold_per_clashsol), row.effective_day_utc])} />
      <div className="admin-card">
        <div className="admin-card-head"><div><div className="admin-card-title">Full audit exports</div><div className="admin-card-sub">Download complete CSV ledgers for finance, growth, and support audits.</div></div></div>
        <div className="admin-card-body admin-filter-row">
          {['rewards', 'swaps', 'observations', 'snapshot-events', 'settings'].map((dataset) => (
            <button
              className="admin-btn"
              key={dataset}
              type="button"
              onClick={() => downloadExport(dataset)}
            >
              Export {dataset} CSV
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketplacePanel({ data, reload }) {
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState(null);
  const summary = data?.summary || {};
  const orders = data?.recentOrders || [];
  const errors = data?.recentErrors || [];

  async function runOrderAction(order, action) {
    const label = action === 'settle' ? 'settle delivery' : 'send payout';
    if (!window.confirm(`Run auto ${label} for order ${order.id}?`)) return;
    setBusy(`${action}:${order.id}`);
    try {
      await adminPost(`/admin/marketplace/custodial/orders/${encodeURIComponent(order.id)}/${action}`, { mode: 'auto' });
      await reload();
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Orders', value: summary.totalOrders || 0 },
        { label: 'Active', value: summary.activeListings || 0, tone: 'blue' },
        { label: 'Settle due', value: summary.settlementDue || 0, tone: summary.settlementDue ? 'red' : 'green' },
        { label: 'Payout due', value: `${summary.payoutDue || 0} / ${fmtUsdcUnits(summary.payoutDueUsdcUnits)}`, tone: summary.payoutDue ? 'gold' : 'green' },
        { label: 'Sales', value: fmtUsdcUnits(summary.salesVolumeUsdcUnits), tone: 'green' },
        { label: 'Project revenue', value: fmtUsdcUnits(summary.projectRevenueUsdcUnits), tone: 'gold' },
        { label: '24h sales', value: summary.sales24h || 0 },
        { label: 'Errors 24h', value: summary.errors24h || 0, tone: summary.errors24h ? 'red' : 'green' },
      ]} />
      <div className="admin-grid two">
        <CompactTable title="Order Status" subtitle="Open, sold, failed, and cancelled order distribution." columns={['Status', 'Orders', 'Open', 'Sales', 'Errors', 'Volume', 'Latest']} rows={(data?.byStatus || []).map((row) => [statusBadge(row.status), row.orders, row.openOrders, row.sales, row.errors, fmtUsdcUnits(row.salesVolumeUsdcUnits || row.listedVolumeUsdcUnits), fmtTime(row.latestAt)])} />
        <CompactTable title="Asset Chains" subtitle="Marketplace inventory and sales by NFT chain." columns={['Chain', 'Orders', 'Open', 'Sales', 'Errors', 'Gross', 'Latest']} rows={(data?.byAssetChain || []).map((row) => [chainBadge(row.chain), row.orders, row.openOrders, row.sales, row.errors, fmtUsdcUnits(row.grossVolumeUsdcUnits), fmtTime(row.latestAt)])} />
      </div>
      <CompactTable title="Payment Chains" subtitle="Where buyers are paying from." columns={['Chain', 'Orders', 'Open', 'Sales', 'Errors', 'Gross', 'Latest']} rows={(data?.byPaymentChain || []).map((row) => [chainBadge(row.chain), row.orders, row.openOrders, row.sales, row.errors, fmtUsdcUnits(row.grossVolumeUsdcUnits), fmtTime(row.latestAt)])} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div><div className="admin-card-title">Recent Orders</div><div className="admin-card-sub">Operational queue with settlement and seller payout actions.</div></div>
          <button className="admin-btn" onClick={reload}>Reload</button>
        </div>
        <div className="admin-card-body">
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead><tr><th>Order</th><th>Status</th><th>Asset</th><th>Seller</th><th>Buyer</th><th>Price</th><th>Tx</th><th>Updated</th><th>Actions</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="admin-mono">{short(order.id, 10, 8)}</td>
                    <td>{statusBadge(order.status)}{order.error ? <div className="admin-card-sub" style={{ color: 'var(--admin-red)' }}>{order.error}</div> : null}</td>
                    <td>{chainBadge(order.assetChain)}<div className="admin-card-sub">#{order.assetId} L{order.level || '-'}</div></td>
                    <td>{order.sellerName || short(order.sellerWallet, 8, 6)}<div className="admin-card-sub admin-mono">{short(order.sellerPlayerId, 8, 6)}</div></td>
                    <td>{order.buyerName || short(order.buyerWallet, 8, 6)}<div className="admin-card-sub admin-mono">{short(order.buyerPlayerId, 8, 6)}</div></td>
                    <td>{fmtUsdcUnits(order.priceUsdcUnits)}</td>
                    <td><div className="admin-card-sub">pay {short(order.paymentTxHash, 8, 6)}</div><div className="admin-card-sub">del {short(order.deliveryTxHash, 8, 6)}</div><div className="admin-card-sub">out {short(order.payoutTxHash, 8, 6)}</div></td>
                    <td>{fmtTime(order.updatedAt || order.createdAt)}</td>
                    <td>
                      <div className="admin-filter-row">
                        <button className="admin-btn" onClick={() => setSelected(order)}>Open</button>
                        {(order.status === 'paid' || order.status === 'delivering') && <button className="admin-btn primary" disabled={busy === `settle:${order.id}`} onClick={() => runOrderAction(order, 'settle')}>Settle</button>}
                        {order.status === 'delivered' && !order.payoutTxHash && <button className="admin-btn green" disabled={busy === `payout:${order.id}`} onClick={() => runOrderAction(order, 'payout')}>Payout</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {errors.length > 0 && <CompactTable title="Recent Marketplace Errors" subtitle="Newest orders that contain an error message." columns={['Order', 'Status', 'Asset', 'Price', 'Error', 'Updated']} rows={errors.slice(0, 40).map((order) => [short(order.id, 10, 8), statusBadge(order.status), `${order.assetChain} #${order.assetId}`, fmtUsdcUnits(order.priceUsdcUnits), order.error, fmtTime(order.updatedAt)])} />}
      {selected && <Drawer title={`Marketplace Order ${selected.id}`} subtitle={`${selected.status} - ${selected.assetChain} #${selected.assetId}`} onClose={() => setSelected(null)}><pre className="admin-mono admin-scroll" style={{ whiteSpace: 'pre-wrap', overflow: 'auto' }}>{JSON.stringify(selected, null, 2)}</pre></Drawer>}
    </div>
  );
}

function NftPanel({ data }) {
  if (!data) return <LoadingCard title="NFT / Bridge" />;
  const supply = data.supply || {};
  const bridges = data.bridges || {};
  const logs = data.bridge_logs || {};
  const payments = data.payments || {};
  const demonKing = data.demon_king || {};
  const dragon = data.dragon || {};
  const demonLevels = demonKing.level_summary || {};
  const dragonLevels = dragon.level_summary || {};
  const collectionCards = [
    { key: 'demon_king', label: 'Demon King', data: demonKing, tone: 'blue' },
    { key: 'dragon', label: 'Dragon', data: dragon, tone: 'gold' },
  ];
  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'NFT supply', value: `${num(supply.total)} / ${num(supply.cap)}`, tone: 'gold' },
        { label: 'Remaining', value: num(supply.remaining), tone: 'blue' },
        { label: 'Bridge total', value: bridges.summary?.total || 0 },
        { label: 'Pending bridges', value: bridges.summary?.pending || 0, tone: bridges.summary?.pending ? 'gold' : 'green' },
        { label: 'Bridge 24h', value: bridges.summary?.h24 || 0, tone: 'blue' },
        { label: 'Demon King L2+ players', value: num(demonLevels.lvl2plus_players || 0), tone: 'green' },
        { label: 'Demon King L2+ NFTs', value: num(demonLevels.lvl2plus_tokens || 0), tone: 'blue' },
        { label: 'Dragon players', value: num(dragonLevels.total_players || 0), tone: 'green' },
        { label: 'Dragon NFTs', value: num(dragonLevels.total_tokens || 0), tone: 'gold' },
        { label: 'Log errors 24h', value: logs.summary?.errors_24h || 0, tone: logs.summary?.errors_24h ? 'red' : 'green' },
      ]} />
      <div className="admin-grid two">
        <CompactTable title="Supply by Chain" subtitle={`Synced ${fmtTime(supply.synced_at)}. Live chains: ${(supply.live_chains || []).join(', ') || '-'}.`} columns={['Chain', 'Minted', 'Live', 'Source', 'Synced']} rows={(supply.per_chain || []).map((row) => [chainBadge(row.chain), num(row.count), row.live ? <span className="admin-badge green">live</span> : <span className="admin-badge off">fallback</span>, row.source || '-', fmtTime(row.synced_at)])} />
        <CompactTable title="Bridge Routes" subtitle="Traffic, pending jobs, and freshest route activity." columns={['Route', 'Total', 'Today', 'Pending', 'Latest']} rows={(bridges.by_route || []).map((row) => [`${row.source_chain} -> ${row.dest_chain}`, row.total, row.today, row.pending, fmtTime(row.latest_at)])} />
      </div>
      <div className="admin-grid two">
        <CompactTable title="Utility Payments" subtitle="NFT utility purchase revenue by chain and token." columns={['Chain', 'Token', 'Payments', 'Buyers', 'Revenue', 'Latest']} rows={(payments.utility_by_token || []).map((row) => [chainBadge(row.chain), row.token, row.payments, row.unique_buyers, fmtMaybeUsd(row.revenue_usd), fmtTime(row.latest_at)])} />
        <CompactTable title="Marketplace NFT Sales" subtitle="Marketplace sales grouped by payment token." columns={['Chain', 'Token', 'Sales', 'Latest']} rows={(payments.marketplace_by_token || []).map((row) => [chainBadge(row.chain), row.token, row.sales, fmtTime(row.latest_at)])} />
      </div>
      <div className="admin-grid two">
        {collectionCards.map((collection) => {
          const summary = collection.data?.level_summary || {};
          return (
            <div className="admin-card" key={collection.key}>
              <div className="admin-card-head">
                <div>
                  <div className="admin-card-title">{collection.label}</div>
                  <div className="admin-card-sub">Active cached ownership split by chain, rarity, and legacy level.</div>
                </div>
                <span className={`admin-badge ${collection.tone}`}>{num(summary.total_tokens || 0)} NFTs</span>
              </div>
              <div className="admin-card-body">
                <StatsGrid stats={[
                  { label: 'NFTs', value: num(summary.total_tokens || 0), tone: collection.tone },
                  { label: 'Players', value: num(summary.total_players || 0), tone: 'green' },
                  { label: 'L2+ players', value: num(summary.lvl2plus_players || 0), tone: 'blue' },
                  { label: 'L2+ NFTs', value: num(summary.lvl2plus_tokens || 0), tone: 'gold' },
                ]} />
                <div className="admin-grid" style={{ gap: 12, marginTop: 12 }}>
                  <CompactTable title={`${collection.label} by Chain`} subtitle="Active wallet cache." columns={['Chain', 'NFTs', 'Players', 'Wallets', 'Latest']} rows={(collection.data?.by_chain || []).map((row) => [chainBadge(row.chain), num(row.tokens || 0), num(row.players || 0), num(row.wallets || 0), fmtTime(row.latest_at)])} />
                  <CompactTable title={`${collection.label} by Rarity`} subtitle="Joined against nft_rarities." columns={['Rarity', 'NFTs', 'Players', 'Latest']} rows={(collection.data?.by_rarity || []).map((row) => [rarityBadge(row.rarity), num(row.tokens || 0), num(row.players || 0), fmtTime(row.latest_at)])} />
                  <CompactTable title={`${collection.label} Levels`} subtitle="Legacy level cache for migration/debug." columns={['Level', 'NFTs', 'Players', 'Latest']} rows={(collection.data?.by_level || []).map((row) => [`L${row.level || 1}`, num(row.tokens || 0), num(row.players || 0), fmtTime(row.latest_at)])} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="admin-grid two">
        <CompactTable title="Bridge Log Phases" subtitle="Recent health by bridge phase and status." columns={['Phase', 'Status', 'Count', 'Latest']} rows={(logs.by_phase || []).map((row) => [row.phase || '-', statusBadge(row.status), row.count, fmtTime(row.latest_at)])} />
      </div>
      <div className="admin-card">
        <div className="admin-card-head">
          <div><div className="admin-card-title">Recent Bridges</div><div className="admin-card-sub">Latest burn, destination, and minted asset references.</div></div>
        </div>
        <div className="admin-card-body">
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead><tr><th>Time</th><th>Route</th><th>Level</th><th>Source Ref</th><th>Burn Tx</th><th>Destination</th><th>Dest Tx / Asset</th></tr></thead>
              <tbody>{(bridges.recent || []).map((row, idx) => <tr key={`${row.source_ref}-${idx}`}><td>{fmtTime(row.created_at)}</td><td>{chainBadge(row.source_chain)} <span className="admin-card-sub">to</span> {chainBadge(row.dest_chain)}</td><td>{row.level || '-'}</td><td className="admin-mono">{short(row.source_ref, 12, 8)}</td><td className="admin-mono">{short(row.burn_tx_hash, 12, 8)}</td><td className="admin-mono">{short(row.dest_address, 12, 8)}</td><td className="admin-mono">{row.dest_tx_or_asset ? short(row.dest_tx_or_asset, 14, 10) : <span className="admin-badge gold">pending</span>}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
      <CompactTable title="Recent Bridge Errors" subtitle="Most recent bridge log rows with status=error." columns={['Time', 'Request', 'Phase', 'Route', 'Error']} rows={(logs.recent || []).filter((row) => row.status === 'error').slice(0, 50).map((row) => [fmtTime(row.created_at), short(row.request_id, 10, 6), row.phase, `${row.source_chain || '-'} -> ${row.dest_chain || '-'}`, row.error || '-'])} />
    </div>
  );
}

function FeedbackPanel({ data }) {
  const rows = data?.rows || [];
  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Feedback', value: data?.summary?.total || rows.length },
        { label: '24h', value: data?.summary?.day || 0, tone: 'blue' },
        { label: 'Problems', value: data?.summary?.problems || 0, tone: 'red' },
        { label: 'General', value: data?.summary?.feedback || 0, tone: 'green' },
      ]} />
      <div className="admin-table-wrap admin-scroll">
        <table className="admin-table">
          <thead><tr><th>Time</th><th>Kind</th><th>Player</th><th>Message</th><th>Contact</th><th>Page</th><th>Status</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td className="admin-mono">{fmtTime(row.created_at)}</td><td><span className={'admin-badge ' + (row.kind === 'problem' ? 'red' : 'blue')}>{row.kind}</span></td><td><strong>{row.player_name || 'anonymous'}</strong><div className="admin-card-sub">{row.player_dex || '-'}</div></td><td style={{ minWidth: 320, whiteSpace: 'pre-wrap' }}>{row.message}</td><td>{row.contact_type || '-'}<div className="admin-card-sub">{row.contact_value || ''}</div></td><td style={{ wordBreak: 'break-word' }}>{row.page_url}</td><td>{row.status || '-'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function AiReportsPanel({ data, reload }) {
  const reports = data?.reports || [];
  const [open, setOpen] = useState(null);
  async function runReport() {
    await adminPost('/admin/ai-log-reports/run', { lookback_hours: 24 });
    await reload();
  }
  return (
    <div className="admin-grid">
      <div className="admin-card">
        <div className="admin-card-head"><div><div className="admin-card-title">AI Log Reports</div><div className="admin-card-sub">Model: {data?.model || '-'}. Daily reports plus manual 24h run.</div></div><button className="admin-btn primary" onClick={runReport}>Run 24h report</button></div>
        <div className="admin-card-body">
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>Window</th><th>Status</th><th>Model</th><th>Counts</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>{reports.map((row) => <tr key={row.id}><td className="admin-mono">#{row.id}</td><td>{fmtTime(row.window_start)}<br />{fmtTime(row.window_end)}</td><td><span className={'admin-badge ' + (row.status === 'ok' || row.status === 'complete' ? 'green' : row.status === 'failed' ? 'red' : 'gold')}>{row.status}</span></td><td>{row.model}</td><td><pre className="admin-mono">{JSON.stringify(row.counts || row.summary_counts || {}, null, 2)}</pre></td><td>{fmtTime(row.created_at)}</td><td><button className="admin-btn" onClick={() => setOpen(row)}>Open</button></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
      {open && <Drawer title={`AI Report #${open.id}`} subtitle={`${fmtTime(open.window_start)} - ${fmtTime(open.window_end)}`} onClose={() => setOpen(null)}><pre className="admin-mono admin-scroll" style={{ whiteSpace: 'pre-wrap', overflow: 'auto' }}>{open.report_text || open.markdown || open.summary || JSON.stringify(open, null, 2)}</pre></Drawer>}
    </div>
  );
}

function PhantomBotsPanel({ data, reload }) {
  const [q, setQ] = useState('');
  const [exchange, setExchange] = useState('all');
  const [status, setStatus] = useState('all');
  const [hours, setHours] = useState(Number(data?.hours) || 24);

  useEffect(() => {
    if (data?.hours != null) setHours(Number(data.hours) || 24);
  }, [data?.hours]);

  if (!data) return <LoadingCard title="Phantom Bots" />;

  const bots = Array.isArray(data.bots) ? data.bots : [];
  const exchanges = Array.from(new Set(bots.map((b) => String(b.exchange || '').toLowerCase()).filter(Boolean))).sort();
  const filtered = bots.filter((bot) => {
    const hay = `${bot.user_id || ''} ${bot.id || ''} ${bot.exchange || ''} ${bot.kind || ''}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (exchange !== 'all' && String(bot.exchange || '').toLowerCase() !== exchange) return false;
    if (status === 'live' && !bot.live) return false;
    if (status === 'stopped' && bot.live) return false;
    if (status === 'historical' && bot.status !== 'historical') return false;
    return true;
  });

  const periodNum = (bot, key) => Number(bot?.period?.[key] || 0) || 0;
  const shortId = (id) => {
    const s = String(id || '');
    if (s.length <= 28) return s;
    return `${s.slice(0, 10)}…${s.slice(-10)}`;
  };

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Running now', value: data.running_count || 0, tone: 'green' },
        { label: 'Tracked bots', value: data.bot_count || 0, tone: 'blue' },
        { label: 'Users', value: data.user_count || 0 },
        { label: 'Window', value: `${data.hours || hours}h`, tone: 'gold' },
      ]} />

      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Filters</div>
            <div className="admin-card-sub">Live strategies from Phantom + period PnL from audit_log (same source as Telegram stats).</div>
          </div>
          <div className="admin-actions">
            <button className="admin-btn" onClick={() => reload(hours)}>Refresh</button>
          </div>
        </div>
        <div className="admin-card-body" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <label className="admin-field">
            <span className="admin-label">Search user / id</span>
            <input className="admin-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="uuid / exchange / kind" />
          </label>
          <label className="admin-field">
            <span className="admin-label">Exchange</span>
            <select className="admin-select" value={exchange} onChange={(e) => setExchange(e.target.value)}>
              <option value="all">All</option>
              {exchanges.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
            </select>
          </label>
          <label className="admin-field">
            <span className="admin-label">Status</span>
            <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="live">Live only</option>
              <option value="stopped">Not live</option>
              <option value="historical">Historical (audit only)</option>
            </select>
          </label>
          <label className="admin-field">
            <span className="admin-label">Hours</span>
            <select
              className="admin-select"
              value={hours}
              onChange={(e) => {
                const next = Number(e.target.value) || 24;
                setHours(next);
                reload(next);
              }}
            >
              <option value={1}>1h</option>
              <option value={6}>6h</option>
              <option value={12}>12h</option>
              <option value={24}>24h</option>
              <option value={168}>7d</option>
            </select>
          </label>
        </div>
      </div>

      <CompactTable
        title={`Bots (${filtered.length})`}
        subtitle={`Showing filtered rows · period window ${data.hours || hours}h`}
        columns={['User', 'Exchange', 'Kind', 'Status', 'Fills/Closes', 'Volume', 'Fees', 'Net', 'Id']}
        rows={filtered.map((bot) => {
          const vol = periodNum(bot, 'volume_usd');
          const fees = periodNum(bot, 'fees_usd');
          const net = periodNum(bot, 'net_after_fees_usd');
          const fills = Number(bot?.period?.fills || 0) || 0;
          const closes = Number(bot?.period?.closes || 0) || 0;
          return [
            <span className="admin-mono" key="u">{String(bot.user_id || '').slice(0, 8) || '-'}</span>,
            String(bot.exchange || '-').toUpperCase(),
            bot.kind || '-',
            bot.live
              ? <span className="admin-badge green" key="s">LIVE</span>
              : <span className={'admin-badge ' + (bot.status === 'historical' ? 'gold' : '')} key="s">{String(bot.status || 'stopped').toUpperCase()}</span>,
            `${fills} / ${closes}`,
            fmtUsd(vol, 2),
            fmtUsd(fees, 4),
            <span key="n" style={{ color: net >= 0 ? 'var(--admin-green)' : 'var(--admin-red)' }}>{fmtUsd(net, 4)}</span>,
            <span className="admin-mono" title={bot.id} key="id">{shortId(bot.id)}</span>,
          ];
        })}
      />

      <CompactTable
        title="Exchange totals"
        subtitle={`Aggregated across all users · ${data.hours || hours}h`}
        columns={['Exchange', 'Users', 'Fills', 'Closes', 'Volume', 'Fees', 'Realized', 'Wins', 'Losses']}
        rows={(data.exchange_totals || []).map((row) => [
          String(row.exchange || '').toUpperCase(),
          row.users || 0,
          row.fills || 0,
          row.closes || 0,
          fmtUsd(Number(row.volume_usd) || 0, 2),
          fmtUsd(Number(row.fees_usd) || 0, 4),
          fmtUsd(Number(row.realized_pnl_usd) || 0, 4),
          fmtUsd(Number(row.wins_usd) || 0, 4),
          fmtUsd(Number(row.losses_usd) || 0, 4),
        ])}
      />
    </div>
  );
}

function LoadingCard({ title }) {
  return (
    <div className="admin-card">
      <div className="admin-card-head"><div><div className="admin-card-title">{title}</div><div className="admin-card-sub">Loading current admin data.</div></div></div>
      <div className="admin-card-body"><div className="admin-help">Waiting for API response...</div></div>
    </div>
  );
}

function CompactTable({ title, subtitle, columns, rows }) {
  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <div><div className="admin-card-title">{title}</div><div className="admin-card-sub">{subtitle}</div></div>
      </div>
      <div className="admin-card-body">
        <div className="admin-table-wrap compact admin-scroll">
          <table className="admin-table">
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {(rows || []).length ? rows.map((row, index) => (
                <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell ?? '-'}</td>)}</tr>
              )) : (
                <tr><td colSpan={columns.length}><span className="admin-help">No rows yet.</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GenericDataPanel({ id, data, reload }) {
  const summary = summarizeData(data);
  return (
    <div className="admin-grid">
      <div className="admin-card">
        <div className="admin-card-head">
          <div><div className="admin-card-title">{NAV.find((item) => item.id === id)?.label || id}</div><div className="admin-card-sub">This section is wired to the existing admin API. Detailed purpose-built tables can be migrated tab by tab without touching backend contracts.</div></div>
          <button className="admin-btn" onClick={reload}>Reload</button>
        </div>
        <div className="admin-card-body">
          {summary.length > 0 && <StatsGrid stats={summary} />}
          <pre className="admin-mono admin-scroll" style={{ marginTop: 14, overflow: 'auto', maxHeight: '65vh', whiteSpace: 'pre-wrap' }}>{JSON.stringify(data || {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children }) {
  return (
    <div className="admin-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-drawer">
        <div className="admin-drawer-head">
          <div><div className="admin-card-title" style={{ fontSize: 20 }}>{title}</div><div className="admin-card-sub">{subtitle}</div></div>
          <button className="admin-btn" onClick={onClose}>Close</button>
        </div>
        <div className="admin-drawer-body admin-scroll">{children}</div>
      </div>
    </div>
  );
}

function MetricSelect({ value, onChange }) {
  return (
    <select className="admin-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="points">Weighted points</option>
      <option value="volume_usd">Volume</option>
      <option value="pnl_usd">Positive PnL</option>
      <option value="trades_count">Trades</option>
      <option value="trophies">Trophies</option>
      <option value="gold">Gold</option>
    </select>
  );
}

function DateTimeField({ label, value, onChange }) {
  return (
    <label className="admin-field">
      <span className="admin-label">{label}</span>
      <input
        className="admin-input"
        type="datetime-local"
        value={utcTextToDatetimeLocal(value)}
        onChange={(e) => onChange(datetimeLocalToUtcText(e.target.value))}
      />
      <span className="admin-card-sub">UTC time</span>
    </label>
  );
}

function NumberField({ label, value, onChange, step = '1' }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value ?? ''));
  }, [focused, value]);

  function commitDraft(nextDraft = draft) {
    const text = String(nextDraft || '').trim();
    if (!text || text === '-' || text === '.' || text === '-.') {
      setDraft(String(value ?? ''));
      return;
    }
    const numeric = Number(text.replace(',', '.'));
    if (!Number.isFinite(numeric)) {
      setDraft(String(value ?? ''));
      return;
    }
    onChange(numeric);
    setDraft(String(numeric));
  }

  function updateDraft(text) {
    setDraft(text);
    const normalized = String(text || '').trim().replace(',', '.');
    if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) onChange(numeric);
  }

  return (
    <label className="admin-field">
      <span className="admin-label">{label}</span>
      <input
        className="admin-input"
        data-number-input="true"
        type="text"
        inputMode={step === '1' ? 'numeric' : 'decimal'}
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commitDraft(); }}
        onChange={(e) => updateDraft(e.target.value)}
      />
    </label>
  );
}

function ToggleChoice({ active, title, subtitle, onClick }) {
  return (
    <button className={'admin-choice' + (active ? ' active' : '')} type="button" onClick={onClick}>
      <strong>{title}</strong>
      <div className="admin-card-sub">{subtitle}</div>
    </button>
  );
}

function DexBadge({ dex }) {
  return <span className="admin-badge blue">{DEX_LABELS[dex] || dex || '-'}</span>;
}

function chainBadge(chain) {
  return <span className="admin-badge blue">{chain || 'unknown'}</span>;
}

function rarityBadge(rarity) {
  const value = String(rarity || 'unrevealed').toLowerCase();
  const label = value === 'unrevealed'
    ? 'Unrevealed'
    : value.charAt(0).toUpperCase() + value.slice(1);
  let tone = 'off';
  if (value === 'common') tone = 'blue';
  if (value === 'epic') tone = 'purple';
  if (value === 'legendary') tone = 'gold';
  return <span className={'admin-badge ' + tone}>{label}</span>;
}

function statusBadge(status) {
  const value = status || 'unknown';
  let tone = 'off';
  if (['active', 'paid', 'delivered', 'success', 'ok', 'complete'].includes(value)) tone = 'green';
  if (['reserved', 'delivering', 'pending', 'awaiting_deposit'].includes(value)) tone = 'gold';
  if (['error', 'failed', 'cancelled', 'canceled'].includes(value)) tone = 'red';
  return <span className={'admin-badge ' + tone}>{value}</span>;
}

function TroopBalanceBadges({ row }) {
  const signal = String(row?.balance_signal || 'insufficient_sample');
  const sample = String(row?.sample_status || 'low_sample');
  const signalConfig = {
    high_win: { tone: 'red', label: 'High win' },
    low_win: { tone: 'gold', label: 'Low win' },
    neutral: { tone: 'green', label: 'Neutral' },
    insufficient_sample: { tone: 'off', label: 'Need data' },
  }[signal] || { tone: 'off', label: signal };
  const sampleConfig = {
    reliable: { tone: 'blue', label: 'Reliable' },
    directional: { tone: 'purple', label: 'Directional' },
    low_sample: { tone: 'off', label: 'Low sample' },
  }[sample] || { tone: 'off', label: sample };
  return (
    <div className="admin-filter-row" style={{ flexWrap: 'nowrap' }}>
      <span className={'admin-badge ' + signalConfig.tone}>{signalConfig.label}</span>
      <span className={'admin-badge ' + sampleConfig.tone}>{sampleConfig.label}</span>
    </div>
  );
}

function PresenceBadge({ player }) {
  if (player.banned_at) return <span className="admin-badge red">BANNED</span>;
  if (player.online) return <span className="admin-badge green">ONLINE</span>;
  if (player.active_24h) return <span className="admin-badge blue">24h</span>;
  if (player.active_7d) return <span className="admin-badge off">7d</span>;
  return <span className="admin-badge off">OFF</span>;
}

function MatchmakingPlayerCell({ player }) {
  const mm = player.matchmaking || {};
  const raids = Number(mm.raids_7d || 0);
  const decided = Number(mm.decided_7d || 0);
  const success = mm.success_rate_7d == null ? null : Number(mm.success_rate_7d);
  let tone = 'off';
  if (decided > 0) tone = success >= 0.55 && success <= 0.6 ? 'green' : 'gold';
  if (decided >= 3 && success < 0.45) tone = 'red';
  return (
    <div>
      <span className={'admin-badge ' + tone}>{decided > 0 ? formatPct(success) : 'No raids'}</span>
      <div className="admin-card-sub">
        {num(raids)} raids - bot {formatPct(mm.bot_share_7d)} - rec {num(mm.recovery_matches_7d || 0)}
      </div>
      {mm.last ? (
        <div className="admin-card-sub">
          last {mm.last.target_is_bot ? (mm.last.target_bot_difficulty || 'bot') : 'live'} - {mm.last.result || 'pending'}
        </div>
      ) : null}
    </div>
  );
}

function MmBotsAccessCell({ player, busy, onToggle }) {
  const enabled = !!(player?.mm_bots_enabled || player?.mm_bots_access?.enabled);
  const action = enabled ? 'revoke' : 'grant';
  const actionBusy = busy === `${action}:${player?.id}`;
  return (
    <div className="admin-filter-row">
      <span className={'admin-badge ' + (enabled ? 'green' : 'off')}>
        {enabled ? 'Enabled' : 'Off'}
      </span>
      <button
        className={'admin-btn ' + (enabled ? 'danger' : 'green')}
        onClick={() => onToggle?.(player, !enabled)}
        disabled={!!busy}
      >
        {actionBusy ? 'Saving...' : enabled ? 'Revoke' : 'Grant'}
      </button>
      {player?.mm_bots_access?.updated_at ? (
        <span className="admin-card-sub">{fmtTime(player.mm_bots_access.updated_at)}</span>
      ) : null}
    </div>
  );
}

function PrizeSummary({ tournament }) {
  const tiers = Array.isArray(tournament.prize_tiers) ? tournament.prize_tiers : [];
  if (!tiers.length) return <span className="admin-badge off">No prizes</span>;
  const first = tiers[0];
  const rewards = first.rewards || [];
  return (
    <span>
      <span className="admin-badge gold">{fmtUsd(first.volume_usd)} unlock</span>
      <div className="admin-card-sub">{rewards.map((r) => `${r.label || r.type}: ${r.pool_amount || 0} ${r.currency || r.unit || ''}`).join(', ')}</div>
    </span>
  );
}

function summarizeData(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).slice(0, 6).map(([key, value]) => {
    let rendered = Array.isArray(value) ? value.length : value;
    if (value && typeof value === 'object' && !Array.isArray(value)) rendered = Object.keys(value).length;
    if (typeof rendered === 'number') rendered = rendered.toLocaleString();
    if (typeof rendered === 'string' && rendered.length > 16) rendered = rendered.slice(0, 16);
    return { label: key.replace(/_/g, ' '), value: rendered ?? '-' };
  });
}

function normalizeDexRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([dex, row]) => ({ dex, ...(row && typeof row === 'object' ? row : { value: row }) }));
}

function dexAccent(dex) {
  const map = {
    pacifica: '#8b5cf6',
    decibel: '#ffd700',
    avantis: '#38bdf8',
    domfi: '#63aca5',
    etoro: '#6FCF17',
    gmx: '#9aa8ff',
    phoenix: '#fb923c',
    monad: '#a78bfa',
    perpl: '#a78bfa',
    hyperliquid: '#86efac',
    grvt: '#5eead4',
    nado: '#67e8f9',
    ondo: '#111111',
    hotstuff: '#f97316',
    risex: '#f43f5e',
    katana: '#eab308',
    gmtrade: '#22c55e',
    flash: '#22c55e',
  };
  return map[String(dex || '').toLowerCase()] || 'var(--admin-blue)';
}

function emptyTaskForm() {
  return {
    id: null,
    type: 'volume',
    title: '',
    description: '',
    params: { symbol: 'any', side: 'any', target_volume: 1000, eligibility: { mode: 'all', label: '' } },
    reward_gold: 0,
    reward_wood: 0,
    reward_ore: 0,
    active: true,
    repeatable: false,
    cooldown_hours: 0,
    sort_order: 0,
    starts_at: '',
    ends_at: '',
  };
}

function adminTaskParamSymbol(params) {
  const p = params && typeof params === 'object' ? params : {};
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
    const text = String(value || '').trim();
    if (!text || text === '*' || text.toLowerCase() === 'any') continue;
    let base = text
      .toUpperCase()
      .replace(/^\$/, '')
      .trim()
      .split(/\s+/)[0]
      .split(/[-/]/)[0]
    if (base.includes('.')) {
      const parts = base.split('.').filter(Boolean);
      base = parts[parts.length - 1] || base;
    }
    base = base.replace(/[^A-Z0-9]/g, '');
    const quotes = ['USDC', 'USDT', 'USDE', 'USD', 'DAI', 'AUSD'];
    for (const quote of quotes) {
      if (base.length > quote.length + 1 && base.endsWith(quote)) {
        const withoutQuote = base.slice(0, -quote.length);
        const scaled = withoutQuote.match(/^(?:1000|10000|1000000|1K|1M)([A-Z][A-Z0-9]{1,})$/);
        return scaled ? scaled[1] : withoutQuote;
      }
    }
    const scaled = base.match(/^(?:1000|10000|1000000|1K|1M)([A-Z][A-Z0-9]{1,})$/);
    if (scaled) return scaled[1];
    return base;
  }
  return 'any';
}

function taskToForm(task) {
  const params = { ...(task.params || {}) };
  params.eligibility = normalizeTaskEligibilityConfig(params);
  params.symbol = adminTaskParamSymbol(params);
  params.side = String(params.side || 'any').toLowerCase();
  return {
    ...emptyTaskForm(),
    ...task,
    active: !!task.active,
    repeatable: !!task.repeatable,
    starts_at: task.starts_at || '',
    ends_at: task.ends_at || '',
    params,
  };
}

function taskPrimaryTarget(form) {
  const p = form.params || {};
  if (form.type === 'positions') return p.target_positions ?? 0;
  if (form.type === 'daily_trade_gold') return p.target_gold ?? 0;
  return p.target_volume ?? 0;
}

function setTaskPrimaryTarget(form, value) {
  const params = { ...(form.params || {}) };
  if (form.type === 'positions') params.target_positions = value;
  else if (form.type === 'daily_trade_gold') params.target_gold = value;
  else params.target_volume = value;
  return params;
}

function taskFormToBody(form) {
  const params = { ...(form.params || {}) };
  params.eligibility = normalizeTaskEligibilityConfig(params);
  params.symbol = adminTaskParamSymbol(params);
  params.side = String(params.side || 'any').toLowerCase();
  if (form.type === 'volume' && params.target_volume == null) params.target_volume = Number(params.target || 0) || 0;
  if (form.type === 'positions' && params.target_positions == null) params.target_positions = Number(params.target || 0) || 0;
  if (form.type === 'combo_volume_attack') {
    if (params.target_volume == null) params.target_volume = Number(params.target || 0) || 0;
    if (params.target_wins == null) params.target_wins = 1;
  }
  if (form.type === 'daily_trade_gold') {
    if (params.target_gold == null) params.target_gold = Number(params.target || 0) || 0;
    if (params.window_hours == null) params.window_hours = 24;
  }
  delete params.target;
  delete params.target_value;
  delete params.volume_target;
  delete params.attack_wins;
  delete params.wins_target;
  delete params.gold_target;
  return {
    type: form.type,
    title: form.title,
    description: form.description,
    params,
    reward_gold: Number(form.reward_gold) || 0,
    reward_wood: Number(form.reward_wood) || 0,
    reward_ore: Number(form.reward_ore) || 0,
    active: !!form.active,
    repeatable: !!form.repeatable,
    cooldown_hours: Number(form.cooldown_hours) || 0,
    sort_order: Number(form.sort_order) || 0,
    starts_at: String(form.starts_at || '').trim(),
    ends_at: String(form.ends_at || '').trim(),
  };
}

function wizardHint(index) {
  return ['time first', 'who can join', 'how rank works', 'what unlocks', 'final payload'][index];
}

function toneColor(tone) {
  if (tone === 'green') return 'var(--admin-green)';
  if (tone === 'blue') return 'var(--admin-blue)';
  if (tone === 'red') return 'var(--admin-red)';
  if (tone === 'purple') return '#c084fc';
  return 'var(--admin-gold)';
}

function short(value, head = 6, tail = 4) {
  const s = String(value || '');
  if (!s) return '-';
  return s.length > head + tail + 3 ? `${s.slice(0, head)}...${s.slice(-tail)}` : s;
}

function compactWallet(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.replace(/[\s-]+/g, '');
}

function num(value) {
  return Number(value || 0).toLocaleString();
}

function formatPct(value, digits = 1) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '-';
  const pct = Number(value) * 100;
  const fixed = pct.toFixed(digits);
  return `${fixed.replace(/\.0$/u, '')}%`;
}

function formatSignedPct(value, digits = 1) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '-';
  const numeric = Number(value);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${formatPct(numeric, digits)}`;
}

function ratioText(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(2)}x`;
}

function averageMatchmakingRate(players) {
  let wins = 0;
  let decided = 0;
  for (const player of players || []) {
    const mm = player.matchmaking || {};
    wins += Number(mm.wins_7d || 0);
    decided += Number(mm.decided_7d || 0);
  }
  return decided > 0 ? formatPct(wins / decided) : '-';
}

function fmtMaybeUsd(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '-';
  return fmtUsd(Number(value), 2);
}

function fmtUsdcUnits(value) {
  if (value == null || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return fmtUsd(n / 1_000_000, 2);
}
