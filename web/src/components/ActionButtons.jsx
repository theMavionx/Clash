import { memo, useCallback } from 'react';
import { useSend, useUI } from '../hooks/useGodot';
import buildIcon from '../assets/resources/Gemini_Generated_Image_dl9plxdl9plxdl9p-removebg-preview.png';
import attackIcon from '../assets/resources/file_000000006858720a8f860ee8da33335a.png';
import chartIcon from '../assets/resources/chart.png';
import buttonBg from '../assets/resources/file_00000000a6f87246844c6271b76cd436.png';

const CustomBtn = ({ children, onClick, width = 140, height = 140, style = {} }) => {
  return (
    <button
      onClick={onClick}
      style={{
        width, height, position: 'relative', background: 'none', border: 'none',
        padding: 0, cursor: 'pointer', transition: 'transform 0.1s ease-out, filter 0.1s', outline: 'none',
        ...style
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'scale(1.08)';
        e.currentTarget.style.filter = 'brightness(1.1)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.filter = 'none';
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
    >
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${buttonBg})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))',
        zIndex: 0
      }} />
      
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', zIndex: 3,
        paddingBottom: 4
      }}>
        {children}
      </div>
    </button>
  );
};

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
        <CustomBtn width={280} height={100} onClick={handleReturnHome}>
          <span style={styles.btnTextWide}>🏠 Return Home</span>
        </CustomBtn>
      </div>
    );
  }

  return (
    <>
      <div style={styles.wrapLeft}>
        <CustomBtn onClick={handleFindEnemy}>
          <img src={attackIcon} alt="attack" style={styles.attackIconImg} />
        </CustomBtn>
        <CustomBtn onClick={handleOpenShop} width={110} height={110}>
          <div style={styles.notificationBadgeSmall}>!</div>
          <img src={buildIcon} alt="build" style={styles.buildIconImgSmall} />
        </CustomBtn>
      </div>
      <div style={styles.wrapRight}>
        <CustomBtn onClick={handleOpenTrade}>
          <div style={styles.notificationBadge}>14</div>
          <img src={chartIcon} alt="trade" style={styles.chartIconImg} />
        </CustomBtn>
      </div>
    </>
  );
}

export default memo(ActionButtons);

const base = {
  position: 'fixed',
  bottom: 12,
  display: 'flex',
  pointerEvents: 'all',
  zIndex: 10,
};

const styles = {
  wrapLeft: { 
    ...base, 
    left: 12, 
    flexDirection: 'row', 
    alignItems: 'flex-end',
    gap: 8 
  },
  wrapRight: {
    ...base,
    right: 12,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 12
  },
  buildIconImgSmall: {
    width: 95, height: 95, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translate(-4px, -2px)',
  },
  attackIconImg: {
    width: 160, height: 160, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
  },
  chartIconImg: {
    width: 120, height: 120, objectFit: 'contain',
    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    transform: 'translateY(-6px)',
  },
  btnTextWide: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 900,
    WebkitTextStroke: '1.5px #1a1a1a',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
    letterSpacing: '1px',
    zIndex: 2, position: 'relative', pointerEvents: 'none', textTransform: 'uppercase',
  },
  enemyBadge: {
    background: 'linear-gradient(180deg, #B71C1C, #7F0000)',
    border: '3.5px solid #1a1a1a', borderRadius: 12, padding: '10px 20px',
    color: '#fff', fontSize: 18, fontWeight: 900, textAlign: 'center',
    textShadow: '0 2px 2px rgba(0,0,0,0.5)', boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
    marginBottom: -4,
  },
  notificationBadge: {
    position: 'absolute', top: 6, right: 6,
    background: '#E63946', color: '#fff', borderRadius: '50%',
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 900, border: '3px solid #fff',
    boxShadow: '0 4px 8px rgba(0,0,0,0.5)', zIndex: 5,
  },
  notificationBadgeSmall: {
    position: 'absolute', top: 4, right: 4,
    background: '#E63946', color: '#fff', borderRadius: '50%',
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 900, border: '2px solid #fff',
    boxShadow: '0 4px 8px rgba(0,0,0,0.5)', zIndex: 5,
  }
};

