// GMTrade / GMSOL integration.
//
// GMTrade is not a REST trading venue. The official docs point integrators to
// GMSOL on Solana, with Rust SDK docs and an npm WASM package
// (@gmsol-labs/gmsol-sdk). This module provides the server-side integration
// surface used by Clash: public market data, app/referral links, and verified
// trade reports that feed the existing gold/quest ledger.

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');
const { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } = require('@solana/web3.js');
const { solanaRpcUrls } = require('../server/solana_rpc');

const GMTRADE_APP_URL = (process.env.GMTRADE_APP_URL || 'https://gmtrade.xyz/trade').replace(/\/+$/, '');
const GMTRADE_DOCS_URL = 'https://docs.gmtrade.xyz/';
const GMTRADE_REFERRAL_CODE = String(process.env.GMTRADE_REFERRAL_CODE || 'gamingperps').trim();
const GMTRADE_RPC_URL = String(
  process.env.GMTRADE_SOLANA_RPC_URL
  || process.env.SOLANA_RPC_URL
  || process.env.HELIUS_RPC_URL
  || 'https://rpc-1.gmtrade.xyz/'
).trim();
const GMTRADE_RPC_URLS = Array.from(new Set(
  solanaRpcUrls().concat(GMTRADE_RPC_URL).filter(Boolean)
));
const GMTRADE_DEDUPE_ATA_INSTRUCTIONS = String(process.env.GMTRADE_DEDUPE_ATA_INSTRUCTIONS || '1') !== '0';
const GMTRADE_OMIT_EXISTING_SETUP_INSTRUCTIONS = String(process.env.GMTRADE_OMIT_EXISTING_SETUP_INSTRUCTIONS || '1') !== '0';
const GMTRADE_RPC_ORIGIN = String(process.env.GMTRADE_RPC_ORIGIN || 'https://gmtrade.xyz').trim();
const REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(15_000, Number(process.env.GMTRADE_TIMEOUT_MS || 7000)));
const PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(60_000, Number(process.env.GMTRADE_PUBLIC_CACHE_TTL_MS || 12_000)));
const PRICE_CACHE_TTL_MS = Math.max(500, Math.min(30_000, Number(process.env.GMTRADE_PRICE_CACHE_TTL_MS || 2500)));
const OFFICIAL_PRICE_MAX_AGE_MS = Math.max(15_000, Math.min(10 * 60_000, Number(process.env.GMTRADE_OFFICIAL_PRICE_MAX_AGE_MS || 90_000)));
const MARKET_DISCOVERY_TTL_MS = Math.max(30_000, Math.min(30 * 60_000, Number(process.env.GMTRADE_MARKET_DISCOVERY_TTL_MS || 10 * 60_000)));

const PYTH_HISTORY_API = 'https://benchmarks.pyth.network/v1/shims/tradingview';
const GMTRADE_WEB_API = String(process.env.GMTRADE_WEB_API || 'https://web-api-server.gmtrade.xyz').replace(/\/+$/, '');
const COINGECKO_GMTRADE_API = String(
  process.env.GMTRADE_COINGECKO_API
  || 'https://api.coingecko.com/api/v3/derivatives/exchanges/gmx-perpetuals-v2-solana?include_tickers=all'
).trim();
const DEFAULT_MARKETS = [
  { symbol: 'SOL', pyth: 'Crypto.SOL/USD', max_leverage: 100, lot_size: '0.01', tick_size: '0.01' },
  { symbol: 'BTC', pyth: 'Crypto.BTC/USD', max_leverage: 100, lot_size: '0.0001', tick_size: '0.1' },
  { symbol: 'ETH', pyth: 'Crypto.ETH/USD', max_leverage: 100, lot_size: '0.001', tick_size: '0.01' },
  { symbol: 'XRP', pyth: 'Crypto.XRP/USD', max_leverage: 50, lot_size: '1', tick_size: '0.0001' },
  { symbol: 'DOGE', pyth: 'Crypto.DOGE/USD', max_leverage: 50, lot_size: '1', tick_size: '0.00001' },
  { symbol: 'SUI', pyth: 'Crypto.SUI/USD', max_leverage: 50, lot_size: '0.1', tick_size: '0.0001' },
  { symbol: 'XAU', pyth: 'Metal.XAU/USD', max_leverage: 200, lot_size: '0.001', tick_size: '0.01' },
  { symbol: 'EUR', pyth: 'FX.EUR/USD', max_leverage: 500, lot_size: '10', tick_size: '0.00001' },
];

let priceCache = { at: 0, prices: {} };
let marketInfoCache = { at: 0, markets: null, prices: null, error: null };
let sdkPromise = null;

function rpcHostLabel(rpcUrl) {
  try {
    const url = new URL(rpcUrl);
    return `${url.hostname}${url.pathname.includes('/v2/') ? '/v2/***' : ''}`;
  } catch {
    return String(rpcUrl || '').replace(/(api[_-]?key=)[^&]+/ig, '$1***').slice(0, 80);
  }
}

