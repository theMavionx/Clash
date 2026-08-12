import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameter,
  recoverTypedDataAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  LEVERUP_ACTION_DATA_TYPES,
  LEVERUP_ACTION_TYPE_NAMES,
  LEVERUP_CHAIN_ID,
  LEVERUP_COMMON_EIP712_FIELDS,
  LEVERUP_CURRENT_PERMISSION_MASK,
  LEVERUP_DIAMOND,
  LEVERUP_USDC,
  LEVERUP_ZERO_ADDRESS,
  OneClickAction,
  buildLeverupActionData,
  nextLeverupNonce,
  selectLeverupFeeToken,
  signLeverupIntent,
} from './src/lib/leverupV2.js';

const trader = '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005';
const pair = '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec';
const lvUsd = '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1';
// Deterministic test-only signer. Never use a funded or operator key in fixtures.
const privateKey = `0x${'11'.repeat(32)}`;

assert.deepEqual(Object.values(OneClickAction), [...Array(14).keys()], 'V2 must expose the complete 0..13 action set');
assert.equal(Object.keys(LEVERUP_ACTION_TYPE_NAMES).length, 14);
assert.equal(Object.keys(LEVERUP_ACTION_DATA_TYPES).length, 14);
assert.equal(LEVERUP_CURRENT_PERMISSION_MASK, (1n << 256n) - 1n, 'agent authorization must use the protocol wildcard for future V2 actions');

const openValues = [
  pair,
  true,
  LEVERUP_USDC,
  lvUsd,
  12_500_000n,
  2_500_000_000n,
  64_000n * 10n ** 18n,
  60_000n * 10n ** 18n,
  70_000n * 10n ** 18n,
  0,
  0n,
];
const positionHash = `0x${'11'.repeat(32)}`;
const genericActionFixtures = new Map([
  [0, openValues],
  [1, [positionHash, 0]],
  [2, openValues],
  [3, [positionHash]],
  [4, [positionHash, 65_000n * 10n ** 18n, 60_000n * 10n ** 18n]],
  [5, [positionHash, LEVERUP_USDC, 1_000_000n]],
  [6, [positionHash, 1_000_000n]],
  [7, [positionHash, 65_000n * 10n ** 18n, 60_000n * 10n ** 18n]],
  [8, [[positionHash], 0]],
  [9, [positionHash, 100_000_000n, 0]],
  [10, [positionHash]],
  [13, [positionHash]],
]);
for (const [action, values] of genericActionFixtures) {
  const independentlyEncoded = encodeAbiParameters(
    ['address', ...LEVERUP_ACTION_DATA_TYPES[action]].map(type => ({ type })),
    [trader, ...values],
  );
  assert.equal(
    buildLeverupActionData(action, trader, values),
    `0x${independentlyEncoded.slice(66)}`,
    `V2 action ${action} must prepend trader during ABI encoding and strip exactly one word`,
  );
}

const decreases = [[0, 65_000n * 10n ** 18n, 100_000_000n, 0]];
const independentlyEncodedBatch = encodeAbiParameters(
  [{ type: 'address' }, { type: 'bytes32' }, parseAbiParameter('(uint8,uint128,uint128,uint24)[]')],
  [trader, positionHash, decreases],
);
assert.equal(
  buildLeverupActionData(OneClickAction.BATCH_CREATE_DECREASE_ORDERS, trader, [positionHash, decreases]),
  `0x${independentlyEncodedBatch.slice(66)}`,
  'batch decrease-order encoding must match the official V2 tuple layout',
);
const updates = [[positionHash, 66_000n * 10n ** 18n, 90_000_000n, 0]];
const independentlyEncodedUpdates = encodeAbiParameters(
  [{ type: 'address' }, parseAbiParameter('(bytes32,uint128,uint128,uint24)[]')],
  [trader, updates],
);
assert.equal(
  buildLeverupActionData(OneClickAction.BATCH_UPDATE_DECREASE_ORDERS, trader, [updates]),
  `0x${independentlyEncodedUpdates.slice(66)}`,
  'batch update encoding must match the official V2 tuple layout',
);

