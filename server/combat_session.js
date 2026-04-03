const { v4: uuidv4 } = require('uuid');
const {
  TROOP_STATS, DEFENSE_STATS, SKELETON_GUARD,
  MAX_SHIPS, TROOPS_PER_SHIP, SAIL_DELAY_SEC,
  TICK_RATE_SEC, MAX_TICKS, LOOT_PERCENT, VALID_TROOP_TYPES,
} = require('./combat_defs');

// ---------- Helpers ----------

let _nextTroopId = 0;
let _nextGuardId = 0;

function dist2d(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function findNearest(entity, targets) {
  let best = null;
  let bestDist = Infinity;
  for (const t of targets) {
    if (t.hp <= 0) continue;
    const d = dist2d(entity, t);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best ? { target: best, dist: bestDist } : null;
}

function moveToward(entity, targetX, targetZ, speed, dt) {
  const dx = targetX - entity.x;
  const dz = targetZ - entity.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.001) return;
  const step = Math.min(speed * dt, d);
  entity.x += (dx / d) * step;
  entity.z += (dz / d) * step;
}

// ---------- CombatSession ----------

class CombatSession {
  constructor(sessionId, attackerId, defenderId, defenderBuildings, attackerTroopLevels) {
    this.sessionId = sessionId;
    this.attackerId = attackerId;
    this.defenderId = defenderId;
    this.status = 'active'; // active | victory | defeat | timeout | abandoned
    this.tick = 0;
    this.events = []; // events generated during current tick

    // Ship tracking
    this.shipsPlaced = 0;
    this.troopsDeployed = {};
    this.troopLevels = attackerTroopLevels; // { knight: 2, mage: 1, ... }
    this.pendingShips = []; // { spawnTick, x, z, troopType, troopLevel }

    // Entities
    this.buildings = [];
    this.troops = [];
    this.guards = [];
    this.defenses = [];
    this.townHallId = null;

    this._initBuildings(defenderBuildings);
  }

  _initBuildings(defenderBuildings) {
    for (const b of defenderBuildings) {
      const bld = {
        id: `b_${b.id}`,
        serverId: b.id,
        type: b.type,
        level: b.level,
        hp: b.hp,
        maxHp: b.max_hp,
        x: b.grid_x,
        z: b.grid_z,
      };
      this.buildings.push(bld);

      if (b.type === 'town_hall') {
        this.townHallId = bld.id;
      }

      // Turret defense
      if (b.type === 'turret') {
        const stats = DEFENSE_STATS.turret[b.level] || DEFENSE_STATS.turret[1];
        this.defenses.push({
          buildingId: bld.id,
          type: 'turret',
          damage: stats.damage,
          fireRate: stats.fireRate,
          detectRange: stats.detectRange,
          x: b.grid_x,
          z: b.grid_z,
          fireTimer: 0,
        });
      }

      // Archer tower defense
      if (b.type === 'archer_tower') {
        const stats = DEFENSE_STATS.archer_tower[b.level] || DEFENSE_STATS.archer_tower[1];
        this.defenses.push({
          buildingId: bld.id,
          type: 'archer_tower',
          damage: stats.damage,
          fireRate: stats.fireRate,
          detectRange: stats.detectRange,
          x: b.grid_x,
          z: b.grid_z,
          fireTimer: 0,
        });
      }

      // Tombstone → spawn skeleton guards
      if (b.type === 'tombstone') {
        const guardCount = b.level || 1;
        for (let i = 0; i < guardCount; i++) {
          const angle = (Math.PI * 2 * i) / guardCount;
          this.guards.push({
            id: `g_${_nextGuardId++}`,
            hp: SKELETON_GUARD.hp,
            maxHp: SKELETON_GUARD.hp,
            damage: SKELETON_GUARD.damage,
            atkSpeed: SKELETON_GUARD.atkSpeed,
            moveSpeed: SKELETON_GUARD.moveSpeed,
            detectionRadius: SKELETON_GUARD.detectionRadius,
            attackRange: SKELETON_GUARD.attackRange,
            x: b.grid_x + Math.cos(angle) * 2,
            z: b.grid_z + Math.sin(angle) * 2,
            tombstoneX: b.grid_x,
            tombstoneZ: b.grid_z,
            targetId: null,
            atkTimer: 0,
          });
        }
      }
    }
  }

  // --- Ship Placement ---

  placeShip(x, z, troopType) {
    if (this.status !== 'active') return { error: 'Session not active' };
    if (this.shipsPlaced >= MAX_SHIPS) return { error: 'Max ships reached' };
    if (!VALID_TROOP_TYPES.includes(troopType)) return { error: 'Invalid troop type' };

    const troopLevel = this.troopLevels[troopType] || 1;
    const spawnTick = this.tick + Math.ceil(SAIL_DELAY_SEC / TICK_RATE_SEC);

    this.pendingShips.push({ spawnTick, x, z, troopType, troopLevel });
    this.shipsPlaced++;

    return {
      ok: true,
      shipIdx: this.shipsPlaced,
      troopType,
      troopLevel,
      position: { x, z },
    };
  }

  // --- Tick Processing ---

  processTick() {
    if (this.status !== 'active') return null;

    this.tick++;
    this.events = [];
    const dt = TICK_RATE_SEC;

    // 1. Deploy pending ships
    this._deployPendingShips();

    // 2. Move troops toward targets
    this._moveTroops(dt);

    // 3. Troop attacks
    this._troopAttacks(dt);

    // 4. Defense attacks (turrets, towers)
    this._defenseAttacks(dt);

    // 5. Guard AI
    this._guardAI(dt);

    // 6. Death checks
    this._checkDeaths();

    // 7. Win/lose check
    this._checkWinLose();

    return this.getState();
  }

  _deployPendingShips() {
    const readyShips = this.pendingShips.filter(s => s.spawnTick <= this.tick);
    for (const ship of readyShips) {
      const stats = TROOP_STATS[ship.troopType]?.[ship.troopLevel] || TROOP_STATS[ship.troopType]?.[1];
      if (!stats) continue;

      for (let i = 0; i < TROOPS_PER_SHIP; i++) {
        const troop = {
          id: `t_${_nextTroopId++}`,
          type: ship.troopType,
          level: ship.troopLevel,
          hp: stats.hp,
          maxHp: stats.hp,
          damage: stats.damage,
          atkSpeed: stats.atkSpeed,
          moveSpeed: stats.moveSpeed,
          range: stats.range,
          x: ship.x + (i - 1) * 0.5, // spread slightly
          z: ship.z,
          targetId: null,
          atkTimer: 0,
          state: 'moving', // moving | attacking
        };
        this.troops.push(troop);
        this.events.push({ type: 'troop_spawn', troopId: troop.id, troopType: troop.type, level: troop.level, x: troop.x, z: troop.z });

        // Track deployments
        this.troopsDeployed[ship.troopType] = (this.troopsDeployed[ship.troopType] || 0) + 1;
      }
    }
    this.pendingShips = this.pendingShips.filter(s => s.spawnTick > this.tick);
  }

  _moveTroops(dt) {
    for (const troop of this.troops) {
      if (troop.hp <= 0) continue;

      // Find nearest target: building or guard
      const nearestBuilding = findNearest(troop, this.buildings);
      const nearestGuard = findNearest(troop, this.guards);

      let target = null;
      let targetDist = Infinity;

      if (nearestBuilding) { target = nearestBuilding.target; targetDist = nearestBuilding.dist; }
      if (nearestGuard && nearestGuard.dist < targetDist) { target = nearestGuard.target; targetDist = nearestGuard.dist; }

      if (!target) {
        troop.targetId = null;
        troop.state = 'moving';
        continue;
      }

      troop.targetId = target.id;

      if (targetDist <= troop.range) {
        troop.state = 'attacking';
      } else {
        troop.state = 'moving';
        moveToward(troop, target.x, target.z, troop.moveSpeed, dt);
      }
    }
  }

  _troopAttacks(dt) {
    for (const troop of this.troops) {
      if (troop.hp <= 0 || troop.state !== 'attacking' || !troop.targetId) continue;

      troop.atkTimer += dt;
      if (troop.atkTimer < troop.atkSpeed) continue;
      troop.atkTimer -= troop.atkSpeed;

      // Find target
      const target = this.buildings.find(b => b.id === troop.targetId && b.hp > 0)
                  || this.guards.find(g => g.id === troop.targetId && g.hp > 0);
      if (!target) { troop.targetId = null; troop.state = 'moving'; continue; }

      target.hp -= troop.damage;
      this.events.push({ type: 'troop_attack', source: troop.id, target: target.id, damage: troop.damage, targetHp: Math.max(0, target.hp) });
    }
  }

  _defenseAttacks(dt) {
    for (const def of this.defenses) {
      // Check if parent building still alive
      const building = this.buildings.find(b => b.id === def.buildingId);
      if (!building || building.hp <= 0) continue;

      def.fireTimer += dt;
      if (def.fireTimer < def.fireRate) continue;

      // Find nearest troop in range
      const nearest = findNearest(def, this.troops.filter(t => t.hp > 0));
      if (!nearest || nearest.dist > def.detectRange) continue;

      def.fireTimer -= def.fireRate;
      const troop = nearest.target;
      troop.hp -= def.damage;
      this.events.push({ type: 'defense_attack', source: def.buildingId, target: troop.id, damage: def.damage, targetHp: Math.max(0, troop.hp) });
    }
  }

  _guardAI(dt) {
    for (const guard of this.guards) {
      if (guard.hp <= 0) continue;

      // Find nearest troop within detection radius
      const nearest = findNearest(guard, this.troops.filter(t => t.hp > 0));
      if (!nearest || nearest.dist > guard.detectionRadius) {
        guard.targetId = null;
        continue;
      }

      const troop = nearest.target;
      guard.targetId = troop.id;

      if (nearest.dist <= guard.attackRange) {
        // Attack
        guard.atkTimer += dt;
        if (guard.atkTimer >= guard.atkSpeed) {
          guard.atkTimer -= guard.atkSpeed;
          troop.hp -= guard.damage;
          this.events.push({ type: 'guard_attack', source: guard.id, target: troop.id, damage: guard.damage, targetHp: Math.max(0, troop.hp) });
        }
      } else {
        // Chase
        moveToward(guard, troop.x, troop.z, guard.moveSpeed, dt);
      }
    }
  }

  _checkDeaths() {
    // Buildings
    for (const b of this.buildings) {
      if (b.hp <= 0 && !b._dead) {
        b._dead = true;
        this.events.push({ type: 'building_destroyed', buildingId: b.id, buildingType: b.type });
      }
    }
    // Troops
    for (const t of this.troops) {
      if (t.hp <= 0 && !t._dead) {
        t._dead = true;
        this.events.push({ type: 'troop_killed', troopId: t.id });
      }
    }
    // Guards
    for (const g of this.guards) {
      if (g.hp <= 0 && !g._dead) {
        g._dead = true;
        this.events.push({ type: 'guard_killed', guardId: g.id });
      }
    }
  }

  _checkWinLose() {
    // Victory: town hall destroyed
    if (this.townHallId) {
      const th = this.buildings.find(b => b.id === this.townHallId);
      if (th && th.hp <= 0) {
        this.status = 'victory';
        return;
      }
    }

    // Defeat: all troops dead AND no pending ships AND no more ships to place
    const aliveTroops = this.troops.some(t => t.hp > 0);
    const hasPending = this.pendingShips.length > 0;
    const canPlaceMore = this.shipsPlaced < MAX_SHIPS;
    if (!aliveTroops && !hasPending && !canPlaceMore) {
      this.status = 'defeat';
      return;
    }

    // Timeout
    if (this.tick >= MAX_TICKS) {
      this.status = 'timeout';
    }
  }

  // --- State Serialization ---

  getState() {
    return {
      type: 'combat_tick',
      sessionId: this.sessionId,
      tick: this.tick,
      status: this.status,
      timeRemaining: Math.max(0, MAX_TICKS - this.tick) * TICK_RATE_SEC,
      shipsPlaced: this.shipsPlaced,
      maxShips: MAX_SHIPS,
      troops: this.troops.filter(t => t.hp > 0).map(t => ({
        id: t.id, type: t.type, level: t.level,
        hp: t.hp, maxHp: t.maxHp,
        x: Math.round(t.x * 100) / 100,
        z: Math.round(t.z * 100) / 100,
        state: t.state, targetId: t.targetId,
      })),
      buildings: this.buildings.filter(b => b.hp > 0).map(b => ({
        id: b.id, type: b.type, level: b.level,
        hp: b.hp, maxHp: b.maxHp,
        x: b.x, z: b.z,
      })),
      guards: this.guards.filter(g => g.hp > 0).map(g => ({
        id: g.id, hp: g.hp, maxHp: g.maxHp,
        x: Math.round(g.x * 100) / 100,
        z: Math.round(g.z * 100) / 100,
        targetId: g.targetId,
      })),
      events: this.events,
    };
  }

  getBuildingsDestroyed() {
    return this.buildings.filter(b => b.hp <= 0).map(b => b.serverId);
  }

  end(reason) {
    if (this.status === 'active') {
      this.status = reason || 'abandoned';
    }
  }
}

module.exports = { CombatSession };