function parseJsonEnv(name, fallback = null) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[gmtrade] invalid ${name}:`, e.message);
    return fallback;
  }
}

const GMTRADE_MARKETS = parseJsonEnv('GMTRADE_MARKETS_JSON', {});
const GMTRADE_MARKET_TOKENS = parseJsonEnv('GMTRADE_MARKET_TOKENS_JSON', {});
const GMTRADE_STORE_ADDRESS = String(
  process.env.GMTRADE_STORE_ADDRESS
  || 'CTDLvGGXnoxvqLyTpGzdGLg9pD6JexKxKXSV8tqqo8bN'
).trim();
const GMTRADE_DEFAULT_COLLATERAL_MINT =
  process.env.GMTRADE_COLLATERAL_MINT
  || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const GMTRADE_DEFAULT_COLLATERAL_DECIMALS = Number(process.env.GMTRADE_COLLATERAL_DECIMALS || 6);
const GMTRADE_EXECUTION_LAMPORTS = Number(process.env.GMTRADE_EXECUTION_LAMPORTS || 50_000);
const GMTRADE_ORDER_SOL_BUFFER_LAMPORTS = Math.max(
  0,
  Number(process.env.GMTRADE_ORDER_SOL_BUFFER_LAMPORTS || 10_000_000)
);
const GMTRADE_ORDER_SLIPPAGE_BPS = Number(process.env.GMTRADE_ORDER_SLIPPAGE_BPS || 50);
const GMTRADE_MIN_POSITION_USD = Math.max(0, Number(process.env.GMTRADE_MIN_POSITION_USD || 1));
const GMTRADE_POSITION_VERIFY_SLOT_WINDOW = Math.max(1, Number(process.env.GMTRADE_POSITION_VERIFY_SLOT_WINDOW || 500));
const GMTRADE_ENABLE_NODE_SDK_BUILDER = String(process.env.GMTRADE_ENABLE_NODE_SDK_BUILDER || '1').trim() !== '0';
const GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS = String(process.env.GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS || '').trim() === '1';
const GMTRADE_BACKFILL_SIGNATURE_LIMIT = Math.max(
  1,
  Math.min(1000, Number(process.env.GMTRADE_BACKFILL_SIGNATURE_LIMIT || 300))
);
const GMTRADE_BACKFILL_PAGE_SIZE = Math.max(
  1,
  Math.min(100, Number(process.env.GMTRADE_BACKFILL_PAGE_SIZE || 100))
);
const GMTRADE_TX_MEMO = String(process.env.GMTRADE_TX_MEMO || '').trim();
const GMTRADE_DISCOVER_MARKETS = String(process.env.GMTRADE_DISCOVER_MARKETS || '1').trim() !== '0';
const GMTRADE_MARKET_ACCOUNT_DATA_SIZE = Number(process.env.GMTRADE_MARKET_ACCOUNT_DATA_SIZE || 0);
const GMTRADE_MARKET_SYMBOLS = parseJsonEnv('GMTRADE_MARKET_SYMBOLS_JSON', {});
const GMTRADE_VERIFIED_SOURCES = Object.freeze([
  'gmtrade_tx',
  'gmtrade_position_after_tx',
  'gmtrade_close_tx_client_notional',
]);
const DEFAULT_GMTRADE_MARKET_TOKENS = [
  'DAY6Qr1FKgJQFvjJAhFUZUWHzx8UbbbkRmt6G6AYswWG',
  'AC7iz89CBopxsuzoPU5drW59PB9rZJYpvqaedGxAjFeK',
  '5q5x6DT4viJhTEtiFGkTRyDT9KDmYoGfZF3rERwjV8aV',
  'BvC73rarCMrhEnk3JmqaLntpnrwfUCR5eTrf7HQu6ieg',
  'Dqq58gS1TgRMDouUbdvhhzc51XXTNHG921WLxH9X2eB8',
  '6UU9sF5fryafHDYPcmVcV7ucfnYs6iMVcvb8p7SBQgTc',
  '9JMZj2F9EEMLoJTpftpxSHeixoPZXXkbJ9qLH5vhPXWT',
  '3pHXv5NsrxwkDdus2e1rTHoaNK9zUUnGwcwg1oeeCGzd',
  'CVYjDJknQnKUNFnuGrj75Lv6Pcm4AAencuYSZkQHQDtL',
  'xiLDzynfr7JEoYinAEunZtdz9ubjVAqa5Ap7gJ9y43L',
  'Eck19AsZP2sqGp4oAkrstTrgUmxjF6nQSQxiiHerweLg',
  'FvuQqxh9MJLDXD1FvDdv5X4HecoTEYHJA5558z8ptim4',
  'GErzt3fxfuQScQYtaKGGbgNtdk3LWDmKZ1YVZX2L4Tjc',
  'E6kfBQcdHL3fdWNaydrWViXVtQLTgpxzZicLy98ZNc5v',
  'J42dzcHkgmzU7MARv7k29TrkKaGQ1j2mTaYjkBkN7pn5',
  'FVUbre5BEnWKAN5ZxQ6MUgezS1X2ZUecq4HZDDsa1Q6i',
  'BjEpsvvjca1cQ6KGaeULn6sp8hPsP7XhRvUhepPX181c',
  '2MS6KM17L6JjQfAPfkzjezKre3xKsARdRQVjrdd6Kvmf',
  '527jUvh7guN8Fip96TeJhKWreeWdcwD9CFFwXG9mTiHQ',
  'BeyjceC5eXoq3pkmdoDHrE2UVwuYamAdXkM9GmphZFhE',
  'GX3bpUi5WyoJEjNjrLi3wPqV5xD9WcB1hEedLRSooi4H',
  'sWvE7CfFpES3WCbgeM45ZvAXRm34c9ssdf8PEApTqaX',
  '6dDEEisqtCL6Wh49gAHtXaoE9NkSKXHvLLuTqLPz9sDM',
  '2dVHXNgzC7vvcsDi89S6crSkX3Y6HzPgZfmWqttEzvmo',
  'EE889Nsvqkk3A82GXhxbCbpNkM6Fkqdgp8UNv5sZ2qU',
  '73mxoziw5uKnrXSAKA693b225r5aru1Sdkn9msXznh4R',
  'BwN2FWixP5JyKjJNyD1YcRKN1XhgvFtnzrPrkfyb4DkW',
  '2aGHXNEJAHmsiSVdz5h4stSjnLfohs79iSJdkDdZBs4F',
  '4QX94xP34zFJyeTxJQ4oJ4MeWcuRYViCDmxTjwAYN9Vp',
  '6kKGHF9tPoXvtyAGUY8mfuRCFXBw61xWfhfS4sSJbXFr',
  '5KSsaGZebQSAxZcYuzRz5JWCxoYztWYcfTcRBWLCwoMX',
  '2Ek8kU98XKeH4ErvQcEGoEf2Q2xqBMEK6bfjanypVeZP',
  '7RNev94wKusSmFEqo3gvv1d1zMweP6sa2LtjJjroAvym',
  '2wxH1sGLH4Rui6Ws4F1nFDHtW3aJDG1fAF3gZVJ7ktwV',
  '4x3BBE2tx8fFG2V6BjHEWevo3j3jraYWTAHVfKTt31w2',
  'AyCysi8mWtHWs7TLe13tFPCB515kSQHmBqkszpAeEqbK',
  'C1d1rAehpY5U79593gB7ne7V4CDErYgAcwpvjSMd3dok',
  '7X3EpLG2yW7SzPzz9NYarouQGMsPkYxZJBGEhVkkdXWW',
  '5bi8Ve65rhCjwP2ssmhwTQ7dtfRk5BSo6jYwtrJxkDQH',
  'D8VqUfw81UPnreceozYSHbmwdGizk9C4ekV6fXZqr6YJ',
  'EFdTdjGE6hze8RD4XjwmQJRd8CD9Soq3rbPm53dPcMsx',
  '5Sv9AETZBdR8JGpe3YMZJKzhvQmnLsAgcrfViJ8y8LB7',
  'FWw1tetkZETBz4iyToM7K1VhBMcnQQpHzqbHa1eqkdWe',
  '6udTz3TdPfKRZQ1GF1L372DkpFoFu4Hz2HSpyjdXrMVr',
  '6vUDkCZqCNF2dZnPRHDySDDYvvvVPQGM68qie4cYBQHL',
  'AxsNWzai8PPMBfVHFZxAZbn9wK24z86ozHkbbZCVtFDh',
  'DCfNNYgxCxGUxg9ycQ8T5qHXmPDRt7qA81UGkLha4KWx',
  '6LDgChGwztBmUAqqusSv4VnWeAzUrZvewTDvyAaMynD7',
  'GRT3cFnBkNNTs89wC9Q9qjU9JmZ6XTgu7fF4KRHgW5iR',
  'DWZHgZPGvvCTSAo1GrrEFsCwtRcxrU4BnTQokMMMN9Qe',
  '9vyRjXeJGKgikeQiqbVyL49tXwcMKFNnt5ig3TmsjyKT',
  'J3wiTkP3rfU23zJQX6sUU2z4iGAopC2kBxgGJMmMoY5M',
  'Gi1dxHsgnVLg1JQYqKDWsTfXD9U9GvhPJDg7Has266FL',
  '6KTCEqyMG9eErgSkfbe5QTc6eYnPcgJ4bKK63VZWqZWG',
  '5vBmHGbDrPqJjLC87d8ZHmgt9YHximo5kEcBSnw3aKXs',
  '9uQdTgDAvZgTwPYFGyzTaotAjSZcUKndwhLuzsQt1vto',
  '3oy9VYvMUh9iPRA4adCdGHJLPg2QUAqxupQZoaFR7vwV',
  '4GmYJA45W11rQYsWcq3CHvASY199wTQz2LFj8tQBqqWC',
  'BgiWpn6fEU3duXEyZN49kHwjxMdazkJi1aZrUQGQkWJn',
  'EVDVoXejNDFumTNos8C84nWRTUXPYJqCAdWfei7TwxZC',
  '6D5w1vz5yqLUTXsCpFBUPcZ5AnbHBsgG6XVGpc2ZcttK',
  'CH7pboF6PnCTAuWZbhC1eLKsX6rjd2UAPG87oqsizxR2',
  '6RXHXFAXmAkNkgk59b15ycEKxYrdEYB8Sv7WiyUT24vj',
  '2gYBsHNtxwj6Ydz159frrp7em7rT4KfEnk9a6AXDMyNV',
  '7p6syvfgMsUmCDjsX9wyBtXUk1zZoMH4WYquS83r1Scm',
  'F5EW8CrjYkksMvhm8nWBNY9HepUGLLqcXiq5tRftRPX2',
  'HCEitzjS88T4x3EpZ14EkrcawbhnZdev48a2nQfwAi37',
  'DLX3Aa17ebmyRp6Paxe16wn3QYtNVqdNH9AM9ZKLScfy',
  'FNCNNdBKjM2noAsEZsYbTRX2kXT1T4ig1CV2bjXTimAY',
  'C54H1AwSVGfFUFSwemcnzXTf6ZnWvDrHMnuqVMRXTH97',
  'EatSc7mNnGBa1VoSq867bZntWJFYFmj51u9X3tCLRLRb',
  '5PRmYd1WbEb1onzHAqaxevt6vAU2fCRSBeJBqSsMmkEh',
  'JA3xB9zFPBsWaAeDveLd3ia7maznJdL9qzLP81z5r73Z',
  '6WAqfHvHPixPNMUUUwK4ZiiUkQXe9X87smprTPR3rPqH',
  '5tNb3BpKoU3UsRs2NTmeHeYynyFhQ1bpiaoD5iCrLWSD',
  '996QqBhGoKfNike6G7aURTEoD7SX6CrJQw6DMnq354Nw',
  '3t88GTQgD1Dyi4qX1BeW1zpJ1d4g8wXieFeX5VXpCTNo',
  'HViSi2W1rwNYc5YtPynHADGLtitrmekpQGoGU561Zpoz',
  '4g6FhbTU5gYyqbFSudEsnZ7FgUAb5P9QAogJ6iVM6jYJ',
  'BXcGhms3ZnikNcEzU3ivKZJ8ia2Xn9jV1J6Kn8dUdUUH',
  'EERJDS82NSTazRF9jFdCGUTL6tBPg9FXe1yy7jvuS9V7',
  'CF5KBpj9C3ZP4UnRBaaMbKghCyFGoUDVqAVfxu1ikZho',
  '73LP1hqW5fphVvwX2HrwcHfLce1fLRvS1axH4GqVYNCp',
  'ZTn3eszWBDc96ryfYdmDZYd6cuaZ8WxfSCSG8GJnQ8d',
  'J2dWy224HDioMg5TMWd9jganuMGdiigs5YFZ6QkLVBew',
  'DHtPBDyjAW82GGUV244gZR3TfMtFuYewwQ4qwpPFAsCP',
  '94Mpdu745RWL2eBqu1SvuV2HnX9EfFQSGm3uxvfMBmv6',
];
const BUILTIN_GMTRADE_MARKET_TOKENS = {
  ETH: 'DAY6Qr1FKgJQFvjJAhFUZUWHzx8UbbbkRmt6G6AYswWG',
  BTC: 'Dqq58gS1TgRMDouUbdvhhzc51XXTNHG921WLxH9X2eB8',
  SOL: '6UU9sF5fryafHDYPcmVcV7ucfnYs6iMVcvb8p7SBQgTc',
};
const GMTRADE_RUST_BUILDER_BIN = String(
  process.env.GMTRADE_RUST_BUILDER_BIN
  || path.join(__dirname, 'gmtrade-builder', 'target', 'release', process.platform === 'win32' ? 'gmtrade-builder.exe' : 'gmtrade-builder')
).trim();
const GMTRADE_PROGRAM_IDS = String(
  process.env.GMTRADE_PROGRAM_IDS
  || 'Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo,GTuvYD5SxkTq4FLG6JV1FQ5dkczr1AfgDcBHaFsBdtBg'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const bs58Encode = bs58.encode || bs58.default?.encode;
const bs58Decode = bs58.decode || bs58.default?.decode;
const GMTRADE_MARKET_DECIMALS = 20;
const GMTRADE_PRICE_DECIMALS = 20;
const GMTRADE_TOKEN_AMOUNT_DECIMALS = Number(process.env.GMTRADE_TOKEN_AMOUNT_DECIMALS || 8);
const GMTRADE_CREATE_ORDER_V2_DISCRIMINATOR = Buffer.from([200, 157, 3, 182, 3, 164, 162, 240]);
const GMTRADE_CREATE_ORDER_V2_MIN_SIZE = 99;
const GMTRADE_OFFICIAL_PRICE_DECIMALS = {
  SOL: 9,
  WSOL: 9,
  BTC: 8,
  WBTC: 8,
  ETH: 18,
  WETH: 18,
  USDC: 6,
  XRP: 6,
  DOGE: 8,
  SUI: 9,
  BNB: 18,
  LINK: 18,
  GMX: 18,
  UNI: 18,
  LTC: 8,
  AAVE: 18,
  PEPE: 18,
  BOME: 6,
  BONK: 5,
  WIF: 6,
  TRUMP: 6,
  MELANIA: 6,
  FARTCOIN: 6,
  PUMP: 18,
  WLFI: 18,
  HYPE: 8,
  TRX: 6,
  XLM: 7,
  ADA: 6,
  DOT: 10,
  AVAX: 18,
  ARB: 18,
  NEAR: 24,
  ZEC: 8,
  TAO: 9,
  BCH: 8,
  TON: 9,
  XAU: 18,
  GOLD: 18,
  XAG: 18,
  SILVER: 18,
  WTI: 18,
  WTIOIL: 18,
  EUR: 8,
  GBP: 8,
  AUD: 8,
  NZD: 8,
};
const GMTRADE_OFFICIAL_SYMBOL_ALIASES = {
  WSOL: 'SOL',
  WETH: 'ETH',
  WBTC: 'BTC',
  GOLD: 'XAU',
  XAUT: 'XAU',
  XAUTV2: 'XAU',
  SILVER: 'XAG',
  WTIOIL: 'WTI',
  BRENTOIL: 'BRENT',
};
const GMTRADE_POSITION_DISCRIMINATOR = Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]);
const GMTRADE_ORDER_DISCRIMINATOR = Buffer.from([134, 173, 223, 185, 77, 86, 28, 51]);
const GMTRADE_TRADE_EVENT_DISCRIMINATOR_BYTES = 8;
const GMTRADE_POSITION_STATE_SIZE = 272;
const GMTRADE_POSITION_STATE_SIZE_USD_OFFSET = 64;
const GMTRADE_TRADE_EVENT_MIN_SIZE =
  256 + (GMTRADE_POSITION_STATE_SIZE * 2);
const COMMON_INDEX_TOKEN_SYMBOLS = {
  '11111111111111111111111111111111': 'SOL',
  So1Zu7vPQQxrguzUehKAyVLpjcc769zxgBuDAsxTUMH: 'SOL',
  So11111111111111111111111111111111111111112: 'SOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: 'WIF',
  '2wpTofQ8SkACrkZWrZDjXPitYa8AwWgX8AfxdeBRRVLX': 'LINK',
  BtcTQYRj7HRRk7MwnWiTFj8rWqN2ALt2QYig4cSWqTbv: 'BTC',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': 'BTC',
  EthK4kKnQQUd1Ae1w7sdiMAUaJwq2RMwr7AtscXEdEsF: 'ETH',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'ETH',
  ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82: 'BOME',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  FUAfBo2jgks6gB4Z4LfZkqSZgzNucisEHqnNebaRxM1P: 'MELANIA',
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': 'TRUMP',
  '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump': 'FARTCOIN',
  GmxDsqjKYUrwgbvccGrpF1LoyHPUq8FQqT1FJfkvrMfY: 'GMX',
  DogeJP1vR955QsXWKT1vw5gJsyiTthqPEtJZj8enDWxF: 'DOGE',
  LtcsFqdfsLyoHZ7cRt9BkijqbFRAN1M4fB8naGaykTF: 'LTC',
  Unicsoj67GbDzQyWXQEh9vG5jBiVhMREtWBVDAFVpQq: 'UNI',
  XrpSaeAcbKAGv8P3kWbMbwbq8xcWgR548yvyiKKJUB9: 'XRP',
  BnbuyeSZgnWxXppzkRgiA5TR4t3L9NBRnk6Hbr9m5GsJ: 'BNB',
  AaveaPPwFJx88apsgcpzck7xkohpiZPViKkNndRZJ6pv: 'AAVE',
  PepeCS5SuDLkUwfnhmBLsPsVdpy9WR5bmXT4dkipR9i: 'PEPE',
  SuiyRuzKdsxGgdhVJGg5dDz6wtNSQUAWN21zSdCmYXs: 'SUI',
  BchGdYptcKvUDCpHMDAB5h1MfXq2LPzRLcU8b4r8dQiQ: 'BCH',
  TonDqfXQT4A9oexj8nWdQuUs97Zep5UG5auXByTKe79: 'TON',
  KgV1GvrHQmRBY8sHQQeUKwTm2r2h8t4C8qt12Cw1HVE: 'AVAX',
  TrxYuLyf3WbYPrQ84cjyWgfcEeKTc7m5cKBNBZhY5MN: 'TRX',
  X1mpyVGnE5VhzwbAqLp1FuAW7oY45WPTDisbcEkbVLq: 'XLM',
  AdamfezT5MsUMv5PtSBDWHwPCpcYVyq2CWAseqNbwU7Q: 'ADA',
  DotB5VDVP2VbfETfRsEsWnPH42tBiQZxHjGNH4iaNGSR: 'DOT',
  ShibkCetJam99AeDv93Q4KKVkeLCBSLSmBKNLpwt1ik: 'SHIB',
  pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn: 'PUMP',
  HTHR6CbWSqrVCB83onNwKKH1W3qpGoKbpqvs9sgK7PEC: 'PUMP',
  SpyoXYfv2RmbLkURbxyXvxs83PFFNMiirXgZhBAgxBQ: 'SPY',
  Msftix9DNgRjxF7SXjjqfxjusmaXByNnDc6cdX3Z2qu: 'MSFT',
  AapaFKgsAsCMqSvXBPXqipX5WWxArgnPbADSNfhU9E9J: 'AAPL',
  AmzF1ANXKgmWzm8TLmjAUaZTeqT4gZGV9Xi81yLx1FF9: 'AMZN',
  GooBXeDfVwNPMCvHvGvUtEVxt1GwGzXxL8kqv8YKsAAy: 'GOOGL',
  Metn9UEcTz2oUDL2rBmxrvTvhL2TfYBqvfYnjf1xptt: 'META',
  NvdwZ2PeA9HaCnRu59ZmRXGQJfyaRVTVZuxZ79voGWP: 'NVDA',
  QqqSrHycWaS3f3o4fvEgeVfXfZbqdchUGB3rGxok9qj: 'QQQ',
  Ts1F5Xa8WR4mGqpZ35bhDM56MHf7Zzvq3L6dYGXVdk4: 'TSLA',
  XagEFqWzJtB3XezX6KLQtGkBQDdTpcXYDG7X3EdMH2Y: 'XAG',
  Xauxf2VJhbue14FGbp3W8XwfQSECHYpiPMNMWSCwjSR: 'XAU',
  WLFinEv6ypjkczcS83FZqFpgFZYwQXutRbxGe7oC16g: 'WLFI',
  A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS: 'ZEC',
  TaouYgVPRRT3TUkfTK7fQWkoSM35cbuMVEFAXifsuAf: 'TAO',
  Nearqg83ZH4Wbj2DDeN1EE86CUZaPFX2n8vErWNCPov: 'NEAR',
  EurdPiuWJazzqJLKE4Amb1ZQxVkpwEiSKCZfNgXC9Wi4: 'EUR',
  GbpeVg2NBeL9Q2RDLrYkkkRXNMjaXg4vBZbh2cffH7aG: 'GBP',
  Audg5JLrnh6tRy6WWPRnZ1kh9xiWr2omtP5xdQRTvqQh: 'AUD',
  NzdGr62wT4t1xoHdYoVMEdWPb1yg9WQp2rQa34sscgJ: 'NZD',
  arb61K9FqhdBzLQdwi4aae6MLn94RzbcMs8varqwUt5: 'ARB',
  wtikDoxPLXGSBHacYcLf6SwLQEW5dqGKhErA73QeCrJ: 'WTI',
  xcu22Giuo4jqkDgv3KtfyUrco3a42BFLTnS7XjQ5Taz: 'XCU',
  xptah2VhwW4pcLdkMvUinEsDNvMXpgHiVfG2mmkEuGR: 'XPT',
  xpd2uvvfPfoogQxyrLyqE3NgSHSbkNNXr7bGnJWLB6n: 'XPD',
};
let marketDiscoveryCache = {
  at: 0,
  markets: {},
  rows: [],
  error: null,
};
let marketTokenConfigCache = { at: 0, markets: {}, rows: [], error: null };
let defaultMarketTokenCache = { at: 0, markets: {}, rows: [], error: null };

function randomNonce() {
  if (typeof bs58Encode !== 'function') {
    throw Object.assign(new Error('GMTrade bs58 encoder is not available'), { status: 501 });
  }
  return bs58Encode(crypto.randomBytes(32));
}

function referralUrl(code = GMTRADE_REFERRAL_CODE) {
  if (!code) return GMTRADE_APP_URL;
  const url = new URL('/referrals/', GMTRADE_APP_URL);
  url.searchParams.set('ref', code);
  return url.toString();
}

function isSolanaAddress(value) {
  try {
    const key = new PublicKey(String(value || '').trim());
    return PublicKey.isOnCurve(key.toBytes());
  } catch {
    return false;
  }
}

function isSolanaPubkey(value) {
  try {
    const key = new PublicKey(String(value || '').trim());
    return key.toBytes().length === 32;
  } catch {
    return false;
  }
}

function baseSymbol(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/^\$/, '')
    .split(/[-/]/)[0]
    .replace(/[^A-Z0-9]/g, '');
}

function officialBaseSymbol(value) {
  const sym = baseSymbol(value);
  return GMTRADE_OFFICIAL_SYMBOL_ALIASES[sym] || sym;
}

function tokenDecimalsForSymbol(value, fallback = GMTRADE_TOKEN_AMOUNT_DECIMALS) {
  const sym = officialBaseSymbol(value);
  const decimals = Number(GMTRADE_OFFICIAL_PRICE_DECIMALS[sym]);
  return Number.isFinite(decimals) && decimals >= 0 ? decimals : fallback;
}

function resolveRequestWallet(body = {}, playerWallet = '') {
  const bodyWallet = String(body.wallet || body.address || '').trim();
  const linkedWallet = String(playerWallet || '').trim();
  const wallet = bodyWallet || linkedWallet;
  if (!isSolanaAddress(wallet)) {
    throw Object.assign(new Error('GMTrade linked Solana wallet address required'), { status: 400 });
  }
  return wallet;
}

function normalizeMarketConfig(symbol, cfg) {
  const sym = baseSymbol(symbol || 'SOL');
  if (!cfg) return null;
  const marketToken = cfg.market_token || cfg.marketToken || cfg.market;
  const longToken = cfg.long_token || cfg.longToken;
  const shortToken = cfg.short_token || cfg.shortToken || GMTRADE_DEFAULT_COLLATERAL_MINT;
  const collateralToken = cfg.collateral_token || cfg.collateralToken || cfg.pay_token || cfg.payToken || GMTRADE_DEFAULT_COLLATERAL_MINT;
  return {
    symbol: sym,
    market_token: String(marketToken || ''),
    long_token: String(longToken || ''),
    short_token: String(shortToken || ''),
    collateral_token: String(collateralToken || ''),
    pay_token: String(cfg.pay_token || cfg.payToken || collateralToken || ''),
    receive_token: String(cfg.receive_token || cfg.receiveToken || collateralToken || ''),
    collateral_decimals: Number(cfg.collateral_decimals || cfg.collateralDecimals || GMTRADE_DEFAULT_COLLATERAL_DECIMALS),
    token_decimals: Number(cfg.token_decimals || cfg.tokenDecimals || tokenDecimalsForSymbol(sym)),
    price_decimals: Number(cfg.price_decimals || cfg.priceDecimals || 0) || null,
    source: cfg.source || 'env',
  };
}

function configuredEnvMarketSymbols() {
  return Object.keys(GMTRADE_MARKETS || {}).map(baseSymbol).filter(Boolean);
}

function cachedDiscoveredMarketSymbols() {
  return Object.keys(marketDiscoveryCache.markets || {}).map(baseSymbol).filter(Boolean);
}

function configuredMarketSymbols() {
  return [...new Set([
    ...configuredEnvMarketSymbols(),
    ...configuredMarketTokenSymbols(),
    ...Object.keys(marketTokenConfigCache.markets || {}).map(baseSymbol).filter(Boolean),
    ...Object.keys(defaultMarketTokenCache.markets || {}).map(baseSymbol).filter(Boolean),
    ...cachedDiscoveredMarketSymbols(),
  ])];
}

function envMarketConfig(symbol) {
  const sym = baseSymbol(symbol || 'SOL');
  return normalizeMarketConfig(sym, GMTRADE_MARKETS?.[sym] || GMTRADE_MARKETS?.[`${sym}/USD`] || null);
}

function configuredMarketTokenSymbols() {
  return [
    ...Object.keys(BUILTIN_GMTRADE_MARKET_TOKENS || {}),
    ...Object.keys(GMTRADE_MARKET_TOKENS || {}),
  ].map(baseSymbol).filter(Boolean);
}

function marketTokenForSymbol(symbol) {
  const sym = baseSymbol(symbol || 'SOL');
  const cfg = GMTRADE_MARKET_TOKENS?.[sym] || GMTRADE_MARKET_TOKENS?.[`${sym}/USD`] || null;
  if (!cfg) return BUILTIN_GMTRADE_MARKET_TOKENS[sym] || '';
  if (typeof cfg === 'string') return cfg.trim();
  return String(cfg.market_token || cfg.marketToken || cfg.market || '').trim();
}

function findMarketAddress(marketToken, programId = GMTRADE_PROGRAM_IDS[0]) {
  const [address] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('market'),
      new PublicKey(GMTRADE_STORE_ADDRESS).toBuffer(),
      new PublicKey(marketToken).toBuffer(),
    ],
    new PublicKey(programId)
  );
  return String(address);
}

function findPositionAddress(owner, cfg, isLong, programId = cfg.program_id || GMTRADE_PROGRAM_IDS[0]) {
  const [address] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('position'),
      new PublicKey(GMTRADE_STORE_ADDRESS).toBuffer(),
      new PublicKey(owner).toBuffer(),
      new PublicKey(cfg.market_token).toBuffer(),
      new PublicKey(cfg.collateral_token || cfg.short_token || GMTRADE_DEFAULT_COLLATERAL_MINT).toBuffer(),
      Buffer.from([isLong ? 1 : 2]),
    ],
    new PublicKey(programId)
  );
  return String(address);
}

function findUserAddress(owner, programId = GMTRADE_PROGRAM_IDS[0]) {
  const [address] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('user'),
      new PublicKey(GMTRADE_STORE_ADDRESS).toBuffer(),
      new PublicKey(owner).toBuffer(),
    ],
    new PublicKey(programId)
  );
  return String(address);
}

function gmtradeUserAddressesForWallet(wallet) {
  if (!isSolanaAddress(wallet)) return [];
  const out = [wallet];
  for (const programId of GMTRADE_PROGRAM_IDS) {
    try {
      out.push(findUserAddress(wallet, programId));
    } catch {
      // Ignore stale program ids or malformed input.
    }
  }
  return [...new Set(out.filter(Boolean))];
}

function referralCodeBytes(code = GMTRADE_REFERRAL_CODE) {
  const raw = bs58Decode(String(code || '').trim());
  if (!raw?.length || raw.length > 8) {
    throw Object.assign(new Error('GMTrade referral code must decode to 1-8 bytes'), { status: 400 });
  }
  const out = Buffer.alloc(8);
  Buffer.from(raw).copy(out, 8 - raw.length);
  return out;
}

function findReferralCodeAddress(codeBytes, programId = GMTRADE_PROGRAM_IDS[0]) {
  const [address] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('referral_code'),
      new PublicKey(GMTRADE_STORE_ADDRESS).toBuffer(),
      Buffer.from(codeBytes),
    ],
    new PublicKey(programId)
  );
  return String(address);
}

function decodeReferralCodeAccount(encoded, pubkey = '') {
  const buf = rawBase64ToBuffer(encoded);
  const discriminator = Buffer.from([46, 159, 206, 18, 84, 48, 60, 0]);
  if (buf.length < 82 || !buf.subarray(0, 8).equals(discriminator)) return null;
  return {
    address: pubkey,
    version: buf.readUInt8(8),
    bump: buf.readUInt8(9),
    code_bytes: [...buf.subarray(10, 18)],
    store: new PublicKey(buf.subarray(18, 50)).toBase58(),
    owner: new PublicKey(buf.subarray(50, 82)).toBase58(),
  };
}

function symbolForDiscoveredMarket({ market_token, index_token }) {
  const mapped =
    GMTRADE_MARKET_SYMBOLS?.[market_token]
    || GMTRADE_MARKET_SYMBOLS?.[index_token]
    || COMMON_INDEX_TOKEN_SYMBOLS[index_token];
  return mapped ? baseSymbol(mapped) : '';
}

function marketLookupKeys(value) {
  const raw = String(value || '').trim();
  const keys = [];
  if (raw) keys.push(raw, baseSymbol(raw), `${baseSymbol(raw)}/USD`);
  return [...new Set(keys.filter(Boolean))];
}

async function rpcRequest(method, params) {
  const rpcUrls = GMTRADE_RPC_URLS.length ? GMTRADE_RPC_URLS : [GMTRADE_RPC_URL].filter(Boolean);
  let lastError = null;
  const startedAt = Date.now();
  for (const rpcUrl of rpcUrls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const host = rpcHostLabel(rpcUrl);
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(rpcUrl, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(GMTRADE_RPC_ORIGIN ? { origin: GMTRADE_RPC_ORIGIN } : {}),
          'user-agent': 'ClashOfPerps/1.0 gmtrade',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: `gmtrade-${Date.now()}`, method, params }),
      });
      // eslint-disable-next-line no-await-in-loop
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!res.ok || data?.error || !data || !Object.prototype.hasOwnProperty.call(data, 'result')) {
        const detail = data?.error?.message || text || `HTTP ${res.status}`;
        throw new Error(`GMTrade RPC ${method} failed on ${new URL(rpcUrl).host}: ${detail}`);
      }
      if (Date.now() - startedAt > 1000 || rpcUrls.indexOf(rpcUrl) > 0) {
        console.info('[gmtrade] RPC success:', method, host, `${Date.now() - startedAt}ms`);
      }
      return data?.result;
    } catch (e) {
      lastError = e;
      if (rpcUrls.length > 1) {
        console.warn('[gmtrade] RPC fallback:', method, host, e.message);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error(`GMTrade RPC ${method} failed: no RPC endpoint configured`);
}

async function rpcAccountInfo(address) {
  const result = await rpcRequest('getAccountInfo', [
    address,
    { encoding: 'base64', commitment: 'confirmed' },
  ]);
  return result?.value || null;
}

async function rpcMultipleAccountInfos(addresses) {
  if (!addresses.length) return [];
  const result = await rpcRequest('getMultipleAccounts', [
    addresses,
    { encoding: 'base64', commitment: 'confirmed' },
  ]);
  return Array.isArray(result?.value) ? result.value : [];
}

async function rpcProgramAccounts(programId, config = {}) {
  return rpcRequest('getProgramAccounts', [
    programId,
    {
      encoding: 'base64',
      commitment: 'confirmed',
      ...config,
    },
  ]);
}

async function rpcLatestBlockhash() {
  const result = await rpcRequest('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return result?.value || {};
}

async function rpcBalanceLamports(address) {
  const result = await rpcRequest('getBalance', [
    address,
    { commitment: 'confirmed' },
  ]);
  return Number(result?.value || 0);
}

async function rpcTransaction(signature) {
  return rpcRequest('getTransaction', [
    signature,
    {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
      encoding: 'json',
    },
  ]);
}

async function rpcSignaturesForAddress(address, options = {}) {
  const config = {
    limit: Math.max(1, Math.min(100, Number(options.limit || 40))),
    commitment: 'confirmed',
  };
  if (options.before) config.before = String(options.before);
  if (options.until) config.until = String(options.until);
  return rpcRequest('getSignaturesForAddress', [address, config]);
}

async function getWalletUsdcBalance(address) {
  if (!isSolanaAddress(address)) return 0;
  const result = await rpcRequest('getTokenAccountsByOwner', [
    address,
    { mint: GMTRADE_DEFAULT_COLLATERAL_MINT },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  const rows = Array.isArray(result?.value) ? result.value : [];
  return rows.reduce((sum, row) => {
    const uiAmount = Number(row?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
    return sum + (Number.isFinite(uiAmount) ? uiAmount : 0);
  }, 0);
}

async function getWalletSolBalance(address) {
  if (!isSolanaAddress(address)) return 0;
  const lamports = await rpcBalanceLamports(address);
  return Number.isFinite(lamports) && lamports > 0 ? lamports / 1e9 : 0;
}

async function configFromMarketToken(symbol) {
  const raw = String(symbol || 'SOL').trim();
  const sym = baseSymbol(raw || 'SOL');
  const directToken = isSolanaPubkey(raw) ? raw : '';
  const cached =
    marketTokenConfigCache.markets?.[raw]
    || marketTokenConfigCache.markets?.[sym]
    || (directToken ? marketTokenConfigCache.markets?.[directToken] : null);
  if (cached && Date.now() - marketTokenConfigCache.at < MARKET_DISCOVERY_TTL_MS) return cached;
  const token = directToken || marketTokenForSymbol(sym);
  if (!token) return null;
  try {
    assertPubkey(GMTRADE_STORE_ADDRESS, 'store');
    const sdk = await gmsolSdk();
    let lastError = null;
    for (const programId of GMTRADE_PROGRAM_IDS) {
      try {
        const marketAccount = findMarketAddress(token, programId);
        const account = await rpcAccountInfo(marketAccount);
        const encoded = Array.isArray(account?.data) ? account.data[0] : account?.data;
        if (!encoded) continue;
        const market = sdk.Market.decode_from_base64(encoded);
        const decoded = normalizeMarketConfig(sym, {
          market_token: market.market_token_address(),
          long_token: market.long_token_address(),
          short_token: market.short_token_address(),
          collateral_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
          pay_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
          receive_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
          collateral_decimals: GMTRADE_DEFAULT_COLLATERAL_DECIMALS,
          index_token: market.index_token_address(),
          source: 'market_token_pda',
        });
        const resolvedSymbol = directToken ? (symbolForDiscoveredMarket({
          market_token: market.market_token_address(),
          index_token: market.index_token_address(),
        }) || sym) : sym;
        const row = {
          ...decoded,
          symbol: resolvedSymbol,
          token_decimals: tokenDecimalsForSymbol(resolvedSymbol, decoded.token_decimals),
          index_token: market.index_token_address(),
          account: marketAccount,
          program_id: programId,
        };
        marketTokenConfigCache = {
          at: Date.now(),
          markets: { ...marketTokenConfigCache.markets, [row.symbol]: row, [sym]: row, [token]: row },
          rows: [...marketTokenConfigCache.rows.filter(r => r.symbol !== row.symbol && r.market_token !== token), row],
          error: null,
        };
        return row;
      } catch (e) {
        lastError = e;
      }
    }
    marketTokenConfigCache = { ...marketTokenConfigCache, at: Date.now(), error: lastError?.message || 'market token account not found' };
    return null;
  } catch (e) {
    marketTokenConfigCache = { ...marketTokenConfigCache, at: Date.now(), error: e.message };
    return null;
  }
}

async function discoverDefaultMarketTokenConfigs({ force = false } = {}) {
  if (!force && Date.now() - defaultMarketTokenCache.at < MARKET_DISCOVERY_TTL_MS) {
    return defaultMarketTokenCache;
  }
  try {
    assertPubkey(GMTRADE_STORE_ADDRESS, 'store');
    const sdk = await gmsolSdk();
    const rows = [];
    const bySymbol = {};
    const seenAccounts = new Set();
    for (const programId of GMTRADE_PROGRAM_IDS) {
      const entries = DEFAULT_GMTRADE_MARKET_TOKENS.map((marketToken) => {
        try {
          return {
            marketToken,
            account: findMarketAddress(marketToken, programId),
            programId,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
      const uniqueEntries = entries.filter((entry) => {
        const key = `${entry.programId}:${entry.account}`;
        if (seenAccounts.has(key)) return false;
        seenAccounts.add(key);
        return true;
      });
      for (let i = 0; i < uniqueEntries.length; i += 100) {
        const chunk = uniqueEntries.slice(i, i + 100);
        const accounts = await rpcMultipleAccountInfos(chunk.map(entry => entry.account));
        accounts.forEach((account, index) => {
          const entry = chunk[index];
          const encoded = Array.isArray(account?.data) ? account.data[0] : account?.data;
          if (!encoded) return;
          try {
            const market = sdk.Market.decode_from_base64(encoded);
            const marketToken = market.market_token_address();
            const longToken = market.long_token_address();
            const shortToken = market.short_token_address();
            const indexToken = market.index_token_address();
            const symbol = symbolForDiscoveredMarket({
              market_token: marketToken,
              index_token: indexToken,
            }) || marketToken;
            const decoded = {
              ...normalizeMarketConfig(symbol, {
                market_token: marketToken,
                long_token: longToken,
                short_token: shortToken,
                collateral_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
                pay_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
                receive_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
                collateral_decimals: GMTRADE_DEFAULT_COLLATERAL_DECIMALS,
                index_token: indexToken,
                source: 'official_app_market_token_registry',
              }),
              symbol,
              index_token: indexToken,
              account: entry.account,
              program_id: entry.programId,
            };
            rows.push(decoded);
            if (!bySymbol[symbol]) bySymbol[symbol] = decoded;
            bySymbol[marketToken] = decoded;
          } catch {
            // Ignore non-market accounts if the upstream registry changes.
          }
        });
      }
    }
    defaultMarketTokenCache = { at: Date.now(), markets: bySymbol, rows, error: null };
    return defaultMarketTokenCache;
  } catch (e) {
    defaultMarketTokenCache = {
      ...defaultMarketTokenCache,
      at: Date.now(),
      error: e.message,
    };
    return defaultMarketTokenCache;
  }
}

async function discoverGmtradeMarkets({ force = false } = {}) {
  if (!GMTRADE_DISCOVER_MARKETS) return marketDiscoveryCache;
  if (!force && Date.now() - marketDiscoveryCache.at < MARKET_DISCOVERY_TTL_MS) {
    return marketDiscoveryCache;
  }
  try {
    const sdk = await gmsolSdk();
    const rows = [];
    const bySymbol = {};
    for (const programId of GMTRADE_PROGRAM_IDS) {
      const accountConfig = {
        encoding: 'base64',
        commitment: 'confirmed',
      };
      if (Number.isFinite(GMTRADE_MARKET_ACCOUNT_DATA_SIZE) && GMTRADE_MARKET_ACCOUNT_DATA_SIZE > 0) {
        accountConfig.filters = [{ dataSize: GMTRADE_MARKET_ACCOUNT_DATA_SIZE }];
      }
      const accounts = await rpcRequest('getProgramAccounts', [programId, accountConfig]);
      for (const row of Array.isArray(accounts) ? accounts : []) {
        const encoded = Array.isArray(row?.account?.data) ? row.account.data[0] : row?.account?.data;
        if (!encoded) continue;
        try {
          const market = sdk.Market.decode_from_base64(encoded);
          const marketToken = market.market_token_address();
          const longToken = market.long_token_address();
          const shortToken = market.short_token_address();
          const indexToken = market.index_token_address();
          const symbol = symbolForDiscoveredMarket({
            market_token: marketToken,
            index_token: indexToken,
          });
          const normalized = normalizeMarketConfig(symbol || marketToken, {
            market_token: marketToken,
            long_token: longToken,
            short_token: shortToken,
            collateral_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
            pay_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
            receive_token: GMTRADE_DEFAULT_COLLATERAL_MINT,
            collateral_decimals: GMTRADE_DEFAULT_COLLATERAL_DECIMALS,
            index_token: indexToken,
            source: 'onchain_discovery',
          });
          const discovered = {
            ...normalized,
            symbol: symbol || marketToken,
            index_token: indexToken,
            account: String(row.pubkey || ''),
            program_id: programId,
          };
          rows.push(discovered);
          bySymbol[discovered.symbol] = discovered;
          bySymbol[marketToken] = discovered;
        } catch {
          // The GMSOL store program owns several account types. Ignore accounts
          // that are not Market accounts.
        }
      }
    }
    marketDiscoveryCache = { at: Date.now(), markets: bySymbol, rows, error: null };
    return marketDiscoveryCache;
  } catch (e) {
    marketDiscoveryCache = {
      ...marketDiscoveryCache,
      at: Date.now(),
      error: e.message,
    };
    return marketDiscoveryCache;
  }
}

async function resolveMarketConfig(symbol) {
  for (const key of marketLookupKeys(symbol || 'SOL')) {
    const cfg = envMarketConfig(key);
    if (cfg) return cfg;
  }
  for (const key of marketLookupKeys(symbol || 'SOL')) {
    const cfg = await configFromMarketToken(key);
    if (cfg) return cfg;
  }
  const defaultRegistry = await discoverDefaultMarketTokenConfigs();
  for (const key of marketLookupKeys(symbol || 'SOL')) {
    const cfg = defaultRegistry.markets?.[key] || defaultRegistry.markets?.[baseSymbol(key)];
    if (cfg) return cfg;
  }
  const discovered = await discoverGmtradeMarkets();
  for (const key of marketLookupKeys(symbol || 'SOL')) {
    const cfg = discovered.markets?.[key] || discovered.markets?.[baseSymbol(key)];
    if (cfg) return cfg;
  }
  return null;
}

function assertPubkey(value, label) {
  try {
    return String(new PublicKey(String(value || '').trim()));
  } catch {
    throw Object.assign(new Error(`GMTrade ${label} address is missing or invalid`), { status: 501 });
  }
}

function decimalToBigInt(value, decimals) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw Object.assign(new Error('GMTrade numeric value must be a positive decimal'), { status: 400 });
  }
  const [whole, frac = ''] = text.split('.');
  const scale = Math.max(0, Number(decimals) || 0);
  const padded = `${frac}${'0'.repeat(scale)}`.slice(0, scale);
  return BigInt(whole || '0') * (10n ** BigInt(scale)) + BigInt(padded || '0');
}

function stableDecimalString(value, label, options = {}) {
  const {
    decimals = 6,
    min = 0,
    max = 1_000_000_000,
    allowZero = false,
  } = options;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || (!allowZero && n <= 0) || n > max) {
    throw Object.assign(new Error(`GMTrade ${label} out of range`), { status: 400 });
  }
  const scale = Math.max(0, Math.min(12, Number(decimals) || 0));
  const text = n.toFixed(scale).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw Object.assign(new Error(`GMTrade ${label} must be a plain decimal`), { status: 400 });
  }
  if (!allowZero && decimalToBigInt(text, scale) <= 0n) {
    throw Object.assign(new Error(`GMTrade ${label} is too small`), { status: 400 });
  }
  return text;
}

function stableNumber(value, label, options = {}) {
  const text = stableDecimalString(value, label, options);
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error(`GMTrade ${label} out of range`), { status: 400 });
  }
  return n;
}

function usdToGmUnits(value) {
  return decimalToBigInt(value, GMTRADE_MARKET_DECIMALS);
}

function gmRawUsdToNumber(value) {
  return Number(value) / (10 ** GMTRADE_MARKET_DECIMALS);
}

function gmUnitPriceDecimals(cfg = {}) {
  const explicit = Number(cfg.price_decimals || cfg.priceDecimals || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const tokenDecimals = Number(cfg.token_decimals || cfg.tokenDecimals || GMTRADE_TOKEN_AMOUNT_DECIMALS);
  return Math.max(0, GMTRADE_MARKET_DECIMALS - (Number.isFinite(tokenDecimals) ? tokenDecimals : GMTRADE_TOKEN_AMOUNT_DECIMALS));
}

function priceToGmUnitPrice(value, cfg = {}) {
  return decimalToBigInt(value, gmUnitPriceDecimals(cfg));
}

function readU64Le(buf, offset) {
  if (offset + 8 > buf.length) throw new Error('GMTrade event is truncated');
  return buf.readBigUInt64LE(offset);
}

function readI64Le(buf, offset) {
  if (offset + 8 > buf.length) throw new Error('GMTrade event is truncated');
  return buf.readBigInt64LE(offset);
}

function readU128Le(buf, offset) {
  if (offset + 16 > buf.length) throw new Error('GMTrade event is truncated');
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigUInt64LE(offset + 8);
  return lo + (hi << 64n);
}

function readPubkey(buf, offset) {
  if (offset + 32 > buf.length) throw new Error('GMTrade event is truncated');
  if (typeof bs58Encode !== 'function') throw new Error('GMTrade bs58 encoder is not available');
  return bs58Encode(buf.subarray(offset, offset + 32));
}

function decodeGmtradeTradeEventBuffer(buf, offset = 0) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf || []);
  if (buf.length - offset < GMTRADE_TRADE_EVENT_MIN_SIZE) {
    throw new Error('GMTrade trade event is too short');
  }
  const flags = buf.readUInt8(offset);
  const beforeOffset = offset + 256;
  const afterOffset = beforeOffset + GMTRADE_POSITION_STATE_SIZE;
  const beforeSize = readU128Le(buf, beforeOffset + GMTRADE_POSITION_STATE_SIZE_USD_OFFSET);
  const afterSize = readU128Le(buf, afterOffset + GMTRADE_POSITION_STATE_SIZE_USD_OFFSET);
  const isIncrease = (flags & (1 << 2)) !== 0 || afterSize >= beforeSize;
  const sizeDelta = afterSize >= beforeSize ? afterSize - beforeSize : beforeSize - afterSize;
  return {
    user: readPubkey(buf, offset + 112),
    store: readPubkey(buf, offset + 48),
    market_token: readPubkey(buf, offset + 80),
    order: readPubkey(buf, offset + 176),
    position: readPubkey(buf, offset + 144),
    side: (flags & 1) ? 'long' : 'short',
    is_increase: isIncrease,
    size_delta_raw: String(sizeDelta),
    size_delta_usd: gmRawUsdToNumber(sizeDelta),
    before_size_raw: String(beforeSize),
    after_size_raw: String(afterSize),
    trade_id: String(readU64Le(buf, offset + 8)),
    slot: Number(readU64Le(buf, offset + 248)),
    ts: Number(readI64Le(buf, offset + 240)),
    decoder: 'node_layout_gmsol_trade_event',
  };
}

function decodeGmtradeTradeEvent(encoded) {
  const raw = Buffer.from(String(encoded || '').trim(), 'base64');
  const attempts = [
    () => decodeGmtradeTradeEventBuffer(raw, GMTRADE_TRADE_EVENT_DISCRIMINATOR_BYTES),
    () => decodeGmtradeTradeEventBuffer(raw, 0),
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const ev = attempt();
      if (ev.size_delta_usd > 0 && isSolanaAddress(ev.user)) return ev;
      lastError = new Error('decoded GMTrade event did not contain a positive trade size');
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('GMTrade trade event decode failed');
}

function decodeGmtradeCreateOrderV2Instruction(ix, accountKeys = []) {
  if (!ix) return null;
  let buf;
  try {
    if (Buffer.isBuffer(ix.data)) {
      buf = Buffer.from(ix.data);
    } else if (ix.data instanceof Uint8Array) {
      buf = Buffer.from(ix.data);
    } else if (typeof ix.data === 'string' && typeof bs58Decode === 'function') {
      buf = Buffer.from(bs58Decode(String(ix.data || '').trim()));
    } else {
      return null;
    }
  } catch {
    return null;
  }
  if (buf.length < GMTRADE_CREATE_ORDER_V2_MIN_SIZE) return null;
  if (!buf.subarray(0, 8).equals(GMTRADE_CREATE_ORDER_V2_DISCRIMINATOR)) return null;
  const kind = buf.readUInt8(40);
  const sizeRaw = readU128Le(buf, 59);
  const sizeUsd = gmRawUsdToNumber(sizeRaw);
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0 || sizeUsd > 10_000_000) return null;
  const accounts = Array.isArray(ix.accounts)
    ? ix.accounts
    : Array.isArray(ix.accountKeyIndexes)
    ? ix.accountKeyIndexes
    : [];
  const accountAt = (idx) => {
    const keyIdx = Number(accounts[idx]);
    return Number.isInteger(keyIdx) ? String(accountKeys[keyIdx] || '') : '';
  };
  const marginRaw = readU64Le(buf, 51);
  const isLong = buf.readUInt8(75) === 1;
  return {
    user: accountAt(4),
    order: accountAt(5),
    position: accountAt(6),
    market_token: accountAt(3),
    collateral_token: accountAt(7),
    side: isLong ? 'long' : 'short',
    is_increase: /Increase/i.test(orderKindName(kind)),
    kind,
    kind_name: orderKindName(kind),
    margin_raw: String(marginRaw),
    margin_usd: decimalNumber(marginRaw, GMTRADE_DEFAULT_COLLATERAL_DECIMALS),
    size_delta_raw: String(sizeRaw),
    size_delta_usd: sizeUsd,
    decoder: 'node_layout_gmsol_create_order_v2',
  };
}

function decodeGmtradeCreateOrderV2Instructions(tx, accountKeys = []) {
  const out = [];
  const instructions = tx?.transaction?.message?.instructions
    || tx?.transaction?.message?.compiledInstructions
    || [];
  for (const ix of instructions) {
    const programId = String(accountKeys[Number(ix?.programIdIndex)] || '');
    if (!GMTRADE_PROGRAM_IDS.includes(programId)) continue;
    const decoded = decodeGmtradeCreateOrderV2Instruction(ix, accountKeys);
    if (decoded) out.push(decoded);
  }
  return out;
}

function decodeTradeEventsLocally(events) {
  const decoded = [];
  for (const encoded of events || []) {
    try {
      decoded.push(decodeGmtradeTradeEvent(encoded));
    } catch {
      // Other Anchor events can share Program data logs. Ignore non-trade events.
    }
  }
  return decoded;
}

function decodeTradeEventsFromInnerInstructions(tx, accountKeys = []) {
  const decoded = [];
  const seen = new Set();
  const innerRows = tx?.meta?.innerInstructions || [];
  const offsets = [GMTRADE_TRADE_EVENT_DISCRIMINATOR_BYTES, 16, 0];
  for (const row of innerRows) {
    for (const ix of row?.instructions || []) {
      const programId = String(accountKeys[Number(ix?.programIdIndex)] || '');
      if (!GMTRADE_PROGRAM_IDS.includes(programId)) continue;
      let buf;
      try {
        if (Buffer.isBuffer(ix.data)) {
          buf = Buffer.from(ix.data);
        } else if (ix.data instanceof Uint8Array) {
          buf = Buffer.from(ix.data);
        } else if (typeof ix.data === 'string' && typeof bs58Decode === 'function') {
          buf = Buffer.from(bs58Decode(String(ix.data || '').trim()));
        } else {
          continue;
        }
      } catch {
        continue;
      }
      if (buf.length < GMTRADE_TRADE_EVENT_MIN_SIZE) continue;
      for (const offset of offsets) {
        try {
          const event = decodeGmtradeTradeEventBuffer(buf, offset);
          const size = Number(event?.size_delta_usd || 0);
          const slotOk = Number(event?.slot || 0) === Number(tx?.slot || 0);
          if (!slotOk || event.store !== GMTRADE_STORE_ADDRESS || !isSolanaAddress(event.user) || !(size > 0 && size <= 10_000_000)) {
            continue;
          }
          const key = `${event.trade_id}:${event.user}:${event.order}:${event.position}:${event.size_delta_raw}`;
          if (seen.has(key)) continue;
          seen.add(key);
          decoded.push({
            ...event,
            decoder: 'node_layout_gmsol_inner_trade_event',
          });
        } catch {
          // Inner instructions include many CPI payloads. Only TradeEvent layouts pass validation above.
        }
      }
    }
  }
  return decoded;
}

async function gmsolSdk() {
  if (!sdkPromise) {
    if (typeof globalThis.module?.require !== 'function' && typeof module?.require === 'function') {
      globalThis.module = module;
    }
    if (typeof globalThis.require !== 'function' && typeof require === 'function') {
      globalThis.require = require;
    }
    sdkPromise = import('@gmsol-labs/gmsol-sdk');
  }
  return sdkPromise;
}

function rustBuilderAvailable() {
  return !!GMTRADE_RUST_BUILDER_BIN && fs.existsSync(GMTRADE_RUST_BUILDER_BIN);
}

function runRustBuilder(payload) {
  return new Promise((resolve, reject) => {
    if (!rustBuilderAvailable()) {
      reject(Object.assign(new Error('GMTrade Rust builder binary is not available'), { status: 501 }));
      return;
    }
    const child = spawn(GMTRADE_RUST_BUILDER_BIN, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', err => reject(Object.assign(err, { status: 501 })));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(Object.assign(new Error((stderr || stdout || `GMTrade Rust builder exited ${code}`).trim()), { status: 502 }));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(Object.assign(new Error(`GMTrade Rust builder returned invalid JSON: ${e.message}`), { status: 502 }));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function decodeTradeEventsWithRust(events) {
  if (!Array.isArray(events) || !events.length) return [];
  const decoded = await runRustBuilder({ action: 'decode_trade_events', events });
  return Array.isArray(decoded?.events) ? decoded.events : [];
}

function extractProgramDataLogs(logMessages = []) {
  const out = [];
  for (const line of logMessages || []) {
    const text = String(line || '').trim();
    const match = text.match(/^Program data:\s+([1-9A-HJ-NP-Za-km-z+/=]+)$/);
    if (match?.[1]) out.push(match[1]);
  }
  return out;
}

function normalizeSide(side) {
  const s = String(side || '').toLowerCase();
  if (s === 'long' || s === 'buy' || s === 'bid') return 'long';
  if (s === 'short' || s === 'sell' || s === 'ask') return 'short';
  if (s.includes('close') && s.includes('long')) return 'close_long';
  if (s.includes('close') && s.includes('short')) return 'close_short';
  return s || 'long';
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ClashOfPerps/1.0 gmtrade',
      },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(`GMTrade data request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function pythPrice(symbol) {
  const market = DEFAULT_MARKETS.find(m => m.symbol === symbol);
  if (!market?.pyth) return null;
  const now = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    symbol: market.pyth,
    resolution: '1',
    from: String(now - 1800),
    to: String(now),
  });
  const data = await fetchJson(`${PYTH_HISTORY_API}/history?${qs.toString()}`);
  const close = Array.isArray(data?.c) ? data.c.filter(Number.isFinite).pop() : null;
  const open = Array.isArray(data?.o) ? data.o.find(Number.isFinite) : null;
  if (!Number.isFinite(Number(close)) || Number(close) <= 0) return null;
  return {
    symbol,
    mark: String(close),
    oracle: String(close),
    yesterday_price: String(open || close),
    volume_24h: '0',
    open_interest: '0',
    funding_rate: '0',
  };
}

