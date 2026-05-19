const crypto = require('crypto');
const { CLASH_RUNTIME_INSTRUCTIONS } = require('../hermes-orchestrator/src/clash_agent_prompt.cjs');
const { resolveModelChain } = require('../hermes-orchestrator/src/clash_agent_settings.cjs');
const { execFileSync } = require('node:child_process');

const DEFAULT_URL = 'http://127.0.0.1:8600';
const ORCHESTRATOR_URL = String(process.env.CLASH_HERMES_ORCHESTRATOR_URL || DEFAULT_URL).replace(/\/+$/, '');
const ORCHESTRATOR_TOKEN = process.env.CLASH_HERMES_ORCHESTRATOR_TOKEN || process.env.HERMES_ORCHESTRATOR_TOKEN || '';
const MODEL_CHAIN = resolveModelChain(process.env);
const PRIMARY_MODEL = MODEL_CHAIN[0];
const FALLBACK_MODEL = MODEL_CHAIN[1] || '';
const REQUEST_TIMEOUT_MS = Number(process.env.CLASH_HERMES_BACKEND_TIMEOUT_MS || 300_000);
const DETAILED_LOGS = process.env.CLASH_AI_CHAT_DETAILED_LOGS !== '0';
let cachedWslOrchestratorUrl = '';

function logHermesClient(event, payload = {}) {
  if (!DETAILED_LOGS) return;
  try {
    console.log(JSON.stringify({
      event: `hermes_client_${event}`,
      at: new Date().toISOString(),
      ...payload,
    }));
  } catch {
    console.log(`[hermes-client] ${event}`);
  }
}

function configured() {
  return !!(ORCHESTRATOR_URL && ORCHESTRATOR_TOKEN);
}

function assertConfigured() {
  if (!configured()) {
    const err = new Error('Hermes orchestrator is not configured');
    err.status = 503;
    throw err;
  }
}

function isLocalhostUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
  } catch {
    return false;
  }
}

function getWslOrchestratorUrl() {
  if (cachedWslOrchestratorUrl) return cachedWslOrchestratorUrl;
  if (process.platform !== 'win32') return '';
  if (!isLocalhostUrl(ORCHESTRATOR_URL)) return '';
  try {
    const out = execFileSync('wsl.exe', ['--', 'bash', '-lc', "hostname -I | awk '{print $1}'"], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const ip = out.split(/\s+/)[0];
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
      const port = new URL(ORCHESTRATOR_URL).port || '8600';
      cachedWslOrchestratorUrl = `http://${ip}:${port}`;
    }
  } catch {
    cachedWslOrchestratorUrl = '';
  }
  return cachedWslOrchestratorUrl;
}

function orchestratorBaseUrls() {
  const wslUrl = getWslOrchestratorUrl();
  const urls = [];
  if (wslUrl) urls.push(wslUrl);
  urls.push(ORCHESTRATOR_URL);
  return urls;
}

function sanitizePlayer(player) {
  return {
    id: String(player?.id || ''),
    name: String(player?.name || ''),
    dex: player?.dex || null,
    level: player?.level || null,
    trophies: player?.trophies || null,
  };
}

const TRANSIENT_AI_CHAT_FAILURE_PATTERNS = [
  /AI message limit reached/i,
  /Open the AI shop/i,
  /Hermes exited before becoming ready/i,
  /Hermes orchestrator fetch failed/i,
  /\bECONNREFUSED\b/i,
  /\bGateway Timeout\b/i,
  /\b504\b/i,
  /AI request is still running/i,
  /AI result is still pending/i,
  /All routes failed/i,
  /route did not start cleanly/i,
  /Order executed at/i,
  /execution price/i,
  /Opened a .* leverage .* on/i,
  /Closed .* position/i,
  /reduced position/i,
  /final PnL settlement/i,
  /BTC long position/i,
  /You have no open positions/i,
  /Decibel positions/i,
  /open orders/i,
  /account is clean/i,
  /ready for new trades/i,
  /active orders on Decibel/i,
];

function isTransientAiChatFailureText(text) {
  const value = String(text || '').trim();
  return !!value && TRANSIENT_AI_CHAT_FAILURE_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '';
      const text = typeof item?.text === 'string' ? item.text.trim().slice(0, 1000) : '';
      return role && text ? { role, text } : null;
    })
    .filter(Boolean)
    .filter((item) => item.role !== 'assistant' || !isTransientAiChatFailureText(item.text))
    .slice(-4);
}