const signed = await signLeverupIntent({
  trader,
  privateKey,
  action: OneClickAction.MARKET_OPEN,
  actionValues: openValues,
  feeToken: LEVERUP_ZERO_ADDRESS,
  antiDdosFee: 0n,
});
const recovered = await recoverTypedDataAddress({
  domain: {
    name: 'LeverupOneClickV2',
    version: '1',
    chainId: LEVERUP_CHAIN_ID,
    verifyingContract: LEVERUP_DIAMOND,
  },
  types: { OneClickMarketOpen: LEVERUP_COMMON_EIP712_FIELDS },
  primaryType: 'OneClickMarketOpen',
  message: {
    trader,
    action: OneClickAction.MARKET_OPEN,
    nonce: BigInt(signed.nonce),
    deadline: signed.deadline,
    feeToken: LEVERUP_ZERO_ADDRESS,
    antiDdosFee: 0n,
    actionDataHash: keccak256(signed.actionData),
  },
  signature: signed.signature,
});
assert.equal(recovered.toLowerCase(), privateKeyToAccount(privateKey).address.toLowerCase(), 'V2 intent must recover to the browser agent');
assert(BigInt(nextLeverupNonce()) > BigInt(signed.nonce), 'intent nonces must be monotonic');

delete process.env.LEVERUP_BROKER_ID;
const require = createRequire(import.meta.url);
const leverupServer = require('../server-futures/leverup.js');
const acceptedEnvelope = await leverupServer.validateIntentEnvelope(signed, trader);
assert.equal(acceptedEnvelope.action, OneClickAction.MARKET_OPEN, 'server must accept a correctly shaped V2 envelope for the linked trader');

const retryAccount = '0x3333333333333333333333333333333333333333';
const retryMarkets = [
  { pairBase: '0x4444444444444444444444444444444444444444' },
  { pairBase: '0x5555555555555555555555555555555555555555' },
];
const retriedRow = { positionHash };
const retryCalls = [];
const retriedGroups = await leverupServer.__test.readPerMarketLists(
  'getPositionsV4',
  retryAccount,
  retryMarkets,
  {
    multicall: async () => [
      { status: 'failure', error: new Error('one market failed') },
      { status: 'success', result: [] },
    ],
    readContract: async (contract) => {
      retryCalls.push(contract.args[1]);
      return [retriedRow];
    },
  },
);
assert.deepEqual(retriedGroups, [[retriedRow], []], 'a failed market in Multicall must be retried without duplicating successful markets');
assert.deepEqual(retryCalls, [retryMarkets[0].pairBase]);

const detailRetryCalls = [];
const detailRows = await leverupServer.__test.readMarketValues(
  'getPairForTrading',
  retryMarkets.map(row => row.pairBase),
  {
    multicall: async () => { throw new Error('multicall transport unavailable'); },
    readContract: async (contract) => {
      detailRetryCalls.push(contract.args[0]);
      return { pairBase: contract.args[0], feeConfig: { openFeeP: 8 } };
    },
  },
);
assert.equal(detailRows.length, 2, 'critical market configuration must retry every market after a Multicall failure');
assert.deepEqual(detailRetryCalls, retryMarkets.map(row => row.pairBase));

const lvTokenOrder = leverupServer.__test.normalizeLimitOrder({
  orderHash: positionHash,
  pair: 'BTC/USD',
  pairBase: pair,
  isLong: true,
  tokenIn: lvUsd,
  lvToken: lvUsd,
  amountIn: 10n ** 18n,
  qty: 10n ** 10n,
  limitPrice: 64_000n * 10n ** 18n,
  stopLoss: 0n,
  takeProfit: 0n,
  broker: 0,
  timestamp: 1,
});
assert.equal(lvTokenOrder.collateral, 1, 'non-USDC LeverUp limit collateral must use the documented 18 decimals');

const wrongBrokerValues = [...openValues];
wrongBrokerValues[9] = 1;
const wrongBrokerEnvelope = await signLeverupIntent({
  trader,
  privateKey,
  action: OneClickAction.MARKET_OPEN,
  actionValues: wrongBrokerValues,
  feeToken: LEVERUP_ZERO_ADDRESS,
  antiDdosFee: 0n,
});
await assert.rejects(
  leverupServer.validateIntentEnvelope(wrongBrokerEnvelope, trader),
  /broker ID does not match/u,
  'server must reject untrusted broker attribution',
);

const extraFeeValues = [...openValues];
extraFeeValues[10] = 1n;
const extraFeeEnvelope = await signLeverupIntent({
  trader,
  privateKey,
  action: OneClickAction.MARKET_OPEN,
  actionValues: extraFeeValues,
  feeToken: LEVERUP_ZERO_ADDRESS,
  antiDdosFee: 0n,
});
await assert.rejects(
  leverupServer.validateIntentEnvelope(extraFeeEnvelope, trader),
  /extraFee must remain zero/u,
  'server must reject an unapproved LeverUp surcharge',
);

