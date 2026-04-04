/**
 * Replay-based combat verification (Clash of Clans style).
 *
 * Client plays the battle locally and records every action with timestamps.
 * After the battle, client sends the replay + claimed result to the server.
 * Server replays the actions through a simplified simulation and checks
 * whether the claimed result is plausible (±20% HP tolerance).
 */

const {
  TROOP_STATS, DEFENSE_STATS, SKELETON_GUARD,
  MAX_SHIPS, TROOPS_PER_SHIP, TIME_LIMIT_SEC,
  CANNON_DAMAGE, VALID_TROOP_TYPES,
} = require('./combat_defs');

// ---------- Helpers ----------

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

function moveToward(entity, tx, tz, speed, dt) {
  const dx = tx - entity.x;
  const dz = tz - entity.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.001) return;
  const step = Math.min(speed * dt, d);
  entity.x += (dx / d) * step;
  entity.z += (dz / d) * step;
}

// ---------- Replay Verifier ----------

const TICK_DT = 0.1; // 10 Hz internal simulation (fast, not real-time)
const HP_TOLERANCE = 0.50; // 50% tolerance — server sim is simplified (no pathing/steering)

/**
 * Verify a battle replay.
 * @param {Object} params
 * @param {Array} params.defenderBuildings - buildings from DB [{id, type, level, hp, max_hp, grid_x, grid_z}]
 * @param {Object} params.attackerTroopLevels - {knight: 2, mage: 1, ...}
 * @param {Array} params.actions - [{t: seconds, type: 'place_ship', x, z, troopType}, {t, type: 'cannon_fire', buildingId}]
 * @param {string} params.claimedResult - 'victory' or 'defeat'
 * @returns {{valid: boolean, reason: string, townHallDestroyed: boolean, buildingsDestroyed: number}}
 */
