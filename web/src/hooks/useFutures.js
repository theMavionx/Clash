import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlayer } from './useGodot';

const FUTURES_API = import.meta.env.VITE_FUTURES_API || 'http://localhost:4001/api';

function getHeaders(player) {
  return {
    'Content-Type': 'application/json',
    'x-player-id': player?.player_id || player?.player_id || player?.id || '',
    'x-player-name': player?.player_name || player?.name || '',
  };
}

async function api(method, path, player, body) {
  const res = await fetch(`${FUTURES_API}${path}`, {
    method,
    headers: getHeaders(player),
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export function useFutures() {
  const player = usePlayer();
  const [wallet, setWallet] = useState(null);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  // Init wallet
  const initWallet = useCallback(async () => {
    if (!(player?.player_id || player?.id)) return;
    try {
      const res = await api('POST', '/wallet', player);
      if (res.error) throw new Error(res.error);
      setWallet(res.public_key);
    } catch (e) {
      setError(e.message);
    }
  }, [player]);

  // Fetch account info
  const fetchAccount = useCallback(async () => {
    if (!(player?.player_id || player?.id)) return;
    try {
      const res = await api('GET', '/account', player);
      // Unwrap Pacifica response — store data directly
      setAccount(res.data || res);
    } catch (e) { /* silent */ }
  }, [player]);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    if (!(player?.player_id || player?.id)) return;
    try {
      const res = await api('GET', '/positions', player);
      if (res.data) setPositions(res.data);
    } catch (e) { /* silent */ }
  }, [player]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!(player?.player_id || player?.id)) return;
    try {
      const res = await api('GET', '/orders', player);
      if (res.data) setOrders(res.data);
    } catch (e) { /* silent */ }
  }, [player]);

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    try {
      const res = await api('GET', '/prices', player);
      if (res.data) setPrices(res.data);
    } catch (e) { /* silent */ }
  }, [player]);

  // Fetch markets
  const fetchMarkets = useCallback(async () => {
    try {
      const res = await api('GET', '/markets', player);
      if (res.data) setMarkets(res.data);
    } catch (e) { /* silent */ }
  }, [player]);

  // Place market order
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage) => {
    if (!(player?.player_id || player?.id)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api('POST', '/orders/market', player, {
        symbol,
        side,
        amount: String(amount),
        slippage_percent: String(slippage || '0.5'),
      });
      if (res.error) throw new Error(res.error);
      // Refresh data after order
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
  }, [player, fetchPositions, fetchOrders, fetchAccount]);

  // Place limit order
  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif) => {
    if (!(player?.player_id || player?.id)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api('POST', '/orders/limit', player, {
        symbol,
        side,
        price: String(price),
        amount: String(amount),
        tif: tif || 'GTC',
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
  }, [player, fetchOrders, fetchAccount]);

  // Cancel order
  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!(player?.player_id || player?.id)) return;
    try {
      const res = await api('POST', '/orders/cancel', player, {
        symbol,
        order_id: orderId,
      });
      if (res.error) throw new Error(res.error);
      fetchOrders();
      return res;
    } catch (e) {
      setError(e.message);
    }
  }, [player, fetchOrders]);

  // Close position (market order in opposite direction with reduce_only)
  const closePosition = useCallback(async (symbol, side, amount) => {
    if (!(player?.player_id || player?.id)) return;
    setLoading(true);
    setError(null);
    try {
      // To close: send opposite side with reduce_only
      const closeSide = side === 'bid' ? 'ask' : 'bid';
      const res = await api('POST', '/orders/market', player, {
        symbol,
        side: closeSide,
        amount: String(amount),
        slippage_percent: '1',
        reduce_only: true,
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
  }, [player, fetchPositions, fetchOrders, fetchAccount]);

  // Update leverage
  const setLeverage = useCallback(async (symbol, leverage) => {
    if (!(player?.player_id || player?.id)) return;
    try {
      const res = await api('POST', '/leverage', player, { symbol, leverage });
      if (res.error) throw new Error(res.error);
      return res;
    } catch (e) {
      setError(e.message);
    }
  }, [player]);

  // Get wallet balance (USDC + SOL on custodial wallet, before Pacifica deposit)
  const fetchWalletBalance = useCallback(async () => {
    if (!(player?.player_id || player?.id)) return null;
    try {
      const res = await api('GET', '/balance', player);
      return res;
    } catch (e) {
      return null;
    }
  }, [player]);

  // Deposit USDC from custodial wallet into Pacifica
  const depositToPacifica = useCallback(async (amount) => {
    if (!(player?.player_id || player?.id)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api('POST', '/deposit/pacifica', player, { amount: parseFloat(amount) });
      if (res.error) throw new Error(res.error);
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [player, fetchAccount]);

  // Withdraw USDC from Pacifica back to wallet
  const withdrawFromPacifica = useCallback(async (amount) => {
    if (!(player?.player_id || player?.id)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api('POST', '/withdraw', player, { amount: parseFloat(amount) });
      if (res.error) throw new Error(res.error);
      fetchAccount();
      fetchWalletBalance().then(b => b && b);
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [player, fetchAccount, fetchWalletBalance]);

  const playerId = player?.player_id || player?.id;
  const wsRef = useRef(null);

  // Init on mount
  useEffect(() => {
    if (!playerId) return;
    initWallet();
    fetchMarkets();
  }, [playerId, initWallet, fetchMarkets]);

  // WebSocket for real-time prices, positions, orders
  useEffect(() => {
    if (!playerId) return;

    let ws;
    let reconnectTimer;
    let pingTimer;

    function connect() {
      ws = new WebSocket('wss://ws.pacifica.fi/ws');
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to prices
        ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'prices' } }));

        // Subscribe to account data if wallet exists
        if (wallet) {
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_positions', account: wallet } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_order_updates', account: wallet } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_info', account: wallet } }));
        }

        // Ping every 30s to keep alive
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method: 'ping' }));
        }, 30000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.channel === 'prices' && msg.data) {
            setPrices(msg.data);
          }
          if (msg.channel === 'account_positions' && msg.data) {
            setPositions(Array.isArray(msg.data) ? msg.data : []);
          }
          if (msg.channel === 'account_order_updates' && msg.data) {
            setOrders(prev => {
              const updated = Array.isArray(msg.data) ? msg.data : [msg.data];
              // Merge updates — replace existing by order_id or add new
              const map = new Map(prev.map(o => [o.i || o.order_id, o]));
              for (const o of updated) {
                const id = o.i || o.order_id;
                if (o.os === 'filled' || o.os === 'cancelled') map.delete(id);
                else map.set(id, o);
              }
              return [...map.values()];
            });
          }
          if (msg.channel === 'account_info' && msg.data) {
            setAccount(msg.data);
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        // Reconnect after 3s
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    // Also do one REST fetch for initial data
    fetchPrices();
    fetchPositions();
    fetchOrders();
    fetchAccount();

    return () => {
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [playerId, wallet]); // reconnect when wallet changes

  return {
    wallet,
    account,
    positions,
    orders,
    prices,
    markets,
    loading,
    error,
    clearError,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    setLeverage,
    closePosition,
    fetchPositions,
    fetchOrders,
    fetchAccount,
    fetchWalletBalance,
    depositToPacifica,
    withdrawFromPacifica,
  };
}
