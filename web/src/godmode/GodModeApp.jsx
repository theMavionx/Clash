import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GodotProvider } from '../hooks/useGodot';
import { buildingAsset, troopAsset, troopPortraitStyle } from './assets';
import './GodModeStudio.css';

const GodotCanvas = lazy(() => import('../components/GodotCanvas'));
const AUTH_STORAGE_KEY = 'clash_game_auth_v1';
const ACCESS_REVALIDATE_MS = 60_000;

const EMPTY_STUDIO_STATE = {
  ready: false,
  status: 'Starting isolated Studio…',
  phase: 'booting',
  buildings: [],
  building_count: 0,
  selected_building: null,
  troops: [],
  army_total: 0,
  groups: [],
  camera_presets: [],
  camera_index: 0,
  speed: 1,
  paused: false,
  snapshot_available: false,
  fps: 0,
  clean_frame: false,
  safe_frame: false,
  combat_active: false,
};

const TABS = [
  { id: 'build', label: 'Build', glyph: '＋' },
  { id: 'army', label: 'Army', glyph: '◆' },
  { id: 'battle', label: 'Battle', glyph: '⚔' },
  { id: 'camera', label: 'Camera', glyph: '◉' },
];

function clearGodModeGrantFlag() {
  try {
    delete window.__CLASH_GOD_MODE_GRANTED__;
  } catch {
    window.__CLASH_GOD_MODE_GRANTED__ = false;
  }
}

function readStoredToken() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return '';
    const record = JSON.parse(raw);
    return String(record?.token || '').trim();
  } catch {
    return '';
  }
}

