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
  TROOP_STATS, DEFENSE_STATS, SKELETON_GUARD,
  MAX_SHIPS, TROOPS_PER_SHIP, TIME_LIMIT_SEC, SAIL_DELAY_SEC,
  CANNON_DAMAGE, CANNON_INITIAL_ENERGY, CANNON_ENERGY_PER_DESTROY,
  cannonShotCost, VALID_TROOP_TYPES,
} = require('./combat_defs');
const { BUILDING_DEFS } = require('./db');

// ---------- Config ----------

const TICK_DT = 1 / 60;            // 60 Hz — matches client framerate
const HP_TOLERANCE = 0.05;         // Max 5% TH HP deviation allowed
const PROJ_HIT_DIST_SQ = 0.0025;   // 0.05² — client HIT_DIST_SQ
const TURRET_HIT_DIST_SQ = 0.0009; // 0.03² — turret tighter hitbox
const GUARD_THREAT_MULT = 1.5;     // Troops switch to guards within range * 1.5
const TROOP_SPAWN_DELAY = 0.2;     // Seconds between each troop from same ship
const RETARGET_INTERVAL = 10;      // Frames between target re-evaluation (matches client)
const DEFENSE_SEARCH_SEC = 0.15;   // Target search interval for defenses (matches client)
const SEPARATION_RADIUS = 0.18;    // Troop push-apart radius (matches client)
const SEPARATION_FORCE = 0.5;      // Troop push-apart strength
const RALLY_MAX_FLIGHT_SEC = 8.0;  // Sanity cap for client-recorded grenade flight time
const TROOP_NAMES = {
  knight: 'Knight',
  mage: 'Mage',
  barbarian: 'Barbarian',
  archer: 'Archer',
  ranger: 'Ranger',
};

// ---------- Helpers ----------

function distSq2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function dist2d(ax, az, bx, bz) {
  return Math.sqrt(distSq2d(ax, az, bx, bz));
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

// Find nearest alive target from a list. Returns {target, distSq} or null.
function findNearestAlive(x, z, targets) {
  let best = null;
  let bestDistSq = Infinity;
  for (const t of targets) {
    if (t.hp <= 0) continue;
    const dsq = distSq2d(x, z, t.x, t.z);
    if (dsq < bestDistSq) { bestDistSq = dsq; best = t; }
  }
  return best ? { target: best, distSq: bestDistSq } : null;
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    x: gc.grid_center_x + localX * cosR - localZ * sinR,
    z: gc.grid_center_z + localX * sinR + localZ * cosR,
  };
}

// ---------- Replay Verifier ----------