function normalizeIntentText(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/['`\u2018\u2019\u02bc]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function startsWithToken(text, token) {
  return text === token
    || text.startsWith(`${token} `)
    || text.startsWith(`${token},`)
    || text.startsWith(`${token}.`)
    || text.startsWith(`${token}!`)
    || text.startsWith(`${token}?`);
}

const GENERIC_ATTACK_TARGETS = new Set([
  'a', 'an', 'the', 'any', 'all', 'one', 'some',
  'again', 'new', 'another', 'next', 'random', 'fresh', 'different',
  'base', 'bases', 'enemy', 'enemies', 'opponent', 'opponents', 'target',
  'player', 'players', 'user', 'users', 'someone', 'somebody', 'anyone',
  'good', 'best', 'strong', 'stronger', 'hard', 'harder', 'weak', 'weaker',
  'normal', 'easy', 'nearby', 'shield', 'shielded', 'battle', 'fight', 'raid',
  'когось', 'ворога', 'врага', 'базу', 'база', 'гравця', 'игрока',
  'гравець', 'игрок', 'нову', 'новую', 'іншу', 'другую', 'ще', 'снова',
  'знову', 'рандомну', 'случайную',
]);

function cleanupAttackTargetName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^@+/, '')
    .replace(/[.,!?;:()[\]{}"'`]+$/g, '')
    .trim();
}

function isGenericAttackTargetName(value) {
  const candidate = cleanupAttackTargetName(value);
  if (!candidate) return true;
  const normalized = normalizeIntentText(candidate);
  if (!normalized || GENERIC_ATTACK_TARGETS.has(normalized)) return true;
  if (/^(?:base|enemy|player|user|target|opponent|battle|raid)[_-]?\d*$/i.test(candidate)) return true;
  return false;
}

function isPassiveChat(text) {
  if (!text) return true;
  const greetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'gm', 'gn', 'привіт', 'привет', 'вітаю', 'здравствуй', 'здравствуйте', 'hola', 'bonjour', 'salut', 'hallo', 'ciao', 'ola', 'oi', 'hej', 'hei', 'مرحبا', 'سلام', '你好', '您好', 'こんにちは', 'こんばんは', '안녕', 'xin chao'];
  if (greetings.some((token) => startsWithToken(text, token))) return true;
  const thanks = ['thanks', 'thank you', 'thx', 'дякую', 'спасибо', 'merci', 'gracias', 'obrigado', 'obrigada', 'danke', 'grazie', 'شكرا', '谢谢', 'ありがとう', '고마워', 'cam on'];
  if (thanks.some((token) => startsWithToken(text, token))) return true;
  if (/^(ok|okay|ок|добре|хорошо|fine|cool|nice|супер|круто|ага|yes|no|так|ні|нет)$/i.test(text)) return true;
  if (/^(who are you|what are you|хто ти|кто ты|як справи|как дела|how are you)\??$/i.test(text)) return true;
  return false;
}

function extractAttackTargetName(message) {
  const raw = String(message || '').normalize('NFKC').trim();
  if (!raw) return '';
  const patterns = [
    /\b(?:attack|raid|hit|battle)\s+(?:(?:player|user)\s+)?([\p{L}\p{N}_.-]{2,60})\b/iu,
    /(?:атаку|атака\s+на|атакуй|атакувати|атаковать|напади\s+на|напасть\s+на|нападай\s+на|ударь\s+по|ударь|атакуй\s+гравця|атакуй\s+игрока)\s+([\p{L}\p{N}_.-]{2,60})/iu,
  ];
  const generic = new Set(['enemy', 'someone', 'somebody', 'base', 'player', 'user', 'когось', 'ворога', 'врага', 'базу', 'гравця', 'игрока']);
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = String(match?.[1] || '').replace(/[.,!?;:]+$/g, '').trim();
    if (candidate && !generic.has(candidate.toLowerCase())) return candidate;
  }
  return '';
}

function extractAttackTargetNameV2(message) {
  const raw = String(message || '').normalize('NFKC').trim();
  if (!raw) return '';
  const patterns = [
    /\b(?:attack|raid|hit|battle)\s+(?:(?:the|a|an)\s+)?(?:player|user|enemy|opponent)\s+(?:named|called\s+)?@?([\p{L}\p{N}_.-]{2,60})\b/iu,
    /\b(?:attack|raid|hit|battle)\s+@?([\p{L}\p{N}_.-]{2,60})\b/iu,
    /(?:атакуй|атакувати|атаковать|атака\s+на|напади\s+на|напасть\s+на|нападай\s+на|ударь\s+по|ударь)\s+(?:(?:гравця|игрока|ворога|врага)\s+)?@?([\p{L}\p{N}_.-]{2,60})/iu,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = cleanupAttackTargetName(match?.[1] || '');
    if (candidate && !isGenericAttackTargetName(candidate)) return candidate;
  }
  return '';
}

function isAttackIntentText(text) {
  return /(атак|напад|raid|battle|enemy|ворог|враг|бій|бой|进攻|攻击|打仗|敵|敌|danh|attack)/i.test(text);
}

function battleIntentForTarget(targetPlayerName = '') {
  return {
    kind: targetPlayerName ? 'targeted_battle' : 'battle',
    action_required: true,
    goal: targetPlayerName
      ? `Start an AI online battle against ${targetPlayerName} only through MCP tools.`
      : 'Start an AI online battle only through MCP tools.',
    target_player_name: targetPlayerName || undefined,
    required_loop: targetPlayerName
      ? `get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ target_player_name: "${targetPlayerName}", auto_tactics: true }) -> if shielded, report remaining shield hours in English; otherwise summarize result and losses`
      : 'get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses',
  };
}

