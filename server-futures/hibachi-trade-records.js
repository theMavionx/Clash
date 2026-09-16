'use strict';
const BigNumber = require('bignumber.js');

function recordVerifiedFill(db, {playerId, username, accountId, trade}) {
  // Only the authenticated server identity and an exchange execution may enter.
  // Never read names or volumes from client order input or store credential blobs.
  const raw = trade?._raw;
  const id = raw?.id ?? raw?.tradeId;
  const market = String(raw?.symbol || '');
  const quote = market.match(/^[^/]+\/([A-Z0-9]+)-P$/u)?.[1];
  const quantity = new BigNumber(raw?.quantity).abs();
  const price = new BigNumber(raw?.price);
  if (trade?.source !== 'trades' || id == null || String(id).trim() === ''
    || (typeof id === 'number' && !Number.isSafeInteger(id))
    || !String(username || '').trim() || !quote || !quantity.isFinite() || !price.isFinite()
    || !quantity.isPositive() || quantity.isZero() || !price.isPositive() || price.isZero()
    || !trade.createdAt || !Number.isFinite(Date.parse(trade.createdAt))) {
    throw Object.assign(new Error('Verified Hibachi execution and server username are required for reconciliation.'), {code:'HIBACHI_RECORD_INVALID'});
  }
  const previous = db.prepare('SELECT player_id FROM hibachi_trade_records WHERE account_id=? AND trade_id=?').get(String(accountId),String(id));
  if (previous && previous.player_id !== String(playerId)) {
    throw Object.assign(new Error('Hibachi execution already belongs to another profile.'), {code:'HIBACHI_RECORD_OWNER_CONFLICT'});
  }
  db.prepare(`INSERT INTO hibachi_trade_records
    (account_id,trade_id,player_id,username,market,volume_quote,volume_currency,quantity,price,side,order_id,executed_at)
    VALUES (@account_id,@trade_id,@player_id,@username,@market,@volume_quote,@volume_currency,@quantity,@price,@side,@order_id,@executed_at)
    ON CONFLICT(account_id,trade_id) DO UPDATE SET
      market=excluded.market, volume_quote=excluded.volume_quote, volume_currency=excluded.volume_currency,
      quantity=excluded.quantity,price=excluded.price,side=excluded.side,order_id=excluded.order_id,
      executed_at=excluded.executed_at,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE hibachi_trade_records.player_id=excluded.player_id`).run({
    account_id:String(accountId), trade_id:String(id), player_id:String(playerId), username:String(username).trim(),
    market, volume_quote:quantity.times(price).toFixed(), volume_currency:quote,
    quantity:quantity.toFixed(), price:price.toFixed(), side:trade.side,
    order_id:trade.orderId == null ? null : String(trade.orderId), executed_at:trade.createdAt,
  });
}

module.exports = {recordVerifiedFill};
