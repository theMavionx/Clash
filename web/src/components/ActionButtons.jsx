import { cartoonBtn } from '../styles/theme';
import buildIcon from '../assets/resources/Gemini_Generated_Image_dl9plxdl9plxdl9p-removebg-preview.png';
import attackIcon from '../assets/resources/—Pngtree—double sword stroke icon_6942721.png';

export default function ActionButtons({ enemyMode, sendToGodot }) {
  if (enemyMode.active) {
    return (
      <div style={styles.wrapRight}>
        <div style={styles.enemyBadge}>
          ⚔️ {enemyMode.name} • {enemyMode.trophies} 🏆
        </div>
        <button
          style={cartoonBtn('#FF8F00', '#E65100')}
          onClick={() => sendToGodot('return_home')}
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
          style={styles.attackBtn}
          onClick={() => sendToGodot('find_enemy')}
        >
          <img src={attackIcon} alt="attack" style={styles.attackIconImg} />
          <span style={styles.btnText}>ATTACK</span>
        </button>
      </div>
      <div style={styles.wrapRight}>
        <button
          style={styles.buildBtn}
          onClick={() => sendToGodot('open_shop')}
        >
          <img src={buildIcon} alt="build" style={styles.buildIconImg} />
          <span style={styles.btnText}>BUILD</span>
        </button>
      </div>
    </>
  );
}

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
    border: '4px solid #0D47A1',
    background: 'linear-gradient(180deg, #1976D2 0%, #0D47A1 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 6px 0 #0D47A1, 0 10px 20px rgba(0,0,0,0.5)',
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
    border: '4px solid #0D47A1', 
    background: 'linear-gradient(180deg, #1976D2 0%, #0D47A1 100%)', 
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 6px 0 #0D47A1, 0 10px 20px rgba(0,0,0,0.5)',
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
