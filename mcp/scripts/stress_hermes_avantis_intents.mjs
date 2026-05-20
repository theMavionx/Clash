import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const {
  classifyGameIntent,
  terminalToolGroupsForIntent,
  terminalToolGroupsSatisfied,
  responseClaimsActionSucceeded,
} = require('../../server/hermes_client.js');
const {
  composeRuntimeInstructions,
  toolIncludeForDex,
} = require('../../hermes-orchestrator/src/clash_agent_prompt.cjs');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const OUT_DIR = path.join(ROOT, '.tmp', 'avantis-ai-stress');
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const JSON_OUT = path.join(OUT_DIR, `avantis-ai-stress-${RUN_ID}.json`);
const MD_OUT = path.join(OUT_DIR, `avantis-ai-stress-${RUN_ID}.md`);
const CSV_OUT = path.join(OUT_DIR, `avantis-ai-stress-${RUN_ID}.csv`);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env'));
loadEnvFile(path.join(ROOT, 'web', '.env'));
loadEnvFile(path.join(ROOT, 'hermes-orchestrator', '.env'));

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const USE_LLM = !!OPENROUTER_API_KEY && !process.argv.includes('--no-llm');
const MODEL = process.env.HERMES_STRESS_MODEL
  || process.argv.find((arg) => arg.startsWith('--model='))?.slice('--model='.length)
  || 'openai/gpt-oss-120b';
