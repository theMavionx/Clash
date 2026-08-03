import {
  aptosFetchOptionsForKey,
  runWithAptosBrowserKeys,
} from './aptosBrowserKeyPool.js';

const DECIBEL_HTTP = 'https://api.mainnet.aptoslabs.com/decibel';
const DECIBEL_WS = 'wss://api.mainnet.aptoslabs.com/decibel/ws';
const SNAPSHOT_TIMEOUT_MS = 8_000;
const CONNECT_TIMEOUT_MS = 8_000;
const FIRST_DEPTH_TIMEOUT_MS = 10_000;
const RECONNECT_MIN_MS = 1_500;
const RECONNECT_MAX_MS = 15_000;

function normalizedLevel(level, index) {
  const price = Array.isArray(level) ? level[0] : level?.price ?? level?.p;
  const amount = Array.isArray(level) ? level[1] : level?.size ?? level?.amount ?? level?.a;
  const normalized = {
    price: Number(price),
    amount: Number(amount),
    count: Array.isArray(level) ? index + 1 : Number(level?.count ?? level?.n ?? index + 1),
  };
  return Number.isFinite(normalized.price) && Number.isFinite(normalized.amount)
    ? normalized
    : null;
}

function normalizedSide(levels, side) {
  return (Array.isArray(levels) ? levels : [])
    .map(normalizedLevel)
    .filter(Boolean)
    .sort((a, b) => side === 'ask' ? a.price - b.price : b.price - a.price)
    .slice(0, 50);
}

export function decibelTickerId(symbol, marketName = '') {
  const base = String(symbol || marketName || '')
    .trim()
    .toUpperCase()
    .split(/[-/]/u)[0]
    .replace(/[^A-Z0-9]/gu, '');
  return base ? `${base}-PERP` : '';
}

export function normalizeDecibelOrderBook(payload = {}) {
  return {
    bids: normalizedSide(payload?.bids, 'bid'),
    asks: normalizedSide(payload?.asks, 'ask'),
    timestamp: payload?.timestamp ?? payload?.unix_ms ?? null,
  };
}

function connectionError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function responseError(response, body) {
  const error = new Error(
    `Decibel order book snapshot failed (${response.status})${body ? `: ${body.slice(0, 160)}` : ''}`,
  );
  error.status = response.status;
  return error;
}