function verifyReplay({ defenderBuildings, actions, claimedResult, gridConfig, serverTroopLevels }) {
  if (!gridConfig || !gridConfig.cell_size || gridConfig.cell_size <= 0) {
    return { valid: false, reason: 'Missing or invalid grid_config' };
  }
  if (!actions || !Array.isArray(actions)) {
    return { valid: false, reason: 'No actions' };
  }

  // Init buildings with world coordinates
  const buildings = defenderBuildings.map(b => {
    const def = BUILDING_DEFS[b.type];
    const size = def?.size || [2, 2];
    const pos = gridToWorld(b.grid_x, b.grid_z, size[0], size[1], gridConfig);
    return {
      id: b.id, type: b.type, level: b.level,
      hp: b.hp, maxHp: b.max_hp,
      x: pos.x, z: pos.z,
    };
  });

  const troops = [];
  const guards = [];
  const defenses = [];
  const projectiles = [];
  let townHallId = null;
  let nextTroopId = 0;
  let shipsPlaced = 0;
  const pendingSpawns = [];

  let cannonEnergy = CANNON_INITIAL_ENERGY;
  let cannonShotsFired = 0;
  let rallyDropsUsed = 0;
  let rallyFocus = null;
  let rallyEventsAccepted = 0;
  let rallyEventsIgnored = 0;
  const pendingRallies = [];

  // Init defenses & guards from buildings
  for (const b of buildings) {
    if (b.type === 'town_hall') townHallId = b.id;

    if (b.type === 'turret') {
      const s = DEFENSE_STATS.turret[b.level] || DEFENSE_STATS.turret[1];
      defenses.push({
        buildingId: b.id, type: 'turret',
        damage: s.damage, fireRate: s.fireRate, detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
        _searchTimer: 0,  // throttle target search to DEFENSE_SEARCH_SEC
      });
    }
    if (b.type === 'archer_tower' || b.type === 'archertower' || b.type === 'archtower') {
      const s = DEFENSE_STATS.archer_tower[b.level] || DEFENSE_STATS.archer_tower[1];
      defenses.push({
        buildingId: b.id, type: 'archer_tower',
        damage: s.damage, fireRate: s.fireRate, detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
        _searchTimer: 0,
      });
    }
    if (b.type === 'tombstone') {
      const guardCount = b.level || 1;
      for (let i = 0; i < guardCount; i++) {
        const angle = (Math.PI * 2 * i) / guardCount;
        guards.push({
          id: `g${nextTroopId++}`,
          hp: SKELETON_GUARD.hp, damage: SKELETON_GUARD.damage,
          atkSpeed: SKELETON_GUARD.atkSpeed, moveSpeed: SKELETON_GUARD.moveSpeed,
          detectionRadius: SKELETON_GUARD.detectionRadius,
          attackRange: SKELETON_GUARD.attackRange,
          hitDelay: SKELETON_GUARD.hitDelay,
          x: b.x + Math.cos(angle) * 0.15,
          z: b.z + Math.sin(angle) * 0.15,
          tombX: b.x, tombZ: b.z,
          targetId: null, atkTimer: 0, hitPending: false, hitTimer: 0,
        });
      }
    }
  }

  const sortedActions = [...actions].sort((a, b) => a.t - b.t);
  let actionIdx = 0;
  let time = 0;

  while (time < TIME_LIMIT_SEC) {
    // ── Process player actions ──
    while (actionIdx < sortedActions.length && sortedActions[actionIdx].t <= time) {
      const act = sortedActions[actionIdx++];

      if (act.type === 'place_ship' && shipsPlaced < MAX_SHIPS) {
        // Support both old (troopType) and new (troops[]) format
        const shipTroops = (act.troops || (act.troopType ? [act.troopType] : [])).slice(0, TROOPS_PER_SHIP);
        for (let ti = 0; ti < shipTroops.length; ti++) {
          const rawName = shipTroops[ti];
          const troopType = rawName.toLowerCase();
          if (!VALID_TROOP_TYPES.includes(troopType)) continue;
          const level = (serverTroopLevels && (serverTroopLevels[rawName] || serverTroopLevels[troopType])) || act.troopLevel || 1;
          pendingSpawns.push({
            time: act.t + SAIL_DELAY_SEC + ti * TROOP_SPAWN_DELAY,
            troopType, troopLevel: level,
            x: act.x, z: act.z,
          });
        }
        shipsPlaced++;
      }

      if (act.type === 'cannon_fire') {
        cannonShotsFired++;
        cannonEnergy -= cannonShotCost(cannonShotsFired);
        const target = buildings.find(b => b.id === act.buildingId && b.hp > 0);
        if (target) {
          target.hp -= CANNON_DAMAGE;
          if (target.hp <= 0) cannonEnergy += CANNON_ENERGY_PER_DESTROY;
        }
      }

      if (act.type === 'rally_drop') {
        const x = finiteNumber(act.x, NaN);
        const z = finiteNumber(act.z, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
          rallyEventsIgnored++;
          continue;
        }

        const cost = rallyDropsUsed + 1;
        if (cannonEnergy < cost) {
          // Client cannot launch without shared cannon energy. Ignore forged
          // or desynced rally events so they do not help the server sim.
          rallyEventsIgnored++;
          continue;
        }

        const flightTime = clamp(finiteNumber(act.flight_time, 0), 0, RALLY_MAX_FLIGHT_SEC);
        cannonEnergy -= cost;
        rallyDropsUsed++;
        rallyEventsAccepted++;
        pendingRallies.push({
          time: finiteNumber(act.t, time) + flightTime,
          x, z,
        });
      }
    }

    // ── Deploy pending troops ──
    for (let i = pendingSpawns.length - 1; i >= 0; i--) {
      if (pendingSpawns[i].time <= time) {
        const sp = pendingSpawns.splice(i, 1)[0];
        const stats = TROOP_STATS[sp.troopType]?.[sp.troopLevel] || TROOP_STATS[sp.troopType]?.[1];
        if (!stats) continue;
        // One troop per spawn entry
        troops.push({
          id: nextTroopId++,
          type: sp.troopType,
          hp: stats.hp, damage: stats.damage,
          atkSpeed: stats.atkSpeed, moveSpeed: stats.moveSpeed, range: stats.range,
          melee: stats.melee, projSpeed: stats.projSpeed || 0,
          hitDelay: stats.hitDelay || 0, shootDelay: stats.shootDelay || 0,
          x: sp.x, z: sp.z,
          atkTimer: 0, hitPending: false, hitTimer: 0,
          _pendingTarget: null,
          _retargetCounter: 0,       // throttle target search
          _currentTarget: null,      // sticky target ref
          _currentTargetIsGuard: false,
        });
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
        }
      }
    }

    if (rallyFocus && !isRallyFocusValid(rallyFocus)) {
      rallyFocus = null;
    }

    // ── Troop separation (push apart overlapping troops) ──
    for (let i = 0; i < aliveTroops.length; i++) {
      for (let j = i + 1; j < aliveTroops.length; j++) {
        const a = aliveTroops[i], b = aliveTroops[j];
        const dx = a.x - b.x, dz = a.z - b.z;
        const dsq = dx * dx + dz * dz;
        if (dsq < SEPARATION_RADIUS * SEPARATION_RADIUS && dsq > 0.0001) {
          const d = Math.sqrt(dsq);
          const push = (SEPARATION_RADIUS - d) * SEPARATION_FORCE * TICK_DT;
          const nx = dx / d, nz = dz / d;
          a.x += nx * push; a.z += nz * push;
          b.x -= nx * push; b.z -= nz * push;
        }
      }
    }

    // ── Troop AI ──
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

      // Validate current target still alive
      if (target && target.hp <= 0) { target = null; t._currentTarget = null; }

      t._retargetCounter++;
      const shouldRetarget = !target || t._retargetCounter >= RETARGET_INTERVAL;

      if (shouldRetarget) {
        t._retargetCounter = 0;
        const nearB = findNearestAlive(t.x, t.z, aliveBuildings);
        const nearG = findNearestAlive(t.x, t.z, aliveGuards);
        let bestTarget = null;
        let bestDistSq = Infinity;
        targetIsGuard = false;

        if (nearB) { bestTarget = nearB.target; bestDistSq = nearB.distSq; }
        if (nearG && nearG.distSq < bestDistSq) {
          bestTarget = nearG.target; bestDistSq = nearG.distSq; targetIsGuard = true;
        }
        target = bestTarget;
        t._currentTarget = target;
        t._currentTargetIsGuard = targetIsGuard;
      }

      // Guard threat check — runs every frame (not throttled, matches client _check_guard_threat)
      if (target && !targetIsGuard) {
        const nearG = findNearestAlive(t.x, t.z, aliveGuards);
        if (nearG) {
          const threatRadiusSq = (t.range * GUARD_THREAT_MULT) ** 2;
          if (nearG.distSq < threatRadiusSq) {
            target = nearG.target;
            targetIsGuard = true;
            t._currentTarget = target;
            t._currentTargetIsGuard = true;
          }
        }
      }

      }

      if (!target) continue;

      const targetDistSq = distSq2d(t.x, t.z, target.x, target.z);
      const targetDist = Math.sqrt(targetDistSq);

      if (targetDist <= t.range) {
        // ── In range — attack ──
        t.atkTimer += TICK_DT;

        if (t.melee) {
          // Melee: damage dealt when attack timer completes full cycle
          // (matches client base_troop.gd _do_attack — no hitDelay phase)
          if (t.atkTimer >= t.atkSpeed) {
            t.atkTimer -= t.atkSpeed;
            const wasAlive = target.hp > 0;
            target.hp -= t.damage;
            if (wasAlive && target.hp <= 0 && target.type) cannonEnergy += CANNON_ENERGY_PER_DESTROY;
          }
        } else {
          // Ranged: spawn homing projectile
          const shootAt = t.shootDelay > 0 ? t.atkSpeed * t.shootDelay : 0;

          if (t.atkTimer >= t.atkSpeed) {
            t.atkTimer -= t.atkSpeed;
            if (shootAt <= 0) {
              // Mage/Archer: fire immediately
              projectiles.push({
                x: t.x, z: t.z,
                targetRef: target, speed: t.projSpeed, damage: t.damage,
                isBuilding: !!target.type, hitDistSq: PROJ_HIT_DIST_SQ,
              });
            } else {
              // Ranger: delayed shot
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
              projectiles.push({
                x: t.x, z: t.z,
                targetRef: pt, speed: t.projSpeed, damage: t.damage,
                isBuilding: !!pt.type, hitDistSq: PROJ_HIT_DIST_SQ,
              });
            }
          }
        }
      } else {
        // ── Move toward target ──
        moveToward(t, target.x, target.z, t.moveSpeed, TICK_DT);
      }
    }

    // ── Defense AI (turrets + archer towers) ──
    for (const d of defenses) {
      const bld = buildings.find(b => b.id === d.buildingId);
      if (!bld || bld.hp <= 0) continue;

      const detectSq = d.detectRange * d.detectRange;

      // Throttle target search to DEFENSE_SEARCH_SEC (matches client TARGET_SEARCH_INTERVAL)
      d._searchTimer += TICK_DT;
      let currentTarget = null;

      if (d.targetId != null) {
        currentTarget = aliveTroops.find(t => t.id === d.targetId);
        if (currentTarget && distSq2d(d.x, d.z, currentTarget.x, currentTarget.z) > detectSq) {
          currentTarget = null;
        }
      }

      if (!currentTarget && d._searchTimer >= DEFENSE_SEARCH_SEC) {
        d._searchTimer = 0;
        const near = findNearestAlive(d.x, d.z, aliveTroops);
        if (near && near.distSq <= detectSq) currentTarget = near.target;
      }

      if (!currentTarget) {
        if (d.isAttacking) { d.isAttacking = false; d.timer = 0; d.targetId = null; }
        continue;
      }

      d.targetId = currentTarget.id;

      if (!d.isAttacking) {
        d.isAttacking = true;
        // Turret: first shot instant (timer = fireRate). Archer Tower: full delay (timer = 0)
        d.timer = d.type === 'turret' ? d.fireRate : 0;
      }

      d.timer += TICK_DT;
      if (d.timer >= d.fireRate) {
        d.timer -= d.fireRate;
        projectiles.push({
          x: d.x, z: d.z,
          targetRef: currentTarget, speed: d.projSpeed, damage: d.damage,
          isBuilding: false,
          hitDistSq: d.type === 'turret' ? TURRET_HIT_DIST_SQ : PROJ_HIT_DIST_SQ,
        });
      }
    }

    // ── Guard AI ──
    for (const g of aliveGuards) {
      // Find target — detection relative to tombstone
      if (g.targetId == null) {
        let best = null;
        let bestDist = g.detectionRadius;
        for (const t of aliveTroops) {
          const d = dist2d(t.x, t.z, g.tombX, g.tombZ);
          if (d < bestDist) { bestDist = d; best = t; }
        }
        if (best) g.targetId = best.id;
      }

      if (g.targetId == null) continue;

      const target = aliveTroops.find(t => t.id === g.targetId);
      if (!target) { g.targetId = null; continue; }

      // Abandon chase if troop too far from tombstone
      if (dist2d(target.x, target.z, g.tombX, g.tombZ) > g.detectionRadius * 2.0) {
        g.targetId = null;
        continue;
      }

      const gDist = dist2d(g.x, g.z, target.x, target.z);

      if (gDist <= g.attackRange) {
        g.atkTimer += TICK_DT;
        if (g.atkTimer >= g.atkSpeed) {
          g.atkTimer -= g.atkSpeed;
          g.hitPending = true;
          g.hitTimer = 0;
        }
        if (g.hitPending) {
          g.hitTimer += TICK_DT;
          if (g.hitTimer >= g.atkSpeed * g.hitDelay) {
            g.hitPending = false;
            target.hp -= g.damage;
          }
        }
      } else {
        moveToward(g, target.x, target.z, g.moveSpeed, TICK_DT);
      }
    }

    // ── Projectiles — home toward target each tick ──
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const tgt = p.targetRef;

      // Target dead — despawn projectile (matches client: no hit if target freed)
      if (!tgt || tgt.hp <= 0) {
        projectiles.splice(i, 1);
        continue;
      }

      // Home toward current target position (not fixed spawn position)
      const tx = tgt.x;
      const tz = tgt.z;
      const dx = tx - p.x;
      const dz = tz - p.z;
      const dsq = dx * dx + dz * dz;

      if (dsq <= p.hitDistSq) {
        // Hit
        tgt.hp -= p.damage;
        if (tgt.hp <= 0 && p.isBuilding) cannonEnergy += CANNON_ENERGY_PER_DESTROY;
        projectiles.splice(i, 1);
        continue;
      }

      // Move
      const d = Math.sqrt(dsq);
      const step = Math.min(p.speed * TICK_DT, d);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
    }

    // ── End conditions ──
    const thCheck = buildings.find(b => b.id === townHallId);
    if (thCheck && thCheck.hp <= 0) break;

    const anyAlive = aliveTroops.length > 0;
    if (!anyAlive && pendingSpawns.length === 0 && actionIdx >= sortedActions.length) break;

    time += TICK_DT;
  }

  // ── Evaluate ──
  const th = buildings.find(b => b.id === townHallId);
  const townHallDestroyed = th ? th.hp <= 0 : false;
  const townHallHpPct = th ? Math.max(0, th.hp) / th.maxHp : 0;
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
    casualties,
    _buildingHPs: buildings.map(b => ({ type: b.type, id: b.id, hp: b.hp, maxHp: b.maxHp })),
    _troopEndState: troops.map(t => ({ type: t.type, hp: t.hp, x: Math.round(t.x*100)/100, z: Math.round(t.z*100)/100 })),
  };
  console.log('[SIM] Troops spawned:', nextTroopId, '| Alive:', troops.filter(t=>t.hp>0).length, '| Guards alive:', guards.filter(g=>g.hp>0).length);
  console.log('[SIM] Building HPs:', buildings.map(b => `${b.type}:${b.hp}/${b.maxHp}`).join(', '));
  console.log('[SIM] Sim time:', Math.round(time*10)/10, 's | TH HP:', th ? `${th.hp}/${th.maxHp}` : 'N/A');

  if (claimedResult === 'victory') {
    if (townHallDestroyed || townHallHpPct <= HP_TOLERANCE) {
      return { valid: true, reason: 'Victory verified', townHallDestroyed: true, buildingsDestroyed, townHallHpPct, ..._debug };
    }
    return {
      valid: false,
      reason: `TH at ${Math.round(townHallHpPct * 100)}% HP in sim (need ≤${Math.round(HP_TOLERANCE * 100)}%)`,
      townHallDestroyed: false, buildingsDestroyed, townHallHpPct, ..._debug,
    };
  }

  // Defeat — require at least one ship placed
  const hasShips = sortedActions.some(a => a.type === 'place_ship');
  if (!hasShips) {
    return { valid: false, reason: 'No ships deployed in defeat' };
  }
  return { valid: true, reason: 'Defeat accepted', townHallDestroyed: false, buildingsDestroyed, townHallHpPct };
}

module.exports = { verifyReplay };