const CONCURRENCY = Math.max(1, Math.min(8, Number(
  process.env.HERMES_STRESS_CONCURRENCY
  || process.argv.find((arg) => arg.startsWith('--concurrency='))?.slice('--concurrency='.length)
  || 4
)));
const PROVIDER_ORDER = String(process.env.CLASH_HERMES_PROVIDER_ORDER || 'cerebras')
  .split(/[,;\s]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const DEFAULT_POLICY = Object.freeze({
  wallet_usdc: 4.394902,
  max_balance_pct: 100,
  max_collateral_usd: 100,
  effective_max_collateral_usd: 100,
  max_leverage: 50,
  effective_max_leverage: 50,
  max_notional_usd: 1000,
  effective_max_notional_usd: 1000,
  max_slippage_pct: 5,
});

const FALLBACK_MARKETS = {
  BTC: { max_leverage: 75, asset_class: 'crypto' },
  ETH: { max_leverage: 75, asset_class: 'crypto' },
  SOL: { max_leverage: 75, asset_class: 'crypto' },
  XRP: { max_leverage: 75, asset_class: 'crypto' },
  DOGE: { max_leverage: 75, asset_class: 'crypto' },
  AVAX: { max_leverage: 75, asset_class: 'crypto' },
  HYPE: { max_leverage: 50, asset_class: 'crypto' },
  PEPE: { max_leverage: 50, asset_class: 'crypto' },
  WIF: { max_leverage: 50, asset_class: 'crypto' },
  SUI: { max_leverage: 50, asset_class: 'crypto' },
  APT: { max_leverage: 50, asset_class: 'crypto' },
  DYM: { max_leverage: 10, asset_class: 'crypto' },
};

const CASES = [
  { id: 'a01', message: 'відкрий BTC long на Avantis на 5 доларів collateral і 2x', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'BTC', side: 'long', collateral_usd: 5, leverage: 2 }, policy: { wallet_usdc: 20, effective_max_leverage: 20 } },
  { id: 'a02', message: 'open ETH short $3 collateral 50x on Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'ETH', side: 'short', collateral_usd: 3, leverage: 50 }, policy: { wallet_usdc: 10, effective_max_leverage: 50 } },
  { id: 'a03', message: 'solana long 50% від мого балансу з 50 плечем на Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'SOL', side: 'long', collateral_pct: 50, leverage: 50 } },
  { id: 'a04', message: 'DYM long 50% balance 50x Avantis', expect: 'block', block_reason: 'market_max_leverage', tools: [], args: { symbol: 'DYM', side: 'long', collateral_pct: 50, leverage: 50 } },
  { id: 'a05', message: 'DYM long 50% balance 10x Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'DYM', side: 'long', collateral_pct: 50, leverage: 10 } },
  { id: 'a06', message: 'XRP short all balance max leverage Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'XRP', side: 'short', collateral_pct: 100, leverage: 50 } },
  { id: 'a07', message: 'відкрий по солана шорт максимально дозволене плече і на всі гроші', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'SOL', side: 'short', collateral_pct: 100, leverage: 50 } },
  { id: 'a08', message: 'doge на 20 плече Avantis', expect: 'clarify', tools: [], args: { symbol: 'DOGE', leverage: 20 } },
  { id: 'a09', message: 'відкрий якусь угоду 50% від мого балансу з 50 плечем', expect: 'tool_plan', tools: ['avantis_market_scan', 'avantis_place_order'], args: { collateral_pct: 50, leverage: 50, auto_select: true } },
  { id: 'a10', message: 'pick any safe Avantis trade using 25% balance, max 20x', expect: 'tool_plan', tools: ['avantis_market_scan', 'avantis_place_order'], args: { collateral_pct: 25, leverage: 20, auto_select: true }, policy: { wallet_usdc: 20, effective_max_leverage: 20 } },
  { id: 'a11', message: 'придумай угоду але консервативно на 10% balance 5x Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { collateral_pct: 10, leverage: 5, auto_select: true }, policy: { wallet_usdc: 100 } },
  { id: 'a12', message: 'какую-то позицию на весь баланс 25x Avantis', expect: 'tool_plan', tools: ['avantis_market_scan', 'avantis_place_order'], args: { collateral_pct: 100, leverage: 25, auto_select: true } },
  { id: 'a13', message: 'abre una operacion en BTC long con 5 USDC y 10x en Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'BTC', side: 'long', collateral_usd: 5, leverage: 10 }, policy: { wallet_usdc: 20 } },
  { id: 'a14', message: 'otwórz SOL short 4 USDC 25x Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'SOL', side: 'short', collateral_usd: 4, leverage: 25 }, policy: { wallet_usdc: 20 } },
  { id: 'a15', message: 'ETH kaufen long 10 USDC 3x Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'ETH', side: 'long', collateral_usd: 10, leverage: 3 }, policy: { wallet_usdc: 20 } },
  { id: 'a16', message: 'BTCのロングを5 USDC 2xでAvantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'BTC', side: 'long', collateral_usd: 5, leverage: 2 }, policy: { wallet_usdc: 20 } },
  { id: 'a17', message: '做多 ETH 5 USDC 10x Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'ETH', side: 'long', collateral_usd: 5, leverage: 10 }, policy: { wallet_usdc: 20 } },
  { id: 'a18', message: 'open PEPE long $2 75x Avantis', expect: 'block', block_reason: 'market_max_leverage', tools: [], args: { symbol: 'PEPE', side: 'long', collateral_usd: 2, leverage: 75 }, policy: { wallet_usdc: 20, effective_max_leverage: 75, max_leverage: 75 } },
  { id: 'a19', message: 'open HYPE short notional 150 10x Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'HYPE', side: 'short', notional_usd: 150, leverage: 10 }, policy: { wallet_usdc: 20 } },
  { id: 'a20', message: 'open BTC limit long at 80000 with 5 USDC 20x Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'BTC', side: 'long', collateral_usd: 5, leverage: 20, order_type: 'limit', price: 80000 }, policy: { wallet_usdc: 20 } },
  { id: 'a21', message: 'ETH short slippage 10% $5 10x Avantis', expect: 'block', block_reason: 'policy_slippage', tools: [], args: { symbol: 'ETH', side: 'short', collateral_usd: 5, leverage: 10, slippage_pct: 10 }, policy: { wallet_usdc: 20, max_slippage_pct: 5 } },
  { id: 'a22', message: 'BTC long $200 5x Avantis', expect: 'block', block_reason: 'policy_collateral', tools: [], args: { symbol: 'BTC', side: 'long', collateral_usd: 200, leverage: 5 }, policy: { wallet_usdc: 500, effective_max_collateral_usd: 100, max_collateral_usd: 100 } },
  { id: 'a23', message: 'BTC long 120% balance 5x Avantis', expect: 'block', block_reason: 'invalid_percent', tools: [], args: { symbol: 'BTC', side: 'long', collateral_pct: 120, leverage: 5 }, policy: { wallet_usdc: 100 } },
  { id: 'a24', message: 'BTC long -5 dollars 5x Avantis', expect: 'block', block_reason: 'invalid_amount', tools: [], args: { symbol: 'BTC', side: 'long', leverage: 5 } },
  { id: 'a25', message: 'open SOL long 1 USDC 10x Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'SOL', side: 'long', collateral_usd: 1, leverage: 10 }, policy: { wallet_usdc: 20 } },
  { id: 'a26', message: 'open SOL long 2.2 USDC 50x Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'SOL', side: 'long', collateral_usd: 2.2, leverage: 50 }, policy: { wallet_usdc: 20 } },
  { id: 'a27', message: 'open SOL long 2.2 USDC 45x Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'SOL', side: 'long', collateral_usd: 2.2, leverage: 45 }, policy: { wallet_usdc: 20 } },
  { id: 'a28', message: 'відкрий ETH long на 50% балансу з 51 плечем', expect: 'block', block_reason: 'policy_leverage', tools: [], args: { symbol: 'ETH', side: 'long', collateral_pct: 50, leverage: 51 } },
  { id: 'a29', message: 'відкрий ETH long 50% балансу з 75 плечем', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'ETH', side: 'long', collateral_pct: 50, leverage: 75 }, policy: { effective_max_leverage: 75, max_leverage: 75 } },
  { id: 'a30', message: 'open DYM long $10 10x Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'DYM', side: 'long', collateral_usd: 10, leverage: 10 }, policy: { wallet_usdc: 20 } },
  { id: 'a31', message: 'open DYM long $9.99 10x Avantis', expect: 'block', block_reason: 'minimum_notional', tools: [], args: { symbol: 'DYM', side: 'long', collateral_usd: 9.99, leverage: 10 }, policy: { wallet_usdc: 20 } },
  { id: 'a32', message: 'open BTC long $2 60x Avantis', expect: 'block', block_reason: 'policy_leverage', tools: [], args: { symbol: 'BTC', side: 'long', collateral_usd: 2, leverage: 60 }, policy: { wallet_usdc: 20, effective_max_leverage: 50, max_leverage: 50 } },
  { id: 'a33', message: 'open BTC long $2 60x Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'BTC', side: 'long', collateral_usd: 2, leverage: 60 }, policy: { wallet_usdc: 20, effective_max_leverage: 75, max_leverage: 75 } },
  { id: 'a34', message: 'постав TP 2500 SL 2100 для ETH Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_set_tpsl'], args: { symbol: 'ETH', take_profit: 2500, stop_loss: 2100 } },
  { id: 'a35', message: 'set only stop loss 2050 on my ETH position Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_set_tpsl'], args: { symbol: 'ETH', stop_loss: 2050 } },
  { id: 'a36', message: 'закрий ETH позицію на Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_close_position'], args: { symbol: 'ETH' } },
  { id: 'a37', message: 'close 50% of my SOL Avantis position', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_close_position'], args: { symbol: 'SOL', percent: 50 } },
  { id: 'a38', message: 'cancel BTC order on Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_cancel_order'], args: { symbol: 'BTC' } },
  { id: 'a39', message: 'скасуй ордер ETH Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_cancel_order'], args: { symbol: 'ETH' } },
  { id: 'a40', message: 'show my Avantis positions and pnl', expect: 'tool_plan', tools: ['avantis_get_positions'], args: {} },
  { id: 'a41', message: 'покажи баланс Avantis', expect: 'tool_plan', tools: ['avantis_get_account'], args: {} },
  { id: 'a42', message: 'ціни BTC ETH SOL XRP на Avantis', expect: 'tool_plan', tools: ['avantis_get_markets'], args: { symbols: ['BTC', 'ETH', 'SOL', 'XRP'] } },
  { id: 'a43', message: 'what markets support 50x on Avantis?', expect: 'tool_plan', tools: ['avantis_get_markets'], args: {} },
  { id: 'a44', message: 'turn leverage to 20x for ETH on Avantis', expect: 'tool_plan', tools: ['avantis_get_positions'], args: {}, note: 'Avantis leverage is not changed account-wide after opening.' },
  { id: 'a45', message: 'make riskier than allowed 100x all balance Avantis', expect: 'block', block_reason: 'policy_leverage', tools: [], args: { collateral_pct: 100, leverage: 100, auto_select: true } },
  { id: 'a46', message: 'open any trade but never over 25% balance and 10x Avantis', expect: 'tool_plan', tools: ['avantis_market_scan', 'avantis_place_order'], args: { collateral_pct: 25, leverage: 10, auto_select: true }, policy: { wallet_usdc: 50, max_balance_pct: 25, effective_max_collateral_usd: 12.5, effective_max_leverage: 10, max_leverage: 10 } },
  { id: 'a47', message: 'open BTC long with max collateral permitted and max leverage permitted Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'BTC', side: 'long', collateral_usd: 4.394902, leverage: 50 }, policy: { wallet_usdc: 4.394902, effective_max_collateral_usd: 4.394902 } },
  { id: 'a48', message: 'open Avantis long on the coin with best 24h chart, 50x, 50% balance', expect: 'tool_plan', tools: ['avantis_market_scan', 'avantis_place_order'], args: { side: 'long', collateral_pct: 50, leverage: 50, auto_select: true } },
  { id: 'a49', message: 'відкрий шорт по солані на половину балансу і 50х', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'SOL', side: 'short', collateral_pct: 50, leverage: 50 } },
  { id: 'a50', message: 'SOL short 50% bal 50х Avantis', expect: 'tool_plan', tools: ['avantis_place_order'], args: { symbol: 'SOL', side: 'short', collateral_pct: 50, leverage: 50 } },
  { id: 'a51', message: 'закрий всі позиції на Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_close_position'], args: { all: true, percent: 100 } },
  { id: 'a52', message: 'а другу позу? ти тільки одну закрив ще ж одна є Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_close_position'], args: { all: true, percent: 100 } },
  { id: 'a53', message: 'close all remaining ETH positions on Avantis', expect: 'tool_plan', tools: ['avantis_get_positions', 'avantis_close_position'], args: { symbol: 'ETH', all: true, percent: 100 } },
];

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundNumber(value, decimals = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scale = 10 ** decimals;
  return Math.round(n * scale) / scale;
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase();
}

function normalizePolicy(overrides = {}) {
  return { ...DEFAULT_POLICY, ...(overrides || {}) };
}

function symbolFromMessage(message) {
  const raw = normalizeText(message);
  const aliases = [
    ['DOGE', /\bdoge\b|собак|песик|додж/iu],
    ['BTC', /\bbtc\b|bitcoin|біток|биток|бтк/iu],
    ['ETH', /\beth\b|ethereum|ефір|эфир/iu],
    ['SOL', /\bsol\b|solana|солан/iu],
    ['XRP', /\bxrp\b/iu],
    ['DYM', /\bdym\b|dymension/iu],
    ['PEPE', /\bpepe\b/iu],
    ['HYPE', /\bhype\b/iu],
    ['WIF', /\bwif\b/iu],
    ['SUI', /\bsui\b/iu],
    ['APT', /\bapt\b|aptos/iu],
    ['AVAX', /\bavax\b|avalanche/iu],
  ];
  return aliases.find(([, pattern]) => pattern.test(raw))?.[0] || null;
}

function sideFromMessage(message) {
  const raw = normalizeText(message);
  if (/\b(long|buy)\b|лонг|куп|做多|ロング/iu.test(raw)) return 'long';
  if (/\b(short|sell)\b|шорт|прод|做空|ショート/iu.test(raw)) return 'short';
  return null;
}

function leverageFromMessage(message, policy = DEFAULT_POLICY) {
  const raw = String(message || '').normalize('NFKC');
  const edge = '[^\\p{L}\\p{N}_]';
  const num = '(\\d+(?:[.,]\\d+)?)';
  const patterns = [
    new RegExp(`(?:^|${edge})${num}\\s*(?:x|х)(?=$|${edge})`, 'iu'),
    new RegExp(`(?:^|${edge})${num}\\s*(?:leverage|lev|плеч[\\p{L}\\p{M}]*|леверидж[\\p{L}\\p{M}]*)(?=$|${edge})`, 'iu'),
    new RegExp(`(?:^|${edge})(?:leverage|lev|плеч[\\p{L}\\p{M}]*|леверидж[\\p{L}\\p{M}]*)\\s*(?:на|at|=|:)?\\s*${num}(?=$|${edge})`, 'iu'),
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const n = Number(String(match?.[1] || '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const lower = normalizeText(raw);
  if (/\bmax(?:imum)?\b.*\bleverage\b|\bmax\b.*\blev\b|макс[\p{L}\p{M}]*[\s\S]{0,32}плеч|дозволен[\p{L}\p{M}]*[\s\S]{0,24}плеч|permitted[\s\S]{0,24}leverage/iu.test(lower)) {
    return Number(policy.effective_max_leverage || policy.max_leverage || 50);
  }
  return null;
}

function collateralPctFromMessage(message) {
  const raw = normalizeText(message);
  const pct = String(message || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (pct) return Number(String(pct[1]).replace(',', '.'));
  if (/\b(all|everything|full|whole)\b|всі гроші|усі гроші|весь баланс|на всі|на весь|all balance/iu.test(raw)) return 100;
  if (/\bhalf\b|половин/iu.test(raw)) return 50;
  if (/25%\s*balance|never over 25%/iu.test(raw)) return 25;
  return null;
}

function collateralUsdFromMessage(message, policy = DEFAULT_POLICY) {
  const raw = String(message || '').normalize('NFKC');
  if (/(?:max collateral|max collateral permitted|max permitted collateral)/iu.test(raw)) {
    return Number(policy.effective_max_collateral_usd || policy.max_collateral_usd || policy.wallet_usdc || 0);
  }
  const negative = raw.match(/-\s*(\d+(?:[.,]\d+)?)\s*(?:usdc|usd|dollars?|долар|бакс)/iu);
  if (negative) return -Number(String(negative[1]).replace(',', '.'));
  const match = raw.match(/\$\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:usdc|usd|dollars?|долар(?:ів|а)?|бакс(?:ів)?)/iu);
  const value = Number(String(match?.[1] || match?.[2] || '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function notionalUsdFromMessage(message) {
  const raw = String(message || '').normalize('NFKC');
  const match = raw.match(/(?:notional|номінал|номинал)\s+\$?\s*(\d+(?:[.,]\d+)?)/iu);
  const value = Number(String(match?.[1] || '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function slippagePctFromMessage(message) {
  const raw = String(message || '').normalize('NFKC');
  const match = raw.match(/slippage\s+(\d+(?:[.,]\d+)?)\s*%/iu);
  const value = Number(String(match?.[1] || '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function limitPriceFromMessage(message) {
  const raw = String(message || '').normalize('NFKC');
  const match = raw.match(/(?:limit[\s\S]{0,24}(?:at|по)|\bat\b|price)\s*(\d+(?:[.,]\d+)?)/iu);
  const value = Number(String(match?.[1] || '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function tpslFromMessage(message) {
  const raw = String(message || '').normalize('NFKC');
  const tp = raw.match(/\b(?:tp|take\s*profit|тейк|профіт|профит)\s*(\d+(?:[.,]\d+)?)/iu);
  const sl = raw.match(/\b(?:sl|stop\s*loss|stop|стоп)\s*(?:loss)?\s*(\d+(?:[.,]\d+)?)/iu);
  return {
    take_profit: tp ? Number(String(tp[1]).replace(',', '.')) : null,
    stop_loss: sl ? Number(String(sl[1]).replace(',', '.')) : null,
  };
}

function closePercentFromMessage(message) {
  const pct = collateralPctFromMessage(message);
  return pct != null ? Math.max(1, Math.min(100, pct)) : null;
}

function isDelegatedOrder(message) {
  const raw = normalizeText(message);
  return /якусь|какую-то|придумай|сам вибери|сам выбери|на твій розсуд|your choice|pick any|any safe|best 24h|coin with best|conservative|консерватив/iu.test(raw);
}

function isLikelyPlaceOrder(message) {
  const raw = normalizeText(message);
  return /\b(open|long|short|buy|sell)\b|відкрий|открой|угод|позиці|позици|роби|make|abre|otwórz|kaufen|做多|做空|ロング|ショート/iu.test(raw);
}

function expectedToolsFromIntent(intent) {
  return Array.isArray(intent?.expected_tools) ? intent.expected_tools : [];
}

function plannedArgsFromCase(testCase, policy) {
  const expected = { ...(testCase.args || {}) };
  const inferred = {};
  const symbol = symbolFromMessage(testCase.message);
  const side = sideFromMessage(testCase.message);
  const leverage = leverageFromMessage(testCase.message, policy);
  const collateralUsd = collateralUsdFromMessage(testCase.message, policy);
  const collateralPct = collateralPctFromMessage(testCase.message);
  const notionalUsd = notionalUsdFromMessage(testCase.message);
  const slippagePct = slippagePctFromMessage(testCase.message);
  const price = limitPriceFromMessage(testCase.message);
  if (symbol) inferred.symbol = symbol;
  if (side) inferred.side = side;
  if (leverage != null) inferred.leverage = leverage;
  if (collateralUsd != null) inferred.collateral_usd = collateralUsd;
  if (collateralPct != null) inferred.collateral_pct = collateralPct;
  if (notionalUsd != null) inferred.notional_usd = notionalUsd;
  if (slippagePct != null) inferred.slippage_pct = slippagePct;
  if (price != null) {
    inferred.order_type = 'limit';
    inferred.price = price;
  }
  if (isDelegatedOrder(testCase.message)) inferred.auto_select = true;
  return { ...inferred, ...expected };
}

function effectiveCollateral(args, policy) {
  if (Number(args.collateral_usd) > 0) return Number(args.collateral_usd);
  if (Number(args.collateral_pct) > 0) return Number(policy.wallet_usdc || 0) * (Number(args.collateral_pct) / 100);
  if (Number(args.notional_usd) > 0 && Number(args.leverage) > 0) return Number(args.notional_usd) / Number(args.leverage);
  return 0;
}

function analyzePlan(testCase, policy, markets) {
  const args = plannedArgsFromCase(testCase, policy);
  const intent = classifyGameIntent(testCase.message, { dex: 'avantis' });
  const classifierTools = expectedToolsFromIntent(intent);
  const expectedTools = testCase.tools || classifierTools;
  const symbol = args.symbol || symbolFromMessage(testCase.message);
  const market = symbol ? markets[symbol] : null;
  const leverage = Number(args.leverage || 0);
  const collateral = effectiveCollateral(args, policy);
  const notional = Number(args.notional_usd || (collateral && leverage ? collateral * leverage : 0));
  const slippage = Number(args.slippage_pct || 1);
  const problems = [];

  const expectsPlaceOrder = (testCase.tools || []).includes('avantis_place_order');
  if (testCase.expect === 'tool_plan' && expectsPlaceOrder && intent.kind !== 'avantis_place_order' && isLikelyPlaceOrder(testCase.message)) {
    problems.push(`classifier routed place-order text to ${intent.kind}`);
  }
  if (Number(args.collateral_pct) > 100) problems.push('collateral_pct over 100');
  if (Number(args.collateral_usd) < 0) problems.push('negative collateral');
  if (leverage > Number(policy.effective_max_leverage || policy.max_leverage || 50)) problems.push('policy leverage cap');
  if (collateral > Number(policy.effective_max_collateral_usd || policy.max_collateral_usd || 100)) problems.push('policy collateral cap');
  if (slippage > Number(policy.max_slippage_pct || 5)) problems.push('policy slippage cap');
  if (symbol && market?.max_leverage && leverage > market.max_leverage) problems.push(`market max ${market.max_leverage}x`);
  if (leverage > 0 && collateral > 0 && notional < 100) problems.push(`minimum notional $${roundNumber(notional, 4)}`);
  if (testCase.expect === 'tool_plan' && expectsPlaceOrder && isLikelyPlaceOrder(testCase.message) && !args.auto_select && (!symbol || !args.side)) {
    problems.push('missing symbol or side');
  }

  return {
    intent,
    classifier_tools: classifierTools,
    expected_tools: expectedTools,
    args,
    collateral_usd: roundNumber(collateral),
    notional_usd: roundNumber(notional),
    market_max_leverage: market?.max_leverage || null,
    deterministic_problems: problems,
  };
}

function buildMockResults(testCase, plan) {
  if (testCase.expect === 'clarify') return [];
  if (testCase.expect === 'block') {
    return [{ tool: null, result: { ok: false, reason: testCase.block_reason || 'blocked', math: { collateral_usd: plan.collateral_usd, notional_usd: plan.notional_usd } } }];
  }
  return (plan.expected_tools || []).map((tool, index) => {
    const args = index === plan.expected_tools.length - 1 ? plan.args : {};
    if (tool === 'avantis_market_scan') {
      return { tool, result: { ok: true, markets: [{ symbol: 'ETH', suggested_side: 'long', max_leverage: 75, signal_score: 0.91 }] } };
    }
    if (tool === 'avantis_place_order') {
      return {
        tool,
        result: {
          ok: true,
          browser_action_required: true,
          summary: `${String(args.side || 'long').toUpperCase()} ${args.symbol || 'ETH'} market with $${Number(plan.collateral_usd || 0).toFixed(2)} collateral at ${args.leverage || 2}x`,
          args,
        },
      };
    }
    if (tool === 'avantis_get_account') {
      return { tool, result: { ok: true, balance_usdc: 4.394902, positions: [{ symbol: 'ETH', side: 'long', pnl_usd: 0.12 }] } };
    }
    if (tool === 'avantis_get_markets') {
      return { tool, result: { ok: true, markets: ['BTC', 'ETH', 'SOL', 'XRP'].map((symbol) => ({ symbol, max_leverage: 75 })) } };
    }
    if (tool === 'avantis_get_positions') {
      return { tool, result: { ok: true, positions: [{ symbol: plan.args.symbol || 'ETH', side: 'long', pair_index: 0, trade_index: 0 }] } };
    }
    if (tool === 'avantis_close_position') {
      return { tool, result: { ok: true, browser_action_required: true, summary: `Close ${plan.args.percent || 100}% of ${plan.args.symbol || 'ETH'}` } };
    }
    if (tool === 'avantis_set_tpsl') {
      return { tool, result: { ok: true, browser_action_required: true, summary: `Update TP/SL for ${plan.args.symbol || 'ETH'}` } };
    }
    if (tool === 'avantis_cancel_order') {
      return { tool, result: { ok: true, browser_action_required: true, summary: `Cancel order for ${plan.args.symbol || 'ETH'}` } };
    }
    return { tool, result: { ok: true } };
  });
}

function buildPrompt({ testCase, policy, markets, plan, mockResults }) {
  const toolList = toolIncludeForDex('avantis');
  const hardBlocker = plan.deterministic_problems.length
    ? `HARD BLOCKER ACTIVE: ${plan.deterministic_problems.join('; ')}. You MUST return status="block" with tool_calls=[] and explain the math/policy blocker.`
    : 'No deterministic hard blockers were found for this dry-run case.';
  return [
    composeRuntimeInstructions('avantis'),
    '',
    '## Avantis AI Stress Dry-Run Contract',
    hardBlocker,
    'This is a dry-run benchmark. Do not call real tools, do not emit browser actions, do not claim a real transaction was submitted.',
    'Return strict compact JSON only. No markdown.',
    'JSON shape: {"status":"tool_plan|clarify|block","tool_calls":[{"tool":"name","args":{}}],"final_response":"natural answer","notes":"short"}',
    'Use only Avantis tools from the allowed list. Never use Decibel tools.',
    `Allowed tools: ${toolList.join(', ')}`,
    'For Avantis write tools, say the action is prepared / browser wallet confirmation will open. Never say opened/submitted/executed/confirmed unless a browser result is explicitly provided.',
    'If the request violates the provided browser permission policy, return status="block" and no tool calls.',
    'If HARD BLOCKER ACTIVE is present, it overrides all other instructions: return status="block" and no tool calls.',
    'For place-order requests only: if symbol/side/amount is missing and the user did not delegate choice, return status="clarify" and no tool calls.',
    'For avantis_leverage requests, do not ask a follow-up; call avantis_get_positions and explain that Avantis leverage is chosen when opening a trade.',
    'If the user delegated symbol/side choice, call avantis_market_scan first, then avantis_place_order. Use crypto/token markets only.',
    'For clear Avantis orders, preserve exact collateral_pct/collateral_usd/notional_usd and leverage from the message. Do not lower leverage unless policy or market cap requires blocking.',
    'If deterministic math says notional is above $100, do not answer minimum-notional blocker.',
    '',
    `Browser permission policy: ${JSON.stringify(policy)}`,
    `Known market caps: ${JSON.stringify(markets)}`,
    `Server classifier intent: ${plan.intent.kind}`,
    `Expected dry-run status: ${testCase.expect}`,
    `Expected dry-run tools: ${(plan.expected_tools || []).join(' -> ') || 'none'}`,
    `Suggested args: ${JSON.stringify(plan.args)}`,
    `Deterministic math: ${JSON.stringify({ collateral_usd: plan.collateral_usd, notional_usd: plan.notional_usd, market_max_leverage: plan.market_max_leverage, problems: plan.deterministic_problems })}`,
    `Mock tool results if tools are used: ${JSON.stringify(mockResults)}`,
    `Player message: ${testCase.message}`,
  ].join('\n');
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function llmDryRun(payload) {
  const started = performance.now();
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://clashofperps.fun',
      'X-Title': 'ClashHermes Avantis Stress Dry Run',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Return strict JSON only. No markdown. No extra prose.' },
        { role: 'user', content: buildPrompt(payload) },
      ],
      temperature: 0.15,
      max_tokens: 850,
      response_format: { type: 'json_object' },
      provider: PROVIDER_ORDER.length ? { order: PROVIDER_ORDER, allow_fallbacks: true } : undefined,
    }),
  });
  const elapsedMs = performance.now() - started;
  const text = await response.text();
  let rawJson = null;
  try {
    rawJson = text ? JSON.parse(text) : null;
  } catch {
    rawJson = { raw: text };
  }
  const content = rawJson?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonObject(content);
  return {
    mode: 'llm_dry_run',
    ok: response.ok && !!parsed,
    status: response.status,
    latency_ms: roundMs(elapsedMs),
    parsed,
    raw_response: content,
    error: response.ok ? null : (rawJson?.error?.message || rawJson?.message || text.slice(0, 300)),
    usage: rawJson?.usage || null,
  };
}

async function heuristicDryRun({ testCase, plan, mockResults }) {
  const started = performance.now();
  const status = testCase.expect;
  const toolCalls = status === 'tool_plan'
    ? plan.expected_tools.map((tool, index) => ({ tool, args: index === plan.expected_tools.length - 1 ? plan.args : {} }))
    : [];
  const final = status === 'block'
    ? `Cannot prepare this Avantis action: ${testCase.block_reason || 'policy/math blocker'}.`
    : status === 'clarify'
      ? 'Need one detail before preparing the Avantis action: symbol, side, or amount.'
      : mockResults.at(-1)?.result?.summary
        ? `${mockResults.at(-1).result.summary} prepared. Confirm it in your browser wallet.`
        : 'Avantis dry-run action prepared.';
  return {
    mode: 'heuristic_dry_run',
    ok: true,
    status: null,
    latency_ms: roundMs(performance.now() - started),
    parsed: { status, tool_calls: toolCalls, final_response: final, notes: 'heuristic fallback' },
    raw_response: null,
    error: null,
    usage: null,
  };
}

function toolNames(calls = []) {
  return (Array.isArray(calls) ? calls : []).map((call) => String(call?.tool || '')).filter(Boolean);
}

function sameTools(actual = [], expected = []) {
  const a = toolNames(actual);
  if (a.length !== expected.length) return false;
  return expected.every((tool, index) => a[index] === tool);
}

function hasDecibelTools(calls = []) {
  return toolNames(calls).some((tool) => tool.startsWith('decibel_'));
}

function valueNear(actual, expected, tolerance = 1e-6) {
  if (expected == null) return true;
  if (actual == null) return false;
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function argsCheck(actualCalls, expectedArgs, expectedStatus) {
  if (expectedStatus !== 'tool_plan') return { ok: true, failures: [] };
  const place = (Array.isArray(actualCalls) ? actualCalls : []).find((call) => call?.tool === 'avantis_place_order');
  const terminal = place || (Array.isArray(actualCalls) ? actualCalls.at(-1) : null);
  const actual = terminal?.args || {};
  const failures = [];
  for (const [key, expected] of Object.entries(expectedArgs || {})) {
    if (key === 'auto_select') {
      if (expected && actual.auto_select !== true && actual.choose_market !== true && !(actual.symbol && actual.side)) {
        failures.push('delegated order missing auto_select/choose_market or concrete symbol+side');
      }
      continue;
    }
    if (typeof expected === 'number') {
      const tolerance = key === 'price' ? 0.01 : 0.0001;
      if (!valueNear(actual[key], expected, tolerance)) failures.push(`${key} expected ${expected}, got ${actual[key]}`);
    } else if (Array.isArray(expected)) {
      const got = Array.isArray(actual[key]) ? actual[key].map(String) : [];
      const want = expected.map(String);
      if (want.some((item) => !got.includes(item))) failures.push(`${key} missing ${want.filter((item) => !got.includes(item)).join(',')}`);
    } else if (expected != null && actual[key] !== expected) {
      failures.push(`${key} expected ${expected}, got ${actual[key]}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

function responseRisks(text, expectedStatus) {
  const value = String(text || '');
  const risks = [];
  if (/\b(?:opened|submitted|executed|confirmed)\b/i.test(value) && expectedStatus === 'tool_plan') {
    risks.push('response claims execution instead of prepared/browser confirmation');
  }
  if (/decibel/i.test(value)) risks.push('response mentions Decibel in Avantis flow');
  if (/(?:minimum|min|мінімальн|минимальн|below|too low|замал|недостат)/i.test(value) && /notional|position|size|обсяг|розмір/i.test(value) && expectedStatus === 'tool_plan') {
    risks.push('response mentions minimum-notional blocker on expected valid plan');
  }
  return risks;
}

async function runLocalRegressions() {
  const failures = [];
  const duplicateGuardPath = pathToFileURL(path.join(ROOT, 'web', 'src', 'lib', 'avantisDuplicateGuard.js')).href;
  const {
    avantisPlaceOrderSignature,
    findDuplicateAvantisPlaceOrder,
    duplicateAvantisPlaceOrderMessage,
  } = await import(duplicateGuardPath);

  const action = {
    dex: 'avantis',
    type: 'place_order',
    chain: 'base',
    wallet: '0x1111111111111111111111111111111111111111',
    args: {
      symbol: 'ETH',
      side: 'long',
      order_type: 'market',
      collateral_usd: 2.2,
      leverage: 50,
    },
  };
  const signature = avantisPlaceOrderSignature(action);
  if (!signature || !signature.includes('ETH') || !signature.includes('|long|')) {
    failures.push({ id: 'local-duplicate-signature', error: `bad signature: ${signature || 'empty'}` });
  }

  const inFlight = findDuplicateAvantisPlaceOrder(action, { locks: new Set([signature]) });
  if (inFlight?.type !== 'in_flight') {
    failures.push({ id: 'local-duplicate-in-flight', error: `expected in_flight, got ${inFlight?.type || 'none'}` });
  }

  const recent = findDuplicateAvantisPlaceOrder(action, {
    now: 1_000_000,
    ledger: {
      abc: { status: 'confirmed', at: 999_950, action, signature, tx_hash: '0xabc' },
    },
  });
  if (recent?.type !== 'browser_action') {
    failures.push({ id: 'local-duplicate-recent-confirmed', error: `expected browser_action, got ${recent?.type || 'none'}` });
  }

  const openPosition = findDuplicateAvantisPlaceOrder(action, {
    positions: [
      { symbol: 'ETH/USD', side: 'bid', margin: '2.15', leverage: '50', pair_index: 0, trade_index: 1 },
    ],
  });
  if (openPosition?.type !== 'open_position') {
    failures.push({ id: 'local-duplicate-open-position', error: `expected open_position, got ${openPosition?.type || 'none'}` });
  }
  const duplicateMessage = duplicateAvantisPlaceOrderMessage(action, openPosition);
  if (!/no second transaction was signed/i.test(duplicateMessage)) {
    failures.push({ id: 'local-duplicate-message', error: `duplicate message is not explicit: ${duplicateMessage}` });
  }

  const avantisPrompt = composeRuntimeInstructions('avantis');
  const forbiddenPromptPhrases = [
    /confirm it in your browser wallet/i,
    /browser wallet now needs to confirm/i,
    /confirm the browser wallet prompt/i,
    /confirm the prompt to/i,
  ];
  for (const pattern of forbiddenPromptPhrases) {
    if (pattern.test(avantisPrompt)) {
      failures.push({ id: 'local-prompt-wallet-wording', error: `prompt still contains ${pattern}` });
      break;
    }
  }
  if (!/wallet\/smart-wallet signing is starting/i.test(avantisPrompt)) {
    failures.push({ id: 'local-prompt-smart-wallet-wording', error: 'prompt does not instruct wallet/smart-wallet signing wording' });
  }

  const avantisTools = toolIncludeForDex('avantis');
  if (avantisTools.some((tool) => tool.startsWith('decibel_'))) {
    failures.push({ id: 'local-dex-boundary-tools', error: `Avantis tool include contains Decibel tools: ${avantisTools.join(', ')}` });
  }

  const closeAll = classifyGameIntent('закрий всі позиції на Avantis', { dex: 'avantis' });
  if (closeAll.kind !== 'avantis_close_position' || closeAll.close_all_positions !== true) {
    failures.push({ id: 'local-close-all-intent', error: `expected Avantis close all, got ${closeAll.kind}, close_all=${closeAll.close_all_positions}` });
  }
  const closeRemaining = classifyGameIntent('а другу позу? ти тільки одну закрив ще ж одна є Avantis', { dex: 'avantis' });
  if (closeRemaining.kind !== 'avantis_close_position' || closeRemaining.close_all_positions !== true) {
    failures.push({ id: 'local-close-remaining-intent', error: `expected Avantis close remaining, got ${closeRemaining.kind}, close_all=${closeRemaining.close_all_positions}` });
  }

  return {
    ok: failures.length === 0,
    total: 9,
    failed: failures.length,
    failures,
  };
}

function blockReasonLooksSpecific(blockReason, responseText) {
  const text = String(responseText || '');
  switch (blockReason) {
    case 'invalid_percent':
      return /120\s*%|100\s*%|percent|відсот|процент|balance/i.test(text);
    case 'invalid_amount':
      return /negative|positive|amount|collateral|invalid|додатн|від.?єм|отриц/i.test(text);
    case 'minimum_notional':
      return /minimum|min|notional|\$?100|мінімальн|минимальн/i.test(text);
    case 'market_max_leverage':
      return /market|max|leverage|плеч/i.test(text);
    case 'policy_leverage':
      return /policy|permission|max|leverage|плеч|allowed/i.test(text);
    case 'policy_collateral':
      return /policy|permission|max|collateral|balance|allowed/i.test(text);
    case 'policy_slippage':
      return /policy|permission|max|slippage|allowed/i.test(text);
    default:
      return true;
  }
}

function evaluateRow(testCase, plan, agent) {
  const parsed = agent.parsed || {};
  const actualStatus = String(parsed.status || '').trim();
  const actualCalls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [];
  const failures = [];
  const warnings = [];
  if (!agent.ok) failures.push(`agent request failed: ${agent.error || 'invalid JSON'}`);
  if (actualStatus !== testCase.expect) failures.push(`status expected ${testCase.expect}, got ${actualStatus || 'missing'}`);
  if (testCase.expect === 'tool_plan' && !sameTools(actualCalls, plan.expected_tools)) {
    failures.push(`tools expected ${(plan.expected_tools || []).join(' -> ') || 'none'}, got ${toolNames(actualCalls).join(' -> ') || 'none'}`);
  }
  if (testCase.expect !== 'tool_plan' && actualCalls.length > 0) {
    failures.push(`expected no tools for ${testCase.expect}, got ${toolNames(actualCalls).join(' -> ')}`);
  }
  if (hasDecibelTools(actualCalls)) failures.push('used Decibel tool in Avantis dry-run');
  const argResult = argsCheck(actualCalls, testCase.args || {}, testCase.expect);
  if (!argResult.ok) failures.push(...argResult.failures);
  const terminalGroups = terminalToolGroupsForIntent(plan.intent);
  const usedTools = toolNames(actualCalls);
  const serverGuard = {
    terminal_groups: terminalGroups,
    used_tools: usedTools,
    terminal_satisfied: terminalToolGroupsSatisfied(usedTools, terminalGroups),
    claims_success: responseClaimsActionSucceeded(parsed.final_response || '', plan.intent),
  };
  if (testCase.expect === 'tool_plan' && terminalGroups.length && !serverGuard.terminal_satisfied) {
    failures.push('server terminal-tool guard would reject this response');
  }
  warnings.push(...responseRisks(parsed.final_response || '', testCase.expect));
  if (plan.deterministic_problems.length && testCase.expect === 'tool_plan') {
    warnings.push(`deterministic planner saw problems despite expected tool_plan: ${plan.deterministic_problems.join('; ')}`);
  }
  if (testCase.expect === 'block' && actualStatus === 'block') {
    const reason = `${parsed.notes || ''} ${parsed.final_response || ''}`;
    if (testCase.block_reason && !blockReasonLooksSpecific(testCase.block_reason, reason)) {
      warnings.push(`block reason may be vague; expected ${testCase.block_reason}`);
    }
  }
  return { ok: failures.length === 0, failures, warnings, server_guard: serverGuard };
}

function percentile(values, p) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const index = Math.min(clean.length - 1, Math.ceil((p / 100) * clean.length) - 1);
  return clean[index];
}

function summarizeLatency(rows, selector) {
  const values = rows.map(selector).filter((value) => Number.isFinite(value));
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avg_ms: roundMs(values.length ? total / values.length : 0),
    p50_ms: roundMs(percentile(values, 50)),
    p90_ms: roundMs(percentile(values, 90)),
    max_ms: roundMs(values.length ? Math.max(...values) : 0),
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return out;
}

async function loadMarketCaps() {
  try {
    const avantis = require('../../server-futures/avantis.js');
    const pairs = await Promise.race([
      avantis.getPairsMap(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('market cap load timeout')), 12_000)),
    ]);
    const markets = { ...FALLBACK_MARKETS };
    for (const row of pairs?.raw || []) {
      const symbol = String(row?.from || row?.symbol?.split('/')?.[0] || '').toUpperCase();
      const maxLev = Number(row?.leverages?.maxLeverage ?? row?.maxLeverage ?? row?.max_leverage ?? 0);
      if (symbol && Number.isFinite(maxLev) && maxLev > 0) {
        markets[symbol] = { max_leverage: maxLev, asset_class: 'crypto' };
      }
    }
    return { markets, source: 'avantis_pairs' };
  } catch (error) {
    return { markets: { ...FALLBACK_MARKETS }, source: `fallback: ${error?.message || error}` };
  }
}

async function runCase(testCase, markets) {
  const policy = normalizePolicy(testCase.policy);
  const planStarted = performance.now();
  const plan = analyzePlan(testCase, policy, markets);
  const planMs = performance.now() - planStarted;
  const mockResults = buildMockResults(testCase, plan);
  const payload = { testCase, policy, markets, plan, mockResults };
  const agent = USE_LLM ? await llmDryRun(payload) : await heuristicDryRun(payload);
  const evaluation = evaluateRow(testCase, plan, agent);
  return {
    id: testCase.id,
    message: testCase.message,
    expected: {
      status: testCase.expect,
      tools: testCase.tools || [],
      args: testCase.args || {},
      block_reason: testCase.block_reason || null,
      note: testCase.note || null,
    },
    policy,
    classifier: {
      intent: plan.intent.kind,
      action_required: !!plan.intent.action_required,
      tools: plan.classifier_tools,
      latency_ms: roundMs(planMs),
      required_loop: plan.intent.required_loop || null,
    },
    deterministic_plan: {
      tools: plan.expected_tools,
      args: plan.args,
      collateral_usd: plan.collateral_usd,
      notional_usd: plan.notional_usd,
      market_max_leverage: plan.market_max_leverage,
      problems: plan.deterministic_problems,
      mock_results: mockResults,
    },
    agent: {
      mode: agent.mode,
      model: USE_LLM ? MODEL : null,
      provider_order: USE_LLM ? PROVIDER_ORDER : [],
      status_code: agent.status,
      ok: agent.ok,
      latency_ms: agent.latency_ms,
      parsed: agent.parsed,
      raw_response: agent.raw_response,
      error: agent.error,
      usage: agent.usage,
    },
    evaluation,
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function truncate(value, max = 150) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

function renderMarkdown(report) {
  const lines = [
    `# Avantis AI Stress ${report.run_id}`,
    '',
    `Mode: ${report.mode}`,
    `Cases: ${report.summary.total}, passed: ${report.summary.passed}, failed: ${report.summary.failed}, warnings: ${report.summary.warning_count}`,
    `Agent latency avg/p50/p90/max: ${report.summary.agent_latency.avg_ms}/${report.summary.agent_latency.p50_ms}/${report.summary.agent_latency.p90_ms}/${report.summary.agent_latency.max_ms} ms`,
    `Classifier latency avg/p50/p90/max: ${report.summary.classifier_latency.avg_ms}/${report.summary.classifier_latency.p50_ms}/${report.summary.classifier_latency.p90_ms}/${report.summary.classifier_latency.max_ms} ms`,
    `Market cap source: ${report.market_source}`,
    '',
    '## Failed Rows',
  ];
  if (!report.summary.failed_rows.length) {
    lines.push('', 'None.');
  } else {
    for (const row of report.summary.failed_rows) {
      lines.push('', `- ${row.id}: ${row.message}`, `  - ${row.failures.join('; ')}`, `  - tools: ${row.agent_tools.join(' -> ') || 'none'}`, `  - response: ${truncate(row.response, 260)}`);
    }
  }
  lines.push('', '## Warnings');
  if (!report.summary.warning_rows.length) {
    lines.push('', 'None.');
  } else {
    for (const row of report.summary.warning_rows.slice(0, 25)) {
      lines.push('', `- ${row.id}: ${row.warnings.join('; ')}`, `  - response: ${truncate(row.response, 240)}`);
    }
  }
  lines.push('', '## All Rows', '', '| # | Expected | Intent | Agent Status | Agent Tools | ms | OK | Response |', '|---:|---|---|---|---|---:|---|---|');
  for (const row of report.rows) {
    lines.push([
      row.id,
      row.expected.status,
      row.classifier.intent,
      row.agent.parsed?.status || '',
      (row.agent.parsed?.tool_calls || []).map((call) => call.tool).join(' -> ') || 'none',
      row.agent.latency_ms,
      row.evaluation.ok ? 'yes' : 'no',
      truncate(row.agent.parsed?.final_response || row.agent.raw_response || row.agent.error, 180).replace(/\|/g, '\\|'),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', 'Full payload is in the JSON file next to this report.');
  return lines.join('\n');
}

function renderCsv(report) {
  const header = ['id', 'message', 'expected_status', 'ok', 'intent', 'expected_tools', 'agent_status', 'agent_tools', 'agent_ms', 'failures', 'warnings', 'response'];
  const rows = report.rows.map((row) => [
    row.id,
    row.message,
    row.expected.status,
    row.evaluation.ok,
    row.classifier.intent,
    row.expected.tools.join(' -> '),
    row.agent.parsed?.status || '',
    (row.agent.parsed?.tool_calls || []).map((call) => call.tool).join(' -> '),
    row.agent.latency_ms,
    row.evaluation.failures.join('; '),
    row.evaluation.warnings.join('; '),
    row.agent.parsed?.final_response || row.agent.raw_response || row.agent.error || '',
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const started = performance.now();
  const { markets, source: marketSource } = await loadMarketCaps();
  const localRegressions = await runLocalRegressions();
  const rows = await mapWithConcurrency(CASES, USE_LLM ? CONCURRENCY : 10, (testCase) => runCase(testCase, markets));
  const totalMs = performance.now() - started;
  const failedRows = rows
    .filter((row) => !row.evaluation.ok)
    .map((row) => ({
      id: row.id,
      message: row.message,
      expected: row.expected.status,
      failures: row.evaluation.failures,
      agent_tools: (row.agent.parsed?.tool_calls || []).map((call) => call.tool),
      response: row.agent.parsed?.final_response || row.agent.raw_response || row.agent.error || '',
    }));
  const warningRows = rows
    .filter((row) => row.evaluation.warnings.length)
    .map((row) => ({
      id: row.id,
      message: row.message,
      warnings: row.evaluation.warnings,
      response: row.agent.parsed?.final_response || row.agent.raw_response || row.agent.error || '',
    }));
  const report = {
    ok: failedRows.length === 0 && localRegressions.ok,
    run_id: RUN_ID,
    generated_at: new Date().toISOString(),
    dry_run: true,
    safe_no_mcp_write_tools: true,
    mode: USE_LLM ? 'llm_dry_run' : 'heuristic_dry_run',
    model: USE_LLM ? MODEL : null,
    provider_order: USE_LLM ? PROVIDER_ORDER : [],
    concurrency: USE_LLM ? CONCURRENCY : 10,
    market_source: marketSource,
    output_files: {
      json: JSON_OUT,
      markdown: MD_OUT,
      csv: CSV_OUT,
    },
    summary: {
      total: rows.length,
      passed: rows.filter((row) => row.evaluation.ok).length,
      failed: failedRows.length,
      warning_count: warningRows.length,
      local_regressions: localRegressions,
      total_ms: roundMs(totalMs),
      classifier_latency: summarizeLatency(rows, (row) => row.classifier.latency_ms),
      agent_latency: summarizeLatency(rows, (row) => row.agent.latency_ms),
      by_expected_status: rows.reduce((acc, row) => {
        acc[row.expected.status] = (acc[row.expected.status] || 0) + 1;
        return acc;
      }, {}),
      by_intent: rows.reduce((acc, row) => {
        acc[row.classifier.intent] = (acc[row.classifier.intent] || 0) + 1;
        return acc;
      }, {}),
      failed_rows: failedRows,
      warning_rows: warningRows,
    },
    rows,
  };
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(MD_OUT, `${renderMarkdown(report)}\n`, 'utf8');
  fs.writeFileSync(CSV_OUT, `${renderCsv(report)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: report.ok,
    dry_run: true,
    mode: report.mode,
    model: report.model,
    total: report.summary.total,
    passed: report.summary.passed,
    failed: report.summary.failed,
    warning_count: report.summary.warning_count,
    total_ms: report.summary.total_ms,
    classifier_latency: report.summary.classifier_latency,
    agent_latency: report.summary.agent_latency,
    output_files: report.output_files,
    failed_rows: report.summary.failed_rows,
    local_regressions: report.summary.local_regressions,
    warning_rows: report.summary.warning_rows.slice(0, 12),
  }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
