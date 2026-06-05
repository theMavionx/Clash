export function createReconnectingJsonWebSocket({
  url,
  getUrl,
  protocols,
  reconnectMinMs = 1000,
  reconnectMaxMs = 30000,
  pingIntervalMs = 25000,
  pongTimeoutMs = 10000,
  pingMessage = { type: 'ping' },
  isPong = msg => msg?.type === 'pong' || msg?.type === 'ping',
  onOpen,
  onMessage,
  onClose,
  onError,
  onStatus,
} = {}) {
  let ws = null;
  let stopped = true;
  let retryMs = reconnectMinMs;
  let reconnectTimer = null;
  let pingTimer = null;
  let pongTimer = null;

  const emitStatus = status => {
    try { onStatus?.(status); } catch {}
  };

  const clearTimer = timer => {
    if (timer) clearTimeout(timer);
  };

  const clearTimers = () => {
    clearTimer(reconnectTimer);
    clearTimer(pingTimer);
    clearTimer(pongTimer);
    reconnectTimer = null;
    pingTimer = null;
    pongTimer = null;
  };

  const sendJson = payload => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  };

  const armPing = () => {
    clearTimer(pingTimer);
    clearTimer(pongTimer);
    pingTimer = setTimeout(() => {
      if (stopped || !ws || ws.readyState !== WebSocket.OPEN) return;
      const sent = sendJson(typeof pingMessage === 'function' ? pingMessage() : pingMessage);
      if (!sent) return;
      pongTimer = setTimeout(() => {
        emitStatus({ status: 'stale', at: Date.now() });
        try { ws?.close(); } catch {}
      }, pongTimeoutMs);
    }, pingIntervalMs);
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    emitStatus({ status: 'reconnecting', retry_ms: retryMs, at: Date.now() });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, reconnectMaxMs);
  };

  function connect() {
    if (stopped || typeof WebSocket === 'undefined') return false;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return true;
    const target = typeof getUrl === 'function' ? getUrl() : url;
    if (!target) return false;
    emitStatus({ status: 'connecting', at: Date.now() });
    ws = new WebSocket(target, protocols);
    ws.onopen = event => {
      retryMs = reconnectMinMs;
      emitStatus({ status: 'open', at: Date.now() });
      armPing();
      onOpen?.(event, api);
    };
    ws.onmessage = event => {
      let msg = null;
      try { msg = JSON.parse(event.data); } catch {
        msg = event.data;
      }
      if (isPong?.(msg)) {
        clearTimer(pongTimer);
        pongTimer = null;
        armPing();
      }
      onMessage?.(msg, event, api);
    };
    ws.onerror = event => {
      emitStatus({ status: 'error', at: Date.now() });
      onError?.(event, api);
    };
    ws.onclose = event => {
      const closed = ws;
      if (ws === closed) ws = null;
      clearTimer(pingTimer);
      clearTimer(pongTimer);
      pingTimer = null;
      pongTimer = null;
      onClose?.(event, api);
      if (!stopped) scheduleReconnect();
    };
    return true;
  }

  const close = () => {
    stopped = true;
    clearTimers();
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try { ws.close(); } catch {}
    }
    ws = null;
    emitStatus({ status: 'closed', at: Date.now() });
  };

  const api = {
    connect: () => {
      stopped = false;
      return connect();
    },
    close,
    reconnect: () => {
      if (stopped) return false;
      if (ws) {
        try { ws.close(); } catch {}
      } else {
        scheduleReconnect();
      }
      return true;
    },
    sendJson,
    readyState: () => ws?.readyState ?? (typeof WebSocket !== 'undefined' ? WebSocket.CLOSED : 3),
    socket: () => ws,
  };

  return api;
}
