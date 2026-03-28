import { useState, memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSend, useUI } from '../hooks/useGodot';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePacifica } from '../hooks/usePacifica';
import { cartoonBtn } from '../styles/theme';
import TradingViewWidget from './TradingViewWidget';

const TABS = [
  { id: 'Trade', icon: '📈', label: 'Trade' },
  { id: 'Positions', icon: '💼', label: 'Positions' },
  { id: 'Orders', icon: '📋', label: 'Orders' },
  { id: 'Account', icon: '👤', label: 'Account' },
];

const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'SUI', 'TRUMP'];

function FuturesPanel() {
  const { setFuturesOpen } = useSend();
  const { connected } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const {
    walletAddr, account, positions, orders, prices, markets, walletUsdc, leverageSettings,
    loading, error, clearError, goldEarned,
    placeMarketOrder, placeLimitOrder, cancelOrder, setLeverage: setLeverageApi,
    closePosition, depositToPacifica, withdraw, setTpsl,
  } = usePacifica();

  const [activeTab, setActiveTab] = useState('Trade');
  const [symbol, setSymbol] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(() => leverageSettings[symbol] || 20);
  const [showLeverage, setShowLeverage] = useState(false);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [amountInUsdc, setAmountInUsdc] = useState(true);
  const [sizePct, setSizePct] = useState(0);
  const [expandedPos, setExpandedPos] = useState(null);
  const [closePct, setClosePct] = useState(100);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');

  const handleClose = useCallback(() => setFuturesOpen(false), [setFuturesOpen]);

  // Sync leverage from Pacifica settings when symbol changes or settings load
  useEffect(() => {
    if (leverageSettings[symbol]) setLeverage(leverageSettings[symbol]);
  }, [symbol, leverageSettings]);

  const currentPrice = useMemo(() => {
    return prices.find(p => p.symbol === symbol)?.mark || null;
  }, [prices, symbol]);

  const maxLev = useMemo(() => {
    return markets.find(m => m.symbol === symbol)?.max_leverage || 100;
  }, [markets, symbol]);

  const pacBalance = parseFloat(account?.balance || 0);

  // Convert USDC amount to token amount, rounded to lot size
  const lotSize = useMemo(() => {
    return markets.find(m => m.symbol === symbol)?.lot_size || '0.00001';
  }, [markets, symbol]);

  const tokenAmount = useMemo(() => {
    if (!amount || !currentPrice) return '';
    if (!amountInUsdc) return amount;
    const raw = parseFloat(amount) / parseFloat(currentPrice);
    const lot = parseFloat(lotSize);
    return String(Math.floor(raw / lot) * lot);
  }, [amount, currentPrice, amountInUsdc, lotSize]);

  const maxUsdc = pacBalance * leverage;

  const handleSizePct = useCallback((pct) => {
    setSizePct(pct);
    if (pacBalance > 0 && currentPrice) {
      const usdcVal = (maxUsdc * pct / 100).toFixed(2);
      setAmount(amountInUsdc ? usdcVal : String((parseFloat(usdcVal) / parseFloat(currentPrice)).toFixed(6)));
    }
  }, [pacBalance, currentPrice, maxUsdc, amountInUsdc]);

  const handleTrade = useCallback(async (side) => {
    const qty = amountInUsdc ? tokenAmount : amount;
    if (!qty || parseFloat(qty) <= 0) return;
    if (orderType === 'market') {
      await placeMarketOrder(symbol, side, qty, '0.5');
    } else {
      if (!limitPrice) return;
      await placeLimitOrder(symbol, side, limitPrice, qty, 'GTC');
    }
    setAmount('');
    setSizePct(0);
  }, [amount, tokenAmount, limitPrice, symbol, orderType, amountInUsdc, placeMarketOrder, placeLimitOrder]);

  const levTimerRef = useRef(null);
  const handleLeverageChange = useCallback((val) => {
    const v = Math.min(Number(val), maxLev);
    setLeverage(v);
    // Debounce — send to API only after 2s of no movement
    if (levTimerRef.current) clearTimeout(levTimerRef.current);
    levTimerRef.current = setTimeout(() => setLeverageApi(symbol, v), 2000);
  }, [maxLev, symbol, setLeverageApi]);

  // ==================== NOT CONNECTED ====================
  if (!connected) {
    return (
      <>
        <style>{animCSS}</style>
        <div style={S.container}>
          <div style={S.header}>
            <span style={S.headerTitle}>Futures Trading</span>
            <button onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{...S.body, alignItems: 'center', justifyContent: 'center', gap: 20}}>
            <div style={{fontSize: 48, filter: 'grayscale(60%)'}}>🔗</div>
            <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900, textAlign: 'center'}}>Connect Wallet to Trade</div>
            <button
              style={{...cartoonBtn('#9945FF', '#7B36CC'), padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 10}}
              onClick={() => openWalletModal(true)}
            >
              <span>CONNECT WALLET</span>
            </button>
          </div>
        </div>
      </>
    );
  }

  // ==================== TRADE TAB ====================
  const renderTrade = () => (
    <>
      <div style={S.chartArea}><TradingViewWidget symbol={symbol} /></div>

      {/* Symbol + balance */}
      <div style={S.row}>
        <button style={S.symbolBtn} onClick={() => setShowSymbolPicker(!showSymbolPicker)}>
          <span style={{fontSize: 18, fontWeight: 900}}>{symbol}</span>
          {currentPrice && <span style={{fontSize: 13, color: '#5C3A21', fontWeight: 700}}>${parseFloat(currentPrice).toLocaleString()}</span>}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div style={S.balBadge}>
          <span style={{fontSize: 9, fontWeight: 700, color: '#a3906a'}}>BALANCE</span>
          <span style={{fontSize: 15, fontWeight: 900, color: '#5C3A21'}}>${pacBalance.toFixed(2)}</span>
        </div>
      </div>

      {showSymbolPicker && (
        <div style={S.chips}>
          {POPULAR_SYMBOLS.map(s => (
            <button key={s} style={s === symbol ? S.chipActive : S.chip}
              onClick={() => { setSymbol(s); setShowSymbolPicker(false); }}>{s}</button>
          ))}
        </div>
      )}

      {/* Deposit/Withdraw row */}
      {pacBalance === 0 && (
        <div style={S.noBalanceHint} onClick={() => setActiveTab('Account')}>
          No balance — go to Account tab to deposit USDC
        </div>
      )}

      {/* Trade controls */}
      <div style={S.tradeBox}>
        <div style={S.row}>
          <button style={orderType === 'market' ? S.typeActive : S.typeBtn} onClick={() => setOrderType('market')}>Market</button>
          <button style={orderType === 'limit' ? S.typeActive : S.typeBtn} onClick={() => setOrderType('limit')}>Limit</button>
        </div>

        <div style={S.row}>
          <div style={{flex: 2, display: 'flex', flexDirection: 'column', gap: 3}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={S.label}>Amount</span>
              <button style={S.unitToggle} onClick={() => setAmountInUsdc(!amountInUsdc)}>
                {amountInUsdc ? 'USDC' : symbol}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{marginLeft: 3}}>
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              </button>
            </div>
            <input type="number" placeholder={amountInUsdc ? '100' : '0.01'} value={amount}
              onChange={e => { setAmount(e.target.value); setSizePct(0); }} style={S.input} />
          </div>
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 3}}>
            <span style={S.label}>Leverage</span>
            <button style={S.levBtn} onClick={() => setShowLeverage(!showLeverage)}>
              {leverage}x
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{transform: showLeverage ? 'rotate(180deg)' : '', transition: '0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        {/* Size slider — % of max buying power */}
        <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: 11, fontWeight: 700, color: '#a3906a'}}>
              {sizePct}% of ${maxUsdc.toFixed(0)} buying power
            </span>
            {amountInUsdc && amount && currentPrice && (
              <span style={{fontSize: 11, fontWeight: 700, color: '#5C3A21'}}>
                ≈ {parseFloat(tokenAmount).toFixed(6)} {symbol}
              </span>
            )}
          </div>
          <input type="range" min="0" max="100" step="5" value={sizePct}
            onChange={e => handleSizePct(Number(e.target.value))} style={S.slider} />
          <div style={S.sliderLabels}>
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>

        {orderType === 'limit' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
            <span style={S.label}>Limit Price</span>
            <input type="number" placeholder={currentPrice || '0'} value={limitPrice} onChange={e => setLimitPrice(e.target.value)} style={S.input} />
          </div>
        )}

        {/* Leverage modal */}
        {showLeverage && (
          <>
            <div style={S.levBackdrop} onClick={() => setShowLeverage(false)} />
            <div style={S.levModal}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span style={{fontSize: 16, fontWeight: 900, color: '#5C3A21'}}>Adjust Leverage</span>
                <button style={S.levCloseBtn} onClick={() => setShowLeverage(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{fontSize: 48, fontWeight: 900, color: '#5C3A21', textAlign: 'center', padding: '10px 0'}}>{leverage}x</div>
              <input type="range" min="1" max={maxLev} value={leverage} onChange={e => handleLeverageChange(e.target.value)} style={{...S.slider, accentColor: leverage > maxLev * 0.7 ? '#E53935' : '#4CAF50'}} />
              <div style={S.sliderLabels}><span>1x</span><span>{Math.floor(maxLev/4)}x</span><span>{Math.floor(maxLev/2)}x</span><span>{Math.floor(maxLev*3/4)}x</span><span>{maxLev}x</span></div>
              <div style={{display: 'flex', gap: 6, marginTop: 6}}>
                {[1, 5, 10, 20, 50].filter(v => v <= maxLev).map(v => (
                  <button key={v} style={leverage === v ? S.levPresetActive : S.levPreset}
                    onClick={() => handleLeverageChange(v)}>{v}x</button>
                ))}
              </div>
              {leverage > maxLev * 0.5 && (
                <div style={{fontSize: 11, color: '#E53935', fontWeight: 700, textAlign: 'center', marginTop: 4}}>
                  High leverage increases liquidation risk
                </div>
              )}
            </div>
          </>
        )}

        {error && <div style={S.errorBar} onClick={clearError}>{error}</div>}

        <div style={S.row}>
          <button style={{...cartoonBtn('#4CAF50','#2E7D32'), ...S.tradeBtn}} onClick={() => handleTrade('bid')} disabled={loading}>
            <span style={S.tradeBtnText}>{loading ? '...' : 'LONG'}</span>
          </button>
          <button style={{...cartoonBtn('#E53935','#B71C1C'), ...S.tradeBtn}} onClick={() => handleTrade('ask')} disabled={loading}>
            <span style={S.tradeBtnText}>{loading ? '...' : 'SHORT'}</span>
          </button>
        </div>
      </div>
    </>
  );

  // ==================== POSITIONS TAB ====================
  const renderPositions = () => {
    if (!positions.length) {
      return (
        <div style={S.empty}>
          <div style={{fontSize: 48, filter: 'grayscale(100%)'}}>💼</div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Positions</div>
        </div>
      );
    }
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {positions.map((pos, i) => {
          const mark = prices.find(p => p.symbol === pos.symbol)?.mark;
          const pnl = mark ? ((parseFloat(mark) - parseFloat(pos.entry_price)) * parseFloat(pos.amount) * (pos.side === 'bid' ? 1 : -1)).toFixed(2) : '—';
          const setLev = leverageSettings[pos.symbol] || '—';
          const posKey = `${pos.symbol}-${pos.side}`;
          const expanded = expandedPos?.startsWith(posKey) ? expandedPos.split(':')[1] : null;

          return (
            <div key={i} style={S.posCard}>
              <div style={S.row}>
                <span style={{fontSize: 16, fontWeight: 900}}>{pos.symbol}</span>
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  <span style={{fontSize: 11, fontWeight: 800, color: '#a3906a', background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{setLev}x</span>
                  <span style={{fontSize: 13, fontWeight: 900, color: pos.side === 'bid' ? '#4CAF50' : '#E53935'}}>
                    {pos.side === 'bid' ? 'LONG' : 'SHORT'}
                  </span>
                </div>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Size: {pos.amount}</span>
                <span style={S.detail}>Entry: ${parseFloat(pos.entry_price).toLocaleString()}</span>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Mark: {mark ? `$${parseFloat(mark).toLocaleString()}` : '—'}</span>
                <span style={{fontSize: 14, fontWeight: 900, color: parseFloat(pnl) >= 0 ? '#4CAF50' : '#E53935'}}>
                  PnL: ${pnl}
                </span>
              </div>

              {/* Action buttons */}
              <div style={{display: 'flex', gap: 6, marginTop: 4}}>
                <button style={S.btnRed} onClick={() => { setClosePct(100); setExpandedPos(expanded === 'close' ? null : `${posKey}:close`); }}>Close</button>
                <button style={S.btnBlue} onClick={() => setExpandedPos(expanded === 'tpsl' ? null : `${posKey}:tpsl`)}>TP/SL</button>
              </div>

              {/* Close slider */}
              {expanded === 'close' && (
                <div style={S.expandPanel}>
                  <div style={S.row}>
                    <span style={{fontSize: 13, fontWeight: 900, color: '#5C3A21'}}>Close {closePct}%</span>
                    <span style={{fontSize: 11, color: '#a3906a', fontWeight: 700}}>
                      {(parseFloat(pos.amount) * closePct / 100).toFixed(6)} {pos.symbol}
                    </span>
                  </div>
                  <input type="range" min="5" max="100" step="5" value={closePct} onChange={e => setClosePct(Number(e.target.value))} style={S.slider} />
                  <div style={S.sliderLabels}><span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                  <button style={{...S.btnRed, width: '100%'}} onClick={() => closePosition(pos.symbol, pos.side, String(parseFloat(pos.amount) * closePct / 100))} disabled={loading}>
                    {loading ? 'Closing...' : `Close ${closePct}%`}
                  </button>
                </div>
              )}

              {/* TP/SL */}
              {expanded === 'tpsl' && (
                <div style={{...S.expandPanel, ...S.row}}>
                  <input type="number" placeholder="TP Price" value={tpPrice} onChange={e => setTpPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                  <input type="number" placeholder="SL Price" value={slPrice} onChange={e => setSlPrice(e.target.value)} style={{...S.input, flex: 1, padding: '7px 8px', fontSize: 12}} />
                  <button style={S.btnBlue} onClick={async () => {
                    await setTpsl(pos.symbol, pos.side === 'bid' ? 'ask' : 'bid', tpPrice || null, slPrice || null);
                    setTpPrice(''); setSlPrice(''); setExpandedPos(null);
                  }} disabled={!tpPrice && !slPrice}>Set</button>
                </div>
              )}
            </div>
          );
        })}

        {error && <div style={S.errorBar} onClick={clearError}>{error}</div>}
      </div>
    );
  };

  // ==================== ORDERS TAB ====================
  const renderOrders = () => {
    if (!orders.length) {
      return (
        <div style={S.empty}>
          <div style={{fontSize: 48, filter: 'grayscale(100%)'}}>📋</div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Orders</div>
        </div>
      );
    }
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {orders.map((o, i) => (
          <div key={i} style={S.posCard}>
            <div style={S.row}>
              <span style={{fontSize: 16, fontWeight: 900}}>{o.symbol || o.s}</span>
              <span style={{fontSize: 13, fontWeight: 900, color: (o.side || o.d) === 'bid' ? '#4CAF50' : '#E53935'}}>
                {(o.side || o.d) === 'bid' ? 'BUY' : 'SELL'}
              </span>
              <button style={S.cancelBtn} onClick={() => cancelOrder(o.symbol || o.s, o.order_id || o.i)}>✕</button>
            </div>
            <div style={S.row}>
              <span style={S.detail}>Price: ${parseFloat(o.price || o.ip || 0).toLocaleString()}</span>
              <span style={S.detail}>Amount: {o.initial_amount || o.a}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ==================== RENDER ====================
  // ==================== ACCOUNT TAB ====================
  const renderAccount = () => {
    const equity = parseFloat(account?.account_equity || 0);
    const available = parseFloat(account?.available_to_withdraw || 0);
    const marginUsed = parseFloat(account?.total_margin_used || 0);

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {/* Wallet address */}
        <div style={S.posCard}>
          <div style={S.row}>
            <span style={S.label}>Connected Wallet</span>
            <span style={{fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#5C3A21'}}>
              {walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)}
            </span>
          </div>
        </div>

        {/* Wallet USDC */}
        <div style={S.posCard}>
          <div style={S.row}>
            <span style={S.label}>Wallet USDC</span>
            <span style={{fontSize: 18, fontWeight: 900, color: '#5C3A21'}}>
              ${walletUsdc !== null ? walletUsdc.toFixed(2) : '—'}
            </span>
          </div>
        </div>

        {/* Pacifica balances */}
        <div style={{display: 'flex', gap: 8}}>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Trading Balance</span>
            <span style={S.balCardValue}>${pacBalance.toFixed(2)}</span>
          </div>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Equity</span>
            <span style={S.balCardValue}>${equity.toFixed(2)}</span>
          </div>
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Margin Used</span>
            <span style={S.balCardValue}>${marginUsed.toFixed(2)}</span>
          </div>
          <div style={S.balCard}>
            <span style={S.balCardLabel}>Withdrawable</span>
            <span style={S.balCardValue}>${available.toFixed(2)}</span>
          </div>
        </div>

        {/* Deposit */}
        <div style={S.posCard}>
          <div style={S.row}>
            <span style={{...S.label, color: '#4CAF50'}}>Deposit USDC</span>
            {walletUsdc !== null && <span style={S.detail}>Wallet: ${walletUsdc.toFixed(2)}</span>}
          </div>
          <div style={{display: 'flex', gap: 6}}>
            <input type="number" placeholder="Min 10 USDC" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
              style={{...S.input, flex: 1, padding: '8px 10px', fontSize: 13}} />
            <button style={S.depositBtn} onClick={async () => {
              if (!depositAmt || parseFloat(depositAmt) < 10) return;
              const r = await depositToPacifica(depositAmt);
              if (!r?.error) setDepositAmt('');
            }} disabled={loading}>
              {loading ? '...' : 'Deposit'}
            </button>
          </div>
          <span style={{fontSize: 10, color: '#a3906a', fontWeight: 700}}>
            Sends USDC from your wallet to Pacifica. Needs ~0.005 SOL for gas.
          </span>
        </div>

        {/* Withdraw */}
        {available > 0 && (
          <div style={S.posCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#9945FF'}}>Withdraw USDC</span>
              <span style={S.detail}>Max: ${available.toFixed(2)}</span>
            </div>
            <div style={{display: 'flex', gap: 6}}>
              <input type="number" placeholder="Amount" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                style={{...S.input, flex: 1, padding: '8px 10px', fontSize: 13}} />
              <button style={S.btnSmall} onClick={() => setWithdrawAmt(String(Math.floor(available * 100) / 100))}>MAX</button>
              <button style={S.btnPurple} onClick={async () => {
                const r = await withdraw(withdrawAmt);
                if (!r?.error) setWithdrawAmt('');
              }} disabled={loading || !withdrawAmt}>
                {loading ? '...' : 'Withdraw'}
              </button>
            </div>
          </div>
        )}

        {/* Account stats */}
        <div style={S.posCard}>
          <span style={S.label}>Account Info</span>
          {[
            ['Positions', account?.positions_count || 0],
            ['Open Orders', account?.orders_count || 0],
            ['Fee Tier', account?.fee_level ?? '—'],
            ['Maker Fee', account?.maker_fee ? (parseFloat(account.maker_fee) * 100).toFixed(3) + '%' : '—'],
            ['Taker Fee', account?.taker_fee ? (parseFloat(account.taker_fee) * 100).toFixed(3) + '%' : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{...S.row, padding: '4px 0', borderBottom: '1px solid #d4c8b0'}}>
              <span style={S.detail}>{k}</span>
              <span style={{fontSize: 13, fontWeight: 800, color: '#5C3A21'}}>{v}</span>
            </div>
          ))}
        </div>

        {error && <div style={S.errorBar} onClick={clearError}>{error}</div>}
      </div>
    );
  };

  const renderContent = () => {
    if (activeTab === 'Trade') return renderTrade();
    if (activeTab === 'Positions') return renderPositions();
    if (activeTab === 'Orders') return renderOrders();
    if (activeTab === 'Account') return renderAccount();
  };

  return (
    <>
      <style>{animCSS}</style>
      <div style={S.container}>
        <div style={S.header}>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            {TABS.map(t => {
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={active ? S.tabActive : S.tabInactive}>
                  <span style={{fontSize: 16}}>{t.icon}</span>
                  {active && <span style={{fontSize: 14, fontWeight: 800}}>{t.label}</span>}
                </button>
              );
            })}
          </div>
          <button onClick={handleClose} style={S.closeBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="futures-panel-body" style={S.body}>
          <div key={activeTab} style={{animation: 'fadeIn 0.25s ease-out', display: 'flex', flexDirection: 'column', gap: 10, height: '100%'}}>
            {renderContent()}
          </div>
        </div>

        {/* Gold earned notification */}
        {goldEarned && (
          <div style={S.goldPopup}>
            <span style={S.goldIcon}>🪙</span>
            <span style={S.goldText}>+{goldEarned.amount.toLocaleString()} Gold</span>
            <span style={S.goldReason}>{goldEarned.reason}</span>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(FuturesPanel);

const animCSS = `
  .futures-panel-body::-webkit-scrollbar { display: none; }
  .futures-panel-body input[type=number]::-webkit-inner-spin-button,
  .futures-panel-body input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .futures-panel-body input[type=number] { -moz-appearance: textfield; }
  @keyframes slideDown { from { opacity:0; transform:scaleY(0.95); } to { opacity:1; transform:scaleY(1); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
`;

const S = {
  container: {
    position: 'absolute', top: 20, right: 20, bottom: 150, width: 400,
    background: '#e8dfc8', border: '6px solid #d4c8b0', borderRadius: 24,
    display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden', zIndex: 100,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
  },
  headerTitle: { fontSize: 16, fontWeight: 900, color: '#5C3A21' },
  tabActive: {
    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
    background: '#fdf8e7', border: '3px solid #bba882', borderRadius: 12,
    color: '#333', boxShadow: '0 3px 0 #bba882', transform: 'translateY(-1px)', cursor: 'default',
  },
  tabInactive: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40,
    background: '#bba882', border: '3px solid #a3906a', borderRadius: 12,
    color: '#333', boxShadow: '0 3px 0 #a3906a', cursor: 'pointer',
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#E53935', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
  },
  body: {
    flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto', background: '#fdf8e7', scrollbarWidth: 'none',
  },
  // Common
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: '#5C3A21', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' },
  detail: { fontSize: 12, fontWeight: 700, color: '#77573d' },
  input: {
    background: '#fff', border: '3px solid #d4c8b0', borderRadius: 10,
    padding: '9px 10px', color: '#333', fontSize: 15, fontWeight: 700, outline: 'none',
  },
  errorBar: {
    background: '#E5393520', border: '2px solid #E53935', borderRadius: 8,
    padding: '7px 10px', color: '#B71C1C', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flex: 1, gap: 12, opacity: 0.5,
  },
  // Trade
  chartArea: {
    width: '100%', flex: 1, minHeight: 200, background: '#fff', borderRadius: 12,
    border: '4px solid #d4c8b0', overflow: 'hidden', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)',
  },
  symbolBtn: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 10, cursor: 'pointer', color: '#333',
  },
  balBadge: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    padding: '3px 10px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
  },
  chips: {
    display: 'flex', flexWrap: 'wrap', gap: 5, padding: 8,
    background: '#e8dfc8', borderRadius: 10, border: '2px solid #d4c8b0', animation: 'slideDown 0.2s',
  },
  chip: {
    padding: '5px 10px', background: '#fdf8e7', border: '2px solid #d4c8b0',
    borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#5C3A21',
  },
  chipActive: {
    padding: '5px 10px', background: '#4CAF50', border: '2px solid #2E7D32',
    borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#fff',
  },
  depositRow: {
    display: 'flex', gap: 6, background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 10, padding: 8,
  },
  depositBtn: {
    padding: '8px 14px', background: '#4CAF50', border: '2px solid #2E7D32', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer',
  },
  tradeBox: {
    display: 'flex', flexDirection: 'column', gap: 10, background: '#e8dfc8',
    padding: 12, borderRadius: 14, border: '3px solid #d4c8b0',
  },
  typeBtn: {
    flex: 1, padding: '7px', background: '#d4c8b0', border: '2px solid #bba882',
    borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12, color: '#5C3A21', textTransform: 'uppercase',
  },
  typeActive: {
    flex: 1, padding: '7px', background: '#fdf8e7', border: '2px solid #bba882',
    borderRadius: 8, fontWeight: 800, fontSize: 12, color: '#333', textTransform: 'uppercase',
    boxShadow: '0 2px 0 #bba882',
  },
  levBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300,
  },
  levModal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 320, background: '#fdf8e7', border: '6px solid #d4c8b0', borderRadius: 20,
    padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: '0 15px 40px rgba(0,0,0,0.4)', zIndex: 301,
    fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  levCloseBtn: {
    width: 28, height: 28, borderRadius: '50%', background: '#E53935', border: '2px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  levPreset: {
    flex: 1, padding: '8px 0', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
    fontWeight: 800, fontSize: 13, color: '#5C3A21', cursor: 'pointer', textAlign: 'center',
  },
  levPresetActive: {
    flex: 1, padding: '8px 0', background: '#4CAF50', border: '2px solid #2E7D32', borderRadius: 8,
    fontWeight: 800, fontSize: 13, color: '#fff', cursor: 'pointer', textAlign: 'center',
    boxShadow: '0 2px 0 #2E7D32',
  },
  unitToggle: {
    padding: '2px 8px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 6,
    fontSize: 10, fontWeight: 800, color: '#5C3A21', cursor: 'pointer', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center',
  },
  levBtn: {
    width: '100%', background: '#fff', border: '3px solid #d4c8b0', borderRadius: 10,
    padding: '9px 10px', color: '#333', fontSize: 15, fontWeight: 800, cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  sliderBox: {
    background: '#fdf8e7', border: '2px solid #d4c8b0', borderRadius: 10, padding: 10,
    display: 'flex', flexDirection: 'column', gap: 6, animation: 'slideDown 0.2s',
  },
  slider: { width: '100%', cursor: 'pointer', accentColor: '#E53935' },
  sliderLabels: { display: 'flex', justifyContent: 'space-between', color: '#a3906a', fontSize: 11, fontWeight: 700 },
  tradeBtn: { flex: 1, padding: '11px 6px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tradeBtnText: { color: '#fff', fontSize: 20, fontWeight: 900, textShadow: '0 2px 0 rgba(0,0,0,0.4)' },
  // Positions
  posCard: {
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5,
  },
  expandPanel: {
    display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
    animation: 'slideDown 0.2s ease-out',
  },
  btnRed: {
    flex: 1, padding: '8px', background: '#E53935', border: '2px solid #B71C1C', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #B71C1C', textAlign: 'center',
  },
  btnBlue: {
    padding: '8px 12px', background: '#1E88E5', border: '2px solid #1565C0', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #1565C0',
  },
  btnPurple: {
    padding: '8px 12px', background: '#9945FF', border: '2px solid #7B36CC', borderRadius: 8,
    color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 0 #7B36CC',
  },
  btnSmall: {
    padding: '8px 10px', background: '#d4c8b0', border: '2px solid #bba882', borderRadius: 8,
    fontWeight: 800, fontSize: 12, color: '#5C3A21', cursor: 'pointer',
  },
  noBalanceHint: {
    padding: '8px 12px', background: '#FFF3E0', border: '2px solid #FF9800', borderRadius: 8,
    color: '#E65100', fontSize: 12, fontWeight: 700, textAlign: 'center', cursor: 'pointer',
  },
  balCard: {
    flex: 1, background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  balCardLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', textTransform: 'uppercase' },
  balCardValue: { fontSize: 18, fontWeight: 900, color: '#5C3A21' },
  cancelBtn: {
    width: 26, height: 26, borderRadius: '50%', background: '#E53935', border: '2px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, padding: 0,
  },
  goldPopup: {
    position: 'absolute', bottom: 12, left: 12, right: 12,
    background: 'linear-gradient(135deg, #FFD700 0%, #FFA000 100%)',
    border: '3px solid #E65100', borderRadius: 14,
    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
    boxShadow: '0 6px 20px rgba(255,160,0,0.4)',
    animation: 'fadeIn 0.3s ease-out',
  },
  goldIcon: { fontSize: 28 },
  goldText: { fontSize: 18, fontWeight: 900, color: '#5C3A21', textShadow: '0 1px 0 rgba(255,255,255,0.5)' },
  goldReason: { fontSize: 11, fontWeight: 700, color: '#7B5B00', marginLeft: 'auto' },
};
