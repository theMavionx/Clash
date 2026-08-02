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
  TROOP_STATS, TROOP_SLOT_COSTS, computeNftTroopStats, DEFENSE_STATS, SKELETON_GUARD,
  NECROMANCER_SUMMON, computeNecromancerSkeletonStats, HORROR_EVOLUTION,
  NECROMANCER_ATTACK_RELEASE_SEC, troopMovementProfile,
  WIND_MAGE, WINDLING_STATS, WINDLING_LIFETIME_SEC,
  windMageStableHash, windMageHashUnit,
  MAX_SHIPS, TROOPS_PER_SHIP, MAX_TROOPS, TIME_LIMIT_SEC, SAIL_DELAY_SEC,
  cannonDamageForShipLevel, cannonInitialEnergyForShipLevel, CANNON_ENERGY_PER_DESTROY,
  CANNON_RELOAD_SEC, CANNON_SPEED, CANNON_MIN_FLIGHT_SEC,
  CANNON_START_POS, CANNON_TARGET_Y,
  MEDKIT_UNLOCK_SHIP_LEVEL, MEDKIT_ENERGY_COST, MEDKIT_ENERGY_COST_INCREMENT,
  MEDKIT_TRAVEL_SEC, MEDKIT_DURATION_SEC, MEDKIT_RADIUS, MEDKIT_TICK_SEC,
  MEDKIT_HEAL_PER_TICK,
  FREEZE_DROP, RAGE_DROP, SKELETON_BARREL, escalatingAbilityCost,
  cannonShotCost, VALID_TROOP_TYPES, normalizeNftRarity,
} = require('./combat_defs');
const { BUILDING_DEFS } = require('./db');
const flamethrower = require('./flamethrower_config');
const {
  clampWorldPointToGrid,
  clampWorldPointToGridUnion,
} = require('./combat_grid_config');
const TROOP_PROJECTILE_SPAWN_Y = 0.154; // troop global Y + BaseTroop.PROJECTILE_SPAWN_Y in Godot telemetry
const TROOP_TARGET_AIM_Y = 0.05;       // BaseTroop.TARGET_AIM_Y
const TOWER_PROJECTILE_SPAWN_Y = 0.05;
const TOWER_TARGET_AIM_Y = 0.05;
const TURRET_PROJECTILE_SPAWN_Y = 0.18;
const TURRET_TARGET_AIM_Y = 0.2;
const HARPOON_HIT_DIST_SQ = 0.0009;
const HARPOON_SEARCH_TICKS = 9;
const HARPOON_RELOAD_TICKS = 420;
const HARPOON_PULL_TICKS = 48;
const HARPOON_WINDUP_TICKS = 27;
const HARPOON_IMMUNITY_TICKS = 90;
const HARPOON_YAW_TOLERANCE_RAD = 2 * Math.PI / 180;
const AIR_BOMB_TICK_RATE = 60;
const AIR_BOMB_SPLASH_EDGE_EPSILON = 1e-6;
const AIR_BOMB_TARGET_TIE_EPSILON = 1e-9;

// ---------- Config ----------

const TICK_DT = 1 / 60;            // 60 Hz — matches client framerate
const HP_TOLERANCE = 0.05;         // Max 5% TH HP deviation allowed
const PROJ_HIT_DIST_SQ = 0.0025;   // 0.05² — client HIT_DIST_SQ
const TURRET_HIT_DIST_SQ = 0.0009; // 0.03² — turret tighter hitbox
const GUARD_THREAT_MULT = 1.5;     // Troops switch to guards within range * 1.5
const TROOP_SPAWN_DELAY = 0.2;     // Seconds between each troop from same ship
const RETARGET_INTERVAL = 10;      // Frames between target re-evaluation (matches client)
const DEFENSE_SEARCH_SEC = 0.15;   // Target search interval for defenses (matches client)
const RALLY_MAX_FLIGHT_SEC = 8.0;  // Sanity cap for client-recorded grenade flight time
const TARGET_SWITCH_MIN_ADVANTAGE = 0.08;
const GUARD_TARGET_TIE_DIST = 0.02;
const ATTACK_SLOT_OFFSETS = [-0.0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];
const SLOT_EVAL_INTERVAL_SEC = 6 / 60;
const HIGH_DENSITY_TROOP_THRESHOLD = 24;
const UNIT_TARGET_GROUND = 'ground';
const UNIT_TARGET_AIR = 'air';
const ICE_GOLEM_PRIORITY_DEFENSE_TYPES = new Set([
  'turret',
  'archer_tower',
  'mage_tower',
  'tombstone',
  'mortar',
  'harpoon',
  'flamethrower',
  'air_bomb',
  'cannon',
]);
const ICE_GOLEM_FREEZABLE_DEFENSE_TYPES = new Set([
  ...ICE_GOLEM_PRIORITY_DEFENSE_TYPES,
  'shark_trap',
]);
const TRACE_MAX_EVENTS = Math.max(100, Number(process.env.CLASH_SIM_TRACE_MAX || 20000));
const FLAMETHROWER_STATE = Object.freeze({
  READY: 'ready',
  COOLDOWN: 'cooldown',
  PRIMING: 'priming',
  FIRING: 'firing',
  FROZEN: 'frozen',
  DISABLED: 'disabled',
});
const FLAMETHROWER_TRANSITIONS = Object.freeze({
  [FLAMETHROWER_STATE.READY]: new Set([
    FLAMETHROWER_STATE.PRIMING,
    FLAMETHROWER_STATE.FROZEN,
    FLAMETHROWER_STATE.DISABLED,
  ]),
  [FLAMETHROWER_STATE.COOLDOWN]: new Set([
    FLAMETHROWER_STATE.READY,
    FLAMETHROWER_STATE.PRIMING,
    FLAMETHROWER_STATE.FROZEN,
    FLAMETHROWER_STATE.DISABLED,
  ]),
  [FLAMETHROWER_STATE.PRIMING]: new Set([
    FLAMETHROWER_STATE.READY,
    FLAMETHROWER_STATE.COOLDOWN,
    FLAMETHROWER_STATE.FIRING,
    FLAMETHROWER_STATE.FROZEN,
    FLAMETHROWER_STATE.DISABLED,
  ]),
  [FLAMETHROWER_STATE.FIRING]: new Set([
    FLAMETHROWER_STATE.READY,
    FLAMETHROWER_STATE.COOLDOWN,
    FLAMETHROWER_STATE.FROZEN,
    FLAMETHROWER_STATE.DISABLED,
  ]),
  [FLAMETHROWER_STATE.FROZEN]: new Set([
    FLAMETHROWER_STATE.READY,
    FLAMETHROWER_STATE.COOLDOWN,
    FLAMETHROWER_STATE.DISABLED,
  ]),
  [FLAMETHROWER_STATE.DISABLED]: new Set(),
});
const TROOP_NAMES = {
  knight: 'Knight',
  mage: 'Mage',
  wind_mage: 'WindMage',
  windling: 'Windling',
  necromancer: 'Necromancer',
  necromancer_skeleton: 'NecromancerSkeleton',
  skeleton_barrel_skeleton: 'SkeletonBarrelSkeleton',
  barbarian: 'Barbarian',
  archer: 'Archer',
  pea_shooter: 'PeaShooter',
  ranger: 'Ranger',
  mimic: 'Mimic',
  horror: 'Horror',
  mechanical_dragon: 'MechanicalDragon',
  ice_golem: 'IceGolem',
  demon_king: 'DemonKing',
  fire_dragon: 'FireDragon',
};

const TROOP_TYPE_ALIASES = {
  necromancer: 'necromancer',
  windmage: 'wind_mage',
  wind_mage: 'wind_mage',
  peashooter: 'pea_shooter',
  pea_shooter: 'pea_shooter',
  windling: 'windling',
  necromancerskeleton: 'necromancer_skeleton',
  necromancer_skeleton: 'necromancer_skeleton',
  demonking: 'demon_king',
  demon_king: 'demon_king',
  firedragon: 'fire_dragon',
  fire_dragon: 'fire_dragon',
  mechanicaldragon: 'mechanical_dragon',
  mechanical_dragon: 'mechanical_dragon',
  mechdragon: 'mechanical_dragon',
  icegolem: 'ice_golem',
  ice_golem: 'ice_golem',
  horror: 'horror',
  horrorevolution: 'horror',
  horror_evolution: 'horror',
};

function normalizeTroopTypeName(name) {
  const raw = String(name || '').split(':')[0].toLowerCase();
  return TROOP_TYPE_ALIASES[raw] || raw;
}

function troopSlotCost(name) {
  if (String(name || '') === '_SLOT_FILLER_') return 0;
  const troopType = normalizeTroopTypeName(name);
  return Math.max(1, Math.trunc(Number(TROOP_SLOT_COSTS[troopType]) || 1));
}

function canonicalDefenseBuildingType(type) {
  const value = String(type || '').toLowerCase();
  if (value === 'archertower' || value === 'archtower') return 'archer_tower';
  return value;
}

function isIceGolemPriorityDefense(building) {
  return ICE_GOLEM_PRIORITY_DEFENSE_TYPES.has(canonicalDefenseBuildingType(building?.type));
}

function isIceGolemFreezableDefense(building) {
  return ICE_GOLEM_FREEZABLE_DEFENSE_TYPES.has(canonicalDefenseBuildingType(building?.type));
}

function isNftBackedTroopType(troopType) {
  return troopType === 'demon_king' || troopType === 'fire_dragon';
}

function troopPassesThroughFriendlyUnits(troop) {
  return !!troop?.passThroughFriendlyUnits;
}

function troopEntryLevel(name) {
  const troopType = normalizeTroopTypeName(name);
  if (isNftBackedTroopType(troopType)) return null;
  const match = String(name || '').match(/:L([1-7])(?:$|:)/i);
  return match ? Number(match[1]) : null;
}

