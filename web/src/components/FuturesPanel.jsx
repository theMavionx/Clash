import { useState, memo, useCallback } from 'react';
import { useSend, useUI } from '../hooks/useGodot';
import { cartoonBtn } from '../styles/theme';
import TradingViewWidget from './TradingViewWidget';

const TABS = [
  { id: 'Trade', icon: '📈', label: 'Trade' },
  { id: 'Positions', icon: '💼', label: 'Positions' },
  { id: 'Orders', icon: '📋', label: 'Orders' },
];

function FuturesPanel() {
  const { setFuturesOpen } = useSend();
  const { futuresOpen } = useUI();
  const [activeTab, setActiveTab] = useState('Trade');
  
  const [leverage, setLeverage] = useState(20);
  const [showLeverage, setShowLeverage] = useState(false);

  const handleClose = useCallback(() => setFuturesOpen(false), [setFuturesOpen]);

  const renderContent = () => {
    if (activeTab === 'Trade') {
      return (
        <>
          <div style={styles.chartArea}>
            <TradingViewWidget />
          </div>

          <div style={styles.tradeControl}>
            <div style={styles.inputGroupRow}>
              <div style={{...styles.inputGroup, flex: 2}}>
                <span style={styles.inputLabel}>Amount (USDT)</span>
                <input type="number" placeholder="100" style={styles.input} />
              </div>
              <div style={{...styles.inputGroup, flex: 1}}>
                <span style={styles.inputLabel}>Leverage</span>
                <button 
                  style={styles.leverageToggleBtn}
                  onClick={() => setShowLeverage(!showLeverage)}
                >
                  {leverage}x
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: showLeverage ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
            </div>

            {showLeverage && (
              <div style={styles.sliderContainer}>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={leverage} 
                  onChange={(e) => setLeverage(e.target.value)}
                  style={styles.sliderInput} 
                />
                <div style={styles.sliderLabels}>
                  <span>1x</span>
                  <span>50x</span>
                  <span>100x</span>
                </div>
              </div>
            )}

            <div style={styles.buttons}>
              <button style={{...cartoonBtn('#4CAF50', '#2E7D32'), ...styles.actionBtn}}>
                <span style={styles.btnActionText}>LONG</span>
                <span style={styles.btnActionSub}>Price will rise</span>
              </button>
              <button style={{...cartoonBtn('#E53935', '#B71C1C'), ...styles.actionBtn}}>
                <span style={styles.btnActionText}>SHORT</span>
                <span style={styles.btnActionSub}>Price will fall</span>
              </button>
            </div>
          </div>
        </>
      );
    }
    
    if (activeTab === 'Positions') {
      return (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💼</div>
          <div style={styles.emptyTitle}>No Open Positions</div>
          <div style={styles.emptyDesc}>You haven't opened any long or short positions yet.</div>
        </div>
      );
    }

    if (activeTab === 'Orders') {
      return (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📋</div>
          <div style={styles.emptyTitle}>No Open Orders</div>
          <div style={styles.emptyDesc}>Good till cancelled or limit orders will appear here.</div>
        </div>
      );
    }
  };

  return (
    <>
      <style>{`
        .futures-panel-body::-webkit-scrollbar {
          display: none;
        }
        @keyframes slideDown {
          from { opacity: 0; margin-top: -10px; transform: scaleY(0.95); transform-origin: top; }
          to { opacity: 1; margin-top: 0; transform: scaleY(1); transform-origin: top; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.tabsContainer}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={isActive ? styles.tabActive : styles.tabInactive}
                >
                  <span style={styles.tabIcon}>{tab.icon}</span>
                  {isActive && <span style={styles.tabLabel}>{tab.label}</span>}
                </button>
              );
            })}
          </div>
          <button onClick={handleClose} style={styles.closeBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="futures-panel-body" style={styles.body}>
          <div key={activeTab} style={{ animation: 'fadeIn 0.25s ease-out', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(FuturesPanel);

const styles = {
  container: {
    position: 'absolute',
    top: 20,
    right: 20,
    bottom: 150, 
    width: 400,
    background: '#e8dfc8',
    border: '6px solid #d4c8b0',
    borderRadius: 24,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4), inset 0 0 10px rgba(0,0,0,0.05)',
    pointerEvents: 'auto',
    overflow: 'hidden',
    zIndex: 100,
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#d4c8b0',
    borderBottom: '4px solid #bba882',
  },
  tabsContainer: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    paddingLeft: 4,
  },
  tabActive: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: '#fdf8e7',
    border: '3px solid #bba882',
    borderRadius: 12,
    cursor: 'default',
    color: '#333',
    boxShadow: '0 4px 0 #bba882',
    transform: 'translateY(-2px)',
    transition: 'all 0.1s',
  },
  tabInactive: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    padding: 0,
    background: '#bba882',
    border: '3px solid #a3906a',
    borderRadius: 12,
    cursor: 'pointer',
    color: '#333',
    boxShadow: '0 4px 0 #a3906a',
    transition: 'all 0.1s',
  },
  tabIcon: {
    fontSize: 18,
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))',
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: 800,
    textTransform: 'uppercase',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#E53935',
    border: '3px solid #fff',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    padding: 0,
  },
  body: {
    flex: 1,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    overflowY: 'auto',
    background: '#fdf8e7',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  chartArea: {
    width: '100%',
    flex: 1,
    minHeight: 250,
    background: '#fff',
    borderRadius: 12,
    border: '4px solid #d4c8b0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: 'inset 0 4px 6px rgba(0,0,0,0.1)',
  },
  tradeControl: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: '#e8dfc8',
    padding: 16,
    borderRadius: 16,
    border: '3px solid #d4c8b0',
  },
  inputGroupRow: {
    display: 'flex',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  inputLabel: {
    color: '#5C3A21',
    fontSize: 13,
    fontWeight: 800,
    textTransform: 'uppercase',
  },
  input: {
    background: '#fff',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    color: '#333',
    fontSize: 16,
    fontWeight: 700,
    outline: 'none',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
  },
  leverageToggleBtn: {
    width: '100%',
    background: '#fff',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '10px 12px',
    color: '#333',
    fontSize: 16,
    fontWeight: 800,
    outline: 'none',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 0 #d4c8b0',
  },
  sliderContainer: {
    background: '#fdf8e7',
    border: '3px solid #d4c8b0',
    borderRadius: 12,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    animation: 'slideDown 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
    transformOrigin: 'top',
  },
  sliderInput: {
    width: '100%',
    cursor: 'pointer',
    accentColor: '#E53935',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#a3906a',
    fontSize: 12,
    fontWeight: 700,
  },
  buttons: {
    display: 'flex',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    padding: '12px 6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64, 
    borderRadius: 16,
  },
  btnActionText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 900,
    textShadow: '0 2px 0 rgba(0,0,0,0.4)',
    lineHeight: 1,
  },
  btnActionSub: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: 800,
    textShadow: '0 1px 1px rgba(0,0,0,0.3)',
    textAlign: 'center',
    lineHeight: 1,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    textAlign: 'center',
    padding: 20,
    opacity: 0.6,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    filter: 'grayscale(100%)',
  },
  emptyTitle: {
    color: '#5C3A21',
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 8,
  },
  emptyDesc: {
    color: '#77573d',
    fontSize: 14,
    fontWeight: 600,
    maxWidth: 250,
    lineHeight: 1.4,
  },
};
