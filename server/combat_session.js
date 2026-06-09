/**
 * Replay-based combat verification — 1:1 match with Godot client.
 *
 * Key behaviors replicated:
 * - Troop targeting: unified nearest (buildings + guards), guard threat check
 * - Melee hit at 40% through attack cycle
 * - Ranged projectiles home toward target each tick
 * - Turret first shot is instant; Archer Tower first shot has full delay
 * - Skeleton guards detect relative to tombstone, chase up to 2x radius
 * - Multiple troops per ship from troops[] array
 * - 60 Hz tick rate matching client
 */

const {
  TROOP_STATS, computeDemonKingStats, DEFENSE_STATS, SKELETON_GUARD,
  MAX_SHIPS, TROOPS_PER_SHIP, TIME_LIMIT_SEC, SAIL_DELAY_SEC,
  CANNON_DAMAGE, CANNON_INITIAL_ENERGY, CANNON_ENERGY_PER_DESTROY,
  CANNON_RELOAD_SEC, CANNON_SPEED, CANNON_MIN_FLIGHT_SEC,
  CANNON_START_POS, CANNON_TARGET_Y,
  cannonShotCost, VALID_TROOP_TYPES,
} = require('./combat_defs');
const { BUILDING_DEFS } = require('./db');
const TROOP_PROJECTILE_SPAWN_Y = 0.154; // troop global Y + BaseTroop.PROJECTILE_SPAWN_Y in Godot telemetry
const TROOP_TARGET_AIM_Y = 0.05;       // BaseTroop.TARGET_AIM_Y
const TOWER_PROJECTILE_SPAWN_Y = 0.05;
const TOWER_TARGET_AIM_Y = 0.05;
const TURRET_PROJECTILE_SPAWN_Y = 0.18;
const TURRET_TARGET_AIM_Y = 0.2;

// ---------- Config ----------

const TICK_DT = 1 / 60;            // 60 Hz — matches client framerate
const HP_TOLERANCE = 0.05;         // Max 5% TH HP deviation allowed
const PROJ_HIT_DIST_SQ = 0.0025;   // 0.05² — client HIT_DIST_SQ
const TURRET_HIT_DIST_SQ = 0.0009; // 0.03² — turret tighter hitbox
const GUARD_THREAT_MULT = 1.5;     // Troops switch to guards within range * 1.5
const TROOP_SPAWN_DELAY = 0.2;     // Seconds between each troop from same ship
const RETARGET_INTERVAL = 10;      // Frames between target re-evaluation (matches client)
const DEFENSE_SEARCH_SEC = 0.15;   // Target search interval for defenses (matches client)
const SEPARATION_RADIUS = 0.0;     // BaseTroop combat scripts default to no push-apart
const SEPARATION_FORCE = 0.0;      // Keep server movement aligned with client defaults
const RALLY_MAX_FLIGHT_SEC = 8.0;  // Sanity cap for client-recorded grenade flight time
const TARGET_SWITCH_MIN_ADVANTAGE = 0.08;
const GUARD_TARGET_TIE_DIST = 0.02;
const ATTACK_SLOT_OFFSETS = [-0.0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];
const SLOT_EVAL_INTERVAL_SEC = 6 / 60;
const UNIT_TARGET_GROUND = 'ground';
const UNIT_TARGET_AIR = 'air';
const TRACE_MAX_EVENTS = Math.max(100, Number(process.env.CLASH_SIM_TRACE_MAX || 20000));
const TROOP_NAMES = {
  knight: 'Knight',
  mage: 'Mage',
  barbarian: 'Barbarian',
  archer: 'Archer',
  ranger: 'Ranger',
  demon_king: 'DemonKing',
  fire_dragon: 'FireDragon',
};

const TROOP_TYPE_ALIASES = {
  demonking: 'demon_king',
  demon_king: 'demon_king',
  firedragon: 'fire_dragon',
  fire_dragon: 'fire_dragon',
};

function normalizeTroopTypeName(name) {
  const raw = String(name || '').split(':')[0].toLowerCase();
  return TROOP_TYPE_ALIASES[raw] || raw;
}

function troopEntryLevel(name) {
  const match = String(name || '').match(/:L([1-3])$/i);
  return match ? Number(match[1]) : null;
}

// ---------- Helpers ----------

function distSq2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function dist2d(ax, az, bx, bz) {
  return Math.sqrt(distSq2d(ax, az, bx, bz));
}

function dist3d(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function troopTargetType(troop) {
  return troop?.flying ? UNIT_TARGET_AIR : UNIT_TARGET_GROUND;
}

function canDefenseTargetTroop(defense, troop) {
  if (!troop || troop.hp <= 0) return false;
  return troopTargetType(troop) === UNIT_TARGET_AIR
    ? defense.targetAir !== false
    : defense.targetGround !== false;
}

function canGuardTargetTroop(troop) {
  return !!(troop && troop.hp > 0 && troopTargetType(troop) === UNIT_TARGET_GROUND);
}

function cannonFlightTime(target) {
  const dist = dist3d(
    CANNON_START_POS.x, CANNON_START_POS.y, CANNON_START_POS.z,
    target.x, CANNON_TARGET_Y, target.z
  );
  return Math.max(dist / CANNON_SPEED, CANNON_MIN_FLIGHT_SEC);
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

function angleDiff(a, b) {
  const twoPi = Math.PI * 2;
  // Match Godot's BaseTroop._compute_attack_slot exactly. GDScript fmod()
  // keeps the sign of the dividend, so negative angles are not normalized
  // into [0, TAU). That quirk affects slot choices and therefore tower
  // targeting during dense fights.
  return Math.abs(((a - b + Math.PI) % twoPi) - Math.PI);
}

function clampToIsland(pos, gc) {
  if (!isValidGridConfig(gc)) return pos;
  const extentX = gc.grid_extent_x * 1.05;
  const extentZ = gc.grid_extent_z * 1.05;
  const dx = pos.x - gc.grid_center_x;
  const dz = pos.z - gc.grid_center_z;
  const cosNeg = Math.cos(-gc.grid_rotation);
  const sinNeg = Math.sin(-gc.grid_rotation);
  let localX = dx * cosNeg - dz * sinNeg;
  let localZ = dx * sinNeg + dz * cosNeg;
  localX = clamp(localX, -extentX * 0.5, extentX * 0.5);
  localZ = clamp(localZ, -extentZ * 0.5, extentZ * 0.5);
  const cosR = Math.cos(gc.grid_rotation);
  const sinR = Math.sin(gc.grid_rotation);
  return {
    x: gc.grid_center_x + localX * cosR - localZ * sinR,
    z: gc.grid_center_z + localX * sinR + localZ * cosR,
  };
}

function lerp(a, b, weight) {
  return a + (b - a) * weight;
}

function computeAttackSlot(t, target, aliveTroops) {
  const myAngle = Math.atan2(t.x - target.x, t.z - target.z);
  t._slotEvalTimer = (t._slotEvalTimer || 0) + TICK_DT;
  if (t._slotEvalTimer >= SLOT_EVAL_INTERVAL_SEC) {
    t._slotEvalTimer %= SLOT_EVAL_INTERVAL_SEC;
    let bestAngle = myAngle;
    let bestMinDist = 0;
    for (const offset of ATTACK_SLOT_OFFSETS) {
      const testAngle = myAngle + offset;
      let minOtherDist = 999;
      for (const other of aliveTroops) {
        if (other === t || other.hp <= 0) continue;
        if (other._currentTarget !== target) continue;
        const otherAngle = Math.atan2(other.x - target.x, other.z - target.z);
        minOtherDist = Math.min(minOtherDist, angleDiff(testAngle, otherAngle));
      }
      if (minOtherDist > bestMinDist) {
        bestMinDist = minOtherDist;
        bestAngle = testAngle;
      }
    }
    t._orbitAngle = bestAngle;
  }
  return {
    x: target.x + Math.sin(t._orbitAngle) * t.range * 0.95,
    z: target.z + Math.cos(t._orbitAngle) * t.range * 0.95,
  };
}

function checkStuck(t, myAngle) {
  t._stuckTimer += TICK_DT;
  if (t._stuckTimer < 0.6) return;

  const moved = dist2d(t.x, t.z, t._lastX, t._lastZ);
  if (moved < t.moveSpeed * 0.02) {
    t._orbitAngle += 0.8;
    if (t._orbitAngle > myAngle + Math.PI * 2) {
      t._orbitAngle = myAngle;
    }
  } else {
    t._orbitAngle = lerp(t._orbitAngle, myAngle, 0.3);
  }
  t._lastX = t.x;
  t._lastZ = t.z;
  t._stuckTimer = 0;
}

function applyMovementSteering(t, moveX, moveZ, target, aliveTroops, aliveGuards, aliveBuildings, defaultGridConfig) {
  let sepX = 0;
  let sepZ = 0;
  const sepRangeSq = SEPARATION_RADIUS * SEPARATION_RADIUS * 4.0;

  if (SEPARATION_RADIUS > 0 && SEPARATION_FORCE > 0) {
    for (const other of aliveTroops) {
      if (other === t || other.hp <= 0) continue;
      const ox = other.x - t.x;
      const oz = other.z - t.z;
      const dsq = ox * ox + oz * oz;
      if (dsq > sepRangeSq || dsq < 0.000001) continue;
      const d = Math.sqrt(dsq);
      if (d < SEPARATION_RADIUS) {
        const push = (SEPARATION_RADIUS - d) / SEPARATION_RADIUS;
        sepX -= (ox / d) * push;
        sepZ -= (oz / d) * push;
      }
    }

    for (const guard of aliveGuards) {
      if (guard === target || guard.hp <= 0) continue;
      const gx = guard.x - t.x;
      const gz = guard.z - t.z;
      const dsq = gx * gx + gz * gz;
      if (dsq > sepRangeSq || dsq < 0.000001) continue;
      const d = Math.sqrt(dsq);
      if (d < SEPARATION_RADIUS) {
        const push = ((SEPARATION_RADIUS - d) / SEPARATION_RADIUS) * 0.5;
        sepX -= (gx / d) * push;
        sepZ -= (gz / d) * push;
      }
    }

    for (const b of aliveBuildings) {
      if (b === target || b.hp <= 0) continue;
      const bx = t.x - b.x;
      const bz = t.z - b.z;
      const d = Math.sqrt(bx * bx + bz * bz);
      const avoidR = b.avoidRadius || 0.18;
      if (d > 0.001 && d < avoidR) {
        const push = ((avoidR - d) / avoidR) * 1.5;
        sepX += (bx / d) * push;
        sepZ += (bz / d) * push;
      }
    }
  }

  t.x += moveX + sepX * SEPARATION_FORCE * TICK_DT * 3.0;
  t.z += moveZ + sepZ * SEPARATION_FORCE * TICK_DT * 3.0;
  const clamped = clampToIsland(t, defaultGridConfig);
  t.x = clamped.x;
  t.z = clamped.z;
}

function computeGuardSeparation(g, aliveTroops) {
  g._sepCounter = (g._sepCounter || 0) + 1;
  if (g._sepCounter % 3 !== 0) {
    return { x: g._lastSepX || 0, z: g._lastSepZ || 0 };
  }

  let sepX = 0;
  let sepZ = 0;
  const radius = g.separationRadius || 0;
  if (radius > 0) {
    for (const t of aliveTroops) {
      if (!t || t.hp <= 0) continue;
      const dx = t.x - g.x;
      const dz = t.z - g.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < radius && d > 0.001) {
        const push = (radius - d) / radius;
        sepX += (-dx / d) * push;
        sepZ += (-dz / d) * push;
      }
    }
  }

  g._lastSepX = sepX * (g.separationForce || 0) * TICK_DT * 3.0;
  g._lastSepZ = sepZ * (g.separationForce || 0) * TICK_DT * 3.0;
  return { x: g._lastSepX, z: g._lastSepZ };
}

function moveGuardToward(g, target, aliveTroops) {
  const dx = target.x - g.x;
  const dz = target.z - g.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist <= 0.01) return;

  const dirX = dx / dist;
  const dirZ = dz / dist;
  const sep = computeGuardSeparation(g, aliveTroops);
  let nextX = g.x + dirX * g.moveSpeed * TICK_DT + sep.x;
  let nextZ = g.z + dirZ * g.moveSpeed * TICK_DT + sep.z;
  if (dist2d(nextX, nextZ, target.x, target.z) > dist) {
    nextX = g.x + dirX * g.moveSpeed * TICK_DT;
    nextZ = g.z + dirZ * g.moveSpeed * TICK_DT;
  }
  g.x = nextX;
  g.z = nextZ;
}

