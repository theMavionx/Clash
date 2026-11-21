'use strict';

// Authenticated Strike (builder "clashofperps") bridge. The browser sends its Strike API
// wallet key per request in headers, like Throne/QFEX; credential headers are never logged.
function credentialsFrom(req) {
  return {
    accountId: req.headers['x-strike-account-id'],
    publicKey: req.headers['x-strike-public-key'],
    privateKey: req.headers['x-strike-private-key'],
    address: req.headers['x-strike-address'],
  };
}

function attachStrikeRoutes(router, auth, adapter = require('./strike')) {
  const route = (method, path, handler, { credentials = true, venueCheck = true } = {}) => {
    router[method](`/strike/${path}`, auth, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (venueCheck && req.dex !== 'strike') return res.status(409).json({ error: 'Switch to Strike before using this endpoint.', requested_dex: 'strike', stored_dex: req.dex });
      try {
        const creds = credentials ? adapter.credentials(credentialsFrom(req)) : null;
        res.json(await handler(req, creds));
      } catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
        const safe = /^STRIKE_[A-Z_]+$/.test(String(error?.code || ''));
        const code = safe ? error.code : 'STRIKE_UNAVAILABLE';
        console.warn('[strike]', { player_id: req.playerId, operation: path, status, code });
        res.status(status).json({ error: safe ? error.message : 'Strike request failed. Refresh account state before retrying.', code,
          ...(code === 'STRIKE_ACTION_NOT_FOUND' ? { account_id: error.account_id } : {}),
          outcome_unknown: error?.outcomeUnknown === true });
      }
    });
  };
  const context = req => ({ playerId: req.playerId });
  const input = req => ({ ...(req.body || {}), actionId: req.body?.actionId || req.headers['x-idempotency-key'] });
  route('get', 'config', () => adapter.configStatus(), { credentials: false });
  route('get', 'markets', () => adapter.getMarkets(), { credentials: false });
  route('get', 'prices', () => adapter.getPrices(), { credentials: false });
  route('get', 'orderbook', req => adapter.getOrderbook(req.query.symbol), { credentials: false });
  route('get', 'candles', req => adapter.getCandles(req.query.symbol, {
    interval: req.query.interval || req.query.resolution, limit: req.query.limit, start: req.query.start, end: req.query.end,
  }), { credentials: false });
  // Builder connect relays: the server fixes the builder code and fee cap but never signs.
  route('post', 'connect/request-signature', req => adapter.requestConnectSignature(req.body, context(req)), { credentials: false });
  route('post', 'connect/verify-signature', req => adapter.verifyConnectSignature(req.body, context(req)), { credentials: false });
  route('post', 'credentials/check', async (req, creds) => ({ ok: true, ...adapter.configStatus(),
    ...(await adapter.getAccountSnapshot(creds, { ...context(req), force: true })) }));
  route('get', 'account-snapshot', (req, creds) => adapter.getAccountSnapshot(creds, context(req)));
  route('get', 'history', (req, creds) => adapter.getTradeHistory(creds, { ...context(req), limit: req.query.limit, symbol: req.query.symbol }));
  route('get', 'actions/:actionId', (req, creds) => adapter.getActionStatus(creds, req.params.actionId, context(req)));
  route('post', 'orders', (req, creds) => adapter.placeOrder(creds, input(req), context(req)));
  route('post', 'orders/cancel', (req, creds) => adapter.cancelOrder(creds, input(req), context(req)));
  route('post', 'positions/close', (req, creds) => adapter.closePosition(creds, input(req), context(req)));
  route('post', 'tpsl', (req, creds) => adapter.setTpsl(creds, input(req), context(req)));
  route('post', 'leverage', (req, creds) => adapter.setLeverage(creds, input(req), context(req)));
  route('post', 'deposit/prepare', (req, creds) => adapter.prepareDeposit(creds, req.body || {}, context(req)));
  route('post', 'deposit/confirm', (req, creds) => adapter.confirmDeposit(creds, req.body || {}, context(req)));
  route('post', 'withdraw/prepare', (req, creds) => adapter.prepareWithdraw(creds, req.body || {}, context(req)));
  route('post', 'withdraw/confirm', (req, creds) => adapter.confirmWithdraw(creds, req.body || {}, context(req)));
  route('post', 'import-trades', (req, creds) => adapter.importTradesForPlayer(req.playerId, creds, { maxOrders: req.body?.maxOrders }));
}

module.exports = { attachStrikeRoutes, credentialsFrom };
