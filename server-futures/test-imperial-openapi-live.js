const test = require('node:test');
const assert = require('node:assert/strict');
const imperial = require('./imperial');

const OPENAPI_URL = 'https://api.imperial.space/api/v1/openapi.json';

async function json(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.json();
}

test('live Imperial OpenAPI still exposes every Clash adapter operation', async () => {
  const spec = await json(OPENAPI_URL);
  const operations = [
    ['get', '/api/v1/status'],
    ['get', '/api/v1/mobile/builder/summary'],
    ['post', '/api/v1/mobile/connect'],
    ['post', '/api/v1/mobile/exchange'],
    ['post', '/api/v1/mobile/revoke'],
    ['get', '/api/v1/mobile/partner/registration'],
    ['post', '/api/v1/mobile/partner/register'],
    ['get', '/api/v1/route'],
    ['post', '/api/v1/mobile/orders/preflight'],
    ['post', '/api/v1/mobile/orders/batch'],
    ['post', '/api/v1/mobile/orders'],
    ['get', '/api/v1/positions'],
    ['get', '/api/v1/orders'],
    ['post', '/api/v1/mobile/orders/cancel'],
    ['post', '/api/v1/mobile/orders/update'],
    ['post', '/api/v1/mobile/orders/collateral'],
    ['get', '/api/v1/mark-prices'],
    ['get', '/api/v1/funding-rates'],
    ['get', '/api/v1/flash/markets'],
    ['get', '/api/v1/mobile/balances'],
    ['get', '/api/v1/mobile/v2/balance'],
    ['get', '/api/v1/trades'],
    ['get', '/api/v1/order-history'],
    ['get', '/api/v1/order-history/{order_pda}'],
    ['get', '/api/v1/pnl-history'],
    ['get', '/api/v1/funding-history'],
    ['post', '/api/v1/deposit/build-tx'],
    ['post', '/api/v1/mobile/v2/deposit'],
    ['put', '/api/v1/passthrough/users/{wallet}/profiles/{index}/margin-mode'],
    ['post', '/api/v1/passthrough/users/{wallet}/profiles/{index}/sync'],
  ];
  for (const [method, path] of operations) assert.ok(spec?.paths?.[path]?.[method], `${method.toUpperCase()} ${path} disappeared`);

  const order = spec.components.schemas.MobileCreateOrderRequest;
  for (const field of ['wallet', 'side', 'orderType', 'action', 'triggerCondition', 'sizeUsd', 'collateralAmount', 'slippageBps', 'triggerPrice', 'profileIndex', 'priority', 'fundingStatus', 'underwriter']) {
    assert.ok(order.required.includes(field), `MobileCreateOrderRequest no longer requires ${field}`);
  }
  assert.ok(order.properties.builderCode, 'MobileCreateOrderRequest.builderCode disappeared');
  assert.match(order.properties.builderCode.description, /open and close legs/i);
  assert.match(order.properties.sizeUsd.description, /6-decimal/i);
  assert.match(order.properties.triggerPrice.description, /1e9/i);
  assert.match(order.properties.marketPrice.description, /Jupiter[\s\S]*Phoenix[\s\S]*1e6/i);
  assert.match(order.properties.marketPrice.description, /GMTrade.*1e9/i);
  assert.match(order.properties.marketPrice.description, /Flash Trade.*priceExponent/i);

  const schema = name => spec.components.schemas[name];
  for (const [name, required] of [
    ['MobileConnectRequest', ['wallet', 'message', 'signature']],
    ['MobileExchangeRequest', ['code']],
    ['MobileCancelOrderRequest', ['wallet', 'orderPda', 'profileIndex']],
    ['MobileUpdateOrderRequest', ['wallet', 'orderPda', 'profileIndex']],
    ['MobileCollateralEditRequest', ['wallet', 'marketMint', 'side', 'action', 'collateralAmount', 'slippageBps', 'profileIndex', 'underwriter', 'price']],
    ['BuildDepositTxRequest', ['wallet', 'profileIndex', 'amount', 'mode']],
    ['MobileV2DepositRequest', ['wallet', 'profileIndex', 'amount']],
    ['SetMarginModeRequest', ['marginMode']],
  ]) {
    for (const field of required) assert.ok(schema(name).required.includes(field), `${name} no longer requires ${field}`);
  }
  assert.match(schema('BuildDepositTxRequest').properties.amount.description, /6-decimal/i);
  assert.match(schema('MobileV2DepositRequest').properties.amount.description, /6-decimal/i);
  assert.match(schema('MobileExchangeResponse').properties.expiresAt.description, /Unix timestamp.*seconds/i);
  assert.ok(schema('LifecycleResponse').properties.sizeTokenAmount);
  assert.ok(schema('LifecycleResponse').properties.pnlUsd);
  assert.ok(schema('OrderHistoryFillResponse').properties.feesUsd);

  const requiresJwt = (method, path) => (spec.paths[path][method].security || []).length > 0;
  for (const [method, path] of [
    ['post', '/api/v1/mobile/revoke'],
    ['get', '/api/v1/mobile/partner/registration'],
    ['post', '/api/v1/mobile/partner/register'],
    ['post', '/api/v1/mobile/orders/preflight'],
    ['post', '/api/v1/mobile/orders/batch'],
    ['post', '/api/v1/mobile/orders'],
    ['post', '/api/v1/mobile/orders/cancel'],
    ['post', '/api/v1/mobile/orders/update'],
    ['post', '/api/v1/mobile/orders/collateral'],
    ['get', '/api/v1/mobile/balances'],
    ['get', '/api/v1/mobile/v2/balance'],
    ['post', '/api/v1/mobile/v2/deposit'],
    ['put', '/api/v1/passthrough/users/{wallet}/profiles/{index}/margin-mode'],
  ]) assert.equal(requiresJwt(method, path), true, `${method.toUpperCase()} ${path} no longer requires JWT`);

  const routeParams = spec.paths['/api/v1/route'].get.parameters.map(value => value.name);
  assert.ok(routeParams.includes('stickyVenue'));
  assert.equal(routeParams.includes('pinnedUnderwriter'), false);
  assert.match(order.properties.marketPrice.description, /priceExponent/i);
});

test('live CLASH builder and public market/router reads are healthy', async () => {
  const builder = await imperial.getBuilderStatus();
  assert.equal(builder.active, true);
  assert.equal(builder.code, 'CLASH');
  assert.equal(builder.data.builderName, 'Clash of Perps');
  assert.equal(Number(builder.data.feeBps), 10);

  const [markets, prices, route] = await Promise.all([
    imperial.getMarketInfo(),
    imperial.getPrices(),
    imperial.getRoute({
      wallet: '11111111111111111111111111111111',
      symbol: 'SOL',
      side: 'long',
      notional: 100,
      leverage: 2,
      holdHours: 24,
      profileIndex: 0,
    }),
  ]);
  assert.ok(markets.some(value => value.symbol === 'SOL' && value.price > 0));
  assert.ok(prices.some(value => value.symbol === 'SOL' && value.price > 0));
  assert.ok(['jupiter', 'flash', 'phoenix', 'gmtrade', 'flash_v2', 'pairs', 'touch'].includes(route.venue));
  assert.ok(Number(route.maxLeverage) > 0);
  assert.ok(Number(route.requiredDeposit?.requiredDepositUsd) > 0);
});
