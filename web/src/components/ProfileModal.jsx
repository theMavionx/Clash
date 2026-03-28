import { memo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePlayer } from '../hooks/useGodot';
import { usePacifica } from '../hooks/usePacifica';
import { cartoonBtn } from '../styles/theme';
import trophyIcon from '../assets/resources/free-icon-cup-with-star-109765.png';

function ProfileModal({ onClose }) {
  const player = usePlayer();
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { account } = usePacifica();

  const townHallLevel = player?.buildings?.town_hall?.level || 1;
  const pacBalance = parseFloat(account?.balance || 0);
  const pacEquity = parseFloat(account?.account_equity || 0);

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        {/* Header */}
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
          {/* Wallet connect */}
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

          {/* Stats */}
          {[
            ['Player Level', townHallLevel],
            ['Trophies', (player?.trophies || 0).toLocaleString()],
            connected && ['Trading Balance', `$${pacBalance.toFixed(2)}`],
            connected && ['Equity', `$${pacEquity.toFixed(2)}`],
            connected && ['Positions', account?.positions_count || 0],
            connected && ['Orders', account?.orders_count || 0],
            connected && ['Fee Tier', account?.fee_level ?? '—'],
          ].filter(Boolean).map(([label, val]) => (
            <div key={label} style={S.statRow}>
              <span style={{fontSize: 13, fontWeight: 700, color: '#77573d'}}>{label}</span>
              <span style={{fontSize: 16, fontWeight: 900, color: '#5C3A21'}}>{val}</span>
            </div>
          ))}
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
    width: 370, maxHeight: '80vh', background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
    zIndex: 201, pointerEvents: 'auto', overflow: 'hidden', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
  },
  levelBadge: {
    width: 44, height: 44, borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, #7bd9ff 0%, #46b8e8 70%, #2a9ccb 100%)',
    border: '3px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
  },
  levelNum: { color: '#fff', fontSize: 22, fontWeight: 900, WebkitTextStroke: '1.5px #0a0a0a', textShadow: '0 2px 2px rgba(0,0,0,0.8)' },
  closeBtn: {
    width: 30, height: 30, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  body: { flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' },
  connectedBox: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12, padding: '10px 14px',
  },
  dot: { width: 10, height: 10, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 6px #4CAF50' },
  disconnectBtn: {
    padding: '5px 12px', background: '#E53935', border: '2px solid #B71C1C',
    borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 11, cursor: 'pointer',
  },
  statRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
  },
};
