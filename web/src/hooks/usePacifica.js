import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';

// ---------- Pacifica Config ----------
const API = 'https://api.pacifica.fi/api/v1';
const WS_URL = 'wss://ws.pacifica.fi/ws';
const BUILDER_CODE = 'clashofperps';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';

// ---------- Gold Reward Rates ----------
const GOLD_PER_USD_VOLUME = 5;        // 5 gold per $1 traded
const GOLD_FIRST_DEPOSIT = 500;       // one-time bonus
const GOLD_FIRST_TRADE = 300;         // one-time bonus
const GOLD_DAILY_TRADE = 200;         // once per day
const GOLD_PROFIT_RATE = 0.10;        // 10% of PnL in gold (1 gold per $0.10 profit)

// Round down to lot size (avoids floating point errors)
function roundToLot(amount, lotSize) {
  if (!lotSize) return String(amount);
  const lot = parseFloat(lotSize);
  const decimals = (lotSize.toString().split('.')[1] || '').length;
  return (Math.floor(parseFloat(amount) / lot) * lot).toFixed(decimals);
}

// Pacifica on-chain deposit constants
const PACIFICA_PROGRAM = new PublicKey('PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH');
const CENTRAL_STATE = new PublicKey('9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY');
const VAULT_TOKEN = new PublicKey('72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ---------- Signing helpers ----------
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const s = {};
    for (const k of Object.keys(v).sort()) s[k] = sortKeys(v[k]);
    return s;
  }
  return v;
}

function buildMessage(type, payload) {
  const header = { type, timestamp: Date.now(), expiry_window: 30000 };
  return JSON.stringify(sortKeys({ ...header, data: payload }));
}

function getATA(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROGRAM
  )[0];
}

