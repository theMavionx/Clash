import { memo, useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePlayer, useResources } from '../hooks/useGodot';
import { usePacifica } from '../hooks/usePacifica';
import { cartoonBtn } from '../styles/theme';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

function ProfileModal({ onClose }) {
  const player = usePlayer();
  const resources = useResources();
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { account } = usePacifica();
  const [tradingStats, setTradingStats] = useState(null);

  const townHallLevel = player?.buildings?.town_hall?.level || 1;
  const pacBalance = parseFloat(account?.balance || 0);
  const pacEquity = parseFloat(account?.account_equity || 0);

  // Fetch trading reward stats
  useEffect(() => {
    const token = window._playerToken;
    if (!token) return;
    fetch('/api/trading/stats', { headers: { 'x-token': token } })
      .then(r => r.json())
      .then(d => setTradingStats(d))
      .catch(() => {});
  }, []);

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div style={S.levelBadge}><span style={S.levelNum}>{townHallLevel}</span></div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
              <span style={{color: '#5C3A21', fontSize: 20, fontWeight: 900}}>{player?.player_name}</span>
              <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                <img src={trophyIcon} alt="" style={{width: 16, height: 16, filter: 'invert(60%) sepia(90%) saturate(500%) hue-rotate(10deg)'}} />
                <span style={{fontSize: 13, fontWeight: 800, color: '#a3906a'}}>{(player?.trophies || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={S.body}>
          {/* Wallet */}
          {connected ? (
            <div style={S.connectedBox}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <div style={S.dot} />
                <span style={{fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#5C3A21'}}>
                  {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
                </span>
              </div>
              <button style={S.disconnectBtn} onClick={disconnect}>Disconnect</button>
            </div>
          ) : (
            <button
              style={{...cartoonBtn('#9945FF', '#7B36CC'), width: '100%', textAlign: 'center', padding: '14px'}}
              onClick={() => openWalletModal(true)}
            >CONNECT WALLET</button>
          )}

          {/* Game resources */}
          <div style={S.sectionTitle}>Game Resources</div>
          <div style={{display: 'flex', gap: 6}}>
            <div style={S.resCard}><span style={{...S.resVal, color: '#e8b830'}}>{resources?.gold || 0}</span><span style={S.resLabel}>Gold</span></div>
            <div style={S.resCard}><span style={{...S.resVal, color: '#6ab344'}}>{resources?.wood || 0}</span><span style={S.resLabel}>Wood</span></div>
            <div style={S.resCard}><span style={{...S.resVal, color: '#8a9aaa'}}>{resources?.ore || 0}</span><span style={S.resLabel}>Ore</span></div>
          </div>

          {/* Game stats */}
          {[
            ['Player Level', townHallLevel],
            ['Trophies', (player?.trophies || 0).toLocaleString()],
          ].map(([label, val]) => (
            <div key={label} style={S.statRow}>
              <span style={S.statLabel}>{label}</span>
              <span style={S.statVal}>{val}</span>
            </div>
          ))}

          {/* Trading stats */}
          {connected && (
            <>
              <div style={S.sectionTitle}>Trading</div>
              {[
                ['Trading Balance', `$${pacBalance.toFixed(2)}`],
                ['Equity', `$${pacEquity.toFixed(2)}`],
                ['Positions', account?.positions_count || 0],
                ['Orders', account?.orders_count || 0],
              ].map(([label, val]) => (
                <div key={label} style={S.statRow}>
                  <span style={S.statLabel}>{label}</span>
                  <span style={S.statVal}>{val}</span>
                </div>
              ))}
            </>
          )}

          {/* Gold rewards */}
          {tradingStats && tradingStats.total_gold > 0 && (
            <>
              <div style={S.sectionTitle}>Gold from Trading</div>
              <div style={S.goldCard}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <span style={{fontSize: 28}}>🪙</span>
                  <div>
                    <div style={{fontSize: 22, fontWeight: 900, color: '#5C3A21'}}>{tradingStats.total_gold.toLocaleString()} Gold</div>
                    <div style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>Volume: ${parseFloat(tradingStats.total_volume || 0).toFixed(0)}</div>
                  </div>
                </div>
              </div>

              {/* Gold history */}
              {tradingStats.gold_history?.length > 0 && (
                <>
                  <div style={S.sectionTitle}>Gold History</div>
                  {tradingStats.gold_history.map((h, i) => (
                    <div key={i} style={S.historyRow}>
                      <span style={{fontSize: 14, fontWeight: 900, color: '#4CAF50'}}>+{h.amount}</span>
                      <span style={{fontSize: 12, fontWeight: 700, color: '#77573d', flex: 1}}>{h.reason}</span>
                      <span style={{fontSize: 10, color: '#a3906a'}}>{h.created_at?.split(' ')[0]}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* Trade history */}
          {tradingStats?.trades?.length > 0 && (
            <>
              <div style={S.sectionTitle}>Trade History</div>
              {tradingStats.trades.slice(0, 20).map((t, i) => (
                <div key={i} style={S.historyRow}>
                  <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21', minWidth: 40}}>{t.symbol}</span>
                  <span style={{fontSize: 12, fontWeight: 700, color: '#77573d', flex: 1}}>{t.amount} @ ${parseFloat(t.price).toLocaleString()}</span>
                  <span style={{fontSize: 10, color: '#a3906a'}}>{t.created_at?.split(' ')[0] || '—'}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default memo(ProfileModal);

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, pointerEvents: 'auto' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 370, maxHeight: '85vh', background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
    zIndex: 201, pointerEvents: 'auto', overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
  },
  levelBadge: {
    width: 44, height: 44, borderRadius: 10,
    background: 'radial-gradient(circle at 30% 30%, #7bd9ff 0%, #46b8e8 70%, #2a9ccb 100%)',
    border: '3px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
    position: 'relative',
    overflow: 'hidden',
  },
  levelNum: { color: '#fff', fontSize: 22, fontWeight: 900, WebkitTextStroke: '1.5px #0a0a0a', textShadow: '0 2px 2px rgba(0,0,0,0.8)' },
  closeBtn: {
    width: 30, height: 30, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  body: { flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', scrollbarWidth: 'none' },
  connectedBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12, padding: '10px 14px',
  },
  dot: { width: 10, height: 10, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 6px #4CAF50' },
  disconnectBtn: {
    padding: '5px 12px', background: '#E53935', border: '2px solid #B71C1C',
    borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 11, cursor: 'pointer',
  },
  sectionTitle: {
    fontSize: 12, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase',
    marginTop: 6, paddingBottom: 2, borderBottom: '2px solid #e8dfc8',
  },
  statRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 10,
  },
  statLabel: { fontSize: 13, fontWeight: 700, color: '#77573d' },
  statVal: { fontSize: 15, fontWeight: 900, color: '#5C3A21' },
  resCard: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 10, padding: 8,
  },
  resVal: { fontSize: 16, fontWeight: 900 },
  resLabel: { fontSize: 10, fontWeight: 700, color: '#a3906a', textTransform: 'uppercase' },
  goldCard: {
    background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE082 100%)',
    border: '3px solid #FFB300', borderRadius: 14, padding: 14,
  },
  goldStat: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    background: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: 6,
  },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
  },
};