function friendlyLabel(value) {
  const text = String(value || '').trim();
  if (!text) return 'Unknown';
  return text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[_-]+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function itemId(item, fallback = '') {
  if (typeof item === 'string') return item;
  return String(
    item?.id || item?.building_id || item?.troop || item?.troop_type || item?.name || fallback
  );
}

function itemLabel(item, fallback = '') {
  if (typeof item === 'string') return friendlyLabel(item);
  return String(item?.label || item?.display_name || item?.title || friendlyLabel(itemId(item, fallback)));
}

function parseControllerState(detail) {
  let value = detail;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  if (!value || typeof value !== 'object') return {};
  if (value.state && typeof value.state === 'object') return value.state;
  if (value.data && typeof value.data === 'object' && !Object.prototype.hasOwnProperty.call(value, 'ready')) {
    return value.data;
  }
  return value;
}

function useGodModeAccess() {
  const [gate, setGate] = useState({ phase: 'checking', access: null, message: '' });
  const requestRef = useRef(null);

  const checkAccess = useCallback(async (reason = 'manual') => {
    const token = readStoredToken();
    if (!token) {
      requestRef.current?.abort();
      requestRef.current = null;
      clearGodModeGrantFlag();
      window._playerToken = null;
      setGate({ phase: 'signin', access: null, message: '' });
      return;
    }

    window._playerToken = token;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    if (reason === 'initial' || reason === 'manual') {
      setGate((current) => current.phase === 'allowed'
        ? current
        : { phase: 'checking', access: current.access, message: '' });
    }

    try {
      const response = await fetch('/api/god-mode/access', {
        method: 'GET',
        headers: { 'x-token': token },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (response.status === 401) {
        clearGodModeGrantFlag();
        setGate({ phase: 'signin', access: null, message: 'Your saved session has expired.' });
        return;
      }
      if (!response.ok) throw new Error(`Access service returned ${response.status}`);
      const payload = await response.json();
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (!payload?.allowed) {
        clearGodModeGrantFlag();
        setGate({ phase: 'denied', access: payload?.access || null, message: '' });
        return;
      }
      window.__CLASH_GOD_MODE_GRANTED__ = true;
      setGate({ phase: 'allowed', access: payload.access || null, message: '' });
    } catch (error) {
      if (error?.name === 'AbortError' || requestRef.current !== controller) return;
      clearGodModeGrantFlag();
      setGate({
        phase: 'error',
        access: null,
        message: error?.message || 'Studio access could not be verified.',
      });
    }
  }, []);

  useEffect(() => {
    checkAccess('initial');
    const interval = window.setInterval(() => checkAccess('interval'), ACCESS_REVALIDATE_MS);
    const onFocus = () => checkAccess('focus');
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkAccess('visibility');
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      requestRef.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearGodModeGrantFlag();
    };
  }, [checkAccess]);

  return { gate, retry: checkAccess };
}

function GateScreen({ phase, message, onRetry }) {
  const content = {
    checking: {
      eyebrow: 'SECURE STUDIO',
      title: 'Verifying God Mode access',
      body: 'Checking your player grant before the game runtime starts.',
    },
    signin: {
      eyebrow: 'SIGN IN REQUIRED',
      title: 'Open Clash first',
      body: message || 'Sign in to your Clash account, then return to the Studio.',
    },
    denied: {
      eyebrow: 'ADMIN-GATED',
      title: 'God Mode is not enabled',
      body: 'Ask an administrator to grant Studio access to this player account.',
    },
    error: {
      eyebrow: 'CHECK FAILED',
      title: 'Studio is temporarily unavailable',
      body: message || 'The access check failed. Your game runtime has not started.',
    },
    runtime: {
      eyebrow: 'RUNTIME PAUSED',
      title: 'Studio could not start',
      body: message || 'Reload the isolated Studio and try again.',
    },
  }[phase] || {};

  return (
    <main className="gm-gate">
      <img className="gm-gate__background" src="/splash-bg.png" alt="" />
      <section className="gm-gate__card" aria-live="polite" aria-busy={phase === 'checking'}>
        <div className="gm-gate__mark" aria-hidden="true">
          <img src="/favicon.png" alt="" />
        </div>
        <div className="gm-eyebrow">{content.eyebrow}</div>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
        {phase === 'checking' && <div className="gm-gate__loader" aria-label="Checking access" />}
        <div className="gm-gate__actions">
          {phase === 'signin' && <a className="gm-button gm-button--primary" href="/">Open Clash</a>}
          {phase !== 'checking' && (
            <button className="gm-button" type="button" onClick={() => onRetry?.('manual')}>Retry access</button>
          )}
        </div>
        <div className="gm-gate__isolation">
          <span aria-hidden="true">◇</span>
          Isolated creator sandbox · no live rewards or account changes
        </div>
      </section>
    </main>
  );
}

class GodModeRuntimeBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[god-mode] runtime failed', error);
  }

  render() {
    if (this.state.error) {
      return (
        <GateScreen
          phase="runtime"
          message={this.state.error?.message}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

function CommandButton({ command, data, send, children, className = '', disabled = false, ...props }) {
  return (
    <button
      type="button"
      className={`gm-button ${className}`.trim()}
      disabled={disabled}
      onClick={() => send(command, data)}
      {...props}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, tone = '' }) {
  return (
    <div className={`gm-metric ${tone ? `gm-metric--${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCatalog({ label }) {
  return (
    <div className="gm-empty">
      <span className="gm-empty__pulse" aria-hidden="true" />
      {label}
    </div>
  );
}

function useGamepadNavigation({ enabled, cleanFrame, onCleanFrame, onTabStep }) {
  useEffect(() => {
    if (!enabled || typeof navigator?.getGamepads !== 'function') return undefined;
    let animationFrame = 0;
    let previous = [];

    const focusables = () => Array.from(document.querySelectorAll(
      '.gm-deck button:not(:disabled), .gm-deck input:not(:disabled), .gm-deck a[href]'
    )).filter((element) => element.getClientRects().length > 0);
    const moveFocus = (delta) => {
      const items = focusables();
      if (!items.length) return;
      const current = items.indexOf(document.activeElement);
      const next = current < 0 ? 0 : (current + delta + items.length) % items.length;
      items[next]?.focus({ preventScroll: false });
    };
    const adjustFocusedNumber = (delta) => {
      const input = document.activeElement;
      if (!(input instanceof window.HTMLInputElement) || input.type !== 'number') return false;
      const minimum = input.min === '' ? 0 : Number(input.min);
      const maximum = input.max === '' ? Number.MAX_SAFE_INTEGER : Number(input.max);
      const current = Number(input.value) || minimum;
      const next = Math.min(maximum, Math.max(minimum, current + delta));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, String(next));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const poll = () => {
      const pad = Array.from(navigator.getGamepads() || []).find(Boolean);
      const pressed = pad?.buttons?.map((button) => !!button?.pressed) || [];
      const rose = (index) => pressed[index] && !previous[index];
      if (rose(9)) onCleanFrame(!cleanFrame);
      if (rose(4)) onTabStep(-1);
      if (rose(5)) onTabStep(1);
      if (rose(12) && !adjustFocusedNumber(1)) moveFocus(-1);
      if (rose(13) && !adjustFocusedNumber(-1)) moveFocus(1);
      if (rose(14)) moveFocus(-1);
      if (rose(15)) moveFocus(1);
      if (rose(2)) adjustFocusedNumber(-10);
      if (rose(3)) adjustFocusedNumber(10);
      if (rose(0)) {
        const active = document.activeElement;
        if (active?.matches?.('.gm-deck button:not(:disabled), .gm-deck a[href]')) active.click();
        else if (active instanceof window.HTMLInputElement) {
          active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        else focusables()[0]?.focus();
      }
      previous = pressed;
      animationFrame = window.requestAnimationFrame(poll);
    };

    animationFrame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [cleanFrame, enabled, onCleanFrame, onTabStep]);
}

function BuildTab({ state, send }) {
  const buildings = useMemo(() => (Array.isArray(state.buildings) ? state.buildings : []), [state.buildings]);
  const [selectedId, setSelectedId] = useState('');
  const [level, setLevel] = useState(1);
  const [search, setSearch] = useState('');
  const setupLocked = !state.ready || !!state.busy || !!state.combat_active;
  const filteredBuildings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return buildings;
    return buildings.filter((item, index) => itemLabel(item, itemId(item, `building-${index}`)).toLowerCase().includes(query));
  }, [buildings, search]);
  const activeId = filteredBuildings.some((item, index) => itemId(item, `building-${index}`) === selectedId)
    ? selectedId
    : itemId(filteredBuildings[0], '');
  const active = filteredBuildings.find((item, index) => itemId(item, `building-${index}`) === activeId);
  const selection = state.selected_building;
  const hasSelection = typeof selection === 'object' ? !!itemId(selection) : !!selection;
  const selectionLabel = hasSelection && typeof selection === 'object'
    ? itemLabel(selection)
    : (hasSelection ? friendlyLabel(selection) : 'Nothing selected');

  return (
    <div className="gm-panel" role="tabpanel" id="gm-panel-build" aria-labelledby="gm-tab-build">
      <div className="gm-metrics gm-metrics--two">
        <Metric label="Placed" value={Number(state.building_count || 0).toLocaleString()} tone="orange" />
        <Metric label="Selected" value={hasSelection ? '1' : '—'} />
      </div>

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">CATALOG</span><h2>Unlimited build kit</h2></div>
          <span className="gm-chip">No costs</span>
        </div>
        <label className="gm-field gm-field--search">
          <span>Find building</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search catalog" />
        </label>
        {filteredBuildings.length ? (
          <div className="gm-catalog" aria-label="Building catalog">
            {filteredBuildings.map((item, index) => {
              const id = itemId(item, `building-${index}`);
              return (
                <button
                  type="button"
                  className={`gm-catalog-card ${id === activeId ? 'is-active' : ''}`}
                  key={id}
                  onClick={() => setSelectedId(id)}
                  aria-pressed={id === activeId}
                >
                  <img src={buildingAsset(item, id)} alt="" />
                  <span>{itemLabel(item, id)}</span>
                </button>
              );
            })}
          </div>
        ) : <EmptyCatalog label="Waiting for the building catalog…" />}
        <div className="gm-inline-form">
          <label className="gm-field">
            <span>Level</span>
            <input
              type="number"
              min="1"
              max={Number(active?.max_level || 1)}
              inputMode="numeric"
              value={level}
              onChange={(event) => setLevel(Math.min(Number(active?.max_level || 1), Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
          <CommandButton
            command="place_building"
            data={{ building_id: activeId, level }}
            send={send}
            disabled={setupLocked || !activeId}
            className="gm-button--primary gm-button--grow"
          >
            Place {active ? itemLabel(active, activeId) : 'building'}
          </CommandButton>
        </div>
        <p className="gm-help">Choose a building, then place it directly on a free island tile.</p>
      </section>

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">SELECTION</span><h2>{selectionLabel}</h2></div>
        </div>
        <div className="gm-action-grid gm-action-grid--three">
          <CommandButton command="upgrade_selected" send={send} disabled={setupLocked || !hasSelection}>Upgrade</CommandButton>
          <CommandButton command="duplicate_selected" send={send} disabled={setupLocked || !hasSelection}>Duplicate</CommandButton>
          <CommandButton command="delete_selected" send={send} disabled={setupLocked || !hasSelection} className="gm-button--danger">Delete</CommandButton>
        </div>
      </section>

      <section className="gm-section gm-section--muted">
        <div className="gm-section__head">
          <div><span className="gm-kicker">BASE PRESETS</span><h2>One-take setup</h2></div>
        </div>
        <div className="gm-action-grid gm-action-grid--two">
          <CommandButton command="build_showcase" send={send} disabled={setupLocked} className="gm-button--success">Build showcase</CommandButton>
          <CommandButton
            command="clear_base"
            send={(command, data) => {
              if (window.confirm('Clear every building from this sandbox base?')) send(command, data);
            }}
            disabled={setupLocked || !state.building_count}
            className="gm-button--danger"
          >
            Clear base
          </CommandButton>
        </div>
      </section>
    </div>
  );
}

function TroopCard({ item, index, ready, send }) {
  const id = itemId(item, `troop-${index}`);
  const sourceCount = Number(typeof item === 'object' ? (item.count ?? item.quantity ?? 0) : 0) || 0;
  const sourceLevel = Number(typeof item === 'object' ? (item.level ?? 1) : 1) || 1;
  const maxLevel = Math.max(1, Number(typeof item === 'object' ? item.max_level : 1) || 1);
  const [count, setCount] = useState(sourceCount);
  const [level, setLevel] = useState(sourceLevel);

  useEffect(() => setCount(sourceCount), [sourceCount]);
  useEffect(() => setLevel(sourceLevel), [sourceLevel]);

  const commit = () => send('set_army', {
    troop: id,
    count: Math.max(0, Math.floor(Number(count) || 0)),
    level: Math.min(maxLevel, Math.max(1, Math.floor(Number(level) || 1))),
  });

  return (
    <article className="gm-troop-card">
      <div className="gm-troop-card__identity">
        <img src={troopAsset(item, id)} alt="" style={troopPortraitStyle(id)} />
        <div><strong>{itemLabel(item, id)}</strong><span>{sourceCount.toLocaleString()} staged</span></div>
      </div>
      <div className="gm-troop-card__inputs">
        <label className="gm-field">
          <span>Count</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
          />
        </label>
        <label className="gm-field gm-field--level">
          <span>Lvl</span>
          <input
            type="number"
            min="1"
            max={maxLevel}
            inputMode="numeric"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
          />
        </label>
        <button className="gm-icon-button" type="button" onClick={commit} disabled={!ready} aria-label={`Apply ${itemLabel(item, id)} army count`}>
          ✓
        </button>
      </div>
    </article>
  );
}

function ArmyTab({ state, send }) {
  const troops = Array.isArray(state.troops) ? state.troops : [];
  const total = Number(state.army_total || 0);
  const setupLocked = !state.ready || !!state.busy || !!state.combat_active;
  return (
    <div className="gm-panel" role="tabpanel" id="gm-panel-army" aria-labelledby="gm-tab-army">
      <div className="gm-metrics gm-metrics--two">
        <Metric label="Total units" value={total.toLocaleString()} tone="orange" />
        <Metric label="Unit types" value={troops.filter((item) => Number(item?.count || item?.quantity || 0) > 0).length} />
      </div>
      {total >= 500 && (
        <div className="gm-notice" role="status">
          <span aria-hidden="true">!</span>
          Large armies are allowed, but may reduce browser FPS while deployed.
        </div>
      )}

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">QUICK LOADOUT</span><h2>Director presets</h2></div>
          <span className="gm-chip">Unlimited</span>
        </div>
        <div className="gm-action-grid gm-action-grid--two">
          <CommandButton command="army_preset" data={{ preset: 'cinematic' }} send={send} disabled={setupLocked}>Cinematic mix</CommandButton>
          <CommandButton command="army_preset" data={{ preset: 'ground_swarm' }} send={send} disabled={setupLocked}>Ground swarm</CommandButton>
          <CommandButton command="army_preset" data={{ preset: 'air_raid' }} send={send} disabled={setupLocked}>Air raid</CommandButton>
          <CommandButton command="army_preset" data={{ preset: 'clear' }} send={send} disabled={setupLocked} className="gm-button--danger">Clear army</CommandButton>
        </div>
      </section>

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">ARMY LAB</span><h2>Mixed unit staging</h2></div>
        </div>
        {troops.length ? (
          <div className="gm-troop-list">
            {troops.map((item, index) => (
              <TroopCard item={item} index={index} ready={!setupLocked} send={send} key={itemId(item, `troop-${index}`)} />
            ))}
          </div>
        ) : <EmptyCatalog label="Waiting for the troop catalog…" />}
        <p className="gm-help">Gamepad: focus Count or Lvl, use D-pad ±1, X/Y ±10, then A to apply.</p>
      </section>
    </div>
  );
}

function groupName(group, index) {
  if (typeof group === 'string') return group;
  return String(group?.label || group?.name || `Group ${index + 1}`);
}

function BattleTab({ state, send }) {
  const groups = Array.isArray(state.groups) ? state.groups : [];
  const phase = friendlyLabel(state.phase || 'setup');
  return (
    <div className="gm-panel" role="tabpanel" id="gm-panel-battle" aria-labelledby="gm-tab-battle">
      <div className="gm-hero-card">
        <div>
          <span className="gm-kicker">SELF ATTACK</span>
          <h2>Base vs. your army</h2>
          <p>Snapshot this sandbox base and launch the staged mixed-unit army. Live trophies, resources, rewards, and history stay untouched.</p>
        </div>
        <CommandButton
          command="start_self_attack"
          send={send}
          disabled={!state.ready || !!state.busy || !!state.combat_active || !state.building_count || !state.army_total}
          className="gm-button--primary gm-button--hero"
        >
          Start self attack
        </CommandButton>
      </div>

      <div className="gm-metrics gm-metrics--three">
        <Metric label="Phase" value={phase} tone="orange" />
        <Metric label="Army" value={Number(state.army_total || 0).toLocaleString()} />
        <Metric label="Base" value={Number(state.building_count || 0).toLocaleString()} />
      </div>

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">DEPLOYMENT</span><h2>Troop groups</h2></div>
        </div>
        {groups.length ? (
          <div className="gm-action-grid gm-action-grid--two">
            {groups.map((group, index) => (
              <CommandButton command="select_troop_group" data={{ index }} send={send} disabled={!state.ready} key={`${groupName(group, index)}-${index}`}>
                <span>{groupName(group, index)}</span>
                {typeof group === 'object' && Number(group.count || 0) > 0 && <small>{Number(group.count).toLocaleString()}</small>}
              </CommandButton>
            ))}
          </div>
        ) : <EmptyCatalog label="Staged groups appear after a loadout is applied." />}
        <p className="gm-help">Select a group, then deploy it on the island using the game view.</p>
      </section>

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">TAKE CONTROL</span><h2>Playback</h2></div>
          <span className={`gm-status ${state.paused ? 'is-paused' : ''}`}>{state.paused ? 'Paused' : `${Number(state.speed || 1)}×`}</span>
        </div>
        <div className="gm-speed-row" aria-label="Battle speed">
          {[0.25, 0.5, 1, 2, 4, 8].map((speed) => (
            <CommandButton
              command="set_speed"
              data={{ speed }}
              send={send}
              disabled={!state.ready}
              className={Number(state.speed) === speed ? 'is-active' : ''}
              aria-pressed={Number(state.speed) === speed}
              key={speed}
            >
              {speed}×
            </CommandButton>
          ))}
        </div>
        <div className="gm-action-grid gm-action-grid--two">
          <CommandButton command="toggle_pause" send={send} disabled={!state.ready}>{state.paused ? 'Resume' : 'Pause'}</CommandButton>
          <CommandButton command="restore_take" send={send} disabled={!state.ready || !state.snapshot_available}>Restore take</CommandButton>
        </div>
      </section>
    </div>
  );
}

function CameraTab({ state, send }) {
  const cameras = Array.isArray(state.camera_presets) ? state.camera_presets : [];
  return (
    <div className="gm-panel" role="tabpanel" id="gm-panel-camera" aria-labelledby="gm-tab-camera">
      <div className="gm-metrics gm-metrics--two">
        <Metric label="Live FPS" value={Math.round(Number(state.fps || 0)) || '—'} tone={Number(state.fps || 0) >= 45 ? 'success' : ''} />
        <Metric label="Camera" value={cameras.length ? Number(state.camera_index || 0) + 1 : '—'} />
      </div>

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">CAMERA PRESETS</span><h2>Frame the island</h2></div>
        </div>
        {cameras.length ? (
          <div className="gm-camera-grid">
            {cameras.map((camera, index) => (
              <CommandButton
                command="set_camera"
                data={{ index }}
                send={send}
                disabled={!state.ready}
                className={Number(state.camera_index) === index ? 'is-active' : ''}
                aria-pressed={Number(state.camera_index) === index}
                key={`${itemLabel(camera, `Camera ${index + 1}`)}-${index}`}
              >
                <span className="gm-camera-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{itemLabel(camera, `Camera ${index + 1}`)}</span>
              </CommandButton>
            ))}
          </div>
        ) : <EmptyCatalog label="Camera presets are loading…" />}
      </section>

      <section className="gm-section">
        <div className="gm-section__head">
          <div><span className="gm-kicker">VIDEO ASSISTS</span><h2>Capture overlays</h2></div>
        </div>
        <button
          className="gm-toggle"
          type="button"
          role="switch"
          aria-checked={!!state.safe_frame}
          onClick={() => send('set_safe_frame', { enabled: !state.safe_frame })}
          disabled={!state.ready}
        >
          <span><strong>Safe-frame guide</strong><small>16:9 action-safe boundary</small></span>
          <i aria-hidden="true" />
        </button>
        <button
          className="gm-toggle"
          type="button"
          role="switch"
          aria-checked={!!state.clean_frame}
          onClick={() => send('set_clean_frame', { enabled: true })}
          disabled={!state.ready}
        >
          <span><strong>Clean frame</strong><small>Hide all Studio chrome · F1 restores</small></span>
          <i aria-hidden="true" />
        </button>
      </section>

      <div className="gm-shortcut-card">
        <kbd>WASD</kbd><span>Move</span><kbd>Q / E</kbd><span>Rotate</span><kbd>F1 / Start</kbd><span>Clean frame</span>
      </div>
    </div>
  );
}

function GodModeStudio() {
  const [state, setState] = useState(EMPTY_STUDIO_STATE);
  const [activeTab, setActiveTab] = useState('build');
  const [collapsed, setCollapsed] = useState(false);
  const [commandError, setCommandError] = useState('');
  const errorTimerRef = useRef(null);

  useEffect(() => {
    const onState = (event) => {
      const patch = parseControllerState(event?.detail);
      setState((current) => ({ ...current, ...patch }));
    };
    window.addEventListener('clash-god-mode-state', onState);
    return () => window.removeEventListener('clash-god-mode-state', onState);
  }, []);

  useEffect(() => () => {
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
  }, []);

  const send = useCallback((command, data = {}) => {
    if (typeof window.godotBridge !== 'function') {
      setCommandError('Studio controller is still starting.');
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = window.setTimeout(() => setCommandError(''), 2500);
      return false;
    }
    window.godotBridge(JSON.stringify({
      action: 'god_mode_command',
      data: { command, ...data },
    }));
    if (command === 'set_clean_frame' && data.enabled) {
      window.requestAnimationFrame(() => document.getElementById('godot-canvas')?.focus());
    }
    return true;
  }, []);

  const setCleanFrame = useCallback((enabled) => {
    send('set_clean_frame', { enabled });
  }, [send]);

  const stepTab = useCallback((delta) => {
    setActiveTab((current) => {
      const index = Math.max(0, TABS.findIndex((tab) => tab.id === current));
      return TABS[(index + delta + TABS.length) % TABS.length].id;
    });
  }, []);

  useGamepadNavigation({
    enabled: !!state.ready,
    cleanFrame: !!state.clean_frame,
    onCleanFrame: setCleanFrame,
    onTabStep: stepTab,
  });

  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if (event.key !== 'F1') return;
      event.preventDefault();
      event.stopPropagation();
      setCleanFrame(!state.clean_frame);
    };
    window.addEventListener('keydown', onGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onGlobalKeyDown, { capture: true });
  }, [setCleanFrame, state.clean_frame]);

  const activePanel = useMemo(() => {
    if (activeTab === 'army') return <ArmyTab state={state} send={send} />;
    if (activeTab === 'battle') return <BattleTab state={state} send={send} />;
    if (activeTab === 'camera') return <CameraTab state={state} send={send} />;
    return <BuildTab state={state} send={send} />;
  }, [activeTab, send, state]);

  function moveTab(event, index) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + TABS.length) % TABS.length;
    setActiveTab(TABS[next].id);
    document.getElementById(`gm-tab-${TABS[next].id}`)?.focus();
  }

  if (state.clean_frame) return null;

  return (
    <div className="gm-studio-layer">
      {!!state.safe_frame && (
        <div className="gm-safe-frame" aria-hidden="true">
          <span className="gm-safe-frame__label">ACTION SAFE · 16:9</span>
          <i className="gm-safe-frame__cross gm-safe-frame__cross--x" />
          <i className="gm-safe-frame__cross gm-safe-frame__cross--y" />
        </div>
      )}

      <aside className={`gm-deck ${collapsed ? 'is-collapsed' : ''}`} aria-label="God Mode Studio controls">
        <header className="gm-deck__header">
          <div className="gm-brand">
            <img src="/favicon.png" alt="" />
            <div><span>GOD MODE</span><strong>Command Deck</strong></div>
          </div>
          <div className="gm-header-actions">
            <button
              className="gm-icon-button"
              type="button"
              onClick={() => send('set_clean_frame', { enabled: true })}
              disabled={!state.ready}
              aria-label="Enter clean frame mode"
              title="Clean frame (F1 to restore)"
            >
              ◫
            </button>
            <button
              className="gm-icon-button"
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand Command Deck' : 'Collapse Command Deck'}
              aria-expanded={!collapsed}
            >
              {collapsed ? '‹' : '›'}
            </button>
          </div>
        </header>

        {!collapsed && (
          <>
            <div className="gm-deck__status" role="status">
              <span className={`gm-live-dot ${state.ready ? 'is-live' : ''}`} aria-hidden="true" />
              <div><strong>{state.ready ? 'Studio live' : 'Studio booting'}</strong><span>{state.status || 'Waiting for controller…'}</span></div>
              <span className="gm-fps">{Number(state.fps || 0) > 0 ? `${Math.round(Number(state.fps))} FPS` : 'LOCAL'}</span>
            </div>

            <nav className="gm-tabs" role="tablist" aria-label="Studio tools">
              {TABS.map((tab, index) => (
                <button
                  type="button"
                  role="tab"
                  id={`gm-tab-${tab.id}`}
                  aria-controls={`gm-panel-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? 'is-active' : ''}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => moveTab(event, index)}
                  key={tab.id}
                >
                  <span aria-hidden="true">{tab.glyph}</span>{tab.label}
                </button>
              ))}
            </nav>

            <div className="gm-deck__body">{activePanel}</div>
            <footer className="gm-deck__footer">
              <span><i aria-hidden="true" /> Isolated session</span>
              <span>F1 · clean frame</span>
            </footer>
          </>
        )}
      </aside>
      {commandError && <div className="gm-toast" role="alert">{commandError}</div>}
    </div>
  );
}

function GodModeRuntime() {
  return (
    <div className="gm-runtime">
      <Suspense fallback={<GateScreen phase="checking" />}>
        <GodotCanvas />
      </Suspense>
      <GodModeStudio />
    </div>
  );
}

export default function GodModeApp() {
  const { gate, retry } = useGodModeAccess();

  if (gate.phase !== 'allowed') {
    return <GateScreen phase={gate.phase} message={gate.message} onRetry={retry} />;
  }

  return (
    <GodModeRuntimeBoundary>
      <GodotProvider>
        <GodModeRuntime />
      </GodotProvider>
    </GodModeRuntimeBoundary>
  );
}
