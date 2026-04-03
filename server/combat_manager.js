const { v4: uuidv4 } = require('uuid');
const { CombatSession } = require('./combat_session');
const { TICK_RATE_MS, LOOT_PERCENT } = require('./combat_defs');

class CombatManager {
  constructor(db) {
    this.db = db;
    this.sessions = new Map();       // sessionId -> CombatSession
    this.playerSession = new Map();  // playerId -> sessionId
    this.sendFn = new Map();         // playerId -> ws.send function
    this.disconnectTimers = new Map(); // playerId -> timeout

    // Global tick loop
    this._tickInterval = setInterval(() => this._tickAll(), TICK_RATE_MS);
  }

  // Register a WebSocket send function for a player
  registerSender(playerId, sendFn) {
    this.sendFn.set(playerId, sendFn);
    // Cancel disconnect grace timer if reconnecting
    if (this.disconnectTimers.has(playerId)) {
      clearTimeout(this.disconnectTimers.get(playerId));
      this.disconnectTimers.delete(playerId);
    }
  }

  unregisterSender(playerId) {
    this.sendFn.delete(playerId);
    // Start 10s grace period — if player doesn't reconnect, abandon session
    if (this.playerSession.has(playerId)) {
      const timer = setTimeout(() => {
        this.endSession(playerId, 'disconnected');
        this.disconnectTimers.delete(playerId);
      }, 10000);
      this.disconnectTimers.set(playerId, timer);
    }
  }

  _send(playerId, msg) {
    const fn = this.sendFn.get(playerId);
    if (fn) {
      try { fn(JSON.stringify(msg)); } catch {}
    }
  }

  // --- Session Lifecycle ---

  createSession(attackerId, defenderId) {
    // Validate: no active session
    if (this.playerSession.has(attackerId)) {
      return { error: 'Already in an active attack session' };
    }

    // Fetch defender buildings from DB
    const defenderBuildings = this.db.getPlayerBuildings(defenderId);
    if (!defenderBuildings || defenderBuildings.length === 0) {
      return { error: 'Defender has no buildings' };
    }

    // Fetch attacker's troop levels
    const troopRows = this.db.getTroopLevels(attackerId);
    const troopLevels = {};
    for (const t of troopRows) {
      troopLevels[t.troop_type] = t.level;
    }

    const sessionId = uuidv4();
    const session = new CombatSession(sessionId, attackerId, defenderId, defenderBuildings, troopLevels);

    this.sessions.set(sessionId, session);
    this.playerSession.set(attackerId, sessionId);

    // Save to DB
    this.db.createAttackSession(sessionId, attackerId, defenderId);

    return {
      sessionId,
      defenderId,
      buildings: defenderBuildings,
      troopLevels,
    };
  }

  placeShip(playerId, sessionId, x, z, troopType) {
    const session = this._getPlayerSession(playerId, sessionId);
    if (!session) return { error: 'Invalid session' };
    return session.placeShip(x, z, troopType);
  }

  endSession(playerId, reason = 'abandoned') {
    const sessionId = this.playerSession.get(playerId);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.end(reason);
    this._finalizeSession(session);
  }

  // --- Tick Loop ---

  _tickAll() {
    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'active') continue;

      const state = session.processTick();
      if (!state) continue;

      // Send tick to attacker
      this._send(session.attackerId, state);

      // Check if battle ended this tick
      if (session.status !== 'active') {
        this._finalizeSession(session);
      }
    }
  }

  _finalizeSession(session) {
    const { sessionId, attackerId, defenderId, status } = session;

    if (status === 'victory') {
      // Grant loot
      const result = this.db.battleVictory(attackerId, defenderId);
      this._send(attackerId, {
        type: 'attack_victory',
        sessionId,
        loot: result.loot || { gold: 0, wood: 0, ore: 0 },
        attackerResources: result.attacker_resources,
      });
    } else {
      this._send(attackerId, {
        type: 'attack_defeat',
        sessionId,
        reason: status, // 'defeat', 'timeout', 'abandoned', 'disconnected'
      });
    }

    // Update DB
    this.db.updateAttackSession(sessionId, status, JSON.stringify(session.troopsDeployed), JSON.stringify(session.getBuildingsDestroyed()));

    // Cleanup
    this.sessions.delete(sessionId);
    this.playerSession.delete(attackerId);
  }

  _getPlayerSession(playerId, sessionId) {
    const activeSessionId = this.playerSession.get(playerId);
    if (!activeSessionId || activeSessionId !== sessionId) return null;
    return this.sessions.get(sessionId);
  }

  // --- Cleanup ---

  destroy() {
    clearInterval(this._tickInterval);
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
  }
}

module.exports = { CombatManager };