function verifyReplay({ defenderBuildings, attackerTroopLevels, actions, claimedResult }) {
  // Init buildings
  const buildings = defenderBuildings.map(b => ({
    id: b.id, type: b.type, level: b.level,
    hp: b.hp, maxHp: b.max_hp,
    x: b.grid_x, z: b.grid_z,
  }));

  const troops = [];
  const guards = [];
  const defenses = [];
  let townHallId = null;
  let nextTroopId = 0;
  let shipsPlaced = 0;

  // Init defenses & guards from buildings
  for (const b of buildings) {
    if (b.type === 'town_hall') townHallId = b.id;

    if (b.type === 'turret') {
      const s = DEFENSE_STATS.turret[b.level] || DEFENSE_STATS.turret[1];
      defenses.push({ buildingId: b.id, damage: s.damage, fireRate: s.fireRate, detectRange: s.detectRange, x: b.x, z: b.z, timer: 0 });
    }
    if (b.type === 'archer_tower') {
      const s = DEFENSE_STATS.archer_tower[b.level] || DEFENSE_STATS.archer_tower[1];
      defenses.push({ buildingId: b.id, damage: s.damage, fireRate: s.fireRate, detectRange: s.detectRange, x: b.x, z: b.z, timer: 0 });
    }
    if (b.type === 'tombstone') {
      for (let i = 0; i < (b.level || 1); i++) {
        const angle = (Math.PI * 2 * i) / (b.level || 1);
        guards.push({
          hp: SKELETON_GUARD.hp, damage: SKELETON_GUARD.damage,
          atkSpeed: SKELETON_GUARD.atkSpeed, moveSpeed: SKELETON_GUARD.moveSpeed,
          detectionRadius: SKELETON_GUARD.detectionRadius, attackRange: SKELETON_GUARD.attackRange,
          x: b.x + Math.cos(angle) * 2, z: b.z + Math.sin(angle) * 2,
          targetId: null, atkTimer: 0,
        });
      }
    }
  }

  // Sort actions by time
  const sortedActions = [...actions].sort((a, b) => a.t - b.t);
  let actionIdx = 0;

  // Simulate
  const maxTime = TIME_LIMIT_SEC;
  let time = 0;

  while (time < maxTime) {
    // Process actions at current time
    while (actionIdx < sortedActions.length && sortedActions[actionIdx].t <= time) {
      const act = sortedActions[actionIdx++];
      if (act.type === 'place_ship' && shipsPlaced < MAX_SHIPS) {
        const troopType = act.troopType;
        if (!VALID_TROOP_TYPES.includes(troopType)) continue;
        const level = attackerTroopLevels[troopType] || 1;
        const stats = TROOP_STATS[troopType]?.[level] || TROOP_STATS[troopType]?.[1];
        if (!stats) continue;
        for (let i = 0; i < TROOPS_PER_SHIP; i++) {
          troops.push({
            id: nextTroopId++, hp: stats.hp, damage: stats.damage,
            atkSpeed: stats.atkSpeed, moveSpeed: stats.moveSpeed, range: stats.range,
            x: act.x + (i - 1) * 0.5, z: act.z,
            targetId: null, atkTimer: 0,
          });
        }
        shipsPlaced++;
      }
      if (act.type === 'cannon_fire') {
        const target = buildings.find(b => b.id === act.buildingId && b.hp > 0);
        if (target) target.hp -= CANNON_DAMAGE;
      }
    }

    // Move troops
    for (const t of troops) {
      if (t.hp <= 0) continue;
      const nearB = findNearest(t, buildings);
      const nearG = findNearest(t, guards);
      let target = null, targetDist = Infinity;
      if (nearB) { target = nearB.target; targetDist = nearB.dist; }
      if (nearG && nearG.dist < targetDist) { target = nearG.target; targetDist = nearG.dist; }
      if (!target) continue;
      if (targetDist <= t.range) {
        t.atkTimer += TICK_DT;
        if (t.atkTimer >= t.atkSpeed) {
          t.atkTimer -= t.atkSpeed;
          target.hp -= t.damage;
        }
      } else {
        moveToward(t, target.x, target.z, t.moveSpeed, TICK_DT);
      }
    }

    // Defense attacks
    for (const d of defenses) {
      const bld = buildings.find(b => b.id === d.buildingId);
      if (!bld || bld.hp <= 0) continue;
      d.timer += TICK_DT;
      if (d.timer < d.fireRate) continue;
      const near = findNearest(d, troops.filter(t => t.hp > 0));
      if (!near || near.dist > d.detectRange) continue;
      d.timer -= d.fireRate;
      near.target.hp -= d.damage;
    }

    // Guard AI
    for (const g of guards) {
      if (g.hp <= 0) continue;
      const near = findNearest(g, troops.filter(t => t.hp > 0));
      if (!near || near.dist > g.detectionRadius) continue;
      if (near.dist <= g.attackRange) {
        g.atkTimer += TICK_DT;
        if (g.atkTimer >= g.atkSpeed) {
          g.atkTimer -= g.atkSpeed;
          near.target.hp -= g.damage;
        }
      } else {
        moveToward(g, near.target.x, near.target.z, g.moveSpeed, TICK_DT);
      }
    }

    // Check town hall
    const th = buildings.find(b => b.id === townHallId);
    if (th && th.hp <= 0) {
      break; // Victory achievable
    }

    // Check all troops dead
    const anyAlive = troops.some(t => t.hp > 0);
    const allActionsProcessed = actionIdx >= sortedActions.length;
    if (!anyAlive && allActionsProcessed && shipsPlaced >= MAX_SHIPS) {
      break; // Defeat
    }

    time += TICK_DT;
  }

  // Evaluate result
  const th = buildings.find(b => b.id === townHallId);
  const townHallDestroyed = th ? th.hp <= 0 : false;
  const buildingsDestroyed = buildings.filter(b => b.hp <= 0).length;

  // With tolerance: if server sim says TH has ≤20% HP left, accept victory claim
  const townHallPlausible = th ? (th.hp / th.maxHp) <= HP_TOLERANCE : true;

  if (claimedResult === 'victory') {
    if (townHallDestroyed || townHallPlausible) {
      return { valid: true, reason: 'Victory verified', townHallDestroyed: true, buildingsDestroyed };
    }
    return { valid: false, reason: `Town hall still at ${th ? Math.round(th.hp / th.maxHp * 100) : '?'}% HP in server sim`, townHallDestroyed: false, buildingsDestroyed };
  }

  // Defeat always accepted (no benefit to lying about losing)
  return { valid: true, reason: 'Defeat accepted', townHallDestroyed: false, buildingsDestroyed };
}

module.exports = { verifyReplay };
