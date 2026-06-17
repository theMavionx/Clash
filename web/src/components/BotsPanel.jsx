import { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useLayout } from '../hooks/useIsMobile';
import { cartoonBtn } from '../styles/theme';
import { colors, shared } from './basic/styles';
import { usePlayer } from '../hooks/useGodot';
import buttonBg from '../assets/resources/file_00000000a6f87246844c6271b76cd436.png';

const BOT_TYPES = [
  {
    id: 'delta_neutral',
    name: 'Delta Neutral',
    code: 'delta_neutral',
    accent: '#1E88E5',
    accentDark: '#1565C0',
    tagline: 'Keeps market exposure close to zero.',
    description: 'Places offsetting long and short exposure so the bot focuses on spread capture instead of directional bets.',
    bestFor: 'Sideways markets, inventory control, lower directional risk.',
    cadence: 'Hedges every fill',
  },
  {
    id: 'symmetric_mm',
    name: 'Symmetric MM',
    code: 'symmetric_mm',
    accent: '#43A047',
    accentDark: '#2E7D32',
    tagline: 'Quotes both sides evenly around mid price.',
    description: 'Keeps balanced bid and ask orders with equal sizing. It is the classic market-maker shape for simple spread capture.',
    bestFor: 'Liquid pairs, stable spreads, balanced inventory.',
    cadence: 'Requotes on drift',
  },
  {
    id: 'ping_pong',
    name: 'Ping Pong',
    code: 'ping_pong',
    accent: '#E8B830',
    accentDark: '#B88712',
    tagline: 'Alternates buy and sell orders after fills.',
    description: 'Buys near the lower band, then waits to sell higher. After a sell, it looks for the next buy setup.',
    bestFor: 'Range-bound chop, small repeatable moves, simple execution.',
    cadence: 'One leg at a time',
  },
];

const PRESETS = {
  calm: {
    label: 'Calm',
    title: 'Calm preset',
    copy: 'Slower refresh, tighter inventory guardrails, fewer order changes.',
  },
  aggressive: {
    label: 'Aggressive',
    title: 'Aggressive preset',
    copy: 'Faster refresh, wider working range, more quote updates.',
  },
};

const DEFAULT_BOTS = [
  {
    id: 'symmetric_mm:hyperliquid:BTC-USD,ETH-USD',
    type: 'symmetric_mm',
    market: 'BTC-USD, ETH-USD',
    status: 'Paused',
    tradeSize: 1000,
    maxPosition: 20000,
    preset: 'aggressive',
    pnl: 0,
    inventory: '$0',
    spread: '0.14%',
    fills: 0,
    uptime: 'Idle',
    lastAction: 'Idle',
  }
];

const DEFAULT_HISTORY = [
  { id: 'h-1', time: '12:00', bot: 'System', event: 'MM Bot controller initialized', value: 'Ready' },
];

const STEPS = ['strategy', 'risk', 'review'];

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function signedMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function getBotType(type) {
  return BOT_TYPES.find((bot) => bot.id === type) || BOT_TYPES[0];
}

const getBotConfigDetails = (id) => {
  if (id.includes('grvt')) return { tradeSize: 750, maxPosition: 15000, preset: 'calm' };
  if (id.includes('hyperliquid') && id.includes('symmetric_mm')) return { tradeSize: 1000, maxPosition: 20000, preset: 'aggressive' };
  if (id.includes('avantis')) return { tradeSize: 2000, maxPosition: 20000, preset: 'calm' };
  if (id.includes('gmx')) return { tradeSize: 1500, maxPosition: 15000, preset: 'calm' };
  if (id.includes('mock')) return { tradeSize: 50, maxPosition: 500, preset: 'calm' };
  return { tradeSize: 200, maxPosition: 2000, preset: 'calm' };
};

const matchPositionToBot = (botId, posExchange, posSymbol) => {
  const parts = botId.toLowerCase().split(':');
  const bExchanges = parts[1] ? parts[1].split('<->') : [];
  const bSymbols = parts[2] ? parts[2].split(',') : [];
  return bExchanges.includes(String(posExchange).toLowerCase()) || bSymbols.includes(String(posSymbol).toLowerCase());
};

const getExchangeName = (id) => {
  if (!id) return '';
  const parts = id.split(':');
  if (parts.length < 2) return 'Unknown';
  const rawExchange = parts[1];
  if (rawExchange.includes('<->')) {
    const venues = rawExchange.split('<->');
    return `${venues[0].toUpperCase()} / ${venues[1].toUpperCase()}`;
  }
  return rawExchange.toUpperCase();
};

