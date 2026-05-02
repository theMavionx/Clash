// Elfa AI client — social intelligence for crypto (mentions, sentiment, trends).
// When ELFA_API_KEY is unset, all functions return stub data so the UI works in dev.

const ELFA_BASE = 'https://api.elfa.ai/v2';

function apiKey() { return process.env.ELFA_API_KEY || null; }
function hasKey() { return !!apiKey(); }

// ---------- Per-symbol stats (for admin panel) ----------
// { SYM: { explain_hits, cache_hits, fresh_calls, credits_total, last_refreshed_at, last_error, last_player } }
const stats = new Map();
// Ring buffer of recent errors { ts, path, status, message }
const errorLog = [];
const ERROR_LOG_MAX = 100;

function recordStat(sym, fields) {
  const key = sym.toUpperCase();
  const s = stats.get(key) || {
    symbol: key,
    explain_hits: 0,
    cache_hits: 0,
    fresh_calls: 0,
    credits_total: 0,
    last_refreshed_at: null,
    last_error: null,
    last_player: null,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'number') s[k] = (s[k] || 0) + v;
    else s[k] = v;
  }
  stats.set(key, s);
}

function recordError(path, status, message) {
  errorLog.push({ ts: new Date().toISOString(), path, status, message });
  if (errorLog.length > ERROR_LOG_MAX) errorLog.shift();
}

function getStats() {
  return Array.from(stats.values()).sort((a, b) => (b.explain_hits || 0) - (a.explain_hits || 0));
}

