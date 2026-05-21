const crypto = require('crypto');
const { buildRuntimeInstructions } = require('../hermes-orchestrator/src/clash_agent_prompt.cjs');
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
const AVANTIS_AI_MAX_LEVERAGE_HINT = Math.max(1, Math.min(1000, Number(process.env.CLASH_AVANTIS_AI_MAX_LEVERAGE || 50) || 50));
const ORCHESTRATOR_NETWORK_RETRIES = Math.max(0, Math.min(5, Number(process.env.CLASH_HERMES_FETCH_RETRIES ?? 2) || 0));
const ORCHESTRATOR_NETWORK_RETRY_DELAY_MS = Math.max(50, Math.min(5000, Number(process.env.CLASH_HERMES_FETCH_RETRY_DELAY_MS || 350) || 350));
let cachedWslOrchestratorUrl = '';
const unhealthyBaseUrlUntil = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const now = Date.now();
  const urls = [ORCHESTRATOR_URL];
  if (wslUrl && wslUrl !== ORCHESTRATOR_URL) urls.push(wslUrl);
  return urls.filter((url) => {
    const until = unhealthyBaseUrlUntil.get(url) || 0;
    if (!until) return true;
    if (until <= now) {
      unhealthyBaseUrlUntil.delete(url);
      return true;
    }
    return false;
  });
}

function markBaseUrlUnhealthy(baseUrl, reason, ttlMs = 5 * 60_000) {
  unhealthyBaseUrlUntil.set(baseUrl, Date.now() + ttlMs);
  logHermesClient('base_url_temporarily_disabled', {
    base_url: baseUrl,
    ttl_ms: ttlMs,
    reason: String(reason || '').slice(0, 300),
  });
}

function shouldTryNextOrchestrator(baseUrl, status, json, text) {
  if (baseUrl !== ORCHESTRATOR_URL) return false;
  const bodyText = [
    json?.error,
    json?.message,
    json?.raw,
    text,
  ].filter(Boolean).join('\n');
  if (!bodyText) return false;
  if (/Hermes runtime was not found|Install Hermes locally|HERMES_BIN/i.test(bodyText)) {
    return true;
  }
  if (/Hermes exited before becoming ready|ENOENT/i.test(bodyText)) {
    return true;
  }
  return false;
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
  /^\s*(?:Done|Result|Next):\s/i,
  /\|\s*Agent:\s*(?:Done|Result|Next):\s/i,
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
      ? `get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ target_player_name: "${targetPlayerName}", auto_tactics: true }) -> if shielded, naturally say the target is under shield and include remaining shield hours; otherwise summarize result and losses`
      : 'get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses',
    expected_tools: ['get_base_state', 'execute_ai_attack_plan'],
  };
}

