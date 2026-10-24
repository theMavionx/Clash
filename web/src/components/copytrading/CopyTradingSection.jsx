import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import './CopyTrading.css';
import { CLASHBOT_COPY_URL, PUBLIC_LEADERBOARD_VENUES } from './constants';
import { fetchTraderSummary } from './copyTradingApi';
import { traderFromSummary } from './traderModel';
import Leaderboard from './Leaderboard';
import { Icon, Segmented, StateBlock } from './ui';

const TraderAnalysis = lazy(() => import('./TraderAnalysis'));
const CopyHandoffModal = lazy(() => import('./CopyHandoffModal'));

const VIEW_KEY = 'clash.copytrading.view.v1';

function readView() {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'bots' ? 'bots' : 'leaderboard';
  } catch {
    return 'leaderboard';
  }
}

function MyBotsHandoff() {
  return (
    <section className="ct-card">
      <StateBlock
        tone="brand"
        icon="bot"
        title="Your copy bots live on ClashBot"
        action={(
          <a className="ct-btn ct-btn--primary ct-btn--md" href={CLASHBOT_COPY_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            Open my bots on ClashBot
            <Icon name="external" size={16} />
          </a>
        )}
      >
        Status, PnL, pause, stop and edit controls require your ClashBot wallet sign-in, which only works on
        ClashBot itself. Bots keep running there after you close the game.
      </StateBlock>
    </section>
  );
}

/**
 * Native ClashBot copy trading inside the Bots panel: leaderboard with every
 * ClashBot filter and sort, starred traders, deep trader analysis, and a
 * copy hand-off to ClashBot (bot creation / control needs ClashBot sign-in).
 * Data comes from ClashBot through the authenticated Clash server proxy.
 */
export default function CopyTradingSection({ player }) {
  const token = player?.token || null;
  const [view, setViewState] = useState(readView);
  const [analysisTrader, setAnalysisTrader] = useState(null);
  const [copyTrader, setCopyTrader] = useState(null);
  const contextRef = useRef(null);
  const [analysisContext, setAnalysisContext] = useState(null);

  const setView = useCallback((next) => {
    setViewState(next);
    try { globalThis.localStorage?.setItem(VIEW_KEY, next); } catch { /* storage optional */ }
  }, []);

  const rememberContext = useCallback((context) => { contextRef.current = context; }, []);

  const openAnalysis = useCallback(async (trader) => {
    setAnalysisContext(contextRef.current);
    // Starred snapshots carry fewer fields; enrich from the durable summary.
    if (trader.savedAt && token) {
      try {
        const summary = await fetchTraderSummary(token, trader.venue, trader.account);
        setAnalysisTrader(summary ? { ...traderFromSummary(summary), ...trader } : trader);
        return;
      } catch {
        // Fall back to the saved snapshot.
      }
    }
    setAnalysisTrader(trader);
  }, [token]);

  if (!token) {
    return (
      <div className="ct-root">
        <section className="ct-card">
          <StateBlock icon="info" title="Sign in to use copy trading">Copy trading needs your game account session.</StateBlock>
        </section>
      </div>
    );
  }

  return (
    <div className="ct-root">
      <div className="ct-heading">
        <div style={{ minWidth: 0 }}>
          <h2 className="ct-title">{view === 'leaderboard' ? 'Copy trading leaderboard' : 'My copy bots'}</h2>
          <p className="ct-subtitle">
            {view === 'leaderboard'
              ? `Discover perp traders across ${PUBLIC_LEADERBOARD_VENUES.length} exchanges by copy score, profit, ROI, win rate and real trading volume. Powered by ClashBot.`
              : 'Manage copy strategies, risk settings and status on ClashBot.'}
          </p>
        </div>
        <Segmented
          label="Copy trading section"
          value={view}
          onChange={setView}
          options={[
            { value: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
            { value: 'bots', label: 'My bots', icon: 'bot' },
          ]}
        />
      </div>

      {view === 'leaderboard' ? (
        <Leaderboard
          token={token}
          playerId={player?.id}
          onCopy={setCopyTrader}
          onAnalyze={openAnalysis}
          onContextChange={rememberContext}
        />
      ) : (
        <MyBotsHandoff />
      )}

      <p className="ct-field-hint" style={{ margin: 0, textAlign: 'center' }}>
        Data and copy execution by{' '}
        <a href={CLASHBOT_COPY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--terminal-text-secondary)' }}>ClashBot</a>.
        Unsupported or incomplete metrics stay N/A rather than estimated.
      </p>

      <Suspense fallback={null}>
        {analysisTrader && (
          <TraderAnalysis
            key={`${analysisTrader.venue}:${analysisTrader.account}`}
            token={token}
            trader={analysisTrader}
            context={analysisContext}
            onClose={() => setAnalysisTrader(null)}
            onCopy={() => {
              setCopyTrader(analysisTrader);
              setAnalysisTrader(null);
            }}
          />
        )}
        {copyTrader && (
          <CopyHandoffModal
            key={`${copyTrader.venue}:${copyTrader.account}`}
            token={token}
            trader={copyTrader}
            onClose={() => setCopyTrader(null)}
          />
        )}
      </Suspense>
    </div>
  );
}
