// Earned quest resources survive a full storage. Only delivery is capacity-limited.
// Both claims and delivery use the caller's SQLite connection/transaction.
const RESOURCES = ['gold', 'wood', 'ore'];
const zero = () => ({ gold: 0, wood: 0, ore: 0 });

function amounts(value = {}) {
  const result = {};
  for (const key of RESOURCES) {
    const n = Number(value[key] ?? 0);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid quest reward ${key}`);
    result[key] = n;
  }
  return result;
}

function ensureTaskRewardSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_reward_reserves (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL,
      gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
      wood INTEGER NOT NULL DEFAULT 0 CHECK (wood >= 0),
      ore INTEGER NOT NULL DEFAULT 0 CHECK (ore >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, task_id)
    );
    CREATE TABLE IF NOT EXISTS task_reward_recoveries (
      source_event_id INTEGER PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL,
      gold INTEGER NOT NULL,
      wood INTEGER NOT NULL,
      ore INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function legacyTaskRewardLosses(db, playerId, throughEventId) {
  if (!playerId || !Number.isSafeInteger(throughEventId) || throughEventId <= 0) {
    throw new Error('An exact player and positive audit event boundary are required');
  }
  const hasReceipts = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='task_reward_recoveries'").get());
  return db.prepare(`
    SELECT e.id AS source_event_id, e.related_task_id AS task_id,
           e.lost_gold_to_cap AS gold, e.lost_wood_to_cap AS wood,
           e.lost_ore_to_cap AS ore, e.created_at
    FROM resource_delta_events e
    WHERE e.player_id = ? AND e.id <= ? AND e.source_type = 'task_claim'
      AND e.related_task_id IS NOT NULL
      AND (e.lost_gold_to_cap > 0 OR e.lost_wood_to_cap > 0 OR e.lost_ore_to_cap > 0)
      ${hasReceipts ? 'AND NOT EXISTS (SELECT 1 FROM task_reward_recoveries r WHERE r.source_event_id = e.id)' : ''}
    ORDER BY e.id
  `).all(playerId, throughEventId).map(row => ({ ...row, ...amounts(row) }));
}

function createTaskRewardService({ db, getResources, getResourceCaps, addResources, initialize = true }) {
  if (initialize) ensureTaskRewardSchema(db);
  const pendingRows = db.prepare('SELECT task_id, gold, wood, ore FROM task_reward_reserves WHERE player_id = ? AND (gold > 0 OR wood > 0 OR ore > 0) ORDER BY task_id');
  const reserve = db.prepare('SELECT gold, wood, ore FROM task_reward_reserves WHERE player_id = ? AND task_id = ?');
  const save = db.prepare(`INSERT INTO task_reward_reserves (player_id, task_id, gold, wood, ore)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(player_id, task_id) DO UPDATE SET
    gold=excluded.gold, wood=excluded.wood, ore=excluded.ore, updated_at=datetime('now')`);
  const receipt = db.prepare('INSERT INTO task_reward_recoveries (source_event_id, player_id, task_id, gold, wood, ore, reason) VALUES (?, ?, ?, ?, ?, ?, ?)');

  function queue(playerId, taskId, reward) {
    if (!Number.isSafeInteger(taskId) || taskId <= 0) throw new Error('Invalid quest id');
    const earned = amounts(reward), old = reserve.get(playerId, taskId) || zero();
    const next = amounts(Object.fromEntries(RESOURCES.map(key => [key, old[key] + earned[key]])));
    save.run(playerId, taskId, next.gold, next.wood, next.ore);
    return earned;
  }

  function deliver(playerId, taskId, options = {}, auditEmpty = false) {
    const pending = reserve.get(playerId, taskId) || zero();
    const before = getResources(playerId);
    if (!before) throw new Error('Quest reward player not found');
    const caps = getResourceCaps(playerId);
    const released = amounts(Object.fromEntries(RESOURCES.map(key => [
      key, Math.min(pending[key], Math.max(0, Math.floor(Number(caps[key]) - Number(before[key])))),
    ])));
    const remaining = amounts(Object.fromEntries(RESOURCES.map(key => [key, pending[key] - released[key]])));
    let resources = before;
    if (auditEmpty || RESOURCES.some(key => released[key] > 0)) {
      resources = addResources(playerId, released.gold, released.wood, released.ore, {
        ...options, relatedTaskId: taskId,
        sourceType: options.sourceType || 'task_reward_pending_release',
        metadata: { ...options.metadata, reward_pending: remaining },
      });
      if (!resources || RESOURCES.some(key => resources[key] - before[key] !== released[key])) {
        throw new Error('Quest resource delivery mismatch');
      }
      save.run(playerId, taskId, remaining.gold, remaining.wood, remaining.ore);
    }
    return { released, pending: remaining, resources };
  }

  const creditTx = db.transaction((playerId, taskId, reward, options = {}) => {
    const earned = queue(playerId, taskId, reward);
    return { earned, ...deliver(playerId, taskId, {
      ...options, sourceType: 'task_claim', metadata: { ...options.metadata, reward_earned: earned },
    }, true) };
  });
  const settleTx = db.transaction(playerId => {
    const released = zero();
    for (const row of pendingRows.all(playerId)) {
      const result = deliver(playerId, row.task_id);
      for (const key of RESOURCES) released[key] += result.released[key];
    }
    return { released, resources: getResources(playerId) };
  });
  const recoverTx = db.transaction((playerId, throughEventId, reason) => {
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('Recovery audit reason required');
    const rows = legacyTaskRewardLosses(db, playerId, throughEventId), recovered = zero();
    for (const row of rows) {
      queue(playerId, row.task_id, row);
      receipt.run(row.source_event_id, playerId, row.task_id, row.gold, row.wood, row.ore, reason);
      for (const key of RESOURCES) recovered[key] += row[key];
    }
    return { recovered, source_event_ids: rows.map(row => row.source_event_id) };
  });
  return {
    credit: (...args) => creditTx.immediate(...args),
    // Empty reserves avoid taking a write lock on frequent game-resource polls.
    settle: playerId => pendingRows.get(playerId)
      ? settleTx.immediate(playerId)
      : { released: zero(), resources: getResources(playerId) },
    pendingByTask: playerId => Object.fromEntries(pendingRows.all(playerId).map(row => [row.task_id, amounts(row)])),
    recoverLegacy: (...args) => recoverTx.immediate(...args),
  };
}

module.exports = { createTaskRewardService, ensureTaskRewardSchema, legacyTaskRewardLosses };
