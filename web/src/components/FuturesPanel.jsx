import { useState, memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSend, useUI } from '../hooks/useGodot';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { usePacifica } from '../hooks/usePacifica';
import { cartoonBtn } from '../styles/theme';
import TradingViewWidget from './TradingViewWidget';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import FundingHistory from './FundingHistory';
import FilterPopup from './FilterPopup';
import pacificaLogo from '../assets/pacifica.png';

const TABS = [
  { id: 'Trade', icon: <svg className="tab-icon-trade" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path className="trend-line" d="m19 9-5 5-4-4-3 3"/></svg>, label: 'Trade' },
  { id: 'Positions', icon: <svg className="tab-icon-positions" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect className="briefcase-body" width="20" height="14" x="2" y="7" rx="2" ry="2"/><path className="handle" d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, label: 'Positions' },
  { id: 'Orders', icon: <svg className="tab-icon-orders" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line className="order-line" x1="8" y1="6" x2="21" y2="6"/><line className="order-line" x1="8" y1="12" x2="21" y2="12"/><line className="order-line" x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>, label: 'Orders' },
  { id: 'Account', icon: <svg className="tab-icon-account" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path className="avatar-body" d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle className="avatar-head" cx="12" cy="7" r="4"/></svg>, label: 'Account' },
];

const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'SUI', 'TRUMP'];

