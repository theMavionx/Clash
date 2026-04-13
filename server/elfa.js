// Elfa AI client — social intelligence for crypto (mentions, sentiment, trends).
// When ELFA_API_KEY is unset, all functions return stub data so the UI works in dev.

const ELFA_BASE = 'https://api.elfa.ai/v2';

function apiKey() { return process.env.ELFA_API_KEY || null; }
function hasKey() { return !!apiKey(); }

// ---------- Cache ----------
const cache = new Map();
function cacheGet(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (v.expiresAt < Date.now()) { cache.delete(key); return null; }
  return v.data;
}
function cacheSet(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
// Cap cache size to prevent unbounded growth
setInterval(() => {
  if (cache.size < 500) return;
  const now = Date.now();
  for (const [k, v] of cache) if (v.expiresAt < now) cache.delete(k);
}, 5 * 60 * 1000);

// ---------- HTTP ----------
async function fetchElfa(path, params = {}, opts = {}) {
  if (!hasKey()) return null;
  const url = new URL(ELFA_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
    const r = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'x-elfa-api-key': apiKey(), 'Accept': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      console.warn(`[elfa] ${path} → ${r.status}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.warn(`[elfa] ${path} error: ${e.message}`);
    return null;
  }
}

// ---------- Stubs (when no API key) ----------
// Stub rows use the same schema as the real trending-tokens endpoint
const STUB_TRENDING = [
  { token: 'btc',   current_count: 523, previous_count: 401, change_percent: 30.4 },
  { token: 'eth',   current_count: 215, previous_count: 187, change_percent: 14.9 },
  { token: 'sol',   current_count:  96, previous_count:  87, change_percent: 10.3 },
  { token: 'trump', current_count:  43, previous_count:  24, change_percent: 79.1 },
  { token: 'doge',  current_count:  24, previous_count:  24, change_percent:  0.0 },
  { token: 'hype',  current_count:  82, previous_count: 109, change_percent:-24.7 },
  { token: 'pump',  current_count:  18, previous_count:  10, change_percent: 80.0 },
];

// Badges derived from mention volume + velocity (sentiment unavailable on this endpoint).
function classifySignal(t) {
  const cur = Number(t.current_count || 0);
  const prev = Number(t.previous_count || 0);
  const chg = Number(t.change_percent || 0);
  let badge = '·', label = '';
  if (chg >= 50 && cur >= 20) { badge = '🔥'; label = `+${Math.round(chg)}%`; }
  else if (chg >= 20 && cur >= 5) { badge = '📈'; label = `+${Math.round(chg)}%`; }
  else if (chg <= -30) { badge = '📉'; label = `${Math.round(chg)}%`; }
  else if (cur <= 3) { badge = '💀'; label = 'quiet'; }
  return {
    badge, label,
    mentions: cur,
    previous: prev,
    change_percent: Number(chg.toFixed(1)),
  };
}

// ---------- Public API ----------

// Returns a symbol→signal map. TTL = 1 hour.
async function getAllSignals() {
  const cached = cacheGet('signals:all');
  if (cached) return { signals: cached, cached: true };

  let tokens = null;
  if (hasKey()) {
    // Real endpoint returns { data: { data: [...] } } — two levels deep
    const j = await fetchElfa('/aggregations/trending-tokens', { timeWindow: '24h', limit: 50, page: 1 });
    const arr = j && j.data && (Array.isArray(j.data.data) ? j.data.data : Array.isArray(j.data) ? j.data : null);
    tokens = arr || null;
  }
  if (!tokens) tokens = STUB_TRENDING;

  const map = {};
  for (const t of tokens) {
    const sym = String(t.token || t.symbol || t.ticker || '').toUpperCase();
    if (!sym) continue;
    map[sym] = classifySignal(t);
  }
  cacheSet('signals:all', map, 60 * 60 * 1000);
  return { signals: map, cached: false };
}

// In-flight dedup: if a fresh explain request is racing, parallel callers share one API call.
const inFlightExplain = new Map();

// Returns explanation for a single symbol. TTL = 1 hour.
// Cost: ~46 credits per fresh call via Elfa /chat endpoint. Cache is critical.
async function getExplain(symbol) {
  const sym = String(symbol || '').toUpperCase();
  const key = 'explain:' + sym;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  if (inFlightExplain.has(key)) {
    return inFlightExplain.get(key);
  }

  const promise = (async () => {
    let explanation = null;
    let mentions_count = 0;
    let credits_used = 0;

    if (hasKey()) {
      // Pull trending context (cheap) so the chat answer can reference concrete numbers.
      const all = await getAllSignals();
      const ctx = all.signals[sym];
      const ctxStr = ctx
        ? `Current 24h trending stats for ${sym}: ${ctx.mentions} mentions (${ctx.change_percent >= 0 ? '+' : ''}${ctx.change_percent}% vs prev window).`
        : '';
      mentions_count = ctx ? ctx.mentions : 0;

      const prompt = `In 2 short factual sentences explain why ${sym} (crypto ticker) is moving right now. Use real X/Twitter social signal data you have. No hype. Cite one handle if useful. ${ctxStr}`;

      const chat = await fetchElfa('/chat', {}, { method: 'POST', body: { message: prompt } });
      const msg = chat && chat.data && (chat.data.message || chat.data.response || chat.data.text);
      credits_used = (chat && chat.data && chat.data.creditsConsumed) || 0;
      if (msg) {
        // Elfa often returns a TL;DR + long breakdown. Keep just the TL;DR block if present.
        const m = msg.match(/TL;DR:?\s*([\s\S]*?)(?:\n\s*\n|─|$)/i);
        explanation = (m ? m[1] : msg).trim();
        // Strip any leading heading like "# TL;DR:" that snuck in
        explanation = explanation.replace(/^#+\s*/, '').trim();
      }
      if (credits_used) console.log(`[elfa.chat] ${sym} consumed ${credits_used} credits`);
    }

    if (!explanation) {
      const stub = STUB_TRENDING.find(t => t.token.toUpperCase() === sym);
      if (stub) {
        mentions_count = stub.current_count;
        const dir = stub.change_percent >= 20 ? 'rising' : stub.change_percent <= -20 ? 'cooling' : 'flat';
        explanation = `${sym} shows ${stub.current_count} mentions in the last 24h (${stub.change_percent >= 0 ? '+' : ''}${stub.change_percent}% vs prev window) — social chatter is ${dir}. ${hasKey() ? 'Elfa chat returned no text.' : '(stub response — no API key)'}`;
      } else {
        explanation = `No social data for ${sym}. ${hasKey() ? 'Not enough chatter to explain.' : '(stub response — no API key)'}`;
      }
    }

    const result = {
      symbol: sym,
      explanation,
      mentions_count,
      credits_used,
      updated_at: new Date().toISOString(),
    };
    cacheSet(key, result, 60 * 60 * 1000);
    return { ...result, cached: false };
  })();

  inFlightExplain.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightExplain.delete(key);
  }
}

module.exports = {
  hasKey,
  getAllSignals,
  getExplain,
  cacheGet,
  cacheSet,
};