// Paint an authenticated REST snapshot immediately, then switch to Decibel's
// authenticated depth WebSocket. REST and WebSocket quotas can differ, so the
// socket handshake is a separate key-pool operation: a REST-healthy key that
// gets a 429 on WebSocket cannot pin the book to a dead connection.
export function startDecibelOrderBook({
  symbol = '',
  marketName = '',
  marketAddr = '',
  aggregation = 1,
  onData,
  onStatus,
  onError,
} = {}) {
  const address = String(marketAddr || '').trim().toLowerCase();
  const topic = address ? `depth:${address}:${aggregation}` : '';
  const tickerId = decibelTickerId(symbol, marketName);
  let stopped = false;
  let socket = null;
  let retryTimer = null;
  let depthTimer = null;
  let fetchController = null;
  let reconnectAttempt = 0;

  const emitStatus = status => {
    if (!stopped && typeof onStatus === 'function') onStatus(status);
  };
  const emitError = error => {
    if (!stopped && typeof onError === 'function') onError(error);
  };
  const emitData = (payload, source = 'websocket') => {
    if (stopped || typeof onData !== 'function') return false;
    const book = normalizeDecibelOrderBook(payload);
    if (!book.bids.length && !book.asks.length) return false;
    onData(book, source);
    return true;
  };

  function scheduleReconnect() {
    if (stopped || retryTimer) return;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      Math.round(RECONNECT_MIN_MS * Math.pow(1.6, reconnectAttempt)),
    );
    reconnectAttempt += 1;
    emitStatus('reconnecting');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  }

  function openWithKey(apiKey) {
    return new Promise((resolve, reject) => {
      if (stopped) {
        reject(connectionError('Decibel order book stopped', 400));
        return;
      }
      const protocols = apiKey ? ['decibel', apiKey] : ['decibel'];
      const nextSocket = new WebSocket(DECIBEL_WS, protocols);
      socket = nextSocket;
      let opened = false;
      let settled = false;
      const connectTimer = setTimeout(() => {
        if (settled || opened) return;
        settled = true;
        nextSocket.close();
        reject(connectionError('Decibel order book authentication timed out'));
      }, CONNECT_TIMEOUT_MS);

      nextSocket.onopen = () => {
        if (stopped || socket !== nextSocket) {
          nextSocket.close();
          return;
        }
        opened = true;
        clearTimeout(connectTimer);
        nextSocket.send(JSON.stringify({ method: 'subscribe', topic }));
        depthTimer = setTimeout(() => {
          if (stopped || socket !== nextSocket) return;
          emitError(new Error('Decibel order book subscribed but returned no depth'));
          nextSocket.close();
        }, FIRST_DEPTH_TIMEOUT_MS);
        if (!settled) {
          settled = true;
          resolve(nextSocket);
        }
      };

      nextSocket.onmessage = (event) => {
        if (stopped || socket !== nextSocket) return;
        try {
          const payload = JSON.parse(String(event.data || ''));
          if (payload?.success === false) {
            clearTimeout(depthTimer);
            emitError(new Error(payload.error || 'Decibel order book subscription failed'));
            nextSocket.close();
            return;
          }
          if (emitData(payload)) {
            clearTimeout(depthTimer);
            reconnectAttempt = 0;
            emitStatus('live');
          }
        } catch (error) {
          emitError(error);
        }
      };

      nextSocket.onerror = () => {
        if (!opened && !settled) {
          settled = true;
          clearTimeout(connectTimer);
          reject(connectionError('Decibel order book authentication failed'));
        }
      };

      nextSocket.onclose = () => {
        clearTimeout(connectTimer);
        clearTimeout(depthTimer);
        if (socket === nextSocket) socket = null;
        if (!opened) {
          if (!settled) {
            settled = true;
            reject(connectionError('Decibel order book connection was rejected'));
          }
          return;
        }
        if (!stopped) scheduleReconnect();
      };
    });
  }

  async function fetchSnapshot() {
    if (!tickerId) throw new Error('Decibel order book ticker is unavailable');
    await runWithAptosBrowserKeys(async (apiKey) => {
      fetchController?.abort();
      fetchController = new AbortController();
      const timeout = setTimeout(() => fetchController?.abort(), SNAPSHOT_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(
          `${DECIBEL_HTTP}/api/v1/orderbook?ticker_id=${encodeURIComponent(tickerId)}`,
          aptosFetchOptionsForKey({ signal: fetchController.signal }, apiKey),
        );
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw responseError(response, body);
      }
      const payload = await response.json();
      emitData(payload, 'snapshot');
      emitStatus('snapshot');
    }, {
      label: 'Decibel order book snapshot',
      cooldownMs: 5 * 60 * 1000,
    });
  }

  async function connect() {
    if (stopped) return;
    emitStatus('loading');
    try {
      await fetchSnapshot();
    } catch (error) {
      if (stopped || error?.name === 'AbortError') return;
      emitError(error);
      scheduleReconnect();
      return;
    }
    if (!topic) {
      emitStatus('unavailable');
      emitError(new Error('Decibel order book market address is unavailable'));
      return;
    }
    if (typeof WebSocket === 'undefined') {
      emitStatus('snapshot');
      return;
    }
    emitStatus('connecting');
    try {
      await runWithAptosBrowserKeys(openWithKey, {
        label: 'Decibel order book WebSocket',
        cooldownMs: 5 * 60 * 1000,
      });
    } catch (error) {
      if (stopped) return;
      emitError(error);
      scheduleReconnect();
    }
  }

  void connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(depthTimer);
    fetchController?.abort();
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
      socket = null;
    }
  };
}
