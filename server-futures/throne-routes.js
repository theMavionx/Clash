'use strict';

// Authenticated Throne (Orderly broker "throne") bridge. The browser sends its Orderly
// key per request in headers, like QFEX; credential headers are never logged.
function credentialsFrom(req) {
  return {
    accountId: req.headers['x-throne-account-id'],
    orderlyKey: req.headers['x-throne-orderly-key'],
    orderlySecret: req.headers['x-throne-orderly-secret'],
    address: req.headers['x-throne-address'],
  };
}

function attachThroneRoutes(router, auth, adapter = require('./throne')) {
  const route = (method, path, handler, { credentials = true, venueCheck = true } = {}) => {
    router[method](`/throne/${path}`, auth, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (venueCheck && req.dex !== 'throne') return res.status(409).json({ error: 'Switch to Throne before using this endpoint.', requested_dex: 'throne', stored_dex: req.dex });
      try {
        const creds = credentials ? adapter.credentials(credentialsFrom(req)) : null;
        res.json(await handler(req, creds));
      } catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
        const safe = /^THRONE_[A-Z_]+$/.test(String(error?.code || ''));
        const code = safe ? error.code : 'THRONE_UNAVAILABLE';
        console.warn('[throne]', { player_id: req.playerId, operation: path, status, code });
        res.status(status).json({ error: safe ? error.message : 'Throne request failed. Refresh account state before retrying.', code,
          ...(code === 'THRONE_ACTION_NOT_FOUND' ? { account_id: error.account_id } : {}),
          outcome_unknown: error?.outcomeUnknown === true });
      }
    });
  };
  const context = req => ({ playerId: req.playerId });
  const input = req => ({ ...(req.body || {}), actionId: req.body?.actionId || req.headers['x-idempotency-key'] });
  route('get', 'config', () => adapter.configStatus(), { credentials: false });
  route('get', 'markets', () => adapter.getMarkets(), { credentials: false });
  route('get', 'prices', () => adapter.getPrices(), { credentials: false });
  route('get', 'candles', req => adapter.getCandles(req.query.symbol, {
    interval: req.query.interval || req.query.resolution, limit: req.query.limit, start: req.query.start, end: req.query.end,
  }), { credentials: false });
  route('get', 'onboarding', req => adapter.getOnboardingStatus(req.query.address), { credentials: false });
  route('get', 'wallet/registration-nonce', () => adapter.getRegistrationNonce(), { credentials: false });
  // Relays of wallet-signed EIP-712 messages; the server validates fields but never signs.
  route('post', 'wallet/register', req => adapter.registerAccount(req.body, context(req)), { credentials: false });
  route('post', 'wallet/orderly-key', req => adapter.addOrderlyKey(req.body, context(req)), { credentials: false });
  // Board standing is public data; available on any venue (e.g. a profile card).
  route('get', 'standing', req => adapter.getStanding(req.query.address), { credentials: false, venueCheck: false });
  route('post', 'credentials/check', async (req, creds) => ({ ok: true, ...adapter.configStatus(),
    ...(await adapter.getAccountSnapshot(creds, { ...context(req), force: true })) }));
  route('get', 'account-snapshot', (req, creds) => adapter.getAccountSnapshot(creds, context(req)));
  route('get', 'orderbook', (req, creds) => adapter.getOrderbook(creds, req.query.symbol));
  route('get', 'history', (req, creds) => adapter.getTradeHistory(creds, { ...context(req), limit: req.query.limit, symbol: req.query.symbol }));
  route('get', 'actions/:actionId', (req, creds) => adapter.getActionStatus(creds, req.params.actionId, context(req)));
  route('post', 'orders', (req, creds) => adapter.placeOrder(creds, input(req), context(req)));
  route('post', 'orders/cancel', (req, creds) => adapter.cancelOrder(creds, input(req), context(req)));
  route('post', 'positions/close', (req, creds) => adapter.closePosition(creds, input(req), context(req)));
  route('post', 'tpsl', (req, creds) => adapter.setTpsl(creds, input(req), context(req)));
  route('post', 'leverage', (req, creds) => adapter.setLeverage(creds, input(req), context(req)));
  route('post', 'import-trades', (req, creds) => adapter.importTradesForPlayer(req.playerId, creds, { maxOrders: req.body?.maxOrders }));
}

module.exports = { attachThroneRoutes, credentialsFrom };