const DECIBEL_SYMBOL_RE = /\b(?:BTC|ETH|SOL|APT|SUI|XRP|DOGE|BNB|AVAX|LINK|ARB|OP|TIA|WIF|PEPE|MEGA|MOVE|HYPE|MON|USDC|USD)\b/i;
const DECIBEL_BTC_ALIAS_RE = /(?:\bbitcoin\b|\u0431\u0456\u0442\u043e\u043a|\u0431\u0438\u0442\u043e\u043a|\u0431\u0456\u0442\u043a\u043e\u0457\u043d|\u0431\u0438\u0442\u043a\u043e\u0438\u043d)/iu;
const DECIBEL_SYMBOL_ALIAS_RE = /собак|песик|додж|doge\s+coin|\bdog\s+(?:coin|token)\b/iu;
const DECIBEL_TRADING_WORD_RE = new RegExp([
  'decibel', 'perp', 'perps', 'futures',
  'trade', 'trading', 'position', 'positions', 'order', 'orders',
  'long', 'short', 'buy', 'sell', 'bid', 'ask',
  'price', 'prices', 'market', 'markets', 'funding',
  'leverage', 'margin', 'collateral', 'notional', 'size',
  'balance', 'equity', 'pnl', 'profit', 'loss',
  'tp', 'sl', 'take profit', 'stop loss', 'close', 'cancel',
  'interesting', 'volatile', 'volatility', 'risky',
  '\\u0442\\u043f',                 // TP typed with Cyrillic letters
  '\\u0441\\u043b',                 // SL typed with Cyrillic letters
  '\\u0442\\u0435\\u0439\\u043a',   // take
  '\\u043f\\u0440\\u043e\\u0444',   // profit
  '\\u043f\\u0440\\u0438\\u0431\\u0443\\u0442', // profit uk
  '\\u0441\\u0442\\u043e\\u043f',   // stop
  '\\u043b\\u043e\\u0441',          // loss
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
  '\\u0446\\u0456\\u043a\\u0430\\u0432', // interesting uk
  '\\u0438\\u043d\\u0442\\u0435\\u0440\\u0435\\u0441', // interesting ru
  '\\u0432\\u043e\\u043b\\u0430\\u0442', // volatility
  '\\u4ed3', '\\u591a', '\\u7a7a', '\\u8ba2\\u5355', '\\u6760\\u6746', '\\u4ef7\\u683c', '\\u5e02\\u573a'
].join('|'), 'iu');
const DECIBEL_ACCOUNT_RE = /(balance|equity|account|wallet|overview|pnl|profit|loss|\u0431\u0430\u043b\u0430\u043d\u0441|\u0433\u0430\u043c\u0430\u043d|\u043a\u043e\u0448\u0435\u043b|\u76c8\u4e8f|\u8d26\u6237|\u5e73\u8861)/iu;
const DECIBEL_POSITION_READ_RE = /(position|positions|open trades|my trades|\u043f\u043e\u0437\u0438\u0446|\u4ed3\u4f4d|\u6301\u4ed3)/iu;
const DECIBEL_ORDER_READ_RE = /(?:\b(?:open|active|pending|my|list|show|check|what)\s+orders?\b|\borders?\s+(?:do\s+i\s+have|open|active|pending|list|show|check)\b|\u043e\u0440\u0434\u0435\u0440|\u8ba2\u5355)/iu;
const DECIBEL_MARKET_RE = /(market|markets|price|prices|mark price|funding|\u0446\u0456\u043d|\u0446\u0435\u043d|\u043f\u0440\u0430\u0439\u0441|\u043a\u043e\u0442\u0438\u0440|\u0440\u0438\u043d\u043e\u043a|\u0440\u044b\u043d\u043e\u043a|\u4ef7\u683c|\u5e02\u573a|\u884c\u60c5)/iu;
const DECIBEL_CLOSE_RE = /(close|reduce|\u0437\u0430\u043a\u0440|\u0437\u043c\u0435\u043d\u0448|\u0443\u043c\u0435\u043d\u044c\u0448|\u5e73\u4ed3|\u5173\u95ed|\u6e1b\u4ed3|\u51cf\u4ed3)/iu;
const DECIBEL_CANCEL_RE = /(cancel|remove order|\u043e\u0442\u043c\u0435\u043d|\u0441\u043a\u0430\u0441\u0443|\u53d6\u6d88|\u64a4\u5355)/iu;
const DECIBEL_TPSL_RE = /(take profit|stop loss|\btp\b|\bsl\b|(?:^|[^\p{L}\p{N}_])\u0442\u043f(?:$|[^\p{L}\p{N}_])|(?:^|[^\p{L}\p{N}_])\u0441\u043b(?:$|[^\p{L}\p{N}_])|\u0442\u0435\u0439\u043a|\u043f\u0440\u043e\u0444\u0456\u0442|\u043f\u0440\u043e\u0444\u0438\u0442|\u043f\u0440\u0438\u0431\u0443\u0442|\u0441\u0442\u043e\u043f|\u043b\u043e\u0441|\u0437\u0431\u0438\u0442|\u6b62\u76c8|\u6b62\u635f|\u6b62\u635f)/iu;
const DECIBEL_LEVERAGE_RE = /(leverage|\d+\s*x\b|\u043f\u043b\u0435\u0447|\u043b\u0435\u0432\u0435\u0440|\u6760\u6746)/iu;
const DECIBEL_PLACE_ORDER_RE = /(long|short|buy|sell|open\s+(?:a\s+)?(?:long|short|trade|position|order)|market order|limit order|\u043b\u043e\u043d\u0433|\u0448\u043e\u0440\u0442|\u043e\u0442\u043a\u0440|\u0432\u0456\u0434\u043a\u0440|\u043a\u0443\u043f|\u043f\u0440\u043e\u0434|\u5f00\u591a|\u5f00\u7a7a|\u4e70|\u5356|\u505a\u591a|\u505a\u7a7a)/iu;
const DECIBEL_NON_TRADE_SHORT_LONG_RE = /\b(?:short|long)\s+(?:answer|reply|message|sentence|text|summary|response)\b/iu;
const WORD_TAIL = '[\\p{L}\\p{M}\\p{N}_-]*';
const DECIBEL_AUTONOMOUS_ORDER_RE = new RegExp(`(?:\\b(?:open|place|make|start)\\s+(?:an?\\s+)?(?:(?:any|random|interesting|surprise|whatever|safe|conservative|low-risk|your\\s+choice)\\s+){0,3}(?:trade|position|order)\\b|\\b(?:surprise\\s+me|choose\\s+(?:yourself|for\\s+me)|your\\s+choice|pick\\s+(?:for\\s+me|one)|decide\\s+yourself)\\b|(?:\\u0441\\u0430\\u043c|\\u0441\\u0430\\u043c\\u0430).*(?:\\u0443\\u0433\\u043e\\u0434|\\u0441\\u0434\\u0435\\u043b|\\u0442\\u0440\\u0435\\u0439\\u0434|\\u043f\\u0440\\u0438\\u0434\\u0443\\u043c|\\u0432\\u0438\\u0431\\u0435\\u0440|\\u0432\\u044b\\u0431\\u0435\\u0440|\\u043e\\u0431\\u0435\\u0440)|(?:\\u0449\\u043e\\u0441\\u044c|\\u0447\\u0442\\u043e-\\u0442\\u043e|\\u044f\\u043a\\u0443\\u0441${WORD_TAIL}|\\u043a\\u0430\\u043a\\u0443\\u044e-\\u0442\\u043e).*(?:\\u0443\\u0433\\u043e\\u0434|\\u0441\\u0434\\u0435\\u043b|\\u0442\\u0440\\u0435\\u0439\\u0434|\\u0446\\u0456\\u043a\\u0430\\u0432|\\u0438\\u043d\\u0442\\u0435\\u0440\\u0435\\u0441\\u043d)|(?:\\u043e\\u0442\\u043a\\u0440|\\u0432\\u0456\\u0434\\u043a\\u0440).*(?:\\u043b\\u044e\\u0431|\\u0431\\u0443\\u0434\\u044c|\\u044f\\u043a\\u0443\\u0441${WORD_TAIL}|\\u0449\\u043e\\u0441\\u044c|\\u0447\\u0442\\u043e-\\u0442\\u043e).*(?:\\u0443\\u0433\\u043e\\u0434|\\u0441\\u0434\\u0435\\u043b|\\u0442\\u0440\\u0435\\u0439\\u0434|\\u043f\\u043e\\u0437))`, 'iu');
const DECIBEL_AUTONOMOUS_PICK_ORDER_RE = /\b(?:pick|choose)\s+(?:(?:any|random|safe|interesting|conservative|low-risk|risky|cool|fun|your\s+choice|avantis|decibel)\s+){0,6}(?:trade|position|order)\b/iu;
const DECIBEL_DELEGATED_DECISION_RE = new RegExp(`(?:\\u0442\\u0432\\u043e.{0,24}\\u043b\\u043e\\u0433|\\u0442\\u0432\\u043e.{0,24}\\u0440\\u043e\\u0437\\u0441\\u0443\\u0434|\\u0442\\u0432\\u043e.{0,24}\\u0432\\u044b\\u0431\\u043e\\u0440|\\u044f\\u043a\\u0443\\u0441${WORD_TAIL}.{0,24}\\u043f\\u043e\\u0437|\\u043a\\u0430\\u043a\\u0443\\u044e.{0,24}\\u043f\\u043e\\u0437|\\u0449\\u043e\\u0441${WORD_TAIL}.{0,32}(?:\\u043f\\u0440\\u0438\\u043a\\u043e\\u043b|\\u043f\\u0440\\u043a\\u0438\\u043e\\u043b|\\u0446\\u0456\\u043a\\u0430\\u0432)|\\u0447\\u0442\\u043e-\\u0442\\u043e.{0,32}(?:\\u0438\\u043d\\u0442\\u0435\\u0440\\u0435\\u0441|\\u043f\\u0440\\u0438\\u043a\\u043e\\u043b)|\\b(?:fun|cool|interesting)\\s+(?:trade|position|order)\\b)`, 'iu');
const DECIBEL_VOLATILE_ORDER_RE = new RegExp(`(?:\\b(?:open|place|make|start)\\b.{0,80}\\b(?:volatile|volatility|interesting|risky|higher\\s+volatility|more\\s+volatile)\\b|\\b(?:volatile|volatility|interesting|risky|higher\\s+volatility|more\\s+volatile)\\b.{0,80}\\b(?:trade|position|order)\\b|(?:\\u043e\\u0442\\u043a\\u0440|\\u0432\\u0456\\u0434\\u043a\\u0440).{0,80}(?:\\u0449\\u043e\\u0441\\u044c|\\u044f\\u043a\\u0443\\u0441${WORD_TAIL}).{0,80}(?:\\u0446\\u0456\\u043a\\u0430\\u0432|\\u0432\\u043e\\u043b\\u0430\\u0442|\\u043f\\u0440\\u0438\\u043a\\u043e\\u043b|\\u0438\\u043d\\u0442\\u0435\\u0440\\u0435\\u0441)|(?:\\u0431\\u0456\\u043b\\u044c\\u0448|\\u0431\\u043e\\u043b\\u044c\\u0448).{0,24}\\u0432\\u043e\\u043b\\u0430\\u0442)`, 'iu');
const DECIBEL_STABLE_SYMBOLS = new Set(['USD', 'USDC']);

