import { memo, useCallback } from 'react';
import { useSend, useUI } from '../hooks/useGodot';
import { cartoonBtn } from '../styles/theme';
import buildIcon from '../assets/resources/Gemini_Generated_Image_dl9plxdl9plxdl9p-removebg-preview.png';
import attackIcon from '../assets/resources/Gemini_Generated_Image_qgf6o5qgf6o5qgf6-removebg-preview.png';

function ActionButtons() {
  const { sendToGodot, setFuturesOpen } = useSend();
  const { enemyMode } = useUI();

  const handleReturnHome = useCallback(() => sendToGodot('return_home'), [sendToGodot]);
  const handleFindEnemy = useCallback(() => sendToGodot('find_enemy'), [sendToGodot]);
  const handleOpenShop = useCallback(() => sendToGodot('open_shop'), [sendToGodot]);
  const handleOpenTrade = useCallback(() => setFuturesOpen(true), [setFuturesOpen]);

  if (enemyMode.active) {
    return (
      <div style={styles.wrapRight}>
        <div style={styles.enemyBadge}>
          ⚔️ {enemyMode.name} • {enemyMode.trophies} 🏆
        </div>
        <button
          style={cartoonBtn('#FF8F00', '#E65100')}
          onClick={handleReturnHome}
        >
          🏠 Return Home
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={styles.wrapLeft}>
        <button
          style={styles.tradeBtn}
          onClick={handleOpenTrade}
        >
          <div style={{ fontSize: 45, marginBottom: -5, marginTop: 0, filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))' }}>📈</div>
          <span style={styles.btnText}>TRADE</span>
        </button>
        <button
          style={styles.attackBtn}
          onClick={handleFindEnemy}
        >
          <img src={attackIcon} alt="attack" style={styles.attackIconImg} />
          <span style={styles.btnText}>ATTACK</span>
        </button>
      </div>
      <div style={styles.wrapRight}>
        <button
          style={styles.buildBtn}
          onClick={handleOpenShop}
        >
          <img src={buildIcon} alt="build" style={styles.buildIconImg} />
          <span style={styles.btnText}>BUILD</span>
        </button>
      </div>
    </>
  );
}

export default memo(ActionButtons);

const base = {
  position: 'fixed',
  bottom: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  pointerEvents: 'all',
  zIndex: 10,
};

const styles = {
  wrapLeft: { ...base, left: 20 },
  wrapRight: { ...base, right: 20 },
  buildBtn: {
    width: 120,
    height: 110,
    borderRadius: 24,
    border: '4px solid #fff',
    background: 'linear-gradient(180deg, #1976D2 0%, #0D47A1 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
    transition: 'transform 0.1s, box-shadow 0.1s',
    userSelect: 'none',
    padding: 0,
    outline: 'none',
    overflow: 'hidden',
  },
  attackBtn: {
    width: 120,
    height: 110,
    borderRadius: 24,
    border: '4px solid #fff',
    background: 'linear-gradient(180deg, #1976D2 0%, #0D47A1 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
    transition: 'transform 0.1s, box-shadow 0.1s',
    userSelect: 'none',
    padding: 0,
    outline: 'none',
    overflow: 'hidden',
  },
  tradeBtn: {
    width: 120,
    height: 110,
    borderRadius: 24,
    border: '4px solid #fff',
    background: 'linear-gradient(180deg, #9C27B0 0%, #4A148C 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
    transition: 'transform 0.1s, box-shadow 0.1s',
    userSelect: 'none',
    padding: 0,
    outline: 'none',
    overflow: 'hidden',
  },
  buildIconImg: {
    width: 115,
    height: 115,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))',
    marginBottom: -25,
    marginTop: -10,
    marginLeft: -10,
    transform: 'translate(-4px, -6px)',
  },
  attackIconImg: {
    width: 85,
    height: 85,
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))',
    marginBottom: -10,
    marginTop: 0,
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    WebkitTextStroke: '1px #000',
    textShadow: '0 2px 0 rgba(0,0,0,0.5)',
    letterSpacing: '0.5px',
    zIndex: 2,
    position: 'relative',
    pointerEvents: 'none',
  },
  enemyBadge: {
    background: 'linear-gradient(180deg, #B71C1C, #7F0000)',
    border: '3px solid #E53935',
    borderRadius: 16,
    padding: '8px 16px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    textAlign: 'center',
    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
    boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
  },
};
