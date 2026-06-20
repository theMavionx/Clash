import { useEffect, useMemo, useState } from 'react';
import { adminDelete, adminGet, adminPatch, adminPost, clearAdminKey, getStoredAdminKey, storeAdminKey } from './api';
import {
  DEX_LABELS,
  PRIZE_PRESETS,
  TOURNAMENT_DEXES,
  buildPayouts,
  emptyTournament,
  fmtTime,
  fmtUsd,
  formToTournamentBody,
  normalizeReward,
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

function tournamentUtcDays(form, limit = 31) {
  const startMs = parseUtcDateMs(form.start_at);
  if (!Number.isFinite(startMs)) return [];
  const endMsRaw = parseUtcDateMs(form.end_at);
  const dayMs = 24 * 60 * 60 * 1000;
  const first = Date.parse(`${formatUtcDay(startMs)}T00:00:00Z`);
  const lastSource = Number.isFinite(endMsRaw) ? Math.max(startMs, endMsRaw - 1) : first + 6 * dayMs;
  const last = Date.parse(`${formatUtcDay(lastSource)}T00:00:00Z`);
  const count = Math.max(1, Math.min(limit, Math.floor((last - first) / dayMs) + 1));
  return Array.from({ length: count }, (_, idx) => formatUtcDay(first + idx * dayMs));
}

function dailyPoolAutoPoints(base, pct, index) {
  const points = Math.max(1, Number(base) || 1000) * Math.pow(1 + (Number(pct) || 0) / 100, Math.max(0, index));
  return Math.max(1, Math.round(points));
}

const NAV = [
  { id: 'overview', label: 'Overview', hint: 'Live health and workload', icon: 'OV' },
  { id: 'players', label: 'Players', hint: 'Accounts, resources, tools', icon: 'PL' },
  { id: 'tournaments', label: 'Tournaments', hint: 'Events, rewards, scoring', icon: 'TN' },
  { id: 'replays', label: 'Battle Replays', hint: 'Verification history', icon: 'BR' },
  { id: 'tasks', label: 'Tasks', hint: 'Quest config and progress', icon: 'TS' },
  { id: 'stats', label: 'Stats', hint: 'Activity and devices', icon: 'ST' },
  { id: 'earnings', label: 'Earnings', hint: 'Revenue analytics', icon: 'ER' },
  { id: 'shop', label: 'Shop', hint: 'Billing and AI chat', icon: 'SH' },
  { id: 'marketplace', label: 'Marketplace', hint: 'Custodial orders', icon: 'MP' },
  { id: 'nft', label: 'NFT / Bridge', hint: 'Supply and bridge state', icon: 'NF' },
  { id: 'logs', label: 'Logs', hint: 'Server logs', icon: 'LG' },
  { id: 'client', label: 'Client Logs', hint: 'Browser diagnostics', icon: 'CL' },
  { id: 'ai-reports', label: 'AI Log Reports', hint: 'Daily incident reports', icon: 'AI' },
  { id: 'feedback', label: 'Feedback', hint: 'Player reports', icon: 'FB' },
  { id: 'elfa', label: 'Elfa', hint: 'Signal stats', icon: 'EF' },
];

const SIMPLE_LOADERS = {
  replays: () => adminGet('/admin/replays'),
  tasks: () => Promise.all([adminGet('/admin/tasks'), adminGet('/admin/tasks-summary')]).then(([tasks, summary]) => ({ tasks, summary })),
  stats: () => Promise.all([
    adminGet('/admin/stats'),
    adminGet('/admin/matchmaking/stats?days=7').catch((error) => ({ error: error.message })),
  ]).then(([stats, matchmaking]) => ({ ...stats, matchmaking })),
  earnings: () => Promise.all([
    adminGet('/admin/earnings'),
    adminGet('/admin/revenue-analytics').catch((error) => ({ error: error.message })),
  ]).then(([earnings, revenue]) => ({ earnings, revenue })),
  shop: () => Promise.all([
    adminGet('/admin/shop'),
    adminGet('/admin/ai-chat/billing').catch((error) => ({ error: error.message })),
  ]).then(([shop, aiBilling]) => ({ shop, aiBilling })),
  marketplace: () => adminGet('/admin/marketplace/custodial/stats?limit=500'),
  nft: () => adminGet('/admin/nft-analytics'),
  logs: () => adminGet('/admin/logs?limit=200'),
  client: () => adminGet('/admin/client-logs?since_min=60&limit=250'),
  'ai-reports': () => adminGet('/admin/ai-log-reports?limit=20'),
  feedback: () => adminGet('/admin/feedback?limit=200'),
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

  async function login(nextKey = key) {
    setError('');
    setLoading(true);
    try {
      await adminGet('/admin/players', { key: nextKey });
      storeAdminKey(nextKey);
      setKey(nextKey);
      setAuthed(true);
      await refreshCore();
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
      if (active === 'overview' || active === 'players' || active === 'tournaments' || active === 'replays') {
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
    refreshActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, authed]);

  useEffect(() => {
    if (!authed) return undefined;
    const id = setInterval(() => {
      if (active === 'overview' || active === 'players') refreshCore().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [active, authed]);

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
            {active === 'tournaments' && <TournamentsPanel tournaments={tournaments} reload={refreshCore} />}
            {active === 'replays' && <ReplaysPanel replays={replays} />}
            {active === 'stats' && <StatsPanel data={simpleData.stats} />}
            {active === 'tasks' && <TasksPanel data={simpleData.tasks} reload={refreshActive} />}
            {active === 'client' && <ClientLogsPanel data={simpleData.client} reload={refreshActive} />}
            {active === 'logs' && <ServerLogsPanel data={simpleData.logs} reload={refreshActive} />}
            {active === 'earnings' && <EarningsPanel data={simpleData.earnings} reload={refreshActive} />}
            {active === 'shop' && <ShopPanel data={simpleData.shop} />}
            {active === 'marketplace' && <MarketplacePanel data={simpleData.marketplace} reload={refreshActive} />}
            {active === 'nft' && <NftPanel data={simpleData.nft} />}
            {active === 'feedback' && <FeedbackPanel data={simpleData.feedback} />}
            {active === 'ai-reports' && <AiReportsPanel data={simpleData['ai-reports']} reload={refreshActive} />}
            {active === 'elfa' && <ElfaPanel data={simpleData.elfa} />}
            {!['overview', 'players', 'tournaments', 'replays', 'stats', 'tasks', 'client', 'logs', 'earnings', 'shop', 'marketplace', 'nft', 'feedback', 'ai-reports', 'elfa'].includes(active) && (
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
  const [selected, setSelected] = useState(null);
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
  ];

  return (
    <div className="admin-grid">
      <StatsGrid stats={stats} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Players</div>
            <div className="admin-card-sub">Search by name, id, or wallet. Row actions open a focused operations drawer.</div>
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
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th><th>DEX</th><th>Wallet</th><th>Trophies</th><th>Level</th><th>MM 7d</th><th>Gold</th><th>Wood</th><th>Ore</th><th>Trade Vol</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id || p.name}>
                    <td><strong>{p.name}</strong><div className="admin-card-sub admin-mono">{p.id}</div></td>
                    <td><DexBadge dex={p.dex} /></td>
                    <td className="admin-mono">{short(p.wallet)}</td>
                    <td>{p.trophies}</td>
                    <td>{p.level}</td>
                    <td><MatchmakingPlayerCell player={p} /></td>
                    <td style={{ color: 'var(--admin-gold)' }}>{num(p.gold)}</td>
                    <td style={{ color: 'var(--admin-wood)' }}>{num(p.wood)}</td>
                    <td style={{ color: '#b8c4d8' }}>{num(p.ore)}</td>
                    <td>{fmtUsd(p.trading_volume || 0)}</td>
                    <td><PresenceBadge player={p} /></td>
                    <td><button className="admin-btn" onClick={() => setSelected(p)}>Tools</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selected && <PlayerToolsDrawer player={selected} onClose={() => setSelected(null)} reload={reload} />}
    </div>
  );
}

function PlayerToolsDrawer({ player, onClose, reload }) {
  const [resource, setResource] = useState({ gold: 5000, wood: 5000, ore: 5000 });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

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

  return (
    <Drawer title={`Player Tools · ${player.name}`} subtitle="Dangerous actions are grouped here so the main table stays readable." onClose={onClose}>
      <div className="admin-grid">
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
            {[1, 2, 3, 4, 5].map((level) => (
              <button className="admin-btn" key={level} onClick={() => run(`Max village TH${level}`, () => adminPost(`/admin/players/${encodeURIComponent(player.name)}/max-village`, { town_hall_level: level }))}>TH {level}</button>
            ))}
            <button className="admin-btn green" onClick={() => run('Max everything', async () => {
              await adminPost(`/admin/players/${encodeURIComponent(player.name)}/max-village`, { town_hall_level: 5 });
              return adminPost(`/admin/players/${encodeURIComponent(player.name)}/add-resources`, { gold: 999999999, wood: 999999999, ore: 999999999 });
            })}>Max everything</button>
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
  const [editing, setEditing] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const filtered = tournaments.filter((t) => `${t.name || ''} ${t.id} ${t.dex || ''} ${t.status || ''}`.toLowerCase().includes(query.toLowerCase()));
  const active = tournaments.filter((t) => t.status === 'active').length;
  const draft = tournaments.filter((t) => t.status === 'draft').length;
  const ended = tournaments.filter((t) => t.status === 'ended').length;

  async function forceEnd(id) {
    if (!window.confirm(`Force-end tournament #${id}?`)) return;
    await adminPost(`/admin/tournaments/${id}/end`, {});
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

  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Tournaments', value: tournaments.length },
        { label: 'Active', value: active, tone: 'green' },
        { label: 'Draft', value: draft, tone: 'gold' },
        { label: 'Ended', value: ended },
      ]} />
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <div className="admin-card-title">Tournament Control</div>
            <div className="admin-card-sub">Creation and editing uses a step wizard: schedule, eligibility, scoring, rewards, review.</div>
          </div>
          <button className="admin-btn primary" onClick={() => setEditing(emptyTournament())}>Create tournament</button>
        </div>
        <div className="admin-card-body">
          <div className="admin-toolbar">
            <input className="admin-input" placeholder="Search tournaments" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="admin-help">{filtered.length} shown</span>
          </div>
          <div className="admin-table-wrap admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th><th>Name</th><th>DEX</th><th>Mode</th><th>Phase</th><th>Players</th><th>Window</th><th>Prize</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="admin-mono">#{t.id}</td>
                    <td><strong>{t.name}</strong><div className="admin-card-sub">{t.description}</div></td>
                    <td>{t.dex_scope === 'all' ? <span className="admin-badge gold">All DEXes</span> : <DexBadge dex={t.dex} />}</td>
                    <td>{t.mode === 'dex_vs_dex' ? 'DEX vs DEX' : 'Individual'}</td>
                    <td><span className={'admin-badge ' + (t.status === 'active' ? 'green' : t.status === 'draft' ? 'gold' : 'off')}>{t.phase || t.status}</span></td>
                    <td>{t.participants || 0}<div className="admin-card-sub">{t.registered || 0} registered</div></td>
                    <td className="admin-mono">{fmtTime(t.start_at)}<br />{fmtTime(t.end_at)}</td>
                    <td><PrizeSummary tournament={t} /></td>
                    <td>
                      <div className="admin-filter-row">
                        <button className="admin-btn" onClick={() => setEditing(tournamentToForm(t))}>Edit</button>
                        <button className="admin-btn" onClick={() => openLeaderboard(t)}>Leaderboard</button>
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

function TournamentWizard({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() => tournamentToForm(initial));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;
  const steps = ['Schedule', 'Eligibility', 'Scoring', 'Rewards', 'Review'];

  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function next() {
    const errors = validateTournamentStep(step, form);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setError('');
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  async function save() {
    const allErrors = steps.flatMap((_, idx) => validateTournamentStep(idx, form));
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
    <Drawer title={isEdit ? `Edit Tournament #${initial.id}` : 'Create Tournament'} subtitle="Guided setup keeps the form readable and validates each operational decision." onClose={onClose}>
      <div className="wizard">
        <div className="wizard-steps">
          {steps.map((label, idx) => (
            <button key={label} className={'wizard-step' + (step === idx ? ' active' : '')} onClick={() => setStep(idx)}>
              <span className="wizard-step-number">{idx + 1}</span>
              <span><strong>{label}</strong><span className="admin-card-sub" style={{ display: 'block' }}>{wizardHint(idx)}</span></span>
            </button>
          ))}
        </div>
        <div className="wizard-panel">
          {error && <div className="admin-error">{error}</div>}
          {step === 0 && <TournamentScheduleStep form={form} update={update} />}
          {step === 1 && <TournamentEligibilityStep form={form} update={update} />}
          {step === 2 && <TournamentScoringStep form={form} update={update} />}
          {step === 3 && <TournamentRewardsStep form={form} update={update} />}
          {step === 4 && <TournamentReviewStep form={form} />}
          <div className="wizard-footer">
            <button className="admin-btn" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Back</button>
            <div className="admin-filter-row">
              <button className="admin-btn ghost" onClick={onClose}>Cancel</button>
              {step < steps.length - 1 && <button className="admin-btn" onClick={save} disabled={saving}>{saving ? 'Saving...' : (isEdit ? 'Save' : 'Create')}</button>}
              {step < steps.length - 1 ? (
                <button className="admin-btn primary" onClick={next}>Next</button>
              ) : (
                <button className="admin-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : (isEdit ? 'Save changes' : 'Create tournament')}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function TournamentScheduleStep({ form, update }) {
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
      </div>
    </div>
  );
}

function TournamentEligibilityStep({ form, update }) {
  const eligible = form.dex_scope === 'custom' ? form.eligible_dexes : (form.dex_scope === 'all' ? TOURNAMENT_DEXES : [form.dex]);
  function toggleDex(dex) {
    const set = new Set(form.eligible_dexes || []);
    if (set.has(dex)) set.delete(dex);
    else set.add(dex);
    update({ eligible_dexes: Array.from(set), dex: form.dex || dex });
  }
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

function TournamentScoringStep({ form, update }) {
  const total = Number(form.points_trophy_weight || 0) + Number(form.points_volume_weight || 0) + Number(form.points_pnl_weight || 0);
  return (
    <div className="admin-card">
      <div className="admin-card-head"><div><div className="admin-card-title">Scoring and Boosts</div><div className="admin-card-sub">Keep the score model explicit before rewards are configured.</div></div></div>
      <div className="admin-card-body admin-grid">
        <div className="admin-form-grid three">
          <label className="admin-field"><span className="admin-label">Sort by</span><MetricSelect value={form.sort_by} onChange={(value) => update({ sort_by: value })} /></label>
          <label className="admin-field"><span className="admin-label">Scoring mode</span><select className="admin-select" value={form.scoring_mode} onChange={(e) => update({ scoring_mode: e.target.value })}><option value="live">Live scoring</option><option value="daily_pool">Daily point pool</option></select></label>
          <NumberField label="Daily pool points" value={form.daily_pool_points} onChange={(v) => update({ daily_pool_points: v })} />
        </div>
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
          <label className="admin-field"><span className="admin-label">Shield after raid hours</span><input className="admin-input" type="number" value={form.shield_hours} onChange={(e) => update({ shield_hours: e.target.value })} /></label>
          <label className="admin-field"><span className="admin-label">Freeze account trophies</span><select className="admin-select" value={form.freeze_trophies ? '1' : '0'} onChange={(e) => update({ freeze_trophies: e.target.value === '1' })}><option value="1">Yes</option><option value="0">No</option></select></label>
          <label className="admin-field"><span className="admin-label">Seeker only</span><select className="admin-select" value={form.seeker_only ? '1' : '0'} onChange={(e) => update({ seeker_only: e.target.value === '1' })}><option value="0">No</option><option value="1">Yes</option></select></label>
        </div>
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
          <div className="admin-card-sub">Automatic growth is exponential by UTC day. Manual day values override the auto calculation.</div>
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
  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <div><div className="admin-card-title">Rewards</div><div className="admin-card-sub">Prize tiers unlock by total tournament volume. Each tier can have cash, points, AMP, NFT, or custom rewards.</div></div>
        <button className="admin-btn primary" onClick={addTier}>Add tier</button>
      </div>
      <div className="admin-card-body admin-grid">
        <div className="admin-form-grid">
          <label className="admin-field"><span className="admin-label">Prize currency</span><input className="admin-input" value={form.prize_currency} onChange={(e) => update({ prize_currency: e.target.value.toUpperCase() })} /></label>
          <label className="admin-field"><span className="admin-label">Rewards in COP</span><select className="admin-select" value={form.rewards_in_cop ? '1' : '0'} onChange={(e) => update({ rewards_in_cop: e.target.value === '1' })}><option value="0">No</option><option value="1">Yes</option></select></label>
        </div>
        {!tiers.length && <div className="admin-help">No prize tiers configured. Tournament can still run without rewards.</div>}
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
  return (
    <Drawer title={`Leaderboard · #${t.id} ${t.name || ''}`} subtitle={`${rows.length} players · sort ${data.sort_label || t.sort_by || '-'}`} onClose={onClose}>
      <div className="admin-table-wrap admin-scroll">
        <table className="admin-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Score</th><th>Trophies</th><th>Gold</th><th>Trades</th><th>Volume</th><th>PnL</th><th>Prize</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const rewardWallet = compactWallet(r.reward_wallet_evm || r.reward_wallet_solana);
              return (
                <tr key={r.player_id || r.rank}>
                  <td>{r.rank}</td>
                  <td>
                    <strong>{r.name || short(r.wallet)}</strong>
                    {r.wallet ? <div className="admin-card-sub admin-mono admin-wallet-line">{short(r.wallet, 10, 6)}</div> : null}
                  </td>
                  <td>{r.team_label || r.dex || '-'}</td>
                  <td>{Number(r.score || 0).toFixed(2)}</td>
                  <td>{r.trophies || 0}</td>
                  <td>{r.gold || 0}</td>
                  <td>{r.trades_count || 0}</td>
                  <td>{fmtUsd(r.volume_usd || 0)}</td>
                  <td style={{ color: Number(r.pnl_usd || 0) >= 0 ? 'var(--admin-green)' : 'var(--admin-red)' }}>{fmtUsd(r.pnl_usd || 0, 2)}</td>
                  <td>
                    {Number(r.prize_amount || 0) > 0 ? fmtUsd(r.prize_amount, 2) : '-'}
                    {rewardWallet ? <div className="admin-card-sub admin-mono admin-wallet-line">{rewardWallet}</div> : null}
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
  const mmDecided = Number(mmSummary.decided_raids || 0);
  const mmRaids = Number(mmSummary.raids || 0);
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
            { label: 'Avg base ratio', value: ratioText(mmSummary.avg_base_power_ratio), tone: 'green' },
          ]} />
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
        { label: 'Active', value: summary.active || tasks.filter((t) => t.active).length, tone: 'green' },
        { label: 'Started', value: summary.started || 0, tone: 'blue' },
        { label: 'Claimed', value: summary.claimed || 0, tone: 'gold' },
        { label: '24h Started', value: summary.last_24h?.started || 0 },
        { label: '24h Claimed', value: summary.last_24h?.claimed || 0 },
      ]} />
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
              <thead><tr><th>ID</th><th>Task</th><th>Type</th><th>Rewards</th><th>Status</th><th>Started</th><th>Claimed</th><th>Avg Progress</th><th>Last Activity</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((task) => (
                  <tr key={task.id}>
                    <td className="admin-mono">#{task.id}</td>
                    <td><strong>{task.title}</strong><div className="admin-card-sub">{task.description}</div></td>
                    <td><span className="admin-badge blue">{task.type}</span>{task.repeatable ? <div className="admin-card-sub">repeat {task.cooldown_hours || 0}h</div> : null}</td>
                    <td>G:{task.reward_gold || 0} W:{task.reward_wood || 0} O:{task.reward_ore || 0}</td>
                    <td><span className={'admin-badge ' + (task.active ? 'green' : 'off')}>{task.active ? 'active' : 'inactive'}</span></td>
                    <td>{task.started_count || 0}</td>
                    <td>{task.claimed_count || 0}</td>
                    <td>{Math.round(Number(task.avg_progress || 0) * 100)}%</td>
                    <td>{fmtTime(task.last_claim || task.last_start)}</td>
                    <td><div className="admin-filter-row"><button className="admin-btn" onClick={() => setEditing(taskToForm(task))}>Edit</button><button className="admin-btn" onClick={() => setSelected(task)}>Players</button><button className="admin-btn danger" onClick={() => resetProgress(task)}>Reset</button><button className="admin-btn danger" onClick={() => deleteTask(task)}>Delete</button></div></td>
                  </tr>
                ))}
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
    <Drawer title={`Task Players · ${task.title}`} subtitle={`${data?.started || 0} started · ${data?.claimed || 0} claimed`} onClose={onClose}>
      {error && <div className="admin-error">{error}</div>}
      {!data ? <div className="admin-help">Loading...</div> : (
        <div className="admin-table-wrap admin-scroll">
          <table className="admin-table">
            <thead><tr><th>Player</th><th>Progress</th><th>Started</th><th>Claimed</th><th>Wallet</th></tr></thead>
            <tbody>{(data.players || []).map((row) => <tr key={row.player_id}><td><strong>{row.player_name || row.player_id}</strong><div className="admin-card-sub admin-mono">{row.player_id}</div></td><td>{row.progress_value || 0}/{row.target_value || 0}</td><td>{fmtTime(row.started_at)}</td><td>{row.claimed_at ? <span className="admin-badge green">{fmtTime(row.claimed_at)}</span> : <span className="admin-badge off">not claimed</span>}</td><td className="admin-mono">{short(row.wallet, 8, 6)}</td></tr>)}</tbody>
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
  const earnings = data?.earnings || {};
  const revenue = data?.revenue || {};
  const revenueWindows = Array.isArray(revenue.windows) ? revenue.windows : [];
  const windowAll = revenueWindows.find((row) => row.key === 'all') || revenueWindows[revenueWindows.length - 1] || {};
  const windowD30 = revenueWindows.find((row) => row.key === 'd30' || row.key === '30d') || {};
  const byDex = windowAll.dexes || revenue.dexes || revenue.by_dex || earnings.dexes || earnings.by_dex || {};
  const exactEarningsRows = Object.entries(earnings)
    .filter(([, value]) => value && typeof value === 'object' && 'earned_usd' in value)
    .map(([dex, value]) => ({ dex, ...value }));
  const exactTotalUsd = Number.isFinite(Number(earnings.total_usd))
    ? Number(earnings.total_usd)
    : exactEarningsRows.reduce((sum, row) => sum + (Number(row.earned_usd) || 0), 0);
  const tournaments = revenue.tournaments || revenue.by_tournament || [];
  return (
    <div className="admin-grid">
      <StatsGrid stats={[
        { label: 'Exact earned', value: fmtMaybeUsd(exactTotalUsd), tone: 'gold' },
        { label: 'Exact sources', value: num(exactEarningsRows.length), tone: 'green' },
        { label: '30d local volume', value: fmtMaybeUsd(windowD30.total_volume_usd ?? earnings.volume_30d_usd), tone: 'blue' },
        { label: '30d local trades', value: num(windowD30.total_trades || 0), tone: 'blue' },
      ]} />
      <div className="earnings-card-grid">
        {exactEarningsRows.map((row) => <EarningsDexCard key={row.dex} row={row} />)}
      </div>
      <div className="admin-grid two">
        <CompactTable title="DEX Local Model" subtitle={`Local volume x configured rate analytics for comparison only. Updated ${fmtTime(revenue.last_updated)}.`} columns={['DEX', 'Estimated fee', 'Volume', 'Trades', 'Model', 'Configured']} rows={normalizeDexRows(byDex).map((row) => [DEX_LABELS[row.dex] || row.dex || '-', fmtMaybeUsd(row.estimated_fee_usd ?? row.fee_usd), fmtMaybeUsd(row.volume_usd ?? row.total_volume_usd), row.trades || row.trades_count || 0, row.rate_label || row.model || row.source_detail || '-', row.configured === false ? <span className="admin-badge off">no</span> : <span className="admin-badge green">yes</span>])} />
        <CompactTable title="Tournament Local Model" subtitle="Tournament volume attribution using configured fee models. Not exact provider earnings." columns={['Tournament', 'DEX', 'Players', 'Volume', 'Estimated fee']} rows={(tournaments || []).slice(0, 80).map((row) => [row.name || `#${row.tournament_id || row.id}`, DEX_LABELS[row.dex] || row.dex || '-', row.players || '-', fmtMaybeUsd(row.volume_usd), fmtMaybeUsd(row.estimated_fee_usd)])} />
      </div>
      <CompactTable title="Exact Earnings Sources" subtitle={`Live/cached source reads. Total ${fmtMaybeUsd(exactTotalUsd)}.`} columns={['DEX', 'Earned', 'Volume', 'Trades', 'Currency', 'Source']} rows={exactEarningsRows.map((row) => [DEX_LABELS[row.dex] || row.dex, fmtMaybeUsd(row.earned_usd), fmtMaybeUsd(row.volume_usd), row.trades ?? row.local_trades ?? '-', row.currency || '-', row.source_detail || row.source || row.note || '-'])} />
      <div className="admin-card">
        <div className="admin-card-head"><div><div className="admin-card-title">Earnings Audit</div><div className="admin-card-sub">Full source payload is available when finance needs to inspect a provider mismatch.</div></div><button className="admin-btn" onClick={reload}>Refresh</button></div>
        <div className="admin-card-body"><details><summary className="admin-help">Open raw provider payload</summary><pre className="admin-mono admin-scroll" style={{ overflow: 'auto', maxHeight: 420, whiteSpace: 'pre-wrap' }}>{JSON.stringify(data || {}, null, 2)}</pre></details></div>
      </div>
    </div>
  );
}

function EarningsDexCard({ row }) {
  const accent = dexAccent(row.dex);
  const earned = fmtUsd(Number(row.earned_usd || 0), 4);
  const trades = row.trades ?? row.local_trades ?? row.matched_events ?? row.transfer_events ?? null;
  const volume = row.volume_usd ?? row.local_volume_usd ?? row.hyperliquid_cum_volume_usd ?? null;
  const note = row.note || row.source_detail || row.source || '';
  const address = row.address || row.subaccount || row.builder_id || row.latest_submission_idx || '';
  const extra = [
    trades != null ? `${num(trades)} trades` : '',
    volume != null ? `${fmtMaybeUsd(volume)} vol` : '',
    row.rebate_pct != null ? `${row.rebate_pct}% rebate` : '',
    row.builder_fee_pct != null ? `${row.builder_fee_pct}% fee` : '',
    row.withdrawable_usd != null ? `${fmtMaybeUsd(row.withdrawable_usd)} withdrawable` : '',
    row.unclaimed_rewards_usd != null ? `${fmtMaybeUsd(row.unclaimed_rewards_usd)} unclaimed` : '',
    row.estimated_fee_usd != null ? `estimate ${fmtMaybeUsd(row.estimated_fee_usd)}` : '',
  ].filter(Boolean);
  return (
    <div className="earnings-card" style={{ '--earnings-accent': accent }}>
      <div className="earnings-card-head">
        <div className="earnings-dex">{(DEX_LABELS[row.dex] || row.dex || '-').toUpperCase()}</div>
        <div className="earnings-currency">{row.currency || '-'}</div>
      </div>
      <div className="earnings-amount">{earned}</div>
      <div className="earnings-meta">
        {address ? <span className="admin-mono">{short(address, 10, 5)}</span> : null}
        {extra.map((item) => <span key={item}>{item}</span>)}
      </div>
      {note && <div className="earnings-note">{note}</div>}
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
  const demonLevels = demonKing.level_summary || {};
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
        { label: 'Log errors 24h', value: logs.summary?.errors_24h || 0, tone: logs.summary?.errors_24h ? 'red' : 'green' },
      ]} />
      <div className="admin-grid two">
        <CompactTable title="Supply by Chain" subtitle={`Synced ${fmtTime(supply.synced_at)}. Live chains: ${(supply.live_chains || []).join(', ') || '-'}.`} columns={['Chain', 'Minted', 'Live', 'Source', 'Synced']} rows={(supply.per_chain || []).map((row) => [chainBadge(row.chain), num(row.count), row.live ? <span className="admin-badge green">live</span> : <span className="admin-badge off">fallback</span>, row.source || '-', fmtTime(row.synced_at)])} />
        <CompactTable title="Bridge Routes" subtitle="Traffic, pending jobs, and freshest route activity." columns={['Route', 'Total', 'Today', 'Pending', 'Latest']} rows={(bridges.by_route || []).map((row) => [`${row.source_chain} -> ${row.dest_chain}`, row.total, row.today, row.pending, fmtTime(row.latest_at)])} />
      </div>
      <div className="admin-grid two">
        <CompactTable title="Utility Payments" subtitle="NFT utility purchase revenue by chain and token." columns={['Chain', 'Token', 'Payments', 'Buyers', 'Revenue', 'Latest']} rows={(payments.utility_by_token || []).map((row) => [chainBadge(row.chain), row.token, row.payments, row.unique_buyers, fmtMaybeUsd(row.revenue_usd), fmtTime(row.latest_at)])} />
        <CompactTable title="Demon King Levels" subtitle="Active Demon King NFT cache by level and unique game accounts." columns={['Level', 'NFTs', 'Players', 'Latest']} rows={(demonKing.by_level || []).map((row) => [`L${row.level || 1}`, num(row.tokens || 0), num(row.players || 0), fmtTime(row.latest_at)])} />
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

function statusBadge(status) {
  const value = status || 'unknown';
  let tone = 'off';
  if (['active', 'paid', 'delivered', 'success', 'ok', 'complete'].includes(value)) tone = 'green';
  if (['reserved', 'delivering', 'pending', 'awaiting_deposit'].includes(value)) tone = 'gold';
  if (['error', 'failed', 'cancelled', 'canceled'].includes(value)) tone = 'red';
  return <span className={'admin-badge ' + tone}>{value}</span>;
}

function PresenceBadge({ player }) {
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
    gmx: '#9aa8ff',
    phoenix: '#fb923c',
    monad: '#a78bfa',
    perpl: '#a78bfa',
    hyperliquid: '#86efac',
    grvt: '#5eead4',
    nado: '#67e8f9',
    hotstuff: '#f97316',
    risex: '#f43f5e',
    katana: '#eab308',
    gmtrade: '#22c55e',
  };
  return map[String(dex || '').toLowerCase()] || 'var(--admin-blue)';
}

function emptyTaskForm() {
  return {
    id: null,
    type: 'volume',
    title: '',
    description: '',
    params: { symbol: 'any', side: 'any', target_volume: 1000 },
    reward_gold: 0,
    reward_wood: 0,
    reward_ore: 0,
    active: true,
    repeatable: false,
    cooldown_hours: 0,
    sort_order: 0,
  };
}

function taskToForm(task) {
  return {
    ...emptyTaskForm(),
    ...task,
    active: !!task.active,
    repeatable: !!task.repeatable,
    params: { ...(task.params || {}) },
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
  };
}

function wizardHint(index) {
  return ['time first', 'who can join', 'how rank works', 'what unlocks', 'final payload'][index];
}

function toneColor(tone) {
  if (tone === 'green') return 'var(--admin-green)';
  if (tone === 'blue') return 'var(--admin-blue)';
  if (tone === 'red') return 'var(--admin-red)';
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
