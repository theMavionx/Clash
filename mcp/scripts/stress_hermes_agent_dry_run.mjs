import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  classifyGameIntent,
  terminalToolGroupsForIntent,
  terminalToolGroupsSatisfied,
  responseClaimsActionSucceeded,
} = require('../../server/hermes_client.js');
const { CLASH_RUNTIME_INSTRUCTIONS, TOOL_INCLUDE } = require('../../hermes-orchestrator/src/clash_agent_prompt.cjs');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const OUT_DIR = path.join(ROOT, '.tmp', 'hermes-agent-stress');
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const JSON_OUT = path.join(OUT_DIR, `hermes-agent-dry-run-${RUN_ID}.json`);
const MD_OUT = path.join(OUT_DIR, `hermes-agent-dry-run-${RUN_ID}.md`);
const CSV_OUT = path.join(OUT_DIR, `hermes-agent-dry-run-${RUN_ID}.csv`);

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
const USE_LLM = OPENROUTER_API_KEY && !process.argv.includes('--no-llm');
const MODEL = process.env.HERMES_STRESS_MODEL || process.argv.find((arg) => arg.startsWith('--model='))?.slice('--model='.length) || 'qwen/qwen3-30b-a3b-instruct-2507:nitro';
const CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.HERMES_STRESS_CONCURRENCY || process.argv.find((arg) => arg.startsWith('--concurrency='))?.slice('--concurrency='.length) || 4)));
const PROVIDER_ORDER = String(process.env.CLASH_HERMES_PROVIDER_ORDER || 'cerebras')
  .split(/[,;\s]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const CASES = [
  { id: 't01', message: 'відкрий лонг', expectation: 'ask_clarification' },
  { id: 't02', message: 'придумай угоду', expectation: 'decibel_place_order' },
  { id: 't03', message: 'собака на 20 плече', expectation: 'ask_clarification', note: 'собака means DOGE' },
  { id: 't04', message: 'лонг собаку на 20 плече 10 баксів', expectation: 'decibel_place_order' },
  { id: 't05', message: 'doge short 5 usdc 3x', expectation: 'decibel_place_order' },
  { id: 't06', message: 'BTC long $10 5x', expectation: 'decibel_place_order' },
  { id: 't07', message: 'ефір шорт 25 баксів 4 плече', expectation: 'decibel_place_order' },
  { id: 't08', message: 'солана лонг на весь баланс 2x', expectation: 'decibel_place_order' },
  { id: 't09', message: 'short APT notional 50', expectation: 'decibel_place_order' },
  { id: 't10', message: 'купити BTC на 20 usdc', expectation: 'decibel_place_order' },
  { id: 't11', message: 'продай ETH short 15 баксів', expectation: 'decibel_place_order' },
  { id: 't12', message: 'open any safe trade with 10% balance', expectation: 'decibel_place_order' },
  { id: 't13', message: 'ризикни, але консервативно, сам вибери позицію', expectation: 'decibel_place_order' },
  { id: 't14', message: 'open hype long 7 usdc 2x', expectation: 'decibel_place_order' },
  { id: 't15', message: 'MON шорт 6 usdc 3x', expectation: 'decibel_place_order' },
  { id: 't16', message: 'WIF long 10 dollars 6x', expectation: 'decibel_place_order' },
  { id: 't17', message: 'PEPE long all my money 2x', expectation: 'decibel_place_order' },
  { id: 't18', message: 'limit buy btc at 84000 with 20 usdc', expectation: 'decibel_place_order' },
  { id: 't19', message: 'sell SOL limit 190 size 0.2', expectation: 'decibel_place_order' },
  { id: 't20', message: 'відкрий позицію на монеті песик 5 баксів 3х', expectation: 'ask_clarification', note: 'DOGE inferred, side missing' },
  { id: 't21', message: 'покажи мої позиції', expectation: 'decibel_get_account' },
  { id: 't22', message: 'що по балансу decibel?', expectation: 'decibel_get_account' },
  { id: 't23', message: 'check my pnl', expectation: 'decibel_get_account' },
  { id: 't24', message: 'ціна btc eth sol doge', expectation: 'decibel_get_markets' },
  { id: 't25', message: 'mark price для собаки', expectation: 'decibel_get_markets' },
  { id: 't26', message: 'закрий BTC позицію', expectation: 'decibel_close_position' },
  { id: 't27', message: 'закрий позу', expectation: 'decibel_close_position', history: [{ role: 'assistant', text: 'DOGE long opened with 10 USDC at 20x.' }] },
  { id: 't28', message: 'reduce eth by half', expectation: 'decibel_close_position' },
  { id: 't29', message: 'закрий 25% солани', expectation: 'decibel_close_position' },
  { id: 't30', message: 'close all doge', expectation: 'decibel_close_position' },
  { id: 't31', message: 'став TP 90000 SL 82000 BTC', expectation: 'decibel_set_tpsl' },
  { id: 't32', message: 'take profit doge 0.25 stop loss 0.18', expectation: 'decibel_set_tpsl' },
  { id: 't33', message: 'перестав стоп на ETH 3100', expectation: 'decibel_set_tpsl' },
  { id: 't34', message: 'плече BTC 7x', expectation: 'decibel_set_leverage' },
  { id: 't35', message: 'change doge leverage to 20x', expectation: 'decibel_set_leverage' },
  { id: 't36', message: 'скасуй ордер BTC', expectation: 'decibel_cancel_order' },
  { id: 't37', message: 'cancel order 123 on ETH', expectation: 'decibel_cancel_order' },
  { id: 't38', message: 'attack decitoshi', expectation: 'execute_ai_attack_plan' },
  { id: 't39', message: 'атакуй egor4042007', expectation: 'execute_ai_attack_plan' },
  { id: 't40', message: 'attack a base', expectation: 'execute_ai_attack_plan' },
  { id: 't41', message: 'знайди ворога і напади', expectation: 'execute_ai_attack_plan' },
  { id: 't42', message: 'збери всі ресурси', expectation: 'collect_resources' },
  { id: 't43', message: 'collect all res', expectation: 'collect_resources' },
  { id: 't44', message: 'побудуй базу сам', expectation: 'auto_build_base' },
  { id: 't45', message: 'build my base balanced', expectation: 'auto_build_base' },
  { id: 't46', message: 'постав turret', expectation: 'place_building' },
  { id: 't47', message: 'upgrade sawmill', expectation: 'upgrade_building' },
  { id: 't48', message: 'прокачай knight', expectation: 'upgrade_troop' },
  { id: 't49', message: 'load troops into ships', expectation: 'load_ship_troop' },
  { id: 't50', message: 'які в тебе скіли?', expectation: 'skills' },
];

function percentile(values, p) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const index = Math.min(nums.length - 1, Math.ceil((p / 100) * nums.length) - 1);
  return nums[index];
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundNumber(value, decimals = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scale = 10 ** decimals;
  return Math.round(n * scale) / scale;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toolsFromIntent(intent, message = '') {
  const direct = Array.isArray(intent?.expected_tools) ? intent.expected_tools : [];
  if (direct.length) {
    let tools = unique(direct);
    if (tools.includes('upgrade_building') && tools.includes('upgrade_troop')) {
      const troopRequest = /\b(knight|mage|archer|ranger|barbarian)\b|військ|войск|troop/i.test(message);
      tools = tools.filter((tool) => !['upgrade_building', 'upgrade_troop'].includes(tool));
      tools.push(troopRequest ? 'upgrade_troop' : 'upgrade_building');
    }
    return tools;
  }
  const text = `${intent?.required_loop || ''}\n${intent?.goal || ''}`;
  const parsed = TOOL_INCLUDE.filter((tool) => new RegExp(`\\b${tool}\\b`).test(text));
  return unique(parsed);
}

function normalized(text) {
  return String(text || '').toLowerCase();
}

const SYMBOL_ALIASES = [
  ['DOGE', /\bDOGE\b|собак|песик|dog\b|doge coin|додж/i],
  ['BTC', /\bBTC\b|bitcoin|биток|біток|бтк/i],
  ['ETH', /\bETH\b|ethereum|ефір|ефир/i],
  ['SOL', /\bSOL\b|solana|солана|солани/i],
  ['APT', /\bAPT\b|aptos/i],
  ['SUI', /\bSUI\b/i],
  ['HYPE', /\bHYPE\b/i],
  ['MON', /\bMON\b|monad/i],
  ['WIF', /\bWIF\b/i],
  ['PEPE', /\bPEPE\b/i],
];

function inferSymbol(message, history = []) {
  const haystack = `${message}\n${history.map((item) => item.text || '').join('\n')}`;
  for (const [symbol, pattern] of SYMBOL_ALIASES) {
    if (pattern.test(haystack)) return symbol;
  }
  return null;
}

function inferSide(message) {
  const text = normalized(message);
  if (/\b(long|buy)\b|лонг|куп|відкрий.*лонг|открой.*лонг/.test(text)) return 'long';
  if (/\b(short|sell)\b|шорт|продай|продаж|відкрий.*шорт|открой.*шорт/.test(text)) return 'short';
  return null;
}

function inferLeverage(message) {
  const text = String(message || '');
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*(?:x|х|плеч|плече|leverage)\b/i,
    /(?:x|х|плеч|плече|leverage)\s*(\d+(?:[.,]\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return roundNumber(String(match[1]).replace(',', '.'), 2);
  }
  return null;
}

function inferUsd(message) {
  const text = String(message || '');
  const patterns = [
    /\$\s*(\d+(?:[.,]\d+)?)/i,
    /\$?\s*(\d+(?:[.,]\d+)?)\s*(?:usdc|usd|dollars?|бакс|баксів|долар|доларів)/i,
    /(?:на|with)\s+\$?\s*(\d+(?:[.,]\d+)?)(?!\s*%)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return roundNumber(String(match[1]).replace(',', '.'), 2);
  }
  return null;
}

function inferNotionalUsd(message) {
  const match = String(message || '').match(/(?:notional|номінал|номинал)\s+\$?\s*(\d+(?:[.,]\d+)?)/i);
  return match ? roundNumber(String(match[1]).replace(',', '.'), 2) : null;
}

function inferSizeBase(message) {
  const match = String(message || '').match(/\bsize\s+(\d+(?:[.,]\d+)?)/i);
  return match ? roundNumber(String(match[1]).replace(',', '.'), 8) : null;
}

function inferPct(message) {
  const text = normalized(message);
  const match = String(message || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (match) return roundNumber(String(match[1]).replace(',', '.'), 2);
  if (/all my money|all balance|everything|весь баланс|всі гроші|все|на весь/.test(text)) return 100;
  if (/half|половин/.test(text)) return 50;
  return null;
}

function inferLimitPrice(message) {
  const text = String(message || '');
  const match = text.match(/(?:limit|ліміт|лимит|at|по|price)\s*(?:buy|sell)?\s*(?:at|по)?\s*(\d+(?:[.,]\d+)?)/i);
  return match ? roundNumber(String(match[1]).replace(',', '.'), 6) : null;
}

function inferClosePercent(message) {
  const text = normalized(message);
  const pct = inferPct(message);
  if (pct != null && /close|reduce|закрий|зменш|прикрий/.test(text)) return Math.max(1, Math.min(100, pct));
  if (/half|половин/.test(text)) return 50;
  return null;
}

function inferTargetPlayer(message) {
  const match = String(message || '').match(/(?:attack|атакуй|напади)\s+([A-Za-z0-9_.-]{3,32})/i);
  if (!match) return null;
  const target = match[1];
  if (/^(a|base|enemy|random|ворога)$/i.test(target)) return null;
  return target;
}

function isDelegatedTrade(message) {
  return /придумай|сам вибери|сам выбери|choose|surprise|any safe|conservative|цікаву|интересн/i.test(message);
}

function isTradeWrite(message, intent) {
  return intent?.kind === 'decibel_place_order' || /\b(long|short|buy|sell)\b|лонг|шорт|куп|продай|собак|песик|trade|угоду|позиці/i.test(message);
}

function needsClarification(testCase, intent, args) {
  if (testCase.expectation === 'ask_clarification') return true;
  if (!isTradeWrite(testCase.message, intent)) return false;
  if (isDelegatedTrade(testCase.message)) return false;
  if (intent?.kind !== 'decibel_place_order') return false;
  if (!args.symbol || !args.side) return true;
  if (!(args.collateral_usd > 0) && !(args.notional_usd > 0) && !(args.collateral_pct > 0) && !(args.size_base > 0)) return true;
  return false;
}

function inferArgs(testCase, intent, tools) {
  const message = testCase.message;
  const history = testCase.history || [];
  const primaryTool = tools[tools.length - 1] || null;
  const symbol = inferSymbol(message, history);
  const side = inferSide(message);
  const leverage = inferLeverage(message);
  const usd = inferUsd(message);
  const pct = inferPct(message);
  const limitPrice = inferLimitPrice(message);
  const args = {};

  if (primaryTool === 'decibel_place_order') {
    const delegated = isDelegatedTrade(message);
    args.symbol = symbol || (delegated ? 'BTC' : undefined);
    args.side = side || (delegated ? 'long' : undefined);
    args.order_type = limitPrice ? 'limit' : 'market';
    if (limitPrice) args.price = limitPrice;
    const notional = inferNotionalUsd(message);
    const sizeBase = inferSizeBase(message);
    if (usd != null) args.collateral_usd = usd;
    if (notional != null) args.notional_usd = notional;
    if (sizeBase != null) args.size_base = sizeBase;
    if (pct != null) args.collateral_pct = pct;
    if (!args.collateral_usd && !args.collateral_pct && delegated) args.collateral_pct = 10;
    args.leverage = leverage || (delegated ? 2 : undefined);
    if (delegated) args.autonomous_default = true;
  } else if (primaryTool === 'decibel_close_position') {
    if (symbol) args.symbol = symbol;
    const closePct = inferClosePercent(message);
    if (closePct != null) args.percent = closePct;
  } else if (primaryTool === 'decibel_set_tpsl') {
    if (symbol) args.symbol = symbol;
    const nums = [...String(message).matchAll(/(\d+(?:[.,]\d+)?)/g)].map((match) => roundNumber(String(match[1]).replace(',', '.'), 6));
    if (/tp|take profit|тейк|проф/i.test(message) && nums[0] != null) args.take_profit = nums[0];
    if (/sl|stop|стоп/i.test(message)) args.stop_loss = nums.length > 1 ? nums[1] : nums[0];
  } else if (primaryTool === 'decibel_set_leverage') {
    if (symbol) args.symbol = symbol;
    if (leverage != null) args.leverage = leverage;
  } else if (primaryTool === 'decibel_cancel_order') {
    if (symbol) args.symbol = symbol;
    const orderMatch = String(message).match(/\border\s+([A-Za-z0-9_-]+)/i);
    if (orderMatch) args.order_id = orderMatch[1];
  } else if (primaryTool === 'decibel_get_markets') {
    const symbols = unique(SYMBOL_ALIASES.filter(([, pattern]) => pattern.test(message)).map(([s]) => s));
    if (symbols.length) args.symbols = symbols;
  } else if (primaryTool === 'execute_ai_attack_plan') {
    const target = inferTargetPlayer(message);
    if (target) args.target_player_name = target;
    args.auto_tactics = true;
  } else if (primaryTool === 'auto_build_base') {
    args.focus = 'balanced';
  } else if (primaryTool === 'place_building') {
    const building = String(message).match(/\b(turret|mine|barn|port|sawmill|storage|town hall|archer tower)\b/i)?.[1];
    if (building) args.type = building.toLowerCase().replace(/\s+/g, '_');
  } else if (primaryTool === 'upgrade_building' || primaryTool === 'upgrade_troop') {
    const upgrade = String(message).match(/\b(sawmill|mine|barn|turret|knight|mage|archer|ranger|barbarian)\b/i)?.[1];
    if (upgrade) args.target = upgrade.toLowerCase();
  } else if (primaryTool === 'load_ship_troop') {
    args.autofill = true;
  }

  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function mockToolResult(tool, args, testCase) {
  if (!tool) return null;
  if (tool === 'decibel_place_order') {
    const symbol = args.symbol || 'BTC';
    const side = args.side || 'long';
    const collateral = Number(args.collateral_usd || 10);
    const leverage = Number(args.leverage || 2);
    return {
      ok: true,
      success: true,
      verified: true,
      order: {
        symbol,
        side,
        order_type: args.order_type || 'market',
        collateral_usd: args.collateral_pct ? null : collateral,
        collateral_pct: args.collateral_pct || null,
        leverage,
        notional_usd_estimate: roundNumber(collateral * leverage, 2),
      },
      tx_hash: `dry_${testCase.id}_place`,
    };
  }
  if (tool === 'decibel_close_position') {
    return {
      ok: true,
      success: true,
      verified: true,
      close_result: {
        symbol: args.symbol || inferSymbol(testCase.message, testCase.history || []) || 'BTC',
        closed_size_base: 0.001,
        remaining_size_base: args.percent && args.percent < 100 ? 0.001 : 0,
        realized_pnl_usd_estimate: 0.05,
        realized_pnl_pct_estimate: 1.06,
        price_source: 'mark_price',
        settlement_note: 'Dry-run mock result.',
      },
    };
  }
  if (tool === 'decibel_get_account') {
    return { ok: true, equity_usd: 124.5, available_usdc: 42.1, positions: [{ symbol: 'BTC', side: 'long', pnl_usd: 0.05 }] };
  }
  if (tool === 'decibel_get_markets') {
    return { ok: true, markets: (args.symbols || ['BTC', 'ETH', 'SOL', 'DOGE']).map((symbol) => ({ symbol, mark_price: symbol === 'DOGE' ? 0.22 : symbol === 'BTC' ? 76679 : 2500 })) };
  }
  if (tool === 'decibel_set_tpsl') {
    return { ok: true, symbol: args.symbol || 'BTC', take_profit: args.take_profit || null, stop_loss: args.stop_loss || null };
  }
  if (tool === 'decibel_set_leverage') {
    return { ok: true, symbol: args.symbol || 'BTC', leverage: args.leverage || 2 };
  }
  if (tool === 'decibel_cancel_order') {
    return { ok: true, symbol: args.symbol || 'BTC', order_id: args.order_id || 'dry-open-order' };
  }
  if (tool === 'execute_ai_attack_plan') {
    if (/decitoshi/i.test(testCase.message)) {
      return { ok: false, error: 'decitoshi is under shield for about 4h.', shield: { remaining_hours: 4 } };
    }
    return { ok: true, result: 'victory', rewards: { gold: 120, wood: 80, ore: 12 }, destroyed_buildings: 5 };
  }
  if (tool === 'collect_resources') {
    return { ok: true, collected: { gold: 189, wood: 123, ore: 123 }, next_collect_minutes: 60 };
  }
  if (tool === 'auto_build_base') {
    return { ok: true, built: ['town_hall', 'mine', 'sawmill', 'barn', 'turret'], focus: args.focus || 'balanced' };
  }
  if (tool === 'place_building') {
    return { ok: true, building: args.type || 'turret', id: 'dry-building-1' };
  }
  if (tool === 'upgrade_building' || tool === 'upgrade_troop') {
    return { ok: true, target: args.target || 'selected target', level: 2 };
  }
  if (tool === 'load_ship_troop') {
    return { ok: true, loaded: [{ ship: 1, troop: 'Mage' }, { ship: 2, troop: 'Knight' }] };
  }
  return { ok: true };
}

function heuristicResponse({ testCase, intent, toolCalls, clarificationNeeded, mockResults }) {
  if (clarificationNeeded) {
    const symbol = inferSymbol(testCase.message, testCase.history || []);
    if (intent?.kind === 'decibel_place_order') {
      if (symbol) return `Уточни сторону і суму для ${symbol}: long чи short, і скільки USDC або відсоток балансу.`;
      return 'Уточни монету, сторону і суму: наприклад BTC long на 10 USDC з 5x.';
    }
    return 'Уточни один параметр, без нього дію безпечно виконати не можна.';
  }

  const primary = toolCalls[toolCalls.length - 1] || {};
  const result = mockResults[mockResults.length - 1]?.result || {};
  switch (primary.tool) {
    case 'decibel_place_order':
      return `${result.order.symbol} ${result.order.side} ${result.order.leverage}x готово у dry-run: ${result.order.collateral_usd ?? `${result.order.collateral_pct}% балансу`} USDC collateral, tool ${primary.tool}.`;
    case 'decibel_close_position':
      return `${result.close_result.symbol} позицію закрито у dry-run. Estimated close PnL: $${result.close_result.realized_pnl_usd_estimate} (${result.close_result.realized_pnl_pct_estimate}%).`;
    case 'decibel_get_account':
      return `Decibel dry-run: equity $${result.equity_usd}, available USDC $${result.available_usdc}, відкрита BTC long має PnL $0.05.`;
    case 'decibel_get_markets':
      return `Dry-run ціни: ${result.markets.map((m) => `${m.symbol} $${m.mark_price}`).join(', ')}.`;
    case 'decibel_set_tpsl':
      return `TP/SL для ${result.symbol} виставлено у dry-run${result.take_profit ? `, TP ${result.take_profit}` : ''}${result.stop_loss ? `, SL ${result.stop_loss}` : ''}.`;
    case 'decibel_set_leverage':
      return `Плече для ${result.symbol} змінено на ${result.leverage}x у dry-run.`;
    case 'decibel_cancel_order':
      return `Ордер ${result.order_id} по ${result.symbol} скасовано у dry-run.`;
    case 'execute_ai_attack_plan':
      if (result.ok === false && result.shield) return `decitoshi ще під щитом приблизно ${result.shield.remaining_hours} години, зараз атакувати не можна.`;
      return `AI online battle dry-run: перемога, забрано ${result.rewards.gold} золота, ${result.rewards.wood} дерева і ${result.rewards.ore} руди.`;
    case 'collect_resources':
      return `Зібрано ресурси у dry-run: ${result.collected.gold} золота, ${result.collected.wood} дерева, ${result.collected.ore} руди.`;
    case 'auto_build_base':
      return `Базу розставлено у dry-run: ${result.built.join(', ')}.`;
    case 'place_building':
      return `${result.building} поставлено у dry-run.`;
    case 'upgrade_building':
    case 'upgrade_troop':
      return `${result.target} прокачано до рівня ${result.level} у dry-run.`;
    case 'load_ship_troop':
      return `Війська завантажено у кораблі у dry-run: ${result.loaded.map((x) => `${x.troop} -> ship ${x.ship}`).join(', ')}.`;
    default:
      if (intent?.kind === 'skills') return 'Я можу збирати ресурси, будувати й апгрейдити базу, керувати кораблями, запускати AI battles і керувати Decibel позиціями.';
      return 'Dry-run відповідь зібрана, tool action не потрібен.';
  }
}

function buildToolCalls(tools, args, clarificationNeeded) {
  if (clarificationNeeded) return [];
  return tools.map((tool, index) => ({
    tool,
    args: index === tools.length - 1 ? args : {},
  }));
}

function buildDryRunPrompt({ testCase, intent, tools, args, clarificationNeeded, mockResults, guardRetry = null, previousAgent = null }) {
  const retryLines = guardRetry ? [
    '',
    '## Server Guard Retry',
    'The previous response was rejected because it claimed success without the required terminal action tool.',
    `Missing terminal tool group: ${guardRetry.terminal_groups.map((group) => group.join(' or ')).join(' AND ')}.`,
    `Previous tool_calls: ${JSON.stringify(previousAgent?.tool_calls || [])}`,
    `Previous final_response: ${previousAgent?.final_response || ''}`,
    'For this retry, output clarification_needed=false and tool_calls exactly equal to Planned tools unless the action is truly blocked.',
  ] : [];
  return [
    CLASH_RUNTIME_INSTRUCTIONS,
    '',
    '## Dry-Run Stress Test Contract',
    'This is a dry-run benchmark. Do not claim real funds, real orders, or real battles happened outside this simulated result.',
    'Return only strict compact JSON. No markdown.',
    'JSON shape: {"clarification_needed":boolean,"tool_calls":[{"tool":"name","args":{}}],"final_response":"natural player-facing answer","notes":"short"}',
    'The notes field must be 80 characters or less. Do not repeat words in notes.',
    'If clarification_needed is true, tool_calls must be empty and final_response must ask exactly one concise clarification.',
    'If clarification_needed is false, tool_calls must exactly match Planned tools in the same order. Do not omit the final write tool after a read tool.',
    '$/USD/USDC/dollars/бакс amounts mean collateral_usd by default; "notional 50" means notional_usd; "size 0.2" means size_base. Do not ask to confirm these normal forms.',
    'If mock tool results are provided, answer naturally as if those tool results just returned, but do not mention internal benchmark details unless needed.',
    'Avoid fixed templates like "Done/Result/Next" and avoid "Blocked:" labels unless quoting a raw error.',
    '',
    `Classifier intent: ${intent?.kind || 'general'}`,
    `Planned tools: ${tools.join(' -> ') || 'none'}`,
    `Suggested args: ${JSON.stringify(args)}`,
    `Clarification needed: ${clarificationNeeded}`,
    `Mock tool results: ${JSON.stringify(mockResults)}`,
    `Recent history: ${JSON.stringify(testCase.history || [])}`,
    `Player message: ${testCase.message}`,
    ...retryLines,
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
      'X-Title': 'ClashHermes 50 Prompt Dry Run',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Return strict JSON only. No markdown. No extra prose.' },
        { role: 'user', content: buildDryRunPrompt(payload) },
      ],
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      provider: PROVIDER_ORDER.length ? { order: PROVIDER_ORDER, allow_fallbacks: true } : undefined,
    }),
  });
  const elapsedMs = performance.now() - started;
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  const content = json?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonObject(content);
  return {
    mode: 'llm_dry_run',
    status: response.status,
    latency_ms: roundMs(elapsedMs),
    ok: response.ok && !!parsed,
    parsed,
    raw_response: content,
    error: response.ok ? null : (json?.error?.message || json?.message || text.slice(0, 300)),
    usage: json?.usage || null,
  };
}

function serverGuardForAgent({ intent, agentToolCalls, finalResponse }) {
  const terminalGroups = terminalToolGroupsForIntent(intent);
  const usedTools = (Array.isArray(agentToolCalls) ? agentToolCalls : []).map((call) => call?.tool).filter(Boolean);
  const claimsSuccess = responseClaimsActionSucceeded(finalResponse, intent);
  const terminalSatisfied = terminalToolGroupsSatisfied(usedTools, terminalGroups);
  return {
    claims_success: claimsSuccess,
    terminal_groups: terminalGroups,
    used_tools: usedTools,
    terminal_satisfied: terminalSatisfied,
    would_retry: claimsSuccess && terminalGroups.length > 0 && !terminalSatisfied,
  };
}

async function heuristicDryRun(payload) {
  const started = performance.now();
  const finalResponse = heuristicResponse(payload);
  return {
    mode: 'heuristic_dry_run',
    status: null,
    latency_ms: roundMs(performance.now() - started),
    ok: true,
    parsed: {
      clarification_needed: payload.clarificationNeeded,
      tool_calls: payload.toolCalls,
      final_response: finalResponse,
      notes: 'No OPENROUTER_API_KEY available or --no-llm used.',
    },
    raw_response: null,
    error: null,
    usage: null,
  };
}

function expectedToolSatisfied(expectation, toolCalls, clarificationNeeded) {
  if (expectation === 'ask_clarification') return clarificationNeeded && toolCalls.length === 0;
  if (expectation === 'skills') return toolCalls.length === 0;
  return toolCalls.some((call) => call.tool === expectation);
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runOne() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

async function runCase(testCase) {
  const intentStarted = performance.now();
  const intent = classifyGameIntent(testCase.message);
  const intentLatency = performance.now() - intentStarted;
  const tools = toolsFromIntent(intent, testCase.message);
  const args = inferArgs(testCase, intent, tools);
  const clarificationNeeded = needsClarification(testCase, intent, args);
  const toolCalls = buildToolCalls(tools, args, clarificationNeeded);
  const mockResults = toolCalls.map((call) => ({
    tool: call.tool,
    result: mockToolResult(call.tool, call.args, testCase),
  }));

  const payload = {
    testCase,
    intent,
    tools,
    args,
    clarificationNeeded,
    toolCalls,
    mockResults,
  };
  let agent = USE_LLM ? await llmDryRun(payload) : await heuristicDryRun(payload);
  let parsedToolCalls = Array.isArray(agent.parsed?.tool_calls) ? agent.parsed.tool_calls : toolCalls;
  let parsedClarification = !!agent.parsed?.clarification_needed;
  let guard = serverGuardForAgent({
    intent,
    agentToolCalls: parsedToolCalls,
    finalResponse: agent.parsed?.final_response || '',
  });
  let retryAgent = null;
  if (USE_LLM && guard.would_retry && !parsedClarification) {
    retryAgent = await llmDryRun({
      ...payload,
      guardRetry: guard,
      previousAgent: agent.parsed,
    });
    if (retryAgent.ok) {
      agent = {
        ...retryAgent,
        mode: 'llm_dry_run_guard_retry',
        first_attempt: agent,
      };
      parsedToolCalls = Array.isArray(agent.parsed?.tool_calls) ? agent.parsed.tool_calls : toolCalls;
      parsedClarification = !!agent.parsed?.clarification_needed;
      guard = serverGuardForAgent({
        intent,
        agentToolCalls: parsedToolCalls,
        finalResponse: agent.parsed?.final_response || '',
      });
    }
  }
  const expectedOk = expectedToolSatisfied(testCase.expectation, parsedToolCalls, parsedClarification);

  return {
    id: testCase.id,
    message: testCase.message,
    note: testCase.note || null,
    history: testCase.history || [],
    expectation: testCase.expectation,
    expected_ok: expectedOk,
    classifier: {
      intent: intent?.kind || 'general',
      action_required: !!intent?.action_required,
      tools,
      latency_ms: roundMs(intentLatency),
      goal: intent?.goal || null,
      required_loop: intent?.required_loop || null,
    },
    dry_plan: {
      clarification_needed: clarificationNeeded,
      tool_calls: toolCalls,
      mock_results: mockResults,
    },
    agent: {
      mode: agent.mode,
      model: USE_LLM ? MODEL : null,
      provider_order: USE_LLM ? PROVIDER_ORDER : [],
      status: agent.status,
      latency_ms: agent.latency_ms,
      ok: agent.ok,
      clarification_needed: parsedClarification,
      tool_calls: parsedToolCalls,
      final_response: agent.parsed?.final_response || heuristicResponse(payload),
      notes: agent.parsed?.notes || null,
      error: agent.error,
      usage: agent.usage,
      raw_response: agent.raw_response,
      server_guard: guard,
      retried_after_guard: !!retryAgent,
      first_attempt: agent.first_attempt ? {
        mode: agent.first_attempt.mode,
        latency_ms: agent.first_attempt.latency_ms,
        tool_calls: Array.isArray(agent.first_attempt.parsed?.tool_calls) ? agent.first_attempt.parsed.tool_calls : [],
        final_response: agent.first_attempt.parsed?.final_response || null,
        raw_response: agent.first_attempt.raw_response || null,
      } : null,
    },
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function truncate(text, max = 140) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function renderMarkdown(report) {
  const lines = [
    `# Hermes Agent Dry-Run Stress ${report.run_id}`,
    '',
    `Mode: ${report.mode}`,
    `Cases: ${report.summary.total}, expected ok: ${report.summary.expected_ok}, failed: ${report.summary.failed}`,
    `Agent latency avg/p50/p90/max: ${report.summary.agent_latency.avg_ms}/${report.summary.agent_latency.p50_ms}/${report.summary.agent_latency.p90_ms}/${report.summary.agent_latency.max_ms} ms`,
    `Classifier latency avg/p50/p90/max: ${report.summary.classifier_latency.avg_ms}/${report.summary.classifier_latency.p50_ms}/${report.summary.classifier_latency.p90_ms}/${report.summary.classifier_latency.max_ms} ms`,
    '',
    '| # | Message | Intent | Agent tools | Agent ms | OK | Response |',
    '|---:|---|---|---|---:|---|---|',
  ];
  for (const row of report.rows) {
    lines.push([
      row.id,
      csvEscape(row.message),
      row.classifier.intent,
      row.agent.tool_calls.map((call) => call.tool).join(' -> ') || 'none',
      row.agent.latency_ms,
      row.expected_ok ? 'yes' : 'no',
      truncate(row.agent.final_response, 160).replace(/\|/g, '\\|'),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  lines.push('Full payload is in the JSON file next to this report.');
  return lines.join('\n');
}

function renderCsv(report) {
  const header = ['id', 'message', 'expectation', 'expected_ok', 'intent', 'classifier_tools', 'classifier_ms', 'agent_mode', 'agent_ms', 'agent_tools', 'clarification_needed', 'final_response'];
  const rows = report.rows.map((row) => [
    row.id,
    row.message,
    row.expectation,
    row.expected_ok,
    row.classifier.intent,
    row.classifier.tools.join(' -> '),
    row.classifier.latency_ms,
    row.agent.mode,
    row.agent.latency_ms,
    row.agent.tool_calls.map((call) => call.tool).join(' -> '),
    row.agent.clarification_needed,
    row.agent.final_response,
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function summarizeLatency(rows, selector) {
  const values = rows.map(selector).filter((value) => Number.isFinite(value));
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    avg_ms: roundMs(values.length ? sum / values.length : 0),
    p50_ms: roundMs(percentile(values, 50)),
    p90_ms: roundMs(percentile(values, 90)),
    max_ms: roundMs(values.length ? Math.max(...values) : 0),
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const started = performance.now();
  const rows = await mapWithConcurrency(CASES, USE_LLM ? CONCURRENCY : 10, runCase);
  const totalMs = performance.now() - started;
  const report = {
    ok: rows.every((row) => row.expected_ok && row.agent.ok),
    run_id: RUN_ID,
    generated_at: new Date().toISOString(),
    dry_run: true,
    mode: USE_LLM ? 'llm_dry_run' : 'heuristic_dry_run',
    model: USE_LLM ? MODEL : null,
    provider_order: USE_LLM ? PROVIDER_ORDER : [],
    concurrency: USE_LLM ? CONCURRENCY : 10,
    output_files: {
      json: JSON_OUT,
      markdown: MD_OUT,
      csv: CSV_OUT,
    },
    summary: {
      total: rows.length,
      expected_ok: rows.filter((row) => row.expected_ok).length,
      failed: rows.filter((row) => !row.expected_ok || !row.agent.ok).length,
      total_ms: roundMs(totalMs),
      classifier_latency: summarizeLatency(rows, (row) => row.classifier.latency_ms),
      agent_latency: summarizeLatency(rows, (row) => row.agent.latency_ms),
      by_intent: rows.reduce((acc, row) => {
        acc[row.classifier.intent] = (acc[row.classifier.intent] || 0) + 1;
        return acc;
      }, {}),
      failed_rows: rows
        .filter((row) => !row.expected_ok || !row.agent.ok)
        .map((row) => ({
          id: row.id,
          message: row.message,
          expectation: row.expectation,
          agent_tools: row.agent.tool_calls.map((call) => call.tool),
          response: row.agent.final_response,
          error: row.agent.error,
        })),
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
    expected_ok: report.summary.expected_ok,
    failed: report.summary.failed,
    total_ms: report.summary.total_ms,
    classifier_latency: report.summary.classifier_latency,
    agent_latency: report.summary.agent_latency,
    output_files: report.output_files,
    failed_rows: report.summary.failed_rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