function serverTroopLevelFromMap(levels, troopType) {
  if (!levels || typeof levels !== 'object') return null;
  for (const [key, value] of Object.entries(levels)) {
    if (normalizeTroopTypeName(key) !== troopType) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function resolveTroopLevel(rawName, troopType, serverTroopLevels, replayLevel = 1) {
  const maxLevel = Math.max(
    1,
    ...Object.keys(TROOP_STATS[troopType] || {}).map(Number).filter(Number.isFinite)
  );
  const authoritativeLevel = serverTroopLevelFromMap(serverTroopLevels, troopType);
  const requestedLevel = authoritativeLevel
    ?? troopEntryLevel(rawName)
    ?? finiteNumber(replayLevel, 1);
  return Math.max(1, Math.min(maxLevel, Math.trunc(Number(requestedLevel) || 1)));
}

function nftCollectionForTroopType(troopType) {
  if (troopType === 'fire_dragon') return 'dragon';
  if (troopType === 'demon_king') return 'demon_king';
  return null;
}

function nftRarityFromEntry(name) {
  const match = String(name || '').match(/:R(common|epic|legendary|unrevealed)(?:$|:)/i);
  return match ? normalizeNftRarity(match[1]) : null;
}

function nftRarityLookupKey(troopType, name) {
  const collection = nftCollectionForTroopType(troopType);
  const parts = String(name || '').split(':');
  if (!collection || parts.length < 3) return '';
  return `${collection}:${String(parts[1] || '').toLowerCase()}:${String(parts[2] || '')}`.toLowerCase();
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

function isTroopUntargetableToDefenses(troop) {
  if (!troop?.untargetableWhileRunning || troop._state !== 'running') {
    return false;
  }
  return !(
    troop.concealmentEndsOnAttack
    && troop._defenseConcealmentBroken
  );
}

function canDefenseTargetTroop(defense, troop) {
  if (!troop || troop.hp <= 0) return false;
  if (isTroopUntargetableToDefenses(troop)) return false;
  const minRange = Math.max(0, Number(defense?.minRange) || 0);
  if (
    minRange > 0
    && Number.isFinite(Number(defense?.x))
    && Number.isFinite(Number(defense?.z))
    && distSq2d(Number(defense.x), Number(defense.z), troop.x, troop.z) < minRange * minRange
  ) {
    return false;
  }
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

function lerp(a, b, weight) {
  return a + (b - a) * weight;
}

function computeAttackSlot(t, target, aliveTroops) {
  const myAngle = Math.atan2(t.x - target.x, t.z - target.z);
  t._slotEvalTimer = (t._slotEvalTimer || 0) + TICK_DT;
  if (t._slotEvalTimer >= SLOT_EVAL_INTERVAL_SEC) {
    t._slotEvalTimer %= SLOT_EVAL_INTERVAL_SEC;
    const targetTroops = [];
    for (const other of aliveTroops) {
      if (other.hp <= 0 || other._currentTarget !== target) continue;
      targetTroops.push(other);
    }
    if (!t._currentTargetIsGuard && targetTroops.length > HIGH_DENSITY_TROOP_THRESHOLD) {
      const denseIndex = targetTroops.indexOf(t);
      if (denseIndex >= 0) {
        t._orbitAngle = (Math.PI * 2 * denseIndex) / targetTroops.length;
      }
      return {
        x: target.x + Math.sin(t._orbitAngle) * t.range * 0.95,
        z: target.z + Math.cos(t._orbitAngle) * t.range * 0.95,
      };
    }
    const targetAngles = targetTroops.map((other) => (
      Math.atan2(other.x - target.x, other.z - target.z)
    ));
    let bestAngle = myAngle;
    let bestMinDist = 0;
    for (const offset of ATTACK_SLOT_OFFSETS) {
      const testAngle = myAngle + offset;
      let minOtherDist = 999;
      for (let i = 0; i < targetTroops.length; i++) {
        if (targetTroops[i] === t) continue;
        minOtherDist = Math.min(minOtherDist, angleDiff(testAngle, targetAngles[i]));
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

function stableTroopOrder(troop) {
  return Number.isFinite(Number(troop?.replayOrder))
    ? Math.trunc(Number(troop.replayOrder))
    : Math.trunc(Number(troop?.id) || 0);
}

function exactOverlapPush(troop, other) {
  const ownOrder = stableTroopOrder(troop);
  const otherOrder = stableTroopOrder(other);
  const lowOrder = Math.min(ownOrder, otherOrder);
  const highOrder = Math.max(ownOrder, otherOrder);
  const angleIndex = ((lowOrder * 93 + highOrder * 193) % 3600 + 3600) % 3600;
  const angle = angleIndex * Math.PI * 2 / 3600;
  const sign = ownOrder < otherOrder ? 1 : -1;
  return { x: Math.cos(angle) * sign, z: Math.sin(angle) * sign };
}

function computeFriendlySeparation(t, aliveTroops, separationRadius) {
  if (troopPassesThroughFriendlyUnits(t) || separationRadius <= 0) {
    return { x: 0, z: 0 };
  }
  let x = 0;
  let z = 0;
  const radiusSq = separationRadius * separationRadius;
  const dense = aliveTroops.length > HIGH_DENSITY_TROOP_THRESHOLD;
  for (const other of aliveTroops) {
    if (other === t || other.hp <= 0) continue;
    const dx = t.x - other.x;
    const dz = t.z - other.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > radiusSq) continue;
    if (distSq < 0.000001) {
      if (dense) {
        const push = exactOverlapPush(t, other);
        x += push.x;
        z += push.z;
      }
      continue;
    }
    const distance = Math.sqrt(distSq);
    const weight = (separationRadius - distance) / (separationRadius * distance);
    x += dx * weight;
    z += dz * weight;
  }
  return { x, z };
}

function applyMovementSteering(t, moveX, moveZ, target, aliveTroops, aliveGuards, aliveBuildings, movementGridConfigs) {
  let sepX = 0;
  let sepZ = 0;
  const separationRadius = Math.max(0, Number(t.separationRadius) || 0);
  const separationForce = Math.max(0, Number(t.separationForce) || 0);
  const sepRangeSq = separationRadius * separationRadius * 4.0;
  const dense = aliveTroops.length > HIGH_DENSITY_TROOP_THRESHOLD;
  if (dense) {
    t._moveSepCounter = ((t._moveSepCounter || 0) + 1) % 6;
  }
  const recomputeSeparation = !dense || t._moveSepCounter === 0;

  if (separationRadius > 0 && separationForce > 0 && recomputeSeparation) {
    const friendly = computeFriendlySeparation(t, aliveTroops, separationRadius);
    sepX += friendly.x;
    sepZ += friendly.z;

    for (const guard of aliveGuards) {
      if (guard === target || guard.hp <= 0) continue;
      const gx = guard.x - t.x;
      const gz = guard.z - t.z;
      const dsq = gx * gx + gz * gz;
      if (dsq > sepRangeSq || dsq < 0.000001) continue;
      const d = Math.sqrt(dsq);
      if (d < separationRadius) {
        const push = ((separationRadius - d) / separationRadius) * 0.5;
        sepX -= (gx / d) * push;
        sepZ -= (gz / d) * push;
      }

      const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (d < separationRadius * 2.0 && moveLength > 0.0001) {
        const forwardX = moveX / moveLength;
        const forwardZ = moveZ / moveLength;
        const lateralX = -forwardZ;
        const lateralZ = forwardX;
        const guardDirX = gx / d;
        const guardDirZ = gz / d;
        const ahead = guardDirX * forwardX + guardDirZ * forwardZ;
        if (ahead > 0.15) {
          const side = guardDirX * lateralX + guardDirZ * lateralZ;
          const strength = ahead * (1 - d / (separationRadius * 2.0)) * 0.65;
          const sign = side >= 0 ? -1 : 1;
          sepX += lateralX * strength * sign;
          sepZ += lateralZ * strength * sign;
        }
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
    t._lastMoveSeparationX = sepX;
    t._lastMoveSeparationZ = sepZ;
  } else if (dense) {
    sepX = Number(t._lastMoveSeparationX) || 0;
    sepZ = Number(t._lastMoveSeparationZ) || 0;
  }

  t.x += moveX + sepX * separationForce * TICK_DT * 3.0;
  t.z += moveZ + sepZ * separationForce * TICK_DT * 3.0;
  const clamped = clampWorldPointToGridUnion(movementGridConfigs, t, 1.05);
  t.x = clamped.x;
  t.z = clamped.z;
}

function applyTroopAttackSeparation(t, target, aliveTroops, movementGridConfigs) {
  const separationRadius = Math.max(0, Number(t.separationRadius) || 0);
  const separationForce = Math.max(0, Number(t.separationForce) || 0);
  if (
    troopPassesThroughFriendlyUnits(t)
    || separationRadius <= 0
    || separationForce <= 0
  ) {
    t._lastAttackSeparationX = 0;
    t._lastAttackSeparationZ = 0;
    return;
  }
  const dense = aliveTroops.length > HIGH_DENSITY_TROOP_THRESHOLD;
  const interval = dense ? 12 : 3;
  t._sepCounter = (t._sepCounter || 0) + 1;
  let sepX = Number(t._lastAttackSeparationX) || 0;
  let sepZ = Number(t._lastAttackSeparationZ) || 0;
  if (t._sepCounter % interval === 0) {
    const separation = computeFriendlySeparation(t, aliveTroops, separationRadius);
    sepX = separation.x;
    sepZ = separation.z;
    t._lastAttackSeparationX = sepX;
    t._lastAttackSeparationZ = sepZ;
  }
  if (sepX * sepX + sepZ * sepZ <= 0.000001) return;
  const nextX = t.x + sepX * separationForce * TICK_DT * 0.3;
  const nextZ = t.z + sepZ * separationForce * TICK_DT * 0.3;
  if (dist2d(nextX, nextZ, target.x, target.z) >= t.range * 1.2) return;
  const clamped = clampWorldPointToGridUnion(
    movementGridConfigs,
    { x: nextX, z: nextZ },
    1.05,
  );
  t.x = clamped.x;
  t.z = clamped.z;
}

function initialAttackTimer(troop) {
  const troopType = normalizeTroopTypeName(troop?.type);
  if (
    troopType === 'horror'
    || troopType === 'ice_golem'
    || troopType === 'mechanical_dragon'
    || troopType === 'pea_shooter'
    || troopType === 'wind_mage'
    || troopType === 'windling'
  ) {
    return 0;
  }
  if (troop?.melee || troop?.directHit) {
    return troop.atkSpeed * (troop.hitDelay || 0.4);
  }
  // Mage/Archer fire immediately on entering range. Ranger and Necromancer
  // start their release-delay phase immediately, matching their Godot scripts.
  return troop.atkSpeed;
}

function enterTroopAttackState(troop) {
  troop._state = 'attacking';
  troop.atkTimer = initialAttackTimer(troop);
  troop.hitTimer = 0;
  troop.hitPending = false;
  troop.hitDone = false;
  troop.burstShotIndex = 0;
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
    if (
      options.preferReplayOrderOnTie
      && best
      && Math.abs(dsq - bestDistSq) <= 1e-12
      && finiteNumber(t.replayOrder, t.id) < finiteNumber(best.replayOrder, best.id)
    ) {
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

function isCombatTargetBuilding(building) {
  return building?.type !== 'shark_trap';
}

function troopInsideSharkTrap(troop, trap) {
  if (!troop || !trap || troop.flying || troop.hp <= 0 || trap.triggered) return false;
  const dx = troop.x - trap.x;
  const dz = troop.z - trap.z;
  const cos = Math.cos(trap.gridRotation);
  const sin = Math.sin(trap.gridRotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= trap.halfX + trap.padding
    && Math.abs(localZ) <= trap.halfZ + trap.padding;
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
    if (phase === 'defense' && isTroopUntargetableToDefenses(tgt)) {
      if (onLost) onLost(p, 'target_untargetable');
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

function verifyReplay({
  defenderBuildings,
  actions,
  claimedResult,
  gridConfig,
  gridConfigs,
  serverTroopLevels,
  serverShipLevel = 1,
  serverNftRarities = {},
  defenderAltarLevels = {},
  combatSnapshotVersion = null,
  combatRulesVersion = null,
  debugTrace = false,
}) {
  const gridConfigMap = normalizeGridConfigs(gridConfig, gridConfigs);
  const defaultGridConfig = gridConfigMap['0'] || Object.values(gridConfigMap)[0];
  if (!isValidGridConfig(defaultGridConfig)) {
    return { valid: false, reason: 'Missing or invalid grid_config' };
  }
  if (!actions || !Array.isArray(actions)) {
    return { valid: false, reason: 'No actions' };
  }
  const hasFlamethrower = defenderBuildings.some(building => building?.type === flamethrower.BUILDING.id);
  if (hasFlamethrower) {
    if (Number(combatSnapshotVersion) !== 2) {
      return { valid: false, reason: 'Flamethrower requires combat snapshot version 2' };
    }
    if (combatRulesVersion !== flamethrower.CONFIG.combat_rules_version) {
      return { valid: false, reason: 'Missing or unsupported Flamethrower combat rules version' };
    }
    const invalidFacing = defenderBuildings.find(building => (
      building?.type === flamethrower.BUILDING.id
      && !flamethrower.isValidFacingStep(building.facing_step)
    ));
    if (invalidFacing) {
      return { valid: false, reason: `Flamethrower ${invalidFacing.id} has invalid facing_step` };
    }
  }
  const movementGridConfigs = [gridConfigMap['0'], gridConfigMap['2']]
    .filter(isValidGridConfig);
  if (movementGridConfigs.length === 0) movementGridConfigs.push(defaultGridConfig);

  // Init buildings with world coordinates
  const buildings = defenderBuildings.map((b, buildingOrder) => {
    const def = BUILDING_DEFS[b.type];
    const size = def?.size || [2, 2];
    const gridIndex = b.grid_index ?? b.gridIndex ?? 0;
    const gc = gridConfigMap[String(gridIndex)] || defaultGridConfig;
    const pos = gridToWorld(b.grid_x, b.grid_z, size[0], size[1], gc);
    return {
      id: b.id, type: b.type, level: b.level,
      hp: b.hp, maxHp: b.max_hp,
      buildingOrder: Number.isFinite(Number(b.id)) ? Number(b.id) : buildingOrder,
      isUpgrading: !!(b.is_upgrading || b.isUpgrading),
      isUnderConstruction: !!(
        b.is_under_construction
        || b.isUnderConstruction
        || b.under_construction
        || b.underConstruction
      ),
      gridIndex,
      x: pos.x, z: pos.z,
      sizeX: size[0], sizeZ: size[1],
      cellSize: gc.cell_size,
      gridRotation: gc.grid_rotation,
      facingStep: b.facing_step ?? null,
      avoidRadius: Math.max(size[0], size[1]) * gc.cell_size * 0.5 + 0.06,
    };
  });

  const troops = [];
  const guards = [];
  const defenses = [];
  const harpoons = [];
  const flamethrowers = [];
  const airBombs = [];
  const sharkTraps = buildings
    .filter(b => b.type === 'shark_trap')
    .map(b => {
      const damageLevels = BUILDING_DEFS.shark_trap?.damage_levels || [500, 750, 1050, 1450, 2000, 2400, 2900, 3400, 3900];
      const level = Math.max(1, Math.min(damageLevels.length, Number(b.level) || 1));
      return {
        buildingId: b.id,
        level,
        damage: Number(damageLevels[level - 1]) || 500,
        x: b.x,
        z: b.z,
        halfX: b.sizeX * b.cellSize * 0.5,
        halfZ: b.sizeZ * b.cellSize * 0.5,
        gridRotation: b.gridRotation,
        padding: 0.018,
        triggered: false,
        troopId: null,
        frozenUntil: 0,
      };
    })
    .sort((a, b) => Number(a.buildingId) - Number(b.buildingId));
  const projectiles = [];
  const mortarProjectiles = [];
  const airBombProjectiles = [];
  let townHallId = null;
  const wardLevel = Math.max(0, Math.min(3, Number(defenderAltarLevels?.ward) || 0));
  const wardPct = [0, 5, 10, 15][wardLevel] || 0;
  const wardDamage = (damage) => Math.ceil((Number(damage) || 0) * (1 + wardPct / 100));
  let nextTroopId = 0;
  let nextAirBombProjectileId = 1;
  let shipsPlaced = 0;
  let troopsManuallyDeployed = 0;
  let deployedTroopsSpawned = 0;
  let summonsSpawned = 0;
  let summonsActivePeak = 0;
  let windMageWaveHits = 0;
  let windMageSecondaryHits = 0;
  let windlingsSpawned = 0;
  let windlingsExpired = 0;
  let evolutionChildrenSpawned = 0;
  let shipSlotsConsumed = 0;
  const pendingSpawns = [];
  const pendingCannonballs = [];
  const pendingFreezeDrops = [];
  const pendingSkeletonBarrels = [];

  const authoritativeShipLevel = Math.max(1, Math.trunc(Number(serverShipLevel) || 1));
  const cannonDamage = cannonDamageForShipLevel(authoritativeShipLevel);
  let cannonEnergy = cannonInitialEnergyForShipLevel(authoritativeShipLevel);
  let cannonShotsFired = 0;
  let cannonEventsIgnored = 0;
  let cannonReadyAt = 0;
  let rallyDropsUsed = 0;
  let rallyFocus = null;
  let rallyEventsAccepted = 0;
  let rallyEventsIgnored = 0;
  const pendingRallies = [];
  let medkitUses = 0;
  let medkitEventsAccepted = 0;
  let medkitEventsIgnored = 0;
  let medkitHealingApplied = 0;
  let medkitHealTicks = 0;
  const pendingMedkits = [];
  const activeMedkits = [];
  let freezeDropUses = 0;
  let freezeDropEventsAccepted = 0;
  let freezeDropEventsIgnored = 0;
  let freezeDropDefensesAffected = 0;
  let freezeDropTrapsAffected = 0;
  let rageDropUses = 0;
  let rageDropEventsAccepted = 0;
  let rageDropEventsIgnored = 0;
  let rageBoostedTroopTicks = 0;
  let rageBoostedMoveTicks = 0;
  let rageBoostedAttacks = 0;
  let rageBonusDamageApplied = 0;
  let nextRageDropId = 1;
  const pendingRageDrops = [];
  const activeRageDrops = [];
  let skeletonBarrelUses = 0;
  let skeletonBarrelEventsAccepted = 0;
  let skeletonBarrelEventsIgnored = 0;
  let skeletonBarrelImpacts = 0;
  let skeletonBarrelImpactDamageApplied = 0;
  let skeletonBarrelSkeletonsSpawned = 0;
  let skeletonBarrelSkeletonsExpired = 0;
  const trace = [];
  let traceDropped = 0;
  let time = 0;
  let combatTick = 0;
  let simulationEndReason = 'battle_timeout';

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

  function stableTroopReplayOrder(troop) {
    const replayOrder = Number(troop?.replayOrder);
    if (Number.isFinite(replayOrder)) return replayOrder;
    const troopId = Number(troop?.id);
    return Number.isFinite(troopId) ? troopId : Number.MAX_SAFE_INTEGER;
  }

  function shortestAngleDelta(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function harpoonTargetById(targetId) {
    if (targetId == null) return null;
    return troops.find(troop => troop.id === targetId) || null;
  }

  function harpoonTargetValid(defense, troop, options = {}) {
    if (!troop || troop.hp <= 0 || troop.flying !== true) return false;
    if (!canDefenseTargetTroop(defense, troop)) return false;
    const reservation = troop._harpoonReservedBy ?? null;
    if (reservation != null && reservation !== defense.buildingId) return false;
    if (!options.allowImmunity && Number(troop._harpoonImmuneUntilTick || 0) > combatTick) {
      return false;
    }
    const maxRange = Number.isFinite(options.maxRange)
      ? options.maxRange
      : defense.detectRange;
    return distSq2d(defense.x, defense.z, troop.x, troop.z) <= maxRange * maxRange + 1e-12;
  }

  function findHarpoonTarget(defense, aliveTroops) {
    let best = null;
    let bestDistSq = Infinity;
    let bestOrder = Number.MAX_SAFE_INTEGER;
    for (const troop of aliveTroops) {
      if (!harpoonTargetValid(defense, troop)) continue;
      const distanceSq = distSq2d(defense.x, defense.z, troop.x, troop.z);
      const order = stableTroopReplayOrder(troop);
      if (
        distanceSq < bestDistSq - 1e-12
        || (Math.abs(distanceSq - bestDistSq) <= 1e-12 && order < bestOrder)
      ) {
        best = troop;
        bestDistSq = distanceSq;
        bestOrder = order;
      }
    }
    return best;
  }

  function harpoonTraceTarget(defense, troop, extra = {}) {
    return {
      buildingId: defense.buildingId,
      defenseType: 'harpoon',
      level: defense.level,
      targetTroopId: troop?.id ?? null,
      targetTroop: troop?.type ?? null,
      replayOrder: troop?.replayOrder ?? null,
      tick: combatTick,
      x: troop ? round3(troop.x) : null,
      z: troop ? round3(troop.z) : null,
      ...extra,
    };
  }

  function reserveHarpoonTarget(defense, troop) {
    if (!harpoonTargetValid(defense, troop)) return false;
    if (troop._harpoonReservedBy != null && troop._harpoonReservedBy !== defense.buildingId) {
      return false;
    }
    troop._harpoonReservedBy = defense.buildingId;
    defense.reservedTargetId = troop.id;
    return true;
  }

  function releaseHarpoonTarget(defense, troop, reason, grantImmunity) {
    if (troop && troop._harpoonReservedBy === defense.buildingId) {
      troop._harpoonReservedBy = null;
    }
    if (troop && troop._harpoonPulledBy === defense.buildingId) {
      troop._harpoonPulledBy = null;
    }
    let immunityUntilTick = null;
    if (grantImmunity && troop && troop.hp > 0) {
      immunityUntilTick = combatTick + HARPOON_IMMUNITY_TICKS;
      troop._harpoonImmuneUntilTick = Math.max(
        Number(troop._harpoonImmuneUntilTick) || 0,
        immunityUntilTick,
      );
    }
    traceEvent('harpoon_release', harpoonTraceTarget(defense, troop, {
      reason,
      immunityUntilTick,
    }));
    defense.reservedTargetId = null;
    defense.trackedTargetId = null;
    defense.projectile = null;
    defense.pull = null;
    defense.windupTicks = 0;
    defense.impactSucceeded = false;
    defense.state = defense.disabled ? 'disabled' : 'tracking';
  }

  function cancelHarpoonWindup(defense, reason) {
    const target = harpoonTargetById(defense.reservedTargetId);
    traceEvent('harpoon_lock_cancel', harpoonTraceTarget(defense, target, { reason }));
    releaseHarpoonTarget(defense, target, reason, false);
  }

  function loseHarpoonProjectile(defense, reason) {
    const target = harpoonTargetById(defense.reservedTargetId);
    traceEvent('harpoon_projectile_lost', harpoonTraceTarget(defense, target, {
      reason,
      projectileX: defense.projectile ? round3(defense.projectile.x) : null,
      projectileZ: defense.projectile ? round3(defense.projectile.z) : null,
      reloadReadyTick: defense.reloadReadyTick,
    }));
    releaseHarpoonTarget(defense, target, reason, false);
  }

  function endHarpoonPull(defense, reason) {
    const target = harpoonTargetById(defense.reservedTargetId);
    const pull = defense.pull;
    traceEvent('harpoon_pull_end', harpoonTraceTarget(defense, target, {
      reason,
      startDistance: pull ? round3(pull.startDistance) : null,
      finalDistance: target
        ? round3(dist2d(defense.x, defense.z, target.x, target.z))
        : null,
      durationTicks: pull?.ticks ?? 0,
      finalX: target ? round3(target.x) : null,
      finalZ: target ? round3(target.z) : null,
    }));
    releaseHarpoonTarget(defense, target, reason, defense.impactSucceeded === true);
  }

  function interruptHarpoon(defense, reason, permanent = false) {
    if (!defense || defense.disabled) return;
    if (permanent) defense.disabled = true;
    if (defense.state === 'windup') {
      cancelHarpoonWindup(defense, reason);
      return;
    }
    if (defense.state === 'projectile') {
      loseHarpoonProjectile(defense, reason);
      return;
    }
    if (defense.state === 'pull') {
      endHarpoonPull(defense, reason);
      return;
    }
    defense.trackedTargetId = null;
    defense.state = defense.disabled ? 'disabled' : 'tracking';
  }

  function updateHarpoonYaw(defense, target) {
    if (!target) return Infinity;
    const desiredYaw = Math.atan2(target.x - defense.x, target.z - defense.z);
    const delta = shortestAngleDelta(defense.currentYaw, desiredYaw);
    const maxStep = Number(defense.yawSpeedDeg || 120) * Math.PI / 180 * TICK_DT;
    defense.currentYaw += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
    return Math.abs(shortestAngleDelta(defense.currentYaw, desiredYaw));
  }

  function fireHarpoon(defense, target) {
    defense.state = 'projectile';
    defense.windupTicks = 0;
    defense.lastFireTick = combatTick;
    defense.reloadReadyTick = combatTick + HARPOON_RELOAD_TICKS;
    defense.projectile = {
      x: defense.x,
      z: defense.z,
      targetId: target.id,
    };
    traceEvent('harpoon_fire', harpoonTraceTarget(defense, target, {
      fireTick: combatTick,
      reloadReadyTick: defense.reloadReadyTick,
      projectileX: round3(defense.x),
      projectileZ: round3(defense.z),
      range: defense.detectRange,
      damage: defense.damage,
    }));
  }

  function applyHarpoonPullTick(defense) {
    const target = harpoonTargetById(defense.reservedTargetId);
    const maxRange = defense.detectRange + 0.25;
    if (!harpoonTargetValid(defense, target, { allowImmunity: true, maxRange })) {
      endHarpoonPull(defense, !target || target.hp <= 0 ? 'target_dead_or_missing' : 'target_invalid');
      return;
    }
    const dx = defense.x - target.x;
    const dz = defense.z - target.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance <= defense.stopDistance + 1e-12) {
      endHarpoonPull(defense, 'stop_ring');
      return;
    }
    const step = Math.min(defense.pullSpeed * TICK_DT, distance - defense.stopDistance);
    const intended = {
      x: target.x + (dx / distance) * step,
      z: target.z + (dz / distance) * step,
    };
    const legal = clampWorldPointToGridUnion(movementGridConfigs, intended, 1.05);
    const beforeDistance = distance;
    target.x = legal.x;
    target.z = legal.z;
    const afterDistance = dist2d(defense.x, defense.z, target.x, target.z);
    defense.pull.ticks += 1;
    if (beforeDistance - afterDistance <= 1e-12) {
      defense.pull.noProgressTicks += 1;
    } else {
      defense.pull.noProgressTicks = 0;
    }
    if (afterDistance <= defense.stopDistance + 1e-9) {
      endHarpoonPull(defense, 'stop_ring');
    } else if (defense.pull.noProgressTicks >= 2) {
      endHarpoonPull(defense, 'combat_bounds');
    } else if (defense.pull.ticks >= HARPOON_PULL_TICKS) {
      endHarpoonPull(defense, 'duration');
    }
  }

  function impactHarpoon(defense, target) {
    const hpBefore = target.hp;
    target.hp -= defense.damage;
    defense.impactSucceeded = true;
    defense.projectile = null;
    traceEvent('harpoon_impact', harpoonTraceTarget(defense, target, {
      damage: defense.damage,
      baseDamage: defense.baseDamage,
      hpBefore,
      hpAfter: target.hp,
      impactX: round3(target.x),
      impactZ: round3(target.z),
    }));
    if (target.hp <= 0) {
      handleTroopDeath(target, 'harpoon_impact', defense.damage);
      releaseHarpoonTarget(defense, target, 'impact_kill', false);
      return;
    }
    const distance = dist2d(defense.x, defense.z, target.x, target.z);
    if (distance <= defense.stopDistance + 1e-12) {
      releaseHarpoonTarget(defense, target, 'already_inside_stop_ring', true);
      return;
    }
    defense.state = 'pull';
    defense.pull = {
      targetId: target.id,
      startDistance: distance,
      ticks: 0,
      noProgressTicks: 0,
    };
    target._harpoonPulledBy = defense.buildingId;
    traceEvent('harpoon_pull_start', harpoonTraceTarget(defense, target, {
      startDistance: round3(distance),
      pullSpeed: defense.pullSpeed,
      stopDistance: defense.stopDistance,
      durationCapTicks: HARPOON_PULL_TICKS,
    }));
    applyHarpoonPullTick(defense);
  }

  function updateHarpoonProjectile(defense) {
    const target = harpoonTargetById(defense.reservedTargetId);
    const maxRange = defense.detectRange + 0.25;
    if (!harpoonTargetValid(defense, target, { allowImmunity: true, maxRange })) {
      loseHarpoonProjectile(defense, !target || target.hp <= 0 ? 'target_dead_or_missing' : 'target_invalid');
      return;
    }
    const projectile = defense.projectile;
    const dx = target.x - projectile.x;
    const dz = target.z - projectile.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > 0) {
      const step = Math.min(defense.projSpeed * TICK_DT, distance);
      projectile.x += (dx / distance) * step;
      projectile.z += (dz / distance) * step;
    }
    if (distSq2d(projectile.x, projectile.z, target.x, target.z) <= HARPOON_HIT_DIST_SQ) {
      impactHarpoon(defense, target);
    }
  }

  function updateHarpoon(defense, aliveTroops) {
    if (defense.disabled) return;
    const owner = buildings.find(building => building.id === defense.buildingId);
    if (!owner || owner.hp <= 0) {
      interruptHarpoon(defense, 'building_destroyed', true);
      return;
    }
    const frozen = (Number(defense.frozenUntil) || 0) > time;
    if (frozen && ['windup', 'projectile', 'pull'].includes(defense.state)) {
      interruptHarpoon(defense, 'freeze');
    }
    if (defense.state === 'projectile') {
      updateHarpoonProjectile(defense);
      return;
    }
    if (defense.state === 'pull') {
      applyHarpoonPullTick(defense);
      return;
    }
    if (defense.state === 'windup') {
      const target = harpoonTargetById(defense.reservedTargetId);
      if (!harpoonTargetValid(defense, target, { allowImmunity: true })) {
        cancelHarpoonWindup(defense, 'target_invalid');
        return;
      }
      const yawError = updateHarpoonYaw(defense, target);
      if (frozen) {
        cancelHarpoonWindup(defense, 'freeze');
      } else if (yawError <= HARPOON_YAW_TOLERANCE_RAD + 1e-12) {
        defense.windupTicks += 1;
        if (
          defense.windupTicks >= HARPOON_WINDUP_TICKS
          && combatTick >= defense.reloadReadyTick
        ) {
          fireHarpoon(defense, target);
        }
      } else {
        defense.windupTicks = 0;
      }
      return;
    }

    defense.searchTicks += 1;
    let tracked = harpoonTargetById(defense.trackedTargetId);
    if (!harpoonTargetValid(defense, tracked)) {
      tracked = null;
      defense.trackedTargetId = null;
    }
    if (defense.searchTicks >= HARPOON_SEARCH_TICKS) {
      defense.searchTicks = 0;
      tracked = findHarpoonTarget(defense, aliveTroops);
      defense.trackedTargetId = tracked?.id ?? null;
    }
    if (!tracked) return;
    const yawError = updateHarpoonYaw(defense, tracked);
    if (frozen) return;
    if (combatTick < defense.reloadReadyTick - HARPOON_WINDUP_TICKS) return;
    if (yawError > HARPOON_YAW_TOLERANCE_RAD + 1e-12) return;
    if (!reserveHarpoonTarget(defense, tracked)) return;
    defense.state = 'windup';
    defense.windupTicks = 0;
    traceEvent('harpoon_lock', harpoonTraceTarget(defense, tracked, {
      yawErrorDeg: round3(yawError * 180 / Math.PI),
      reloadReadyTick: defense.reloadReadyTick,
      windupTicks: HARPOON_WINDUP_TICKS,
    }));
  }

  // Dedicated fixed-tick Air Bomb simulation implementing
  // design/gdd/air-bomb-defense.md. It deliberately does not use the generic
  // homing projectile pool: target loss, owner loss, segment collision,
  // limited turning, and air-only splash all have different authority rules.
  function compareStableTroops(left, right) {
    const orderDelta = stableTroopReplayOrder(left) - stableTroopReplayOrder(right);
    if (orderDelta !== 0) return orderDelta;
    const leftId = Number(left?.id);
    const rightId = Number(right?.id);
    if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
  }

  function airBombTargetValid(troop) {
    return !!(
      troop
      && troop.hp > 0
      && troop.flying === true
      && !isTroopUntargetableToDefenses(troop)
    );
  }

  function findAirBombTargetFromPosition(originX, originZ, range, candidates) {
    const rangeSq = range * range;
    let best = null;
    let bestDistanceSq = Infinity;
    for (const troop of candidates) {
      if (!airBombTargetValid(troop)) continue;
      const distanceSq = distSq2d(originX, originZ, troop.x, troop.z);
      if (distanceSq > rangeSq + AIR_BOMB_TARGET_TIE_EPSILON) continue;
      if (
        distanceSq < bestDistanceSq - AIR_BOMB_TARGET_TIE_EPSILON
        || (
          Math.abs(distanceSq - bestDistanceSq) <= AIR_BOMB_TARGET_TIE_EPSILON
          && (!best || compareStableTroops(troop, best) < 0)
        )
      ) {
        best = troop;
        bestDistanceSq = distanceSq;
      }
    }
    return best;
  }

  function findAirBombTarget(defense, aliveTroops) {
    return findAirBombTargetFromPosition(
      defense.x,
      defense.z,
      defense.detectRange,
      aliveTroops,
    );
  }

  function findAirBombRetarget(projectile) {
    return findAirBombTargetFromPosition(
      projectile.x,
      projectile.z,
      projectile.retargetRange,
      troops,
    );
  }

  function segmentIntersectsHorizontalCircle(startX, startZ, endX, endZ, centerX, centerZ, radius) {
    const segmentX = endX - startX;
    const segmentZ = endZ - startZ;
    const lengthSq = segmentX * segmentX + segmentZ * segmentZ;
    let amount = 0;
    if (lengthSq > 1e-18) {
      amount = clamp(
        ((centerX - startX) * segmentX + (centerZ - startZ) * segmentZ) / lengthSq,
        0,
        1,
      );
    }
    const closestX = startX + segmentX * amount;
    const closestZ = startZ + segmentZ * amount;
    return distSq2d(closestX, closestZ, centerX, centerZ) <= radius * radius + 1e-12;
  }

  function airBombTracePayload(projectile, extra = {}) {
    return {
      defenseType: 'air_bomb',
      projectileId: projectile.projectileId,
      buildingId: projectile.buildingId,
      buildingOrder: projectile.buildingOrder,
      level: projectile.level,
      targetTroopId: projectile.targetTroopId,
      targetTroop: projectile.targetTroop,
      replayOrder: projectile.targetReplayOrder,
      targetReplayOrder: projectile.targetReplayOrder,
      launchTick: projectile.launchTick,
      tick: combatTick,
      ageTicks: projectile.ageTicks,
      flightAgeTicks: projectile.flightAgeTicks,
      riseTicks: projectile.riseTicks,
      phase: projectile.riseRemainingTicks > 0 ? 'rise' : 'homing',
      projectileX: round3(projectile.x),
      projectileZ: round3(projectile.z),
      heading: Math.round(projectile.heading * 1000000) / 1000000,
      damage: projectile.damage,
      splashRadius: projectile.splashRadius,
      retargetRange: projectile.retargetRange,
      retargetCount: projectile.retargetCount,
      ammoSide: projectile.ammoSide,
      ...extra,
    };
  }

  function cleanupAirBombProjectile(projectile, reason) {
    const defense = projectile.ownerDefense;
    if (defense?.activeProjectileId === projectile.projectileId) {
      defense.activeProjectileId = null;
    }
    traceEvent('air_bomb_cleanup', airBombTracePayload(projectile, {
      reason,
      impacted: reason === 'impact',
      targetLost: projectile.targetLost,
    }));
  }

  function impactAirBombProjectile(projectile) {
    const impactX = projectile.x;
    const impactZ = projectile.z;
    const radius = projectile.splashRadius;
    const affected = [];
    const candidates = troops
      .filter(troop => troop.hp > 0 && troop.flying === true)
      .sort(compareStableTroops);

    for (const troop of candidates) {
      const distance = dist2d(impactX, impactZ, troop.x, troop.z);
      if (distance > radius + AIR_BOMB_SPLASH_EDGE_EPSILON) continue;
      const multiplier = 1 - 0.5 * clamp(distance / Math.max(radius, 0.001), 0, 1);
      // Suppress representational noise at authored boundaries (for example
      // exactly R/2 or R) without changing mathematical ceiling semantics.
      const appliedDamage = Math.ceil(projectile.damage * multiplier - 1e-9);
      const hpBefore = troop.hp;
      troop.hp -= appliedDamage;
      affected.push({
        troop,
        targetTroopId: troop.id,
        targetTroop: troop.type,
        replayOrder: troop.replayOrder ?? null,
        distance,
        multiplier,
        appliedDamage,
        hpBefore,
        hpAfter: troop.hp,
      });
    }

    traceEvent('air_bomb_impact', airBombTracePayload(projectile, {
      impactX: round3(impactX),
      impactZ: round3(impactZ),
      hitCount: affected.length,
      affectedUnits: affected.map(hit => ({
        targetTroopId: hit.targetTroopId,
        targetTroop: hit.targetTroop,
        replayOrder: hit.replayOrder,
        distance: round3(hit.distance),
        multiplier: Math.round(hit.multiplier * 1000000) / 1000000,
        appliedDamage: hit.appliedDamage,
        hpBefore: hit.hpBefore,
        hpAfter: hit.hpAfter,
      })),
    }));

    for (const hit of affected) {
      traceEvent('air_bomb_splash_hit', airBombTracePayload(projectile, {
        targetTroopId: hit.targetTroopId,
        targetTroop: hit.targetTroop,
        replayOrder: hit.replayOrder,
        targetReplayOrder: hit.replayOrder,
        impactX: round3(impactX),
        impactZ: round3(impactZ),
        distance: round3(hit.distance),
        multiplier: Math.round(hit.multiplier * 1000000) / 1000000,
        appliedDamage: hit.appliedDamage,
        hpBefore: hit.hpBefore,
        hpAfter: hit.hpAfter,
        x: round3(hit.troop.x),
        z: round3(hit.troop.z),
      }));
      if (hit.hpAfter <= 0) {
        handleTroopDeath(hit.troop, 'air_bomb_splash', hit.appliedDamage);
      }
    }
  }

  function updateAirBombProjectiles() {
    const remaining = [];
    for (const projectile of airBombProjectiles) {
      let target = projectile.targetRef;
      if (!airBombTargetValid(target)) {
        const previousTargetTroopId = projectile.targetTroopId;
        const previousTargetTroop = projectile.targetTroop;
        const previousTargetReplayOrder = projectile.targetReplayOrder;
        projectile.targetLost = true;
        traceEvent('air_bomb_target_lost', airBombTracePayload(projectile, {
          reason: 'target_dead_or_invalid',
          previousTargetTroopId,
          previousTargetTroop,
          previousTargetReplayOrder,
        }));

        const replacement = findAirBombRetarget(projectile);
        if (!replacement) {
          projectile.targetRef = null;
          cleanupAirBombProjectile(projectile, 'no_retarget_candidate');
          continue;
        }

        projectile.targetRef = replacement;
        projectile.targetTroopId = replacement.id;
        projectile.targetTroop = replacement.type;
        projectile.targetReplayOrder = replacement.replayOrder ?? null;
        projectile.retargetCount += 1;
        target = replacement;
        traceEvent('air_bomb_retarget', airBombTracePayload(projectile, {
          previousTargetTroopId,
          previousTargetTroop,
          previousTargetReplayOrder,
        }));
      }

      if (projectile.riseRemainingTicks > 0) {
        projectile.riseRemainingTicks -= 1;
        projectile.ageTicks += 1;
        if (projectile.riseRemainingTicks === 0) {
          traceEvent('air_bomb_rise_complete', airBombTracePayload(projectile));
        }
        remaining.push(projectile);
        continue;
      }

      const desiredHeading = Math.atan2(target.z - projectile.z, target.x - projectile.x);
      const headingDelta = shortestAngleDelta(projectile.heading, desiredHeading);
      const turnStep = projectile.turnSpeedDeg * Math.PI / 180 / AIR_BOMB_TICK_RATE;
      projectile.heading += Math.sign(headingDelta) * Math.min(Math.abs(headingDelta), turnStep);

      const startX = projectile.x;
      const startZ = projectile.z;
      const movement = projectile.speed / AIR_BOMB_TICK_RATE;
      const endX = startX + Math.cos(projectile.heading) * movement;
      const endZ = startZ + Math.sin(projectile.heading) * movement;
      projectile.x = endX;
      projectile.z = endZ;
      projectile.ageTicks += 1;
      projectile.flightAgeTicks += 1;

      if (
        segmentIntersectsHorizontalCircle(
          startX,
          startZ,
          endX,
          endZ,
          target.x,
          target.z,
          projectile.hitRadius,
        )
      ) {
        // Collision is authored by the segment test; snap the authoritative
        // blast center to the intercepted target so the primary unit receives
        // the documented center damage and render interpolation cannot skew it.
        projectile.x = target.x;
        projectile.z = target.z;
        impactAirBombProjectile(projectile);
        cleanupAirBombProjectile(projectile, 'impact');
        continue;
      }

      if (projectile.flightAgeTicks >= projectile.maxLifetimeTicks) {
        cleanupAirBombProjectile(projectile, 'max_lifetime');
        continue;
      }
      remaining.push(projectile);
    }
    airBombProjectiles.splice(0, airBombProjectiles.length, ...remaining);
  }

  function fireAirBomb(defense, target) {
    const heading = Math.atan2(target.z - defense.z, target.x - defense.x);
    const ammoSide = 0;
    defense.lastFireTick = combatTick;
    defense.reloadReadyTick = combatTick + defense.reloadTicks;
    defense.reloadReadyEmitted = false;
    defense.targetId = target.id;
    const projectile = {
      projectileId: nextAirBombProjectileId++,
      ownerDefense: defense,
      buildingId: defense.buildingId,
      buildingOrder: defense.buildingOrder,
      level: defense.level,
      targetRef: target,
      targetTroopId: target.id,
      targetTroop: target.type,
      targetReplayOrder: target.replayOrder ?? null,
      launchTick: combatTick,
      x: defense.x,
      z: defense.z,
      heading,
      ageTicks: 0,
      flightAgeTicks: 0,
      riseTicks: defense.riseTicks,
      riseRemainingTicks: defense.riseTicks,
      speed: defense.projSpeed,
      turnSpeedDeg: defense.turnSpeedDeg,
      hitRadius: defense.hitRadius,
      maxLifetimeTicks: defense.maxLifetimeTicks,
      retargetRange: defense.detectRange,
      damage: defense.damage,
      splashRadius: defense.splashRadius,
      ammoSide,
      targetLost: false,
      retargetCount: 0,
    };
    defense.activeProjectileId = projectile.projectileId;
    airBombProjectiles.push(projectile);
    traceEvent('air_bomb_fire', airBombTracePayload(projectile, {
      range: defense.detectRange,
      reloadReadyTick: defense.reloadReadyTick,
    }));
  }

  function updateAirBombDefenses(aliveTroops) {
    for (const defense of airBombs) {
      const owner = buildings.find(building => building.id === defense.buildingId);
      if (!owner || owner.hp <= 0 || owner.isUpgrading || owner.isUnderConstruction) continue;

      if (
        defense.lastFireTick != null
        && !defense.reloadReadyEmitted
        && combatTick >= defense.reloadReadyTick
      ) {
        defense.reloadReadyEmitted = true;
        traceEvent('air_bomb_reload_ready', {
          defenseType: 'air_bomb',
          buildingId: defense.buildingId,
          buildingOrder: defense.buildingOrder,
          level: defense.level,
          tick: combatTick,
          launchTick: defense.lastFireTick,
          reloadReadyTick: defense.reloadReadyTick,
          ammoSide: 0,
        });
      }

      const frozen = (Number(defense.frozenUntil) || 0) > time;
      if (combatTick >= defense.nextScanTick) {
        defense.nextScanTick = combatTick + defense.scanTicks;
        if (!frozen) {
          defense.targetId = findAirBombTarget(defense, aliveTroops)?.id ?? null;
        }
      }
      if (frozen || defense.activeProjectileId != null || combatTick < defense.reloadReadyTick) {
        continue;
      }

      const target = aliveTroops.find(troop => troop.id === defense.targetId) || null;
      if (!airBombTargetValid(target)) {
        defense.targetId = null;
        continue;
      }
      const inRange = (
        distSq2d(defense.x, defense.z, target.x, target.z)
        <= defense.detectRange * defense.detectRange + AIR_BOMB_TARGET_TIE_EPSILON
      );
      if (!inRange) {
        defense.targetId = null;
        continue;
      }
      fireAirBomb(defense, target);
    }
  }

  function transitionFlamethrower(defense, nextState) {
    if (defense.state === nextState) return;
    const allowed = FLAMETHROWER_TRANSITIONS[defense.state];
    if (!allowed?.has(nextState)) {
      throw new Error(`Invalid Flamethrower transition ${defense.state} -> ${nextState}`);
    }
    defense.state = nextState;
  }

  function flamethrowerEligibleTroops(defense, aliveTroops) {
    return aliveTroops
      .filter(troop => (
        troop
        && troop.hp > 0
        && troop._state !== 'dead'
        && troop.active !== false
        && troop.hostile !== false
        && canDefenseTargetTroop({ targetGround: true, targetAir: false }, troop)
        && flamethrower.isPointInCone(
          { x: defense.x, z: defense.z },
          defense.forwardXZ,
          defense.range,
          { x: troop.x, z: troop.z },
        )
      ))
      .sort(compareStableTroops);
  }

  function flamethrowerStreamEnd(defense, reason) {
    if (defense.state !== FLAMETHROWER_STATE.FIRING) return;
    traceEvent('flamethrower_stream_end', {
      defenseType: 'flamethrower',
      buildingId: defense.buildingId,
      buildingOrder: defense.buildingOrder,
      level: defense.level,
      tick: combatTick,
      streamIndex: defense.streamIndex,
      startTick: defense.streamStartTick,
      endTick: defense.streamEndTick,
      readyTick: defense.nextStreamReadyTick,
      reason,
      scheduledTicks: flamethrower.COMBAT_RULES.damage_offsets.length,
      resolvedTicks: defense.resolvedDamageOffsets.size,
      uniqueTargets: Array.from(defense.uniqueTargets).sort((left, right) => String(left).localeCompare(String(right))),
      damage: defense.streamDamage,
      kills: defense.streamKills,
    });
    transitionFlamethrower(
      defense,
      combatTick >= defense.nextStreamReadyTick
        ? FLAMETHROWER_STATE.READY
        : FLAMETHROWER_STATE.COOLDOWN,
    );
    defense.nextScanTick = Math.max(
      combatTick,
      defense.nextStreamReadyTick - flamethrower.COMBAT_RULES.prime_ticks,
    );
  }

  function cancelFlamethrowerPrime(defense, reason, nextState = null) {
    if (defense.state !== FLAMETHROWER_STATE.PRIMING) return;
    traceEvent('flamethrower_prime_cancel', {
      defenseType: 'flamethrower',
      buildingId: defense.buildingId,
      buildingOrder: defense.buildingOrder,
      level: defense.level,
      facingStep: defense.facingStep,
      tick: combatTick,
      primeStartTick: defense.primeStartTick,
      primeReadyTick: defense.primeReadyTick,
      reason,
    });
    transitionFlamethrower(
      defense,
      nextState || (
        combatTick >= defense.nextStreamReadyTick
          ? FLAMETHROWER_STATE.READY
          : FLAMETHROWER_STATE.COOLDOWN
      ),
    );
  }

  function interruptFlamethrower(defense, reason, permanent = false) {
    if (!defense || defense.state === FLAMETHROWER_STATE.DISABLED) return;
    if (defense.state === FLAMETHROWER_STATE.PRIMING) {
      cancelFlamethrowerPrime(
        defense,
        reason,
        permanent ? FLAMETHROWER_STATE.DISABLED : FLAMETHROWER_STATE.FROZEN,
      );
    } else if (defense.state === FLAMETHROWER_STATE.FIRING) {
      flamethrowerStreamEnd(defense, reason);
      if (permanent) transitionFlamethrower(defense, FLAMETHROWER_STATE.DISABLED);
      else transitionFlamethrower(defense, FLAMETHROWER_STATE.FROZEN);
    } else {
      transitionFlamethrower(
        defense,
        permanent ? FLAMETHROWER_STATE.DISABLED : FLAMETHROWER_STATE.FROZEN,
      );
    }
    if (permanent) defense.permanentlyDisabled = true;
  }

  function resolveFlamethrowerDamageTick(defense, aliveTroops, offset) {
    if (defense.resolvedDamageOffsets.has(offset)) return;
    defense.resolvedDamageOffsets.add(offset);
    const eligible = flamethrowerEligibleTroops(defense, aliveTroops);
    const hits = eligible.map(troop => {
      const hpBefore = troop.hp;
      troop.hp -= defense.damage;
      defense.uniqueTargets.add(troop.id);
      defense.streamDamage += defense.damage;
      return {
        troop,
        hpBefore,
        hpAfter: troop.hp,
        killed: troop.hp <= 0,
      };
    });
    const kills = [];
    for (const hit of hits) {
      if (!hit.killed) continue;
      kills.push(hit.troop.id);
      defense.streamKills += 1;
      handleTroopDeath(hit.troop, 'flamethrower_damage_tick', defense.damage);
    }
    traceEvent('flamethrower_damage_tick', {
      defenseType: 'flamethrower',
      buildingId: defense.buildingId,
      buildingOrder: defense.buildingOrder,
      level: defense.level,
      facingStep: defense.facingStep,
      tick: combatTick,
      streamIndex: defense.streamIndex,
      streamStartTick: defense.streamStartTick,
      offset,
      damage: defense.damage,
      baseDamage: defense.baseTickDamage,
      wardBonusPct: wardPct,
      hitIds: hits.map(hit => hit.troop.id),
      hitTypes: hits.map(hit => hit.troop.type),
      replayOrders: hits.map(hit => hit.troop.replayOrder ?? null),
      hitCount: hits.length,
      totalDamage: hits.length * defense.damage,
      kills,
      empty: hits.length === 0,
    });
  }

  function startFlamethrowerStream(defense, aliveTroops) {
    transitionFlamethrower(defense, FLAMETHROWER_STATE.FIRING);
    defense.streamStartTick = combatTick;
    defense.streamEndTick = combatTick + flamethrower.COMBAT_RULES.stream_ticks;
    defense.nextStreamReadyTick = combatTick + flamethrower.COMBAT_RULES.cycle_ticks;
    defense.cooldownReadyEmitted = false;
    defense.streamIndex += 1;
    defense.resolvedDamageOffsets = new Set();
    defense.uniqueTargets = new Set();
    defense.streamDamage = 0;
    defense.streamKills = 0;
    const trigger = flamethrowerEligibleTroops(defense, aliveTroops)[0] || null;
    traceEvent('flamethrower_stream_start', {
      defenseType: 'flamethrower',
      buildingId: defense.buildingId,
      buildingOrder: defense.buildingOrder,
      level: defense.level,
      facingStep: defense.facingStep,
      tick: combatTick,
      streamIndex: defense.streamIndex,
      startTick: defense.streamStartTick,
      endTick: defense.streamEndTick,
      readyTick: defense.nextStreamReadyTick,
      range: defense.range,
      damage: defense.damage,
      baseDamage: defense.baseTickDamage,
      wardBonusPct: wardPct,
      triggerTroopId: trigger?.id ?? null,
      triggerReplayOrder: trigger?.replayOrder ?? null,
    });
    resolveFlamethrowerDamageTick(defense, aliveTroops, 0);
  }

  function updateFlamethrowerDefense(defense, aliveTroops) {
    if (defense.state === FLAMETHROWER_STATE.DISABLED) return;
    const owner = buildings.find(building => building.id === defense.buildingId);
    if (!owner || owner.hp <= 0 || owner.isUpgrading || owner.isUnderConstruction) {
      interruptFlamethrower(defense, owner?.hp <= 0 ? 'destroyed' : 'inactive', true);
      return;
    }

    defense.frozenUntilTick = Math.max(
      defense.frozenUntilTick,
      Math.ceil((Number(defense.frozenUntil) || 0) * flamethrower.COMBAT_RULES.tick_rate - 1e-9),
    );
    const frozen = combatTick < defense.frozenUntilTick;
    if (frozen) {
      if (defense.state !== FLAMETHROWER_STATE.FROZEN) {
        interruptFlamethrower(defense, 'freeze', false);
      }
      return;
    }
    if (defense.state === FLAMETHROWER_STATE.FROZEN) {
      transitionFlamethrower(
        defense,
        combatTick >= defense.nextStreamReadyTick
          ? FLAMETHROWER_STATE.READY
          : FLAMETHROWER_STATE.COOLDOWN,
      );
      defense.nextScanTick = combatTick;
    }

    if (
      !defense.cooldownReadyEmitted
      && defense.nextStreamReadyTick > 0
      && combatTick >= defense.nextStreamReadyTick
    ) {
      defense.cooldownReadyEmitted = true;
      traceEvent('flamethrower_cooldown_ready', {
        defenseType: 'flamethrower',
        buildingId: defense.buildingId,
        buildingOrder: defense.buildingOrder,
        level: defense.level,
        tick: combatTick,
        readyTick: defense.nextStreamReadyTick,
      });
      if (defense.state === FLAMETHROWER_STATE.COOLDOWN) {
        transitionFlamethrower(defense, FLAMETHROWER_STATE.READY);
      }
    }

    if (defense.state === FLAMETHROWER_STATE.PRIMING) {
      const eligible = flamethrowerEligibleTroops(defense, aliveTroops);
      if (eligible.length === 0) {
        cancelFlamethrowerPrime(defense, 'empty');
        return;
      }
      if (combatTick >= Math.max(defense.primeReadyTick, defense.nextStreamReadyTick)) {
        startFlamethrowerStream(defense, aliveTroops);
      }
      return;
    }

    if (defense.state === FLAMETHROWER_STATE.FIRING) {
      if (combatTick >= defense.streamEndTick) {
        flamethrowerStreamEnd(defense, 'completed');
        return;
      }
      const offset = combatTick - defense.streamStartTick;
      if (flamethrower.COMBAT_RULES.damage_offsets.includes(offset)) {
        resolveFlamethrowerDamageTick(defense, aliveTroops, offset);
      }
      return;
    }

    const scanAllowed = (
      defense.state === FLAMETHROWER_STATE.READY
      || (
        defense.state === FLAMETHROWER_STATE.COOLDOWN
        && combatTick >= defense.nextStreamReadyTick - flamethrower.COMBAT_RULES.prime_ticks
      )
    );
    if (!scanAllowed || combatTick < defense.nextScanTick) return;
    defense.nextScanTick = combatTick + flamethrower.COMBAT_RULES.scan_ticks;
    const eligible = flamethrowerEligibleTroops(defense, aliveTroops);
    if (eligible.length === 0) return;
    transitionFlamethrower(defense, FLAMETHROWER_STATE.PRIMING);
    defense.primeStartTick = combatTick;
    defense.primeReadyTick = combatTick + flamethrower.COMBAT_RULES.prime_ticks;
    traceEvent('flamethrower_prime_start', {
      defenseType: 'flamethrower',
      buildingId: defense.buildingId,
      buildingOrder: defense.buildingOrder,
      level: defense.level,
      facingStep: defense.facingStep,
      tick: combatTick,
      primeReadyTick: defense.primeReadyTick,
      readyTick: defense.nextStreamReadyTick,
      triggerTroopId: eligible[0].id,
      triggerReplayOrder: eligible[0].replayOrder ?? null,
      range: defense.range,
      halfAngleDegrees: flamethrower.COMBAT_RULES.full_cone_degrees / 2,
    });
  }

  function updateFlamethrowerDefenses(aliveTroops) {
    for (const defense of flamethrowers) updateFlamethrowerDefense(defense, aliveTroops);
  }

  function stopFlamethrowerDefenses(reason) {
    for (const defense of flamethrowers) {
      interruptFlamethrower(defense, reason, true);
    }
  }

  function validateTacticalPoint(action) {
    const rawX = typeof action?.x === 'number' ? action.x : NaN;
    const rawZ = typeof action?.z === 'number' ? action.z : NaN;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawZ)) {
      return {
        valid: false,
        reason: 'invalid_point',
        x: action?.x ?? null,
        z: action?.z ?? null,
      };
    }
    const point = clampWorldPointToGridUnion(
      movementGridConfigs,
      { x: rawX, z: rawZ },
      1.05,
    );
    if (distSq2d(rawX, rawZ, point.x, point.z) > 1e-10) {
      return {
        valid: false,
        reason: 'out_of_bounds',
        x: rawX,
        z: rawZ,
      };
    }
    return { valid: true, point: { x: rawX, z: rawZ } };
  }

  function applyFreezeDrop(point, actionTime, use, cost) {
    const frozenUntil = actionTime + FREEZE_DROP.durationSec;
    const affectedDefenseIds = [];
    const affectedTrapIds = [];
    const radiusSq = FREEZE_DROP.radius * FREEZE_DROP.radius;

    for (const defense of defenses) {
      const building = buildings.find(candidate => candidate.id === defense.buildingId);
      if (!building || building.hp <= 0) continue;
      if (distSq2d(point.x, point.z, defense.x, defense.z) > radiusSq) continue;
      defense.frozenUntil = Math.max(Number(defense.frozenUntil) || 0, frozenUntil);
      if (defense.type === 'harpoon') interruptHarpoon(defense, 'freeze');
      affectedDefenseIds.push(defense.buildingId);
    }
    for (const trap of sharkTraps) {
      if (trap.triggered) continue;
      const building = buildings.find(candidate => candidate.id === trap.buildingId);
      if (!building || building.hp <= 0) continue;
      if (distSq2d(point.x, point.z, trap.x, trap.z) > radiusSq) continue;
      trap.frozenUntil = Math.max(Number(trap.frozenUntil) || 0, frozenUntil);
      affectedTrapIds.push(trap.buildingId);
    }

    freezeDropDefensesAffected += affectedDefenseIds.length;
    freezeDropTrapsAffected += affectedTrapIds.length;
    traceEvent('freeze_drop', {
      use,
      cost,
      energyAfter: cannonEnergy,
      x: round3(point.x),
      z: round3(point.z),
      radius: FREEZE_DROP.radius,
      duration: FREEZE_DROP.durationSec,
      expiresAt: round3(frozenUntil),
      affectedDefenseIds,
      affectedTrapIds,
      affectedGuardIds: [],
    });
  }

  function resolveRageBoost(troop) {
    const previousFieldId = troop._rageFieldId ?? null;
    let field = null;

    if (!troop.summoned && !troop.evolutionChild) {
      for (const candidate of activeRageDrops) {
        if (
          time + 1e-9 < candidate.startAt
          || time + 1e-9 >= candidate.expiresAt
        ) {
          continue;
        }
        const inside = (
          distSq2d(troop.x, troop.z, candidate.x, candidate.z)
          <= RAGE_DROP.radius * RAGE_DROP.radius
        );
        if (inside) {
          troop._rageFieldId = candidate.id;
          troop._rageLastInsideAt = time;
          field = candidate;
          break;
        }
        if (
          troop._rageFieldId === candidate.id
          && Number.isFinite(troop._rageLastInsideAt)
          && time - troop._rageLastInsideAt <= RAGE_DROP.graceSec + 1e-9
        ) {
          field = candidate;
          break;
        }
      }
    }

    if (field) {
      if (previousFieldId !== field.id) {
        traceEvent('rage_enter', {
          fieldId: field.id,
          troopId: troop.id,
          replayOrder: troop.replayOrder ?? null,
          troop: troop.type,
          damageMultiplier: RAGE_DROP.damageMultiplier,
          attackSpeedMultiplier: RAGE_DROP.attackSpeedMultiplier,
          moveSpeedMultiplier: RAGE_DROP.moveSpeedMultiplier,
          graceSec: RAGE_DROP.graceSec,
        });
      }
      return true;
    }

    if (previousFieldId !== null) {
      const lastInsideAt = Number.isFinite(troop._rageLastInsideAt)
        ? troop._rageLastInsideAt
        : null;
      traceEvent('rage_exit', {
        fieldId: previousFieldId,
        troopId: troop.id,
        replayOrder: troop.replayOrder ?? null,
        troop: troop.type,
        lastInsideAt: lastInsideAt == null ? null : round3(lastInsideAt),
        graceElapsed: lastInsideAt == null ? null : round3(time - lastInsideAt),
      });
    }
    troop._rageFieldId = null;
    troop._rageLastInsideAt = null;
    return false;
  }

  function recordRageDamage(troop, target, baseDamage, boostedDamage, attackKind) {
    const bonusDamage = Math.max(0, boostedDamage - baseDamage);
    if (bonusDamage <= 0) return;
    rageBonusDamageApplied += bonusDamage;
    traceEvent('rage_boosted_damage', {
      troopId: troop.id,
      replayOrder: troop.replayOrder ?? null,
      troop: troop.type,
      attackKind,
      target: traceEntityPayload(target, target?.type ? 'building' : 'guard'),
      baseDamage,
      boostedDamage,
      bonusDamage,
    });
  }

  function applyIceGolemDeathFreeze(troop) {
    const radius = Math.max(0, Number(troop?.deathFreezeRadius) || 0);
    const duration = Math.max(0, Number(troop?.deathFreezeDuration) || 0);
    if (!troop || radius <= 0 || duration <= 0) return;

    const radiusSq = radius * radius;
    const frozenUntil = time + duration;
    const affectedBuildingIds = [];

    for (const building of buildings) {
      if (!building || building.hp <= 0 || !isIceGolemFreezableDefense(building)) continue;
      if (distSq2d(troop.x, troop.z, building.x, building.z) > radiusSq) continue;
      affectedBuildingIds.push(building.id);

      for (const defense of defenses) {
        if (defense.buildingId !== building.id) continue;
        defense.frozenUntil = Math.max(Number(defense.frozenUntil) || 0, frozenUntil);
        if (defense.type === 'harpoon') interruptHarpoon(defense, 'freeze');
      }
      for (const trap of sharkTraps) {
        if (trap.buildingId !== building.id) continue;
        trap.frozenUntil = Math.max(Number(trap.frozenUntil) || 0, frozenUntil);
      }
      if (canonicalDefenseBuildingType(building.type) === 'tombstone') {
        for (const guard of guards) {
          if (guard.tombstoneId !== building.id || guard.hp <= 0) continue;
          guard.frozenUntil = Math.max(Number(guard.frozenUntil) || 0, frozenUntil);
        }
      }
    }

    traceEvent('ice_golem_freeze', {
      troopId: troop.id,
      replayOrder: troop.replayOrder ?? null,
      x: round3(troop.x),
      z: round3(troop.z),
      radius,
      duration,
      affectedBuildingIds,
    });
  }

  function despawnSummonedUnit(unit, reason) {
    if (!unit || !unit.summoned || unit.hp <= 0) return false;
    const hpBefore = unit.hp;
    unit.hp = 0;
    unit._deathHandled = true;
    unit._state = 'dead';
    unit._currentTarget = null;
    unit._currentTargetIsGuard = false;
    unit._forceRetarget = false;
    if (unit.summonSource === 'wind_mage') {
      traceEvent('windling_despawn', {
        troopId: unit.id,
        replayOrder: unit.replayOrder ?? null,
        ownerTroopId: unit.summonOwnerId,
        reason,
        summon_index: unit.summonSequence,
      });
    }
    traceEvent('summoned_unit_despawn', {
      troopId: unit.id,
      replayOrder: unit.replayOrder ?? null,
      troop: unit.type,
      ownerTroopId: unit.summonOwnerId,
      summonSequence: unit.summonSequence,
      reason,
      hpBefore,
      x: round3(unit.x),
      z: round3(unit.z),
    });
    return true;
  }

  function despawnSummonsForOwner(owner, reason = 'owner_death') {
    if (!owner) return 0;
    let removed = 0;
    for (const unit of troops) {
      if (unit.summonOwnerId !== owner.id) continue;
      if (despawnSummonedUnit(unit, reason)) removed++;
    }
    if (removed > 0) {
      clearDeadOwnerProjectiles(projectiles, 'troop', traceTroopProjectileLost);
    }
    return removed;
  }

  function despawnAllSummons(reason) {
    let removed = 0;
    for (const unit of troops) {
      if (despawnSummonedUnit(unit, reason)) removed++;
    }
    if (removed > 0) {
      clearDeadOwnerProjectiles(projectiles, 'troop', traceTroopProjectileLost);
    }
    return removed;
  }

  function spawnHorrorEvolutionChildren(parent, source) {
    const parentStage = Math.max(0, Math.trunc(Number(parent?.evolutionStage) || 0));
    if (
      !parent
      || normalizeTroopTypeName(parent.type) !== 'horror'
      || parentStage >= HORROR_EVOLUTION.finalStage
    ) {
      return 0;
    }
    const nextStage = parentStage + 1;
    const level = Math.max(1, Math.min(7, Math.trunc(Number(parent.level) || 1)));
    const stats = HORROR_EVOLUTION.stages?.[nextStage]?.[level];
    if (!stats) return 0;

    const rootOrder = Number.isFinite(Number(parent.evolutionRootOrder))
      ? Math.max(0, Math.trunc(Number(parent.evolutionRootOrder)))
      : Math.max(0, Math.trunc(Number(parent.replayOrder) || 0));
    const parentLineage = Math.max(0, Math.trunc(Number(parent.evolutionLineage) || 0));
    const splitAngle = ((rootOrder * 37 + nextStage * 53) % 360) * Math.PI / 180;
    const rightX = Math.cos(splitAngle);
    const rightZ = Math.sin(splitAngle);
    const splitOffset = Math.max(
      0,
      Number(HORROR_EVOLUTION.stageSplitOffset[nextStage]) || 0
    );
    let spawned = 0;

    for (
      let childIndex = 0;
      childIndex < HORROR_EVOLUTION.childrenPerSplit;
      childIndex++
    ) {
      const side = childIndex === 0 ? -1 : 1;
      const childLineage = (
        parentLineage * HORROR_EVOLUTION.childrenPerSplit
        + childIndex
        + 1
      );
      const replayOrder = (
        HORROR_EVOLUTION.replayOrderBase
        + rootOrder * 16
        + childLineage
      );
      const childPos = clampWorldPointToGrid(defaultGridConfig, {
        x: parent.x + rightX * splitOffset * side,
        z: parent.z + rightZ * splitOffset * side,
      }, 1.05);
      const troopId = nextTroopId++;
      troops.push({
        id: troopId,
        replayOrder,
        type: 'horror',
        level,
        ...troopMovementProfile('horror', nextStage),
        hp: stats.hp,
        maxHp: stats.hp,
        damage: stats.damage,
        atkSpeed: stats.atkSpeed,
        moveSpeed: stats.moveSpeed,
        range: stats.range,
        melee: true,
        projSpeed: 0,
        directHit: false,
        flying: false,
        chainJumps: 0,
        chainRadius: 0,
        chainFalloffBps: 0,
        trapImmune: false,
        untargetableWhileRunning: false,
        defensePriority: false,
        deathFreezeRadius: 0,
        deathFreezeDuration: 0,
        targetType: UNIT_TARGET_GROUND,
        hitDelay: stats.hitDelay || 0.42,
        shootDelay: 0,
        x: childPos.x,
        z: childPos.z,
        atkTimer: 0,
        hitPending: false,
        hitTimer: 0,
        hitDone: false,
        _pendingTarget: null,
        _state: 'idle',
        _retargetCounter: 0,
        _sepCounter: 0,
        _moveSepCounter: 0,
        _lastMoveSeparationX: 0,
        _lastMoveSeparationZ: 0,
        _slotEvalTimer: 0,
        _orbitAngle: 0,
        _stuckTimer: 0,
        _lastX: childPos.x,
        _lastZ: childPos.z,
        _currentTarget: null,
        _currentTargetIsGuard: false,
        _forceRetarget: false,
        _deathHandled: false,
        _activationAt: time + (
          Number(HORROR_EVOLUTION.stageSpawnLockSec[nextStage]) || 0
        ),
        evolutionStage: nextStage,
        evolutionLineage: childLineage,
        evolutionRootOrder: rootOrder,
        evolutionChild: true,
      });
      evolutionChildrenSpawned++;
      spawned++;
      traceEvent('troop_split_spawn', {
        source,
        parentTroopId: parent.id,
        parentReplayOrder: parent.replayOrder ?? null,
        parentStage,
        childTroopId: troopId,
        childReplayOrder: replayOrder,
        childStage: nextStage,
        childIndex,
        childLineage,
        level,
        hp: stats.hp,
        x: round3(childPos.x),
        z: round3(childPos.z),
      });
    }
    return spawned;
  }

  function handleTroopDeath(troop, source, damage = null) {
    if (!troop || troop.hp > 0 || troop._deathHandled) return false;
    troop._deathHandled = true;
    troop._state = 'dead';
    troop._currentTarget = null;
    troop._currentTargetIsGuard = false;
    troop._forceRetarget = false;

    if (troop.summoned) {
      traceEvent('summoned_unit_death', {
        troopId: troop.id,
        replayOrder: troop.replayOrder ?? null,
        troop: troop.type,
        ownerTroopId: troop.summonOwnerId,
        summonSequence: troop.summonSequence,
        source,
        ...(damage == null ? {} : { damage }),
        hp: troop.hp,
        x: round3(troop.x),
        z: round3(troop.z),
      });
      if (troop.summonSource === 'skeleton_barrel') {
        traceEvent('skeleton_barrel_skeleton_death', {
          use: troop.barrelUse,
          troopId: troop.id,
          replayOrder: troop.replayOrder ?? null,
          spawnIndex: troop.summonSequence,
          source,
          ...(damage == null ? {} : { damage }),
          hp: troop.hp,
          x: round3(troop.x),
          z: round3(troop.z),
        });
      }
    } else {
      traceEvent('troop_death', {
        troopId: troop.id,
        replayOrder: troop.replayOrder ?? null,
        troop: troop.type,
        source,
        ...(damage == null ? {} : { damage }),
        hp: troop.hp,
        x: round3(troop.x),
        z: round3(troop.z),
      });
    }

    if (normalizeTroopTypeName(troop.type) === 'ice_golem') {
      applyIceGolemDeathFreeze(troop);
    }
    if (
      normalizeTroopTypeName(troop.type) === 'necromancer'
      || normalizeTroopTypeName(troop.type) === 'wind_mage'
    ) {
      despawnSummonsForOwner(troop, 'owner_death');
    }
    if (normalizeTroopTypeName(troop.type) === 'horror') {
      spawnHorrorEvolutionChildren(troop, source);
    }
    return true;
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

  function applyChainLightningHit(
    troop,
    primaryTarget,
    primaryIsGuard,
    attackDamage = troop?.damage,
    rageBoosted = false,
  ) {
    if (!troop || !primaryTarget || primaryTarget.hp <= 0) return 0;
    if (primaryIsGuard || troop.chainJumps <= 0 || troop.chainRadius <= 0) {
      const hpBefore = primaryTarget.hp;
      primaryTarget.hp -= attackDamage;
      if (rageBoosted) {
        recordRageDamage(troop, primaryTarget, troop.damage, attackDamage, 'chain_lightning');
      }
      traceEvent('troop_chain_lightning_hit', {
        troopId: troop.id,
        replayOrder: troop.replayOrder ?? null,
        troop: troop.type,
        targetKind: primaryIsGuard ? 'guard' : 'building',
        targetId: primaryTarget.id,
        targetType: primaryTarget.type || 'guard',
        target: traceEntityPayload(primaryTarget, primaryIsGuard ? 'guard' : 'building'),
        jumpIndex: 0,
        damage: attackDamage,
        rageBoosted,
        hpBefore,
        hpAfter: primaryTarget.hp,
      });
      if (!primaryIsGuard && primaryTarget.hp <= 0) {
        traceBuildingDestroyed(primaryTarget, 'chain_lightning');
        troop._forceRetarget = true;
        return CANNON_ENERGY_PER_DESTROY;
      }
      return 0;
    }

    // Resolve the full path before applying damage. This keeps candidate
    // selection independent from destruction side effects and matches Godot.
    const path = [primaryTarget];
    const usedIds = new Set([primaryTarget.id]);
    let previous = primaryTarget;
    const radiusSq = troop.chainRadius * troop.chainRadius;
    for (let jump = 0; jump < troop.chainJumps; jump++) {
      let nearest = null;
      let nearestDistSq = radiusSq + 1e-9;
      let nearestId = Number.MAX_SAFE_INTEGER;
      for (const candidate of buildings) {
        if (!candidate || candidate.hp <= 0 || !isCombatTargetBuilding(candidate)) continue;
        if (usedIds.has(candidate.id)) continue;
        const candidateDistSq = distSq2d(previous.x, previous.z, candidate.x, candidate.z);
        const candidateId = Number.isFinite(Number(candidate.id))
          ? Number(candidate.id)
          : Number.MAX_SAFE_INTEGER;
        if (
          candidateDistSq < nearestDistSq - 1e-9
          || (Math.abs(candidateDistSq - nearestDistSq) <= 1e-9 && candidateId < nearestId)
        ) {
          nearest = candidate;
          nearestDistSq = candidateDistSq;
          nearestId = candidateId;
        }
      }
      if (!nearest) break;
      path.push(nearest);
      usedIds.add(nearest.id);
      previous = nearest;
    }

    let energyGain = 0;
    let multiplierBps = 10000;
    for (let jumpIndex = 0; jumpIndex < path.length; jumpIndex++) {
      const chainTarget = path[jumpIndex];
      if (!chainTarget || chainTarget.hp <= 0) continue;
      if (jumpIndex > 0) {
        multiplierBps = Math.floor((multiplierBps * troop.chainFalloffBps + 5000) / 10000);
      }
      const baseHitDamage = Math.max(
        1,
        Math.floor((troop.damage * multiplierBps + 5000) / 10000),
      );
      const hitDamage = Math.max(
        1,
        Math.floor((attackDamage * multiplierBps + 5000) / 10000),
      );
      const hpBefore = chainTarget.hp;
      chainTarget.hp -= hitDamage;
      if (rageBoosted) {
        recordRageDamage(
          troop,
          chainTarget,
          baseHitDamage,
          hitDamage,
          'chain_lightning',
        );
      }
      traceEvent('troop_chain_lightning_hit', {
        troopId: troop.id,
        replayOrder: troop.replayOrder ?? null,
        troop: troop.type,
        targetKind: 'building',
        targetId: chainTarget.id,
        targetType: chainTarget.type,
        target: traceEntityPayload(chainTarget, 'building'),
        jumpIndex,
        chainRadius: troop.chainRadius,
        chainFalloffBps: troop.chainFalloffBps,
        damage: hitDamage,
        rageBoosted,
        hpBefore,
        hpAfter: chainTarget.hp,
      });
      if (chainTarget.hp <= 0) {
        traceBuildingDestroyed(chainTarget, 'chain_lightning');
        energyGain += CANNON_ENERGY_PER_DESTROY;
        if (jumpIndex === 0) troop._forceRetarget = true;
      }
    }
    return energyGain;
  }

  function traceTroopProjectileHit(p, target, hpBefore, hpAfter) {
    const isBuilding = !!target.type;
    if (p.rageBoosted) {
      recordRageDamage(
        p.ownerRef,
        target,
        p.baseDamage,
        p.damage,
        'projectile',
      );
    }
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
      rageBoosted: !!p.rageBoosted,
      burstIndex: Number.isInteger(p.burstIndex) ? p.burstIndex : null,
      burstCount: Number.isInteger(p.burstCount) ? p.burstCount : null,
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

  function spawnNecromancerSkeleton(
    owner,
    aliveTroops,
    aliveBuildings,
    batchIndex,
    summonBatch,
  ) {
    const stats = computeNecromancerSkeletonStats(owner.level);
    const sequence = owner._summonSequence++;
    const troopId = nextTroopId++;
    const target = aliveBuildings
      .slice()
      .sort((left, right) => {
        const distanceDelta = (
          distSq2d(owner.x, owner.z, left.x, left.z)
          - distSq2d(owner.x, owner.z, right.x, right.z)
        );
        if (Math.abs(distanceDelta) > 1e-9) return distanceDelta;
        return Number(left.id || 0) - Number(right.id || 0);
      })[0] || null;
    let forwardX = target ? target.x - owner.x : 0;
    let forwardZ = target ? target.z - owner.z : 1;
    const forwardLength = Math.hypot(forwardX, forwardZ);
    if (forwardLength > 1e-9) {
      forwardX /= forwardLength;
      forwardZ /= forwardLength;
    } else {
      forwardX = 0;
      forwardZ = 1;
    }
    const centeredIndex = (
      Number(batchIndex)
      - (Math.max(1, NECROMANCER_SUMMON.batchSize) - 1) / 2
    );
    const unclamped = {
      x: owner.x
        + forwardX * NECROMANCER_SUMMON.spawnForwardDistance
        - forwardZ * centeredIndex * NECROMANCER_SUMMON.spawnLateralSpacing,
      z: owner.z
        + forwardZ * NECROMANCER_SUMMON.spawnForwardDistance
        + forwardX * centeredIndex * NECROMANCER_SUMMON.spawnLateralSpacing,
    };
    const spawnPos = clampWorldPointToGridUnion(movementGridConfigs, unclamped, 1.05);
    const summoned = {
      id: troopId,
      replayOrder: 1000000 + troopId,
      type: 'necromancer_skeleton',
      level: owner.level,
      ...troopMovementProfile('necromancer_skeleton', 0),
      hp: stats.hp,
      maxHp: stats.hp,
      damage: stats.damage,
      atkSpeed: stats.atkSpeed,
      moveSpeed: stats.moveSpeed,
      range: stats.range,
      melee: true,
      projSpeed: 0,
      directHit: false,
      flying: false,
      chainJumps: 0,
      chainRadius: 0,
      chainFalloffBps: 0,
      trapImmune: false,
      untargetableWhileRunning: false,
      defensePriority: false,
      deathFreezeRadius: 0,
      deathFreezeDuration: 0,
      targetType: UNIT_TARGET_GROUND,
      hitDelay: stats.hitDelay,
      shootDelay: 0,
      x: spawnPos.x,
      z: spawnPos.z,
      atkTimer: 0,
      hitPending: false,
      hitTimer: 0,
      hitDone: false,
      _pendingTarget: null,
      _state: 'idle',
      _retargetCounter: 0,
      _sepCounter: 0,
      _moveSepCounter: 0,
      _lastMoveSeparationX: 0,
      _lastMoveSeparationZ: 0,
      _slotEvalTimer: 0,
      _orbitAngle: 0,
      _stuckTimer: 0,
      _lastX: spawnPos.x,
      _lastZ: spawnPos.z,
      _currentTarget: null,
      _currentTargetIsGuard: false,
      _forceRetarget: false,
      _deathHandled: false,
      _nextSummonAt: null,
      _summonSequence: 0,
      summoned: true,
      summonOwnerId: owner.id,
      summonSequence: sequence,
      buildingOnly: true,
    };
    troops.push(summoned);
    aliveTroops.push(summoned);
    summonsSpawned++;
    const activeForOwner = troops.filter(
      unit => unit.summoned && unit.summonOwnerId === owner.id && unit.hp > 0
    ).length;
    const activeTotal = troops.filter(unit => unit.summoned && unit.hp > 0).length;
    summonsActivePeak = Math.max(summonsActivePeak, activeTotal);
    traceEvent('necromancer_summon', {
      troopId,
      replayOrder: summoned.replayOrder,
      troop: summoned.type,
      ownerTroopId: owner.id,
      ownerReplayOrder: owner.replayOrder ?? null,
      ownerLevel: owner.level,
      summonSequence: sequence,
      summonBatch,
      batchIndex,
      activeForOwner,
      maxActive: NECROMANCER_SUMMON.maxActive,
      consumesShipCapacity: false,
      hp: summoned.hp,
      damage: summoned.damage,
      atkSpeed: summoned.atkSpeed,
      x: round3(summoned.x),
      z: round3(summoned.z),
    });
    return summoned;
  }

  function resolveWindMageWaveTargets(owner, primaryTarget, aliveBuildings) {
    if (!owner || !primaryTarget || primaryTarget.hp <= 0) return null;
    let forwardX = primaryTarget.x - owner.x;
    let forwardZ = primaryTarget.z - owner.z;
    const forwardLength = Math.hypot(forwardX, forwardZ);
    if (forwardLength > 1e-9) {
      forwardX /= forwardLength;
      forwardZ /= forwardLength;
    } else {
      forwardX = 0;
      forwardZ = 1;
    }
    const lateralX = -forwardZ;
    const lateralZ = forwardX;
    const candidates = [];
    for (const candidate of aliveBuildings) {
      if (!candidate || candidate === primaryTarget || candidate.hp <= 0) continue;
      const deltaX = candidate.x - owner.x;
      const deltaZ = candidate.z - owner.z;
      const longitudinal = deltaX * forwardX + deltaZ * forwardZ;
      if (longitudinal < 0.10 || longitudinal > WIND_MAGE.waveLength) continue;
      const progress = clamp(longitudinal / WIND_MAGE.waveLength, 0, 1);
      const halfWidth = lerp(
        WIND_MAGE.waveNearHalfWidth,
        WIND_MAGE.waveFarHalfWidth,
        progress,
      );
      const lateralDistance = Math.abs(deltaX * lateralX + deltaZ * lateralZ);
      if (lateralDistance > halfWidth) continue;
      candidates.push({ target: candidate, longitudinal });
    }
    candidates.sort((left, right) => {
      const distanceDelta = left.longitudinal - right.longitudinal;
      if (Math.abs(distanceDelta) > 1e-9) return distanceDelta;
      const leftId = Number(left.target.id);
      const rightId = Number(right.target.id);
      if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
      return String(left.target.id).localeCompare(String(right.target.id));
    });
    return {
      forwardX,
      forwardZ,
      targets: [
        primaryTarget,
        ...candidates
          .slice(0, WIND_MAGE.maxSecondaryTargets)
          .map(entry => entry.target),
      ],
    };
  }

  function spawnWindling(owner, forwardX, forwardZ, batchIndex, batchSize, aliveTroops) {
    const level = Math.max(1, Math.min(7, Math.trunc(Number(owner.level) || 1)));
    const stats = WINDLING_STATS[level] || WINDLING_STATS[1];
    const sequence = ++owner._summonSequence;
    const seed = Number.isFinite(Number(owner.replayOrder))
      ? Math.trunc(Number(owner.replayOrder))
      : 1;
    const castSerial = Math.max(0, Math.trunc(Number(owner._windCastSerial) || 0));
    const distanceHash = windMageStableHash(seed, castSerial, batchIndex * 2 + 31);
    const lateralHash = windMageStableHash(seed, castSerial, batchIndex * 2 + 32);
    const distanceProgress = 0.32 + windMageHashUnit(distanceHash) * 0.54;
    const distance = WIND_MAGE.waveLength * distanceProgress;
    const halfWidth = lerp(
      WIND_MAGE.waveNearHalfWidth,
      WIND_MAGE.waveFarHalfWidth,
      distanceProgress,
    );
    const lateralFactor = lerp(-0.78, 0.78, windMageHashUnit(lateralHash));
    const spawnPos = clampWorldPointToGridUnion(movementGridConfigs, {
      x: owner.x + forwardX * distance - forwardZ * halfWidth * lateralFactor,
      z: owner.z + forwardZ * distance + forwardX * halfWidth * lateralFactor,
    }, 1.05);
    const troopId = nextTroopId++;
    const ownerReplayOrder = Math.trunc(Number(owner.replayOrder) || 0);
    const summoned = {
      id: troopId,
      replayOrder: ownerReplayOrder * 1000 + sequence,
      type: 'windling',
      level,
      ...troopMovementProfile('windling', 0),
      hp: stats.hp,
      maxHp: stats.hp,
      damage: stats.damage,
      atkSpeed: stats.atkSpeed,
      moveSpeed: stats.moveSpeed,
      range: stats.range,
      melee: true,
      projSpeed: 0,
      directHit: false,
      flying: true,
      chainJumps: 0,
      chainRadius: 0,
      chainFalloffBps: 0,
      trapImmune: false,
      untargetableWhileRunning: false,
      defensePriority: false,
      deathFreezeRadius: 0,
      deathFreezeDuration: 0,
      targetType: UNIT_TARGET_AIR,
      hitDelay: stats.hitDelay,
      shootDelay: 0,
      x: spawnPos.x,
      z: spawnPos.z,
      atkTimer: 0,
      hitPending: false,
      hitTimer: 0,
      hitDone: false,
      _pendingTarget: null,
      _state: 'idle',
      _retargetCounter: 0,
      _sepCounter: 0,
      _moveSepCounter: 0,
      _lastMoveSeparationX: 0,
      _lastMoveSeparationZ: 0,
      _slotEvalTimer: 0,
      _orbitAngle: 0,
      _stuckTimer: 0,
      _lastX: spawnPos.x,
      _lastZ: spawnPos.z,
      _currentTarget: null,
      _currentTargetIsGuard: false,
      _forceRetarget: false,
      _deathHandled: false,
      _activationAt: time + WIND_MAGE.summonRiseDuration,
      _nextSummonAt: null,
      _summonSequence: 0,
      _rageFieldId: null,
      _rageLastInsideAt: null,
      summoned: true,
      summonOwnerId: owner.id,
      summonSequence: sequence,
      summonSource: 'wind_mage',
      buildingOnly: true,
      medkitHealable: false,
      temporary: true,
      spawnedAt: time,
      expiresAt: time + WINDLING_LIFETIME_SEC,
    };
    troops.push(summoned);
    aliveTroops.push(summoned);
    summonsSpawned++;
    windlingsSpawned++;
    const activeForOwner = troops.filter(
      unit => (
        unit.summonSource === 'wind_mage'
        && unit.summonOwnerId === owner.id
        && unit.hp > 0
      )
    ).length;
    summonsActivePeak = Math.max(
      summonsActivePeak,
      troops.filter(unit => unit.summoned && unit.hp > 0).length,
    );
    traceEvent('wind_mage_summon', {
      troopId,
      replayOrder: summoned.replayOrder,
      troop: summoned.type,
      ownerTroopId: owner.id,
      ownerReplayOrder: owner.replayOrder ?? null,
      ownerLevel: owner.level,
      cast_serial: castSerial,
      summon_index: sequence,
      batch_index: batchIndex,
      batch_size: batchSize,
      active_windlings: activeForOwner,
      max_active: WIND_MAGE.maxActiveWindlings,
      lifetime: WINDLING_LIFETIME_SEC,
      expires_at: round3(summoned.expiresAt),
      consumesShipCapacity: false,
      recordsCasualty: false,
      target_type: UNIT_TARGET_AIR,
      hp: summoned.hp,
      damage: summoned.damage,
      atk_speed: summoned.atkSpeed,
      move_speed: summoned.moveSpeed,
      owner_x: round3(owner.x),
      owner_z: round3(owner.z),
      forward_x: round3(forwardX),
      forward_z: round3(forwardZ),
      distance_progress: round3(distanceProgress),
      lateral_factor: round3(lateralFactor),
      x: round3(summoned.x),
      z: round3(summoned.z),
    });
    return summoned;
  }

  function spawnWindlingBatch(owner, forwardX, forwardZ, aliveTroops) {
    const activeForOwner = troops.filter(
      unit => (
        unit.summonSource === 'wind_mage'
        && unit.summonOwnerId === owner.id
        && unit.hp > 0
      )
    ).length;
    const remainingCapacity = WIND_MAGE.maxActiveWindlings - activeForOwner;
    if (remainingCapacity <= 0) return 0;
    const summonRange = (
      WIND_MAGE.maxSummonsPerCast
      - WIND_MAGE.minSummonsPerCast
      + 1
    );
    const seed = Number.isFinite(Number(owner.replayOrder))
      ? Math.trunc(Number(owner.replayOrder))
      : 1;
    const requestedCount = (
      WIND_MAGE.minSummonsPerCast
      + windMageStableHash(seed, owner._windCastSerial, 17) % summonRange
    );
    const spawnCount = Math.min(remainingCapacity, requestedCount);
    for (let batchIndex = 0; batchIndex < spawnCount; batchIndex++) {
      spawnWindling(
        owner,
        forwardX,
        forwardZ,
        batchIndex,
        spawnCount,
        aliveTroops,
      );
    }
    return spawnCount;
  }

  function applyWindMageWave(
    owner,
    primaryTarget,
    aliveBuildings,
    aliveTroops,
    attackDamage,
    rageBoosted,
  ) {
    const wave = resolveWindMageWaveTargets(owner, primaryTarget, aliveBuildings);
    if (!wave) return 0;
    let energyGain = 0;
    for (let waveIndex = 0; waveIndex < wave.targets.length; waveIndex++) {
      const target = wave.targets[waveIndex];
      if (!target || target.hp <= 0) continue;
      const hitDamage = waveIndex === 0
        ? attackDamage
        : Math.max(
          1,
          Math.floor(
            (
              attackDamage * WIND_MAGE.secondaryDamageBps
              + 5000
            ) / 10000,
          ),
        );
      const baseHitDamage = waveIndex === 0
        ? owner.damage
        : Math.max(
          1,
          Math.floor(
            (
              owner.damage * WIND_MAGE.secondaryDamageBps
              + 5000
            ) / 10000,
          ),
        );
      const hpBefore = target.hp;
      target.hp -= hitDamage;
      windMageWaveHits++;
      if (waveIndex > 0) windMageSecondaryHits++;
      if (rageBoosted) {
        recordRageDamage(
          owner,
          target,
          baseHitDamage,
          hitDamage,
          'wind_mage_wave',
        );
      }
      traceEvent('wind_mage_wave_hit', {
        troopId: owner.id,
        replayOrder: owner.replayOrder ?? null,
        troop: owner.type,
        buildingId: target.id,
        targetId: target.id,
        targetType: target.type,
        target: traceEntityPayload(target, 'building'),
        damage: hitDamage,
        hp_before: hpBefore,
        hp_after: target.hp,
        wave_index: waveIndex,
        wave_length: WIND_MAGE.waveLength,
        wave_near_half_width: WIND_MAGE.waveNearHalfWidth,
        wave_far_half_width: WIND_MAGE.waveFarHalfWidth,
        secondary_damage_bps: WIND_MAGE.secondaryDamageBps,
        rageBoosted,
      });
      if (target.hp <= 0) {
        traceBuildingDestroyed(target, 'wind_wave');
        energyGain += CANNON_ENERGY_PER_DESTROY;
        if (waveIndex === 0) owner._forceRetarget = true;
      }
    }
    spawnWindlingBatch(owner, wave.forwardX, wave.forwardZ, aliveTroops);
    return energyGain;
  }

  function spawnSkeletonBarrelSkeleton(impact, spawnIndex) {
    const stats = SKELETON_BARREL.skeleton;
    const angle = (
      (Math.PI * 2 * spawnIndex) / SKELETON_BARREL.spawnCount
      + SKELETON_BARREL.spawnAngleOffsetRad
    );
    const spawnPos = clampWorldPointToGridUnion(movementGridConfigs, {
      x: impact.x + Math.cos(angle) * SKELETON_BARREL.spawnRadius,
      z: impact.z + Math.sin(angle) * SKELETON_BARREL.spawnRadius,
    }, 1.05);
    const troopId = nextTroopId++;
    const summoned = {
      id: troopId,
      replayOrder: 900001 + spawnIndex,
      type: 'skeleton_barrel_skeleton',
      level: 1,
      ...troopMovementProfile('skeleton_barrel_skeleton', 0),
      hp: stats.hp,
      maxHp: stats.hp,
      damage: stats.damage,
      atkSpeed: stats.atkSpeed,
      moveSpeed: stats.moveSpeed,
      range: stats.range,
      melee: true,
      projSpeed: 0,
      directHit: false,
      flying: false,
      chainJumps: 0,
      chainRadius: 0,
      chainFalloffBps: 0,
      trapImmune: false,
      untargetableWhileRunning: false,
      defensePriority: false,
      deathFreezeRadius: 0,
      deathFreezeDuration: 0,
      targetType: UNIT_TARGET_GROUND,
      hitDelay: stats.hitDelay,
      shootDelay: 0,
      x: spawnPos.x,
      z: spawnPos.z,
      atkTimer: 0,
      hitPending: false,
      hitTimer: 0,
      hitDone: false,
      _pendingTarget: null,
      _state: 'idle',
      _retargetCounter: 0,
      _sepCounter: 0,
      _moveSepCounter: 0,
      _lastMoveSeparationX: 0,
      _lastMoveSeparationZ: 0,
      _slotEvalTimer: 0,
      _orbitAngle: 0,
      _stuckTimer: 0,
      _lastX: spawnPos.x,
      _lastZ: spawnPos.z,
      _currentTarget: null,
      _currentTargetIsGuard: false,
      _forceRetarget: false,
      _deathHandled: false,
      _nextSummonAt: null,
      _summonSequence: 0,
      _rageFieldId: null,
      _rageLastInsideAt: null,
      summoned: true,
      summonOwnerId: null,
      summonSequence: spawnIndex + 1,
      summonSource: 'skeleton_barrel',
      barrelUse: impact.use,
      buildingOnly: true,
      medkitHealable: false,
      temporary: true,
      expiresAt: impact.time + SKELETON_BARREL.lifetimeSec,
    };
    troops.push(summoned);
    summonsSpawned++;
    skeletonBarrelSkeletonsSpawned++;
    summonsActivePeak = Math.max(
      summonsActivePeak,
      troops.filter(unit => unit.summoned && unit.hp > 0).length,
    );
    traceEvent('skeleton_barrel_skeleton_spawn', {
      use: impact.use,
      troopId,
      replayOrder: summoned.replayOrder,
      targetBuildingId: impact.target?.id ?? null,
      spawnIndex,
      hp: stats.hp,
      damage: stats.damage,
      atkSpeed: stats.atkSpeed,
      moveSpeed: stats.moveSpeed,
      lifetime: SKELETON_BARREL.lifetimeSec,
      expiresAt: round3(summoned.expiresAt),
      consumesShipCapacity: false,
      recordsCasualty: false,
      medkitHealable: false,
      rageEligible: false,
      x: round3(spawnPos.x),
      z: round3(spawnPos.z),
    });
    return summoned;
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
        frozenUntil: 0,
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
        frozenUntil: 0,
        _searchTimer: 0,
      });
    }
    if (b.type === 'mage_tower') {
      const mageLevel = Math.max(1, Math.min(Number(b.level) || 1, Object.keys(DEFENSE_STATS.mage_tower).length));
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
        frozenUntil: 0,
        _searchTimer: 0,
      });
    }
    if (b.type === 'mortar') {
      const mortarLevel = Math.max(1, Math.min(Number(b.level) || 1, Object.keys(DEFENSE_STATS.mortar).length));
      const s = DEFENSE_STATS.mortar[mortarLevel] || DEFENSE_STATS.mortar[1];
      defenses.push({
        buildingId: b.id, type: 'mortar',
        damage: wardDamage(s.damage), fireRate: s.fireRate, detectRange: s.detectRange,
        minRange: s.minRange,
        travelTime: s.travelTime,
        splashRadius: s.splashRadius,
        targetGround: true, targetAir: false,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
        frozenUntil: 0,
        _searchTimer: 0,
      });
    }
    if (b.type === 'flamethrower') {
      const flameLevel = Math.max(1, Math.min(flamethrower.LEVELS.length, Number(b.level) || 1));
      const stats = flamethrower.levelStats(flameLevel);
      const defense = {
        buildingId: b.id,
        buildingOrder: b.buildingOrder,
        type: 'flamethrower',
        level: flameLevel,
        x: b.x,
        z: b.z,
        facingStep: b.facingStep,
        forwardXZ: flamethrower.forwardForStep(b.facingStep),
        range: stats.range,
        baseTickDamage: stats.tick_damage,
        damage: flamethrower.effectiveTickDamage(flameLevel, wardPct),
        targetGround: true,
        targetAir: false,
        state: FLAMETHROWER_STATE.READY,
        nextScanTick: 0,
        primeStartTick: null,
        primeReadyTick: null,
        streamStartTick: null,
        streamEndTick: null,
        nextStreamReadyTick: 0,
        streamIndex: 0,
        resolvedDamageOffsets: new Set(),
        uniqueTargets: new Set(),
        streamDamage: 0,
        streamKills: 0,
        frozenUntil: 0,
        frozenUntilTick: 0,
        cooldownReadyEmitted: true,
        permanentlyDisabled: false,
      };
      defenses.push(defense);
      flamethrowers.push(defense);
    }
    if (b.type === 'air_bomb') {
      const airBombLevel = Math.max(
        1,
        Math.min(Number(b.level) || 1, Object.keys(DEFENSE_STATS.air_bomb).length),
      );
      const s = DEFENSE_STATS.air_bomb[airBombLevel] || DEFENSE_STATS.air_bomb[1];
      const airBomb = {
        buildingId: b.id,
        buildingOrder: b.buildingOrder,
        type: 'air_bomb',
        level: airBombLevel,
        damage: wardDamage(s.damage),
        baseDamage: s.damage,
        fireRate: s.fireRate,
        detectRange: s.detectRange,
        splashRadius: s.splashRadius,
        projSpeed: s.projSpeed,
        turnSpeedDeg: s.turnSpeedDeg,
        hitRadius: s.hitRadius,
        riseTicks: s.riseTicks,
        maxLifetimeTicks: s.maxLifetimeTicks,
        reloadTicks: s.reloadTicks,
        scanTicks: s.scanTicks,
        targetGround: false,
        targetAir: true,
        x: b.x,
        z: b.z,
        frozenUntil: 0,
        nextScanTick: 0,
        reloadReadyTick: 0,
        reloadReadyEmitted: true,
        lastFireTick: null,
        targetId: null,
        activeProjectileId: null,
        nextAmmoSide: 0,
      };
      defenses.push(airBomb);
      airBombs.push(airBomb);
    }
    if (b.type === 'harpoon') {
      const harpoonLevel = Math.max(
        1,
        Math.min(Number(b.level) || 1, Object.keys(DEFENSE_STATS.harpoon).length),
      );
      const s = DEFENSE_STATS.harpoon[harpoonLevel] || DEFENSE_STATS.harpoon[1];
      const harpoon = {
        buildingId: b.id,
        type: 'harpoon',
        level: harpoonLevel,
        damage: wardDamage(s.damage),
        baseDamage: s.damage,
        fireRate: s.fireRate,
        detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        pullSpeed: s.pullSpeed,
        pullDuration: s.pullDuration,
        stopDistance: s.stopDistance,
        windup: s.windup,
        immunity: s.immunity,
        yawSpeedDeg: s.yawSpeedDeg,
        targetGround: false,
        targetAir: true,
        x: b.x,
        z: b.z,
        frozenUntil: 0,
        state: 'tracking',
        trackedTargetId: null,
        reservedTargetId: null,
        projectile: null,
        pull: null,
        currentYaw: 0,
        searchTicks: 0,
        windupTicks: 0,
        reloadReadyTick: 0,
        lastFireTick: null,
        impactSucceeded: false,
        disabled: false,
      };
      defenses.push(harpoon);
      harpoons.push(harpoon);
    }
    if (b.type === 'cannon') {
      const s = DEFENSE_STATS.cannon[b.level] || DEFENSE_STATS.cannon[1];
      defenses.push({
        buildingId: b.id, type: 'cannon',
        damage: wardDamage(s.damage), fireRate: s.fireRate, detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        targetGround: true, targetAir: false,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
        frozenUntil: 0,
        _searchTimer: 0,
      });
    }
    if (b.type === 'tombstone') {
      const guardCount = b.level || 1;
      const guardLevel = Math.max(1, Math.min(Object.keys(SKELETON_GUARD.levels || {}).length || 1, Number(b.level) || 1));
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
          frozenUntil: 0,
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

  harpoons.sort((left, right) => {
    const leftId = Number(left.buildingId);
    const rightId = Number(right.buildingId);
    if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
    return String(left.buildingId).localeCompare(String(right.buildingId));
  });
  airBombs.sort((left, right) => {
    if (left.buildingOrder !== right.buildingOrder) {
      return left.buildingOrder - right.buildingOrder;
    }
    const leftId = Number(left.buildingId);
    const rightId = Number(right.buildingId);
    if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
    return String(left.buildingId).localeCompare(String(right.buildingId));
  });
  flamethrowers.sort((left, right) => {
    if (left.buildingOrder !== right.buildingOrder) {
      return left.buildingOrder - right.buildingOrder;
    }
    const leftId = Number(left.buildingId);
    const rightId = Number(right.buildingId);
    if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
    return String(left.buildingId).localeCompare(String(right.buildingId));
  });

  const sortedActions = actions
    .filter(a => a && a.type !== 'battle_start')
    .map(a => ({ ...a, t: finiteNumber(a.t, 0) }))
    .sort((a, b) => a.t - b.t);
  let actionIdx = 0;

  while (time < TIME_LIMIT_SEC) {
    // ── Process player actions ──
    while (actionIdx < sortedActions.length && sortedActions[actionIdx].t <= time) {
      const act = sortedActions[actionIdx++];

      if (act.type === 'deploy_troop') {
        const rawName = act.troop || act.troop_entry || act.troopType;
        const troopType = normalizeTroopTypeName(rawName);
        const slotCost = troopSlotCost(rawName);
        if (
          VALID_TROOP_TYPES.includes(troopType)
          && shipSlotsConsumed + slotCost <= MAX_TROOPS
        ) {
          const level = resolveTroopLevel(rawName, troopType, serverTroopLevels, act.troopLevel);
          shipSlotsConsumed += slotCost;
          pendingSpawns.push({
            time: finiteNumber(act.t, 0) + Math.min(TROOP_SPAWN_DELAY, 0.08),
            troopType,
            troopLevel: level,
            playerTroopLevels: serverTroopLevels || act.playerTroopLevels || act.troopLevels || {},
            nftRarity: isNftBackedTroopType(troopType)
              ? (serverNftRarities[nftRarityLookupKey(troopType, rawName)] || nftRarityFromEntry(rawName) || 'common')
              : null,
            x: finiteNumber(act.x, 0),
            z: finiteNumber(act.z, 0),
            gridIndex: 2,
            replayOrder: finiteNumber(act.deploy_index, troopsManuallyDeployed),
          });
          troopsManuallyDeployed++;
        }
      }

      if (act.type === 'place_ship' && shipsPlaced < MAX_SHIPS) {
        // Support both old (troopType) and new (troops[]) format
        const shipTroops = (act.troops || (act.troopType ? [act.troopType] : []))
          .slice(0, TROOPS_PER_SHIP);
        const shipReplayIndex = finiteNumber(act.ship_index, shipsPlaced);
        const spawnX = finiteNumber(act.troop_x, finiteNumber(act.x, 0));
        const spawnZ = finiteNumber(act.troop_z, finiteNumber(act.z, 0));
        const troopSpawns = Array.isArray(act.troop_spawns) ? act.troop_spawns : [];
        for (let ti = 0; ti < shipTroops.length; ti++) {
          const rawName = shipTroops[ti];
          if (String(rawName || '') === '_SLOT_FILLER_') continue;
          const troopType = normalizeTroopTypeName(rawName);
          if (!VALID_TROOP_TYPES.includes(troopType)) continue;
          const slotCost = troopSlotCost(rawName);
          if (shipSlotsConsumed + slotCost > MAX_TROOPS) continue;
          shipSlotsConsumed += slotCost;
          const level = resolveTroopLevel(rawName, troopType, serverTroopLevels, act.troopLevel);
          const troopSpawn = troopSpawns[ti] || {};
          pendingSpawns.push({
            time: act.t + SAIL_DELAY_SEC + ti * TROOP_SPAWN_DELAY,
            troopType, troopLevel: level,
            playerTroopLevels: serverTroopLevels || act.playerTroopLevels || act.troopLevels || {},
            nftRarity: isNftBackedTroopType(troopType)
              ? (serverNftRarities[nftRarityLookupKey(troopType, rawName)] || nftRarityFromEntry(rawName) || 'common')
              : null,
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
        const cost = cannonShotCost(authoritativeShipLevel, cannonShotsFired + 1);
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
        const target = buildings.find(b => b.id === act.buildingId && b.hp > 0 && isCombatTargetBuilding(b));
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
            damage: cannonDamage,
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
          ? buildings.find(b => b.id === rallyBuildingId && b.hp > 0 && isCombatTargetBuilding(b))
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

      if (act.type === 'medkit_drop') {
        const actionTime = finiteNumber(act.t, time);
        if (Math.max(1, Math.trunc(Number(serverShipLevel) || 1)) < MEDKIT_UNLOCK_SHIP_LEVEL) {
          medkitEventsIgnored++;
          traceEvent('medkit_ignored', { reason: 'locked', shipLevel: serverShipLevel });
          continue;
        }
        const medkitCost = escalatingAbilityCost(
          MEDKIT_ENERGY_COST,
          medkitUses,
          MEDKIT_ENERGY_COST_INCREMENT,
        );
        if (cannonEnergy < medkitCost) {
          medkitEventsIgnored++;
          traceEvent('medkit_ignored', {
            reason: 'energy',
            cost: medkitCost,
            energy: cannonEnergy,
          });
          continue;
        }
        const rawX = finiteNumber(act.x, NaN);
        const rawZ = finiteNumber(act.z, NaN);
        if (!Number.isFinite(rawX) || !Number.isFinite(rawZ)) {
          medkitEventsIgnored++;
          traceEvent('medkit_ignored', {
            reason: 'invalid_point',
            x: act.x ?? null,
            z: act.z ?? null,
          });
          continue;
        }
        const point = clampWorldPointToGridUnion(
          movementGridConfigs,
          { x: rawX, z: rawZ },
          1.05,
        );
        cannonEnergy -= medkitCost;
        medkitUses++;
        medkitEventsAccepted++;
        const impactAt = actionTime + MEDKIT_TRAVEL_SEC;
        pendingMedkits.push({
          use: medkitUses,
          cost: medkitCost,
          x: point.x,
          z: point.z,
          time: impactAt,
        });
        traceEvent('medkit_fire', {
          use: medkitUses,
          cost: medkitCost,
          energyAfter: cannonEnergy,
          x: round3(point.x),
          z: round3(point.z),
          travelTime: MEDKIT_TRAVEL_SEC,
          impactAt: round3(impactAt),
        });
      }

      if (act.type === FREEZE_DROP.actionType) {
        const actionTime = finiteNumber(act.t, time);
        if (authoritativeShipLevel < FREEZE_DROP.unlockShipLevel) {
          freezeDropEventsIgnored++;
          traceEvent('freeze_drop_ignored', {
            reason: 'locked',
            shipLevel: authoritativeShipLevel,
          });
          continue;
        }
        const pointResult = validateTacticalPoint(act);
        if (!pointResult.valid) {
          freezeDropEventsIgnored++;
          traceEvent('freeze_drop_ignored', {
            reason: pointResult.reason,
            x: pointResult.x,
            z: pointResult.z,
          });
          continue;
        }
        const freezeDropCost = escalatingAbilityCost(
          FREEZE_DROP.energyCost,
          freezeDropUses,
          FREEZE_DROP.costIncrement,
        );
        if (cannonEnergy < freezeDropCost) {
          freezeDropEventsIgnored++;
          traceEvent('freeze_drop_ignored', {
            reason: 'energy',
            cost: freezeDropCost,
            energy: cannonEnergy,
          });
          continue;
        }

        cannonEnergy -= freezeDropCost;
        freezeDropUses++;
        freezeDropEventsAccepted++;
        const impactAt = actionTime + FREEZE_DROP.travelSec;
        pendingFreezeDrops.push({
          use: freezeDropUses,
          cost: freezeDropCost,
          time: impactAt,
          x: pointResult.point.x,
          z: pointResult.point.z,
        });
        traceEvent('freeze_drop_fire', {
          use: freezeDropUses,
          cost: freezeDropCost,
          energyAfter: cannonEnergy,
          x: round3(pointResult.point.x),
          z: round3(pointResult.point.z),
          travelTime: FREEZE_DROP.travelSec,
          impactAt: round3(impactAt),
        });
      }

      if (act.type === RAGE_DROP.actionType) {
        const actionTime = finiteNumber(act.t, time);
        if (authoritativeShipLevel < RAGE_DROP.unlockShipLevel) {
          rageDropEventsIgnored++;
          traceEvent('rage_drop_ignored', {
            reason: 'locked',
            shipLevel: authoritativeShipLevel,
          });
          continue;
        }
        const pointResult = validateTacticalPoint(act);
        if (!pointResult.valid) {
          rageDropEventsIgnored++;
          traceEvent('rage_drop_ignored', {
            reason: pointResult.reason,
            x: pointResult.x,
            z: pointResult.z,
          });
          continue;
        }
        const rageDropCost = escalatingAbilityCost(
          RAGE_DROP.energyCost,
          rageDropUses,
          RAGE_DROP.costIncrement,
        );
        if (cannonEnergy < rageDropCost) {
          rageDropEventsIgnored++;
          traceEvent('rage_drop_ignored', {
            reason: 'energy',
            cost: rageDropCost,
            energy: cannonEnergy,
          });
          continue;
        }

        cannonEnergy -= rageDropCost;
        rageDropUses++;
        rageDropEventsAccepted++;
        const impactAt = actionTime + RAGE_DROP.travelSec;
        pendingRageDrops.push({
          use: rageDropUses,
          cost: rageDropCost,
          x: pointResult.point.x,
          z: pointResult.point.z,
          time: impactAt,
        });
        traceEvent('rage_drop_fire', {
          use: rageDropUses,
          cost: rageDropCost,
          energyAfter: cannonEnergy,
          x: round3(pointResult.point.x),
          z: round3(pointResult.point.z),
          travelTime: RAGE_DROP.travelSec,
          impactAt: round3(impactAt),
        });
      }

      if (act.type === SKELETON_BARREL.actionType) {
        const actionTime = finiteNumber(act.t, time);
        if (authoritativeShipLevel < SKELETON_BARREL.unlockShipLevel) {
          skeletonBarrelEventsIgnored++;
          traceEvent('skeleton_barrel_ignored', {
            reason: 'locked',
            shipLevel: authoritativeShipLevel,
          });
          continue;
        }
        const rawBuildingId = act.buildingId ?? act.building_id;
        const targetBuildingId = typeof rawBuildingId === 'number'
          ? rawBuildingId
          : NaN;
        const target = Number.isSafeInteger(targetBuildingId)
          ? buildings.find(candidate => (
            Number(candidate.id) === targetBuildingId
            && candidate.hp > 0
            && isCombatTargetBuilding(candidate)
          ))
          : null;
        const pointResult = target
          ? { valid: true, point: { x: target.x, z: target.z } }
          : validateTacticalPoint(act);
        if (!pointResult.valid) {
          skeletonBarrelEventsIgnored++;
          traceEvent('skeleton_barrel_ignored', {
            reason: (
              rawBuildingId != null
              && typeof act.x !== 'number'
              && typeof act.z !== 'number'
            )
              ? 'invalid_target'
              : pointResult.reason,
            buildingId: rawBuildingId ?? null,
            x: act.x ?? null,
            z: act.z ?? null,
          });
          continue;
        }
        const skeletonBarrelCost = escalatingAbilityCost(
          SKELETON_BARREL.energyCost,
          skeletonBarrelUses,
          SKELETON_BARREL.costIncrement,
        );
        if (cannonEnergy < skeletonBarrelCost) {
          skeletonBarrelEventsIgnored++;
          traceEvent('skeleton_barrel_ignored', {
            reason: 'energy',
            buildingId: target?.id ?? null,
            cost: skeletonBarrelCost,
            energy: cannonEnergy,
          });
          continue;
        }

        cannonEnergy -= skeletonBarrelCost;
        skeletonBarrelUses++;
        skeletonBarrelEventsAccepted++;
        const impactAt = actionTime + SKELETON_BARREL.travelSec;
        pendingSkeletonBarrels.push({
          use: skeletonBarrelUses,
          time: impactAt,
          x: pointResult.point.x,
          z: pointResult.point.z,
          target,
        });
        traceEvent('skeleton_barrel_fire', {
          use: skeletonBarrelUses,
          cost: skeletonBarrelCost,
          energyAfter: cannonEnergy,
          target: target ? traceEntityPayload(target, 'building') : null,
          x: round3(pointResult.point.x),
          z: round3(pointResult.point.z),
          travelTime: SKELETON_BARREL.travelSec,
          impactAt: round3(impactAt),
        });
      }
    }

    // ── Deploy pending troops ──
    for (let i = pendingSpawns.length - 1; i >= 0; i--) {
      if (pendingSpawns[i].time <= time) {
        const sp = pendingSpawns.splice(i, 1)[0];
        const baseStats = isNftBackedTroopType(sp.troopType)
          ? computeNftTroopStats(sp.playerTroopLevels, sp.troopType, sp.nftRarity, sp.troopLevel)
          : (TROOP_STATS[sp.troopType]?.[sp.troopLevel] || TROOP_STATS[sp.troopType]?.[1]);
        const stats = baseStats;
        if (!stats) continue;
        // One troop per spawn entry
        const troopId = nextTroopId++;
        const spawnGridConfig = sp.gridIndex == null
          ? defaultGridConfig
          : (gridConfigMap[String(sp.gridIndex)] || defaultGridConfig);
        const spawnPos = clampWorldPointToGrid(spawnGridConfig, { x: sp.x, z: sp.z }, 1.05);
        const movementProfile = troopMovementProfile(sp.troopType, 0);
        troops.push({
          id: troopId,
          replayOrder: sp.replayOrder,
          type: sp.troopType,
          level: sp.troopLevel,
          hp: stats.hp, maxHp: stats.hp, damage: stats.damage,
          atkSpeed: stats.atkSpeed, moveSpeed: stats.moveSpeed, range: stats.range,
          melee: stats.melee, projSpeed: stats.projSpeed || 0,
          burstPhases: Array.isArray(stats.burstPhases)
            ? stats.burstPhases
              .map(Number)
              .filter(phase => Number.isFinite(phase) && phase >= 0 && phase < 1)
            : [],
          burstShotIndex: 0,
          directHit: !!stats.directHit,
          flying: !!stats.flying,
          chainJumps: Math.max(0, Number(stats.chainJumps) || 0),
          chainRadius: Math.max(0, Number(stats.chainRadius) || 0),
          chainFalloffBps: Math.max(0, Math.min(10000, Number(stats.chainFalloffBps) || 0)),
          trapImmune: !!stats.trapImmune,
          trapImmuneDamageMultiplier: Math.max(
            0,
            Number(stats.trapImmuneDamageMultiplier) || 0,
          ),
          untargetableWhileRunning: !!stats.untargetableWhileRunning,
          concealmentEndsOnAttack: !!stats.concealmentEndsOnAttack,
          defensePriority: !!stats.defensePriority,
          deathFreezeRadius: Math.max(0, Number(stats.deathFreezeRadius) || 0),
          deathFreezeDuration: Math.max(0, Number(stats.deathFreezeDuration) || 0),
          buildingOnly: !!stats.buildingOnly,
          separationRadius: movementProfile.separationRadius,
          separationForce: movementProfile.separationForce,
          passThroughFriendlyUnits: movementProfile.passThroughFriendlyUnits,
          targetType: stats.flying ? UNIT_TARGET_AIR : UNIT_TARGET_GROUND,
          hitDelay: stats.hitDelay || 0,
          shootDelay: sp.troopType === 'necromancer'
            ? NECROMANCER_ATTACK_RELEASE_SEC / stats.atkSpeed
            : (stats.shootDelay || 0),
          x: spawnPos.x, z: spawnPos.z,
          atkTimer: 0, hitPending: false, hitTimer: 0,
          hitDone: false,
          _pendingTarget: null,
          _state: stats.untargetableWhileRunning ? 'running' : 'idle',
          _defenseConcealmentBroken: false,
          _retargetCounter: 0,
          _sepCounter: 0,
          _moveSepCounter: 0,
          _lastMoveSeparationX: 0,
          _lastMoveSeparationZ: 0,
          _slotEvalTimer: 0,
          _orbitAngle: 0,
          _stuckTimer: 0,
          _lastX: spawnPos.x,
          _lastZ: spawnPos.z,
          _currentTarget: null,      // sticky target ref
          _currentTargetIsGuard: false,
          _forceRetarget: false,
          _deathHandled: false,
          _nextSummonAt: sp.troopType === 'necromancer'
            ? time + NECROMANCER_SUMMON.initialDelay
            : null,
          _summonSequence: 0,
          _summonBatchSerial: 0,
          _summonBatchSpawned: false,
          _windCastSerial: 0,
          evolutionStage: 0,
          evolutionLineage: 0,
          evolutionRootOrder: sp.replayOrder,
          evolutionChild: false,
        });
        deployedTroopsSpawned++;
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
          target.hp -= cannonDamage;
          traceEvent('cannon_hit', {
            buildingId: target.id,
            type: target.type,
            damage: cannonDamage,
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
    // Ship payloads use fixed authoritative travel times. Client payload
    // timing is ignored, keeping visual and verified impacts in sync.
    for (let i = pendingMedkits.length - 1; i >= 0; i--) {
      if (pendingMedkits[i].time <= time + 1e-9) {
        const impact = pendingMedkits.splice(i, 1)[0];
        activeMedkits.push({
          x: impact.x,
          z: impact.z,
          startAt: impact.time,
          nextTickAt: impact.time + MEDKIT_TICK_SEC,
          expiresAt: impact.time + MEDKIT_DURATION_SEC,
        });
        traceEvent('medkit_drop', {
          use: impact.use,
          cost: impact.cost,
          x: round3(impact.x),
          z: round3(impact.z),
          expiresAt: round3(impact.time + MEDKIT_DURATION_SEC),
        });
      }
    }

    // Client payload timing is ignored, keeping visual and verified impacts in sync.
    for (let i = pendingFreezeDrops.length - 1; i >= 0; i--) {
      if (pendingFreezeDrops[i].time <= time + 1e-9) {
        const impact = pendingFreezeDrops.splice(i, 1)[0];
        applyFreezeDrop(
          { x: impact.x, z: impact.z },
          impact.time,
          impact.use,
          impact.cost,
        );
      }
    }

    for (let i = pendingRageDrops.length - 1; i >= 0; i--) {
      if (pendingRageDrops[i].time <= time + 1e-9) {
        const impact = pendingRageDrops.splice(i, 1)[0];
        const field = {
          id: nextRageDropId++,
          x: impact.x,
          z: impact.z,
          startAt: impact.time,
          expiresAt: impact.time + RAGE_DROP.durationSec,
        };
        activeRageDrops.push(field);
        traceEvent('rage_drop', {
          fieldId: field.id,
          use: impact.use,
          cost: impact.cost,
          x: round3(field.x),
          z: round3(field.z),
          radius: RAGE_DROP.radius,
          duration: RAGE_DROP.durationSec,
          graceSec: RAGE_DROP.graceSec,
          damageMultiplier: RAGE_DROP.damageMultiplier,
          attackSpeedMultiplier: RAGE_DROP.attackSpeedMultiplier,
          moveSpeedMultiplier: RAGE_DROP.moveSpeedMultiplier,
          expiresAt: round3(field.expiresAt),
        });
      }
    }

    // Skeleton barrels use a fixed authoritative travel time. A valid building
    // id resolves to its server position; ground drops use validated grid coords.
    for (let i = pendingSkeletonBarrels.length - 1; i >= 0; i--) {
      if (pendingSkeletonBarrels[i].time <= time + 1e-9) {
        const impact = pendingSkeletonBarrels.splice(i, 1)[0];
        const target = impact.target;
        const hpBefore = target?.hp ?? 0;
        let actualDamage = 0;
        if (target && target.hp > 0) {
          actualDamage = Math.min(target.hp, SKELETON_BARREL.impactDamage);
          target.hp -= SKELETON_BARREL.impactDamage;
          if (target.hp <= 0) {
            traceBuildingDestroyed(target, 'skeleton_barrel');
            cannonEnergy += CANNON_ENERGY_PER_DESTROY;
          }
        }
        skeletonBarrelImpacts++;
        skeletonBarrelImpactDamageApplied += actualDamage;
        traceEvent('skeleton_barrel_impact', {
          use: impact.use,
          buildingId: target?.id ?? null,
          type: target?.type ?? null,
          damage: SKELETON_BARREL.impactDamage,
          actualDamage,
          hpBefore,
          hpAfter: target?.hp ?? null,
          targetAliveAtImpact: hpBefore > 0,
          x: round3(impact.x),
          z: round3(impact.z),
          spawnCount: SKELETON_BARREL.spawnCount,
        });
        for (let spawnIndex = 0; spawnIndex < SKELETON_BARREL.spawnCount; spawnIndex++) {
          spawnSkeletonBarrelSkeleton(impact, spawnIndex);
        }
      }
    }

    for (const troop of troops) {
      if (
        !troop.temporary
        || troop.hp <= 0
        || !Number.isFinite(troop.expiresAt)
        || time + 1e-9 < troop.expiresAt
      ) {
        continue;
      }
      const hpBefore = troop.hp;
      const reason = troop.summonSource === 'wind_mage'
        ? 'lifetime'
        : 'lifetime_expired';
      if (despawnSummonedUnit(troop, reason)) {
        if (troop.summonSource === 'wind_mage') {
          windlingsExpired++;
          traceEvent('windling_expired', {
            troopId: troop.id,
            replayOrder: troop.replayOrder ?? null,
            ownerTroopId: troop.summonOwnerId,
            summon_index: troop.summonSequence,
            lifetime: WINDLING_LIFETIME_SEC,
            expires_at: round3(troop.expiresAt),
            hpBefore,
          });
        }
        if (troop.summonSource !== 'skeleton_barrel') continue;
        skeletonBarrelSkeletonsExpired++;
        traceEvent('skeleton_barrel_skeleton_expired', {
          use: troop.barrelUse,
          troopId: troop.id,
          replayOrder: troop.replayOrder ?? null,
          lifetime: SKELETON_BARREL.lifetimeSec,
          expiresAt: round3(troop.expiresAt),
          hpBefore,
        });
      }
    }

    for (let i = activeRageDrops.length - 1; i >= 0; i--) {
      if (time + 1e-9 < activeRageDrops[i].expiresAt) continue;
      const field = activeRageDrops.splice(i, 1)[0];
      traceEvent('rage_expired', {
        fieldId: field.id,
        x: round3(field.x),
        z: round3(field.z),
      });
    }

    const aliveTroops = [];
    for (const t of troops) { if (t.hp > 0) aliveTroops.push(t); }
    const aliveGuards = [];
    for (const g of guards) { if (g.hp > 0) aliveGuards.push(g); }
    const aliveBuildings = [];
    for (const b of buildings) { if (b.hp > 0 && isCombatTargetBuilding(b)) aliveBuildings.push(b); }

    // A medkit heals paid attacking troops that remain inside the field.
    // Summoned skeletons are deliberately excluded: they cost no ship space
    // and healing them would multiply the necromancer's free unit value.
    const dueMedkitTicks = [];
    for (const field of activeMedkits) {
      while (
        field.nextTickAt <= time + 1e-9
        && field.nextTickAt <= field.expiresAt + 1e-9
      ) {
        dueMedkitTicks.push({
          time: field.nextTickAt,
          x: field.x,
          z: field.z,
        });
        field.nextTickAt += MEDKIT_TICK_SEC;
      }
    }
    dueMedkitTicks.sort((a, b) => a.time - b.time);
    for (const tick of dueMedkitTicks) {
      let healedThisTick = 0;
      let troopsHealedThisTick = 0;
      for (const troop of aliveTroops) {
        if (troop.summoned || troop.medkitHealable === false) continue;
        const maxHp = Math.max(1, finiteNumber(troop.maxHp, troop.hp));
        if (troop.hp >= maxHp) continue;
        if (distSq2d(troop.x, troop.z, tick.x, tick.z) > MEDKIT_RADIUS * MEDKIT_RADIUS) continue;
        const lastHealAt = Number.isFinite(troop._lastMedkitHealAt)
          ? troop._lastMedkitHealAt
          : -Infinity;
        if (tick.time - lastHealAt < MEDKIT_TICK_SEC - 1e-9) continue;
        const hpBefore = troop.hp;
        troop.hp = Math.min(maxHp, troop.hp + MEDKIT_HEAL_PER_TICK);
        const healed = Math.max(0, troop.hp - hpBefore);
        healedThisTick += healed;
        if (healed > 0) {
          troop._lastMedkitHealAt = tick.time;
          troopsHealedThisTick++;
        }
      }
      medkitHealTicks++;
      medkitHealingApplied += healedThisTick;
      if (healedThisTick > 0) {
        traceEvent('medkit_tick', {
          x: round3(tick.x),
          z: round3(tick.z),
          healed: round3(healedThisTick),
          troops: troopsHealedThisTick,
        });
      }
    }
    for (let i = activeMedkits.length - 1; i >= 0; i--) {
      const field = activeMedkits[i];
      if (time + 1e-9 >= field.expiresAt) {
        activeMedkits.splice(i, 1);
        traceEvent('medkit_expired', {
          x: round3(field.x),
          z: round3(field.z),
        });
      }
    }

    // Necromancer summons are internal server entities, not replay actions.
    // They therefore never enter ship capacity accounting or pendingSpawns.
    const summonOwners = aliveTroops
      .filter(troop => !troop.summoned && troop.type === 'necromancer')
      .sort((a, b) => (a.replayOrder ?? a.id) - (b.replayOrder ?? b.id));
    for (const owner of summonOwners) {
      if (aliveBuildings.length === 0) continue;
      const activeForOwner = troops.filter(
        unit => unit.summoned && unit.summonOwnerId === owner.id && unit.hp > 0
      ).length;
      if (activeForOwner > 0) {
        owner._nextSummonAt = null;
        continue;
      }
      if (!Number.isFinite(owner._nextSummonAt)) {
        owner._nextSummonAt = time + (
          owner._summonBatchSpawned
            ? NECROMANCER_SUMMON.respawnDelay
            : NECROMANCER_SUMMON.initialDelay
        );
      }
      if (time + 1e-9 < owner._nextSummonAt) continue;

      owner._summonBatchSerial++;
      const summonCount = Math.min(
        NECROMANCER_SUMMON.batchSize,
        NECROMANCER_SUMMON.maxActive,
      );
      for (let batchIndex = 0; batchIndex < summonCount; batchIndex++) {
        spawnNecromancerSkeleton(
          owner,
          aliveTroops,
          aliveBuildings,
          batchIndex,
          owner._summonBatchSerial,
        );
      }
      owner._summonBatchSpawned = true;
      owner._nextSummonAt = null;
    }

    // A ship impact can destroy the Town Hall before this tick reaches the
    // defensive phase. Match the client victory boundary: once that happens,
    // armed traps and defenses get no final same-tick activation.
    const townHallBeforeDefensePhase = buildings.find(b => b.id === townHallId);
    if (townHallBeforeDefensePhase && townHallBeforeDefensePhase.hp <= 0) {
      simulationEndReason = 'town_hall_destroyed';
      stopFlamethrowerDefenses('battle_end');
      break;
    }

    // Traps resolve before defenses and movement. Each trap eliminates one
    // ordinary ground troop; Demon King takes level-scaled damage, while an
    // immune troop still consumes the trap but takes no damage.
    for (const trap of sharkTraps) {
      if (trap.triggered || (Number(trap.frozenUntil) || 0) > time) continue;
      let targetIndex = -1;
      let targetDistanceSq = Infinity;
      let targetReplayOrder = Infinity;
      for (let i = 0; i < aliveTroops.length; i++) {
        const troop = aliveTroops[i];
        if (!troopInsideSharkTrap(troop, trap)) continue;
        const distanceSq = distSq2d(troop.x, troop.z, trap.x, trap.z);
        const replayOrder = Number(troop.replayOrder);
        if (distanceSq < targetDistanceSq - 1e-9
          || (Math.abs(distanceSq - targetDistanceSq) <= 1e-9 && replayOrder < targetReplayOrder)) {
          targetIndex = i;
          targetDistanceSq = distanceSq;
          targetReplayOrder = replayOrder;
        }
      }
      if (targetIndex < 0) continue;
      const target = aliveTroops[targetIndex];
      const hpBefore = target.hp;
      const trapImmune = !!target.trapImmune;
      const instantKill = !trapImmune && normalizeTroopTypeName(target.type) !== 'demon_king';
      const appliedDamage = trapImmune
        ? Math.max(
          0,
          Math.round(
            trap.damage * Math.max(
              0,
              Number(target.trapImmuneDamageMultiplier) || 0,
            ),
          ),
        )
        : (instantKill ? Math.max(1, target.hp) : trap.damage);
      target.hp -= appliedDamage;
      trap.triggered = true;
      trap.troopId = target.id;
      traceEvent('shark_trap_trigger', {
        buildingId: trap.buildingId,
        level: trap.level,
        damage: appliedDamage,
        levelDamage: trap.damage,
        instantKill,
        trapImmune,
        troopId: target.id,
        replayOrder: target.replayOrder,
        troop: target.type,
        hpBefore,
        hpAfter: Math.max(0, target.hp),
        x: round3(target.x),
        z: round3(target.z),
      });
      if (target.hp <= 0) {
        handleTroopDeath(target, 'shark_trap', appliedDamage);
        aliveTroops.splice(targetIndex, 1);
      }
    }

    // Rally grenade impact. The client spends energy on launch, but troops
    // only receive the command when the grenade lands.
    for (let i = pendingRallies.length - 1; i >= 0; i--) {
      if (pendingRallies[i].time <= time) {
        const r = pendingRallies.splice(i, 1)[0];
        rallyFocus = resolveRallyTarget(r.x, r.z, aliveBuildings, aliveGuards);
        if (rallyFocus) {
          for (const t of aliveTroops) {
            if (t.buildingOnly && rallyFocus.isGuard) continue;
            applyRallyFocus(t, rallyFocus);
          }
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

    // Mortar shells use a fixed impact point and travel duration. Resolve
    // existing shells before defenses fire this tick, matching
    // tower_mortar.gd::_physics_process(). The original target is deliberately
    // irrelevant once a shell has launched.
    for (let i = mortarProjectiles.length - 1; i >= 0; i--) {
      const p = mortarProjectiles[i];
      if (p.impactAt > time + 1e-9) continue;
      mortarProjectiles.splice(i, 1);

      const radius = Math.max(0, Number(p.splashRadius) || 0);
      const radiusSq = radius * radius;
      let hitCount = 0;
      const impactSnapshot = aliveTroops.slice();
      for (const troop of impactSnapshot) {
        if (!canDefenseTargetTroop({ targetGround: true, targetAir: false }, troop)) continue;
        const dx = p.impactX - troop.x;
        const dz = p.impactZ - troop.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > radiusSq) continue;
        const distance = Math.sqrt(distanceSq);
        const distanceRatio = Math.min(1, distance / Math.max(radius, 0.001));
        const damage = Math.max(1, Math.round(p.damage * (1 - 0.45 * distanceRatio)));
        const hpBefore = troop.hp;
        troop.hp -= damage;
        hitCount++;
        traceEvent('defense_splash_hit', {
          defenseType: 'mortar',
          buildingId: p.buildingId,
          targetTroopId: troop.id,
          replayOrder: troop.replayOrder ?? null,
          targetTroop: troop.type,
          damage,
          hpBefore,
          hpAfter: troop.hp,
          impactX: round3(p.impactX),
          impactZ: round3(p.impactZ),
          splashRadius: radius,
          distance: round3(distance),
          x: round3(troop.x),
          z: round3(troop.z),
        });
        if (troop.hp <= 0) handleTroopDeath(troop, 'defense_splash', damage);
      }
      traceEvent('defense_projectile_hit', {
        defenseType: 'mortar',
        buildingId: p.buildingId,
        damage: p.damage,
        hitCount,
        impactX: round3(p.impactX),
        impactZ: round3(p.impactZ),
        splashRadius: radius,
      });
      for (let troopIndex = aliveTroops.length - 1; troopIndex >= 0; troopIndex--) {
        if (aliveTroops[troopIndex].hp <= 0) aliveTroops.splice(troopIndex, 1);
      }
    }

    // Committed Air Bomb projectiles resolve independently from their owner.
    // Existing projectiles move before this tick's acquisition/launch edge so
    // a newly fired bomb begins movement on the following 60 Hz tick.
    updateAirBombProjectiles();
    for (let troopIndex = aliveTroops.length - 1; troopIndex >= 0; troopIndex--) {
      if (aliveTroops[troopIndex].hp <= 0) aliveTroops.splice(troopIndex, 1);
    }
    updateAirBombDefenses(aliveTroops);

    // Approved deterministic defense order: traps and committed mortar/Air
    // Bomb work resolve first, then fixed-facing Flamethrower pulses, then
    // ordinary projectile/generic defenses.
    updateFlamethrowerDefenses(aliveTroops);
    for (let troopIndex = aliveTroops.length - 1; troopIndex >= 0; troopIndex--) {
      if (aliveTroops[troopIndex].hp <= 0) aliveTroops.splice(troopIndex, 1);
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
      if (hpAfter <= 0) handleTroopDeath(target, 'defense_projectile', p.damage);
      if (Number(p.splashRadius) > 0) {
        const splashRadius = Math.max(0, Number(p.splashRadius) || 0);
        const splashSq = splashRadius * splashRadius;
        for (const other of aliveTroops) {
          if (!other || other.id === target.id || other.hp <= 0) continue;
          if (!canDefenseTargetTroop({ targetGround: true, targetAir: false }, other)) continue;
          const dx = target.x - other.x;
          const dz = target.z - other.z;
          const distSq = dx * dx + dz * dz;
          if (distSq > splashSq) continue;
          const dist = Math.sqrt(distSq);
          const falloff = 1.0 - Math.min(1, dist / Math.max(0.001, splashRadius)) * 0.45;
          const splashDamage = Math.max(1, Math.round(p.damage * falloff));
          const splashHpBefore = other.hp;
          other.hp -= splashDamage;
          traceEvent('defense_splash_hit', {
            defenseType: p.defenseType,
            buildingId: p.ownerRef?.id ?? null,
            targetTroopId: other.id,
            replayOrder: other.replayOrder ?? null,
            targetTroop: other.type,
            damage: splashDamage,
            hpBefore: splashHpBefore,
            hpAfter: other.hp,
            splashRadius,
            distance: Math.round(dist * 1000) / 1000,
            x: Math.round(other.x * 1000) / 1000,
            z: Math.round(other.z * 1000) / 1000,
          });
          if (other.hp <= 0) handleTroopDeath(other, 'defense_splash', splashDamage);
        }
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
      if (d.type === 'harpoon' || d.type === 'air_bomb' || d.type === 'flamethrower') continue;
      const bld = buildings.find(b => b.id === d.buildingId);
      if (!bld || bld.hp <= 0) continue;
      if ((Number(d.frozenUntil) || 0) > time) continue;

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
        const near = findNearestAlive(d.x, d.z, aliveTroops, {
          filter: t => canDefenseTargetTroop(d, t),
          preferReplayOrderOnTie: true,
        });
        traceEvent('defense_scan', {
          defenseType: d.type,
          buildingId: d.buildingId,
          targetTroopId: near?.target?.id ?? null,
          replayOrder: near?.target?.replayOrder ?? null,
          targetTroop: near?.target?.type ?? null,
          dist: near ? Math.round(Math.sqrt(near.distSq) * 1000) / 1000 : null,
          minRange: d.minRange ?? 0,
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
        // Turret and mortar explicitly prime their timer on acquisition in
        // Godot. Cannon and archer tower wait through their first full cycle.
        d.timer = (d.type === 'turret' || d.type === 'mortar') ? d.fireRate : 0;
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
          handleTroopDeath(
            currentTarget,
            'defense_beam',
            Math.max(1, Math.round(d.baseDamage + (d.maxDamage - d.baseDamage) * d.beamCharge))
          );
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
        if (d.type === 'mortar') {
          mortarProjectiles.push({
            buildingId: d.buildingId,
            impactAt: time + Math.max(TICK_DT, Number(d.travelTime) || TICK_DT),
            impactX: currentTarget.x,
            impactZ: currentTarget.z,
            damage: d.damage,
            splashRadius: d.splashRadius || 0,
          });
        } else {
          projectiles.push({
            x: d.x, z: d.z,
            y: d.type === 'turret' ? TURRET_PROJECTILE_SPAWN_Y : TOWER_PROJECTILE_SPAWN_Y,
            targetY: d.type === 'turret' ? TURRET_TARGET_AIM_Y : TOWER_TARGET_AIM_Y,
            phase: 'defense',
            defenseType: d.type,
            ownerRef: bld,
            targetRef: currentTarget, speed: d.projSpeed, damage: d.damage,
            splashRadius: d.splashRadius || 0,
            isBuilding: false,
            hitDistSq: d.type === 'turret' ? TURRET_HIT_DIST_SQ : PROJ_HIT_DIST_SQ,
          });
        }
        traceEvent('defense_fire', {
          defenseType: d.type,
          buildingId: d.buildingId,
          targetTroopId: currentTarget.id,
          replayOrder: currentTarget.replayOrder ?? null,
          targetTroop: currentTarget.type,
          targetHp: currentTarget.hp,
          minRange: d.minRange ?? 0,
          travelTime: d.type === 'mortar' ? d.travelTime : undefined,
          projectileX: round3(d.x),
          projectileZ: round3(d.z),
          impactX: d.type === 'mortar' ? round3(currentTarget.x) : undefined,
          impactZ: d.type === 'mortar' ? round3(currentTarget.z) : undefined,
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
      if ((Number(g.frozenUntil) || 0) > time) continue;
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
        if (target.hp <= 0) handleTroopDeath(target, 'guard_melee', g.damage);
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
      const rageBoosted = resolveRageBoost(t);
      const attackInterval = t.atkSpeed / (
        rageBoosted ? RAGE_DROP.attackSpeedMultiplier : 1
      );
      const moveSpeed = t.moveSpeed * (
        rageBoosted ? RAGE_DROP.moveSpeedMultiplier : 1
      );
      const attackDamage = rageBoosted
        ? Math.max(1, Math.round(t.damage * RAGE_DROP.damageMultiplier))
        : t.damage;
      if (rageBoosted) rageBoostedTroopTicks++;
      // Retarget throttle — only search every RETARGET_INTERVAL frames (matches client)
      if (Number.isFinite(t._activationAt) && time + 1e-9 < t._activationAt) {
        cannonEnergy += updateTroopProjectilesFor(t);
        continue;
      }
      let target = t._currentTarget;
      let targetIsGuard = t._currentTargetIsGuard;

      if (rallyFocus && !isRallyFocusValid(rallyFocus)) {
        rallyFocus = null;
      }

      if (rallyFocus && (!t.buildingOnly || !rallyFocus.isGuard)) {
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
        const priorityBuildings = t.defensePriority
          ? aliveBuildings.filter(isIceGolemPriorityDefense)
          : [];
        const usesDefensePriority = priorityBuildings.length > 0;
        const nearB = findNearestAlive(
          t.x,
          t.z,
          usesDefensePriority ? priorityBuildings : aliveBuildings
        );
        const nearG = usesDefensePriority || t.buildingOnly
          ? null
          : findNearestAlive(t.x, t.z, aliveGuards, { preferWeakOnTie: true });
        let bestTarget = null;
        let bestDistSq = Infinity;
        targetIsGuard = false;

        if (nearB) { bestTarget = nearB.target; bestDistSq = nearB.distSq; }
        if (nearG && nearG.distSq < bestDistSq) {
          bestTarget = nearG.target; bestDistSq = nearG.distSq; targetIsGuard = true;
        }
        const currentGuardDistSq = t._currentTargetIsGuard && t._currentTarget
          ? distSq2d(t.x, t.z, t._currentTarget.x, t._currentTarget.z)
          : Infinity;
        const currentGuardStickyRange = t.range * Math.max(GUARD_THREAT_MULT, 2.0);
        // Match the client: once a nearby guard is engaged, a periodic
        // defense-priority search must not reset the melee wind-up.
        const hasEngagedGuard = t._currentTargetIsGuard
          && t._currentTarget?.hp > 0
          && currentGuardDistSq <= currentGuardStickyRange * currentGuardStickyRange;
        const currentMatchesPriorityTier = hasEngagedGuard
          || !usesDefensePriority
          || (!t._currentTargetIsGuard && isIceGolemPriorityDefense(t._currentTarget));
        if (currentMatchesPriorityTier && shouldKeepCurrentTarget(t, bestTarget, bestDistSq)) {
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
      if (target && !targetIsGuard && !t.buildingOnly) {
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

      if (
        t._state === 'attacking'
        && t._harpoonPulledBy == null
        && targetDist > t.range * 2.0
      ) {
        t._state = 'running';
        t.burstShotIndex = 0;
      }

      if (t._state !== 'attacking') {
        // A Harpoon suppresses voluntary horizontal movement only. Targeting,
        // timers, already-spawned projectiles, and an attack already in its
        // attacking state keep advancing normally.
        if (t._harpoonPulledBy != null) {
          cannonEnergy += updateTroopProjectilesFor(t);
          continue;
        }
        const myAngle = Math.atan2(t.x - target.x, t.z - target.z);
        const slot = computeAttackSlot(t, target, aliveTroops);
        const slotDx = slot.x - t.x;
        const slotDz = slot.z - t.z;
        const slotDist = Math.sqrt(slotDx * slotDx + slotDz * slotDz);
        const dirDx = slotDist > 0.01 ? slotDx / slotDist : (target.x - t.x) / (targetDist || 1);
        const dirDz = slotDist > 0.01 ? slotDz / slotDist : (target.z - t.z) / (targetDist || 1);
        applyMovementSteering(
          t,
          dirDx * moveSpeed * TICK_DT,
          dirDz * moveSpeed * TICK_DT,
          target,
          aliveTroops,
          aliveGuards,
          aliveBuildings,
          movementGridConfigs
        );
        if (rageBoosted) rageBoostedMoveTicks++;
        if (slotDist < 0.05 || targetDist <= t.range) {
          if (
            t.concealmentEndsOnAttack
            && !t._defenseConcealmentBroken
          ) {
            t._defenseConcealmentBroken = true;
            traceEvent('troop_defense_concealment_broken', {
              troopId: t.id,
              replayOrder: t.replayOrder ?? null,
              troop: t.type,
              target: traceEntityPayload(
                target,
                targetIsGuard ? 'guard' : 'building',
              ),
              x: round3(t.x),
              z: round3(t.z),
            });
          }
          enterTroopAttackState(t);
          cannonEnergy += updateTroopProjectilesFor(t);
          continue;
        }
        checkStuck(t, myAngle);
        cannonEnergy += updateTroopProjectilesFor(t);
        continue;
      }

      applyTroopAttackSeparation(
        t,
        target,
        aliveTroops,
        movementGridConfigs,
      );
      t.atkTimer += TICK_DT;

      if (t.type === 'wind_mage') {
        if (
          !t.hitDone
          && !targetIsGuard
          && t.atkTimer >= attackInterval * WIND_MAGE.strikeAnimNormalized
        ) {
          t.hitDone = true;
          if (rageBoosted) rageBoostedAttacks++;
          cannonEnergy += applyWindMageWave(
            t,
            target,
            aliveBuildings,
            aliveTroops,
            attackDamage,
            rageBoosted,
          );
        }
        if (t.atkTimer >= attackInterval) {
          t.atkTimer -= attackInterval;
          t.hitDone = false;
          t._windCastSerial++;
        }
      } else if (Array.isArray(t.burstPhases) && t.burstPhases.length > 0) {
        while (
          t.burstShotIndex < t.burstPhases.length
          && t.atkTimer >= attackInterval * t.burstPhases[t.burstShotIndex]
        ) {
          const burstIndex = t.burstShotIndex;
          t.burstShotIndex++;
          const burstTarget = t._currentTarget || target;
          if (!burstTarget || burstTarget.hp <= 0) {
            traceEvent('troop_projectile_lost_target', {
              reason: !burstTarget ? 'target_missing_before_burst' : 'target_dead_before_burst',
              troopId: t.id,
              replayOrder: t.replayOrder ?? null,
              troop: t.type,
              burstIndex,
              burstCount: t.burstPhases.length,
              projectileX: round3(t.x),
              projectileZ: round3(t.z),
            });
            continue;
          }
          if (rageBoosted) rageBoostedAttacks++;
          projectiles.push({
            x: t.x,
            z: t.z,
            y: TROOP_PROJECTILE_SPAWN_Y,
            targetY: TROOP_TARGET_AIM_Y,
            phase: 'troop',
            ownerRef: t,
            ownerTroopId: t.id,
            ownerReplayOrder: t.replayOrder ?? null,
            ownerTroopType: t.type,
            targetRef: burstTarget,
            speed: t.projSpeed,
            damage: attackDamage,
            baseDamage: t.damage,
            rageBoosted,
            isBuilding: !!burstTarget.type,
            hitDistSq: PROJ_HIT_DIST_SQ,
            burstIndex,
            burstCount: t.burstPhases.length,
          });
          traceEvent('troop_projectile_fire', {
            troopId: t.id,
            replayOrder: t.replayOrder ?? null,
            troop: t.type,
            ...traceTroopStatePayload(t),
            projectileX: round3(t.x),
            projectileZ: round3(t.z),
            target: traceEntityPayload(
              burstTarget,
              burstTarget.type ? 'building' : 'guard'
            ),
            damage: attackDamage,
            rageBoosted,
            projectileSpeed: t.projSpeed,
            burstIndex,
            burstCount: t.burstPhases.length,
          });
        }
        if (t.atkTimer >= attackInterval) {
          t.atkTimer -= attackInterval;
          t.burstShotIndex = 0;
        }
      } else if (t.melee) {
        if (!t.hitDone && t.atkTimer >= attackInterval * (t.hitDelay || 0.4)) {
          t.hitDone = true;
          const hpBefore = target.hp;
          target.hp -= attackDamage;
          if (rageBoosted) {
            rageBoostedAttacks++;
            recordRageDamage(t, target, t.damage, attackDamage, 'melee');
          }
          traceEvent('troop_melee_hit', {
            troopId: t.id,
            replayOrder: t.replayOrder ?? null,
            troop: t.type,
            targetKind: targetIsGuard ? 'guard' : 'building',
            targetId: target.id,
            targetType: target.type || 'guard',
            target: traceEntityPayload(target, targetIsGuard ? 'guard' : 'building'),
            damage: attackDamage,
            rageBoosted,
            hpBefore,
            hpAfter: target.hp,
          });
          if (t.summoned && t.type === 'necromancer_skeleton') {
            traceEvent('necromancer_skeleton_damage', {
              troopId: t.id,
              replayOrder: t.replayOrder ?? null,
              ownerTroopId: t.summonOwnerId,
              summonSequence: t.summonSequence,
              targetId: target.id,
              targetType: target.type || 'guard',
              damage: attackDamage,
              rageBoosted,
              hpBefore,
              hpAfter: target.hp,
            });
          }
          if (t.summonSource === 'skeleton_barrel') {
            traceEvent('skeleton_barrel_skeleton_damage', {
              use: t.barrelUse,
              troopId: t.id,
              replayOrder: t.replayOrder ?? null,
              spawnIndex: t.summonSequence,
              targetId: target.id,
              targetType: target.type || 'guard',
              damage: attackDamage,
              rageBoosted,
              hpBefore,
              hpAfter: target.hp,
            });
          }
          if (target.hp <= 0 && target.type) {
            traceBuildingDestroyed(target, 'troop_melee');
            t._forceRetarget = true;
          }
          if (target.hp <= 0 && target.type) cannonEnergy += CANNON_ENERGY_PER_DESTROY;
        }
        if (t.atkTimer >= attackInterval) {
          t.atkTimer -= attackInterval;
          t.hitDone = false;
        }
      } else if (t.directHit) {
        if (!t.hitDone && t.atkTimer >= attackInterval * (t.hitDelay || 0.4)) {
          t.hitDone = true;
          if (rageBoosted) rageBoostedAttacks++;
          if (t.chainJumps > 0) {
            cannonEnergy += applyChainLightningHit(
              t,
              target,
              targetIsGuard,
              attackDamage,
              rageBoosted,
            );
          } else {
          const hpBefore = target.hp;
          target.hp -= attackDamage;
          if (rageBoosted) {
            recordRageDamage(t, target, t.damage, attackDamage, 'direct_hit');
          }
          traceEvent('troop_ranged_direct_hit', {
            troopId: t.id,
            replayOrder: t.replayOrder ?? null,
            troop: t.type,
            targetKind: targetIsGuard ? 'guard' : 'building',
            targetId: target.id,
            targetType: target.type || 'guard',
            target: traceEntityPayload(target, targetIsGuard ? 'guard' : 'building'),
            damage: attackDamage,
            rageBoosted,
            hpBefore,
            hpAfter: target.hp,
          });
          if (target.hp <= 0 && target.type) {
            traceBuildingDestroyed(target, 'troop_ranged_direct');
            t._forceRetarget = true;
            cannonEnergy += CANNON_ENERGY_PER_DESTROY;
          }
          }
        }
        if (t.atkTimer >= attackInterval) {
          t.atkTimer -= attackInterval;
          t.hitDone = false;
        }
      } else {
        const shootAt = t.shootDelay > 0 ? attackInterval * t.shootDelay : 0;

        if (t.atkTimer >= attackInterval) {
          t.atkTimer -= attackInterval;
          if (shootAt <= 0) {
            if (rageBoosted) rageBoostedAttacks++;
            projectiles.push({
              x: t.x, z: t.z,
              y: TROOP_PROJECTILE_SPAWN_Y,
              targetY: TROOP_TARGET_AIM_Y,
              phase: 'troop',
              ownerRef: t,
              ownerTroopId: t.id,
              ownerReplayOrder: t.replayOrder ?? null,
              ownerTroopType: t.type,
              targetRef: target, speed: t.projSpeed, damage: attackDamage,
              baseDamage: t.damage, rageBoosted,
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
              damage: attackDamage,
              rageBoosted,
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
            if (rageBoosted) rageBoostedAttacks++;
            projectiles.push({
              x: t.x, z: t.z,
              y: TROOP_PROJECTILE_SPAWN_Y,
              targetY: TROOP_TARGET_AIM_Y,
              phase: 'troop',
              ownerRef: t,
              ownerTroopId: t.id,
              ownerReplayOrder: t.replayOrder ?? null,
              ownerTroopType: t.type,
              targetRef: pt, speed: t.projSpeed, damage: attackDamage,
              baseDamage: t.damage, rageBoosted,
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
              damage: attackDamage,
              rageBoosted,
              projectileSpeed: t.projSpeed,
            });
          }
        }
      }
      cannonEnergy += updateTroopProjectilesFor(t);
      continue;

    }

    // Harpoon control resolves after troop AI so an active pull can suppress
    // voluntary movement and then apply one deterministic radial XZ step.
    // Stable building order makes same-tick reservation conflicts replay-safe.
    for (const harpoon of harpoons) {
      updateHarpoon(harpoon, aliveTroops);
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
    if (thCheck && thCheck.hp <= 0) {
      simulationEndReason = 'town_hall_destroyed';
      break;
    }

    // A lethal hit may synchronously add temporary combat entities (for
    // example Horror descendants) after aliveTroops was built for this tick.
    // Re-read the authoritative entity list before ending the battle so the
    // simulator cannot stop between evolution generations.
    const anyAlive = troops.some(troop => troop.hp > 0);
    if (
      !anyAlive
      && pendingSpawns.length === 0
      && pendingCannonballs.length === 0
      && pendingMedkits.length === 0
      && pendingFreezeDrops.length === 0
      && pendingRageDrops.length === 0
      && pendingSkeletonBarrels.length === 0
      && airBombProjectiles.length === 0
      && actionIdx >= sortedActions.length
    ) {
      simulationEndReason = 'attackers_eliminated';
      break;
    }

    time += TICK_DT;
    combatTick += 1;
  }

  stopFlamethrowerDefenses(
    simulationEndReason === 'town_hall_destroyed' ? 'battle_end' : simulationEndReason,
  );
  despawnAllSummons(simulationEndReason);

  // ── Evaluate ──
  const th = buildings.find(b => b.id === townHallId);
  const townHallDestroyed = th ? th.hp <= 0 : false;
  const townHallHpPct = th ? Math.max(0, th.hp) / th.maxHp : 0;
  const resolvedResult = (townHallDestroyed || townHallHpPct <= HP_TOLERANCE) ? 'victory' : 'defeat';
  const buildingsDestroyed = buildings.filter(b => b.hp <= 0).length;
  const casualties = {};
  for (const t of troops) {
    if (t.summoned || t.evolutionChild || t.hp > 0) continue;
    const name = TROOP_NAMES[t.type] || t.type;
    casualties[name] = (casualties[name] || 0) + 1;
  }

  // Debug info for diagnosis
  const _debug = {
    _troopsSpawned: nextTroopId,
    _deployedTroopsSpawned: deployedTroopsSpawned,
    _summonsSpawned: summonsSpawned,
    _summonsActivePeak: summonsActivePeak,
    _summonsAlive: troops.filter(t => t.summoned && t.hp > 0).length,
    _windMageWaveHits: windMageWaveHits,
    _windMageSecondaryHits: windMageSecondaryHits,
    _windlingsSpawned: windlingsSpawned,
    _windlingsExpired: windlingsExpired,
    _windlingsAlive: troops.filter(
      troop => troop.summonSource === 'wind_mage' && troop.hp > 0
    ).length,
    _evolutionChildrenSpawned: evolutionChildrenSpawned,
    _evolutionChildrenAlive: troops.filter(t => t.evolutionChild && t.hp > 0).length,
    _shipSlotsConsumed: shipSlotsConsumed,
    _summonShipSlotsConsumed: 0,
    _simulationEndReason: simulationEndReason,
    _troopsAlive: troops.filter(t => t.hp > 0).length,
    _guardsAlive: guards.filter(g => g.hp > 0).length,
    _totalProjectilesFired: projectiles.length,
    _pendingMortarProjectilesLeft: mortarProjectiles.length,
    _pendingAirBombProjectilesLeft: airBombProjectiles.length,
    _pendingSpawnsLeft: pendingSpawns.length,
    _pendingCannonballsLeft: pendingCannonballs.length,
    _cannonShotsAccepted: cannonShotsFired,
    _cannonEventsIgnored: cannonEventsIgnored,
    _rallyDropsUsed: rallyDropsUsed,
    _rallyEventsAccepted: rallyEventsAccepted,
    _rallyEventsIgnored: rallyEventsIgnored,
    _medkitUses: medkitUses,
    _medkitEventsAccepted: medkitEventsAccepted,
    _medkitEventsIgnored: medkitEventsIgnored,
    _medkitHealingApplied: round3(medkitHealingApplied),
    _medkitHealTicks: medkitHealTicks,
    _pendingMedkitsLeft: pendingMedkits.length,
    _activeMedkitsLeft: activeMedkits.length,
    _freezeDropUses: freezeDropUses,
    _freezeDropEventsAccepted: freezeDropEventsAccepted,
    _freezeDropEventsIgnored: freezeDropEventsIgnored,
    _freezeDropDefensesAffected: freezeDropDefensesAffected,
    _freezeDropTrapsAffected: freezeDropTrapsAffected,
    _freezeDropGuardsAffected: 0,
    _rageDropUses: rageDropUses,
    _rageDropEventsAccepted: rageDropEventsAccepted,
    _rageDropEventsIgnored: rageDropEventsIgnored,
    _rageBoostedTroopTicks: rageBoostedTroopTicks,
    _rageBoostedMoveTicks: rageBoostedMoveTicks,
    _rageBoostedAttacks: rageBoostedAttacks,
    _rageBonusDamageApplied: round3(rageBonusDamageApplied),
    _pendingRageDropsLeft: pendingRageDrops.length,
    _activeRageDropsLeft: activeRageDrops.length,
    _skeletonBarrelUses: skeletonBarrelUses,
    _skeletonBarrelEventsAccepted: skeletonBarrelEventsAccepted,
    _skeletonBarrelEventsIgnored: skeletonBarrelEventsIgnored,
    _skeletonBarrelImpacts: skeletonBarrelImpacts,
    _skeletonBarrelImpactDamageApplied: round3(skeletonBarrelImpactDamageApplied),
    _skeletonBarrelSkeletonsSpawned: skeletonBarrelSkeletonsSpawned,
    _skeletonBarrelSkeletonsExpired: skeletonBarrelSkeletonsExpired,
    _skeletonBarrelSkeletonsAlive: troops.filter(
      troop => troop.summonSource === 'skeleton_barrel' && troop.hp > 0
    ).length,
    _skeletonBarrelShipSlotsConsumed: 0,
    _pendingFreezeDropsLeft: pendingFreezeDrops.length,
    _pendingSkeletonBarrelsLeft: pendingSkeletonBarrels.length,
    _sharkTrapsTriggered: sharkTraps.filter(trap => trap.triggered).length,
    _sharkTrapDetails: sharkTraps.map(trap => ({
      buildingId: trap.buildingId,
      level: trap.level,
      damage: trap.damage,
      triggered: trap.triggered,
      troopId: trap.troopId,
    })),
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
    _harpoonDetails: harpoons.map(harpoon => ({
      buildingId: harpoon.buildingId,
      level: harpoon.level,
      state: harpoon.state,
      lastFireTick: harpoon.lastFireTick,
      reloadReadyTick: harpoon.reloadReadyTick,
      trackedTargetId: harpoon.trackedTargetId,
      reservedTargetId: harpoon.reservedTargetId,
      currentYaw: round3(harpoon.currentYaw),
    })),
    _airBombDetails: airBombs.map(airBomb => ({
      buildingId: airBomb.buildingId,
      buildingOrder: airBomb.buildingOrder,
      level: airBomb.level,
      lastFireTick: airBomb.lastFireTick,
      reloadReadyTick: airBomb.reloadReadyTick,
      nextScanTick: airBomb.nextScanTick,
      targetId: airBomb.targetId,
      activeProjectileId: airBomb.activeProjectileId,
      nextAmmoSide: airBomb.nextAmmoSide,
    })),
    _flamethrowerDetails: flamethrowers.map(defense => ({
      buildingId: defense.buildingId,
      buildingOrder: defense.buildingOrder,
      level: defense.level,
      facingStep: defense.facingStep,
      state: defense.state,
      nextScanTick: defense.nextScanTick,
      primeStartTick: defense.primeStartTick,
      primeReadyTick: defense.primeReadyTick,
      streamStartTick: defense.streamStartTick,
      streamEndTick: defense.streamEndTick,
      nextStreamReadyTick: defense.nextStreamReadyTick,
      streamIndex: defense.streamIndex,
      frozenUntilTick: defense.frozenUntilTick,
      permanentlyDisabled: defense.permanentlyDisabled,
    })),
    _combatSnapshotVersion: combatSnapshotVersion,
    _combatRulesVersion: combatRulesVersion,
    _troopEndState: troops.map(t => ({ id: t.id, type: t.type, hp: t.hp, maxHp: t.maxHp, summoned: !!t.summoned, summonSource: t.summonSource ?? null, summonSequence: t.summonSequence ?? null, spawnedAt: t.spawnedAt ?? null, temporary: !!t.temporary, expiresAt: t.expiresAt ?? null, evolutionChild: !!t.evolutionChild, evolutionStage: t.evolutionStage ?? 0, evolutionLineage: t.evolutionLineage ?? 0, summonOwnerId: t.summonOwnerId ?? null, x: Math.round(t.x*100)/100, z: Math.round(t.z*100)/100, state: t._state, target: traceEntityPayload(t._currentTarget, t._currentTargetIsGuard ? 'guard' : 'building') })),
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
  const hasDeployment = sortedActions.some(a => a.type === 'place_ship' || a.type === 'deploy_troop');
  if (!hasDeployment) {
    return { valid: false, reason: 'No troops deployed in defeat', resolvedResult, ..._debug };
  }
  if (resolvedResult === 'victory') {
    return { valid: true, reason: 'Server victory: Town Hall destroyed (client claimed defeat)', resolvedResult, townHallDestroyed: true, buildingsDestroyed, townHallHpPct, ..._debug };
  }
  return { valid: true, reason: 'Defeat accepted', resolvedResult, townHallDestroyed: false, buildingsDestroyed, townHallHpPct, ..._debug };
}

module.exports = { verifyReplay };