function applyGuardAttackSeparation(g, target, aliveTroops) {
  const dx = target.x - g.x;
  const dz = target.z - g.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const sep = computeGuardSeparation(g, aliveTroops);
  if (Math.sqrt(sep.x * sep.x + sep.z * sep.z) <= 0.001) return;
  const nextX = g.x + sep.x;
  const nextZ = g.z + sep.z;
  if (dist2d(nextX, nextZ, target.x, target.z) <= g.attackRange * 1.2) {
    g.x = nextX;
    g.z = nextZ;
  }
}

// Find nearest alive target from a list. Returns {target, distSq} or null.
function findNearestAlive(x, z, targets, options = {}) {
  let best = null;
  let bestDistSq = Infinity;
  for (const t of targets) {
    if (t.hp <= 0) continue;
    if (options.filter && !options.filter(t)) continue;
    const dsq = distSq2d(x, z, t.x, t.z);
    if (dsq < bestDistSq) {
      bestDistSq = dsq;
      best = t;
      continue;
    }
    if (options.preferWeakOnTie && best) {
      const dist = Math.sqrt(dsq);
      const bestDist = Math.sqrt(bestDistSq);
      if (Math.abs(dist - bestDist) <= GUARD_TARGET_TIE_DIST && t.hp < best.hp) {
        bestDistSq = dsq;
        best = t;
      }
    }
  }
  return best ? { target: best, distSq: bestDistSq } : null;
}

function shouldKeepCurrentTarget(troop, candidate, candidateDistSq) {
  const current = troop._currentTarget;
  if (!current || current.hp <= 0 || !candidate || candidate === current) return false;
  const currentDistSq = distSq2d(troop.x, troop.z, current.x, current.z);
  if (troop._currentTargetIsGuard) {
    const stickyRange = troop.range * Math.max(GUARD_THREAT_MULT, 2.0);
    if (currentDistSq <= stickyRange * stickyRange) return true;
  }
  return Math.sqrt(candidateDistSq) + TARGET_SWITCH_MIN_ADVANTAGE >= Math.sqrt(currentDistSq);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function traceEntityPayload(entity, fallbackKind = 'unknown') {
  if (!entity) return null;
  const isBuilding = !!entity.type && entity.maxHp != null;
  const isTroop = !isBuilding && entity.type;
  const payload = {
    kind: isBuilding ? 'building' : (fallbackKind || (isTroop ? 'troop' : 'guard')),
    id: entity.id ?? entity.buildingId ?? null,
    type: entity.type || fallbackKind || 'unknown',
    hp: entity.hp,
    maxHp: entity.maxHp ?? null,
    x: round3(entity.x),
    z: round3(entity.z),
  };
  if (entity.replayOrder != null) payload.replayOrder = entity.replayOrder;
  return payload;
}

function traceTargetCandidatesPayload(troop, buildings, guards, limit = 5) {
  const rows = [];
  for (const b of buildings || []) {
    if (!b || b.hp <= 0) continue;
    rows.push({
      kind: 'building',
      type: b.type || 'building',
      id: b.id ?? null,
      server_id: b.id ?? null,
      hp: b.hp,
      dist: round3(dist2d(troop.x, troop.z, b.x, b.z)),
      x: round3(b.x),
      z: round3(b.z),
    });
  }
  for (const g of guards || []) {
    if (!g || g.hp <= 0) continue;
    rows.push({
      kind: 'guard',
      type: 'guard',
      id: g.id ?? null,
      hp: g.hp,
      dist: round3(dist2d(troop.x, troop.z, g.x, g.z)),
      x: round3(g.x),
      z: round3(g.z),
    });
  }
  rows.sort((a, b) => a.dist - b.dist);
  return rows.slice(0, limit);
}

function traceTroopStatePayload(troop) {
  if (!troop) return {};
  return {
    replayOrder: troop.replayOrder ?? null,
    troopState: troop._state || null,
    attackTimer: round3(troop.atkTimer || 0),
    orbitAngle: round3(troop._orbitAngle || 0),
    retargetCounter: troop._retargetCounter ?? null,
    forceRetarget: troop._forceRetarget === true,
    sepCounter: troop._sepCounter ?? null,
  };
}

function isValidGridConfig(gc) {
  return !!(gc && Number(gc.cell_size) > 0);
}

function normalizeGridConfigs(gridConfig, gridConfigs) {
  const configs = {};
  if (gridConfigs && typeof gridConfigs === 'object') {
    for (const [idx, gc] of Object.entries(gridConfigs)) {
      if (isValidGridConfig(gc)) configs[String(idx)] = gc;
    }
  }
  if (isValidGridConfig(gridConfig)) configs['0'] = configs['0'] || gridConfig;
  return configs;
}

function resolveRallyTarget(x, z, aliveBuildings, aliveGuards) {
  let bestTarget = null;
  let bestDistSq = Infinity;
  let isGuard = false;

  for (const b of aliveBuildings) {
    const dsq = distSq2d(x, z, b.x, b.z);
    if (dsq < bestDistSq) {
      bestDistSq = dsq;
      bestTarget = b;
      isGuard = false;
    }
  }

  for (const g of aliveGuards) {
    const dsq = distSq2d(x, z, g.x, g.z);
    if (dsq < bestDistSq) {
      bestDistSq = dsq;
      bestTarget = g;
      isGuard = true;
    }
  }

  return bestTarget ? { target: bestTarget, isGuard } : null;
}

function isRallyFocusValid(rallyFocus) {
  return !!(rallyFocus && rallyFocus.target && rallyFocus.target.hp > 0);
}

function applyRallyFocus(troop, rallyFocus) {
  if (troop._currentTarget !== rallyFocus.target) {
    troop._state = 'running';
    troop._orbitAngle = 0;
  }
  troop._currentTarget = rallyFocus.target;
  troop._currentTargetIsGuard = rallyFocus.isGuard;
}

// Convert grid coordinates to world coordinates
function gridToWorld(gridX, gridZ, sizeX, sizeZ, gc) {
  const halfX = gc.grid_extent_x / 2.0;
  const halfZ = gc.grid_extent_z / 2.0;
  const cs = gc.cell_size;
  const localX = -halfX + gridX * cs + (sizeX * cs) / 2.0;
  const localZ = -halfZ + gridZ * cs + (sizeZ * cs) / 2.0;
  const cosR = Math.cos(gc.grid_rotation);
  const sinR = Math.sin(gc.grid_rotation);
  return {
    x: gc.grid_center_x + localX * cosR + localZ * sinR,
    z: gc.grid_center_z - localX * sinR + localZ * cosR,
  };
}

function updateProjectiles(projectiles, phase = null, onHit = null, onLost = null, ownerRef = undefined) {
  let cannonEnergyGain = 0;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (phase != null && p.phase !== phase) continue;
    if (ownerRef !== undefined && p.ownerRef !== ownerRef) continue;
    if (p.ownerRef && p.ownerRef.hp <= 0) {
      if (onLost) onLost(p, 'owner_dead');
      projectiles.splice(i, 1);
      continue;
    }

    const tgt = p.targetRef;
    if (!tgt || tgt.hp <= 0) {
      if (onLost) onLost(p, !tgt ? 'target_missing' : 'target_dead');
      projectiles.splice(i, 1);
      continue;
    }

    const targetY = Number.isFinite(p.targetY) ? p.targetY : 0;
    const projectileY = Number.isFinite(p.y) ? p.y : targetY;
    const dx = tgt.x - p.x;
    const dy = targetY - projectileY;
    const dz = tgt.z - p.z;
    const dsq = dx * dx + dy * dy + dz * dz;
    const d = Math.sqrt(dsq);
    if (d > 0) {
      const step = Math.min(p.speed * TICK_DT, d);
      p.x += (dx / d) * step;
      if (Number.isFinite(p.y)) p.y += (dy / d) * step;
      p.z += (dz / d) * step;
    }

    const hitY = Number.isFinite(p.y) ? p.y : targetY;
    const hitDx = tgt.x - p.x;
    const hitDy = targetY - hitY;
    const hitDz = tgt.z - p.z;
    const hitDsq = hitDx * hitDx + hitDy * hitDy + hitDz * hitDz;
    if (hitDsq <= p.hitDistSq) {
      const hpBefore = tgt.hp;
      tgt.hp -= p.damage;
      if (onHit) onHit(p, tgt, hpBefore, tgt.hp);
      if (tgt.hp <= 0 && p.isBuilding) cannonEnergyGain += CANNON_ENERGY_PER_DESTROY;
      projectiles.splice(i, 1);
      continue;
    }
  }
  return cannonEnergyGain;
}

