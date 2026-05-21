const db = require('./db');

const AI_CHAT_FREE_MESSAGES_SETTING_KEY = 'ai_chat.free_messages_per_day';
const AI_CHAT_DEFAULT_FREE_MESSAGES_PER_DAY = Math.max(0, Number(process.env.AI_CHAT_FREE_MESSAGES_PER_DAY || 10));

function readAppSettingJson(key, fallback = null) {
  const row = db.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value_json); } catch { return fallback; }
}

function getAiChatFreeMessagesPerDay() {
  const configured = readAppSettingJson(AI_CHAT_FREE_MESSAGES_SETTING_KEY, null);
  const raw = configured?.free_messages_per_day ?? configured;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(1000, Math.floor(value))) : AI_CHAT_DEFAULT_FREE_MESSAGES_PER_DAY;
}

function aiChatDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function ensureAiMessageRows(playerId, day = aiChatDayKey()) {
  db.db.prepare(`
    INSERT INTO ai_message_credit_balances (player_id, credits, updated_at)
    VALUES (?, 0, datetime('now'))
    ON CONFLICT(player_id) DO NOTHING
  `).run(playerId);
  db.db.prepare(`
    INSERT INTO ai_message_entitlements (player_id, lifetime_daily_limit, updated_at)
    VALUES (?, 0, datetime('now'))
    ON CONFLICT(player_id) DO NOTHING
  `).run(playerId);
  db.db.prepare(`
    INSERT INTO ai_message_daily_usage (player_id, day, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(player_id, day) DO NOTHING
  `).run(playerId, day);
}

function getAiMessageQuotaStatus(playerId) {
  const day = aiChatDayKey();
  ensureAiMessageRows(playerId, day);
  const freeDailyLimit = getAiChatFreeMessagesPerDay();
  const balance = db.db.prepare('SELECT credits FROM ai_message_credit_balances WHERE player_id = ?').get(playerId) || {};
  const entitlement = db.db.prepare('SELECT lifetime_daily_limit FROM ai_message_entitlements WHERE player_id = ?').get(playerId) || {};
  const usage = db.db.prepare('SELECT * FROM ai_message_daily_usage WHERE player_id = ? AND day = ?').get(playerId, day) || {};
  const lifetimeDailyLimit = Math.max(0, Number(entitlement.lifetime_daily_limit || 0));
  const freeAvailable = lifetimeDailyLimit > 0
    ? 0
    : Math.max(0, freeDailyLimit - Number(usage.free_used || 0));
  const subscriptionAvailable = Math.max(0, lifetimeDailyLimit - Number(usage.subscription_used || 0));
  const credits = Math.max(0, Number(balance.credits || 0));
  return {
    day,
    free_daily_limit: freeDailyLimit,
    free_used: Number(usage.free_used || 0),
    free_available: freeAvailable,
    lifetime_daily_limit: lifetimeDailyLimit,
    subscription_used: Number(usage.subscription_used || 0),
    subscription_available: subscriptionAvailable,
    credits,
    credit_used_today: Number(usage.credit_used || 0),
    total_used_today: Number(usage.total_used || 0),
    available_messages: freeAvailable + subscriptionAvailable + credits,
  };
}

function reserveAiMessage(playerId, reason = 'chat_message', metadata = null) {
  return db.db.transaction(() => {
    const before = getAiMessageQuotaStatus(playerId);
    const day = before.day;
    let bucket = null;
    if (before.lifetime_daily_limit > 0 && before.subscription_available > 0) bucket = 'subscription';
    else if (before.lifetime_daily_limit <= 0 && before.free_available > 0) bucket = 'free';
    else if (before.credits > 0) bucket = 'credit';

    if (!bucket) return { ok: false, quota: before };
    if (bucket === 'credit') {
      db.db.prepare(`
        UPDATE ai_message_credit_balances
        SET credits = credits - 1, updated_at = datetime('now')
        WHERE player_id = ? AND credits > 0
      `).run(playerId);
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET credit_used = credit_used + 1, total_used = total_used + 1, updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, day);
      const row = db.db.prepare('SELECT credits FROM ai_message_credit_balances WHERE player_id = ?').get(playerId);
      db.db.prepare(`
        INSERT INTO ai_message_credit_ledger (player_id, delta, balance_after, reason, metadata_json)
        VALUES (?, -1, ?, ?, ?)
      `).run(playerId, Number(row?.credits || 0), reason, JSON.stringify({ day, ...(metadata || {}) }));
    } else {
      const column = bucket === 'subscription' ? 'subscription_used' : 'free_used';
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET ${column} = ${column} + 1, total_used = total_used + 1, updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, day);
    }
    return {
      ok: true,
      reservation: { bucket, day, reason },
      quota: getAiMessageQuotaStatus(playerId),
    };
  })();
}

function refundAiMessageReservation(playerId, reservation, metadata = null) {
  if (!reservation?.bucket || !reservation?.day) return getAiMessageQuotaStatus(playerId);
  return db.db.transaction(() => {
    ensureAiMessageRows(playerId, reservation.day);
    if (reservation.bucket === 'credit') {
      db.db.prepare(`
        UPDATE ai_message_credit_balances
        SET credits = credits + 1, updated_at = datetime('now')
        WHERE player_id = ?
      `).run(playerId);
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET credit_used = MAX(0, credit_used - 1),
            total_used = MAX(0, total_used - 1),
            updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, reservation.day);
      const row = db.db.prepare('SELECT credits FROM ai_message_credit_balances WHERE player_id = ?').get(playerId);
      db.db.prepare(`
        INSERT INTO ai_message_credit_ledger (player_id, delta, balance_after, reason, metadata_json)
        VALUES (?, 1, ?, 'refund_scheduled_job', ?)
      `).run(playerId, Number(row?.credits || 0), JSON.stringify({ reservation, ...(metadata || {}) }));
    } else {
      const column = reservation.bucket === 'subscription' ? 'subscription_used' : 'free_used';
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET ${column} = MAX(0, ${column} - 1),
            total_used = MAX(0, total_used - 1),
            updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, reservation.day);
    }
    return getAiMessageQuotaStatus(playerId);
  })();
}

module.exports = {
  aiChatDayKey,
  getAiMessageQuotaStatus,
  reserveAiMessage,
  refundAiMessageReservation,
};
