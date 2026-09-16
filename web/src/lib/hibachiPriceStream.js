// Public market data only. Never send account credentials to this socket.
export function openHibachiPriceStream({symbols, onPrices, WebSocketImpl = WebSocket, timers = globalThis, now = Date.now}) {
  const allowed = new Set(symbols);
  let socket, stopped = false, retryTimer, watchdog, flushTimer, attempt = 0;
  const pending = new Map();
  const retry = () => {
    if (stopped || retryTimer) return;
    retryTimer = timers.setTimeout(() => { retryTimer = null; connect(); }, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)));
  };
  function connect() {
    if (stopped || !allowed.size) return;
    let current;
    try { current = new WebSocketImpl('wss://data-api.hibachi.xyz/ws/market'); }
    catch { retry(); return; }
    socket = current;
    let lastData = now();
    watchdog = timers.setInterval(() => { if (now() - lastData > 15000) current.close(); }, 5000);
    current.onopen = () => {
      if (stopped || socket !== current) return;
      current.send(JSON.stringify({method:'subscribe', parameters:{subscriptions:[...allowed].map(symbol => ({symbol, topic:'mark_price'}))}}));
    };
    current.onmessage = event => {
      if (stopped || socket !== current) return;
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.topic !== 'mark_price' || !allowed.has(msg.symbol)) return;
      const mark = msg.data?.markPrice;
      if (!Number.isFinite(Number(mark)) || Number(mark) <= 0) return;
      lastData = now(); attempt = 0;
      pending.set(msg.symbol, {mark:String(mark), at:lastData});
      if (!flushTimer) flushTimer = timers.setTimeout(() => {
        flushTimer = null;
        if (!stopped) onPrices(new Map(pending));
        pending.clear();
      }, 100);
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (socket !== current) return;
      timers.clearInterval(watchdog); timers.clearTimeout(flushTimer); flushTimer = null;
      pending.clear(); socket = null;
      retry();
    };
  }
  connect();
  return () => {
    stopped = true;
    timers.clearTimeout(retryTimer); timers.clearInterval(watchdog); timers.clearTimeout(flushTimer);
    pending.clear();
    if (socket) { const current = socket; socket = null; current.close(); }
  };
}

export function mergeHibachiStreamPrices(rows, updates, now = Date.now()) {
  return rows.map(row => {
    const update = updates.get(`${row.symbol}/USDT-P`);
    return update && now - update.at < 10000
      ? {...row, mark:update.mark, mark_source:'websocket', mark_received_at:update.at}
      : row;
  });
}