function normalizeOfficialPriceSymbol(symbol) {
  const clean = baseSymbol(String(symbol || '').replace(/[^a-z0-9]/ig, ''));
  return GMTRADE_OFFICIAL_SYMBOL_ALIASES[clean] || clean;
}

function officialRawPriceToNumber(raw, symbol) {
  const dec = GMTRADE_OFFICIAL_PRICE_DECIMALS[baseSymbol(symbol)] ?? 18;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / (10 ** Math.max(0, 30 - dec));
}

async function getOfficialPriceSnapshot() {
  const rows = await fetchJson(`${GMTRADE_WEB_API}/cache/prices/tickers`);
  const prices = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const symbol = normalizeOfficialPriceSymbol(row?.tokenSymbol);
    if (!symbol) continue;
    const min = officialRawPriceToNumber(row.minPrice, symbol);
    const max = officialRawPriceToNumber(row.maxPrice, symbol);
    const mid = min > 0 && max > 0 ? (min + max) / 2 : (max || min || 0);
    if (!(mid > 0)) continue;
    const prev = prices[symbol];
    const rawUpdatedAt = Number(row.updatedAt || row.timestamp || 0);
    const updatedAt = rawUpdatedAt > 0 && rawUpdatedAt < 1_000_000_000_000
      ? rawUpdatedAt * 1000
      : rawUpdatedAt;
    if (updatedAt > 0 && Date.now() - updatedAt > OFFICIAL_PRICE_MAX_AGE_MS) continue;
    if (prev && Number(prev.updated_at || 0) > updatedAt) continue;
    prices[symbol] = {
      symbol,
      mark: String(mid),
      oracle: String(mid),
      min_price: String(min || mid),
      max_price: String(max || mid),
      yesterday_price: String(mid),
      volume_24h: String(prev?.volume_24h || 0),
      open_interest: String(prev?.open_interest || 0),
      funding_rate: String(prev?.funding_rate || 0),
      source: 'gmtrade_official_price_cache',
      updated_at: updatedAt,
    };
  }
  return prices;
}