function getErrors() {
  return errorLog.slice().reverse();
}

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
    const headers = { 'x-elfa-api-key': apiKey(), 'Accept': 'application/json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      console.warn(`[elfa] ${path} → ${r.status}`);
      const body = await r.text().catch(() => '');
      const detail = body ? `HTTP ${r.status}: ${body.slice(0, 300)}` : `HTTP ${r.status}`;
      recordError(path, r.status, detail);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.warn(`[elfa] ${path} error: ${e.message}`);
    recordError(path, 0, e.message);
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
  let badge = '💀', label = 'quiet';
  if (chg >= 40 && cur >= 15) { badge = '🔥'; label = `+${Math.round(chg)}%`; }
  else if (chg >= 10 && cur >= 5) { badge = '📈'; label = `+${Math.round(chg)}%`; }
  else if (chg <= -15) { badge = '📉'; label = `${Math.round(chg)}%`; }
  else if (cur >= 5) { badge = '·'; label = `${cur}/24h`; } // moderate activity
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
    const j = await fetchElfa('/aggregations/trending-tokens', { timeWindow: '24h', limit: 200, page: 1 });
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
async function getExplain(symbol, playerName) {
  const sym = String(symbol || '').toUpperCase();
  recordStat(sym, { explain_hits: 1, last_player: playerName || null });
  const key = 'explain:' + sym;
  const cached = cacheGet(key);
  if (cached) {
    recordStat(sym, { cache_hits: 1 });
    return { ...cached, cached: true };
  }

  if (inFlightExplain.has(key)) {
    recordStat(sym, { cache_hits: 1 });
    return inFlightExplain.get(key);
  }

  const promise = (async () => {
    let explanation = null;
    let mentions_count = 0;
    let credits_used = 0;
    // Pull trending context once — shared between chat prompt and fallback text.
    const all = hasKey() ? await getAllSignals() : { signals: {} };
    const ctx = all.signals[sym];
    if (ctx) mentions_count = ctx.mentions;

    if (hasKey()) {
      const ctxStr = ctx
        ? `Current 24h trending stats for ${sym}: ${ctx.mentions} mentions (${ctx.change_percent >= 0 ? '+' : ''}${ctx.change_percent}% vs prev window).`
        : '';

      const prompt = `In 2-3 short factual sentences describe what's happening with ${sym} (crypto ticker) on social media right now — the current narrative, key events, and notable voices. Don't frame it as "why it's moving" — it may not be moving. Focus on what people are actually saying. No hype. Cite one handle if useful. ${ctxStr}`;

      // Elfa chat responses routinely take 5-15s server-side — default 8s timeout aborts too early.
      const chat = await fetchElfa('/chat', {}, { method: 'POST', body: { message: prompt }, timeoutMs: 18000 });
      const msg = chat && chat.data && (chat.data.message || chat.data.response || chat.data.text);
      credits_used = (chat && chat.data && chat.data.creditsConsumed) || 0;
      recordStat(sym, {
        fresh_calls: 1,
        credits_total: credits_used,
        last_refreshed_at: new Date().toISOString(),
      });
      console.log(`[elfa.chat] ${sym} raw_msg_len=${msg ? msg.length : 0} credits=${credits_used} keys=${chat && chat.data ? Object.keys(chat.data).join(',') : 'none'}`);
      if (msg) {
        // Elfa often returns a TL;DR + long breakdown. Keep just the TL;DR block if present.
        const m = msg.match(/TL;DR:?\s*([\s\S]*?)(?:\n\s*\n|─|$)/i);
        explanation = (m ? m[1] : msg).trim();
        // Strip any leading heading like "# TL;DR:" that snuck in
        explanation = explanation.replace(/^#+\s*/, '').trim();
      }
    }

    if (!explanation) {
      // 1st fallback: trending-tokens cache
      const sigData = ctx || STUB_TRENDING.find(t => t.token.toUpperCase() === sym);
      if (sigData) {
        const cur = sigData.mentions != null ? sigData.mentions : sigData.current_count;
        const chg = sigData.change_percent;
        mentions_count = cur;
        const dir = chg >= 20 ? 'rising' : chg <= -20 ? 'cooling' : 'stable';
        explanation = `${sym} has ${cur} mentions in the last 24h (${chg >= 0 ? '+' : ''}${chg}% vs previous window) — social chatter is ${dir}. ${hasKey() ? 'No detailed narrative available right now.' : '(stub response — no API key)'}`;
      } else if (hasKey()) {
        // 2nd fallback: keyword-mentions endpoint works for any string (stocks, commodities, etc.)
        const kw = await fetchElfa('/data/keyword-mentions', { keywords: sym, timeWindow: '24h', limit: 5 });
        const items = kw && kw.data && Array.isArray(kw.data) ? kw.data : [];
        const total = (kw && kw.data && kw.metadata && kw.metadata.total) || items.length;
        if (total > 0) {
          mentions_count = total;
          const handles = items.map(i => i.account && i.account.username).filter(Boolean).slice(0, 3);
          explanation = `${sym} has ${total} mentions on X in the last 24h${handles.length ? ` — recent voices include @${handles.join(', @')}` : ''}. Elfa doesn't have a curated narrative for this ticker (likely a stock/commodity outside its crypto focus).`;
        } else {
          explanation = `No social data for ${sym}. This ticker isn't tracked by Elfa right now — too little Twitter/X chatter.`;
        }
      } else {
        explanation = `No social data for ${sym}. (stub response — no API key)`;
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

// ---------- Trade Ideas (hacked on top of /chat with JSON prompt) ----------
// Not an official Elfa endpoint — we coerce the LLM to output structured JSON.
// Cost: ~46-60 credits per fresh call. Cached 30 minutes (shorter than explain
// because trade parameters stale faster than narrative).
const inFlightTrade = new Map();

function safeParseJson(text) {
  if (!text) return null;
  // Strip markdown code fences (```json ... ```) if present.
  const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  // Grab the first {...} block, in case model included preamble.
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function validTradeIdea(j) {
  if (!j || typeof j !== 'object') return false;
  const side = String(j.side || '').toLowerCase();
  if (side !== 'long' && side !== 'short') return false;
  if (typeof j.entry !== 'number' || !isFinite(j.entry)) return false;
  if (typeof j.tp !== 'number' || !isFinite(j.tp)) return false;
  if (typeof j.sl !== 'number' || !isFinite(j.sl)) return false;
  // Sanity check ordering: long → tp > entry > sl, short → tp < entry < sl
  if (side === 'long' && !(j.tp > j.entry && j.entry > j.sl)) return false;
  if (side === 'short' && !(j.tp < j.entry && j.entry < j.sl)) return false;
  return true;
}

async function getTradeIdea(symbol, playerName) {
  const sym = String(symbol || '').toUpperCase();
  recordStat(sym, { trade_idea_hits: 1, last_player: playerName || null });
  const key = 'trade:' + sym;
  const cached = cacheGet(key);
  if (cached) {
    recordStat(sym, { cache_hits: 1 });
    return { ...cached, cached: true };
  }
  if (inFlightTrade.has(key)) {
    recordStat(sym, { cache_hits: 1 });
    return inFlightTrade.get(key);
  }

  const promise = (async () => {
    let idea = null;
    let credits_used = 0;
    let attempts = 0;

    if (hasKey()) {
      const all = await getAllSignals();
      const ctx = all.signals[sym];
      const ctxStr = ctx
        ? `Current 24h trending: ${ctx.mentions} mentions (${ctx.change_percent >= 0 ? '+' : ''}${ctx.change_percent}% vs prev window).`
        : '';

      const prompt = `You are a crypto trade-idea assistant. For ${sym}, produce a single structured trade suggestion based on current social narrative, momentum, and price action.

Return ONLY valid JSON (no markdown, no prose, no code fences) with EXACTLY these keys:
{
  "side": "long" | "short",
  "entry": <number — limit order entry price in USD>,
  "tp": <number — take-profit price in USD>,
  "sl": <number — stop-loss price in USD>,
  "confidence": <integer 0-100>,
  "rr": <string like "1:3">,
  "horizon": <string like "6-48 hours">,
  "reason": <string, 1 short sentence, why>
}

Rules:
- For "long": tp > entry > sl. For "short": tp < entry < sl.
- Numbers must be realistic for the current price level of ${sym}.
- Keep risk/reward ≥ 1:2 when confidence ≥ 50.
- "reason" max 120 chars, no hype words.
${ctxStr}`;

      // Up to 3 attempts — Elfa sometimes times out or returns malformed JSON.
      // Each attempt costs ~46-60 credits, but we only retry on failure so the
      // happy path still charges once.
      const MAX_ATTEMPTS = 2;
      for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
        let chat = null;
        try {
          chat = await fetchElfa('/chat', {}, { method: 'POST', body: { message: prompt }, timeoutMs: 18000 });
        } catch (e) {
          console.warn(`[elfa.trade] ${sym} attempt ${attempts}/${MAX_ATTEMPTS} fetch error: ${e.message}`);
        }
        const msg = chat && chat.data && (chat.data.message || chat.data.response || chat.data.text);
        credits_used += (chat && chat.data && chat.data.creditsConsumed) || 0;
        console.log(`[elfa.trade] ${sym} attempt ${attempts}/${MAX_ATTEMPTS} raw_len=${msg ? msg.length : 0} credits+=${(chat && chat.data && chat.data.creditsConsumed) || 0}`);

        const parsed = safeParseJson(msg);
        if (parsed && validTradeIdea(parsed)) {
          idea = {
            side: String(parsed.side).toLowerCase(),
            entry: Number(parsed.entry),
            tp: Number(parsed.tp),
            sl: Number(parsed.sl),
            confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
            rr: String(parsed.rr || ''),
            horizon: String(parsed.horizon || ''),
            reason: String(parsed.reason || '').slice(0, 200),
          };
          break;
        }
        // Retry — short backoff so we don't slam the API.
        if (attempts < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 600));
        } else {
          recordError('/trade-idea', 0, `All ${MAX_ATTEMPTS} attempts failed for ${sym}. Last raw: ${(msg || '').slice(0, 200)}`);
        }
      }

      recordStat(sym, {
        fresh_calls: 1,
        credits_total: credits_used,
        last_refreshed_at: new Date().toISOString(),
      });
    }

    const result = {
      symbol: sym,
      idea, // null if all attempts failed — client shows "unavailable" state
      credits_used,
      attempts,
      updated_at: new Date().toISOString(),
    };
    // Only cache successful results — retrying 3 times is expensive, but a null
    // cached for 15 min would hide real ideas that would have succeeded later.
    if (idea) {
      cacheSet(key, result, 15 * 60 * 1000);
    }
    return { ...result, cached: false };
  })();

  inFlightTrade.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightTrade.delete(key);
  }
}

module.exports = {
  hasKey,
  getAllSignals,
  getExplain,
  getTradeIdea,
  cacheGet,
  cacheSet,
  getStats,
  getErrors,
};