// ---------- Hook ----------
export function usePacifica() {
  const { publicKey, signMessage, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [account, setAccount] = useState(null);
  const [positions, _setPositionsRaw] = useState([]);
  const setPositions = (v) => {
    _setPositionsRaw(v);
    const list = typeof v === 'function' ? null : v;
    if (list) window._openPositionsCount = list.length;
  };
  const [orders, setOrders] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null); // flash notification
  const wsRef = useRef(null);
  const marketsRef = useRef([]);
  const withdrawTimerRef = useRef(null);
  const rewardsRef = useRef({
    firstDeposit: false,
    firstTrade: false,
    lastDailyDate: null,
  });

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const walletAddr = publicKey?.toBase58() || null;

  // Claim gold from game server (server verifies trades via Pacifica API)
  const claimGold = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const token = window._playerToken;
      if (!token) return;
      const res = await fetch(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr }),
      });
      const data = await res.json();
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        // Update React resource bar immediately
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch { return null; }
  }, [walletAddr]);

  // Fetch wallet USDC balance — try connection first, fallback to direct RPC
  const fetchWalletUsdc = useCallback(async () => {
    if (!publicKey) return;
    const ata = getATA(publicKey, USDC_MINT);

    // Try main connection
    try {
      const bal = await connection.getTokenAccountBalance(ata);
      setWalletUsdc(parseFloat(bal.value.uiAmount || 0));
      return;
    } catch {}

    // Fallback RPCs
    const rpcs = [
      'https://solana-rpc.publicnode.com',
      'https://api.mainnet-beta.solana.com',
      'https://rpc.ankr.com/solana',
    ];
    for (const url of rpcs) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'getTokenAccountBalance',
            params: [ata.toBase58()],
          }),
        });
        const data = await res.json();
        if (data.result?.value) {
          setWalletUsdc(parseFloat(data.result.value.uiAmount || 0));
          return;
        }
      } catch {}
    }
    setWalletUsdc(0);
  }, [publicKey, connection]);

  // Sign & send to Pacifica API
  const signedRequest = useCallback(async (method, endpoint, type, payload) => {
    if (!publicKey || !signMessage) throw new Error('Wallet not connected');

    const message = buildMessage(type, payload);
    const msgBytes = new TextEncoder().encode(message);
    let sigBytes;
    try {
      sigBytes = await signMessage(msgBytes);
    } catch (e) {
      if (e.message?.includes('UserKeyring') || e.message?.includes('rejected')) {
        throw new Error('Please unlock your wallet and try again');
      }
      throw e;
    }
    const signature = bs58.encode(sigBytes);

    const body = {
      account: publicKey.toBase58(),
      signature,
      timestamp: JSON.parse(message).timestamp,
      expiry_window: 30000,
      ...payload,
    };

    const res = await fetch(`${API}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [publicKey, signMessage]);

  // ---------- Market Data (public) ----------
  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/info`).then(r => r.json());
      if (res.data) { setMarkets(res.data); marketsRef.current = res.data; }
    } catch {}
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/info/prices`).then(r => r.json());
      if (res.data) setPrices(res.data);
    } catch {}
  }, []);

  // ---------- Account Data ----------
  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/account?account=${walletAddr}`).then(r => r.json());
      if (res.data) setAccount(res.data);
    } catch {}
  }, [walletAddr]);

  const fetchPositions = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/positions?account=${walletAddr}`).then(r => r.json());
      if (res.data) { setPositions(res.data); setDataReady(true); }
    } catch {}
  }, [walletAddr]);

  const fetchOrders = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/orders?account=${walletAddr}`).then(r => r.json());
      if (res.data) setOrders(res.data);
    } catch {}
  }, [walletAddr]);

  const [marginModes, setMarginModes] = useState({}); // { BTC: false (cross), ETH: true (isolated) }

  const fetchLeverageSettings = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/account/settings?account=${walletAddr}`).then(r => r.json());
      if (res.data?.margin_settings) {
        const levMap = {};
        const marginMap = {};
        for (const s of res.data.margin_settings) {
          levMap[s.symbol] = s.leverage;
          marginMap[s.symbol] = s.isolated;
        }
        setLeverageSettings(levMap);
        setMarginModes(marginMap);
      }
    } catch {}
  }, [walletAddr]);

  // ---------- Onboarding (one-time) ----------
  const activate = useCallback(async () => {
    if (!publicKey) return;
    try {
      // Claim referral for whitelist
      await signedRequest('POST', '/referral/user/code/claim', 'claim_referral_code', { code: 'Vip' });
    } catch {}
    try {
      // Approve builder code
      await signedRequest('POST', '/account/builder_codes/approve', 'approve_builder_code', {
        builder_code: BUILDER_CODE, max_fee_rate: '0.001',
      });
    } catch {}
  }, [publicKey, signedRequest]);

  // ---------- Deposit (on-chain via Phantom) ----------
  const depositToPacifica = useCallback(async (amountUsdc) => {
    if (!publicKey || !sendTransaction) return;
    setLoading(true);
    setError(null);
    try {
      const amountRaw = Math.floor(parseFloat(amountUsdc) * 1e6);
      if (amountRaw < 10e6) throw new Error('Minimum 10 USDC');

      const depositorAta = getATA(publicKey, USDC_MINT);
      const [eventAuth] = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], PACIFICA_PROGRAM);

      // Discriminator for "deposit"
      const disc = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:deposit'))).slice(0, 8);
      const amtBuf = new ArrayBuffer(8);
      new DataView(amtBuf).setBigUint64(0, BigInt(amountRaw), true);
      const data = new Uint8Array([...disc, ...new Uint8Array(amtBuf)]);

      const ix = new TransactionInstruction({
        programId: PACIFICA_PROGRAM,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: depositorAta, isSigner: false, isWritable: true },
          { pubkey: CENTRAL_STATE, isSigner: false, isWritable: true },
          { pubkey: VAULT_TOKEN, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: ASSOC_TOKEN_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: USDC_MINT, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: eventAuth, isSigner: false, isWritable: false },
          { pubkey: PACIFICA_PROGRAM, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
      });

      const tx = new Transaction().add(ix);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      // Auto-activate after first deposit
      await activate();
      fetchAccount();
      fetchWalletUsdc();

      // Gold reward: first deposit
      if (!rewardsRef.current.firstDeposit) {
        rewardsRef.current.firstDeposit = true;
        saveRewards();
        grantGold(GOLD_FIRST_DEPOSIT, 'First deposit bonus!');
      }

      return { success: true, signature: sig };
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [publicKey, sendTransaction, connection, activate, fetchAccount, fetchWalletUsdc]);

  // ---------- Trading ----------
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage) => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
      const res = await signedRequestWithActivation('POST', '/orders/create_market', 'create_market_order', {
        symbol, side, amount: roundToLot(amount, lot),
        slippage_percent: String(slippage || '0.5'),
        reduce_only: false,
        builder_code: BUILDER_CODE,
      });
      if (res.error) throw new Error(res.error);
      fetchPositions();
      fetchOrders();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [publicKey, signedRequest, fetchPositions, fetchOrders, fetchAccount]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif) => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
      const tick = marketsRef.current.find(m => m.symbol === symbol)?.tick_size;
      const res = await signedRequestWithActivation('POST', '/orders/create', 'create_order', {
        symbol, side, price: tick ? roundToLot(price, tick) : String(price), amount: roundToLot(amount, lot),
        tif: tif || 'GTC', reduce_only: false,
        builder_code: BUILDER_CODE,
      });
      if (res.error) throw new Error(res.error);
      fetchOrders();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [publicKey, signedRequest, fetchOrders, fetchAccount]);

  const closePosition = useCallback(async (symbol, side, amount) => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const closeSide = side === 'bid' ? 'ask' : 'bid';
      const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
      const res = await signedRequestWithActivation('POST', '/orders/create_market', 'create_market_order', {
        symbol, side: closeSide, amount: roundToLot(amount, lot),
        slippage_percent: '1', reduce_only: true,
        builder_code: BUILDER_CODE,
      });
      if (res.error) throw new Error(res.error);
      fetchPositions();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [publicKey, signedRequest, fetchPositions, fetchAccount]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!publicKey) return;
    try {
      const res = await signedRequestWithActivation('POST', '/orders/cancel', 'cancel_order', { symbol, order_id: orderId });
      if (res.error) throw new Error(res.error);
      fetchOrders();
      return res;
    } catch (e) { setError(e.message); }
  }, [publicKey, signedRequest, fetchOrders]);

  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss) => {
    if (!publicKey) return;
    try {
      const payload = { symbol, side, builder_code: BUILDER_CODE };
      if (takeProfit) payload.take_profit = { stop_price: takeProfit };
      if (stopLoss) payload.stop_loss = { stop_price: stopLoss };
      const res = await signedRequestWithActivation('POST', '/positions/tpsl', 'set_position_tpsl', payload);
      if (res.error) throw new Error(res.error);
      return res;
    } catch (e) { setError(e.message); }
  }, [publicKey, signedRequest]);

  const setLeverage = useCallback(async (symbol, leverage) => {
    if (!publicKey) return;
    try {
      const res = await signedRequestWithActivation('POST', '/account/leverage', 'update_leverage', {
        symbol, leverage: Number(leverage),
      });
      if (res.error) {
        if (res.code === 422) throw new Error('Close your ' + symbol + ' position first (can only increase leverage)');
        throw new Error(res.error);
      }
      fetchLeverageSettings();
      return res;
    } catch (e) { setError(e.message); }
  }, [publicKey, signedRequest, fetchLeverageSettings]);

  const setMarginMode = useCallback(async (symbol, isIsolated) => {
    if (!publicKey) return;
    try {
      const res = await signedRequestWithActivation('POST', '/account/margin', 'update_margin_mode', {
        symbol, is_isolated: isIsolated,
      });
      if (res.error) {
        if (res.code === 422) throw new Error('Close your ' + symbol + ' position first to change margin mode');
        throw new Error(res.error);
      }
      fetchLeverageSettings();
      return res;
    } catch (e) { setError(e.message); }
  }, [publicKey, signedRequest, fetchLeverageSettings]);

  const withdraw = useCallback(async (amount) => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await signedRequestWithActivation('POST', '/account/withdraw', 'withdraw', { amount: String(amount) });
      if (res.error) throw new Error(res.error);
      fetchAccount();
      clearTimeout(withdrawTimerRef.current);
      withdrawTimerRef.current = setTimeout(fetchWalletUsdc, 5000); // refresh after settlement
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [publicKey, signedRequest, fetchAccount]);

  // ---------- WebSocket ----------
  useEffect(() => {
    if (!connected) return;

    let ws, reconnectTimer, pingTimer, pongTimer;
    let latestPrices = null;
    let priceThrottleTimer = null;
    let claimGoldTimer = null;
    let retryCount = 0;
    const PING_INTERVAL = 15000;
    const PONG_TIMEOUT = 5000;
    const MAX_BACKOFF = 30000;

    function refetchAll() {
      fetchPrices();
      if (walletAddr) {
        fetchAccount();
        fetchPositions();
        fetchOrders();
        fetchLeverageSettings();
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF);
      retryCount++;
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0;
        ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'prices' } }));
        if (walletAddr) {
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_positions', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_order_updates', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_info', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_trades', account: walletAddr } }));
        }
        // Refetch via REST to close any gap from disconnect period
        refetchAll();

        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
            // Start pong timeout — if no pong received, force reconnect
            clearTimeout(pongTimer);
            pongTimer = setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) ws.close();
            }, PONG_TIMEOUT);
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // Pong received — clear timeout
          if (msg.channel === 'pong' || msg.method === 'pong' || msg.pong) {
            clearTimeout(pongTimer);
            return;
          }

          if (msg.channel === 'prices') {
            latestPrices = msg.data;
            if (!priceThrottleTimer) {
              priceThrottleTimer = setTimeout(() => {
                setPrices(latestPrices);
                priceThrottleTimer = null;
              }, 1000);
            }
          }
          if (msg.channel === 'account_positions') {
            // WS positions use short keys: s=symbol, d=side, a=amount, p=entry_price, m=margin, f=funding, i=isolated
            const raw = Array.isArray(msg.data) ? msg.data : [];
            const incoming = raw.map(p => ({
              symbol: p.symbol || p.s,
              side: p.side || p.d,
              amount: p.amount || p.a,
              entry_price: p.entry_price || p.p,
              margin: p.margin || p.m || '0',
              funding: p.funding || p.f || '0',
              isolated: p.isolated ?? p.i ?? false,
              liquidation_price: p.liquidation_price || p.l,
            }));
            setPositions(prev => {
              // Empty array = all positions closed
              if (incoming.length === 0) return [];
              // Merge incoming with existing positions by symbol:side key
              const key = (p) => `${p.symbol}:${p.side}`;
              const map = new Map(prev.map(p => [key(p), p]));
              for (const p of incoming) {
                if (parseFloat(p.amount) === 0) map.delete(key(p));
                else map.set(key(p), p);
              }
              return [...map.values()];
            });
          }
          if (msg.channel === 'account_info') {
            // WS uses short keys — normalize to match REST format
            const d = msg.data;
            setAccount(prev => ({
              ...prev,
              balance: d.balance || d.b || prev?.balance || '0',
              account_equity: d.account_equity || d.ae || prev?.account_equity || '0',
              available_to_spend: d.available_to_spend || d.as || prev?.available_to_spend || '0',
              available_to_withdraw: d.available_to_withdraw || d.aw || prev?.available_to_withdraw || '0',
              total_margin_used: d.total_margin_used || d.mu || prev?.total_margin_used || '0',
              positions_count: d.positions_count ?? d.pc ?? prev?.positions_count ?? 0,
              orders_count: d.orders_count ?? d.oc ?? prev?.orders_count ?? 0,
              fee_level: d.fee_level ?? d.f ?? prev?.fee_level,
              maker_fee: prev?.maker_fee,
              taker_fee: prev?.taker_fee,
            }));
          }
          if (msg.channel === 'account_order_updates' && msg.data) {
            setOrders(prev => {
              const map = new Map(prev.map(o => [o.i || o.order_id, o]));
              const items = Array.isArray(msg.data) ? msg.data : [msg.data];
              for (const o of items) {
                const id = o.i || o.order_id;
                if (o.os === 'filled' || o.os === 'cancelled') map.delete(id);
                else map.set(id, o);
              }
              return [...map.values()];
            });
          }
          // Real-time: when trade happens, claim gold from server
          if (msg.channel === 'account_trades' && msg.data) {
            // Small delay to let Pacifica finalize the trade
            clearTimeout(claimGoldTimer);
            claimGoldTimer = setTimeout(claimGold, 1000);
          }
        } catch {}
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        clearTimeout(pongTimer);
        scheduleReconnect();
      };
      ws.onerror = () => {
        if (!cancelled) ws.close();
      };
    }

    let cancelled = false;

    // Online/offline listeners — pause reconnect when offline, resume when back
    function handleOnline() {
      if (cancelled) return;
      clearTimeout(reconnectTimer);
      retryCount = 0;
      if (!ws || ws.readyState !== WebSocket.OPEN) connect();
    }
    function handleOffline() {
      clearTimeout(reconnectTimer);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    connect();
    fetchPrices();
    if (walletAddr) { fetchAccount(); fetchPositions(); fetchOrders(); fetchWalletUsdc(); fetchLeverageSettings(); }

    return () => {
      cancelled = true;
      clearInterval(pingTimer);
      clearTimeout(pongTimer);
      clearTimeout(reconnectTimer);
      clearTimeout(priceThrottleTimer);
      clearTimeout(claimGoldTimer);
      clearTimeout(withdrawTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); }
    };
  }, [connected, walletAddr]);

  // Fetch markets once
  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

  // Auto-activate: retry on 403 — wraps signedRequest with activation fallback
  const activatedRef = useRef(false);
  const signedRequestWithActivation = useCallback(async (method, endpoint, type, payload) => {
    const res = await signedRequest(method, endpoint, type, payload);
    if (res.code === 403 && !activatedRef.current) {
      activatedRef.current = true;
      await activate();
      // Retry the original request
      return signedRequest(method, endpoint, type, payload);
    }
    return res;
  }, [signedRequest, activate]);

  return {
    connected, walletAddr, account, positions, orders, prices, markets, walletUsdc, leverageSettings, marginModes, dataReady,
    loading, error, clearError, goldEarned, clearGoldEarned,
    depositToPacifica, withdraw, activate, claimGold,
    placeMarketOrder, placeLimitOrder, closePosition, cancelOrder,
    setTpsl, setLeverage, setMarginMode,
    fetchAccount, fetchPositions, fetchOrders,
  };
}