function parseGmtradeTickerSymbol(symbol) {
  const text = String(symbol || '').trim();
  const match = text.match(/^([^/]+)\/USD(?:\[([^\]-]+)-([^\]]+)\])?/i);
  if (!match) return null;
  return {
    symbol: baseSymbol(match[1]),
    pool_long: match[2] ? baseSymbol(match[2]) : null,
    pool_short: match[3] ? baseSymbol(match[3]) : null,
  };
}

function normalizeCoingeckoTicker(ticker) {
  const parsed = parseGmtradeTickerSymbol(ticker?.symbol);
  if (!parsed?.symbol) return null;
  const maxLeverage = parsed.symbol === 'XAU' || parsed.symbol.length <= 4 ? 100 : 50;
  const last = Number(ticker.last || ticker.index || 0);
  const index = Number(ticker.index || ticker.last || 0);
  return {
    symbol: parsed.symbol,
    base: parsed.symbol,
    pair: `${parsed.symbol}/USD`,
    market: `${parsed.symbol}/USD`,
    market_name: ticker.symbol || `${parsed.symbol}/USD`,
    pool: parsed.pool_long && parsed.pool_short ? `${parsed.pool_long}-${parsed.pool_short}` : null,
    max_leverage: maxLeverage,
    lot_size: last >= 1000 ? '0.0001' : last >= 1 ? '0.01' : '1',
    tick_size: last >= 1000 ? '0.1' : last >= 1 ? '0.01' : '0.00001',
    min_order_size: String(GMTRADE_MIN_POSITION_USD),
    mark: Number.isFinite(last) ? last : 0,
    oracle: Number.isFinite(index) ? index : last || 0,
    funding_rate: Number(ticker.funding_rate || 0),
    next_funding_rate: Number(ticker.funding_rate || 0),
    volume_24h: Number(ticker.converted_volume?.usd || ticker.h24_volume || 0),
    open_interest: Number(ticker.open_interest_usd || 0),
    price_change_24h_pct: Number(ticker.h24_percentage_change || 0),
    trade_url: ticker.trade_url || GMTRADE_APP_URL,
    source: 'coingecko_gmtrade',
  };
}

async function getCoingeckoMarketSnapshot() {
  if (Date.now() - marketInfoCache.at < PUBLIC_CACHE_TTL_MS && marketInfoCache.markets) {
    return marketInfoCache;
  }
  try {
    const data = await fetchJson(COINGECKO_GMTRADE_API);
    const tickers = Array.isArray(data?.tickers) ? data.tickers : [];
    const bySymbol = new Map();
    for (const ticker of tickers) {
      const row = normalizeCoingeckoTicker(ticker);
      if (!row) continue;
      const prev = bySymbol.get(row.symbol);
      if (!prev || Number(row.volume_24h || 0) > Number(prev.volume_24h || 0)) {
        bySymbol.set(row.symbol, row);
      }
    }
    const markets = [...bySymbol.values()].sort((a, b) => Number(b.volume_24h || 0) - Number(a.volume_24h || 0));
    const prices = {};
    for (const row of markets) {
      prices[row.symbol] = {
        symbol: row.symbol,
        mark: String(row.mark || row.oracle || 0),
        oracle: String(row.oracle || row.mark || 0),
        yesterday_price: String(row.mark || row.oracle || 0),
        volume_24h: String(row.volume_24h || 0),
        open_interest: String(row.open_interest || 0),
        funding_rate: String(row.funding_rate || 0),
        source: 'coingecko_gmtrade',
      };
    }
    marketInfoCache = { at: Date.now(), markets, prices, error: null };
    return marketInfoCache;
  } catch (e) {
    marketInfoCache = { ...marketInfoCache, at: Date.now(), error: e.message };
    return marketInfoCache;
  }
}

function saneGmtradeOfficialPrice(symbol, officialRow, referenceRow) {
  const official = Number(officialRow?.mark || officialRow?.oracle || 0);
  const reference = Number(referenceRow?.mark || referenceRow?.oracle || 0);
  if (!Number.isFinite(official) || official <= 0) return false;
  if (!Number.isFinite(reference) || reference <= 0) return true;
  const ratio = official / reference;
  return ratio >= 0.01 && ratio <= 100;
}

function ensureNonMarketableGmtradeLimit({ kind, side, price, mark }) {
  if (kind !== 'LimitIncrease' && kind !== 'LimitDecrease') return;
  const p = Number(price);
  const m = Number(mark);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(m) || m <= 0) return;
  const isLong = side === 'long' || side === 'close_long';
  const isDecrease = kind === 'LimitDecrease';
  const isMarketable = isDecrease
    ? (isLong ? p <= m : p >= m)
    : (isLong ? p >= m : p <= m);
  if (!isMarketable) return;
  const direction = isDecrease
    ? (isLong ? 'above' : 'below')
    : (isLong ? 'below' : 'above');
  throw Object.assign(
    new Error(`GMTrade limit price is marketable at the current mark ($${m.toFixed(4)}). Use Market, or place the limit ${direction} mark price.`),
    {
      status: 400,
      code: 'GMTRADE_MARKETABLE_LIMIT',
      mark_price: m,
      limit_price: p,
      kind,
      side,
    },
  );
}

async function getPrices() {
  if (Date.now() - priceCache.at < PRICE_CACHE_TTL_MS && priceCache.prices && Object.keys(priceCache.prices).length) {
    return priceCache.prices;
  }
  const prices = {};
  try {
    const official = await getOfficialPriceSnapshot();
    for (const [symbol, row] of Object.entries(official)) {
      prices[symbol] = {
        ...row,
      };
    }
  } catch (e) {
    console.warn('[gmtrade] official price cache failed:', e.message);
  }
  const entries = await Promise.all(DEFAULT_MARKETS.map(async (m) => {
    try {
      const row = await pythPrice(m.symbol);
      return row ? [m.symbol, row] : null;
    } catch {
      return null;
    }
  }));
  for (const entry of entries) {
    if (entry && !prices[entry[0]]) {
      prices[entry[0]] = entry[1];
      console.log(`[gmtrade] price fallback pyth symbol=${entry[0]} mark=${entry[1].mark}`);
    }
  }
  const cg = await getCoingeckoMarketSnapshot();
  for (const [symbol, row] of Object.entries(cg.prices || {})) {
    const prev = prices[symbol] || {};
    const keepOfficial = saneGmtradeOfficialPrice(symbol, prev, row);
    if (prev?.source === 'gmtrade_official_price_cache' && !keepOfficial) {
      console.warn('[gmtrade] official price rejected by sanity check', {
        symbol,
        official: prev.mark,
        coingecko: row.mark,
      });
    }
    prices[symbol] = {
      ...row,
      ...(keepOfficial ? prev : {}),
      source: keepOfficial ? (prev.source || row.source) : row.source,
      volume_24h: row.volume_24h || prev.volume_24h || '0',
      open_interest: row.open_interest || prev.open_interest || '0',
      funding_rate: row.funding_rate || prev.funding_rate || '0',
    };
  }
  priceCache = { at: Date.now(), prices };
  return prices;
}