const DECIBEL_SYMBOL_RE = /\b(?:BTC|ETH|SOL|APT|SUI|XRP|DOGE|BNB|AVAX|LINK|ARB|OP|TIA|WIF|PEPE|MEGA|MOVE|HYPE|MON|USDC|USD)\b/i;
const DECIBEL_TRADING_WORD_RE = new RegExp([
  'decibel', 'perp', 'perps', 'futures',
  'trade', 'trading', 'position', 'positions', 'order', 'orders',
  'long', 'short', 'buy', 'sell', 'bid', 'ask',
  'price', 'prices', 'market', 'markets', 'funding',
  'leverage', 'margin', 'collateral', 'notional', 'size',
  'balance', 'equity', 'pnl', 'profit', 'loss',
  'tp', 'sl', 'take profit', 'stop loss', 'close', 'cancel',
  '\\u043b\\u043e\\u043d\\u0433',        // long
  '\\u0448\\u043e\\u0440\\u0442',        // short
  '\\u043f\\u043e\\u0437\\u0438\\u0446', // position
  '\\u0443\\u0433\\u043e\\u0434',        // trade/deal
  '\\u043e\\u0440\\u0434\\u0435\\u0440', // order
  '\\u043f\\u043b\\u0435\\u0447',        // leverage
  '\\u0431\\u0430\\u043b\\u0430\\u043d\\u0441',
  '\\u0437\\u0430\\u043a\\u0440',        // close
  '\\u043e\\u0442\\u043a\\u0440',        // open
  '\\u0432\\u0456\\u0434\\u043a\\u0440', // open uk
  '\\u043a\\u0443\\u043f',               // buy
  '\\u043f\\u0440\\u043e\\u0434',        // sell
  '\\u4ed3', '\\u591a', '\\u7a7a', '\\u8ba2\\u5355', '\\u6760\\u6746', '\\u4ef7\\u683c', '\\u5e02\\u573a'
].join('|'), 'iu');
const DECIBEL_ACCOUNT_RE = /(balance|equity|account|wallet|overview|pnl|profit|loss|\u0431\u0430\u043b\u0430\u043d\u0441|\u0433\u0430\u043c\u0430\u043d|\u043a\u043e\u0448\u0435\u043b|\u76c8\u4e8f|\u8d26\u6237|\u5e73\u8861)/iu;
const DECIBEL_POSITION_READ_RE = /(position|positions|open trades|my trades|\u043f\u043e\u0437\u0438\u0446|\u4ed3\u4f4d|\u6301\u4ed3)/iu;
const DECIBEL_ORDER_READ_RE = /(?:\b(?:open|active|pending|my|list|show|check|what)\s+orders?\b|\borders?\s+(?:do\s+i\s+have|open|active|pending|list|show|check)\b|\u043e\u0440\u0434\u0435\u0440|\u8ba2\u5355)/iu;
const DECIBEL_MARKET_RE = /(market|markets|price|prices|mark price|funding|\u0446\u0456\u043d|\u0446\u0435\u043d|\u043f\u0440\u0430\u0439\u0441|\u043a\u043e\u0442\u0438\u0440|\u0440\u0438\u043d\u043e\u043a|\u0440\u044b\u043d\u043e\u043a|\u4ef7\u683c|\u5e02\u573a|\u884c\u60c5)/iu;
const DECIBEL_CLOSE_RE = /(close|reduce|\u0437\u0430\u043a\u0440|\u0437\u043c\u0435\u043d\u0448|\u0443\u043c\u0435\u043d\u044c\u0448|\u5e73\u4ed3|\u5173\u95ed|\u6e1b\u4ed3|\u51cf\u4ed3)/iu;
const DECIBEL_CANCEL_RE = /(cancel|remove order|\u043e\u0442\u043c\u0435\u043d|\u0441\u043a\u0430\u0441\u0443|\u53d6\u6d88|\u64a4\u5355)/iu;
const DECIBEL_TPSL_RE = /(take profit|stop loss|\btp\b|\bsl\b|\u0442\u0435\u0439\u043a|\u043f\u0440\u043e\u0444\u0456\u0442|\u043f\u0440\u043e\u0444\u0438\u0442|\u0441\u0442\u043e\u043f|\u043b\u043e\u0441|\u6b62\u76c8|\u6b62\u635f|\u6b62\u635f)/iu;
const DECIBEL_LEVERAGE_RE = /(leverage|\d+\s*x\b|\u043f\u043b\u0435\u0447|\u043b\u0435\u0432\u0435\u0440|\u6760\u6746)/iu;
const DECIBEL_PLACE_ORDER_RE = /(long|short|buy|sell|open\s+(?:a\s+)?(?:long|short|trade|position|order)|market order|limit order|\u043b\u043e\u043d\u0433|\u0448\u043e\u0440\u0442|\u043e\u0442\u043a\u0440|\u0432\u0456\u0434\u043a\u0440|\u043a\u0443\u043f|\u043f\u0440\u043e\u0434|\u5f00\u591a|\u5f00\u7a7a|\u4e70|\u5356|\u505a\u591a|\u505a\u7a7a)/iu;
const DECIBEL_NON_TRADE_SHORT_LONG_RE = /\b(?:short|long)\s+(?:answer|reply|message|sentence|text|summary|response)\b/iu;
const WORD_TAIL = '[\\p{L}\\p{M}\\p{N}_-]*';
const DECIBEL_AUTONOMOUS_ORDER_RE = new RegExp(`(?:\\b(?:open|place|make|start)\\s+(?:an?\\s+)?(?:any|random|interesting|surprise|whatever|your\\s+choice)?\\s*(?:trade|position|order)\\b|\\b(?:surprise\\s+me|choose\\s+(?:yourself|for\\s+me)|your\\s+choice|pick\\s+(?:for\\s+me|one)|decide\\s+yourself)\\b|(?:\\u0441\\u0430\\u043c|\\u0441\\u0430\\u043c\\u0430).*(?:\\u0443\\u0433\\u043e\\u0434|\\u0441\\u0434\\u0435\\u043b|\\u0442\\u0440\\u0435\\u0439\\u0434|\\u043f\\u0440\\u0438\\u0434\\u0443\\u043c)|(?:\\u0449\\u043e\\u0441\\u044c|\\u0447\\u0442\\u043e-\\u0442\\u043e|\\u044f\\u043a\\u0443\\u0441${WORD_TAIL}|\\u043a\\u0430\\u043a\\u0443\\u044e-\\u0442\\u043e).*(?:\\u0443\\u0433\\u043e\\u0434|\\u0441\\u0434\\u0435\\u043b|\\u0442\\u0440\\u0435\\u0439\\u0434|\\u0446\\u0456\\u043a\\u0430\\u0432|\\u0438\\u043d\\u0442\\u0435\\u0440\\u0435\\u0441\\u043d)|(?:\\u043e\\u0442\\u043a\\u0440|\\u0432\\u0456\\u0434\\u043a\\u0440).*(?:\\u043b\\u044e\\u0431|\\u0431\\u0443\\u0434\\u044c|\\u044f\\u043a\\u0443\\u0441${WORD_TAIL}|\\u0449\\u043e\\u0441\\u044c|\\u0447\\u0442\\u043e-\\u0442\\u043e).*(?:\\u0443\\u0433\\u043e\\u0434|\\u0441\\u0434\\u0435\\u043b|\\u0442\\u0440\\u0435\\u0439\\u0434|\\u043f\\u043e\\u0437))`, 'iu');
const DECIBEL_DELEGATED_DECISION_RE = new RegExp(`(?:\\u0442\\u0432\\u043e.{0,24}\\u043b\\u043e\\u0433|\\u0442\\u0432\\u043e.{0,24}\\u0440\\u043e\\u0437\\u0441\\u0443\\u0434|\\u0442\\u0432\\u043e.{0,24}\\u0432\\u044b\\u0431\\u043e\\u0440|\\u044f\\u043a\\u0443\\u0441${WORD_TAIL}.{0,24}\\u043f\\u043e\\u0437|\\u043a\\u0430\\u043a\\u0443\\u044e.{0,24}\\u043f\\u043e\\u0437|\\u0449\\u043e\\u0441${WORD_TAIL}.{0,32}(?:\\u043f\\u0440\\u0438\\u043a\\u043e\\u043b|\\u043f\\u0440\\u043a\\u0438\\u043e\\u043b|\\u0446\\u0456\\u043a\\u0430\\u0432)|\\u0447\\u0442\\u043e-\\u0442\\u043e.{0,32}(?:\\u0438\\u043d\\u0442\\u0435\\u0440\\u0435\\u0441|\\u043f\\u0440\\u0438\\u043a\\u043e\\u043b)|\\b(?:fun|cool|interesting)\\s+(?:trade|position|order)\\b)`, 'iu');
const DECIBEL_STABLE_SYMBOLS = new Set(['USD', 'USDC']);

