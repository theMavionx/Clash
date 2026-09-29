'use strict';

// Authenticated, fixed-origin API-key bridge. Never log credential headers.
function attachQfexRoutes(router, auth, adapter = require('./qfex')) {
  const route = (method, path, handler, { credentials = true } = {}) => {
    router[method](`/qfex/${path}`, auth, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (req.dex !== 'qfex') return res.status(409).json({ error: 'Switch to QFEX before using this endpoint.', requested_dex: 'qfex', stored_dex: req.dex });
      try {
        const creds = credentials ? adapter.credentials({
          publicKey: req.headers['x-qfex-public-key'],
          secretKey: req.headers['x-qfex-secret-key'],
          accountId: req.headers['x-qfex-account-id'],
        }) : null;
        res.json(await handler(req, creds));
      } catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
        // Only adapter-authored, coded errors are safe for the browser/logs.
        const safe = /^QFEX_[A-Z_]+$/.test(String(error?.code || ''));
        const code = safe ? error.code : 'QFEX_UNAVAILABLE';
        console.warn('[qfex]', { player_id: req.playerId, operation: path, status, code });
        res.status(status).json({ error: safe ? error.message : 'QFEX request failed. Refresh account state before retrying.', code,
          ...(code === 'QFEX_ACTION_NOT_FOUND' ? { account_id: error.account_id } : {}),
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
    interval: req.query.interval || req.query.resolution, limit: req.query.limit,
  }), { credentials: false });
  route('post', 'credentials/check', async (req, creds) => ({ ok: true,
    ...adapter.configStatus(), ...(await adapter.getAccountSnapshot(creds, { ...context(req), force: true })),
  }));
  route('get', 'account-snapshot', (req, creds) => adapter.getAccountSnapshot(creds, context(req)));
  route('get', 'history', (req, creds) => adapter.getTradeHistory(creds, {
    ...context(req), limit: req.query.limit, offset: req.query.offset, symbol: req.query.symbol,
  }));
  route('get', 'actions/:actionId', (req, creds) => adapter.getActionStatus(creds, req.params.actionId, context(req)));
  route('post', 'orders', (req, creds) => adapter.placeOrder(creds, input(req), context(req)));
  route('post', 'orders/cancel', (req, creds) => adapter.cancelOrder(creds, input(req), context(req)));
  route('delete', 'orders/:orderId', (req, creds) => adapter.cancelOrder(creds, { ...input(req), orderId: req.params.orderId }, context(req)));
  route('post', 'positions/close', (req, creds) => adapter.closePosition(creds, input(req), context(req)));
  route('post', 'positions/:positionId/close', (req, creds) => adapter.closePosition(creds, { ...input(req), positionId: req.params.positionId }, context(req)));
  route('post', 'leverage', (req, creds) => adapter.setLeverage(creds, input(req), context(req)));
  route('post', 'import-trades', (req, creds) => adapter.importTradesForPlayer(req.playerId, creds, { limit: req.body?.limit }));
}

module.exports = { attachQfexRoutes };