async function getMarketInfo() {
  const cg = await getCoingeckoMarketSnapshot();
  const prices = await getPrices().catch(() => ({}));
  const defaultRegistry = await discoverDefaultMarketTokenConfigs().catch(() => defaultMarketTokenCache);
  const discovered = marketDiscoveryCache;
  const nativeSymbols = new Set(configuredMarketSymbols());
  const rows = Array.isArray(cg.markets) && cg.markets.length
    ? cg.markets
    : DEFAULT_MARKETS.map(m => ({
      symbol: m.symbol,
      base: m.symbol,
      pair: `${m.symbol}/USD`,
      market: `${m.symbol}/USD`,
      market_name: `${m.symbol}/USD`,
      max_leverage: m.max_leverage,
      lot_size: m.lot_size,
      tick_size: m.tick_size,
      min_order_size: String(GMTRADE_MIN_POSITION_USD),
      mark: Number(prices[m.symbol]?.mark || 0),
      oracle: Number(prices[m.symbol]?.oracle || prices[m.symbol]?.mark || 0),
      funding_rate: 0,
      next_funding_rate: 0,
      volume_24h: 0,
      open_interest: 0,
      source: 'pyth_fallback',
    }));
  return rows.map(row => {
    const px = prices?.[baseSymbol(row.symbol)] || null;
    const mark = Number(px?.mark || row.mark || 0);
    const oracle = Number(px?.oracle || row.oracle || mark || 0);
    return {
      ...row,
      mark: Number.isFinite(mark) && mark > 0 ? mark : row.mark,
      oracle: Number.isFinite(oracle) && oracle > 0 ? oracle : row.oracle,
      source: px?.source || row.source,
      native_order_available: nativeSymbols.has(row.symbol),
      market_token:
        marketTokenForSymbol(row.symbol)
        || envMarketConfig(row.symbol)?.market_token
        || marketTokenConfigCache.markets?.[row.symbol]?.market_token
        || defaultRegistry?.markets?.[row.symbol]?.market_token
        || discovered?.markets?.[row.symbol]?.market_token
        || null,
    };
  });
}

function accountBase64(account) {
  return Array.isArray(account?.data) ? account.data[0] : account?.data;
}

function rawBase64ToBuffer(encoded) {
  return Buffer.from(String(encoded || ''), 'base64');
}

function decimalNumber(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / (10 ** decimals);
}

function readU128LeSafe(buf, offset) {
  if (!Buffer.isBuffer(buf) || offset + 16 > buf.length) return 0n;
  return readU128Le(buf, offset);
}

function readU64LeSafe(buf, offset) {
  if (!Buffer.isBuffer(buf) || offset + 8 > buf.length) return 0n;
  return readU64Le(buf, offset);
}

function readI64LeSafe(buf, offset) {
  if (!Buffer.isBuffer(buf) || offset + 8 > buf.length) return 0n;
  return readI64Le(buf, offset);
}

function readPubkeySafe(buf, offset) {
  if (!Buffer.isBuffer(buf) || offset + 32 > buf.length || typeof bs58Encode !== 'function') return '';
  return bs58Encode(buf.subarray(offset, offset + 32));
}

function nullIfSystemPubkey(value) {
  const out = String(value || '').trim();
  return out && out !== '11111111111111111111111111111111' ? out : null;
}

function decodeUserReferralAccount(encoded, address, userAddress, programId) {
  const buf = rawBase64ToBuffer(encoded);
  if (buf.length < 120) return null;
  const owner = nullIfSystemPubkey(readPubkeySafe(buf, 24)) || address;
  const store = nullIfSystemPubkey(readPubkeySafe(buf, 56)) || GMTRADE_STORE_ADDRESS;
  const referrer = nullIfSystemPubkey(readPubkeySafe(buf, 88));
  return {
    exists: true,
    user_address: userAddress,
    owner,
    store,
    referrer,
    referral_code_address: null,
    has_referrer: !!referrer,
    program_id: programId,
    decoder: 'node_gmsol_user_layout',
  };
}

function gmPriceWithDecimals(raw, decimals) {
  const value = BigInt(raw || 0);
  return value > 0n ? decimalNumber(value, decimals) : 0;
}

function saneGmOrderPrice(value, mark = 0) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price > 1_000_000_000) return 0;
  const ref = Number(mark);
  if (Number.isFinite(ref) && ref > 0 && price > ref * 1000) return 0;
  return price;
}

function orderKindName(kind) {
  return [
    'Liquidation',
    'AutoDeleveraging',
    'MarketSwap',
    'MarketIncrease',
    'MarketDecrease',
    'LimitSwap',
    'LimitIncrease',
    'LimitDecrease',
    'StopLossDecrease',
  ][Number(kind)] || `Kind${kind}`;
}

function actionStateName(state) {
  return ['Pending', 'Completed', 'Cancelled'][Number(state)] || `State${state}`;
}

function normalizePriceRow(prices, symbol) {
  const row = prices?.[baseSymbol(symbol)] || null;
  return Number(row?.mark || row?.oracle || 0) || 0;
}

function normalizePositionTokenAmount(amount, sizeUsd, markPriceHint) {
  const initialAmount = Number(amount);
  const notional = Number(sizeUsd);
  const mark = Number(markPriceHint);
  if (!Number.isFinite(initialAmount) || initialAmount <= 0) {
    return {
      amount: Number.isFinite(notional) && notional > 0 && Number.isFinite(mark) && mark > 0 ? notional / mark : 0,
      method: 'fallback_from_mark',
    };
  }
  if (!Number.isFinite(notional) || notional <= 0 || !Number.isFinite(mark) || mark <= 0) {
    return { amount: initialAmount, method: 'raw_no_mark_hint' };
  }

  const score = (candidateAmount) => {
    if (!Number.isFinite(candidateAmount) || candidateAmount <= 0) return Number.POSITIVE_INFINITY;
    const candidateEntry = notional / candidateAmount;
    if (!Number.isFinite(candidateEntry) || candidateEntry <= 0) return Number.POSITIVE_INFINITY;
    return Math.abs(candidateEntry - mark) / mark;
  };

  let bestAmount = initialAmount;
  let bestDistance = score(initialAmount);
  let bestPower = 0;

  // GMTrade position accounts have used different token amount scales across
  // market configs. Choose the scale whose implied entry is closest to the
  // current mark; this prevents raw 1e8/1e18 mismatches from exploding PnL.
  for (let power = -18; power <= 18; power += 1) {
    if (power === 0) continue;
    const candidateAmount = initialAmount * (10 ** power);
    const distance = score(candidateAmount);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAmount = candidateAmount;
      bestPower = power;
    }
  }

  if (bestDistance < 0.5) {
    return {
      amount: bestAmount,
      method: bestPower === 0 ? 'raw' : `scaled_1e${bestPower}`,
      distance: bestDistance,
    };
  }

  const initialEntry = notional / initialAmount;
  const ratio = Math.max(initialEntry / mark, mark / initialEntry);
  if (Number.isFinite(ratio) && ratio > 1000) {
    return {
      amount: notional / mark,
      method: 'fallback_impossible_entry_from_mark',
      distance: bestDistance,
      ratio,
    };
  }

  return {
    amount: bestAmount,
    method: bestPower === 0 ? 'raw_unscaled' : `scaled_1e${bestPower}_loose`,
    distance: bestDistance,
  };
}

function decodePositionAccount(encoded, meta = {}) {
  const buf = rawBase64ToBuffer(encoded);
  if (buf.length < 232 || !buf.subarray(0, 8).equals(GMTRADE_POSITION_DISCRIMINATOR)) return null;
  const kind = buf.readUInt8(42);
  const isLong = kind === 1;
  const sizeRaw = readU128LeSafe(buf, 216);
  if (sizeRaw <= 0n) return null;
  const sizeUsd = gmRawUsdToNumber(sizeRaw);
  const amountTokensRaw = readU128LeSafe(buf, 184);
  const collateralRaw = readU128LeSafe(buf, 200);
  const collateralDecimals = Number(meta.collateral_decimals || GMTRADE_DEFAULT_COLLATERAL_DECIMALS);
  const rawAmount = decimalNumber(amountTokensRaw, Number(meta.token_decimals || GMTRADE_TOKEN_AMOUNT_DECIMALS));
  const margin = decimalNumber(collateralRaw, collateralDecimals);
  const leverage = margin > 0 ? sizeUsd / margin : null;
  const markPriceHint = Number(meta.mark_price || 0);
  const amountNormalization = normalizePositionTokenAmount(rawAmount, sizeUsd, markPriceHint);
  const amount = amountNormalization.amount;
  const entryPrice = amount > 0 ? sizeUsd / amount : 0;
  const markPrice = markPriceHint || entryPrice;
  const pnlUsd = amount > 0 && markPrice > 0 && entryPrice > 0
    ? (isLong ? 1 : -1) * (markPrice - entryPrice) * amount
    : 0;
  const pnlPct = margin > 0 ? (pnlUsd / margin) * 100 : 0;
  const liquidationPrice = leverage > 0 && entryPrice > 0
    ? (isLong ? entryPrice * (1 - (1 / leverage)) : entryPrice * (1 + (1 / leverage)))
    : 0;
  const createdAt = Number(readI64LeSafe(buf, 48));
  const updatedSlot = Number(readU64LeSafe(buf, 168));
  return {
    id: meta.address,
    position_id: meta.address,
    symbol: baseSymbol(meta.symbol || readPubkeySafe(buf, 88)),
    side: isLong ? 'bid' : 'ask',
    side_label: isLong ? 'long' : 'short',
    amount,
    margin,
    size_usd: sizeUsd,
    notional_usd: sizeUsd,
    entry_price: entryPrice || markPrice,
    mark_price: markPrice,
    pnl_usd: Math.round(pnlUsd * 100) / 100,
    pnl_pct: Math.round(pnlPct * 100) / 100,
    net_value_usd: Math.round((margin + pnlUsd) * 100) / 100,
    liquidation_price: liquidationPrice ? Math.round(liquidationPrice * 100) / 100 : null,
    leverage: leverage == null ? null : Math.round(leverage * 100) / 100,
    created_at: createdAt > 0 ? createdAt : null,
    updated_at_slot: updatedSlot || null,
    market_token: readPubkeySafe(buf, 88),
    collateral_token: readPubkeySafe(buf, 120),
    dex: 'gmtrade',
    source: 'gmtrade_position_pda',
    _raw: {
      address: meta.address,
      program_id: meta.program_id,
      kind,
      size_usd_raw: String(sizeRaw),
      size_in_tokens_raw: String(amountTokensRaw),
      collateral_amount_raw: String(collateralRaw),
      amount_normalization: amountNormalization,
    },
  };
}

function decodeOrderAccount(encoded, pubkey, pricesBySymbol, marketByToken = {}) {
  const buf = rawBase64ToBuffer(encoded);
  if (buf.length < 2116 || !buf.subarray(0, 8).equals(GMTRADE_ORDER_DISCRIMINATOR)) return null;
  const marketToken = readPubkeySafe(buf, 528);
  const cfg = marketByToken[marketToken] || {};
  const paramsOffset = 2104;
  const kind = buf.readUInt8(paramsOffset);
  const kindName = orderKindName(kind);
  const sideByte = buf.readUInt8(paramsOffset + 1);
  const collateralToken = readPubkeySafe(buf, paramsOffset + 8);
  const position = readPubkeySafe(buf, paramsOffset + 40);
  const collateralRaw = readU64LeSafe(buf, paramsOffset + 72);
  const sizeRaw = readU128LeSafe(buf, paramsOffset + 80);
  const triggerRaw = readU128LeSafe(buf, paramsOffset + 112);
  const acceptableRaw = readU128LeSafe(buf, paramsOffset + 128);
  const symbol = baseSymbol(cfg.symbol || marketToken);
  const mark = normalizePriceRow(pricesBySymbol, symbol);
  const priceDecimals = gmUnitPriceDecimals(cfg);
  const triggerPrice = saneGmOrderPrice(gmPriceWithDecimals(triggerRaw, priceDecimals), mark);
  const acceptablePrice = saneGmOrderPrice(gmPriceWithDecimals(acceptableRaw, priceDecimals), mark);
  return {
    id: pubkey,
    order_id: pubkey,
    symbol,
    side: sideByte === 1 ? 'bid' : 'ask',
    type: kindName,
    order_type: /stop/i.test(kindName) ? 'stop_loss' : (/limit/i.test(kindName) ? 'limit' : 'market'),
    status: actionStateName(buf.readUInt8(9)).toLowerCase(),
    amount: gmRawUsdToNumber(sizeRaw),
    size_usd: gmRawUsdToNumber(sizeRaw),
    margin: decimalNumber(collateralRaw, Number(cfg.collateral_decimals || GMTRADE_DEFAULT_COLLATERAL_DECIMALS)),
    price: triggerPrice || acceptablePrice || mark || 0,
    trigger_price: triggerPrice || null,
    acceptable_price: acceptablePrice || null,
    market_token: marketToken,
    collateral_token: collateralToken,
    position,
    owner: readPubkeySafe(buf, 88),
    dex: 'gmtrade',
    source: 'gmtrade_program_account',
    _raw: {
      address: pubkey,
      kind,
      kind_name: kindName,
      action_state: buf.readUInt8(9),
      market_token: marketToken,
      size_usd_raw: String(sizeRaw),
      collateral_amount_raw: String(collateralRaw),
      trigger_price_raw: String(triggerRaw),
      acceptable_price_raw: String(acceptableRaw),
      price_decimals: priceDecimals,
    },
  };
}

async function allReadableMarketConfigs() {
  const defaultRegistry = await discoverDefaultMarketTokenConfigs().catch(() => ({ markets: {}, rows: [] }));
  const discovered = marketDiscoveryCache || { markets: {}, rows: [] };
  const byMarketToken = new Map();
  const add = (row) => {
    const cfg = normalizeMarketConfig(row?.symbol, row);
    if (!cfg?.market_token) return;
    byMarketToken.set(cfg.market_token, { ...row, ...cfg });
  };
  for (const row of Object.values(GMTRADE_MARKETS || {})) add(row);
  for (const row of marketTokenConfigCache.rows || []) add(row);
  for (const row of defaultRegistry.rows || []) add(row);
  for (const row of discovered.rows || []) add(row);
  return [...byMarketToken.values()];
}

async function getPositionsByAddress(address) {
  if (!isSolanaAddress(address)) {
    throw Object.assign(new Error('GMTrade Solana wallet address required'), { status: 400 });
  }
  const [configs, prices] = await Promise.all([
    allReadableMarketConfigs(),
    getPrices().catch(() => ({})),
  ]);
  const requests = [];
  for (const cfg of configs) {
    for (const isLong of [true, false]) {
      try {
        requests.push({
          cfg,
          address: findPositionAddress(address, cfg, isLong),
        });
      } catch {
        // Ignore stale or incomplete market config rows.
      }
    }
  }
  const out = [];
  for (let i = 0; i < requests.length; i += 100) {
    const chunk = requests.slice(i, i + 100);
    const accounts = await rpcMultipleAccountInfos(chunk.map(row => row.address));
    accounts.forEach((account, index) => {
      const encoded = accountBase64(account);
      if (!encoded) return;
      const req = chunk[index];
      const decoded = decodePositionAccount(encoded, {
        ...req.cfg,
        address: req.address,
        mark_price: normalizePriceRow(prices, req.cfg.symbol),
      });
      if (decoded) out.push(decoded);
    });
  }
  return out;
}

async function getOrdersByAddress(address) {
  if (!isSolanaAddress(address)) {
    throw Object.assign(new Error('GMTrade Solana wallet address required'), { status: 400 });
  }
  if (typeof bs58Encode !== 'function') {
    throw Object.assign(new Error('GMTrade bs58 encoder is not available'), { status: 501 });
  }
  const [configs, prices] = await Promise.all([
    allReadableMarketConfigs(),
    getPrices().catch(() => ({})),
  ]);
  const marketByToken = Object.fromEntries(configs.map(cfg => [cfg.market_token, cfg]));
  const filters = [
    { memcmp: { offset: 0, bytes: bs58Encode(GMTRADE_ORDER_DISCRIMINATOR) } },
    { memcmp: { offset: 88, bytes: bs58Encode(new PublicKey(address).toBuffer()) } },
  ];
  const out = [];
  for (const programId of GMTRADE_PROGRAM_IDS) {
    const rows = await rpcProgramAccounts(programId, { filters }).catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      const encoded = accountBase64(row?.account);
      const decoded = encoded ? decodeOrderAccount(encoded, String(row.pubkey || ''), prices, marketByToken) : null;
      if (decoded) out.push({ ...decoded, program_id: programId });
    }
  }
  return out;
}

async function getUserReferralByAddress(address) {
  if (!isSolanaAddress(address)) {
    throw Object.assign(new Error('GMTrade Solana wallet address required'), { status: 400 });
  }
  for (const programId of GMTRADE_PROGRAM_IDS) {
    const userAddress = findUserAddress(address, programId);
    const account = await rpcAccountInfo(userAddress).catch(() => null);
    const encoded = account?.data?.[0];
    if (!encoded) continue;
    const decoded = decodeUserReferralAccount(encoded, address, userAddress, programId);
    if (decoded) return decoded;
  }
  return {
    exists: false,
    user_address: findUserAddress(address),
    owner: address,
    store: GMTRADE_STORE_ADDRESS,
    referrer: null,
    referral_code_address: null,
    has_referrer: false,
  };
}