function extractDecibelSymbol(message) {
  const matches = String(message || '').normalize('NFKC').match(new RegExp(DECIBEL_SYMBOL_RE.source, 'ig')) || [];
  for (const match of matches) {
    const symbol = String(match || '').toUpperCase();
    if (symbol && !DECIBEL_STABLE_SYMBOLS.has(symbol)) return symbol;
  }
  return '';
}

function extractRecentDecibelSymbolFromHistory(history = []) {
  const rows = Array.isArray(history) ? history.slice(-8).reverse() : [];
  for (const row of rows) {
    const text = String(row?.text || row?.content || '').normalize('NFKC');
    if (!/(opened|open|position|long|short|closed|закр|відкр|откр|пози|позу)/iu.test(text)) continue;
    const symbol = extractDecibelSymbol(text);
    if (symbol) return symbol;
  }
  return '';
}

function extractDecibelPercent(message) {
  const text = String(message || '').normalize('NFKC');
  if (/\b(?:all|full|everything|entire|100%)\b/i.test(text)) return 100;
  if (/\b(?:half|50%)\b/i.test(text)) return 50;
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.min(100, value)) : 100;
}

function extractDecibelLeverage(message) {
  const match = String(message || '').normalize('NFKC').match(/\b(\d+(?:\.\d+)?)\s*x\b/i);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.min(50, value)) : undefined;
}

