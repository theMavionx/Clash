import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import './CopyTrading.css';
import { CLASHBOT_COPY_URL, PUBLIC_LEADERBOARD_VENUES } from './constants';
import { fetchTraderSummary } from './copyTradingApi';
import { traderFromSummary } from './traderModel';
import Leaderboard from './Leaderboard';
import MyCopyBots from './MyCopyBots';
import { Notice, Segmented, StateBlock } from './ui';

const TraderAnalysis = lazy(() => import('./TraderAnalysis'));
const CopySetupWizard = lazy(() => import('./CopySetupWizard'));

const VIEW_KEY = 'clash.copytrading.view.v1';

function readView() {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'bots' ? 'bots' : 'leaderboard';
  } catch {
    return 'leaderboard';
  }
}

/**
 * Native ClashBot copy trading inside the Bots panel: leaderboard with every
 * ClashBot filter and sort, starred traders, deep trader analysis, an in-game
 * copy setup wizard and "My bots" management. Analytics come through the
 * read-only Clash proxy; bot control goes through the Clash server's signed
 * ClashBot partner channel, so no ClashBot sign-in is needed.
 */
export default function CopyTradingSection({ player, walletCtx }) {
  const token = player?.token || null;
  const [view, setViewState] = useState(readView);
  const [analysisTrader, setAnalysisTrader] = useState(null);
  const [copyTrader, setCopyTrader] = useState(null);
  const [editBot, setEditBot] = useState(null);
  const [savedNotice, setSavedNotice] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
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

  const onSaved = useCallback((item, kind, warning) => {
    setCopyTrader(null);
    setEditBot(null);
    setSavedNotice({
      tone: warning ? 'warning' : 'success',
      text: warning || (kind === 'updated'
        ? `Copy bot #${item?.id ?? ''} updated.`
        : `Copy bot #${item?.id ?? ''} created${item?.status === 'active' ? ' and running' : ''}.`),
    });
    setRefreshKey((value) => value + 1);
    setView('bots');
  }, [setView]);

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
              : 'Status, PnL and controls for the copy bots ClashBot runs for your game account.'}
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

      {savedNotice && view === 'bots' && <Notice tone={savedNotice.tone}>{savedNotice.text}</Notice>}

      {view === 'leaderboard' ? (
        <Leaderboard
          token={token}
          playerId={player?.id}
          onCopy={setCopyTrader}
          onAnalyze={openAnalysis}
          onContextChange={rememberContext}
        />
      ) : (
        <MyCopyBots token={token} refreshKey={refreshKey} onEdit={setEditBot} onBrowse={() => setView('leaderboard')} />
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
        {(copyTrader || editBot) && (
          <CopySetupWizard
            key={editBot ? `edit:${editBot.id}` : `${copyTrader.venue}:${copyTrader.account}`}
            token={token}
            trader={copyTrader}
            editBot={editBot}
            player={player}
            walletCtx={walletCtx}
            onClose={() => { setCopyTrader(null); setEditBot(null); }}
            onSaved={onSaved}
          />
        )}
      </Suspense>
    </div>
  );
}