function clearDeadOwnerProjectiles(projectiles, phase = null, onLost = null) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (phase != null && p.phase !== phase) continue;
    if (!p.ownerRef || p.ownerRef.hp > 0) continue;
    if (onLost) onLost(p, 'owner_dead');
    projectiles.splice(i, 1);
  }
}

// ---------- Replay Verifier ----------

function verifyReplay({ defenderBuildings, actions, claimedResult, gridConfig, gridConfigs, serverTroopLevels, defenderAltarLevels = {}, debugTrace = false }) {
  const gridConfigMap = normalizeGridConfigs(gridConfig, gridConfigs);
  const defaultGridConfig = gridConfigMap['0'] || Object.values(gridConfigMap)[0];
  if (!isValidGridConfig(defaultGridConfig)) {
    return { valid: false, reason: 'Missing or invalid grid_config' };
  }
  if (!actions || !Array.isArray(actions)) {
    return { valid: false, reason: 'No actions' };
  }

  // Init buildings with world coordinates
  const buildings = defenderBuildings.map(b => {
    const def = BUILDING_DEFS[b.type];
    const size = def?.size || [2, 2];
    const gridIndex = b.grid_index ?? b.gridIndex ?? 0;
    const gc = gridConfigMap[String(gridIndex)] || defaultGridConfig;
    const pos = gridToWorld(b.grid_x, b.grid_z, size[0], size[1], gc);
    return {
      id: b.id, type: b.type, level: b.level,
      hp: b.hp, maxHp: b.max_hp,
      gridIndex,
      x: pos.x, z: pos.z,
      avoidRadius: Math.max(size[0], size[1]) * gc.cell_size * 0.5 + 0.06,
    };
  });

  const troops = [];
  const guards = [];
  const defenses = [];
  const projectiles = [];
  let townHallId = null;
  const wardLevel = Math.max(0, Math.min(3, Number(defenderAltarLevels?.ward) || 0));
  const wardPct = [0, 5, 10, 15][wardLevel] || 0;
  const wardDamage = (damage) => Math.ceil((Number(damage) || 0) * (1 + wardPct / 100));
  let nextTroopId = 0;
  let shipsPlaced = 0;
  const pendingSpawns = [];
  const pendingCannonballs = [];

  let cannonEnergy = CANNON_INITIAL_ENERGY;
  let cannonShotsFired = 0;
  let cannonEventsIgnored = 0;
  let cannonReadyAt = 0;
  let rallyDropsUsed = 0;
  let rallyFocus = null;
  let rallyEventsAccepted = 0;
  let rallyEventsIgnored = 0;
  const pendingRallies = [];
  const trace = [];
  let traceDropped = 0;
  let time = 0;

  function traceEvent(kind, data = {}) {
    if (!debugTrace) return;
    if (trace.length >= TRACE_MAX_EVENTS) {
      traceDropped++;
      return;
    }
    trace.push({
      kind,
      t: Math.round(time * 100) / 100,
      ...data,
    });
  }

  function traceTroopProjectileLost(p, reason) {
    traceEvent('troop_projectile_lost_target', {
      reason,
      troopId: p.ownerTroopId ?? null,
      replayOrder: p.ownerReplayOrder ?? p.ownerRef?.replayOrder ?? null,
      troop: p.ownerTroopType ?? null,
      target: traceEntityPayload(p.targetRef, p.targetRef?.type ? 'building' : 'guard'),
      projectileX: round3(p.x),
      projectileZ: round3(p.z),
    });
  }

  function clearProjectilesTargetingRemovedGuards(removedGuardIds) {
    if (!removedGuardIds || removedGuardIds.size === 0) return;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const target = p.targetRef;
      if (!target || target.type || !removedGuardIds.has(target.id)) continue;
      if (p.phase === 'troop') traceTroopProjectileLost(p, 'tombstone_destroyed');
      projectiles.splice(i, 1);
    }
  }

  function clearTroopTargetsForRemovedGuards(removedGuardIds) {
    if (!removedGuardIds || removedGuardIds.size === 0) return;
    for (const t of troops) {
      if (!t || !t._currentTarget || t._currentTarget.type) continue;
      if (!removedGuardIds.has(t._currentTarget.id)) continue;
      t._currentTarget = null;
      t._currentTargetIsGuard = false;
      t._forceRetarget = true;
      if (t._state === 'attacking') t._state = 'running';
    }
  }

  function removeTombstoneGuards(tombstone, source = 'building_destroyed') {
    if (!tombstone || tombstone.type !== 'tombstone') return 0;
    const removed = [];
    const removedGuardIds = new Set();
    for (const g of guards) {
      if (!g || g.tombstoneId !== tombstone.id || g.hp <= 0) continue;
      removed.push({
        guardId: g.id,
        hp: g.hp,
        x: round3(g.x),
        z: round3(g.z),
        targetId: g.targetId ?? null,
      });
      removedGuardIds.add(g.id);
      g.hp = 0;
      g.targetId = null;
      g.isAttacking = false;
      g.hitDone = false;
      g.removedByTombstone = true;
    }
    if (removed.length === 0) return 0;

    if (rallyFocus && rallyFocus.isGuard && removedGuardIds.has(rallyFocus.target?.id)) {
      rallyFocus = null;
    }
    clearTroopTargetsForRemovedGuards(removedGuardIds);
    clearProjectilesTargetingRemovedGuards(removedGuardIds);
    traceEvent('tombstone_guards_removed', {
      source,
      tombstoneId: tombstone.id,
      removed,
    });
    return removed.length;
  }

  function traceBuildingDestroyed(target, source = 'troop') {
    traceEvent('building_destroyed', {
      buildingId: target.id,
      type: target.type,
      hp: target.hp,
      ...(source ? { source } : {}),
    });
    removeTombstoneGuards(target, source);
  }

  function traceTroopProjectileHit(p, target, hpBefore, hpAfter) {
    const isBuilding = !!target.type;
    traceEvent('troop_projectile_hit', {
      troopId: p.ownerTroopId ?? null,
      replayOrder: p.ownerReplayOrder ?? p.ownerRef?.replayOrder ?? null,
      troop: p.ownerTroopType ?? null,
      ...traceTroopStatePayload(p.ownerRef),
      targetKind: isBuilding ? 'building' : 'guard',
      targetId: target.id,
      targetType: target.type || 'guard',
      target: traceEntityPayload(target, isBuilding ? 'building' : 'guard'),
      projectileX: round3(p.x),
      projectileZ: round3(p.z),
      hitDistSq: Math.round(distSq2d(p.x, p.z, target.x, target.z) * 10000) / 10000,
      damage: p.damage,
      hpBefore,
      hpAfter,
    });
    if (isBuilding && hpAfter <= 0) {
      traceBuildingDestroyed(target, 'troop_projectile');
      if (p.ownerRef) p.ownerRef._forceRetarget = true;
    } else if (!isBuilding && hpAfter <= 0) {
      traceEvent('guard_death', {
        guardId: target.id,
        damage: p.damage,
        hp: hpAfter,
        x: round3(target.x),
        z: round3(target.z),
        sourceTroopId: p.ownerTroopId ?? null,
        sourceReplayOrder: p.ownerReplayOrder ?? p.ownerRef?.replayOrder ?? null,
      });
    }
  }

  function updateTroopProjectilesFor(owner) {
    return updateProjectiles(projectiles, 'troop', traceTroopProjectileHit, traceTroopProjectileLost, owner);
  }

  for (const b of buildings) {
    traceEvent('building_init', {
      target: traceEntityPayload(b, 'building'),
      gridIndex: b.gridIndex,
      avoidRadius: Math.round((b.avoidRadius || 0) * 1000) / 1000,
    });
  }

  // Init defenses & guards from buildings
  for (const b of buildings) {
    if (b.type === 'town_hall') townHallId = b.id;

    if (b.type === 'turret') {
      const s = DEFENSE_STATS.turret[b.level] || DEFENSE_STATS.turret[1];
      defenses.push({
        buildingId: b.id, type: 'turret',
        damage: wardDamage(s.damage), fireRate: s.fireRate, detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        targetGround: true, targetAir: false,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
        _searchTimer: 0,  // throttle target search to DEFENSE_SEARCH_SEC
      });
    }
    if (b.type === 'archer_tower' || b.type === 'archertower' || b.type === 'archtower') {
      const s = DEFENSE_STATS.archer_tower[b.level] || DEFENSE_STATS.archer_tower[1];
      defenses.push({
        buildingId: b.id, type: 'archer_tower',
        damage: wardDamage(s.damage), fireRate: s.fireRate, detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        targetGround: true, targetAir: true,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
        _searchTimer: 0,
      });
    }
    if (b.type === 'mage_tower') {
      const mageLevel = Math.max(1, Math.min(Number(b.level) || 1, 3));
      const s = DEFENSE_STATS.mage_tower[mageLevel] || DEFENSE_STATS.mage_tower[1];
      defenses.push({
        buildingId: b.id, type: 'mage_tower',
        damage: wardDamage(s.damage), fireRate: s.fireRate, detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        beam: !!s.beam,
        baseDamage: wardDamage(s.baseDamage ?? s.damage),
        maxDamage: wardDamage(s.maxDamage ?? s.damage),
        tickRate: s.tickRate ?? s.fireRate,
        rampTime: s.rampTime ?? 1,
        targetGround: true,
        targetAir: true,
        beamCharge: 0,
        beamTick: 0,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
        _searchTimer: 0,
      });
    }
    if (b.type === 'tombstone') {
      const guardCount = b.level || 1;
      const guardLevel = Math.max(1, Math.min(4, Number(b.level) || 1));
      const guardStats = SKELETON_GUARD.levels?.[guardLevel] || SKELETON_GUARD;
      for (let i = 0; i < guardCount; i++) {
        const angle = (Math.PI * 2 * i) / guardCount;
        guards.push({
          id: `g${nextTroopId++}`,
          tombstoneId: b.id,
          hp: guardStats.hp, damage: wardDamage(guardStats.damage),
          atkSpeed: guardStats.atkSpeed, moveSpeed: guardStats.moveSpeed,
          detectionRadius: guardStats.detectionRadius,
          attackRange: SKELETON_GUARD.attackRange,
          separationRadius: SKELETON_GUARD.separationRadius,
          separationForce: SKELETON_GUARD.separationForce,
          hitDelay: SKELETON_GUARD.hitDelay,
          x: b.x + Math.cos(angle) * 0.15,
          z: b.z + Math.sin(angle) * 0.15,
          tombX: b.x, tombZ: b.z,
          targetId: null, atkTimer: 0, hitPending: false, hitTimer: 0,
          isAttacking: false, hitDone: false,
          _sepCounter: 0, _lastSepX: 0, _lastSepZ: 0,
        });
        const guard = guards[guards.length - 1];
        traceEvent('guard_spawn', {
          guardId: guard.id,
          tombstoneId: b.id,
          x: round3(guard.x),
          z: round3(guard.z),
          hp: guard.hp,
        });
      }
    }
  }

  const sortedActions = actions
    .filter(a => a && a.type !== 'battle_start')
    .map(a => ({ ...a, t: finiteNumber(a.t, 0) }))
    .sort((a, b) => a.t - b.t);
  let actionIdx = 0;

  while (time < TIME_LIMIT_SEC) {
    // ── Process player actions ──
    while (actionIdx < sortedActions.length && sortedActions[actionIdx].t <= time) {
      const act = sortedActions[actionIdx++];

      if (act.type === 'place_ship' && shipsPlaced < MAX_SHIPS) {
        // Support both old (troopType) and new (troops[]) format
        const shipTroops = (act.troops || (act.troopType ? [act.troopType] : [])).slice(0, TROOPS_PER_SHIP);
        const shipReplayIndex = finiteNumber(act.ship_index, shipsPlaced);
        const spawnX = finiteNumber(act.troop_x, finiteNumber(act.x, 0));
        const spawnZ = finiteNumber(act.troop_z, finiteNumber(act.z, 0));
        const troopSpawns = Array.isArray(act.troop_spawns) ? act.troop_spawns : [];
        for (let ti = 0; ti < shipTroops.length; ti++) {
          const rawName = shipTroops[ti];
          if (String(rawName || '') === '_SLOT_FILLER_') continue;
          const troopType = normalizeTroopTypeName(rawName);
          if (!VALID_TROOP_TYPES.includes(troopType)) continue;
          const level = troopEntryLevel(rawName)
            || (serverTroopLevels && (serverTroopLevels[rawName] || serverTroopLevels[troopType]))
            || act.troopLevel
            || 1;
          const troopSpawn = troopSpawns[ti] || {};
          pendingSpawns.push({
            time: act.t + SAIL_DELAY_SEC + ti * TROOP_SPAWN_DELAY,
            troopType, troopLevel: level,
            playerTroopLevels: serverTroopLevels || act.playerTroopLevels || act.troopLevels || {},
            x: finiteNumber(troopSpawn.x, spawnX),
            z: finiteNumber(troopSpawn.z, spawnZ),
            replayOrder: shipReplayIndex * 100 + ti,
          });
        }
        shipsPlaced++;
      }

      if (act.type === 'cannon_fire') {
        const actionTime = finiteNumber(act.t, time);
        if (actionTime + 0.0001 < cannonReadyAt) {
          cannonEventsIgnored++;
          traceEvent('cannon_ignored', {
            reason: 'reload',
            buildingId: act.buildingId ?? null,
            readyAt: Math.round(cannonReadyAt * 100) / 100,
            energy: cannonEnergy,
          });
          continue;
        }
        const cost = cannonShotCost(cannonShotsFired + 1);
        if (cannonEnergy < cost) {
          cannonEventsIgnored++;
          traceEvent('cannon_ignored', {
            reason: 'energy',
            buildingId: act.buildingId ?? null,
            cost,
            energy: cannonEnergy,
          });
          continue;
        }
        const target = buildings.find(b => b.id === act.buildingId && b.hp > 0);
        if (target) {
          const flight = cannonFlightTime(target);
          cannonShotsFired++;
          cannonEnergy -= cost;
          cannonReadyAt = actionTime + CANNON_RELOAD_SEC;
          pendingCannonballs.push({
            time: actionTime + flight,
            target,
          });
          traceEvent('cannon_fire', {
            shot: cannonShotsFired,
            cost,
            energyAfter: cannonEnergy,
            target: traceEntityPayload(target, 'building'),
            actionTime: Math.round(actionTime * 1000) / 1000,
            flightTime: Math.round(flight * 1000) / 1000,
            impactAt: Math.round((actionTime + flight) * 100) / 100,
          });
        } else {
          cannonEventsIgnored++;
          traceEvent('cannon_ignored', {
            reason: 'target_missing',
            buildingId: act.buildingId ?? null,
            energy: cannonEnergy,
          });
        }
      }

      if (act.type === 'rally_drop') {
        const rallyBuildingId = finiteNumber(act.buildingId ?? act.building_id, NaN);
        const rallyBuilding = Number.isFinite(rallyBuildingId)
          ? buildings.find(b => b.id === rallyBuildingId && b.hp > 0)
          : null;
        const pointSource = rallyBuilding ? 'building' : 'point';
        const x = rallyBuilding ? rallyBuilding.x : finiteNumber(act.x, NaN);
        const z = rallyBuilding ? rallyBuilding.z : finiteNumber(act.z, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
          rallyEventsIgnored++;
          traceEvent('rally_ignored', { reason: 'invalid_point', x: act.x ?? null, z: act.z ?? null });
          continue;
        }

        const cost = rallyDropsUsed + 1;
        if (cannonEnergy < cost) {
          // Client cannot launch without shared cannon energy. Ignore forged
          // or desynced rally events so they do not help the server sim.
          rallyEventsIgnored++;
          traceEvent('rally_ignored', { reason: 'energy', cost, energy: cannonEnergy, x, z });
          continue;
        }

        const flightTime = clamp(finiteNumber(act.flight_time, 0), 0, RALLY_MAX_FLIGHT_SEC);
        cannonEnergy -= cost;
        rallyDropsUsed++;
        rallyEventsAccepted++;
        pendingRallies.push({
          time: finiteNumber(act.t, time) + flightTime,
          x, z,
          buildingId: rallyBuilding?.id ?? null,
          pointSource,
        });
        traceEvent('rally_fire', {
          cost,
          energyAfter: cannonEnergy,
          x: round3(x),
          z: round3(z),
          buildingId: rallyBuilding?.id ?? null,
          pointSource,
          flightTime: Math.round(flightTime * 1000) / 1000,
          impactAt: Math.round((finiteNumber(act.t, time) + flightTime) * 100) / 100,
        });
      }
    }

    // ── Deploy pending troops ──
    for (let i = pendingSpawns.length - 1; i >= 0; i--) {
      if (pendingSpawns[i].time <= time) {
        const sp = pendingSpawns.splice(i, 1)[0];
        const baseStats = sp.troopType === 'demon_king'
          ? computeDemonKingStats(sp.playerTroopLevels, sp.troopLevel)
          : (TROOP_STATS[sp.troopType]?.[sp.troopLevel] || TROOP_STATS[sp.troopType]?.[1]);
        const stats = baseStats;
        if (!stats) continue;
        // One troop per spawn entry
        const troopId = nextTroopId++;
        const spawnPos = clampToIsland({ x: sp.x, z: sp.z }, defaultGridConfig);
        troops.push({
          id: troopId,
          replayOrder: sp.replayOrder,
          type: sp.troopType,
          hp: stats.hp, damage: stats.damage,
          atkSpeed: stats.atkSpeed, moveSpeed: stats.moveSpeed, range: stats.range,
          melee: stats.melee, projSpeed: stats.projSpeed || 0,
          flying: !!stats.flying,
          targetType: stats.flying ? UNIT_TARGET_AIR : UNIT_TARGET_GROUND,
          hitDelay: stats.hitDelay || 0, shootDelay: stats.shootDelay || 0,
          x: spawnPos.x, z: spawnPos.z,
          atkTimer: 0, hitPending: false, hitTimer: 0,
          hitDone: false,
          _pendingTarget: null,
          _state: 'idle',
          _retargetCounter: 0,
          _sepCounter: 0,
          _slotEvalTimer: 0,
          _orbitAngle: 0,
          _stuckTimer: 0,
          _lastX: spawnPos.x,
          _lastZ: spawnPos.z,
          _currentTarget: null,      // sticky target ref
          _currentTargetIsGuard: false,
          _forceRetarget: false,
        });
        traceEvent('troop_spawn', {
          troopId,
          replayOrder: sp.replayOrder,
          troop: sp.troopType,
          targetType: stats.flying ? UNIT_TARGET_AIR : UNIT_TARGET_GROUND,
          level: sp.troopLevel,
          hp: stats.hp,
          x: Math.round(spawnPos.x * 1000) / 1000,
          z: Math.round(spawnPos.z * 1000) / 1000,
        });
      }
    }

    // Ship cannonballs apply damage only on impact, matching BSCannon.
    for (let i = pendingCannonballs.length - 1; i >= 0; i--) {
      if (pendingCannonballs[i].time <= time) {
        const shot = pendingCannonballs.splice(i, 1)[0];
        const target = shot.target;
        if (target && target.hp > 0) {
          const hpBefore = target.hp;
          target.hp -= CANNON_DAMAGE;
          traceEvent('cannon_hit', {
            buildingId: target.id,
            type: target.type,
            target: traceEntityPayload(target, 'building'),
            hpBefore,
            hpAfter: target.hp,
          });
          if (target.hp <= 0 && target.type) {
            traceBuildingDestroyed(target, 'cannon');
            cannonEnergy += CANNON_ENERGY_PER_DESTROY;
          }
        }
      }
    }

    // ── Build alive lists ──
    const aliveTroops = [];
    for (const t of troops) { if (t.hp > 0) aliveTroops.push(t); }
    const aliveGuards = [];
    for (const g of guards) { if (g.hp > 0) aliveGuards.push(g); }
    const aliveBuildings = [];
    for (const b of buildings) { if (b.hp > 0) aliveBuildings.push(b); }

    // Rally grenade impact. The client spends energy on launch, but troops
    // only receive the command when the grenade lands.
    for (let i = pendingRallies.length - 1; i >= 0; i--) {
      if (pendingRallies[i].time <= time) {
        const r = pendingRallies.splice(i, 1)[0];
        rallyFocus = resolveRallyTarget(r.x, r.z, aliveBuildings, aliveGuards);
        if (rallyFocus) {
          for (const t of aliveTroops) applyRallyFocus(t, rallyFocus);
          traceEvent('rally_impact', {
            x: round3(r.x),
            z: round3(r.z),
            buildingId: r.buildingId ?? null,
            pointSource: r.pointSource ?? 'point',
            target: traceEntityPayload(rallyFocus.target, rallyFocus.isGuard ? 'guard' : 'building'),
          });
        } else {
          traceEvent('rally_impact', {
            x: round3(r.x),
            z: round3(r.z),
            buildingId: r.buildingId ?? null,
            pointSource: r.pointSource ?? 'point',
            target: null,
          });
        }
      }
    }

    if (rallyFocus && !isRallyFocusValid(rallyFocus)) {
      rallyFocus = null;
    }

    // Existing tower bullets move before a defense can fire a new shot,
    // matching turret.gd / tower_archer.gd process order.
    cannonEnergy += updateProjectiles(projectiles, 'defense', (p, target, hpBefore, hpAfter) => {
      traceEvent('defense_projectile_hit', {
        defenseType: p.defenseType,
        buildingId: p.ownerRef?.id ?? null,
        targetTroopId: target.id,
        replayOrder: target.replayOrder ?? null,
        targetTroop: target.type,
        projectileX: round3(p.x),
        projectileZ: round3(p.z),
        hitDistSq: Math.round(distSq2d(p.x, p.z, target.x, target.z) * 10000) / 10000,
        damage: p.damage,
        hpBefore,
        hpAfter,
        x: Math.round(target.x * 1000) / 1000,
        z: Math.round(target.z * 1000) / 1000,
      });
      if (hpAfter <= 0) {
        traceEvent('troop_death', {
          troopId: target.id,
          replayOrder: target.replayOrder ?? null,
          troop: target.type,
          damage: p.damage,
          hp: hpAfter,
          x: Math.round(target.x * 1000) / 1000,
          z: Math.round(target.z * 1000) / 1000,
        });
      }
    }, (p, reason) => {
      traceEvent('defense_projectile_lost_target', {
        reason,
        defenseType: p.defenseType,
        buildingId: p.ownerRef?.id ?? null,
        targetTroopId: p.targetRef?.id ?? null,
        replayOrder: p.targetRef?.replayOrder ?? null,
        targetTroop: p.targetRef?.type ?? null,
        projectileX: round3(p.x),
        projectileZ: round3(p.z),
      });
    });
    for (let i = aliveTroops.length - 1; i >= 0; i--) {
      if (aliveTroops[i].hp <= 0) aliveTroops.splice(i, 1);
    }
    clearDeadOwnerProjectiles(projectiles, 'troop', traceTroopProjectileLost);

    // ── Defense AI (turrets + archer towers) ──
    for (const d of defenses) {
      const bld = buildings.find(b => b.id === d.buildingId);
      if (!bld || bld.hp <= 0) continue;

      // Godot defenses return before advancing _target_search_timer while no
      // troops exist. Keep the server scan phase aligned with the client, or
      // first-target selection can shift by one 60 Hz window at range edges.
      if (aliveTroops.length === 0) {
        d.targetId = null;
        d.isAttacking = false;
        if (d.beam) {
          d.beamCharge = 0;
          d.beamTick = 0;
        }
        continue;
      }

      const detectSq = d.detectRange * d.detectRange;
      d._searchTimer += TICK_DT;
      let currentTarget = null;

      if (d.targetId != null) {
        currentTarget = aliveTroops.find(t => t.id === d.targetId && canDefenseTargetTroop(d, t));
        if (!currentTarget && d.isAttacking) {
          // Godot defenses drop back to idle when their current target dies.
          // The next acquired target starts a fresh attack cycle instead of
          // inheriting the old fire timer.
          d.isAttacking = false;
          d.timer = 0;
          d.targetId = null;
          if (d.beam) {
            d.beamCharge = 0;
            d.beamTick = 0;
          }
        }
        if (currentTarget && distSq2d(d.x, d.z, currentTarget.x, currentTarget.z) > detectSq) {
          currentTarget = null;
          if (d.beam) {
            d.beamCharge = 0;
            d.beamTick = 0;
          }
        }
      }

      if (!currentTarget && d._searchTimer >= DEFENSE_SEARCH_SEC) {
        d._searchTimer = 0;
        const near = findNearestAlive(d.x, d.z, aliveTroops, { filter: t => canDefenseTargetTroop(d, t) });
        traceEvent('defense_scan', {
          defenseType: d.type,
          buildingId: d.buildingId,
          targetTroopId: near?.target?.id ?? null,
          replayOrder: near?.target?.replayOrder ?? null,
          targetTroop: near?.target?.type ?? null,
          dist: near ? Math.round(Math.sqrt(near.distSq) * 1000) / 1000 : null,
          candidates: debugTrace ? aliveTroops.map(troop => ({
            id: troop.id,
            replayOrder: troop.replayOrder ?? null,
            type: troop.type,
            targetType: troop.targetType,
            hp: troop.hp,
            x: Math.round(troop.x * 1000) / 1000,
            z: Math.round(troop.z * 1000) / 1000,
            d: Math.round(dist2d(d.x, d.z, troop.x, troop.z) * 1000) / 1000,
          })) : undefined,
        });
        if (near && near.distSq < detectSq) currentTarget = near.target;
      }

      if (!currentTarget) {
        if (d.isAttacking) {
          d.isAttacking = false;
          d.timer = 0;
          d.targetId = null;
          if (d.beam) {
            d.beamCharge = 0;
            d.beamTick = 0;
          }
        }
        continue;
      }

      const previousTargetId = d.targetId;
      d.targetId = currentTarget.id;
      if (d.beam && previousTargetId !== currentTarget.id) {
        d.beamCharge = 0;
        d.beamTick = 0;
      }

      if (!d.isAttacking) {
        d.isAttacking = true;
        // Turret: first shot instant (timer = fireRate). Archer Tower: full delay (timer = 0)
        d.timer = d.type === 'turret' ? d.fireRate : 0;
      }

      if (d.type === 'mage_tower' && d.beam) {
        d.beamCharge = Math.min(1, d.beamCharge + TICK_DT / Math.max(d.rampTime, TICK_DT));
        d.beamTick += TICK_DT;
        while (d.beamTick >= d.tickRate && currentTarget.hp > 0) {
          d.beamTick -= d.tickRate;
          const damage = Math.max(1, Math.round(d.baseDamage + (d.maxDamage - d.baseDamage) * d.beamCharge));
          const hpBefore = currentTarget.hp;
          currentTarget.hp -= damage;
          traceEvent('defense_beam_tick', {
            defenseType: d.type,
            buildingId: d.buildingId,
            targetTroopId: currentTarget.id,
            replayOrder: currentTarget.replayOrder ?? null,
            targetTroop: currentTarget.type,
            charge: Math.round(d.beamCharge * 1000) / 1000,
            damage,
            hpBefore,
            hpAfter: currentTarget.hp,
            x: Math.round(currentTarget.x * 1000) / 1000,
            z: Math.round(currentTarget.z * 1000) / 1000,
          });
        }
        if (currentTarget.hp <= 0) {
          traceEvent('troop_death', {
            troopId: currentTarget.id,
            replayOrder: currentTarget.replayOrder ?? null,
            troop: currentTarget.type,
            damage: Math.max(1, Math.round(d.baseDamage + (d.maxDamage - d.baseDamage) * d.beamCharge)),
            hp: currentTarget.hp,
            x: Math.round(currentTarget.x * 1000) / 1000,
            z: Math.round(currentTarget.z * 1000) / 1000,
          });
          const deadIdx = aliveTroops.findIndex(t => t.id === currentTarget.id);
          if (deadIdx >= 0) aliveTroops.splice(deadIdx, 1);
          d.targetId = null;
          d.isAttacking = false;
          d.timer = 0;
          d.beamCharge = 0;
          d.beamTick = 0;
        }
        continue;
      }

      d.timer += TICK_DT;
      if (d.timer >= d.fireRate) {
        d.timer -= d.fireRate;
        projectiles.push({
          x: d.x, z: d.z,
          y: d.type === 'turret' ? TURRET_PROJECTILE_SPAWN_Y : TOWER_PROJECTILE_SPAWN_Y,
          targetY: d.type === 'turret' ? TURRET_TARGET_AIM_Y : TOWER_TARGET_AIM_Y,
          phase: 'defense',
          defenseType: d.type,
          ownerRef: bld,
          targetRef: currentTarget, speed: d.projSpeed, damage: d.damage,
          isBuilding: false,
          hitDistSq: d.type === 'turret' ? TURRET_HIT_DIST_SQ : PROJ_HIT_DIST_SQ,
        });
        traceEvent('defense_fire', {
          defenseType: d.type,
          buildingId: d.buildingId,
          targetTroopId: currentTarget.id,
          replayOrder: currentTarget.replayOrder ?? null,
          targetTroop: currentTarget.type,
          targetHp: currentTarget.hp,
          projectileX: round3(d.x),
          projectileZ: round3(d.z),
          target: traceEntityPayload(currentTarget, 'troop'),
          x: Math.round(currentTarget.x * 1000) / 1000,
          z: Math.round(currentTarget.z * 1000) / 1000,
          candidates: debugTrace ? aliveTroops.map(troop => ({
            id: troop.id,
            replayOrder: troop.replayOrder ?? null,
            type: troop.type,
            targetType: troop.targetType,
            hp: troop.hp,
            x: Math.round(troop.x * 1000) / 1000,
            z: Math.round(troop.z * 1000) / 1000,
            d: Math.round(dist2d(d.x, d.z, troop.x, troop.z) * 1000) / 1000,
          })) : undefined,
        });
      }
    }

    // ── Troop separation (push apart overlapping troops) ──
    // ── Troop AI ──
    // Tombstone skeletons are added to the scene before replay troops, so
    // their _physics_process runs before BaseTroop._physics_process in Godot.
    // Keep this before troop movement/projectiles to avoid guard/troop slot
    // drift that changes turret target selection on range boundaries.
    const guardSearchTroops = aliveTroops
      .filter(canGuardTargetTroop)
      .sort((a, b) => (a.replayOrder ?? a.id) - (b.replayOrder ?? b.id));
    for (const g of aliveGuards) {
      // Find target — detection relative to tombstone
      if (g.targetId == null) {
        let best = null;
        let bestDist = g.detectionRadius;
        for (const t of guardSearchTroops) {
          const d = dist2d(t.x, t.z, g.tombX, g.tombZ);
          if (d < bestDist) { bestDist = d; best = t; }
        }
        if (best) {
          g.targetId = best.id;
          traceEvent('guard_target_acquired', {
            guardId: g.id,
            target: traceEntityPayload(best, 'troop'),
            distFromTomb: Math.round(bestDist * 1000) / 1000,
          });
          // Godot's SkeletonGuard switches from IDLE/PATROL to CHASE and
          // returns; chase movement starts on the next physics tick.
          continue;
        }
      }

      if (g.targetId == null) continue;

      const target = aliveTroops.find(t => t.id === g.targetId && canGuardTargetTroop(t));
      if (!target) {
        traceEvent('guard_target_lost', { guardId: g.id, reason: 'target_dead_or_missing' });
        g.targetId = null; g.isAttacking = false; continue;
      }

      // Abandon chase if troop too far from tombstone
      if (dist2d(target.x, target.z, g.tombX, g.tombZ) > g.detectionRadius * 2.0) {
        traceEvent('guard_target_lost', {
          guardId: g.id,
          reason: 'too_far_from_tombstone',
          target: traceEntityPayload(target, 'troop'),
          distFromTomb: Math.round(dist2d(target.x, target.z, g.tombX, g.tombZ) * 1000) / 1000,
        });
        g.targetId = null;
        g.isAttacking = false;
        continue;
      }

      let gDist = dist2d(g.x, g.z, target.x, target.z);

      if (!g.isAttacking) {
        if (gDist <= g.attackRange) {
          g.isAttacking = true;
          g.atkTimer = 0;
          g.hitDone = false;
          // Godot's _do_chase only enters ATTACK state here. _do_attack
          // advances the swing timer on the following physics tick.
          continue;
        }
        moveGuardToward(g, target, aliveTroops);
        continue;
      }

      applyGuardAttackSeparation(g, target, aliveTroops);
      gDist = dist2d(g.x, g.z, target.x, target.z);
      if (gDist > g.attackRange * 1.5) {
        g.isAttacking = false;
        continue;
      }

      g.atkTimer += TICK_DT;
      if (!g.hitDone && g.atkTimer >= g.atkSpeed * g.hitDelay) {
        g.hitDone = true;
        const hpBefore = target.hp;
        target.hp -= g.damage;
        traceEvent('guard_melee_hit', {
          guardId: g.id,
          targetReplayOrder: target.replayOrder ?? null,
          target: traceEntityPayload(target, 'troop'),
          damage: g.damage,
          hpBefore,
          hpAfter: target.hp,
        });
        if (target.hp <= 0) {
          traceEvent('troop_death', {
            troopId: target.id,
            replayOrder: target.replayOrder ?? null,
            troop: target.type,
            damage: g.damage,
            hp: target.hp,
            x: round3(target.x),
            z: round3(target.z),
          });
        }
      }
      if (g.atkTimer >= g.atkSpeed) {
        g.atkTimer -= g.atkSpeed;
        g.hitDone = false;
      }
    }
    for (let i = aliveTroops.length - 1; i >= 0; i--) {
      if (aliveTroops[i].hp <= 0) aliveTroops.splice(i, 1);
    }
    clearDeadOwnerProjectiles(projectiles, 'troop', traceTroopProjectileLost);

    for (const t of aliveTroops) {
      // Retarget throttle — only search every RETARGET_INTERVAL frames (matches client)
      let target = t._currentTarget;
      let targetIsGuard = t._currentTargetIsGuard;

      if (rallyFocus && !isRallyFocusValid(rallyFocus)) {
        rallyFocus = null;
      }

      if (rallyFocus) {
        applyRallyFocus(t, rallyFocus);
        target = rallyFocus.target;
        targetIsGuard = rallyFocus.isGuard;
      } else {

      // Godot only treats dead guards as invalid immediately. Destroyed
      // buildings keep a live node/ruin for a short while, so troops keep
      // their stale building target until their own retarget timer fires or
      // their own projectile/melee hit caused the destroy. Clearing every
      // dead building target here made all server troops retarget in the same
      // tick and choose different attack slots from the client.
      if (target && target.hp <= 0 && targetIsGuard) {
        target = null;
        t._currentTarget = null;
      }

      t._retargetCounter++;
      const periodicRetarget = t._retargetCounter >= RETARGET_INTERVAL;
      if (periodicRetarget) {
        t._retargetCounter %= RETARGET_INTERVAL;
      }
      const shouldRetarget = !target || t._forceRetarget === true || periodicRetarget;

      if (shouldRetarget) {
        t._forceRetarget = false;
        const nearB = findNearestAlive(t.x, t.z, aliveBuildings);
        const nearG = findNearestAlive(t.x, t.z, aliveGuards, { preferWeakOnTie: true });
        let bestTarget = null;
        let bestDistSq = Infinity;
        targetIsGuard = false;

        if (nearB) { bestTarget = nearB.target; bestDistSq = nearB.distSq; }
        if (nearG && nearG.distSq < bestDistSq) {
          bestTarget = nearG.target; bestDistSq = nearG.distSq; targetIsGuard = true;
        }
        if (shouldKeepCurrentTarget(t, bestTarget, bestDistSq)) {
          traceEvent('target_keep', {
            troopId: t.id,
            troop: t.type,
            ...traceTroopStatePayload(t),
            candidate: traceEntityPayload(bestTarget, targetIsGuard ? 'guard' : 'building'),
            candidateDist: Math.round(Math.sqrt(bestDistSq) * 1000) / 1000,
            current: traceEntityPayload(t._currentTarget, t._currentTargetIsGuard ? 'guard' : 'building'),
            currentDist: Math.round(dist2d(t.x, t.z, t._currentTarget.x, t._currentTarget.z) * 1000) / 1000,
          });
          bestTarget = t._currentTarget;
          targetIsGuard = t._currentTargetIsGuard;
        }
        if (t._currentTarget !== bestTarget) {
          const previousTarget = traceEntityPayload(t._currentTarget, t._currentTargetIsGuard ? 'guard' : 'building');
          t._state = 'running';
          t._orbitAngle = 0;
          if (bestTarget) {
            traceEvent('target_switch', {
              troopId: t.id,
              troop: t.type,
              ...traceTroopStatePayload(t),
              targetKind: targetIsGuard ? 'guard' : 'building',
              targetId: bestTarget.id,
              targetType: bestTarget.type || 'guard',
              targetHp: bestTarget.hp,
              previousTarget,
              targetDist: Math.round(Math.sqrt(bestDistSq) * 1000) / 1000,
              targetCandidates: traceTargetCandidatesPayload(t, aliveBuildings, aliveGuards),
              target: traceEntityPayload(bestTarget, targetIsGuard ? 'guard' : 'building'),
              x: Math.round(t.x * 1000) / 1000,
              z: Math.round(t.z * 1000) / 1000,
            });
          }
        }
        target = bestTarget;
        t._currentTarget = target;
        t._currentTargetIsGuard = targetIsGuard;
      }

      // Guard threat check — runs every frame (not throttled, matches client _check_guard_threat)
      if (target && !targetIsGuard) {
        const nearG = findNearestAlive(t.x, t.z, aliveGuards, { preferWeakOnTie: true });
        if (nearG) {
          const threatRadiusSq = (t.range * GUARD_THREAT_MULT) ** 2;
          if (nearG.distSq < threatRadiusSq) {
            if (t._currentTarget !== nearG.target) {
            const previousTarget = traceEntityPayload(t._currentTarget, t._currentTargetIsGuard ? 'guard' : 'building');
            t._state = 'running';
            t._orbitAngle = 0;
            traceEvent('target_switch', {
              troopId: t.id,
              troop: t.type,
              ...traceTroopStatePayload(t),
              targetKind: 'guard',
              targetId: nearG.target.id,
              targetType: 'guard',
              targetHp: nearG.target.hp,
              previousTarget,
              targetDist: Math.round(Math.sqrt(nearG.distSq) * 1000) / 1000,
              targetCandidates: traceTargetCandidatesPayload(t, aliveBuildings, aliveGuards),
              target: traceEntityPayload(nearG.target, 'guard'),
              x: Math.round(t.x * 1000) / 1000,
              z: Math.round(t.z * 1000) / 1000,
            });
          }
            target = nearG.target;
            targetIsGuard = true;
            t._currentTarget = target;
            t._currentTargetIsGuard = true;
          }
        }
      }

      }

      if (!target) {
        cannonEnergy += updateTroopProjectilesFor(t);
        continue;
      }

      const targetDistSq = distSq2d(t.x, t.z, target.x, target.z);
      const targetDist = Math.sqrt(targetDistSq);

      if (t._state === 'attacking' && targetDist > t.range * 2.0) {
        t._state = 'running';
      }

      if (t._state !== 'attacking') {
        const myAngle = Math.atan2(t.x - target.x, t.z - target.z);
        const slot = computeAttackSlot(t, target, aliveTroops);
        const slotDx = slot.x - t.x;
        const slotDz = slot.z - t.z;
        const slotDist = Math.sqrt(slotDx * slotDx + slotDz * slotDz);
        const dirDx = slotDist > 0.01 ? slotDx / slotDist : (target.x - t.x) / (targetDist || 1);
        const dirDz = slotDist > 0.01 ? slotDz / slotDist : (target.z - t.z) / (targetDist || 1);
        applyMovementSteering(
          t,
          dirDx * t.moveSpeed * TICK_DT,
          dirDz * t.moveSpeed * TICK_DT,
          target,
          aliveTroops,
          aliveGuards,
          aliveBuildings,
          defaultGridConfig
        );
        if (slotDist < 0.05 || targetDist <= t.range) {
          t._state = 'attacking';
          t.atkTimer = 0;
          t.hitDone = false;
          cannonEnergy += updateTroopProjectilesFor(t);
          continue;
        }
        checkStuck(t, myAngle);
        cannonEnergy += updateTroopProjectilesFor(t);
        continue;
      }

      t.atkTimer += TICK_DT;

      if (t.melee) {
        if (!t.hitDone && t.atkTimer >= t.atkSpeed * (t.hitDelay || 0.4)) {
          t.hitDone = true;
          const hpBefore = target.hp;
          target.hp -= t.damage;
          traceEvent('troop_melee_hit', {
            troopId: t.id,
            replayOrder: t.replayOrder ?? null,
            troop: t.type,
            targetKind: targetIsGuard ? 'guard' : 'building',
            targetId: target.id,
            targetType: target.type || 'guard',
            target: traceEntityPayload(target, targetIsGuard ? 'guard' : 'building'),
            damage: t.damage,
            hpBefore,
            hpAfter: target.hp,
          });
          if (target.hp <= 0 && target.type) {
            traceBuildingDestroyed(target, 'troop_melee');
            t._forceRetarget = true;
          }
          if (target.hp <= 0 && target.type) cannonEnergy += CANNON_ENERGY_PER_DESTROY;
        }
        if (t.atkTimer >= t.atkSpeed) {
          t.atkTimer -= t.atkSpeed;
          t.hitDone = false;
        }
      } else {
        const shootAt = t.shootDelay > 0 ? t.atkSpeed * t.shootDelay : 0;

        if (t.atkTimer >= t.atkSpeed) {
          t.atkTimer -= t.atkSpeed;
          if (shootAt <= 0) {
            projectiles.push({
              x: t.x, z: t.z,
              y: TROOP_PROJECTILE_SPAWN_Y,
              targetY: TROOP_TARGET_AIM_Y,
              phase: 'troop',
              ownerRef: t,
              ownerTroopId: t.id,
              ownerReplayOrder: t.replayOrder ?? null,
              ownerTroopType: t.type,
              targetRef: target, speed: t.projSpeed, damage: t.damage,
              isBuilding: !!target.type, hitDistSq: PROJ_HIT_DIST_SQ,
            });
            traceEvent('troop_projectile_fire', {
              troopId: t.id,
              replayOrder: t.replayOrder ?? null,
              troop: t.type,
              ...traceTroopStatePayload(t),
              projectileX: round3(t.x),
              projectileZ: round3(t.z),
              target: traceEntityPayload(target, target.type ? 'building' : 'guard'),
              damage: t.damage,
              projectileSpeed: t.projSpeed,
            });
          } else {
            t.hitPending = true;
            t.hitTimer = 0;
            t._pendingTarget = target;
          }
        }
        if (t.hitPending && t.shootDelay > 0) {
          t.hitTimer += TICK_DT;
          if (t.hitTimer >= shootAt) {
            t.hitPending = false;
            const pt = t._pendingTarget || target;
            if (!pt || pt.hp <= 0) {
              traceEvent('troop_projectile_lost_target', {
                reason: !pt ? 'target_missing_before_fire' : 'target_dead_before_fire',
                troopId: t.id,
                replayOrder: t.replayOrder ?? null,
                troop: t.type,
                projectileX: round3(t.x),
                projectileZ: round3(t.z),
              });
              cannonEnergy += updateTroopProjectilesFor(t);
              continue;
            }
            projectiles.push({
              x: t.x, z: t.z,
              y: TROOP_PROJECTILE_SPAWN_Y,
              targetY: TROOP_TARGET_AIM_Y,
              phase: 'troop',
              ownerRef: t,
              ownerTroopId: t.id,
              ownerReplayOrder: t.replayOrder ?? null,
              ownerTroopType: t.type,
              targetRef: pt, speed: t.projSpeed, damage: t.damage,
              isBuilding: !!pt.type, hitDistSq: PROJ_HIT_DIST_SQ,
            });
            traceEvent('troop_projectile_fire', {
              troopId: t.id,
              replayOrder: t.replayOrder ?? null,
              troop: t.type,
              ...traceTroopStatePayload(t),
              projectileX: round3(t.x),
              projectileZ: round3(t.z),
              target: traceEntityPayload(pt, pt.type ? 'building' : 'guard'),
              damage: t.damage,
              projectileSpeed: t.projSpeed,
            });
          }
        }
      }
      cannonEnergy += updateTroopProjectilesFor(t);
      continue;

    }

    // Dead ranged troops clear their own projectile pools in Godot take_damage().
    clearDeadOwnerProjectiles(projectiles, 'troop', traceTroopProjectileLost);

    // Guard AI runs before troop movement above to match Godot scene order.
    for (const g of []) {
      // Find target — detection relative to tombstone
      if (g.targetId == null) {
        let best = null;
        let bestDist = g.detectionRadius;
        for (const t of aliveTroops) {
          const d = dist2d(t.x, t.z, g.tombX, g.tombZ);
          if (d < bestDist) { bestDist = d; best = t; }
        }
        if (best) {
          g.targetId = best.id;
          traceEvent('guard_target_acquired', {
            guardId: g.id,
            target: traceEntityPayload(best, 'troop'),
            distFromTomb: Math.round(bestDist * 1000) / 1000,
          });
        }
      }

      if (g.targetId == null) continue;

      const target = aliveTroops.find(t => t.id === g.targetId);
      if (!target) {
        traceEvent('guard_target_lost', { guardId: g.id, reason: 'target_dead_or_missing' });
        g.targetId = null; g.isAttacking = false; continue;
      }

      // Abandon chase if troop too far from tombstone
      if (dist2d(target.x, target.z, g.tombX, g.tombZ) > g.detectionRadius * 2.0) {
        traceEvent('guard_target_lost', {
          guardId: g.id,
          reason: 'too_far_from_tombstone',
          target: traceEntityPayload(target, 'troop'),
          distFromTomb: Math.round(dist2d(target.x, target.z, g.tombX, g.tombZ) * 1000) / 1000,
        });
        g.targetId = null;
        g.isAttacking = false;
        continue;
      }

      const gDist = dist2d(g.x, g.z, target.x, target.z);

      if (gDist <= g.attackRange) {
        if (!g.isAttacking) {
          g.isAttacking = true;
          g.atkTimer = 0;
          g.hitDone = false;
        }
        g.atkTimer += TICK_DT;
        if (!g.hitDone && g.atkTimer >= g.atkSpeed * g.hitDelay) {
          g.hitDone = true;
          const hpBefore = target.hp;
          target.hp -= g.damage;
          traceEvent('guard_melee_hit', {
            guardId: g.id,
            targetReplayOrder: target.replayOrder ?? null,
            target: traceEntityPayload(target, 'troop'),
            damage: g.damage,
            hpBefore,
            hpAfter: target.hp,
          });
          if (target.hp <= 0) {
            traceEvent('troop_death', {
              troopId: target.id,
              replayOrder: target.replayOrder ?? null,
              troop: target.type,
              damage: g.damage,
              hp: target.hp,
              x: round3(target.x),
              z: round3(target.z),
            });
          }
        }
        if (g.atkTimer >= g.atkSpeed) {
          g.atkTimer -= g.atkSpeed;
          g.hitDone = false;
        }
      } else {
        g.isAttacking = false;
        moveToward(g, target.x, target.z, g.moveSpeed, TICK_DT);
      }
    }

    // ── End conditions ──
    const thCheck = buildings.find(b => b.id === townHallId);
    if (thCheck && thCheck.hp <= 0) break;

    const anyAlive = aliveTroops.length > 0;
    if (!anyAlive && pendingSpawns.length === 0 && pendingCannonballs.length === 0 && actionIdx >= sortedActions.length) break;

    time += TICK_DT;
  }

  // ── Evaluate ──
  const th = buildings.find(b => b.id === townHallId);
  const townHallDestroyed = th ? th.hp <= 0 : false;
  const townHallHpPct = th ? Math.max(0, th.hp) / th.maxHp : 0;
  const resolvedResult = (townHallDestroyed || townHallHpPct <= HP_TOLERANCE) ? 'victory' : 'defeat';
  const buildingsDestroyed = buildings.filter(b => b.hp <= 0).length;
  const casualties = {};
  for (const t of troops) {
    if (t.hp > 0) continue;
    const name = TROOP_NAMES[t.type] || t.type;
    casualties[name] = (casualties[name] || 0) + 1;
  }

  // Debug info for diagnosis
  const _debug = {
    _troopsSpawned: nextTroopId,
    _troopsAlive: troops.filter(t => t.hp > 0).length,
    _guardsAlive: guards.filter(g => g.hp > 0).length,
    _totalProjectilesFired: projectiles.length,
    _pendingSpawnsLeft: pendingSpawns.length,
    _pendingCannonballsLeft: pendingCannonballs.length,
    _cannonShotsAccepted: cannonShotsFired,
    _cannonEventsIgnored: cannonEventsIgnored,
    _rallyDropsUsed: rallyDropsUsed,
    _rallyEventsAccepted: rallyEventsAccepted,
    _rallyEventsIgnored: rallyEventsIgnored,
    _pendingRalliesLeft: pendingRallies.length,
    _rallyFocus: rallyFocus ? {
      type: rallyFocus.isGuard ? 'guard' : rallyFocus.target.type,
      hp: rallyFocus.target.hp,
    } : null,
    _cannonEnergy: cannonEnergy,
    _simTimeSec: Math.round(time * 10) / 10,
    _traceEvents: trace.length,
    _traceDropped: traceDropped,
    casualties,
    _buildingHPs: buildings.map(b => ({ type: b.type, id: b.id, hp: b.hp, maxHp: b.maxHp })),
    _troopEndState: troops.map(t => ({ id: t.id, type: t.type, hp: t.hp, x: Math.round(t.x*100)/100, z: Math.round(t.z*100)/100, state: t._state, target: traceEntityPayload(t._currentTarget, t._currentTargetIsGuard ? 'guard' : 'building') })),
    _aliveTroopDetails: troops.filter(t => t.hp > 0).map(t => ({
      id: t.id,
      type: t.type,
      hp: t.hp,
      x: round3(t.x),
      z: round3(t.z),
      state: t._state,
      target: traceEntityPayload(t._currentTarget, t._currentTargetIsGuard ? 'guard' : 'building'),
    })),
    _aliveGuardDetails: guards.filter(g => g.hp > 0).map(g => ({
      id: g.id,
      hp: g.hp,
      x: round3(g.x),
      z: round3(g.z),
      targetId: g.targetId,
      isAttacking: g.isAttacking,
    })),
  };
  if (debugTrace) _debug._trace = trace;
  console.log('[SIM] Troops spawned:', nextTroopId, '| Alive:', troops.filter(t=>t.hp>0).length, '| Guards alive:', guards.filter(g=>g.hp>0).length);
  console.log('[SIM] Building HPs:', buildings.map(b => `${b.type}:${b.hp}/${b.maxHp}`).join(', '));
  console.log('[SIM] Sim time:', Math.round(time*10)/10, 's | TH HP:', th ? `${th.hp}/${th.maxHp}` : 'N/A', '| Trace:', trace.length, 'dropped:', traceDropped);

  if (claimedResult === 'victory') {
    if (resolvedResult === 'victory') {
      return { valid: true, reason: 'Victory verified', resolvedResult, townHallDestroyed: true, buildingsDestroyed, townHallHpPct, ..._debug };
    }
    return {
      valid: false,
      reason: `TH at ${Math.round(townHallHpPct * 100)}% HP in sim (need ≤${Math.round(HP_TOLERANCE * 100)}%)`,
      resolvedResult, townHallDestroyed: false, buildingsDestroyed, townHallHpPct, ..._debug,
    };
  }

  // Defeat — require at least one ship placed
  const hasShips = sortedActions.some(a => a.type === 'place_ship');
  if (!hasShips) {
    return { valid: false, reason: 'No ships deployed in defeat', resolvedResult };
  }
  if (resolvedResult === 'victory') {
    return { valid: true, reason: 'Server victory: Town Hall destroyed (client claimed defeat)', resolvedResult, townHallDestroyed: true, buildingsDestroyed, townHallHpPct, ..._debug };
  }
  return { valid: true, reason: 'Defeat accepted', resolvedResult, townHallDestroyed: false, buildingsDestroyed, townHallHpPct, ..._debug };
}

module.exports = { verifyReplay };