const mapHandleToBot = (handle, runningList) => {
  const details = getBotConfigDetails(handle.id);
  const isRunning = runningList.some(r => r.id === handle.id);
  const market = handle.symbols.map(s => s.toUpperCase()).join(', ');
  const exchange = getExchangeName(handle.id);
  return {
    id: handle.id,
    type: handle.kind,
    market: market,
    exchange: exchange,
    status: isRunning ? 'Running' : 'Paused',
    tradeSize: details.tradeSize,
    maxPosition: details.maxPosition,
    preset: details.preset,
    pnl: 0,
    inventory: '0.00',
    spread: handle.kind === 'ping_pong' ? '0.22%' : '0.14%',
    fills: 0,
    uptime: isRunning ? 'Active' : 'Idle',
    lastAction: isRunning ? 'Running strategy cycle' : 'Idle',
  };
};

function RobotGlyph({ size = 28, color = '#5C3A21' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3v4" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="3.5" r="2" fill="#E8B830" stroke={color} strokeWidth="1.6" />
      <rect x="6" y="8" width="20" height="17" rx="5" fill="#FDF8E7" stroke={color} strokeWidth="2.4" />
      <path d="M8 14h16" stroke="#D4C8B0" strokeWidth="2" />
      <circle cx="12" cy="16" r="2.2" fill="#1E88E5" />
      <circle cx="20" cy="16" r="2.2" fill="#43A047" />
      <path d="M12 22h8" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M3.5 15.5v4M28.5 15.5v4" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function RobotButtonMark({ size = 48 }) {
  return (
    <div style={{ ...S.buttonMark, width: size, height: size }}>
      <div style={{ ...S.buttonMarkBg, backgroundImage: `url(${buttonBg})` }} />
      <div style={S.buttonMarkIcon}>
        <RobotGlyph size={Math.round(size * 0.56)} color="#fff" />
      </div>
    </div>
  );
}

function StepDots({ activeStep }) {
  const index = Math.max(0, STEPS.indexOf(activeStep));
  return (
    <div style={shared.stepDots}>
      {STEPS.map((step, i) => (
        <div
          key={step}
          style={{
            ...shared.dot,
            ...(i === index ? shared.dotActive : {}),
            ...(i < index ? shared.dotDone : {}),
          }}
        />
      ))}
    </div>
  );
}

// Bounded slider card matching premium styling
function SliderField({ label, value, min, max, step, onChange, defaultValue }) {
  return (
    <div style={S.sliderCard}>
      <div style={S.sliderTop}>
        <span style={S.label}>{label}</span>
        <strong style={S.sliderValue}>{money(value)}</strong>
      </div>
      <input
        className="bots-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
      <div style={S.sliderLabels}>
        <span>{money(min)}</span>
        <span>Default {money(defaultValue)}</span>
        <span>{money(max)}</span>
      </div>
    </div>
  );
}

function BotCard({ bot, expanded, onToggle, onStart, onStop }) {
  const type = getBotType(bot.type);
  const pnlPositive = Number(bot.pnl) >= 0;
  return (
    <div style={{ ...S.botCard, ...(expanded ? S.botCardExpanded : {}) }}>
      <button type="button" style={S.cardMainButton} onClick={() => onToggle(bot.id)} aria-expanded={expanded}>
        <div style={S.cardTop}>
          <div style={{ ...S.botAvatar, background: `linear-gradient(180deg, ${type.accent} 0%, ${type.accentDark} 100%)` }}>
            <RobotGlyph size={26} color="#fff" />
          </div>
          <div style={S.cardTitleBlock}>
            <div style={S.cardTitleRow}>
              <strong style={S.cardTitle}>{type.name}</strong>
              <span style={{ ...S.statusPill, ...(bot.status === 'Running' ? S.statusRunning : S.statusPaused) }}>
                {bot.status}
              </span>
            </div>
            <span style={S.cardSub}>{bot.market} on <strong>{bot.exchange}</strong> / {type.code}</span>
          </div>
          <span style={S.expandIcon}>{expanded ? '−' : '+'}</span>
        </div>
        <div style={S.metricGrid}>
          <div style={S.metric}>
            <span style={S.metricLabel}>Real PnL</span>
            <strong style={{ ...S.metricValue, color: pnlPositive ? colors.long : colors.short }}>
              {signedMoney(bot.pnl)}
            </strong>
          </div>
          <div style={S.metric}>
            <span style={S.metricLabel}>Trade Size</span>
            <strong style={S.metricValue}>{money(bot.tradeSize)}</strong>
          </div>
          <div style={S.metric}>
            <span style={S.metricLabel}>Max Position</span>
            <strong style={S.metricValue}>{money(bot.maxPosition)}</strong>
          </div>
        </div>
      </button>
      {expanded && (
        <div style={S.expandPanel}>
          <div style={S.detailGrid}>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Strategy intent</span>
              <strong style={S.detailTitle}>{type.tagline}</strong>
              <p style={S.detailCopy}>{type.description}</p>
            </div>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Runtime</span>
              <div style={S.detailRows}>
                <span>Uptime <strong>{bot.uptime}</strong></span>
                <span>Fills <strong>{bot.fills}</strong></span>
                <span>Spread <strong>{bot.spread}</strong></span>
                <span>Inventory <strong>{bot.inventory}</strong></span>
              </div>
            </div>
            <div style={S.detailCard}>
              <span style={S.metricLabel}>Preset</span>
              <strong style={S.detailTitle}>{PRESETS[bot.preset]?.label || 'Calm'}</strong>
              <p style={S.detailCopy}>{PRESETS[bot.preset]?.copy || PRESETS.calm.copy}</p>
            </div>
          </div>
          <div style={S.lastAction}>
            <span>Last bot action</span>
            <strong>{bot.lastAction}</strong>
          </div>
          <div style={S.actionsRow}>
            {bot.status === 'Running' ? (
              <button
                type="button"
                style={{ ...cartoonBtn('#E53935', '#C62828'), padding: '8px 16px', fontSize: 13, borderRadius: 10 }}
                onClick={(e) => { e.stopPropagation(); onStop(bot.id); }}
              >
                Stop Bot
              </button>
            ) : (
              <button
                type="button"
                style={{ ...cartoonBtn('#43A047', '#2E7D32'), padding: '8px 16px', fontSize: 13, borderRadius: 10 }}
                onClick={(e) => { e.stopPropagation(); onStart(bot.id); }}
              >
                Start Bot
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BotsPanel({ onClose }) {
  const { isMobile } = useLayout();
  const player = usePlayer();
  const token = player?.token || null;

  const [view, setView] = useState('dashboard');
  const [step, setStep] = useState('strategy');
  const [bots, setBots] = useState(DEFAULT_BOTS);
  const [history, setHistory] = useState(DEFAULT_HISTORY);
  const [expandedBotId, setExpandedBotId] = useState(DEFAULT_BOTS[0]?.id || null);
  const [selectedType, setSelectedType] = useState('delta_neutral');
  const [tradeSize, setTradeSize] = useState(20);
  const [maxPosition, setMaxPosition] = useState(200);
  const [preset, setPreset] = useState('calm');
  const [notice, setNotice] = useState('');
  const [totalPnl, setTotalPnl] = useState(0);
  const [fillsCount, setFillsCount] = useState(0);

  const [configuredInstances, setConfiguredInstances] = useState([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');

  const filteredInstances = useMemo(() => {
    return configuredInstances.filter(inst => inst.kind === selectedType);
  }, [configuredInstances, selectedType]);

  useEffect(() => {
    if (filteredInstances.length > 0) {
      const match = filteredInstances.find(inst => inst.id === selectedInstanceId);
      if (!match) {
        setSelectedInstanceId(filteredInstances[0].id);
      }
    } else {
      setSelectedInstanceId('');
    }
  }, [selectedType, filteredInstances, selectedInstanceId]);

  const selectedBot = useMemo(() => getBotType(selectedType), [selectedType]);
  const activeCount = bots.filter((bot) => bot.status === 'Running').length;
  const mockPnl = totalPnl !== 0 ? totalPnl : bots.reduce((sum, bot) => sum + Number(bot.pnl || 0), 0);
  const totalFills = fillsCount !== 0 ? fillsCount : bots.reduce((sum, bot) => sum + Number(bot.fills || 0), 0);

  const resetLaunch = useCallback(() => {
    setStep('strategy');
    setSelectedType('delta_neutral');
    setTradeSize(20);
    setMaxPosition(200);
    setPreset('calm');
    setSelectedInstanceId('');
  }, []);

  const openLaunch = useCallback(() => {
    setNotice('');
    resetLaunch();
    setView('launch');
  }, [resetLaunch]);

  const fetchInstances = useCallback(() => {
    if (!token) return;
    fetch('/api/v1/strategies/instances', {
      headers: { 'x-token': token }
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res || !res.data) return;
        const { running = [], configured = [] } = res.data;
        setConfiguredInstances(configured);
        const allHandles = [...configured];
        running.forEach((r) => {
          if (!allHandles.some((h) => h.id === r.id)) {
            allHandles.push(r);
          }
        });
        const mappedBots = allHandles.map((h) => mapHandleToBot(h, running));
        if (mappedBots.length > 0) {
          setBots(mappedBots);
          if (!expandedBotId) {
            setExpandedBotId(mappedBots[0].id);
          }
        }
      })
      .catch((err) => console.error('fetch instances failed:', err));
  }, [token, expandedBotId]);

  const handleStartBot = useCallback((id) => {
    if (!token) return;
    fetch(`/api/v1/strategies/${encodeURIComponent(id)}/start`, {
      method: 'POST',
      headers: { 'x-token': token }
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.status === 'started' || res?.data?.action === 'start_all') {
          setNotice(`Bot started successfully!`);
          fetchInstances();
        } else {
          setNotice(`Failed to start bot: ${res?.error || 'unknown error'}`);
        }
      })
      .catch((err) => {
        console.error('start bot failed:', err);
        setNotice('Network error starting bot');
      });
  }, [token, fetchInstances]);

  const handleStopBot = useCallback((id) => {
    if (!token) return;
    fetch(`/api/v1/strategies/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      headers: { 'x-token': token }
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.status === 'stopped' || res?.data?.action === 'stop_all') {
          setNotice(`Bot stopped successfully.`);
          fetchInstances();
        } else {
          setNotice(`Failed to stop bot: ${res?.error || 'unknown error'}`);
        }
      })
      .catch((err) => {
        console.error('stop bot failed:', err);
        setNotice('Network error stopping bot');
      });
  }, [token, fetchInstances]);

  const launchBot = useCallback(() => {
    if (!token || !selectedInstanceId) {
      setNotice('Please select a strategy and exchange instance first.');
      return;
    }
    const spreadBps = preset === 'aggressive' ? 4 : 8;

    fetch(`/api/v1/strategies/${encodeURIComponent(selectedInstanceId)}/config`, {
      method: 'PUT',
      headers: {
        'x-token': token,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        order_size_usd: String(tradeSize),
        position_size_usd: String(maxPosition),
        spread_bps: spreadBps,
        min_funding_diff_bps: spreadBps,
      })
    })
      .then((r) => r.json())
      .then(() => {
        return fetch(`/api/v1/strategies/${encodeURIComponent(selectedInstanceId)}/start`, {
          method: 'POST',
          headers: { 'x-token': token }
        });
      })
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.status === 'started') {
          setNotice(`Launched ${getBotType(selectedType).name} on ${getExchangeName(selectedInstanceId)} successfully!`);
          fetchInstances();
        } else {
          setNotice(`Launch failed: ${res?.error || 'unknown error'}`);
        }
      })
      .catch((err) => {
        console.error('launch failed:', err);
        setNotice('Network error launching strategy');
      });
    setView('dashboard');
    resetLaunch();
  }, [selectedInstanceId, token, tradeSize, maxPosition, preset, selectedType, fetchInstances, resetLaunch]);

  // Real-time WebSocket updates via Clash game backend mediator
  useEffect(() => {
    if (!token) return;
    fetchInstances();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/bot/ws?token=${encodeURIComponent(token)}`;
    let ws;
    let reconnectTimer;

    const connectWs = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          action: 'subscribe',
          channels: ['strategies', 'orders', 'positions', 'pnl', 'volume_stats', 'alerts']
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'strategy_event') {
            fetchInstances();
            const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            setHistory((prev) => [
              {
                id: `h-${Date.now()}`,
                time,
                bot: msg.data.strategy_id?.split(':')[0].replace('_', ' ').toUpperCase() || 'BOT',
                event: msg.data.type || 'Lifecycle event',
                value: msg.data.reason || 'state change'
              },
              ...prev.slice(0, 49)
            ]);
          } else if (msg.type === 'pnl_snapshot') {
            setTotalPnl(Number(msg.data.net_pnl_usd) || 0);
          } else if (msg.type === 'volume_stats') {
            setFillsCount(Number(msg.data.total_volume_usd_24h) || 0);
          } else if (msg.type === 'position_update') {
            const pos = msg.data;
            setBots((currentBots) => currentBots.map((b) => {
              if (matchPositionToBot(b.id, pos.exchange, pos.symbol)) {
                return {
                  ...b,
                  inventory: `${pos.size >= 0 ? '+' : ''}${Number(pos.size).toFixed(3)}`,
                  pnl: Number(pos.unrealized_pnl) || 0,
                  lastAction: `Position updated: size=${pos.size}`
                };
              }
              return b;
            }));
          } else if (msg.type === 'order_update') {
            const ord = msg.data;
            if (ord.status === 'Filled' || ord.status === 'PartiallyFilled') {
              setBots((currentBots) => currentBots.map((b) => {
                const parts = b.id.toLowerCase().split(':');
                const bExchange = parts[1];
                const bSymbols = parts[2] ? parts[2].split(',') : [];
                const matches = bExchange === String(ord.exchange).toLowerCase() && bSymbols.includes(String(ord.symbol).toLowerCase());
                if (matches) {
                  return {
                    ...b,
                    fills: b.fills + 1,
                    lastAction: `Order filled: ${ord.filled_size} @ ${ord.avg_fill_price || 'mkt'}`
                  };
                }
                return b;
              }));

              const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              setHistory((prev) => [
                {
                  id: `h-${Date.now()}`,
                  time,
                  bot: ord.exchange.toUpperCase(),
                  event: `Filled ${ord.symbol}`,
                  value: `${ord.filled_size} @ ${ord.avg_fill_price || 'mkt'}`
                },
                ...prev.slice(0, 49)
              ]);
            }
          }
        } catch (err) {
          console.warn('[bot-ws] parse failed:', err);
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [token, fetchInstances]);

  const goBack = useCallback(() => {
    const index = STEPS.indexOf(step);
    if (index <= 0) {
      setView('dashboard');
      return;
    }
    setStep(STEPS[index - 1]);
  }, [step]);

  const renderDashboard = () => (
    <>
      {notice && (
        <button type="button" style={S.notice} onClick={() => setNotice('')}>
          {notice}
          <span style={S.noticeClose}>x</span>
        </button>
      )}
      <div style={S.summaryGrid}>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Active Bots</span>
          <strong style={S.summaryValue}>{activeCount}</strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Real PnL</span>
          <strong style={{ ...S.summaryValue, color: mockPnl >= 0 ? colors.long : colors.short }}>
            {signedMoney(mockPnl)}
          </strong>
        </div>
        <div style={S.summaryCard}>
          <span style={S.metricLabel}>Fills Today</span>
          <strong style={S.summaryValue}>{totalFills}</strong>
        </div>
      </div>

      <div style={S.toolbar}>
        <div style={S.segment}>
          <button
            type="button"
            style={{ ...S.segmentButton, ...(view === 'dashboard' ? S.segmentActive : {}) }}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            style={S.segmentButton}
            onClick={() => setView('history')}
          >
            History
          </button>
        </div>
        <button type="button" style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.launchButton }} onClick={openLaunch}>
          <RobotGlyph size={22} color="#fff" />
          Launch New Bot
        </button>
      </div>

      <div style={S.botGrid}>
        {bots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            expanded={expandedBotId === bot.id}
            onToggle={(id) => setExpandedBotId((current) => (current === id ? null : id))}
            onStart={handleStartBot}
            onStop={handleStopBot}
          />
        ))}
      </div>
    </>
  );

  const renderHistory = () => (
    <>
      <div style={S.toolbar}>
        <div style={S.segment}>
          <button
            type="button"
            style={S.segmentButton}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            style={{ ...S.segmentButton, ...S.segmentActive }}
            onClick={() => setView('history')}
          >
            History
          </button>
        </div>
        <button type="button" style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.launchButton }} onClick={openLaunch}>
          <RobotGlyph size={22} color="#fff" />
          Launch New Bot
        </button>
      </div>
      <div style={S.historyList}>
        {history.map((item) => (
          <div key={item.id} style={S.historyRow}>
            <div style={S.historyTime}>{item.time}</div>
            <div style={S.historyMain}>
              <strong>{item.bot}</strong>
              <span>{item.event}</span>
            </div>
            <strong style={S.historyValue}>{item.value}</strong>
          </div>
        ))}
      </div>
    </>
  );

  const renderLaunch = () => (
    <div style={S.launchShell}>
      <div style={S.launchHeader}>
        <button type="button" style={S.backButton} onClick={goBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <StepDots activeStep={step} />
        <div style={shared.spacer36} />
      </div>

      {step === 'strategy' && (
        <div style={S.stepPage}>
          <div>
            <h2 style={S.stepTitle}>Choose Bot Strategy</h2>
            <p style={S.stepCopy}>Select the market-making strategy kind you want to coordinate.</p>
          </div>
          <div style={S.strategyGrid}>
            {BOT_TYPES.map((bot) => {
              const active = selectedType === bot.id;
              return (
                <button
                  key={bot.id}
                  type="button"
                  style={{ ...S.strategyCard, ...(active ? { borderColor: bot.accent, boxShadow: `0 0 0 3px ${bot.accent}22, 0 4px 0 #d4c8b0` } : {}) }}
                  onClick={() => setSelectedType(bot.id)}
                >
                  <div style={{ ...S.botAvatar, background: `linear-gradient(180deg, ${bot.accent} 0%, ${bot.accentDark} 100%)` }}>
                    <RobotGlyph size={28} color="#fff" />
                  </div>
                  <div style={S.strategyText}>
                    <strong>{bot.name}</strong>
                    <code>{bot.code}</code>
                    <span>{bot.description}</span>
                    <small>{bot.bestFor}</small>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedType && filteredInstances.length > 0 && (
            <div style={{
              background: '#e8dfc8',
              border: '3px solid #d4c8b0',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 12,
              boxSizing: 'border-box',
            }}>
              <span style={S.label}>Select Exchange Venue</span>
              <select
                value={selectedInstanceId}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                style={{
                  border: '2px solid #bba882',
                  background: '#fdf8e7',
                  borderRadius: 10,
                  color: '#5C3A21',
                  fontSize: 14,
                  fontWeight: 900,
                  padding: '9px 10px',
                  cursor: 'pointer',
                  width: '100%',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              >
                {filteredInstances.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {getExchangeName(inst.id)} ({inst.symbols.join(', ')})
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedType && filteredInstances.length === 0 && (
            <div style={{
              background: '#f8d7da',
              border: '3px solid #f5c6cb',
              borderRadius: 12,
              padding: 12,
              color: '#721c24',
              fontSize: 13,
              fontWeight: 800,
              marginTop: 12,
              boxSizing: 'border-box',
            }}>
              No configured exchange instances for this strategy found in strategies.toml.
            </div>
          )}
          <button
            type="button"
            disabled={!selectedInstanceId}
            style={{
              ...cartoonBtn(selectedInstanceId ? '#1E88E5' : '#a3906a', selectedInstanceId ? '#1565C0' : '#8c7d5c'),
              ...S.nextButton,
              opacity: selectedInstanceId ? 1 : 0.6,
              cursor: selectedInstanceId ? 'pointer' : 'not-allowed',
            }}
            onClick={() => setStep('risk')}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'risk' && (
        <div style={S.stepPage}>
          <div>
            <h2 style={S.stepTitle}>Set Risk Limits</h2>
            <p style={S.stepCopy}>Configure controls: deal size, maximum position, and behavior preset.</p>
          </div>
          <SliderField
            label="Trade Size"
            min={5}
            max={500}
            step={5}
            value={tradeSize}
            defaultValue={20}
            onChange={setTradeSize}
          />
          <SliderField
            label="Maximum Position"
            min={50}
            max={5000}
            step={50}
            value={maxPosition}
            defaultValue={200}
            onChange={setMaxPosition}
          />
          <div style={S.presetCard}>
            <span style={S.label}>Preset</span>
            <div style={S.presetToggle}>
              {Object.entries(PRESETS).map(([id, option]) => (
                <button
                  key={id}
                  type="button"
                  style={{ ...S.presetButton, ...(preset === id ? S.presetActive : {}) }}
                  onClick={() => setPreset(id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <strong style={S.detailTitle}>{PRESETS[preset].title}</strong>
            <p style={S.detailCopy}>{PRESETS[preset].copy}</p>
          </div>
          <button type="button" style={{ ...cartoonBtn('#1E88E5', '#1565C0'), ...S.nextButton }} onClick={() => setStep('review')}>
            Review Bot
          </button>
        </div>
      )}

      {step === 'review' && (
        <div style={S.stepPage}>
          <div>
            <h2 style={S.stepTitle}>Review and Launch</h2>
            <p style={S.stepCopy}>Review your strategy parameters before spinning up the MM bots.</p>
          </div>
          <div style={S.reviewCard}>
            <div style={S.cardTop}>
              <div style={{ ...S.botAvatar, background: `linear-gradient(180deg, ${selectedBot.accent} 0%, ${selectedBot.accentDark} 100%)` }}>
                <RobotGlyph size={30} color="#fff" />
              </div>
              <div style={S.cardTitleBlock}>
                <strong style={S.cardTitle}>{selectedBot.name}</strong>
                <span style={S.cardSub}>{selectedBot.code}</span>
              </div>
            </div>
            <p style={S.detailCopy}>{selectedBot.description}</p>
            <div style={S.reviewRows}>
              <span>Exchange <strong>{getExchangeName(selectedInstanceId)}</strong></span>
              <span>Market <strong>{configuredInstances.find(i => i.id === selectedInstanceId)?.symbols?.join(', ') || ''}</strong></span>
              <span>Trade Size <strong>{money(tradeSize)}</strong></span>
              <span>Maximum Position <strong>{money(maxPosition)}</strong></span>
              <span>Preset <strong>{PRESETS[preset].label}</strong></span>
              <span>Status <strong>Ready to launch</strong></span>
            </div>
          </div>
          <button type="button" style={{ ...cartoonBtn('#43A047', '#2E7D32'), ...S.nextButton }} onClick={launchBot}>
            Launch Bot
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ ...S.panel, ...(isMobile ? S.panelMobile : {}) }}>
      <style>{STYLE}</style>
      <div style={S.header}>
        <div style={S.headerBrand}>
          <RobotButtonMark size={46} />
          <div>
            <div style={S.headerTitle}>Bots</div>
            <div style={S.headerSub}>MM Bot control room</div>
          </div>
        </div>
        <button type="button" style={S.closeButton} onClick={onClose} aria-label="Close Bots panel">
          x
        </button>
      </div>
      <div style={S.body}>
        {view === 'launch' ? renderLaunch() : view === 'history' ? renderHistory() : renderDashboard()}
      </div>
    </div>
  );
}

export default memo(BotsPanel);

const STYLE = `
  .bots-range {
    width: 100%;
    accent-color: #1E88E5;
    cursor: pointer;
  }
  .bots-range::-webkit-slider-thumb {
    box-shadow: 0 2px 0 rgba(0,0,0,0.28);
  }
`;

const S = {
  panel: {
    position: 'fixed',
    top: 'clamp(12px, 1.25vw, 24px)',
    right: 'clamp(12px, 1.25vw, 24px)',
    bottom: 118,
    width: 'min(760px, calc(100vw - 32px))',
    background: '#e8dfc8',
    border: '6px solid #d4c8b0',
    borderRadius: 24,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto',
    overflow: 'hidden',
    zIndex: 101,
    boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
    fontFamily: '"Inter","Segoe UI",sans-serif',
    boxSizing: 'border-box',
  },
  panelMobile: {
    inset: 0,
    width: '100%',
    bottom: 0,
    borderRadius: 0,
    borderWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: '#d4c8b0',
    borderBottom: '4px solid #bba882',
    flexShrink: 0,
  },
  headerBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  buttonMark: {
    position: 'relative',
    flexShrink: 0,
  },
  buttonMarkBg: {
    position: 'absolute',
    inset: 0,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.34))',
  },
  buttonMarkIcon: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
    filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.35))',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: '#5C3A21',
    lineHeight: 1,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: 800,
    color: '#77573d',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#E53935',
    border: '3px solid #fff',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    fontSize: 16,
    fontWeight: 900,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
    lineHeight: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    overflowY: 'auto',
    overflowX: 'hidden',
    background: '#fdf8e7',
  },
  notice: {
    border: '2px solid #43A047',
    borderRadius: 10,
    background: 'rgba(67,160,71,0.14)',
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: 800,
    padding: '8px 10px',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    cursor: 'pointer',
  },
  noticeClose: {
    fontWeight: 900,
    opacity: 0.7,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
  },
  summaryCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '9px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  summaryValue: {
    color: '#5C3A21',
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  segment: {
    display: 'flex',
    gap: 4,
    padding: 4,
    background: '#e8dfc8',
    border: '2px solid #d4c8b0',
    borderRadius: 12,
  },
  segmentButton: {
    border: '2px solid transparent',
    background: 'transparent',
    color: '#77573d',
    fontSize: 12,
    fontWeight: 900,
    borderRadius: 8,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  segmentActive: {
    background: '#fdf8e7',
    borderColor: '#bba882',
    color: '#5C3A21',
    boxShadow: '0 2px 0 #bba882',
  },
  launchButton: {
    minHeight: 38,
    padding: '8px 12px',
    borderRadius: 12,
    fontSize: 13,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  botGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 10,
    alignItems: 'start',
  },
  botCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    minWidth: 0,
  },
  botCardExpanded: {
    gridColumn: '1 / -1',
    background: 'linear-gradient(180deg, #e8dfc8 0%, #f3ebd1 100%)',
  },
  cardMainButton: {
    border: 0,
    background: 'transparent',
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: 'inherit',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  botAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: '3px solid rgba(92,58,33,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 0 rgba(0,0,0,0.22)',
    flexShrink: 0,
  },
  cardTitleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
    flex: 1,
  },
  cardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: '#5C3A21',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardSub: {
    fontSize: 11,
    fontWeight: 800,
    color: '#8b7655',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusPill: {
    borderRadius: 999,
    padding: '3px 7px',
    fontSize: 10,
    fontWeight: 900,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  statusRunning: {
    background: 'rgba(67,160,71,0.16)',
    color: '#2E7D32',
    border: '1px solid rgba(67,160,71,0.45)',
  },
  statusPaused: {
    background: 'rgba(232,184,48,0.22)',
    color: '#8B6500',
    border: '1px solid rgba(232,184,48,0.65)',
  },
  expandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    color: '#5C3A21',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 900,
    flexShrink: 0,
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 7,
    marginTop: 9,
  },
  metric: {
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    padding: '7px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: '#a3906a',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: 900,
    color: '#5C3A21',
    lineHeight: 1.1,
  },
  expandPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 5,
    animation: 'slideDown 0.2s ease-out',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: 8,
  },
  detailCard: {
    background: '#fdf8e7',
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    padding: 10,
    minWidth: 0,
  },
  detailTitle: {
    display: 'block',
    color: '#5C3A21',
    fontSize: 14,
    fontWeight: 900,
    marginTop: 3,
  },
  detailCopy: {
    color: '#77573d',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.35,
    margin: '6px 0 0',
  },
  detailRows: {
    display: 'grid',
    gap: 5,
    marginTop: 5,
    color: '#77573d',
    fontSize: 12,
    fontWeight: 800,
  },
  lastAction: {
    background: 'rgba(30,136,229,0.1)',
    border: '2px solid rgba(30,136,229,0.25)',
    borderRadius: 10,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    color: '#1565C0',
    fontSize: 12,
    fontWeight: 800,
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  historyRow: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    display: 'grid',
    gridTemplateColumns: '52px minmax(0, 1fr) auto',
    gap: 10,
    alignItems: 'center',
  },
  historyTime: {
    color: '#a3906a',
    fontSize: 12,
    fontWeight: 900,
    fontFamily: 'monospace',
  },
  historyMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    color: '#77573d',
    fontSize: 12,
    fontWeight: 700,
    minWidth: 0,
  },
  historyValue: {
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  launchShell: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  launchHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 2px 10px',
    flexShrink: 0,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'transparent',
    border: `2px solid ${colors.border}`,
    color: colors.ink,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  stepPage: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
    overflowX: 'hidden',
    animation: 'fadeIn 0.2s ease-out',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 900,
    color: '#5C3A21',
    textAlign: 'center',
    margin: '2px 0 3px',
    lineHeight: 1.15,
  },
  stepCopy: {
    fontSize: 13,
    fontWeight: 700,
    color: '#8b7655',
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.35,
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 9,
  },
  strategyCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 10,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    minWidth: 0,
    color: '#5C3A21',
  },
  strategyText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  sliderCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  sliderTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    color: '#5C3A21',
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sliderValue: {
    color: '#5C3A21',
    fontSize: 18,
    fontWeight: 900,
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#a3906a',
    fontSize: 11,
    fontWeight: 800,
    gap: 8,
  },
  presetCard: {
    background: '#e8dfc8',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  presetToggle: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 7,
  },
  presetButton: {
    border: '2px solid #bba882',
    background: '#d4c8b0',
    borderRadius: 10,
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 900,
    padding: '9px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  presetActive: {
    background: '#fdf8e7',
    borderColor: '#1E88E5',
    color: '#1565C0',
    boxShadow: '0 2px 0 #bba882',
  },
  reviewCard: {
    background: 'linear-gradient(180deg, #e8dfc8 0%, #f3ebd1 100%)',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  reviewRows: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 8,
    color: '#77573d',
    fontSize: 12,
    fontWeight: 800,
  },
  nextButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    fontSize: 16,
    marginTop: 'auto',
  },
  actionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
};