async function getAccountByAddress(address) {
  if (!isSolanaAddress(address)) {
    throw Object.assign(new Error('GMTrade Solana wallet address required'), { status: 400 });
  }
  const [positions, orders, walletUsdc, referral] = await Promise.all([
    getPositionsByAddress(address).catch((e) => {
      console.warn('[gmtrade] positions read failed:', e.message);
      return [];
    }),
    getOrdersByAddress(address).catch((e) => {
      console.warn('[gmtrade] orders read failed:', e.message);
      return [];
    }),
    getWalletUsdcBalance(address).catch((e) => {
      console.warn('[gmtrade] wallet USDC read failed:', e.message);
      return 0;
    }),
    getUserReferralByAddress(address).catch((e) => {
      console.warn('[gmtrade] user referral read failed:', e.message);
      return { has_referrer: false, referrer: null, referral_code_address: null };
    }),
  ]);
  const totalMargin = positions.reduce((sum, pos) => sum + (Number(pos.margin) || 0), 0);
  const totalSize = positions.reduce((sum, pos) => sum + (Number(pos.size_usd) || 0), 0);
  const positionEquity = positions.reduce((sum, pos) => {
    const net = Number(pos.net_value_usd);
    if (Number.isFinite(net)) return sum + net;
    const margin = Number(pos.margin) || 0;
    const pnl = Number(pos.pnl_usd) || 0;
    return sum + Math.max(0, margin + pnl);
  }, 0);
  const available = Math.max(0, Number(walletUsdc));
  const accountEquity = Math.max(0, Number(walletUsdc) + positionEquity);
  return {
    authority: address,
    balance: String(accountEquity),
    wallet_usdc: String(walletUsdc),
    position_equity: String(positionEquity),
    account_equity: String(accountEquity),
    available_to_spend: String(available),
    available_to_withdraw: String(walletUsdc),
    total_margin_used: String(totalMargin),
    total_position_size_usd: String(totalSize),
    positions_count: positions.length,
    orders_count: orders.length,
    positions,
    orders,
    referral,
    has_referrer: referral?.has_referrer === true,
    note: 'GMTrade is self-custody on Solana. Clash reads positions and open order accounts directly from GMTrade program accounts.',
  };
}

async function getOrderbook(symbol) {
  const sym = baseSymbol(symbol || 'SOL');
  const prices = await getPrices().catch(() => ({}));
  const mark = Number(prices[sym]?.mark || 0);
  if (!mark) return { bids: [], asks: [], source: 'gmtrade_pyth_empty' };
  const step = mark * 0.0005;
  return {
    bids: Array.from({ length: 8 }, (_, i) => [String(mark - step * (i + 1)), '0']),
    asks: Array.from({ length: 8 }, (_, i) => [String(mark + step * (i + 1)), '0']),
    source: 'gmtrade_pyth_synthetic',
  };
}

function serializeTransactionGroup(group) {
  const serialized = group.serialize();
  const transactions = [];
  for (const batch of serialized || []) {
    const txs = Array.isArray(batch?.[0]) ? batch : [batch];
    for (const raw of txs) {
      if (!Array.isArray(raw)) continue;
      transactions.push(Buffer.from(raw).toString('base64'));
    }
  }
  return transactions;
}

function gmtradeTxSummary(base64) {
  try {
    const tx = VersionedTransaction.deserialize(Buffer.from(String(base64 || ''), 'base64'));
    return {
      kind: 'versioned',
      bytes: tx.serialize().length,
      required_signatures: tx.message?.header?.numRequiredSignatures ?? null,
      static_accounts: tx.message?.staticAccountKeys?.length ?? null,
      instructions: tx.message?.compiledInstructions?.length ?? null,
    };
  } catch {
    try {
      const tx = Transaction.from(Buffer.from(String(base64 || ''), 'base64'));
      return {
        kind: 'legacy',
        bytes: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length,
        required_signatures: tx.signatures?.length ?? null,
        static_accounts: null,
        instructions: tx.instructions?.length ?? null,
      };
    } catch {
      return null;
    }
  }
}

function gmtradeInstructionKey(ix) {
  return [
    ix?.programIdIndex,
    Array.from(ix?.accountKeyIndexes || []).join(','),
    Buffer.from(ix?.data || []).toString('hex'),
  ].join('|');
}

async function gmtradeAccountExists(address) {
  if (!isSolanaPubkey(address)) return false;
  const account = await rpcAccountInfo(address).catch(() => null);
  return !!account;
}

async function gmtradeSetupInstructionHintsFromTransactions(transactions) {
  const out = {
    user_exists: false,
    position_exists: false,
    user_address: '',
    position_address: '',
    program_id: '',
    source: 'transaction_accounts',
  };
  if (!GMTRADE_OMIT_EXISTING_SETUP_INSTRUCTIONS) return out;
  try {
    const first = Array.isArray(transactions) ? transactions[0] : '';
    const tx = VersionedTransaction.deserialize(Buffer.from(String(first || ''), 'base64'));
    const keys = tx.message?.staticAccountKeys || [];
    for (const ix of tx.message?.compiledInstructions || []) {
      const program = keys[ix.programIdIndex]?.toBase58?.() || '';
      const dataHex = Buffer.from(ix.data || []).toString('hex');
      if (!GMTRADE_PROGRAM_IDS.includes(program)) continue;
      if (dataHex === 'bead8fc18b50e785') {
        out.program_id ||= program;
        out.user_address ||= keys[ix.accountKeyIndexes?.[2]]?.toBase58?.() || '';
      } else if (dataHex.startsWith('b2d7375a890f6c0f')) {
        out.program_id ||= program;
        out.position_address ||= keys[ix.accountKeyIndexes?.[3]]?.toBase58?.() || '';
      }
    }
    const [userExists, positionExists] = await Promise.all([
      out.user_address ? gmtradeAccountExists(out.user_address) : Promise.resolve(false),
      out.position_address ? gmtradeAccountExists(out.position_address) : Promise.resolve(false),
    ]);
    out.user_exists = !!userExists;
    out.position_exists = !!positionExists;
  } catch (e) {
    console.warn('[gmtrade] setup transaction account probe skipped:', e?.message || e);
  }
  return out;
}

function sanitizeGmtradeTransaction(base64, options = {}) {
  let tx;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(String(base64 || ''), 'base64'));
  } catch {
    return { base64, changed: false, removed_duplicate_ata_instructions: 0, before: gmtradeTxSummary(base64), after: gmtradeTxSummary(base64) };
  }
  const before = gmtradeTxSummary(base64);
  const keys = tx.message?.staticAccountKeys || [];
  const seenAtaCreate = new Set();
  let removedAta = 0;
  let removedPrepareUser = 0;
  let removedPreparePosition = 0;
  const filtered = [];
  for (const ix of tx.message?.compiledInstructions || []) {
    const program = keys[ix.programIdIndex]?.toBase58?.() || '';
    const dataHex = Buffer.from(ix.data || []).toString('hex');
    if (
      options.omit_prepare_user === true
      && GMTRADE_PROGRAM_IDS.includes(program)
      && dataHex === 'bead8fc18b50e785'
    ) {
      removedPrepareUser += 1;
      continue;
    }
    if (
      options.omit_prepare_position === true
      && GMTRADE_PROGRAM_IDS.includes(program)
      && dataHex.startsWith('b2d7375a890f6c0f')
    ) {
      removedPreparePosition += 1;
      continue;
    }
    const isAtaCreateIdempotent = program === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
      && dataHex === '01';
    if (isAtaCreateIdempotent) {
      const key = gmtradeInstructionKey(ix);
      if (GMTRADE_DEDUPE_ATA_INSTRUCTIONS && seenAtaCreate.has(key)) {
        removedAta += 1;
        continue;
      }
      seenAtaCreate.add(key);
    }
    filtered.push(ix);
  }
  if (!removedAta && !removedPrepareUser && !removedPreparePosition) {
    return {
      base64,
      changed: false,
      removed_duplicate_ata_instructions: 0,
      removed_prepare_user_instructions: 0,
      removed_prepare_position_instructions: 0,
      before,
      after: before,
    };
  }
  tx.message.compiledInstructions = filtered;
  const next = Buffer.from(tx.serialize()).toString('base64');
  const after = gmtradeTxSummary(next);
  console.info('[gmtrade] sanitized GMTrade setup instructions', {
    removed_duplicate_ata_instructions: removedAta,
    removed_prepare_user_instructions: removedPrepareUser,
    removed_prepare_position_instructions: removedPreparePosition,
    setup_hints: options.setup_hints || null,
    before,
    after,
  });
  return {
    base64: next,
    changed: true,
    removed_duplicate_ata_instructions: removedAta,
    removed_prepare_user_instructions: removedPrepareUser,
    removed_prepare_position_instructions: removedPreparePosition,
    before,
    after,
  };
}

function sanitizeGmtradeTransactions(transactions, options = {}) {
  const rows = [];
  const sanitized = [];
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    const row = sanitizeGmtradeTransaction(tx, options);
    sanitized.push(row.base64);
    rows.push({
      changed: row.changed,
      removed_duplicate_ata_instructions: row.removed_duplicate_ata_instructions,
      removed_prepare_user_instructions: row.removed_prepare_user_instructions,
      removed_prepare_position_instructions: row.removed_prepare_position_instructions,
      setup_hints: options.setup_hints || null,
      before: row.before,
      after: row.after,
    });
  }
  return {
    transactions: sanitized,
    diagnostics: rows,
  };
}

async function buildCreateOrderTx(body = {}, playerWallet = '') {
  const payer = resolveRequestWallet(body, playerWallet);
  const requestedSymbol = baseSymbol(body.symbol || 'SOL') || 'SOL';
  const configuredMarketToken = marketTokenForSymbol(requestedSymbol);
  const hintedMarketToken = String(body.market_token || body.marketToken || '').trim();
  const hintedCfg = hintedMarketToken
    ? (await configFromMarketToken(hintedMarketToken).catch((e) => {
      console.warn('[gmtrade] hinted market-token config failed:', hintedMarketToken, e?.message || e);
      return null;
    }))
    : null;
  const useHintedMarketToken = !!hintedCfg
    && (!requestedSymbol || baseSymbol(hintedCfg.symbol) === requestedSymbol || hintedMarketToken === configuredMarketToken);
  const ignoredHintedMarketToken = hintedMarketToken && !useHintedMarketToken ? hintedMarketToken : '';
  const resolvedCfg = (useHintedMarketToken ? hintedCfg : null) || await resolveMarketConfig(requestedSymbol);
  if (!resolvedCfg) {
    throw Object.assign(new Error('GMTrade market-token config is not available. Set GMTRADE_MARKETS_JSON or enable RPC market discovery with GMTRADE_MARKET_SYMBOLS_JSON for this index token.'), { status: 501 });
  }
  const cfg = resolvedCfg;
  const marketToken = assertPubkey(cfg.market_token, `${cfg.symbol} market_token`);
  const longToken = assertPubkey(cfg.long_token, `${cfg.symbol} long_token`);
  const shortToken = assertPubkey(cfg.short_token, `${cfg.symbol} short_token`);
  const collateralToken = assertPubkey(cfg.collateral_token, 'collateral_token');
  const payToken = assertPubkey(cfg.pay_token || collateralToken, 'pay_token');
  const receiveToken = cfg.receive_token ? assertPubkey(cfg.receive_token, 'receive_token') : collateralToken;

  const leverageText = stableDecimalString(body.leverage || 1, 'leverage', {
    decimals: 6,
    min: 0,
    max: 500,
  });
  const leverage = Number(leverageText);
  const side = normalizeSide(body.side);
  const orderType = String(body.order_type || body.orderType || 'market').toLowerCase();
  const isDecrease = side === 'close_long' || side === 'close_short' || body.reduce_only === true || body.reduceOnly === true;
  const collateralDecimals = Math.max(0, Math.min(12, Number(cfg.collateral_decimals) || GMTRADE_DEFAULT_COLLATERAL_DECIMALS));
  const rawMarginValue = body.amount ?? body.margin ?? body.margin_usd;
  const rawNotionalValue = body.notional_usd ?? body.notionalUsd ?? body.size_usd ?? body.sizeUsd;
  const hasExplicitNotional = Number.isFinite(Number(rawNotionalValue)) && Number(rawNotionalValue) > 0;
  const marginText = stableDecimalString(rawMarginValue, isDecrease ? 'collateral delta' : 'margin', {
    decimals: collateralDecimals,
    min: 0,
    max: 10_000_000,
    allowZero: isDecrease,
  });
  const margin = Number(marginText);
  const isStopLossOrder = isDecrease && /^(stop_loss|stop-loss|stop|sl)$/.test(orderType);
  const kind = isStopLossOrder
    ? 'StopLossDecrease'
    : (orderType.includes('limit') || /^(take_profit|take-profit|tp)$/.test(orderType))
      ? (isDecrease ? 'LimitDecrease' : 'LimitIncrease')
      : (isDecrease ? 'MarketDecrease' : 'MarketIncrease');
  const notionalSource = isDecrease && hasExplicitNotional ? Number(rawNotionalValue) : margin * leverage;
  const notionalText = stableDecimalString(notionalSource, 'notional', {
    decimals: Math.min(12, GMTRADE_MARKET_DECIMALS),
    min: 0,
    max: 1_000_000_000,
  });
  const notional = Number(notionalText);
  if (!isDecrease && GMTRADE_MIN_POSITION_USD > 0 && notional < GMTRADE_MIN_POSITION_USD) {
    throw Object.assign(new Error(`GMTrade minimum position size is $${GMTRADE_MIN_POSITION_USD}. Yours: $${notional.toFixed(4)}. Increase margin or leverage.`), { status: 400 });
  }
  if (!isDecrease && collateralToken === GMTRADE_DEFAULT_COLLATERAL_MINT) {
    try {
      const walletUsdc = await getWalletUsdcBalance(payer);
      if (Number.isFinite(walletUsdc) && walletUsdc + 0.000001 < margin) {
        throw Object.assign(
          new Error(`Insufficient GMTrade wallet USDC. Wallet has $${walletUsdc.toFixed(2)}, order needs $${margin.toFixed(2)} margin.`),
          { status: 400, wallet_usdc: walletUsdc, required_margin_usd: margin },
        );
      }
    } catch (e) {
      if (Number(e?.status) === 400) throw e;
      console.warn('[gmtrade] wallet USDC preflight skipped:', e?.message || e);
    }
  }
  if (!isDecrease) {
    try {
      const walletSol = await getWalletSolBalance(payer);
      const requiredLamports = GMTRADE_EXECUTION_LAMPORTS + GMTRADE_ORDER_SOL_BUFFER_LAMPORTS;
      const requiredSol = requiredLamports / 1e9;
      if (Number.isFinite(walletSol) && walletSol + 0.000005 < requiredSol) {
        throw Object.assign(
          new Error(
            `Insufficient Solana SOL for GMTrade order setup. Wallet has ${walletSol.toFixed(4)} SOL; keep at least ${requiredSol.toFixed(4)} SOL for GMTrade execution/rent.`
          ),
          { status: 400, wallet_sol: walletSol, required_sol: requiredSol },
        );
      }
    } catch (e) {
      if (Number(e?.status) === 400) throw e;
      console.warn('[gmtrade] wallet SOL preflight skipped:', e?.message || e);
    }
  }
  const params = {
    market_token: marketToken,
    is_long: side === 'long' || side === 'close_long',
    size: usdToGmUnits(notionalText),
    amount: decimalToBigInt(marginText, collateralDecimals),
    min_output: 0n,
  };
  const rawPrice = body.price || body.trigger_price || body.triggerPrice || 0;
  if (kind === 'LimitIncrease' || kind === 'LimitDecrease' || kind === 'StopLossDecrease') {
    const priceText = stableDecimalString(rawPrice, 'trigger price', {
      decimals: Math.min(12, gmUnitPriceDecimals(cfg)),
      min: 0,
      max: 1_000_000_000,
    });
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      throw Object.assign(new Error('GMTrade trigger orders require trigger price'), { status: 400 });
    }
    if (kind === 'LimitIncrease' || kind === 'LimitDecrease') {
      const prices = await getPrices().catch(() => ({}));
      ensureNonMarketableGmtradeLimit({
        kind,
        side,
        price,
        mark: normalizePriceRow(prices, cfg.symbol),
      });
    }
    params.trigger_price = priceToGmUnitPrice(priceText, cfg);
    if (kind === 'LimitIncrease' || kind === 'LimitDecrease') {
      const slippageBps = stableNumber(body.slippage_bps || body.slippageBps || GMTRADE_ORDER_SLIPPAGE_BPS, 'slippage bps', {
        decimals: 2,
        min: 0,
        max: 5000,
        allowZero: true,
      });
      const slip = Math.max(0, slippageBps) / 10_000;
      const acceptable = kind === 'LimitDecrease'
        ? (params.is_long ? price * (1 - slip) : price * (1 + slip))
        : (params.is_long ? price * (1 + slip) : price * (1 - slip));
      const acceptableText = stableDecimalString(Math.max(0, acceptable), 'acceptable price', {
        decimals: Math.min(12, gmUnitPriceDecimals(cfg)),
        min: 0,
        max: 1_000_000_000,
      });
      params.acceptable_price = priceToGmUnitPrice(acceptableText, cfg);
    }
  }

  const suppliedBlockhash = String(body.recent_blockhash || body.recentBlockhash || '').trim();
  const suppliedLastValid = Number(body.last_valid_block_height || body.lastValidBlockHeight || 0);
  let blockhash = suppliedBlockhash;
  let lastValidBlockHeight = Number.isFinite(suppliedLastValid) && suppliedLastValid > 0 ? suppliedLastValid : null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,90}$/.test(blockhash)) {
    const latest = await rpcLatestBlockhash();
    blockhash = latest.blockhash;
    lastValidBlockHeight = latest.lastValidBlockHeight;
  }
  const rustPayload = {
    payer,
    recent_blockhash: blockhash,
    nonce: randomNonce(),
    kind,
    market_token: marketToken,
    long_token: longToken,
    short_token: shortToken,
    collateral_token: collateralToken,
    pay_token: payToken,
    receive_token: receiveToken,
    execution_lamports: GMTRADE_EXECUTION_LAMPORTS,
    size: String(params.size),
    amount: String(params.amount),
    min_output: String(params.min_output),
    trigger_price: params.trigger_price == null ? undefined : String(params.trigger_price),
    acceptable_price: params.acceptable_price == null ? undefined : String(params.acceptable_price),
    is_long: params.is_long,
    skip_unwrap_native_on_receive: false,
    skip_wrap_native_on_pay: true,
    force_create_positions: !isDecrease,
    compute_unit_price_micro_lamports: Number(process.env.GMTRADE_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS || 0) || undefined,
  };
  if (GMTRADE_TX_MEMO) {
    rustPayload.memo = GMTRADE_TX_MEMO;
  }
  if (rustBuilderAvailable()) {
    const built = await runRustBuilder(rustPayload);
    const setupHints = await gmtradeSetupInstructionHintsFromTransactions(built.transactions || []);
    const sanitizerOptions = {
      omit_prepare_user: setupHints.user_exists,
      omit_prepare_position: setupHints.position_exists,
      setup_hints: setupHints,
    };
    const sanitized = sanitizeGmtradeTransactions(built.transactions || [], sanitizerOptions);
    return {
      ok: true,
      dex: 'gmtrade',
      symbol: cfg.symbol,
      kind,
      side,
      market_token: marketToken,
      collateral_token: collateralToken,
      pay_token: payToken,
      ignored_market_token: ignoredHintedMarketToken || undefined,
      margin_usd: margin,
      leverage,
      notional_usd: notional,
      recent_blockhash: blockhash,
      last_valid_block_height: lastValidBlockHeight,
      transactions: sanitized.transactions,
      tx_sanitizer: sanitized.diagnostics,
      setup_hints: setupHints,
      builder: 'rust_gmsol_sdk',
      memo_enabled: Boolean(GMTRADE_TX_MEMO),
    };
  }
  if (!GMTRADE_ENABLE_NODE_SDK_BUILDER) {
    throw Object.assign(new Error('GMTrade native builder is disabled. Set GMTRADE_ENABLE_NODE_SDK_BUILDER=1 or build server-futures/gmtrade-builder and set GMTRADE_RUST_BUILDER_BIN.'), { status: 501 });
  }
  const sdk = await gmsolSdk();
  sdk.solana_program_init?.();
  const hints = new Map([[marketToken, { long_token: longToken, short_token: shortToken }]]);
  let group;
  try {
    group = sdk.create_orders(kind, [params], {
      recent_blockhash: blockhash,
      payer,
      collateral_or_swap_out_token: collateralToken,
      pay_token: payToken,
      receive_token: receiveToken,
      hints,
      transaction_group: {
        memo: GMTRADE_TX_MEMO || undefined,
        max_instructions_per_tx: 24,
      },
      compute_unit_price_micro_lamports: Number(process.env.GMTRADE_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS || 0) || undefined,
    });
  } catch (e) {
    throw Object.assign(new Error(`GMTrade SDK transaction builder failed: ${e.message}`, { cause: e }), { status: 501 });
  }
  const serialized = group.serialize();
  const transactions = [];
  for (const batch of serialized || []) {
    const txs = Array.isArray(batch?.[0]) ? batch : [batch];
    for (const raw of txs) {
      if (!Array.isArray(raw)) continue;
      transactions.push(Buffer.from(raw).toString('base64'));
    }
  }
  if (!transactions.length) {
    throw Object.assign(new Error('GMTrade SDK did not produce any transaction'), { status: 502 });
  }
  const setupHints = await gmtradeSetupInstructionHintsFromTransactions(transactions);
  const sanitizerOptions = {
    omit_prepare_user: setupHints.user_exists,
    omit_prepare_position: setupHints.position_exists,
    setup_hints: setupHints,
  };
  const sanitized = sanitizeGmtradeTransactions(transactions, sanitizerOptions);
  return {
    ok: true,
    dex: 'gmtrade',
    symbol: cfg.symbol,
    kind,
    side,
    market_token: marketToken,
    collateral_token: collateralToken,
    pay_token: payToken,
    ignored_market_token: ignoredHintedMarketToken || undefined,
    margin_usd: margin,
    leverage,
    notional_usd: notional,
    recent_blockhash: blockhash,
    last_valid_block_height: lastValidBlockHeight,
    transactions: sanitized.transactions,
    tx_sanitizer: sanitized.diagnostics,
    setup_hints: setupHints,
    builder: 'node_wasm_gmsol_sdk',
    memo_enabled: Boolean(GMTRADE_TX_MEMO),
  };
}