function FuturesPanel() {
  const { setFuturesOpen } = useSend();
  const { connected } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const {
    walletAddr, account, positions, orders, prices, markets, walletUsdc, leverageSettings, marginModes,
    loading, error, clearError, goldEarned, clearGoldEarned,
    placeMarketOrder, placeLimitOrder, cancelOrder, setLeverage: setLeverageApi,
    closePosition, depositToPacifica, withdraw, setTpsl, setMarginMode,
  } = usePacifica();

  // Drag state — ref-based: zero React re-renders during drag, no listener leaks
  const posRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('[data-nodrag]')) return;
    const startX = e.clientX - posRef.current.x;
    const startY = e.clientY - posRef.current.y;

    const onMove = (ev) => {
      posRef.current = { x: ev.clientX - startX, y: ev.clientY - startY };
      if (panelRef.current) {
        panelRef.current.style.transform =
          `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
      }
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    setIsDragging(true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

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
  const [fullscreen, setFullscreen] = useState(false);
  const [bottomTab, setBottomTab] = useState('positions');
  const [showFilter, setShowFilter] = useState(false);
  const defaultFilters = { symbol: 'All', side: 'All', sortBy: 'time', sortDir: 'desc' };
  const [btmFilters, setBtmFilters] = useState(defaultFilters);

  // Resizable panel sizes (percentages / pixels)
  const [bottomH, setBottomH] = useState(160);       // bottom panel height in px
  const [obWidth, setObWidth] = useState(160);        // orderbook width in px
  const [chartPct, setChartPct] = useState(55);       // chart width as % of (chart + orderbook + controls)

  const useDrag = (onDrag) => {
    return useCallback((e) => {
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const onMove = (ev) => onDrag(ev.clientX - startX, ev.clientY - startY, ev);
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }, [onDrag]);
  };

  const dragBottom = useDrag(useCallback((dx, dy) => {
    setBottomH(prev => Math.max(60, Math.min(500, prev - dy)));
  }, []));

  const dragOb = useDrag(useCallback((dx) => {
    setObWidth(prev => Math.max(80, Math.min(350, prev + dx)));
  }, []));

  const dragChart = useDrag(useCallback((dx, dy, ev) => {
    const container = panelRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = ((ev.clientX - rect.left) / rect.width) * 100;
    setChartPct(Math.max(20, Math.min(70, pct)));
  }, []));

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
        <div ref={panelRef} style={{
          ...(fullscreen ? S.containerFull : S.container),
          transform: fullscreen ? 'translate(0px, 0px)' : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
          transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={S.header} onMouseDown={handleMouseDown}>
            <span style={S.headerTitle}>Futures Trading</span>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
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

  // ==================== TRADE CONTROLS (reusable) ====================
  const renderTradeControls = () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8, ...(fullscreen ? {width: '100%', overflowY: 'auto', overflowX: 'hidden', padding: 10, scrollbarWidth: 'none'} : {})}}>
      {/* Symbol + margin mode + balance */}
      <div style={S.row}>
        <button style={S.symbolBtn} onClick={() => setShowSymbolPicker(!showSymbolPicker)}>
          <span style={{fontSize: 18, fontWeight: 900}}>{symbol}</span>
          {currentPrice && <span style={{fontSize: 13, color: '#5C3A21', fontWeight: 700}}>${parseFloat(currentPrice).toLocaleString()}</span>}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button style={S.marginSwapBtn} onClick={() => setMarginMode(symbol, !marginModes[symbol])}>
          <span style={{color: marginModes[symbol] ? '#FF9800' : '#4CAF50', fontWeight: 900}}>
            {marginModes[symbol] ? 'Isolated' : 'Cross'}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{marginLeft: 3}}>
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
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
    </div>
  );

  // ==================== BOTTOM PANEL (fullscreen) ====================
  const btmSymbols = useMemo(() => {
    const syms = new Set();
    positions.forEach(p => syms.add(p.symbol));
    orders.forEach(o => syms.add(o.symbol || o.s));
    POPULAR_SYMBOLS.forEach(s => syms.add(s));
    return [...syms].sort();
  }, [positions, orders]);

  const sortOptionsForTab = useMemo(() => {
    if (bottomTab === 'positions') return [
      { value: 'symbol', label: 'Symbol' }, { value: 'size', label: 'Size' }, { value: 'pnl', label: 'PnL' },
    ];
    if (bottomTab === 'orders') return [
      { value: 'symbol', label: 'Symbol' }, { value: 'price', label: 'Price' },
    ];
    if (bottomTab === 'history') return [
      { value: 'time', label: 'Time' }, { value: 'symbol', label: 'Symbol' }, { value: 'size', label: 'Size' }, { value: 'price', label: 'Price' },
    ];
    if (bottomTab === 'funding') return [
      { value: 'time', label: 'Time' }, { value: 'symbol', label: 'Symbol' }, { value: 'amount', label: 'Amount' },
    ];
    return [{ value: 'time', label: 'Time' }];
  }, [bottomTab]);

  // Apply filters to positions
  const filteredPositions = useMemo(() => {
    let list = positions;
    if (btmFilters.symbol !== 'All') list = list.filter(p => p.symbol === btmFilters.symbol);
    if (btmFilters.side !== 'All') {
      const wantBid = btmFilters.side === 'Long';
      list = list.filter(p => wantBid ? p.side === 'bid' : p.side === 'ask');
    }
    const dir = btmFilters.sortDir === 'asc' ? 1 : -1;
    if (btmFilters.sortBy === 'symbol') list = [...list].sort((a, b) => dir * a.symbol.localeCompare(b.symbol));
    else if (btmFilters.sortBy === 'size') list = [...list].sort((a, b) => dir * (parseFloat(b.amount) * parseFloat(prices.find(pr => pr.symbol === b.symbol)?.mark || 0) - parseFloat(a.amount) * parseFloat(prices.find(pr => pr.symbol === a.symbol)?.mark || 0)));
    else if (btmFilters.sortBy === 'pnl') list = [...list].sort((a, b) => {
      const pnl = (p) => { const m = parseFloat(prices.find(pr => pr.symbol === p.symbol)?.mark || 0); return m ? (m - parseFloat(p.entry_price)) * parseFloat(p.amount) * (p.side === 'bid' ? 1 : -1) : 0; };
      return dir * (pnl(b) - pnl(a));
    });
    return list;
  }, [positions, btmFilters, prices]);

  // Apply filters to orders
  const filteredOrders = useMemo(() => {
    let list = orders;
    if (btmFilters.symbol !== 'All') list = list.filter(o => (o.symbol || o.s) === btmFilters.symbol);
    if (btmFilters.side !== 'All') {
      const wantBid = btmFilters.side === 'Long';
      list = list.filter(o => { const s = o.side || o.d; return wantBid ? s === 'bid' : s === 'ask'; });
    }
    const dir = btmFilters.sortDir === 'asc' ? 1 : -1;
    if (btmFilters.sortBy === 'symbol') list = [...list].sort((a, b) => dir * (a.symbol || a.s || '').localeCompare(b.symbol || b.s || ''));
    else if (btmFilters.sortBy === 'price') list = [...list].sort((a, b) => dir * (parseFloat(b.price || b.ip || 0) - parseFloat(a.price || a.ip || 0)));
    return list;
  }, [orders, btmFilters]);

  const hasActiveFilters = btmFilters.symbol !== 'All' || btmFilters.side !== 'All';

  const renderBottomPanel = () => {
    const tabs = [
      { id: 'positions', label: `Positions (${positions.length})` },
      { id: 'orders', label: `Orders (${orders.length})` },
      { id: 'history', label: 'History' },
      { id: 'funding', label: 'Funding' },
    ];

    return (
      <div style={{...S.bottomPanel, height: bottomH}}>
        <div style={{...S.bottomTabs, position: 'relative'}}>
          {tabs.map(t => (
            <button key={t.id} style={bottomTab === t.id ? S.bottomTabActive : S.bottomTabBtn} onClick={() => { setBottomTab(t.id); setShowFilter(false); }}>
              {t.label}
            </button>
          ))}
          <button
            style={{...S.filterBtn, ...(hasActiveFilters ? S.filterBtnActive : {})}}
            onClick={() => setShowFilter(v => !v)}
            title="Filters"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46"/></svg>
            {hasActiveFilters && <span style={S.filterDot} />}
          </button>
          <FilterPopup
            visible={showFilter}
            onClose={() => setShowFilter(false)}
            filters={btmFilters}
            onChange={setBtmFilters}
            symbols={btmSymbols}
            showSide={bottomTab !== 'funding' || true}
            sortOptions={sortOptionsForTab}
          />
        </div>
        <div style={S.bottomContent}>
          {bottomTab === 'positions' && (
            filteredPositions.length ? (
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Symbol</th><th style={S.th}>Side</th><th style={S.th}>Size</th>
                  <th style={S.th}>Entry</th><th style={S.th}>Mark</th><th style={S.th}>PnL</th>
                  <th style={S.th}>PnL %</th><th style={S.th}>Lev</th><th style={S.th}></th>
                </tr></thead>
                <tbody>{filteredPositions.map((p, i) => {
                  const mark = prices.find(pr => pr.symbol === p.symbol)?.mark;
                  const entryPrice = parseFloat(p.entry_price);
                  const markPrice = mark ? parseFloat(mark) : 0;
                  const tblAmt = parseFloat(p.amount);
                  const tblMargin = parseFloat(p.margin || 0);
                  const pnlVal = markPrice ? (markPrice - entryPrice) * tblAmt * (p.side === 'bid' ? 1 : -1) : 0;
                  const lev = (tblMargin > 0 && entryPrice > 0 && tblAmt > 0) ? Math.round((tblAmt * entryPrice) / tblMargin) : (leverageSettings[p.symbol] || 1);
                  const tblPosValue = markPrice ? tblAmt * markPrice : tblAmt * entryPrice;
                  const pnlPct = entryPrice && markPrice ? ((markPrice - entryPrice) / entryPrice * 100 * (p.side === 'bid' ? 1 : -1) * (typeof lev === 'number' ? lev : 1)) : 0;
                  const pnlColor = pnlVal >= 0 ? '#4CAF50' : '#E53935';
                  return (
                    <tr key={i} style={S.tr}>
                      <td style={S.td}>{p.symbol}</td>
                      <td style={{...S.td, color: p.side === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{p.side === 'bid' ? 'LONG' : 'SHORT'}</td>
                      <td style={S.td}>{p.amount} <span style={{color: '#a3906a', fontSize: 11}}>(${tblPosValue.toFixed(2)})</span></td>
                      <td style={S.td}>${entryPrice.toLocaleString()}</td>
                      <td style={S.td}>{markPrice ? `$${markPrice.toLocaleString()}` : '—'}</td>
                      <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)}</td>
                      <td style={{...S.td, color: pnlColor, fontWeight: 900}}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</td>
                      <td style={S.td}>{lev}x</td>
                      <td style={S.td}>
                        <button style={S.tblCloseBtn} onClick={() => closePosition(p.symbol, p.side, p.amount)}>Close</button>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            ) : <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>{hasActiveFilters ? 'No positions match filters' : 'No open positions'}</div>
          )}
          {bottomTab === 'orders' && (
            filteredOrders.length ? (
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Symbol</th><th style={S.th}>Side</th><th style={S.th}>Type</th>
                  <th style={S.th}>Price</th><th style={S.th}>Amount</th><th style={S.th}></th>
                </tr></thead>
                <tbody>{filteredOrders.map((o, i) => {
                  const sym = o.symbol || o.s;
                  const side = o.side || o.d;
                  const rawPrice = parseFloat(o.price || o.ip || 0);
                  const stopPrice = parseFloat(o.stop_price || o.sp || 0);
                  const price = rawPrice > 0 ? rawPrice : stopPrice;
                  const rawAmt = o.initial_amount || o.amount || o.a;
                  const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full';
                  const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
                  const isTP = type.includes('TAKE') || type.includes('TP');
                  const isSL = type.includes('STOP LOSS') || type.includes('SL');
                  const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
                  return (
                    <tr key={i} style={S.tr}>
                      <td style={S.td}>{sym}</td>
                      <td style={{...S.td, color: side === 'bid' ? '#4CAF50' : '#E53935', fontWeight: 900}}>{side === 'bid' ? 'BUY' : 'SELL'}</td>
                      <td style={{...S.td, color: typeColor, fontWeight: 700}}>{type}</td>
                      <td style={S.td}>${price.toLocaleString()}</td>
                      <td style={S.td}>{amt}</td>
                      <td style={S.td}>
                        <button style={S.tblCloseBtn} onClick={() => cancelOrder(sym, o.order_id || o.i)}>Cancel</button>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            ) : <div style={{padding: 20, textAlign: 'center', color: '#a3906a'}}>{hasActiveFilters ? 'No orders match filters' : 'No open orders'}</div>
          )}
          {bottomTab === 'history' && (
            <TradeHistory walletAddr={walletAddr} filters={btmFilters} />
          )}
          {bottomTab === 'funding' && (
            <FundingHistory walletAddr={walletAddr} filters={btmFilters} />
          )}
        </div>
      </div>
    );
  };

  // ==================== TRADE TAB ====================
  const renderTrade = () => {
    // Funding rate badge (top-right of chart)
    const mkt = markets.find(m => m.symbol === symbol);
    const fr = mkt ? parseFloat(mkt.funding_rate || 0) : null;
    const nfr = mkt ? parseFloat(mkt.next_funding_rate || 0) : null;
    const fundingBadge = mkt ? (
      <div style={S.fundingOverlay}>
        <span style={S.fundingOLabel}>FUNDING</span>
        <span style={{...S.fundingOValue, color: fr >= 0 ? '#4CAF50' : '#E53935'}}>
          {fr >= 0 ? '+' : ''}{(fr * 100).toFixed(4)}%
        </span>
      </div>
    ) : null;

    if (fullscreen) {
      return (
        <div style={{display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden'}}>
          {/* Top: chart + orderbook + controls */}
          <div style={{display: 'flex', flex: 1, overflow: 'hidden'}}>
            <div style={{flex: `0 0 ${chartPct}%`, maxWidth: `${chartPct}%`, position: 'relative'}}>
              <TradingViewWidget symbol={symbol} positions={positions} orders={orders} currentPrice={currentPrice} />
              {fundingBadge}
            </div>
            {/* Drag handle: chart ↔ orderbook */}
            <div style={S.dragHandleV} onMouseDown={dragChart} />
            <div style={{flex: `0 0 ${obWidth}px`, overflow: 'hidden'}}>
              <OrderBook symbol={symbol} />
            </div>
            {/* Drag handle: orderbook ↔ controls */}
            <div style={S.dragHandleV} onMouseDown={dragOb} />
            <div style={{flex: 1, minWidth: 0, overflow: 'hidden'}}>{renderTradeControls()}</div>
          </div>
          {/* Drag handle: top ↔ bottom */}
          <div style={S.dragHandleH} onMouseDown={dragBottom} />
          {/* Bottom: positions/orders panel */}
          {renderBottomPanel()}
        </div>
      );
    }
    // Normal layout: chart top, controls bottom
    return (
      <>
        <div style={{...S.chartArea, position: 'relative'}}>
          <TradingViewWidget symbol={symbol} positions={positions} orders={orders} currentPrice={currentPrice} />
          {fundingBadge}
        </div>
        {renderTradeControls()}
      </>
    );
  };

  // ==================== POSITIONS TAB ====================
  const renderPositions = () => {
    if (!positions.length) {
      return (
        <div style={S.empty}>
          <div style={{opacity: 0.3, color: '#5C3A21'}}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Positions</div>
        </div>
      );
    }
    return (
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start'}}>
        {positions.map((pos, i) => {
          const mark = prices.find(p => p.symbol === pos.symbol)?.mark;
          const entryP = parseFloat(pos.entry_price);
          const markP = mark ? parseFloat(mark) : 0;
          const amt = parseFloat(pos.amount);
          const margin = parseFloat(pos.margin || 0);
          const pnlVal = markP ? (markP - entryP) * amt * (pos.side === 'bid' ? 1 : -1) : 0;
          const setLev = (margin > 0 && entryP > 0 && amt > 0) ? Math.round((amt * entryP) / margin) : (leverageSettings[pos.symbol] || 1);
          const posValueUsd = markP ? amt * markP : amt * entryP;
          const pnlPct = entryP && markP ? ((markP - entryP) / entryP * 100 * (pos.side === 'bid' ? 1 : -1) * (typeof setLev === 'number' ? setLev : 1)) : 0;
          const pnlColor = pnlVal >= 0 ? '#4CAF50' : '#E53935';
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
                <span style={S.detail}>Size: {pos.amount} <span style={{color: '#a3906a'}}>(${posValueUsd.toFixed(2)})</span></span>
                <span style={S.detail}>Entry: ${parseFloat(pos.entry_price).toLocaleString()}</span>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Mark: {markP ? `$${markP.toLocaleString()}` : '—'}</span>
                <span style={{fontSize: 14, fontWeight: 900, color: pnlColor}}>
                  {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
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
          <div style={{opacity: 0.3, color: '#5C3A21'}}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </div>
          <div style={{color: '#5C3A21', fontSize: 18, fontWeight: 900}}>No Orders</div>
        </div>
      );
    }
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {orders.map((o, i) => {
          const sym = o.symbol || o.s;
          const side = o.side || o.d;
          const rawPrice = parseFloat(o.price || o.ip || 0);
          const stopPrice = parseFloat(o.stop_price || o.sp || 0);
          const price = rawPrice > 0 ? rawPrice : stopPrice;
          const rawAmt = o.initial_amount || o.amount || o.a;
          const amt = parseFloat(rawAmt || 0) > 0 ? rawAmt : 'Full position';
          const type = (o.order_type || o.ot || (stopPrice > 0 ? 'stop' : 'limit')).toUpperCase().replace(/_/g, ' ');
          const isBid = side === 'bid';
          const isTP = type.includes('TAKE') || type.includes('TP');
          const isSL = type.includes('STOP LOSS') || type.includes('SL');
          const typeColor = isTP ? '#4CAF50' : isSL ? '#E53935' : '#a3906a';
          return (
            <div key={i} style={S.posCard}>
              <div style={S.row}>
                <span style={{fontSize: 16, fontWeight: 900}}>{sym}</span>
                <span style={{fontSize: 10, fontWeight: 800, color: typeColor, background: '#fdf8e7', padding: '2px 6px', borderRadius: 5, border: '1px solid #d4c8b0'}}>{type}</span>
                <span style={{fontSize: 13, fontWeight: 900, color: isBid ? '#4CAF50' : '#E53935'}}>
                  {isBid ? 'BUY' : 'SELL'}
                </span>
                <button style={S.cancelBtn} onClick={() => cancelOrder(sym, o.order_id || o.i)}>✕</button>
              </div>
              <div style={S.row}>
                <span style={S.detail}>Price: ${parseFloat(price).toLocaleString()}</span>
                <span style={S.detail}>Amount: {amt}</span>
              </div>
            </div>
          );
        })}
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
        <div style={S.fullCard}>
          <div style={S.row}>
            <span style={S.label}>Connected Wallet</span>
            <span style={{fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#5C3A21'}}>
              {walletAddr?.slice(0, 6)}...{walletAddr?.slice(-4)}
            </span>
          </div>
        </div>

        {/* Wallet USDC */}
        <div style={S.fullCard}>
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
        <div style={S.fullCard}>
          <div style={S.row}>
            <span style={{...S.label, color: '#4CAF50'}}>Deposit USDC</span>
            {walletUsdc !== null && <span style={S.detail}>Wallet: ${walletUsdc.toFixed(2)}</span>}
          </div>
          <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
            <input type="number" placeholder="Min 10 USDC" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
              style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
            <button style={{...S.depositBtn, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={async () => {
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
          <div style={S.fullCard}>
            <div style={S.row}>
              <span style={{...S.label, color: '#9945FF'}}>Withdraw USDC</span>
              <span style={S.detail}>Max: ${available.toFixed(2)}</span>
            </div>
            <div style={{display: 'flex', gap: 6, alignItems: 'stretch'}}>
              <input type="number" placeholder="Amount" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                style={{...S.input, flex: 3, minWidth: 0, padding: '8px 10px', fontSize: 13}} />
              <button style={{...S.btnSmall, flex: 1, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={() => setWithdrawAmt(String(Math.floor(available * 100) / 100))}>MAX</button>
              <button style={{...S.btnPurple, flex: 2, whiteSpace: 'nowrap', padding: '8px 4px'}} onClick={async () => {
                const r = await withdraw(withdrawAmt);
                if (!r?.error) setWithdrawAmt('');
              }} disabled={loading || !withdrawAmt}>
                {loading ? '...' : 'Withdraw'}
              </button>
            </div>
          </div>
        )}

        {/* Account stats */}
        <div style={S.fullCard}>
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
      <div ref={panelRef} style={{
        ...(fullscreen ? S.containerFull : S.container),
        transform: fullscreen ? 'translate(0px, 0px)' : `translate(${posRef.current.x}px, ${posRef.current.y}px)`,
        transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div style={S.header} onMouseDown={handleMouseDown}>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            {TABS.map(t => {
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} className={`tab-btn ${active ? 'active' : ''}`} style={active ? S.tabActive : S.tabInactive}>
                  {t.icon}
                  {active && <span style={{fontSize: 14, fontWeight: 800}}>{t.label}</span>}
                </button>
              );
            })}
          </div>
          <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
            <button data-nodrag onClick={() => setFullscreen(!fullscreen)} style={S.headerBtn} title={fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
              {fullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              )}
            </button>
            <button data-nodrag onClick={handleClose} style={S.closeBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="futures-panel-body" style={S.body}>
          <div key={activeTab} style={{animation: 'fadeIn 0.25s ease-out', display: 'flex', flexDirection: 'column', gap: 10, height: '100%'}}>
            {renderContent()}
          </div>
        </div>

        {/* Powered by Pacifica footer */}
        <div style={S.pacificaFooter}>
          <img src={pacificaLogo} alt="Pacifica" style={S.pacificaLogo} />
          <span style={S.pacificaText}>Powered by</span>
          <span style={S.pacificaBrand}>Pacifica</span>
        </div>

        {/* Gold earned notification */}
        {goldEarned && (
          <div style={S.goldPopup}>
            <div style={{...S.goldIcon, color: '#FFD700'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </div>
            <span style={S.goldText}>+{goldEarned.amount.toLocaleString()} Gold</span>
            <span style={S.goldReason}>{goldEarned.reason}</span>
            <button style={S.goldClose} onClick={() => clearGoldEarned()}>✕</button>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(FuturesPanel);

const animCSS = `
  .futures-panel-body::-webkit-scrollbar { display: none; }
  .futures-panel-body { overflow-x: hidden !important; }
  .futures-panel-body input[type=number]::-webkit-inner-spin-button,
  .futures-panel-body input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .futures-panel-body input[type=number] { -moz-appearance: textfield; }
  @keyframes slideDown { from { opacity:0; transform:scaleY(0.95); } to { opacity:1; transform:scaleY(1); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }

  /* Tab Icon Animations */
  @keyframes drawLine {
    0% { stroke-dashoffset: 20; }
    100% { stroke-dashoffset: 0; }
  }
  .tab-icon-trade .trend-line { stroke-dasharray: 20; stroke-dashoffset: 0; }
  .tab-btn:hover .tab-icon-trade .trend-line, .tab-btn.active .tab-icon-trade .trend-line {
    animation: drawLine 0.6s ease-out forwards;
  }
  
  @keyframes briefcase-pop {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.1, 0.9) translateY(2px); }
  }
  @keyframes handle-pop {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .tab-icon-positions .handle { transform-origin: center; }
  .tab-icon-positions .briefcase-body { transform-origin: bottom center; }
  .tab-btn:hover .tab-icon-positions .handle, .tab-btn.active .tab-icon-positions .handle {
    animation: handle-pop 0.5s ease;
  }
  .tab-btn:hover .tab-icon-positions .briefcase-body, .tab-btn.active .tab-icon-positions .briefcase-body {
    animation: briefcase-pop 0.5s ease;
  }

  @keyframes order-slide {
    0% { transform: translateX(-6px); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
  }
  .tab-icon-orders .order-line { opacity: 1; }
  .tab-btn:hover .tab-icon-orders .order-line, .tab-btn.active .tab-icon-orders .order-line {
    animation: order-slide 0.4s both;
  }
  .tab-btn:hover .tab-icon-orders .order-line:nth-child(2), .tab-btn.active .tab-icon-orders .order-line:nth-child(2) { animation-delay: 0.1s; }
  .tab-btn:hover .tab-icon-orders .order-line:nth-child(3), .tab-btn.active .tab-icon-orders .order-line:nth-child(3) { animation-delay: 0.2s; }
  
  @keyframes head-bob {
    0%, 100% { transform: translateY(0) rotate(0); }
    25% { transform: translateY(-2px) rotate(-10deg); }
    75% { transform: translateY(-2px) rotate(10deg); }
  }
  @keyframes body-shrug {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.9); }
  }
  .tab-icon-account .avatar-head { transform-origin: center 7px; }
  .tab-icon-account .avatar-body { transform-origin: bottom center; }
  .tab-btn:hover .tab-icon-account .avatar-head, .tab-btn.active .tab-icon-account .avatar-head {
    animation: head-bob 0.6s ease-in-out;
  }
  .tab-btn:hover .tab-icon-account .avatar-body, .tab-btn.active .tab-icon-account .avatar-body {
    animation: body-shrug 0.6s ease-in-out;
  }
`;

const S = {
  containerFull: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%',
    background: '#e8dfc8', border: '0px solid #d4c8b0', borderRadius: 0,
    display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden', zIndex: 100,
    boxShadow: '0 0 0 rgba(0,0,0,0)', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  container: {
    position: 'fixed', top: 20, right: 20, bottom: 150, width: 400,
    background: '#e8dfc8', border: '6px solid #d4c8b0', borderRadius: 24,
    display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden', zIndex: 100,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontFamily: '"Inter","Segoe UI",sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: '#d4c8b0', borderBottom: '4px solid #bba882',
    cursor: 'grab', userSelect: 'none',
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
    overflowY: 'auto', overflowX: 'hidden', background: '#fdf8e7', scrollbarWidth: 'none',
  },
  pacificaFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '6px 12px', borderTop: '3px solid #d4c8b0',
    background: 'linear-gradient(90deg, #e8dfc8 0%, #fdf8e7 50%, #e8dfc8 100%)',
    flexShrink: 0,
  },
  pacificaLogo: { width: 20, height: 20, objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' },
  pacificaText: { fontSize: 10, fontWeight: 700, color: '#a3906a', letterSpacing: '0.05em', textTransform: 'uppercase' },
  pacificaBrand: { fontSize: 11, fontWeight: 900, color: '#5C3A21', letterSpacing: '0.08em', textTransform: 'uppercase' },
  fundingOverlay: {
    position: 'absolute', top: 5, right: 10, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 6,
    pointerEvents: 'none',
  },
  fundingOLabel: { fontSize: 10, fontWeight: 800, color: '#a3906a', letterSpacing: '0.04em' },
  fundingOValue: { fontSize: 11, fontWeight: 900, fontFamily: 'monospace' },
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
    position: 'relative',
  },
  chartFullscreen: {
    width: '100%', flex: 3, minHeight: 400, background: '#fff', borderRadius: 12,
    border: '4px solid #d4c8b0', overflow: 'hidden', boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.1)',
    position: 'relative',
  },
  headerBtn: {
    width: 32, height: 32, borderRadius: '50%', background: '#1E88E5', border: '3px solid #fff',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    boxShadow: '0 3px 5px rgba(0,0,0,0.3)',
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
  marginSwapBtn: {
    padding: '8px 12px', background: '#e8dfc8', border: '2px solid #d4c8b0', borderRadius: 8,
    fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center',
    height: '100%', boxSizing: 'border-box',
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
    flex: '0 1 380px',
  },
  fullCard: {
    background: '#e8dfc8', border: '3px solid #d4c8b0', borderRadius: 12,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5,
    width: '100%',
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
  goldIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  goldText: { fontSize: 18, fontWeight: 900, color: '#5C3A21', textShadow: '0 1px 0 rgba(255,255,255,0.5)' },
  goldReason: { fontSize: 11, fontWeight: 700, color: '#7B5B00', flex: 1, textAlign: 'right' },
  // Bottom panel (fullscreen)
  bottomPanel: {
    background: '#e8dfc8',
    display: 'flex', flexDirection: 'column', minHeight: 60,
    overflow: 'hidden', flexShrink: 0,
  },
  bottomTabs: {
    display: 'flex', gap: 0, background: '#d4c8b0', flexShrink: 0,
  },
  bottomTabBtn: {
    padding: '6px 20px', background: 'transparent', border: 'none',
    fontSize: 12, fontWeight: 700, color: '#77573d', cursor: 'pointer',
    borderBottom: '2px solid transparent',
  },
  bottomTabActive: {
    padding: '6px 20px', background: '#e8dfc8', border: 'none',
    fontSize: 12, fontWeight: 800, color: '#5C3A21', cursor: 'default',
    borderBottom: '2px solid #4CAF50',
  },
  dragHandleV: {
    width: 6, cursor: 'col-resize', background: '#d4c8b0', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
  dragHandleH: {
    height: 6, cursor: 'row-resize', background: '#bba882', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
  bottomContent: { flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', position: 'relative' },
  filterBtn: {
    marginLeft: 'auto', padding: '4px 8px', background: 'transparent', border: 'none',
    cursor: 'pointer', color: '#77573d', display: 'flex', alignItems: 'center', gap: 4, position: 'relative',
  },
  filterBtnActive: { color: '#4CAF50' },
  filterDot: {
    position: 'absolute', top: 2, right: 2, width: 6, height: 6,
    borderRadius: '50%', background: '#4CAF50',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th: { padding: '4px 12px', textAlign: 'left', color: '#a3906a', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', background: '#e8dfc8' },
  td: { padding: '4px 12px', color: '#5C3A21', fontSize: 12, borderBottom: '1px solid #d4c8b0' },
  tr: { background: '#fdf8e7' },
  tblCloseBtn: {
    padding: '2px 8px', background: '#E53935', border: 'none', borderRadius: 4,
    color: '#fff', fontWeight: 800, fontSize: 10, cursor: 'pointer',
  },
  goldClose: {
    width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.15)',
    border: 'none', color: '#5C3A21', fontWeight: 900, fontSize: 13,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
};