function extractDecibelSymbol(message) {
  const raw = String(message || '').normalize('NFKC');
  if (DECIBEL_BTC_ALIAS_RE.test(raw)) return 'BTC';
  if (DECIBEL_SYMBOL_ALIAS_RE.test(raw)) return 'DOGE';
  const matches = raw.match(new RegExp(DECIBEL_SYMBOL_RE.source, 'ig')) || [];
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

function messageRequestsAllPositions(message) {
  const raw = String(message || '').normalize('NFKC').toLocaleLowerCase();
  return /\b(?:all|every|each|both|remaining|rest)\b.{0,50}\b(?:position|positions|trade|trades)\b/i.test(raw)
    || /\b(?:position|positions|trade|trades)\b.{0,50}\b(?:all|every|each|both|remaining|rest)\b/i.test(raw)
    || /(?:\u0432\u0441[\u0456\u0435\u044e\u044f]|\u0443\u0441[\u0456\u0435\u044e\u044f]|\u0432\u0441\u0435|\u043e\u0431\u0438\u0434\u0432|\u043e\u0441\u0442\u0430\u043d|\u0437\u0430\u043b\u0438\u0448).{0,50}(?:\u043f\u043e\u0437|\u0443\u0433\u043e\u0434|\u0441\u0434\u0435\u043b|trade)/iu.test(raw)
    || /(?:\u043f\u043e\u0437|\u0443\u0433\u043e\u0434|\u0441\u0434\u0435\u043b|trade).{0,50}(?:\u0432\u0441[\u0456\u0435\u044e\u044f]|\u0443\u0441[\u0456\u0435\u044e\u044f]|\u0432\u0441\u0435|\u043e\u0431\u0438\u0434\u0432|\u043e\u0441\u0442\u0430\u043d|\u0437\u0430\u043b\u0438\u0448)/iu.test(raw)
    || /(?:\u0434\u0440\u0443\u0433[\u0430\u0443\u0443\u044e\u043e\u0439]|\u0449\u0435\s+\u043e\u0434\u043d|another|second).{0,50}(?:\u043f\u043e\u0437|position|trade)/iu.test(raw);
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
  return DECIBEL_AUTONOMOUS_ORDER_RE.test(text)
    || DECIBEL_AUTONOMOUS_PICK_ORDER_RE.test(text)
    || DECIBEL_DELEGATED_DECISION_RE.test(text)
    || DECIBEL_VOLATILE_ORDER_RE.test(text);
}

function messageRequestsVolatileTrade(message) {
  const text = String(message || '').normalize('NFKC');
  return DECIBEL_VOLATILE_ORDER_RE.test(text)
    || /\b(?:volatile|volatility|interesting|risky|higher\s+volatility|more\s+volatile)\b/iu.test(text)
    || /(?:\u0446\u0456\u043a\u0430\u0432|\u0438\u043d\u0442\u0435\u0440\u0435\u0441|\u0432\u043e\u043b\u0430\u0442|\u043f\u0440\u0438\u043a\u043e\u043b)/iu.test(text);
}

function volatileTradeAvoidSymbols(message) {
  if (!messageRequestsVolatileTrade(message)) return [];
  const raw = String(message || '').normalize('NFKC');
  const out = new Set();
  if (/\bBTC\b/i.test(raw) || DECIBEL_BTC_ALIAS_RE.test(raw)) out.add('BTC');
  return [...out];
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
    case 'decibel_close_then_place_order':
      return {
        tools: ['decibel_close_position', 'decibel_place_order'],
        loop: 'Call decibel_close_position for the requested old position, then call decibel_place_order for the requested replacement trade. Do not stop after closing.',
        goal: 'Close an existing Decibel position and open the requested replacement trade.',
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

function avantisIntentLoop(kind, options = {}) {
  const delegatedChoice = !!options.delegatedChoice;
  const closeAll = !!options.closeAll;
  switch (kind) {
    case 'avantis_account':
      return {
        tools: ['avantis_get_account'],
        loop: 'avantis_get_account({ include_orders: true }) -> summarize self-custody wallet, balances, positions, and open orders',
        goal: 'Read the authenticated Avantis account through MCP tools.',
      };
    case 'avantis_markets':
      return {
        tools: ['avantis_get_markets'],
        loop: 'avantis_get_markets({}) -> summarize requested symbols, mark prices, and constraints',
        goal: 'Read Avantis market data through MCP tools.',
      };
    case 'avantis_close_position':
      return {
        tools: ['avantis_get_positions', 'avantis_close_position'],
        loop: closeAll
          ? 'avantis_get_positions({ include_orders: true }) -> avantis_close_position({ all: true, percent: 100 }) -> tell the player naturally that the Avantis close actions are prepared and signing is starting for every matching position'
          : 'avantis_get_positions({ include_orders: true }) -> identify exact browser-wallet position -> avantis_close_position({ symbol? or pair_index/trade_index }) -> tell the player naturally that the Avantis close action is prepared and signing is starting',
        goal: closeAll
          ? 'Prepare browser-signed Avantis close actions for all/remaining positions.'
          : 'Prepare a browser-signed Avantis close/reduce action.',
      };
    case 'avantis_close_then_place_order':
      return {
        tools: delegatedChoice
          ? ['avantis_get_positions', 'avantis_close_position', 'avantis_market_scan', 'avantis_place_order']
          : ['avantis_get_positions', 'avantis_close_position', 'avantis_place_order'],
        loop: delegatedChoice
          ? 'avantis_get_positions({ include_orders: true }) -> avantis_close_position({ symbol? or pair_index/trade_index }) -> after that close browser action confirms, scan volatile crypto/token markets with avantis_market_scan and call avantis_place_order for the replacement. Do not stop after the close.'
          : 'avantis_get_positions({ include_orders: true }) -> avantis_close_position({ symbol? or pair_index/trade_index }) -> after that close browser action confirms, call avantis_place_order for the requested replacement. Do not stop after the close.',
        goal: 'Close an Avantis position and open the requested replacement trade after the close confirms in the browser.',
      };
    case 'avantis_cancel_order':
      return {
        tools: ['avantis_get_positions', 'avantis_cancel_order'],
        loop: 'avantis_get_positions({ include_orders: true }) -> identify exact browser-wallet order -> avantis_cancel_order({ pair_index, trade_index }) -> tell the player naturally that the Avantis cancel action is prepared and signing is starting',
        goal: 'Prepare a browser-signed Avantis cancel action.',
      };
    case 'avantis_tpsl':
      return {
        tools: ['avantis_get_positions', 'avantis_set_tpsl'],
        loop: 'avantis_get_positions({ include_orders: true }) -> identify exact browser-wallet position -> avantis_set_tpsl({ take_profit?, stop_loss? }) -> tell the player naturally that the Avantis TP/SL action is prepared and signing is starting',
        goal: 'Prepare a browser-signed Avantis take-profit or stop-loss update.',
      };
    case 'avantis_leverage':
      return {
        tools: ['avantis_get_positions'],
        loop: 'avantis_get_positions({ include_orders: true }) -> explain that Avantis leverage is chosen when opening a trade, not changed account-wide after the fact',
        goal: 'Handle an Avantis leverage request without pretending an unsupported leverage change happened.',
      };
    case 'avantis_place_order':
    default:
      return {
        tools: delegatedChoice ? ['avantis_market_scan', 'avantis_place_order'] : ['avantis_place_order'],
        loop: delegatedChoice
          ? 'avantis_market_scan({ limit: 120, chart_limit: 40, lookback_hours: 24 }) -> choose a ranked crypto/token candidate and suggested side -> avantis_place_order({ symbol, side, collateral_pct/collateral_usd, leverage/use_max_leverage, auto_select: true }) -> answer naturally that the Avantis order is prepared and signing is starting'
          : 'If symbol, side, and size/notional/collateral are clear, call avantis_place_order once with leverage included if specified. Do not infer minimum-size, balance, or wallet blockers from memory; only report blockers returned by the tool. The tool prepares a browser-signed action; do not claim the trade is open until the browser wallet submits it.',
        goal: 'Prepare a browser-signed Avantis long/short order.',
      };
  }
}

function classifyDecibelTradingIntent(message, normalizedText) {
  const raw = String(message || '').normalize('NFKC');
  const text = normalizedText || normalizeIntentText(raw);
  const tradeText = text.replace(/\bbalanced\b/giu, '').trim();
  const autonomousOrder = isAutonomousDecibelOrder(raw);
  const wantsBalanceAccountRead = /(balance|equity|account|wallet|overview|\u0431\u0430\u043b\u0430\u043d\u0441|\u0433\u0430\u043c\u0430\u043d|\u043a\u043e\u0448\u0435\u043b|\u8d26\u6237|\u5e73\u8861)/iu.test(tradeText);
  const wantsPositionRead = DECIBEL_POSITION_READ_RE.test(tradeText)
    || DECIBEL_ORDER_READ_RE.test(tradeText)
    || /\bpnl\b|profit|loss|\u76c8\u4e8f/iu.test(tradeText);
  const hasTradingWord = DECIBEL_TRADING_WORD_RE.test(tradeText)
    || DECIBEL_MARKET_RE.test(tradeText)
    || DECIBEL_ACCOUNT_RE.test(tradeText)
    || DECIBEL_POSITION_READ_RE.test(tradeText)
    || DECIBEL_ORDER_READ_RE.test(tradeText)
    || DECIBEL_CLOSE_RE.test(tradeText)
    || DECIBEL_CANCEL_RE.test(tradeText)
    || DECIBEL_TPSL_RE.test(tradeText)
    || DECIBEL_LEVERAGE_RE.test(tradeText)
    || DECIBEL_PLACE_ORDER_RE.test(tradeText);
  const hasSymbol = DECIBEL_SYMBOL_RE.test(raw) || DECIBEL_SYMBOL_ALIAS_RE.test(raw);
  if (/(build order|building order|base build order)/i.test(raw)) return null;
  if (!hasSymbol && !autonomousOrder && DECIBEL_NON_TRADE_SHORT_LONG_RE.test(tradeText)) return null;
  if (!autonomousOrder && !hasTradingWord && !(/decibel/i.test(raw) || (hasSymbol && (/\d/.test(raw) || DECIBEL_MARKET_RE.test(tradeText))))) {
    return null;
  }
  if (!autonomousOrder && !hasSymbol && !/(decibel|avantis|\baccount\b|\bposition\b|\bpositions\b|\border\b|\borders\b|\bbalance\b|\bequity\b|\bpnl\b|\btrade\b|\btrading\b|\blong\b|\bshort\b|\bbuy\b|\bsell\b|\bclose\b|\bcancel\b|\bleverage\b|\btp\b|\bsl\b|\u0442\u043f|\u0441\u043b|\u0442\u0435\u0439\u043a|\u043f\u0440\u043e\u0444|\u043f\u0440\u0438\u0431\u0443\u0442|\u0441\u0442\u043e\u043f|\u043b\u043e\u0441|\u043f\u043e\u0437\u0438\u0446|\u043e\u0440\u0434\u0435\u0440|\u0443\u0433\u043e\u0434|\u0431\u0430\u043b\u0430\u043d\u0441|\u043b\u043e\u043d\u0433|\u0448\u043e\u0440\u0442|\u043f\u043b\u0435\u0447|\u0437\u0430\u043a\u0440|\u0432\u0456\u0434\u043a\u0440|\u043e\u0442\u043a\u0440|\u4ed3|\u8ba2\u5355|\u6760\u6746|\u4ef7\u683c)/iu.test(tradeText)) {
    return null;
  }

  let kind = 'decibel_place_order';
  const wantsPlaceOrder = (DECIBEL_PLACE_ORDER_RE.test(tradeText) || autonomousOrder) && !DECIBEL_ORDER_READ_RE.test(tradeText);
  const wantsClose = DECIBEL_CLOSE_RE.test(tradeText);
  if (DECIBEL_ACCOUNT_RE.test(tradeText)) {
    kind = 'decibel_account';
  }
  if (DECIBEL_POSITION_READ_RE.test(tradeText) || DECIBEL_ORDER_READ_RE.test(tradeText)) {
    kind = 'decibel_account';
  }
  if (DECIBEL_MARKET_RE.test(tradeText)) {
    kind = 'decibel_markets';
  }
  if (wantsPlaceOrder) {
    kind = 'decibel_place_order';
  }
  if (wantsClose && wantsPlaceOrder) {
    kind = 'decibel_close_then_place_order';
  } else if (wantsClose) {
    kind = 'decibel_close_position';
  }
  if (DECIBEL_CANCEL_RE.test(tradeText)) {
    kind = 'decibel_cancel_order';
  }
  if (DECIBEL_TPSL_RE.test(tradeText)) {
    kind = 'decibel_tpsl';
  }
  if (DECIBEL_LEVERAGE_RE.test(tradeText) && !wantsPlaceOrder && kind === 'decibel_place_order') {
    kind = 'decibel_leverage';
  }

  const mapped = decibelIntentLoop(kind);
  const closeAllPositions = kind === 'decibel_close_position' && messageRequestsAllPositions(message);
  return {
    kind,
    delegated_choice: autonomousOrder,
    close_all_positions: closeAllPositions,
    action_required: kind !== 'decibel_markets' && kind !== 'decibel_account' ? true : true,
    goal: mapped.goal,
    required_loop: mapped.loop,
    expected_tools: mapped.tools,
    balance_account_read: wantsBalanceAccountRead,
    position_read: wantsPositionRead,
  };
}

function tradingDexForMessage(message, player = {}) {
  const raw = String(message || '').normalize('NFKC');
  if (/\bavantis\b/i.test(raw)) return 'avantis';
  if (/\bdecibel\b/i.test(raw)) return 'decibel';
  const dex = String(player?.dex || '').toLowerCase();
  if (dex === 'avantis') return 'avantis';
  return 'decibel';
}

function remapTradingIntentForDex(intent, dex) {
  if (!intent || dex !== 'avantis') return intent;
  if (intent.kind === 'decibel_account' && intent.position_read && !intent.balance_account_read) {
    return {
      ...intent,
      kind: 'avantis_account',
      goal: 'Read Avantis positions, open orders, and position PnL through MCP tools.',
      required_loop: 'avantis_get_positions({ include_orders: true }) -> summarize Avantis positions, open orders, and PnL',
      expected_tools: ['avantis_get_positions'],
    };
  }
  const suffixByKind = {
    decibel_account: 'account',
    decibel_markets: 'markets',
    decibel_place_order: 'place_order',
    decibel_close_then_place_order: 'close_then_place_order',
    decibel_close_position: 'close_position',
    decibel_cancel_order: 'cancel_order',
    decibel_tpsl: 'tpsl',
    decibel_leverage: 'leverage',
  };
  const suffix = suffixByKind[intent.kind] || 'place_order';
  const kind = `avantis_${suffix}`;
  const mapped = avantisIntentLoop(kind, {
    delegatedChoice: !!intent.delegated_choice,
    closeAll: !!intent.close_all_positions,
  });
  return {
    ...intent,
    kind,
    goal: mapped.goal,
    required_loop: mapped.loop,
    expected_tools: mapped.tools,
  };
}

function classifyTradingIntent(message, normalizedText, player = {}) {
  const intent = classifyDecibelTradingIntent(message, normalizedText);
  if (!intent) return null;
  return remapTradingIntentForDex(intent, tradingDexForMessage(message, player));
}

function classifyGameIntent(message, player = {}) {
  const text = normalizeIntentText(message);
  if (!text) return { kind: 'general', action_required: false };
  if (/(hermes\s+job|scheduled|schedule|watcher|watch\s+|monitor|cron|rsi|macd|volume|індикатор|монітор|спостеріг|крон|джоб|задач|робот)/i.test(text)
    && /(hermes\s+job|jobs?|decibel|trade|trading|buy|sell|long|short|price|market|rsi|macd|volume|торг|куп|прод|лонг|шорт|ціна|цена|ринок|об.?єм|объем|робот|задач|джоб|watcher|monitor|cron)/i.test(text)) {
    const lower = text.toLowerCase();
    if (/(list|show|active|history|runs|статус|актив|спис|покажи|істор|истор)/i.test(text)) {
      return {
        kind: 'hermes_job_list',
        action_required: true,
        goal: 'Show the player scheduled Hermes Decibel jobs through MCP tools.',
        required_loop: 'hermes_job_list -> summarize active jobs, next run, and last result',
        expected_tools: ['hermes_job_list'],
      };
    }
    if (/(pause|stop|disable|пауза|зупин|останов|вимк|выключ)/i.test(text)) {
      return {
        kind: 'hermes_job_pause',
        action_required: true,
        goal: 'Pause or stop the requested scheduled Hermes job through MCP tools.',
        required_loop: 'hermes_job_list -> hermes_job_pause or hermes_job_delete -> summarize',
        expected_tools: ['hermes_job_list', 'hermes_job_pause'],
      };
    }
    if (/(resume|enable|start|увімк|включ|продовж|возобнов)/i.test(text)) {
      return {
        kind: 'hermes_job_resume',
        action_required: true,
        goal: 'Resume the requested scheduled Hermes job through MCP tools.',
        required_loop: 'hermes_job_list -> hermes_job_resume -> summarize',
        expected_tools: ['hermes_job_list', 'hermes_job_resume'],
      };
    }
    const runNow = /\b(?:run|check|execute|scan)\b.*\b(?:now|right now)\b/i.test(text)
      || /запусти.*зараз|перевір.*зараз|прямо зараз|проверь.*сейчас/i.test(text);
    return {
      kind: runNow ? 'hermes_job_run_now' : 'hermes_job_create',
      action_required: true,
      goal: 'Create or manage a scheduled Hermes Decibel monitoring job through MCP tools.',
      required_loop: runNow
        ? 'hermes_job_list -> hermes_job_run_now -> summarize queued run status'
        : 'hermes_job_create_draft or hermes_job_update -> summarize the schedule, mode, symbols, and risk limits',
      expected_tools: runNow ? ['hermes_job_list', 'hermes_job_run_now'] : ['hermes_job_create_draft'],
    };
  }
  const tradingIntent = classifyTradingIntent(message, text, player);
  if (tradingIntent) return tradingIntent;
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
        ? `get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ target_player_name: "${targetPlayerName}", auto_tactics: true }) -> if shielded, naturally say the target is under shield and include remaining shield hours; otherwise summarize result and losses`
        : 'get_base_state -> ensure at least 3 loaded troops by reinforcing/loading if needed -> execute_ai_attack_plan({ auto_tactics: true }) -> summarize result and losses',
    };
  }
  if (/(збери|собери|collect|收集|thu thap).*(ресурс|реси|resources|\bres\b|资源|tai nguyen)|(?:ресурс|реси|resources|\bres\b|资源|tai nguyen).*(збери|собери|collect|收集|thu thap)/i.test(text)) {
    return {
      kind: 'collect_resources',
      action_required: true,
      goal: 'Collect available game resources only through MCP tools.',
      required_loop: 'get_base_state -> collect_resources({}) -> summarize collected resources',
      expected_tools: ['get_base_state', 'collect_resources'],
    };
  }
  if (/(build|place|set up|setup|розстав|побуд|постав|建造|布置|xay).*(base|баз|基地|can cu)|(?:base|баз|基地|can cu).*(build|place|set up|setup|розстав|побуд|постав|建造|布置|xay)/i.test(text)) {
    return {
      kind: 'auto_build_base',
      action_required: true,
      goal: 'Autonomously build and arrange the player base through MCP tools without asking for grids or a building list.',
      required_loop: 'get_base_state -> auto_build_base({ focus: "balanced" }) -> summarize built buildings and blockers',
      expected_tools: ['get_base_state', 'auto_build_base'],
    };
  }
  if (/(побуд|постав|build|place|shop|магазин|archer tower|tower|порт|port|будів|building|建造|建筑|商店|港口|塔|xay)/i.test(text)) {
    return {
      kind: 'build',
      action_required: true,
      goal: 'Place a valid building using catalog and build-slot tools.',
      required_loop: 'get_base_state -> if broad base setup use auto_build_base; otherwise get_building_catalog if needed -> find_build_slots -> place_building -> summarize result',
      expected_tools: ['get_base_state', 'get_building_catalog', 'find_build_slots', 'place_building'],
    };
  }
  if (/(апгрейд|апгрейдни|upgrade|level|lvl|прокач|качн|улучш|покращ|апни|апгрейд|рівень|уровень|升级|nang cap)/iu.test(text)) {
    return {
      kind: 'upgrade',
      action_required: true,
      goal: 'Upgrade the requested building or troop using MCP tools.',
      required_loop: 'get_base_state -> identify exact id/type -> upgrade_building or upgrade_troop -> summarize result',
      expected_tools: ['get_base_state', 'upgrade_building', 'upgrade_troop'],
    };
  }
  if (/(кораб|ship|troop|військ|войск|load|reinforce|віднов|восстанов|船|部队|增援|tau|quan)/i.test(text)) {
    const expected = ['get_base_state'];
    if (/(кораб|ship|troop|військ|войск|load|船|部队|tau|quan)/i.test(text)) expected.push('load_ship_troop');
    if (/(reinforce|віднов|восстанов|增援)/i.test(text)) expected.push('reinforce_ships');
    return {
      kind: 'fleet',
      action_required: true,
      goal: 'Manage ships, troops, loadouts, or reinforcements through MCP tools.',
      required_loop: 'get_base_state -> choose valid port/ship/troop ids -> use the relevant ship/troop MCP tool -> summarize result',
      expected_tools: expected,
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

const SETUP_ONLY_MCP_TOOLS = new Set([
  'get_base_state',
  'get_building_catalog',
  'find_build_slots',
  'decibel_get_positions',
  'avantis_get_positions',
]);

function terminalToolGroupsForIntent(intent = {}) {
  const expectedTools = Array.isArray(intent?.expected_tools)
    ? intent.expected_tools.map((tool) => String(tool || '').trim()).filter(Boolean)
    : [];
  if (!expectedTools.length) return [];
  if (expectedTools.includes('upgrade_building') && expectedTools.includes('upgrade_troop')) {
    return [['upgrade_building', 'upgrade_troop']];
  }
  const terminalTools = expectedTools.filter((tool) => !SETUP_ONLY_MCP_TOOLS.has(tool));
  if (terminalTools.length > 1) return terminalTools.map((tool) => [tool]);
  return [[terminalTools[0] || expectedTools[expectedTools.length - 1]]];
}

function terminalToolGroupsSatisfied(usedTools = [], groups = []) {
  const used = new Set((Array.isArray(usedTools) ? usedTools : [])
    .map((tool) => String(tool || '').trim())
    .filter(Boolean));
  return groups.every((group) => group.some((tool) => used.has(tool)));
}

function responseLooksLikeClarificationOrBlocker(text) {
  const value = String(text || '').trim();
  return /(\?|please confirm|confirm|specify|which|what is|need:|blocked|error|cannot|can['’`]?t|could not|not enough|not opened|not executed|below .*minimum|minimum .*position|increase .*amount|under shield|shielded|no open .*found|no open .*to|multiple open|try again|уточн|підтверд|подтверд|потрібн|нужно|какой|який|не можу|не могу|неможливо|невозможно|не вистач|недостат|не відкрит|не открыт|не викон|не выполн|під щитом|под щитом)/iu.test(value);
}

function responseClaimsActionSucceeded(responseText, intent = {}) {
  const text = String(responseText || '').trim();
  if (!text) return false;
  if (/^(?:Done|Success|Completed)\s*:/i.test(text)) return true;

  const blocker = responseLooksLikeClarificationOrBlocker(text);
  const success = /(opened|placed|closed|reduced|set|updated|changed|cancelled|canceled|collected|built|arranged|upgraded|loaded|reinforced|attacked|won|confirmed|submitted|executed|готово|відкрит|открит|розміщ|размещ|закрит|закрыт|зменш|уменьш|встанов|установ|оновл|обновл|змін|измен|скас|отмен|зібран|собран|побуд|постро|розстав|расстав|постав|прокач|покращ|улучш|завантаж|загруж|підсил|усил|атак|перемог|побед|підтвердж|подтверж)/iu.test(text);
  const progressiveAction = /(loading troops|collecting resources|starting to build|opening|placing|closing|setting|cancelling|canceling|upgrading|reinforcing|починаю|начинаю|відкриваю|открываю|закриваю|закрываю|ставлю|скасовую|отменяю|збираю|собираю|завантажую|загружаю)/iu.test(text);

  if (!success && !progressiveAction) return false;
  if (blocker) return false;
  return true;
}

function extractRequestedBalancePctHint(message) {
  const raw = String(message || '').normalize('NFKC');
  const explicitPct = raw.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:of|from|від|от)?\s*(?:(?:my|мого|моего|мій|мой|моїх|моих)\s+)?(?:balance|wallet|баланс|балансу|кошт|грош|средств)/iu);
  if (explicitPct) {
    const value = Number(String(explicitPct[1]).replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return Math.max(0.01, Math.min(100, value));
  }
  const allFunds = /\b(all|everything|full\s+balance|max(?:imum)?\s+(?:balance|funds|money))\b|на\s+(?:всі|усі)\s+гроші|на\s+весь\s+баланс|весь\s+баланс|усі\s+гроші|всі\s+гроші|все/i.test(raw);
  return allFunds ? 100 : null;
}

function extractRequestedLeverageHint(message) {
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
    const value = Number(String(match?.[1] || '').replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return Math.max(1, Math.min(1000, value));
  }
  return null;
}

function extractRequestedTpslPnlPctHint(message) {
  const raw = String(message || '').normalize('NFKC');
  const percentMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*%/u);
  const value = Number(String(percentMatch?.[1] || '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const hasTakeProfit = /(take\s*profit|\btp\b|(?:^|[^\p{L}\p{N}_])\u0442\u043f(?:$|[^\p{L}\p{N}_])|\u0442\u0435\u0439\u043a|\u043f\u0440\u043e\u0444|\u043f\u0440\u0438\u0431\u0443\u0442|profit)/iu.test(raw);
  const hasStopLoss = /(stop\s*loss|\bsl\b|(?:^|[^\p{L}\p{N}_])\u0441\u043b(?:$|[^\p{L}\p{N}_])|\u0441\u0442\u043e\u043f|\u043b\u043e\u0441|\u0437\u0431\u0438\u0442|loss)/iu.test(raw);
  if (!hasTakeProfit && !hasStopLoss) return null;
  const out = {};
  if (hasTakeProfit) out.take_profit_pnl_pct = Math.max(0.01, Math.min(10000, value));
  if (hasStopLoss && !hasTakeProfit) out.stop_loss_pnl_pct = Math.max(0.01, Math.min(10000, value));
  return out;
}

function buildTradingPhraseHints(message, intent = {}) {
  const kind = String(intent?.kind || '');
  const isPlaceLike = kind === 'avantis_place_order'
    || kind === 'decibel_place_order'
    || kind === 'avantis_close_then_place_order'
    || kind === 'decibel_close_then_place_order';
  const isTpsl = kind === 'avantis_tpsl' || kind === 'decibel_tpsl';
  if (!isPlaceLike && !isTpsl) return '';
  const raw = String(message || '').normalize('NFKC');
  const lower = raw.toLocaleLowerCase();
  const hints = [];
  const allFunds = /\b(all|everything|full\s+balance|max(?:imum)?\s+(?:balance|funds|money))\b|на\s+(?:всі|усі)\s+гроші|на\s+весь\s+баланс|весь\s+баланс|усі\s+гроші|всі\s+гроші|все/i.test(raw);
  const maxLeverage = /\bmax(?:imum)?\s+(?:allowed\s+)?leverage\b|\bhighest\s+leverage\b/i.test(lower)
    || /(?:макс(?:имальн[\p{L}\p{M}]*)?|найбільш[\p{L}\p{M}]*|сам(?:ое|ый|ая)[\p{L}\p{M}]*)[\s\S]{0,40}плеч/iu.test(lower)
    || /плеч[\s\S]{0,40}(?:макс(?:имальн[\p{L}\p{M}]*)?|найбільш[\p{L}\p{M}]*|сам(?:ое|ый|ая)[\p{L}\p{M}]*)/iu.test(lower)
    || /(?:до?зв|довз)олен[\p{L}\p{M}]*[\s\S]{0,24}плеч/iu.test(lower);
  const requestedPct = extractRequestedBalancePctHint(raw);
  const requestedLeverage = extractRequestedLeverageHint(raw);
  if (requestedPct != null) {
    const tool = kind.startsWith('avantis_') ? 'avantis_place_order' : 'decibel_place_order';
    hints.push(`The current player message asks to use ${requestedPct}% of the wallet balance. For ${tool}, pass collateral_pct: ${requestedPct}; do not convert it to a stale dollar amount.`);
  }
  if (requestedLeverage != null) {
    hints.push(`The current player message specifies ${requestedLeverage}x leverage. Pass leverage: ${requestedLeverage}; do not replace it with a lower conservative default.`);
  }
  if (allFunds) {
    const tool = kind.startsWith('avantis_') ? 'avantis_place_order' : 'decibel_place_order';
    hints.push(`The current player message asks to use all available funds. For ${tool}, pass collateral_pct: 100 instead of guessing a stale dollar amount from chat history.`);
  }
  if (maxLeverage) {
    if (kind.startsWith('avantis_')) {
      hints.push(`The current player message asks for maximum allowed leverage. For Avantis, pass use_max_leverage: true, or use leverage ${AVANTIS_AI_MAX_LEVERAGE_HINT}x if you need a numeric value. Do not reuse old 20x policy blockers from chat history.`);
    } else {
      hints.push('The current player message asks for maximum allowed leverage. Resolve the market cap with decibel_get_markets if needed, then place the order with that leverage.');
    }
  }
  if (messageRequestsVolatileTrade(raw) && kind.startsWith('avantis_')) {
    const avoid = volatileTradeAvoidSymbols(raw);
    hints.push([
      'The current player message asks for an interesting / higher-volatility Avantis replacement trade.',
      'Use avantis_market_scan before avantis_place_order.',
      'For avantis_place_order, pass auto_select: true and prefer_volatile: true.',
      avoid.length ? `Also pass avoid_symbols: ${JSON.stringify(avoid)} and do not reopen those symbols unless every other valid crypto/token market is blocked.` : '',
      'Prefer crypto/token markets with higher volatility_hourly_pct and strong absolute signal_score; do not default to BTC for "interesting" or "volatile".',
    ].filter(Boolean).join(' '));
  }
  if (isTpsl) {
    const tpslPct = extractRequestedTpslPnlPctHint(raw);
    if (tpslPct?.take_profit_pnl_pct && kind.startsWith('avantis_')) {
      hints.push(`The current player message asks for take-profit at ${tpslPct.take_profit_pnl_pct}% profit on the position/collateral, not a ${tpslPct.take_profit_pnl_pct}% raw price move. For avantis_set_tpsl, pass take_profit_pnl_pct: ${tpslPct.take_profit_pnl_pct}; MCP will compute the exact TP price from the current position entry, side, and leverage.`);
    } else if (tpslPct?.take_profit_pnl_pct) {
      hints.push(`The current player message asks for take-profit at ${tpslPct.take_profit_pnl_pct}% profit on the position/collateral. Convert it from the current position entry and leverage before calling the TP/SL tool; do not treat it as a raw price-percent move.`);
    }
    if (tpslPct?.stop_loss_pnl_pct && kind.startsWith('avantis_')) {
      hints.push(`The current player message asks for stop-loss at ${tpslPct.stop_loss_pnl_pct}% loss on the position/collateral. For avantis_set_tpsl, pass stop_loss_pnl_pct: ${tpslPct.stop_loss_pnl_pct}; MCP will compute the exact SL price from the current position entry, side, and leverage.`);
    }
  }
  return hints.length ? hints.join('\n') : '';
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
    const terminalGroups = terminalToolGroupsForIntent(intent)
      .map((group) => group.join(' or '))
      .join(' AND ');
    if (terminalGroups) {
      lines.push(`Required terminal action tool before final success answer: ${terminalGroups}.`);
    }
  }
  if (intent.kind === 'decibel_place_order' || intent.kind === 'avantis_place_order') {
    lines.push('Amount parsing: $/USD/USDC/dollars/бакс means collateral_usd by default; "notional 50" means notional_usd; "size 0.2" means size_base; "all money/all balance/max funds" means collateral_pct: 100. Do not ask for confirmation for these normal forms.');
  }
  if (intent.kind === 'avantis_place_order' && intent.delegated_choice) {
    lines.push('The player delegated symbol/side choice for this Avantis order. Do not ask which symbol or direction. Use avantis_market_scan, choose a ranked crypto/token candidate and suggested side from chart signals, then call avantis_place_order. If explicit leverage is present, choose only a market whose max_leverage is at least that leverage. Do not choose FX/equity/commodity markets unless explicitly named.');
  }
  if (intent.kind === 'avantis_close_then_place_order') {
    lines.push('The player asked for two actions: close an existing Avantis position, then open a replacement trade. Do not stop after preparing the close. If the replacement depends on collateral released by the close, prepare the close first; the browser can continue the replacement after the close transaction confirms.');
  }
  if (intent.kind === 'avantis_close_position' && intent.close_all_positions) {
    lines.push('The player asked to close all/remaining positions. After reading positions, call avantis_close_position({ all: true, percent: 100 }). Do not close only the first matching position.');
  }
  if (intent.kind === 'avantis_leverage') {
    lines.push('For Avantis leverage-change requests, do not ask whether the player means a new position or an existing one. Call avantis_get_positions, then explain that Avantis leverage is chosen when opening a trade and cannot be changed account-wide after the fact.');
  }
  if (intent.kind === 'avantis_tpsl') {
    lines.push('For TP/SL percentages like "TP at 20% profit" or Ukrainian/Russian equivalents, pass take_profit_pnl_pct or stop_loss_pnl_pct to avantis_set_tpsl. Do not turn 20% profit into a 20% raw price move; MCP computes the price using position entry, side, and leverage.');
  }
  if (String(intent.kind || '').startsWith('avantis_')) {
    lines.push('Avantis writes are browser-signed: the MCP write tool only prepares a browser_action. Final on-chain submission happens in the player browser via Smart Wallet auto-signing when enabled, or external wallet prompt otherwise. Answer naturally that the action is prepared and signing is starting; avoid rigid status templates, do not say "confirm the prompt", and do not say opened/closed/updated unless a browser result is explicitly present.');
  }
  if (intent.action_required) {
    lines.push(
      'This is a real game-action request. Do not answer with only advice.',
      'Use Clash MCP tools before the final answer. Never claim an action happened unless the tool result confirms it.',
      'Do not infer blockers such as minimum size, insufficient balance, cooldowns, or shields from memory or model knowledge. Call the relevant MCP tool and report the blocker only if the tool returns it.',
      'If Expected MCP tools include read tools before a write/action tool, do not stop after the read tool. Continue until the terminal action tool succeeds or blocks.',
      `Required loop: ${intent.required_loop}`,
      'If a tool blocks the action, stop and report the exact blocker naturally in the player language when possible.'
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

function buildInstructionsForMessage(message, player = {}) {
  const intent = classifyGameIntent(message, player);
  const intentInstructions = buildIntentInstructions(intent);
  const phraseHints = buildTradingPhraseHints(message, intent);
  const runtimeInstructions = buildRuntimeInstructions('', player?.dex || '');
  const requestHints = phraseHints ? `## Current Request Parsing Hints\n${phraseHints}` : '';
  return {
    intent,
    instructions: [runtimeInstructions, intentInstructions, requestHints].filter(Boolean).join('\n\n'),
  };
}

async function request(path, options = {}) {
  assertConfigured();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const method = options.method || 'GET';
    let finalRes = null;
    let finalJson = null;
    let finalText = '';
    let url = '';
    let lastNetworkError = null;
    const baseUrls = orchestratorBaseUrls();
    for (const baseUrl of baseUrls) {
      url = `${baseUrl}${path}`;
      const attempts = ORCHESTRATOR_NETWORK_RETRIES + 1;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const res = await fetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${ORCHESTRATOR_TOKEN}`,
              'Content-Type': 'application/json',
              ...(options.headers || {}),
            },
            body: options.body == null ? undefined : JSON.stringify(options.body),
            signal: controller.signal,
          });
          const text = await res.text();
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          if (baseUrl !== ORCHESTRATOR_URL) {
            logHermesClient('request_wsl_endpoint_ok', { method, path, base_url: baseUrl });
          }
          if (!res.ok && shouldTryNextOrchestrator(baseUrl, res.status, json, text)) {
            markBaseUrlUnhealthy(baseUrl, json?.error || json?.message || text || `HTTP ${res.status}`);
            logHermesClient('request_try_next_endpoint', {
              method,
              path,
              base_url: baseUrl,
              status: res.status,
              error: String(json?.error || json?.message || text || '').slice(0, 300),
            });
            continue;
          }
          finalRes = res;
          finalJson = json;
          finalText = text;
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
            attempt,
            attempts,
            duration_ms: Date.now() - startedAt,
            error: detail,
          });
          if (attempt < attempts && err?.name !== 'AbortError' && !controller.signal.aborted) {
            const retryDelay = Math.min(5000, ORCHESTRATOR_NETWORK_RETRY_DELAY_MS * attempt);
            logHermesClient('request_network_retry', {
              method,
              path,
              base_url: baseUrl,
              next_attempt: attempt + 1,
              attempts,
              retry_delay_ms: retryDelay,
              error: detail,
            });
            await sleep(retryDelay);
            continue;
          }
        }
        break;
      }
      if (finalRes) {
        break;
      }
    }
    if (!finalRes) {
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
    logHermesClient('request_done', {
      method,
      path,
      status: finalRes.status,
      ok: finalRes.ok,
      duration_ms: Date.now() - startedAt,
      response_bytes: finalText.length,
    });
    if (!finalRes.ok) {
      const err = new Error(finalJson?.error || finalJson?.message || `Hermes orchestrator HTTP ${finalRes.status}`);
      err.status = finalRes.status;
      err.body = finalJson;
      throw err;
    }
    return finalJson;
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
      dex: safePlayer.dex,
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
  const requestContext = buildInstructionsForMessage(message, safePlayer);
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
      delete_recent_memory: !!options.delete_recent_memory,
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
  terminalToolGroupsForIntent,
  terminalToolGroupsSatisfied,
  responseClaimsActionSucceeded,
};