async function buildCancelOrderTx(body = {}, playerWallet = '') {
  const payer = resolveRequestWallet(body, playerWallet);
  const orderId = String(body.order_id || body.orderId || body.id || body.order || '').trim();
  if (!isSolanaPubkey(orderId)) {
    throw Object.assign(new Error('GMTrade order address required'), { status: 400 });
  }
  if (!GMTRADE_ENABLE_NODE_SDK_BUILDER) {
    throw Object.assign(new Error('GMTrade cancel builder requires GMTRADE_ENABLE_NODE_SDK_BUILDER=1'), { status: 501 });
  }

  const readableConfigs = await allReadableMarketConfigs();
  const marketByToken = Object.fromEntries(readableConfigs.map(cfg => [cfg.market_token, cfg]));
  const account = await rpcAccountInfo(orderId);
  if (!account?.data?.[0]) {
    throw Object.assign(new Error('GMTrade order account not found'), { status: 404 });
  }
  const decoded = decodeOrderAccount(account.data[0], orderId, {}, marketByToken);
  if (!decoded) {
    throw Object.assign(new Error('GMTrade order account could not be decoded'), { status: 400 });
  }
  if (String(decoded.owner) !== payer) {
    throw Object.assign(new Error('GMTrade order is not owned by this wallet'), { status: 403 });
  }
  const cfg = marketByToken[decoded.market_token] || {};
  const suppliedBlockhash = String(body.recent_blockhash || body.recentBlockhash || '').trim();
  const suppliedLastValid = Number(body.last_valid_block_height || body.lastValidBlockHeight || 0);
  let blockhash = suppliedBlockhash;
  let lastValidBlockHeight = Number.isFinite(suppliedLastValid) && suppliedLastValid > 0 ? suppliedLastValid : null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,90}$/.test(blockhash)) {
    const latest = await rpcLatestBlockhash();
    blockhash = latest.blockhash;
    lastValidBlockHeight = latest.lastValidBlockHeight;
  }

  const sdk = await gmsolSdk();
  sdk.solana_program_init?.();
  const kindName = String(decoded.type || decoded._raw?.kind_name || '');
  const isIncreaseOrder = /Increase/i.test(kindName);
  const isDecreaseOrder = /Decrease/i.test(kindName);
  const collateralToken = decoded.collateral_token || cfg.collateral_token || undefined;
  let group;
  try {
    group = sdk.close_orders({
      recent_blockhash: blockhash,
      payer,
      orders: new Map([[orderId, {
        owner: payer,
        receiver: payer,
        rent_receiver: payer,
        referrer: undefined,
        initial_collateral_token: isIncreaseOrder ? collateralToken : undefined,
        final_output_token: isDecreaseOrder ? collateralToken : undefined,
        long_token: cfg.long_token || undefined,
        short_token: cfg.short_token || undefined,
        should_unwrap_native_token: false,
        callback: undefined,
      }]]),
      transaction_group: {
        memo: GMTRADE_TX_MEMO || undefined,
        max_instructions_per_tx: 24,
      },
      compute_unit_price_micro_lamports: Number(process.env.GMTRADE_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS || 0) || undefined,
    });
  } catch (e) {
    throw Object.assign(new Error(`GMTrade SDK cancel builder failed: ${e.message}`, { cause: e }), { status: 501 });
  }
  const transactions = serializeTransactionGroup(group);
  if (!transactions.length) {
    throw Object.assign(new Error('GMTrade SDK did not produce any cancel transaction'), { status: 502 });
  }
  return {
    ok: true,
    dex: 'gmtrade',
    kind: 'CloseOrder',
    order_id: orderId,
    symbol: decoded.symbol,
    recent_blockhash: blockhash,
    last_valid_block_height: lastValidBlockHeight,
    transactions,
    builder: 'node_wasm_gmsol_sdk',
    memo_enabled: Boolean(GMTRADE_TX_MEMO),
  };
}

async function buildSetReferrerTx(body = {}, playerWallet = '') {
  const payer = resolveRequestWallet(body, playerWallet);
  const code = String(body.code || body.referral_code || body.referralCode || GMTRADE_REFERRAL_CODE || '').trim();
  const codeBytes = referralCodeBytes(code);
  const existing = await getUserReferralByAddress(payer).catch(() => null);
  if (existing?.has_referrer) {
    return {
      ok: true,
      dex: 'gmtrade',
      kind: 'SetReferrer',
      already_linked: true,
      referral: existing,
      transactions: [],
      memo_enabled: false,
    };
  }

  const programId = GMTRADE_PROGRAM_IDS[0];
  const program = new PublicKey(programId);
  const owner = new PublicKey(payer);
  const store = new PublicKey(GMTRADE_STORE_ADDRESS);
  const user = new PublicKey(findUserAddress(payer, programId));
  const referralCode = new PublicKey(findReferralCodeAddress(codeBytes, programId));
  const referralCodeAccount = await rpcAccountInfo(String(referralCode)).catch(() => null);
  const decodedCode = referralCodeAccount?.data?.[0]
    ? decodeReferralCodeAccount(referralCodeAccount.data[0], String(referralCode))
    : null;
  if (!decodedCode?.owner) {
    throw Object.assign(new Error(`GMTrade referral code '${code}' was not found on-chain`), { status: 404 });
  }
  if (decodedCode.store !== GMTRADE_STORE_ADDRESS) {
    throw Object.assign(new Error('GMTrade referral code belongs to a different store'), { status: 400 });
  }
  if (decodedCode.owner === payer) {
    throw Object.assign(new Error('GMTrade self-referral is not allowed'), { status: 400 });
  }
  const referrerUser = new PublicKey(findUserAddress(decodedCode.owner, programId));

  const suppliedBlockhash = String(body.recent_blockhash || body.recentBlockhash || '').trim();
  const suppliedLastValid = Number(body.last_valid_block_height || body.lastValidBlockHeight || 0);
  let blockhash = suppliedBlockhash;
  let lastValidBlockHeight = Number.isFinite(suppliedLastValid) && suppliedLastValid > 0 ? suppliedLastValid : null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,90}$/.test(blockhash)) {
    const latest = await rpcLatestBlockhash();
    blockhash = latest.blockhash;
    lastValidBlockHeight = latest.lastValidBlockHeight;
  }

  const prepareUserIx = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: store, isSigner: false, isWritable: false },
      { pubkey: user, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([190, 173, 143, 193, 139, 80, 231, 133]),
  });
  const setReferrerIx = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: store, isSigner: false, isWritable: false },
      { pubkey: user, isSigner: false, isWritable: true },
      { pubkey: referralCode, isSigner: false, isWritable: false },
      { pubkey: referrerUser, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([
      Buffer.from([115, 251, 55, 0, 166, 189, 25, 74]),
      Buffer.from(codeBytes),
    ]),
  });
  const tx = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash,
  }).add(prepareUserIx, setReferrerIx);
  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString('base64');
  return {
    ok: true,
    dex: 'gmtrade',
    kind: 'SetReferrer',
    code,
    referral_code_address: String(referralCode),
    referrer: decodedCode.owner,
    referrer_user: String(referrerUser),
    user_address: String(user),
    recent_blockhash: blockhash,
    last_valid_block_height: lastValidBlockHeight,
    transactions: [serialized],
    builder: 'anchor_idl_manual',
    memo_enabled: false,
  };
}

async function verifySolanaSignature({ signature, wallet }) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(String(signature || ''))) {
    throw Object.assign(new Error('Bad Solana transaction signature'), { status: 400 });
  }
  if (!isSolanaAddress(wallet)) {
    throw Object.assign(new Error('GMTrade wallet must be a Solana address'), { status: 400 });
  }
  const tx = await rpcTransaction(signature);
  if (!tx) throw Object.assign(new Error('Solana transaction not found or not confirmed yet'), { status: 404 });
  if (tx.meta?.err) throw Object.assign(new Error('Solana transaction failed'), { status: 400 });
  const keys = tx.transaction?.message?.accountKeys || [];
  const loaded = tx.meta?.loadedAddresses || {};
  const accountKeys = [
    ...keys.map(k => String(k?.pubkey || k)),
    ...(loaded.writable || []).map(String),
    ...(loaded.readonly || []).map(String),
  ];
  const walletAccountAliases = gmtradeUserAddressesForWallet(wallet);
  if (!walletAccountAliases.some(address => accountKeys.includes(address))) {
    throw Object.assign(new Error('GMTrade transaction is not linked to this player wallet'), { status: 403 });
  }
  const hasGmtradeProgram = GMTRADE_PROGRAM_IDS.some(id => accountKeys.includes(id));
  if (!hasGmtradeProgram) {
    throw Object.assign(new Error('Solana transaction does not include a known GMTrade/GMSOL program'), { status: 400 });
  }
  const createOrderEvents = decodeGmtradeCreateOrderV2Instructions(tx, accountKeys)
    .filter(ev => Number(ev?.size_delta_usd) > 0);
  let tradeEvents = [];
  const encodedEvents = extractProgramDataLogs(tx.meta?.logMessages || []);
  if (encodedEvents.length) {
    tradeEvents = decodeTradeEventsLocally(encodedEvents);
  }
  if (!tradeEvents.length && encodedEvents.length && rustBuilderAvailable()) {
    try {
      tradeEvents = await decodeTradeEventsWithRust(encodedEvents);
    } catch (e) {
      console.warn('[gmtrade] trade event decode failed:', e.message);
    }
  }
  const innerTradeEvents = decodeTradeEventsFromInnerInstructions(tx, accountKeys);
  if (innerTradeEvents.length) {
    tradeEvents = tradeEvents.concat(innerTradeEvents);
  }
  const walletEventUsers = new Set(walletAccountAliases);
  const walletEvents = tradeEvents.filter(ev => walletEventUsers.has(String(ev?.user || '')));
  return {
    slot: tx.slot,
    blockTime: tx.blockTime || null,
    accountKeys,
    encodedEventsCount: encodedEvents.length,
    tradeEvents,
    walletEvents,
    createOrderEvents,
    walletAccountAliases,
  };
}

