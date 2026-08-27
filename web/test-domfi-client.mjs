import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeFunctionData } from 'viem';
import {
  DOMFI_REFERRAL_CODE,
  DOMFI_PAIR_INFOS,
  DOMFI_PAIRS_STORAGE,
  DOMFI_REGISTRY,
  DOMFI_TRADE_ABI,
  DOMFI_TRADING,
  DOMFI_TRADING_STORAGE,
  DOMFI_USDC,
  appendDomfiReferralSuffix,
  assertDomfiConfig,
  domfiReferralCodeIdForOpen,
  encodeDomfiReferralSuffix,
  prepareDomfiCloseCalldata,
  prepareDomfiOpenCalldata,
} from './src/lib/domfiClient.js';

const wallet = '0x1111111111111111111111111111111111111111';
const officialCodeId = '225';
const officialSuffix = '0x444d46520100000800000000000000e1c30779c0';

assert.equal(DOMFI_REFERRAL_CODE, 'CLASHOFPERPS');
assert.equal(encodeDomfiReferralSuffix(officialCodeId), officialSuffix);
assert.equal(domfiReferralCodeIdForOpen({
  attach_on_next_open: true,
  binding: null,
  referral: { code_id: officialCodeId },
}), officialCodeId);
assert.equal(domfiReferralCodeIdForOpen({
  attach_on_next_open: false,
  binding: { code: 'CLASHOFPERPS' },
  referral: { code_id: officialCodeId },
}), null, 'an existing Clash binding must not append a second referral suffix');
assert.equal(domfiReferralCodeIdForOpen({
  attach_on_next_open: false,
  binding: { code: 'SOMEONEELSE' },
  referral: { code_id: officialCodeId },
}), null, 'an existing third-party referral must be preserved');
assert.equal(assertDomfiConfig({
  chain_id: 8453,
  referral_code: DOMFI_REFERRAL_CODE,
  contracts: {
    registry: DOMFI_REGISTRY,
    trading: DOMFI_TRADING,
    trading_storage: DOMFI_TRADING_STORAGE,
    pairs_storage: DOMFI_PAIRS_STORAGE,
    pair_infos: DOMFI_PAIR_INFOS,
    collateral: DOMFI_USDC,
  },
}), true);

const plainMarketOpen = prepareDomfiOpenCalldata({
  wallet,
  pairIndex: 0,
  collateral: '10',
  leverage: '4',
  price: '59.8457304539764412',
  side: 'long',
  orderType: 'market',
  slippage: '0.5',
});
const referredMarketOpen = appendDomfiReferralSuffix(plainMarketOpen, officialCodeId);
assert.equal(referredMarketOpen, `${plainMarketOpen}${officialSuffix.slice(2)}`);
assert.equal((referredMarketOpen.length - plainMarketOpen.length) / 2, 20);

const decodedMarket = decodeFunctionData({ abi: DOMFI_TRADE_ABI, data: plainMarketOpen });
assert.equal(decodedMarket.functionName, 'openTrade');
assert.equal(decodedMarket.args[0].collateral, 10_000_000n);
assert.equal(decodedMarket.args[0].openPrice, 59_845_730_453_976_441_200n);
assert.equal(decodedMarket.args[0].trader.toLowerCase(), wallet.toLowerCase());
assert.equal(decodedMarket.args[0].leverage, 400);
assert.equal(decodedMarket.args[0].pairIndex, 0);
assert.equal(decodedMarket.args[0].index, 0);
assert.equal(decodedMarket.args[0].buy, true);
assert.equal(decodedMarket.args[1], 0);
assert.equal(decodedMarket.args[2], 50n);

const limitOpen = prepareDomfiOpenCalldata({
  wallet,
  pairIndex: 4,
  collateral: '2.5',
  leverage: '20',
  price: '3.125',
  side: 'short',
  orderType: 'limit',
  takeProfit: '3',
  stopLoss: '3.3',
});
const decodedLimit = decodeFunctionData({ abi: DOMFI_TRADE_ABI, data: limitOpen });
assert.equal(decodedLimit.args[0].collateral, 2_500_000n);
assert.equal(decodedLimit.args[0].leverage, 2_000);
assert.equal(decodedLimit.args[0].buy, false);
assert.equal(decodedLimit.args[1], 1);
assert.equal(decodedLimit.args[2], 1n, 'trigger orders use DomFi protocol placeholder slippage');

const close = prepareDomfiCloseCalldata({
  pairIndex: 4,
  tradeIndex: 3,
  closePercent: 33.333,
  slippage: '0.5',
  price: '3.125',
});
const decodedClose = decodeFunctionData({ abi: DOMFI_TRADE_ABI, data: close });
assert.equal(decodedClose.functionName, 'closeTradeMarket');
assert.deepEqual(decodedClose.args, [4, 3, 3333, 50n, 3_125_000_000_000_000_000n]);
assert.throws(() => prepareDomfiCloseCalldata({ pairIndex: 0, tradeIndex: 0, closePercent: 0, price: '1' }), /between 0 and 100/);

const hookSource = readFileSync(new URL('./src/hooks/useDomfi.js', import.meta.url), 'utf8');
assert.match(hookSource, /fetch\('\/api\/trading\/claim-gold'/u);
assert.doesNotMatch(hookSource, /fetch\('\/api\/claim-gold'/u);
const futuresPanelSource = readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
assert.match(futuresPanelSource, /dex === 'avantis' \|\| dex === 'domfi'/u);
assert.match(futuresPanelSource, /dex !== 'avantis' && dex !== 'domfi' && dex !== 'etoro' && dex !== 'gmx'/u);
const registerPanelSource = readFileSync(new URL('./src/components/RegisterPanel.jsx', import.meta.url), 'utf8');
assert.match(registerPanelSource, /const venue = dex === 'domfi' \? 'DOMFI'/u);

console.log('DomFi client calldata/referral tests passed.');
