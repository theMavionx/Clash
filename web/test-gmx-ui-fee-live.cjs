const assert = require('node:assert/strict');
const { GmxApiSdk } = require('@gmx-io/sdk/v2');

const RECEIVER = '0x412A02Ba415e5969596E6f0A35f9439760a3468F';
const READ_ONLY_FROM = '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005';
const SUBSQUID = 'https://gmx.squids.live/gmx-synthetics-arbitrum/graphql';

function receiverOccurrences(prepared) {
  const calldata = String(prepared?.payload?.data || '').toLowerCase();
  const needle = RECEIVER.slice(2).toLowerCase();
  return calldata.split(needle).length - 1;
}

async function assertPrepared(sdk, name, request, expectedOccurrences = 1) {
  const prepared = await sdk.prepareOrder(request);
  assert.equal(prepared?.payloadType, 'transaction', `${name}: expected transaction payload`);
  assert.ok(prepared?.payload?.to, `${name}: missing transaction target`);
  assert.equal(receiverOccurrences(prepared), expectedOccurrences, `${name}: receiver encoding mismatch`);
  return {
    name,
    target: prepared.payload.to,
    calldata_bytes: (String(prepared.payload.data).length - 2) / 2,
    receiver_occurrences: receiverOccurrences(prepared),
  };
}

async function findLivePositionFixture(sdk) {
  const query = 'query { tradeActions(where:{eventName_eq:"OrderExecuted"},orderBy:timestamp_DESC,limit:20){account} }';
  const response = await fetch(SUBSQUID, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  assert.equal(response.ok, true, `Subsquid HTTP ${response.status}`);
  const body = await response.json();
  for (const row of body?.data?.tradeActions || []) {
    const positions = await sdk.fetchPositionsInfo({
      address: row.account,
      includeRelatedOrders: false,
    }).catch(() => []);
    if (positions.length) return { account: row.account, position: positions[0] };
  }
  throw new Error('No public live GMX position fixture found');
}

(async () => {
  const sdk = new GmxApiSdk({ chainId: 42161 });
  const tickers = await sdk.fetchMarketsTickers();
  const market = tickers.find(row => String(row?.symbol).startsWith('BTC/USD') && String(row?.symbol).includes('USDC'));
  assert.ok(market?.symbol, 'BTC/USDC GMX market unavailable');
  const size = 20n * 10n ** 30n;
  const baseIncrease = {
    symbol: market.symbol,
    direction: 'long',
    size,
    collateralToken: 'USDC',
    slippage: 100,
    mode: 'classic',
    from: READ_ONLY_FROM,
    uiFeeReceiver: RECEIVER,
  };
  const results = [];
  results.push(await assertPrepared(sdk, 'market-increase', {
    ...baseIncrease,
    kind: 'increase',
    orderType: 'market',
    collateralToPay: { amount: 5_000_000n, token: 'USDC' },
  }));
  results.push(await assertPrepared(sdk, 'limit-increase', {
    ...baseIncrease,
    kind: 'increase',
    orderType: 'limit',
    triggerPrice: 60_000n * 10n ** 30n,
    collateralToPay: { amount: 5_000_000n, token: 'USDC' },
  }));
  results.push(await assertPrepared(sdk, 'market-with-tpsl', {
    ...baseIncrease,
    kind: 'increase',
    orderType: 'market',
    collateralToPay: { amount: 5_000_000n, token: 'USDC' },
    tpsl: [
      { type: 'take-profit', triggerPrice: 75_000n * 10n ** 30n, size },
      { type: 'stop-loss', triggerPrice: 55_000n * 10n ** 30n, size },
    ],
  }, 3));

  const fixture = await findLivePositionFixture(sdk);
  const position = fixture.position;
  const tokens = await sdk.fetchTokens();
  const collateral = tokens.find(token => (
    String(token?.address).toLowerCase() === String(position.collateralTokenAddress).toLowerCase()
  ));
  assert.ok(collateral?.symbol, 'Live position collateral token unavailable');
  const decreaseSize = BigInt(position.sizeInUsd) > 10n * 10n ** 30n
    ? 10n * 10n ** 30n
    : BigInt(position.sizeInUsd);
  const baseDecrease = {
    kind: 'decrease',
    symbol: `${position.indexName} [${position.poolName}]`,
    direction: position.isLong ? 'long' : 'short',
    size: decreaseSize,
    collateralToken: collateral.symbol,
    receiveToken: collateral.symbol,
    slippage: 100,
    mode: 'classic',
    from: fixture.account,
    uiFeeReceiver: RECEIVER,
  };
  const mark = BigInt(position.markPrice);
  results.push(await assertPrepared(sdk, 'market-decrease', {
    ...baseDecrease,
    orderType: 'market',
    keepLeverage: true,
  }));
  results.push(await assertPrepared(sdk, 'take-profit', {
    ...baseDecrease,
    orderType: 'take-profit',
    triggerPrice: mark * (position.isLong ? 110n : 90n) / 100n,
  }));
  results.push(await assertPrepared(sdk, 'stop-loss', {
    ...baseDecrease,
    orderType: 'stop-loss',
    triggerPrice: mark * (position.isLong ? 90n : 110n) / 100n,
  }));
  console.log('GMX_UI_FEE_LIVE_DRY_RUN_PASS');
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