function extractDecibelSide(message, normalizedText = '') {
  const text = normalizedText || normalizeIntentText(message);
  if (/(?:^|\s)(short|sell|ask)(?:\s|$)|\u0448\u043e\u0440\u0442|\u043f\u0440\u043e\u0434|\u5356|\u505a\u7a7a|\u5f00\u7a7a/iu.test(text)) return 'short';
  if (/(?:^|\s)(long|buy|bid)(?:\s|$)|\u043b\u043e\u043d\u0433|\u043a\u0443\u043f|\u4e70|\u505a\u591a|\u5f00\u591a/iu.test(text)) return 'long';
  return '';
}

function extractDecibelUsdAmount(message) {
  const text = String(message || '').normalize('NFKC');
  const dollar = text.match(/\$\s*(\d+(?:[.,]\d+)?)/);
  if (dollar) {
    const value = Number(String(dollar[1]).replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return value;
  }
  const stable = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:usdc|usd)\b/i);
  if (stable) {
    const value = Number(String(stable[1]).replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function extractDecibelUsdcPercent(message) {
  const text = String(message || '').normalize('NFKC');
  if (/\b(?:all|full|entire|whole|everything|max|maximum)\b.{0,40}\b(?:money|balance|wallet|funds|capital|usdc|usd)\b/i.test(text)
    || /\b(?:money|balance|wallet|funds|capital|usdc|usd)\b.{0,40}\b(?:all|full|entire|whole|everything|max|maximum)\b/i.test(text)
    || /(?:\u0432\u0441[её\u0438\u0456\u044e\u044f]|\u0443\u0441[і\u0456]\w*|\u0432\u0435\u0441\u044c|\u0432\u0441\u044e|\u0443\u0441\u044e|\u0432\u0435\u0441\u044c).{0,40}(?:\u0433\u0440\u043e\u0448|\u0434\u0435\u043d\u044c\u0433|\u0431\u0430\u043b\u0430\u043d\u0441|\u0433\u0430\u043c\u0430\u043d|\u043a\u043e\u0448\u0435\u043b|\u0441\u0440\u0435\u0434\u0441\u0442\u0432|usdc|usd)/iu.test(text)
    || /(?:\u0433\u0440\u043e\u0448|\u0434\u0435\u043d\u044c\u0433|\u0431\u0430\u043b\u0430\u043d\u0441|\u0433\u0430\u043c\u0430\u043d|\u043a\u043e\u0448\u0435\u043b|\u0441\u0440\u0435\u0434\u0441\u0442\u0432|usdc|usd).{0,40}(?:\u0432\u0441[её\u0438\u0456\u044e\u044f]|\u0443\u0441[і\u0456]\w*|\u0432\u0435\u0441\u044c|\u0432\u0441\u044e|\u0443\u0441\u044e|\u0432\u0435\u0441\u044c)/iu.test(text)
  ) {
    return 100;
  }
  const match = text.match(/\b(\d+(?:[.,]\d+)?)\s*%\s*(?:of\s+)?(?:my\s+)?(?:usdc|usd|balance|wallet)\b/i);
  const value = Number(String(match?.[1] || '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.max(0.01, Math.min(100, value)) : 0;
}

function isAutonomousDecibelOrder(message) {
  const text = String(message || '').normalize('NFKC');
  return DECIBEL_AUTONOMOUS_ORDER_RE.test(text) || DECIBEL_DELEGATED_DECISION_RE.test(text);
}

function decibelIntentLoop(kind) {
  switch (kind) {
    case 'decibel_account':
      return {
        tools: ['decibel_get_account'],
        loop: 'decibel_get_account({ include_orders: true }) -> summarize equity/balance, positions, and open orders',
        goal: 'Read the authenticated Decibel account through MCP tools.',
      };
    case 'decibel_markets':
      return {
        tools: ['decibel_get_markets'],
        loop: 'decibel_get_markets({}) -> summarize requested symbols, mark prices, and constraints',
        goal: 'Read Decibel market data through MCP tools.',
      };
    case 'decibel_close_position':
      return {
        tools: ['decibel_close_position'],
        loop: 'Call decibel_close_position. If symbol is missing, the MCP tool closes the only open position or returns a blocker listing open symbols.',
        goal: 'Close or reduce an existing Decibel position through MCP tools.',
      };
    case 'decibel_cancel_order':
      return {
        tools: ['decibel_get_positions', 'decibel_cancel_order'],
        loop: 'decibel_get_positions({ include_orders: true }) -> identify exact open order id -> decibel_cancel_order({ symbol, order_id }) -> summarize result',
        goal: 'Cancel an existing Decibel order through MCP tools.',
      };
    case 'decibel_tpsl':
      return {
        tools: ['decibel_get_positions', 'decibel_set_tpsl'],
        loop: 'decibel_get_positions({ include_orders: true }) -> identify exact position -> decibel_set_tpsl({ symbol, take_profit?, stop_loss? }) -> summarize result',
        goal: 'Set Decibel take-profit or stop-loss through MCP tools.',
      };
    case 'decibel_leverage':
      return {
        tools: ['decibel_get_positions', 'decibel_set_leverage'],
        loop: 'decibel_get_positions({ include_orders: true }) -> identify symbol -> decibel_set_leverage({ symbol, leverage }) -> summarize result',
        goal: 'Configure Decibel leverage through MCP tools.',
      };
    case 'decibel_place_order':
    default:
      return {
        tools: ['decibel_place_order'],
        loop: 'If symbol, side, and size/notional/collateral are clear, call decibel_place_order once with leverage included if specified. Do not call decibel_get_account, decibel_get_markets, or decibel_set_leverage first unless required fields are missing.',
        goal: 'Open a Decibel long/short order through MCP tools with mandatory Clash builder routing.',
      };
  }
}

function classifyDecibelTradingIntent(message, normalizedText) {
  const raw = String(message || '').normalize('NFKC');
  const text = normalizedText || normalizeIntentText(raw);
  const autonomousOrder = isAutonomousDecibelOrder(raw);
  const hasTradingWord = DECIBEL_TRADING_WORD_RE.test(text)
    || DECIBEL_MARKET_RE.test(text)
    || DECIBEL_ACCOUNT_RE.test(text)
    || DECIBEL_POSITION_READ_RE.test(text)
    || DECIBEL_ORDER_READ_RE.test(text)
    || DECIBEL_CLOSE_RE.test(text)
    || DECIBEL_CANCEL_RE.test(text)
    || DECIBEL_TPSL_RE.test(text)
    || DECIBEL_LEVERAGE_RE.test(text)
    || DECIBEL_PLACE_ORDER_RE.test(text);
  const hasSymbol = DECIBEL_SYMBOL_RE.test(raw);
  if (/(build order|building order|base build order)/i.test(raw)) return null;
  if (!hasSymbol && !autonomousOrder && DECIBEL_NON_TRADE_SHORT_LONG_RE.test(text)) return null;
  if (!autonomousOrder && !hasTradingWord && !(/decibel/i.test(raw) || (hasSymbol && (/\d/.test(raw) || DECIBEL_MARKET_RE.test(text))))) {
    return null;
  }
  if (!autonomousOrder && !hasSymbol && !/(decibel|position|positions|order|orders|balance|equity|pnl|trade|trading|long|short|buy|sell|close|cancel|leverage|tp|sl|\u043f\u043e\u0437\u0438\u0446|\u043e\u0440\u0434\u0435\u0440|\u0443\u0433\u043e\u0434|\u0431\u0430\u043b\u0430\u043d\u0441|\u043b\u043e\u043d\u0433|\u0448\u043e\u0440\u0442|\u043f\u043b\u0435\u0447|\u0437\u0430\u043a\u0440|\u0432\u0456\u0434\u043a\u0440|\u043e\u0442\u043a\u0440|\u4ed3|\u8ba2\u5355|\u6760\u6746|\u4ef7\u683c)/iu.test(text)) {
    return null;
  }

  let kind = 'decibel_place_order';
  const wantsPlaceOrder = (DECIBEL_PLACE_ORDER_RE.test(text) || autonomousOrder) && !DECIBEL_ORDER_READ_RE.test(text);
  if (DECIBEL_ACCOUNT_RE.test(text)) {
    kind = 'decibel_account';
  }
  if (DECIBEL_POSITION_READ_RE.test(text) || DECIBEL_ORDER_READ_RE.test(text)) {
    kind = 'decibel_account';
  }
  if (DECIBEL_MARKET_RE.test(text)) {
    kind = 'decibel_markets';
  }
  if (wantsPlaceOrder) {
    kind = 'decibel_place_order';
  }
  if (DECIBEL_CLOSE_RE.test(text)) {
    kind = 'decibel_close_position';
  }
  if (DECIBEL_CANCEL_RE.test(text)) {
    kind = 'decibel_cancel_order';
  }
  if (DECIBEL_TPSL_RE.test(text)) {
    kind = 'decibel_tpsl';
  }
  if (DECIBEL_LEVERAGE_RE.test(text) && !wantsPlaceOrder) {
    kind = 'decibel_leverage';
  }

  const mapped = decibelIntentLoop(kind);
  return {
    kind,
    action_required: kind !== 'decibel_markets' && kind !== 'decibel_account' ? true : true,
    goal: mapped.goal,
    required_loop: mapped.loop,
    expected_tools: mapped.tools,
  };
}

function classifyGameIntent(message) {
  const text = normalizeIntentText(message);
  if (!text) return { kind: 'general', action_required: false };
  const decibelIntent = classifyDecibelTradingIntent(message, text);
  if (decibelIntent) return decibelIntent;
  if (isAttackIntentText(text)) {
    return battleIntentForTarget(extractAttackTargetNameV2(message));
  }
  if (/(атак|атакуй|напад|напади|raid|battle|enemy|ворог|враг|бій|бой|进攻|攻击|打仗|敵|敌|đánh|attack)/i.test(text)) {
    const targetPlayerName = extractAttackTargetName(message);
    return {
      kind: targetPlayerName ? 'targeted_battle' : 'battle',
      action_required: true,
      goal: targetPlayerName
        ? `Start an AI online battle against ${targetPlayerName} only through MCP tools.`
        : 'Start an AI online battle only through MCP tools.',
      target_player_name: targetPlayerName || undefined,
      required_loop: targetPlayerName
        ? `get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ target_player_name: "${targetPlayerName}", auto_tactics: true }) -> if shielded, report remaining shield hours; otherwise summarize result and losses`
        : 'get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses',
    };
  }
  if (/(збери|собери|collect|收集|thu thap).*(ресурс|реси|resources|资源|tai nguyen)|(?:ресурс|реси|resources|资源|tai nguyen).*(збери|собери|collect|收集|thu thap)/i.test(text)) {
    return {
      kind: 'collect_resources',
      action_required: true,
      goal: 'Collect available game resources only through MCP tools.',
      required_loop: 'get_base_state -> collect_resources({}) -> summarize collected resources',
    };
  }
  if (/(build|place|set up|setup|розстав|побуд|постав|建造|布置|xay).*(base|баз|基地|can cu)|(?:base|баз|基地|can cu).*(build|place|set up|setup|розстав|побуд|постав|建造|布置|xay)/i.test(text)) {
    return {
      kind: 'auto_build_base',
      action_required: true,
      goal: 'Autonomously build and arrange the player base through MCP tools without asking for grids or a building list.',
      required_loop: 'get_base_state -> auto_build_base({ focus: "balanced" }) -> summarize built buildings and blockers',
    };
  }
  if (/(побуд|постав|build|place|shop|магазин|archer tower|tower|порт|port|будів|building|建造|建筑|商店|港口|塔|xay)/i.test(text)) {
    return {
      kind: 'build',
      action_required: true,
      goal: 'Place a valid building using catalog and build-slot tools.',
      required_loop: 'get_base_state -> if broad base setup use auto_build_base; otherwise get_building_catalog if needed -> find_build_slots -> place_building -> summarize result',
    };
  }
  if (/(апгрейд|апгрейдни|upgrade|level|lvl|рівень|уровень|升级|nang cap)/i.test(text)) {
    return {
      kind: 'upgrade',
      action_required: true,
      goal: 'Upgrade the requested building or troop using MCP tools.',
      required_loop: 'get_base_state -> identify exact id/type -> upgrade_building or upgrade_troop -> summarize result',
    };
  }
  if (/(кораб|ship|troop|військ|войск|load|reinforce|віднов|восстанов|船|部队|增援|tau|quan)/i.test(text)) {
    return {
      kind: 'fleet',
      action_required: true,
      goal: 'Manage ships, troops, loadouts, or reinforcements through MCP tools.',
      required_loop: 'get_base_state -> choose valid port/ship/troop ids -> use the relevant ship/troop MCP tool -> summarize result',
    };
  }
  if (/(скіли|skills|що ти вмієш|что ты умеешь|можеш|умеешь|技能|你会|能力)/i.test(text)) {
    return {
      kind: 'skills',
      action_required: false,
      goal: 'Explain only Clash of Perps gameplay capabilities.',
    };
  }
  if (isPassiveChat(text)) return { kind: 'general', action_required: false };
  return {
    kind: 'gameplay',
    action_required: true,
    goal: 'Infer the player Clash of Perps gameplay request in any language and complete the useful action through MCP tools.',
    required_loop: 'get_base_state -> infer the requested game action from the player message and recent context -> use the minimum relevant Clash MCP tool(s) -> summarize confirmed result or blocker',
  };
}

function buildIntentInstructions(intent) {
  if (!intent || intent.kind === 'general') return '';
  const lines = [
    '## Current Request Intent',
    `Intent: ${intent.kind}.`,
    `Goal: ${intent.goal || 'Help with Clash of Perps gameplay.'}`,
  ];
  if (Array.isArray(intent.expected_tools) && intent.expected_tools.length) {
    lines.push(`Expected MCP tools: ${intent.expected_tools.join(' -> ')}.`);
  }
  if (intent.action_required) {
    lines.push(
      'This is a real game-action request. Do not answer with only advice.',
      'Use Clash MCP tools before the final answer. Never claim an action happened unless the tool result confirms it.',
      `Required loop: ${intent.required_loop}`,
      'If a tool blocks the action, stop and report the exact blocker in clear English. Do not translate blocker/error messages.'
    );
  }
  return lines.join('\n');
}

function buildChatInput(message, history, internalContext = '') {
  const current = String(message || '').trim().slice(0, 8000);
  const safeHistory = normalizeHistory(history);
  const internal = String(internalContext || '').trim().slice(0, 2000);
  if (!safeHistory.length && !internal) return current;

  const historyText = safeHistory
    .map((item) => `${item.role === 'user' ? 'User' : 'Agent'}: ${item.text}`)
    .join('\n');
  const historyBlock = safeHistory.length ? `# Recent Chat Context\n${historyText}\n\n` : '';
  const internalBlock = internal ? `# Internal Server Context\n${internal}\n\n` : '';
  const currentBlock = `# Current Player Message\n${current}`;
  const contextRules = [
    '# Context Rules',
    'Recent Chat Context is only conversational context.',
    'Internal Server Context is authoritative implementation context and must not be quoted as if the user wrote it.',
    'Do not copy old quota, network, timeout, or runtime errors as the answer.',
    'Current server quota and current MCP/tool results are authoritative.',
  ].join('\n');
  let input = `${historyBlock}${internalBlock}${contextRules}\n\n${currentBlock}`;
  if (input.length <= 8000) return input;

  const fixedLength = internalBlock.length + currentBlock.length + contextRules.length + 64;
  const budget = Math.max(0, 8000 - fixedLength);
  const trimmedHistoryBlock = safeHistory.length ? `# Recent Chat Context\n${historyText.slice(-budget)}\n\n` : '';
  input = `${trimmedHistoryBlock}${internalBlock}${contextRules}\n\n${currentBlock}`;
  return input.slice(0, 8000);
}

function buildInstructionsForMessage(message) {
  const intent = classifyGameIntent(message);
  const intentInstructions = buildIntentInstructions(intent);
  return {
    intent,
    instructions: intentInstructions
      ? `${CLASH_RUNTIME_INSTRUCTIONS}\n\n${intentInstructions}`
      : CLASH_RUNTIME_INSTRUCTIONS,
  };
}

async function request(path, options = {}) {
  assertConfigured();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const method = options.method || 'GET';
    let res = null;
    let url = '';
    let lastNetworkError = null;
    for (const baseUrl of orchestratorBaseUrls()) {
      url = `${baseUrl}${path}`;
      try {
        res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${ORCHESTRATOR_TOKEN}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
          body: options.body == null ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
        if (baseUrl !== ORCHESTRATOR_URL) {
          logHermesClient('request_wsl_endpoint_ok', { method, path, base_url: baseUrl });
        }
        break;
      } catch (err) {
        lastNetworkError = err;
        const cause = err?.cause || {};
        const detail = cause?.code
          ? `${cause.code}${cause.address ? ` ${cause.address}` : ''}${cause.port ? `:${cause.port}` : ''}`
          : err?.name || 'network error';
        logHermesClient('request_network_error', {
          method,
          path,
          base_url: baseUrl,
          duration_ms: Date.now() - startedAt,
          error: detail,
        });
      }
    }
    if (!res) {
      const cause = lastNetworkError?.cause || {};
      const detail = cause?.code
        ? `${cause.code}${cause.address ? ` ${cause.address}` : ''}${cause.port ? `:${cause.port}` : ''}`
        : lastNetworkError?.name || 'network error';
      const wrapped = new Error(`Hermes orchestrator fetch failed (${url || ORCHESTRATOR_URL + path}): ${detail}`);
      wrapped.status = 502;
      wrapped.cause = lastNetworkError;
      logHermesClient('request_error', {
        method,
        path,
        duration_ms: Date.now() - startedAt,
        error: wrapped.message,
      });
      throw wrapped;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    logHermesClient('request_done', {
      method,
      path,
      status: res.status,
      ok: res.ok,
      duration_ms: Date.now() - startedAt,
      response_bytes: text.length,
    });
    if (!res.ok) {
      const err = new Error(json?.error || json?.message || `Hermes orchestrator HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function getStatus(playerId) {
  return request(`/players/${encodeURIComponent(playerId)}/status`, { timeoutMs: 15_000 });
}

async function provision(player, mcpKey) {
  const safePlayer = sanitizePlayer(player);
  return request(`/players/${encodeURIComponent(safePlayer.id)}/provision`, {
    method: 'POST',
    timeoutMs: 80_000,
    body: {
      name: safePlayer.name,
      player: safePlayer,
      mcp_key: mcpKey,
      model: PRIMARY_MODEL,
      fallback_model: FALLBACK_MODEL,
      model_chain: MODEL_CHAIN,
    },
  });
}

async function chat(player, mcpKey, message, options = {}) {
  const safePlayer = sanitizePlayer(player);
  const history = normalizeHistory(options.history);
  await provision(safePlayer, mcpKey);
  const requestContext = buildInstructionsForMessage(message);
  return request(`/players/${encodeURIComponent(safePlayer.id)}/chat`, {
    method: 'POST',
    body: {
      input: buildChatInput(message, history, options.internal_context),
      instructions: requestContext.instructions,
      previous_response_id: options.previous_response_id || null,
      idempotency_key: options.idempotency_key || crypto.randomUUID(),
      metadata: {
        player_id: safePlayer.id,
        player_name: safePlayer.name,
        source: 'clash-web-chat',
        history_count: history.length,
        game_intent: requestContext.intent,
        ...(options.metadata || {}),
      },
    },
  });
}

async function reset(playerId, options = {}) {
  return request(`/players/${encodeURIComponent(playerId)}/reset`, {
    method: 'POST',
    timeoutMs: 80_000,
    body: {
      delete_memory: !!options.delete_memory,
      restart: options.restart !== false,
    },
  });
}

module.exports = {
  configured,
  getStatus,
  provision,
  chat,
  reset,
  classifyGameIntent,
};