async function getTransactionStatus(signature) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(String(signature || ''))) {
    throw Object.assign(new Error('Bad Solana transaction signature'), { status: 400 });
  }
  const statuses = await rpcRequest('getSignatureStatuses', [
    [signature],
    { searchTransactionHistory: true },
  ]);
  const status = Array.isArray(statuses?.value) ? statuses.value[0] : null;
  if (!status) return { found: false, signature, status: null };
  return {
    found: true,
    signature,
    slot: status.slot || null,
    err: status.err || null,
    confirmationStatus: status.confirmationStatus || null,
    confirmations: status.confirmations ?? null,
    status,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function solanaBlockTimeToSql(blockTime) {
  const seconds = Number(blockTime);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const iso = new Date(seconds * 1000).toISOString();
  return iso.replace('T', ' ').slice(0, 19);
}

function positiveFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function saneExecutionPrice(value, { notional = 0, mark = 0 } = {}) {
  const price = positiveFinite(value);
  if (!price || price > 1_000_000_000) return 0;
  const n = positiveFinite(notional);
  if (n && Math.abs(price - n) / Math.max(1, n) < 0.000001) return 0;
  const ref = positiveFinite(mark);
  if (ref && (price < ref / 1000 || price > ref * 1000)) return 0;
  return price;
}

async function gmtradeMarketContext({ symbol, marketToken } = {}) {
  let cfg = null;
  const token = String(marketToken || '').trim();
  if (token) {
    cfg = await configFromMarketToken(token).catch(() => null);
  }
  if (!cfg && symbol) {
    cfg = await resolveMarketConfig(symbol).catch(() => null);
  }
  const resolvedSymbol = baseSymbol(symbol || cfg?.symbol || '') || '';
  const prices = await getPrices().catch(() => ({}));
  const mark = normalizePriceRow(prices, resolvedSymbol);
  return { cfg, symbol: resolvedSymbol, mark };
}

async function verifiedPositionForTradeReport({ wallet, tx, body }) {
  const wantedSymbol = baseSymbol(body.symbol || '');
  const wantedSide = normalizeSide(body.side);
  const wantedSideLabel = wantedSide === 'short' || wantedSide === 'close_short' ? 'short' : 'long';
  const positions = await getPositionsByAddress(wallet);
  return positions
    .filter(pos => {
      const symbolOk = !wantedSymbol || baseSymbol(pos.symbol) === wantedSymbol;
      const sideOk = String(pos.side_label || '').toLowerCase() === wantedSideLabel
        || (wantedSideLabel === 'long' && String(pos.side || '').toLowerCase() === 'bid')
        || (wantedSideLabel === 'short' && String(pos.side || '').toLowerCase() === 'ask');
      const sizeOk = Number(pos.size_usd || pos.notional_usd || 0) > 0;
      const updatedSlot = Number(pos.updated_at_slot || 0);
      const slotOk = updatedSlot >= Number(tx.slot || 0)
        && updatedSlot <= Number(tx.slot || 0) + GMTRADE_POSITION_VERIFY_SLOT_WINDOW;
      return symbolOk && sideOk && sizeOk && slotOk;
    })
    .sort((a, b) => Number(b.size_usd || b.notional_usd || 0) - Number(a.size_usd || a.notional_usd || 0))[0] || null;
}

function persistPendingTradeReport(db, playerId, wallet, signature, body) {
  if (typeof db?.upsertPendingGmtradeTradeReport !== 'function') return;
  try {
    db.upsertPendingGmtradeTradeReport({ playerId, wallet, signature, body });
  } catch (e) {
    console.warn('[gmtrade] pending trade-report store failed:', e.message);
  }
}

async function recordTradeReport(db, playerId, body = {}, playerWallet = '', options = {}) {
  const wallet = resolveRequestWallet(body, playerWallet);
  const signature = String(body.tx_hash || body.signature || '').trim();
  const requestedAmount = Number(body.amount);
  const requestedTokenAmount = Number(body.token_amount || body.tokenAmount || body.quantity || body.qty);
  const requestedLeverage = Number(body.leverage || 1);
  const requestedNotional = Number(body.notional_usd || body.notionalUsd);
  const requestedMargin = Number(body.margin_usd || body.marginUsd);
  const requestedSide = normalizeSide(body.side);
  const isCloseReport = requestedSide === 'close_long' || requestedSide === 'close_short' || body.reduce_only === true || body.reduceOnly === true;
  const tx = await verifySolanaSignature({ signature, wallet });
  const tradeEvent = tx.walletEvents
    .filter(ev => Number(ev?.size_delta_usd) > 0)
    .sort((a, b) => Number(b.size_delta_usd) - Number(a.size_delta_usd))[0] || null;
  const createOrderEvent = Array.isArray(tx.createOrderEvents)
    ? tx.createOrderEvents
      .filter(ev => Number(ev?.size_delta_usd) > 0)
      .sort((a, b) => Number(b.size_delta_usd) - Number(a.size_delta_usd))[0] || null
    : null;
  let verifiedPosition = null;
  if (!tradeEvent && !isCloseReport) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      verifiedPosition = await verifiedPositionForTradeReport({ wallet, tx, body }).catch((e) => {
        console.warn('[gmtrade] position fallback verification failed:', e.message);
        return null;
      });
      if (verifiedPosition) break;
      await sleep(1000);
    }
  }
  const canUseVerifiedCloseClientNotional = isCloseReport
    && Number.isFinite(requestedNotional)
    && requestedNotional > 0
    && requestedNotional <= 10_000_000;
  // CreateOrderV2 proves that a GMTrade order was placed, but a limit order can
  // sit unfilled or later be executed by a keeper transaction. Rewards and
  // tournament volume must use execution/fill evidence only.
  if (!tradeEvent && !verifiedPosition && !GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS && !canUseVerifiedCloseClientNotional) {
    if (options.storePending !== false) {
      persistPendingTradeReport(db, playerId, wallet, signature, body);
    }
    return {
      changes: 0,
      signature,
      notional_usd: null,
      pending: true,
      warning: 'GMTrade transaction confirmed, but no execution fill is indexed yet. Rewards are credited after GMTrade executes and exposes a verifiable fill.',
      verification: {
        signature,
        wallet,
        slot: tx.slot,
        block_time: tx.blockTime,
        encoded_events_count: tx.encodedEventsCount,
        event_verified: false,
        create_order_verified: false,
        position_verified: false,
      },
    };
  }
  const amount = Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : 0;
  const leverage = Number.isFinite(requestedLeverage) && requestedLeverage > 0 ? requestedLeverage : 1;
  const notional = tradeEvent
    ? Number(tradeEvent.size_delta_usd)
    : verifiedPosition
    ? Number(verifiedPosition.size_usd || verifiedPosition.notional_usd)
    : canUseVerifiedCloseClientNotional
    ? requestedNotional
    : (amount * leverage);
  if (!Number.isFinite(notional) || notional <= 0 || notional > 10_000_000) {
    throw Object.assign(new Error('GMTrade verified notional out of range'), { status: 400 });
  }
  const marketToken = tradeEvent?.market_token || createOrderEvent?.market_token || verifiedPosition?.market_token || body.market_token || body.marketToken || '';
  const marketCtx = await gmtradeMarketContext({ symbol: body.symbol || createOrderEvent?.symbol || verifiedPosition?.symbol || '', marketToken });
  const symbol = baseSymbol(body.symbol || createOrderEvent?.symbol || tradeEvent?.symbol || verifiedPosition?.symbol || marketCtx.symbol || 'GM') || 'GM';
  const eventSide = tradeEvent
    ? (tradeEvent.is_increase === false ? `close_${tradeEvent.side}` : tradeEvent.side)
    : '';
  const side = eventSide || createOrderEvent?.side || (isCloseReport ? requestedSide : verifiedPosition?.side_label) || requestedSide;
  const bodyPrice = saneExecutionPrice(body.price, { notional, mark: marketCtx.mark });
  const positionPrice = saneExecutionPrice(verifiedPosition?.entry_price || verifiedPosition?.mark_price, { notional, mark: marketCtx.mark });
  const tokenAmount = Number.isFinite(requestedTokenAmount) && requestedTokenAmount > 0
    ? requestedTokenAmount
    : (bodyPrice > 0 ? notional / bodyPrice : 0);
  const inferredPrice = tokenAmount > 0 ? saneExecutionPrice(notional / tokenAmount, { notional, mark: marketCtx.mark }) : 0;
  const markPrice = saneExecutionPrice(marketCtx.mark, { notional, mark: marketCtx.mark });
  const price = String(bodyPrice || positionPrice || inferredPrice || markPrice || 0);
  const displayAmount = tokenAmount > 0
    ? tokenAmount
    : (Number(price) > 0 ? notional / Number(price) : amount || notional);
  const proofSource = tradeEvent
    ? 'gmtrade_solana_tx'
    : verifiedPosition
    ? 'gmtrade_position_after_tx'
    : canUseVerifiedCloseClientNotional
    ? 'gmtrade_confirmed_close_tx_client_notional'
    : 'gmtrade_client_notional';
  const verifiedSource = proofSource === 'gmtrade_position_after_tx'
    ? 'gmtrade_position_after_tx'
    : proofSource === 'gmtrade_confirmed_close_tx_client_notional'
    ? 'gmtrade_close_tx_client_notional'
    : 'gmtrade_tx';
  const result = db.addTrade(playerId, {
    symbol,
    side,
    orderType: String(body.order_type || body.orderType || 'market').toLowerCase(),
    amount: String(displayAmount),
    price,
    orderId: null,
    clientOrderId: `gmtrade:${signature}`,
    status: 'filled',
    dex: 'gmtrade',
    notional_usd: notional,
    verifiedSource,
    createdAt: solanaBlockTimeToSql(tx.blockTime),
    proofJson: JSON.stringify({
      source: proofSource,
      signature,
      wallet,
      slot: tx.slot,
      block_time: tx.blockTime,
      event_verified: !!tradeEvent,
      create_order_verified: !!createOrderEvent,
      position_verified: !!verifiedPosition,
      event: tradeEvent,
      create_order: createOrderEvent,
      position: verifiedPosition,
      client_amount: Number.isFinite(requestedAmount) ? requestedAmount : null,
      client_token_amount: Number.isFinite(requestedTokenAmount) ? requestedTokenAmount : null,
      client_leverage: Number.isFinite(requestedLeverage) ? requestedLeverage : null,
      client_notional_usd: Number.isFinite(requestedNotional) ? requestedNotional : null,
      client_margin_usd: Number.isFinite(requestedMargin) ? requestedMargin : null,
      market_context: {
        market_token: marketToken || null,
        symbol: marketCtx.symbol || null,
        mark_price: marketCtx.mark || null,
        selected_price: Number(price) || null,
      },
      reduce_only: body.reduce_only === true || body.reduceOnly === true,
      account_keys: tx.accountKeys.slice(0, 32),
    }),
  });
  if (result.changes > 0 && typeof db?.deletePendingGmtradeTradeReport === 'function') {
    try { db.deletePendingGmtradeTradeReport(signature); } catch {}
  }
  return { ...result, signature, notional_usd: notional };
}

async function reconcilePendingTradeReportsForPlayer(db, playerId, options = {}) {
  if (!playerId || typeof db?.listPendingGmtradeTradeReports !== 'function') {
    return { checked: 0, imported: 0, pending: 0, errors: 0 };
  }
  const rows = db.listPendingGmtradeTradeReports(playerId, options.limit || 25);
  let imported = 0;
  let pending = 0;
  let errors = 0;
  for (const row of rows) {
    let body = {};
    try {
      body = row.body_json ? JSON.parse(row.body_json) : {};
    } catch {
      body = {};
    }
    body.signature = body.signature || row.signature;
    body.tx_hash = body.tx_hash || row.signature;
    try {
      const result = await recordTradeReport(db, playerId, body, row.wallet, { storePending: false });
      if (result?.changes > 0) {
        imported += 1;
        if (typeof db.deletePendingGmtradeTradeReport === 'function') {
          db.deletePendingGmtradeTradeReport(row.signature);
        }
      } else if (result?.pending) {
        pending += 1;
        if (typeof db.markPendingGmtradeTradeReportAttempt === 'function') {
          db.markPendingGmtradeTradeReportAttempt(row.signature, result.warning || 'still pending');
        }
      } else {
        if (typeof db.deletePendingGmtradeTradeReport === 'function') {
          db.deletePendingGmtradeTradeReport(row.signature);
        }
      }
    } catch (e) {
      errors += 1;
      if (typeof db.markPendingGmtradeTradeReportAttempt === 'function') {
        db.markPendingGmtradeTradeReportAttempt(row.signature, e.message || String(e));
      }
    }
  }
  return { checked: rows.length, imported, pending, errors };
}

async function backfillRecentOnchainTradesForPlayer(db, playerId, wallet, options = {}) {
  if (!playerId || !isSolanaAddress(wallet)) {
    return { checked: 0, candidates: 0, imported: 0, would_import: 0, pending: 0, skipped: 0, duplicates: 0, errors: 0, pages: 0 };
  }
  const maxSignatures = Math.max(1, Math.min(1000, Number(options.limit || GMTRADE_BACKFILL_SIGNATURE_LIMIT)));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || GMTRADE_BACKFILL_PAGE_SIZE), maxSignatures));
  const minSlot = Math.max(0, Number(options.minSlot || 0));
  const dryRun = options.dryRun === true;
  const includeDetails = options.details === true;
  const rows = [];
  const seenSignatures = new Set();
  const scanAddresses = gmtradeUserAddressesForWallet(wallet);
  let pages = 0;
  for (const scanAddress of scanAddresses) {
    let before = options.before ? String(options.before) : null;
    let perAddress = 0;
    while (perAddress < maxSignatures) {
      const batchLimit = Math.min(pageSize, maxSignatures - perAddress);
      const batch = await rpcSignaturesForAddress(scanAddress, { limit: batchLimit, before }).catch((e) => {
        console.warn('[gmtrade] on-chain signature scan failed:', scanAddress, e.message);
        return [];
      });
      if (!Array.isArray(batch) || batch.length === 0) break;
      pages += 1;
      for (const item of batch) {
        const signature = String(item?.signature || '').trim();
        if (!signature || seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);
        rows.push({ ...item, scan_address: scanAddress });
      }
      perAddress += batch.length;
      before = String(batch[batch.length - 1]?.signature || '');
      if (!before || batch.length < batchLimit) break;
    }
  }
  let checked = 0;
  let candidates = 0;
  let imported = 0;
  let wouldImport = 0;
  let pending = 0;
  let skipped = 0;
  let duplicates = 0;
  let errors = 0;
  const details = [];
  const existingStmt = db?.db?.prepare
    ? db.db.prepare(`SELECT id, player_id FROM trade_history WHERE dex = 'gmtrade' AND client_order_id = ? LIMIT 1`)
    : null;
  rows.sort((a, b) => Number(a?.slot || 0) - Number(b?.slot || 0));
  for (const row of rows) {
    checked += 1;
    if (row?.err) {
      skipped += 1;
      continue;
    }
    const signature = String(row?.signature || '').trim();
    if (!signature || (minSlot > 0 && Number(row?.slot || 0) <= minSlot)) {
      skipped += 1;
      continue;
    }
    const existing = existingStmt ? existingStmt.get(`gmtrade:${signature}`) : null;
    if (existing) {
      duplicates += 1;
      skipped += 1;
      continue;
    }
    try {
      const tx = await verifySolanaSignature({ signature, wallet });
      const tradeEvent = Array.isArray(tx.walletEvents)
        ? tx.walletEvents.find(ev => Number(ev?.size_delta_usd) > 0)
        : null;
      if (!tradeEvent) {
        skipped += 1;
        continue;
      }
      candidates += 1;
      if (dryRun) {
        wouldImport += 1;
        if (includeDetails) {
          details.push({
            signature,
            slot: tx.slot,
            block_time: tx.blockTime,
            symbol: tradeEvent?.symbol || 'GM',
            side: tradeEvent?.side || 'long',
            notional_usd: Number(tradeEvent?.size_delta_usd || 0),
            scan_address: row.scan_address || null,
          });
        }
        continue;
      }
      const result = await recordTradeReport(db, playerId, {
        signature,
        tx_hash: signature,
        wallet,
        symbol: options.symbol || tradeEvent?.symbol || 'GM',
        side: options.side || tradeEvent?.side || 'long',
        amount: 0,
        leverage: 1,
      }, wallet, { storePending: true });
      if (result?.changes > 0) imported += 1;
      else if (result?.pending) pending += 1;
      else skipped += 1;
    } catch (e) {
      if (/does not include a known GMTrade\/GMSOL program/i.test(String(e?.message || ''))) {
        skipped += 1;
      } else {
        errors += 1;
        console.warn('[gmtrade] on-chain backfill tx failed:', signature, e.message);
      }
    }
  }
  const out = { checked, candidates, imported, would_import: wouldImport, pending, skipped, duplicates, errors, pages };
  if (includeDetails) out.details = details;
  return out;
}

module.exports = {
  GMTRADE_APP_URL,
  GMTRADE_DOCS_URL,
  GMTRADE_REFERRAL_CODE,
  configStatus: () => ({
    ok: true,
    dex: 'gmtrade',
    app_url: GMTRADE_APP_URL,
    docs_url: GMTRADE_DOCS_URL,
    rpc_url: GMTRADE_RPC_URL,
    rpc_origin: GMTRADE_RPC_ORIGIN || null,
    referral_code: GMTRADE_REFERRAL_CODE || null,
    referral_url: referralUrl(),
    chain: 'solana',
    sdk: '@gmsol-labs/gmsol-sdk',
    sdk_version: '0.9.0',
    trading_mode: 'self_custody_solana_gmsol',
    node_sdk_builder_enabled: GMTRADE_ENABLE_NODE_SDK_BUILDER,
    market_data: 'coingecko_gmtrade_derivatives_with_pyth_fallback',
    market_data_last_error: marketInfoCache.error,
    reward_verification: 'confirmed_solana_signature_trade_event_or_position_after_tx',
    min_position_usd: GMTRADE_MIN_POSITION_USD,
    trade_event_decoder: rustBuilderAvailable() ? 'node_layout_and_rust_gmsol_sdk' : 'node_layout_gmsol_trade_event',
    allow_client_notional_reports: GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS,
    verified_sources: GMTRADE_VERIFIED_SOURCES,
    program_ids: GMTRADE_PROGRAM_IDS,
    market_discovery_enabled: GMTRADE_DISCOVER_MARKETS,
    market_discovery_last_error: marketDiscoveryCache.error,
    official_market_registry_tokens: DEFAULT_GMTRADE_MARKET_TOKENS.length,
    official_market_registry_last_error: defaultMarketTokenCache.error,
    market_token_config_last_error: marketTokenConfigCache.error,
    store_address: GMTRADE_STORE_ADDRESS,
    discovered_markets: cachedDiscoveredMarketSymbols(),
    configured_market_tokens: configuredMarketTokenSymbols(),
    native_order_builder: (rustBuilderAvailable() || GMTRADE_ENABLE_NODE_SDK_BUILDER)
      && (configuredMarketSymbols().length > 0 || DEFAULT_GMTRADE_MARKET_TOKENS.length > 0),
    rust_builder_bin: rustBuilderAvailable() ? GMTRADE_RUST_BUILDER_BIN : null,
    configured_markets: configuredMarketSymbols(),
  }),
  buildCancelOrderTx,
  buildCreateOrderTx,
  buildSetReferrerTx,
  discoverGmtradeMarkets,
  getAccountByAddress,
  getMarketInfo,
  getOrderbook,
  getOrdersByAddress,
  getPositionsByAddress,
  getPrices,
  getTransactionStatus,
  getUserReferralByAddress,
  isSolanaAddress,
  backfillRecentOnchainTradesForPlayer,
  recordTradeReport,
  reconcilePendingTradeReportsForPlayer,
  referralUrl,
  GMTRADE_VERIFIED_SOURCES,
  _internal: {
    decodeGmtradeCreateOrderV2Instruction,
    decodeTradeEventsFromInnerInstructions,
    decodeGmtradeTradeEvent,
    decodeGmtradeTradeEventBuffer,
    decodeTradeEventsLocally,
    discoverDefaultMarketTokenConfigs,
    gmRawUsdToNumber,
  },
};
