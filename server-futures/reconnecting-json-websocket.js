const WebSocket = require('ws');

function createReconnectingJsonWebSocket({
  name = 'ws',
  url,
  getUrl,
  headers,
  reconnectMinMs = 1000,
  reconnectMaxMs = 30000,
  handshakeTimeoutMs = 5000,
  pingIntervalMs = 25000,
  pongTimeoutMs = 10000,
  pingMessage = { type: 'ping' },
  isPong = msg => msg?.type === 'pong' || msg?.type === 'ping' || msg?.status === 200,
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
    try { onStatus?.({ name, ...status }); } catch {}
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
    if (!pingIntervalMs || pingIntervalMs <= 0) return;
    pingTimer = setTimeout(() => {
      if (stopped || !ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = typeof pingMessage === 'function' ? pingMessage() : pingMessage;
      if (!payload) {
        armPing();
        return;
      }
      const sent = sendJson(payload);
      if (!sent) return;
      pongTimer = setTimeout(() => {
        emitStatus({ status: 'stale', at: Date.now() });
        try { ws?.close(); } catch {}
      }, pongTimeoutMs);
      if (pongTimer.unref) pongTimer.unref();
    }, pingIntervalMs);
    if (pingTimer.unref) pingTimer.unref();
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    emitStatus({ status: 'reconnecting', retry_ms: retryMs, at: Date.now() });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, retryMs);
    if (reconnectTimer.unref) reconnectTimer.unref();
    retryMs = Math.min(retryMs * 2, reconnectMaxMs);
  };

  function connect() {
    if (stopped) return false;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return true;
    const target = typeof getUrl === 'function' ? getUrl() : url;
    if (!target) return false;
    emitStatus({ status: 'connecting', at: Date.now() });
    ws = new WebSocket(target, { headers: typeof headers === 'function' ? headers() : headers, handshakeTimeout: handshakeTimeoutMs });
    ws.on('open', event => {
      retryMs = reconnectMinMs;
      emitStatus({ status: 'open', at: Date.now() });
      armPing();
      onOpen?.(event, api);
    });
    ws.on('message', raw => {
      let msg = null;
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
      try { msg = JSON.parse(text); } catch { msg = text; }
      if (isPong?.(msg)) {
        clearTimer(pongTimer);
        pongTimer = null;
        armPing();
      }
      onMessage?.(msg, raw, api);
    });
    ws.on('error', event => {
      emitStatus({ status: 'error', at: Date.now(), message: event?.message || String(event || '') });
      onError?.(event, api);
    });
    ws.on('close', (code, reason) => {
      const closed = ws;
      if (ws === closed) ws = null;
      clearTimer(pingTimer);
      clearTimer(pongTimer);
      pingTimer = null;
      pongTimer = null;
      onClose?.({ code, reason: reason?.toString?.() || String(reason || '') }, api);
      if (!stopped) scheduleReconnect();
    });
    return true;
  }

  const close = () => {
    stopped = true;
    clearTimers();
    if (ws) {
      try { ws.terminate?.(); } catch {
        try { ws.close(); } catch {}
      }
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
    readyState: () => ws?.readyState ?? WebSocket.CLOSED,
    socket: () => ws,
  };

  return api;
}

module.exports = { createReconnectingJsonWebSocket };