const feeTokenA = '0x1111111111111111111111111111111111111111';
const feeTokenB = '0x2222222222222222222222222222222222222222';
const configs = [
  { action: 0, enabled: true, priority: 0, feeToken: feeTokenA, antiDdosFee: '10' },
  { action: 0, enabled: true, priority: 1, feeToken: feeTokenB, antiDdosFee: '5' },
];
const states = new Map([
  [feeTokenA.toLowerCase(), { balance: 100n, allowance: 100n }],
  [feeTokenB.toLowerCase(), { balance: 1_000n, allowance: 1_000n }],
]);
assert.equal(
  selectLeverupFeeToken(0, configs, states, [{ token: feeTokenA, amount: 95n }]).feeToken,
  feeTokenB,
  'fee selection must include collateral spend and fail over by official priority',
);
assert.deepEqual(selectLeverupFeeToken(13, configs, states), { feeToken: LEVERUP_ZERO_ADDRESS, antiDdosFee: 0n });

const serverSource = await readFile(new URL('../server-futures/leverup.js', import.meta.url), 'utf8');
const hookSource = await readFile(new URL('./src/hooks/useLeverup.js', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const tournamentSource = await readFile(new URL('./src/admin/tournamentUtils.js', import.meta.url), 'utf8');
const leverupIconSource = await readFile(new URL('./public/leverup.svg', import.meta.url), 'utf8');
const tournamentDexBlock = tournamentSource.slice(0, tournamentSource.indexOf('];') + 2);
assert.match(serverSource, /symbol:\s*symbolOf\(row\.pairName \|\| row\.symbol\)/u, 'synthetic pair names must remain distinct');
assert.match(serverSource, /replace\(\/\\\/USD/u, 'slash-delimited LeverUp pair names must normalize without a trailing slash');
assert.match(serverSource, /requiredBrokerId = broker\.active \? broker\.brokerId : 0/u, 'server must enforce configured broker or official default broker 0');
assert.match(serverSource, /extraFee must remain zero/u, 'Clash must not add LeverUp extraFee');
assert.match(
  hookSource,
  /rawPrice\(limitPrice\),\s*stopLoss > 0 \? rawPrice\(stopLoss\) : 0n,\s*takeProfit > 0 \? rawPrice\(takeProfit\) : 0n/u,
  'V2 limit-open actionData must preserve the documented stopLoss then takeProfit field order',
);
assert.match(panelSource, /OPEN_TPSL_POST_MARKET_DEXES[\s\S]*?'leverup'/u, 'market TP\/SL must be created as broker-attributed V2 decrease orders');
assert.match(panelSource, /OPEN_TPSL_NATIVE_LIMIT_ATTACH_DEXES[\s\S]*?'leverup'/u, 'limit TP\/SL must remain attached while the future position does not yet exist');
assert.doesNotMatch(tournamentDexBlock, /leverup/u, 'LeverUp cannot enter tournaments before broker-attributed rewards exist');
assert.match(panelSource, /dex === 'monad' \|\| dex === 'leverup'/u, 'LeverUp wallet connect must target Monad');
assert.match(panelSource, /supportsOrderBook = .*dex === 'leverup'/u, 'LeverUp must render its oracle-pricing state instead of foreign depth');
assert.match(serverSource, /readPerMarketLists\('getPositionsV4'/u, 'failed position multicalls must retry instead of becoming a false empty account');
assert.match(serverSource, /readPerMarketLists\('getLimitOrders'/u, 'failed limit-order multicalls must retry instead of hiding orders');
assert.match(leverupIconSource, /https:\/\/app\.leverup\.xyz\/favicon\.svg/u, 'LeverUp icon must retain its official source attribution');
assert.match(leverupIconSource, /<rect width="64" height="64" rx="8" fill="#CCFF00"\/>/u, 'LeverUp must use the official current app icon');
assert.match(hookSource, /feeTokenStatesRef/u, 'LeverUp must prefetch and cache fee-token balance and allowance state');
assert.match(hookSource, /addEventListener\('focus', refreshFeeState\)/u, 'LeverUp must refresh short-lived fee state when the app regains focus');

console.log('LeverUp V2 protocol, signing, fee failover, broker gate, and UI invariants: PASS');
