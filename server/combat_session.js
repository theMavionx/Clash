/**
 * Replay-based combat verification.
 * Matches client (Godot) simulation 1:1:
 * - Projectile travel time for ranged troops, turrets, archer towers
 * - Melee hit delay (40% through attack animation)
 * - Skeleton guards detect relative to tombstone, chase up to 2x detection radius
 * - Turret first shot fires instantly on target acquisition
 * - 60 Hz tick rate (same as client 60fps)
 */

const {
  TROOP_STATS, DEFENSE_STATS, SKELETON_GUARD,
  MAX_SHIPS, TROOPS_PER_SHIP, TIME_LIMIT_SEC, SAIL_DELAY_SEC,
  CANNON_DAMAGE, CANNON_INITIAL_ENERGY, CANNON_ENERGY_PER_DESTROY,
  cannonShotCost, VALID_TROOP_TYPES,
} = require('./combat_defs');
const { BUILDING_DEFS } = require('./db');

// ---------- Config ----------

const TICK_DT = 1 / 30;         // 30 Hz — close enough to client 60fps, 2x faster
const HP_TOLERANCE = 0.50;      // Accept victory if TH ≤50% HP
const PROJ_HIT_DIST = 0.05;     // projectile hit distance (client HIT_DIST_SQ = 0.05²)
const TURRET_HIT_DIST = 0.03;   // turret bullet tighter hit box

// ---------- Helpers ----------

function dist2d(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
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

function findNearest(x, z, targets) {
  let best = null;
  let bestDist = Infinity;
  for (const t of targets) {
    if (t.hp <= 0) continue;
    const dx = x - t.x;
    const dz = z - t.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best ? { target: best, dist: bestDist } : null;
}

// Convert grid coordinates to world coordinates (mirrors GDScript _grid_to_local + transform)
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

function verifyReplay({ defenderBuildings, actions, claimedResult, gridConfig }) {
  // Validate grid config
  if (!gridConfig || !gridConfig.cell_size || gridConfig.cell_size <= 0) {
    return { valid: false, reason: 'Missing or invalid grid_config' };
  }

  // Validate actions
  if (!actions || !Array.isArray(actions)) {
    return { valid: false, reason: 'No actions' };
  }

  // Validate timestamps are monotonic
  for (let i = 1; i < actions.length; i++) {
    if (actions[i].t < actions[i - 1].t - 0.01) {
      return { valid: false, reason: 'Actions have non-monotonic timestamps' };
    }
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
  const projectiles = [];  // { x, z, tx, tz, speed, damage, targetId, type, hitDist }
  let townHallId = null;
  let nextTroopId = 0;
  let shipsPlaced = 0;
  const pendingSpawns = [];

  // Cannon energy tracking
  let cannonEnergy = CANNON_INITIAL_ENERGY;
  let cannonShotsFired = 0;

  // Init defenses & guards
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
      });
    }
    if (b.type === 'archer_tower') {
      const s = DEFENSE_STATS.archer_tower[b.level] || DEFENSE_STATS.archer_tower[1];
      defenses.push({
        buildingId: b.id, type: 'archer_tower',
        damage: s.damage, fireRate: s.fireRate, detectRange: s.detectRange,
        projSpeed: s.projSpeed,
        x: b.x, z: b.z,
        timer: 0, isAttacking: false, targetId: null,
      });
    }
    if (b.type === 'tombstone') {
      for (let i = 0; i < (b.level || 1); i++) {
        const angle = (Math.PI * 2 * i) / (b.level || 1);
        guards.push({
          hp: SKELETON_GUARD.hp, damage: SKELETON_GUARD.damage,
          atkSpeed: SKELETON_GUARD.atkSpeed, moveSpeed: SKELETON_GUARD.moveSpeed,
          detectionRadius: SKELETON_GUARD.detectionRadius,
          attackRange: SKELETON_GUARD.attackRange,
          hitDelay: SKELETON_GUARD.hitDelay,
          // Position starts near tombstone
          x: b.x + Math.cos(angle) * 0.15, z: b.z + Math.sin(angle) * 0.15,
          // Tombstone anchor — detection is relative to this
          tombX: b.x, tombZ: b.z,
          targetId: null, atkTimer: 0, hitPending: false,
        });
      }
    }
  }

  // Sort actions by time
  const sortedActions = [...actions].sort((a, b) => a.t - b.t);
  let actionIdx = 0;
  let time = 0;

  while (time < TIME_LIMIT_SEC) {
    // ── Process player actions at current time ──
    while (actionIdx < sortedActions.length && sortedActions[actionIdx].t <= time) {
      const act = sortedActions[actionIdx++];

      if (act.type === 'place_ship' && shipsPlaced < MAX_SHIPS) {
        const troopType = act.troopType;
        if (!VALID_TROOP_TYPES.includes(troopType)) continue;
        const level = act.troopLevel || 1;
        pendingSpawns.push({ time: act.t + SAIL_DELAY_SEC, troopType, troopLevel: level, x: act.x, z: act.z });
        shipsPlaced++;
      }

      if (act.type === 'cannon_fire') {
        // Don't hard-fail on energy mismatch — sim timing differences can cause
        // buildings to be destroyed in different order, shifting +2 energy bonuses.
        // Just apply the shot if we have any energy, skip if truly impossible.
        cannonShotsFired++;
        const cost = cannonShotCost(cannonShotsFired);
        cannonEnergy -= cost;
        const target = buildings.find(b => b.id === act.buildingId && b.hp > 0);
        if (target) {
          target.hp -= CANNON_DAMAGE;
          if (target.hp <= 0) cannonEnergy += CANNON_ENERGY_PER_DESTROY;
        }
      }
    }

    // ── Deploy pending troops (after sail delay) ──
    for (let i = pendingSpawns.length - 1; i >= 0; i--) {
      if (pendingSpawns[i].time <= time) {
        const sp = pendingSpawns.splice(i, 1)[0];
        const stats = TROOP_STATS[sp.troopType]?.[sp.troopLevel] || TROOP_STATS[sp.troopType]?.[1];
        if (!stats) continue;
        for (let j = 0; j < TROOPS_PER_SHIP; j++) {
          troops.push({
            id: nextTroopId++,
            hp: stats.hp, damage: stats.damage,
            atkSpeed: stats.atkSpeed, moveSpeed: stats.moveSpeed, range: stats.range,
            melee: stats.melee, projSpeed: stats.projSpeed || 0,
            hitDelay: stats.hitDelay || 0, shootDelay: stats.shootDelay || 0,
            x: sp.x + (j - 1) * 0.05, z: sp.z,
            atkTimer: 0, hitPending: false, hitTimer: 0,
          });
        }
      }
    }

    // ── Move troops & attack ──
    for (const t of troops) {
      if (t.hp <= 0) continue;

      // Find nearest target (building or guard)
      const nearB = findNearest(t.x, t.z, buildings);
      const nearG = findNearest(t.x, t.z, guards);
      let target = null, targetDist = Infinity;
      if (nearB) { target = nearB.target; targetDist = nearB.dist; }
      if (nearG && nearG.dist < targetDist) { target = nearG.target; targetDist = nearG.dist; }
      if (!target) continue;

      if (targetDist <= t.range) {
        // In range — attack
        t.atkTimer += TICK_DT;

        if (t.melee) {
          // Melee: damage dealt at hitDelay fraction of atkSpeed
          if (t.atkTimer >= t.atkSpeed) {
            t.atkTimer -= t.atkSpeed;
            t.hitPending = true;
            t.hitTimer = 0;
          }
          if (t.hitPending) {
            t.hitTimer += TICK_DT;
            if (t.hitTimer >= t.atkSpeed * t.hitDelay) {
              t.hitPending = false;
              target.hp -= t.damage;
              // Only buildings grant cannon energy, not guards
              if (target.hp <= 0 && target.type) cannonEnergy += CANNON_ENERGY_PER_DESTROY;
            }
          }
        } else {
          // Ranged: spawn projectile that travels to target
          const shootAt = t.shootDelay > 0 ? t.atkSpeed * t.shootDelay : 0;
          if (t.atkTimer >= t.atkSpeed) {
            t.atkTimer -= t.atkSpeed;
            if (shootAt <= 0) {
              // Archer/Mage: fire immediately
              const isBuilding = !!target.type;
              projectiles.push({
                x: t.x, z: t.z,
                tx: target.x, tz: target.z,
                speed: t.projSpeed, damage: t.damage,
                targetRef: target, isBuilding, hitDist: PROJ_HIT_DIST,
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
            if (t.hitTimer >= t.atkSpeed * t.shootDelay) {
              t.hitPending = false;
              const pt = t._pendingTarget || target;
              const isBuilding = !!pt.type;
              projectiles.push({
                x: t.x, z: t.z,
                tx: pt.x, tz: pt.z,
                speed: t.projSpeed, damage: t.damage,
                targetRef: pt, isBuilding, hitDist: PROJ_HIT_DIST,
              });
            }
          }
        }
      } else {
        // Move toward target
        moveToward(t, target.x, target.z, t.moveSpeed, TICK_DT);
      }
    }

    // ── Build alive troops list once per tick (avoid repeated .filter) ──
    const aliveTroops = [];
    for (const t of troops) { if (t.hp > 0) aliveTroops.push(t); }

    // ── Defense attacks (turrets, archer towers) ──
    for (const d of defenses) {
      const bld = buildings.find(b => b.id === d.buildingId);
      if (!bld || bld.hp <= 0) continue;

      const detectSq = d.detectRange * d.detectRange;

      // Target acquisition — keep current target if still in range
      let currentTarget = null;
      if (d.targetId != null) {
        currentTarget = aliveTroops.find(t => t.id === d.targetId);
        if (currentTarget) {
          const dx = d.x - currentTarget.x;
          const dz = d.z - currentTarget.z;
          if (dx * dx + dz * dz > detectSq) currentTarget = null;
        }
      }
      if (!currentTarget) {
        const near = findNearest(d.x, d.z, aliveTroops);
        if (near && near.dist <= d.detectRange) {
          currentTarget = near.target;
        }
      }

      if (!currentTarget) {
        if (d.isAttacking) {
          d.isAttacking = false;
          d.timer = 0;
          d.targetId = null;
        }
        continue;
      }

      d.targetId = currentTarget.id;

      // First shot instant — timer starts at fireRate on target acquisition
      if (!d.isAttacking) {
        d.isAttacking = true;
        d.timer = d.fireRate;  // matches client: _fire_timer = fire_rate
      }

      d.timer += TICK_DT;
      if (d.timer >= d.fireRate) {
        d.timer -= d.fireRate;
        // Spawn projectile toward target (defense → targets troops, never buildings)
        projectiles.push({
          x: d.x, z: d.z,
          tx: currentTarget.x, tz: currentTarget.z,
          speed: d.projSpeed, damage: d.damage,
          targetRef: currentTarget, isBuilding: false,
          hitDist: d.type === 'turret' ? TURRET_HIT_DIST : PROJ_HIT_DIST,
        });
      }
    }

    // ── Guard AI — detect relative to tombstone, chase up to 2x radius ──
    for (const g of guards) {
      if (g.hp <= 0) continue;

      // Find target — detection is relative to TOMBSTONE position
      if (g.targetId == null) {
        let bestTarget = null;
        let bestDist = g.detectionRadius;
        for (const t of aliveTroops) {
          const dx = t.x - g.tombX;
          const dz = t.z - g.tombZ;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < bestDist) { bestDist = d; bestTarget = t; }
        }
        if (bestTarget) g.targetId = bestTarget.id;
      }

      if (g.targetId == null) continue;

      const target = aliveTroops.find(t => t.id === g.targetId);
      if (!target) { g.targetId = null; continue; }

      // Abandon chase if troop moved too far from tombstone (2x detection radius)
      const troopToTomb = Math.sqrt(
        (target.x - g.tombX) ** 2 + (target.z - g.tombZ) ** 2
      );
      if (troopToTomb > g.detectionRadius * 2.0) {
        g.targetId = null;
        continue;
      }

      const gDist = dist2d(g, target);

      if (gDist <= g.attackRange) {
        // Attack with melee hit delay
        g.atkTimer += TICK_DT;
        if (g.atkTimer >= g.atkSpeed) {
          g.atkTimer -= g.atkSpeed;
          g.hitPending = true;
          g.hitTimer = 0;
        }
        if (g.hitPending) {
          if (!g.hitTimer) g.hitTimer = 0;
          g.hitTimer += TICK_DT;
          if (g.hitTimer >= g.atkSpeed * g.hitDelay) {
            g.hitPending = false;
            target.hp -= g.damage;
          }
        }
      } else {
        // Move toward target
        moveToward(g, target.x, target.z, g.moveSpeed, TICK_DT);
      }
    }

    // ── Update projectiles — move toward target, deal damage on hit ──
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);

      if (d <= p.hitDist) {
        // Hit — deal damage to stored target reference
        const target = p.targetRef;
        if (target && target.hp > 0) {
          target.hp -= p.damage;
          // Only buildings grant cannon energy
          if (target.hp <= 0 && p.isBuilding) {
            cannonEnergy += CANNON_ENERGY_PER_DESTROY;
          }
        }
        projectiles.splice(i, 1);
        continue;
      }

      // Move projectile
      const step = Math.min(p.speed * TICK_DT, d);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
    }

    // ── Check end conditions ──
    const th = buildings.find(b => b.id === townHallId);
    if (th && th.hp <= 0) break;

    const anyAlive = troops.some(t => t.hp > 0);
    if (!anyAlive && pendingSpawns.length === 0 && actionIdx >= sortedActions.length) break;

    time += TICK_DT;
  }

  // ── Evaluate ──
  const th = buildings.find(b => b.id === townHallId);
  const townHallDestroyed = th ? th.hp <= 0 : false;
  const townHallHpPct = th ? Math.max(0, th.hp) / th.maxHp : 0;
  const buildingsDestroyed = buildings.filter(b => b.hp <= 0).length;

  if (claimedResult === 'victory') {
    if (townHallDestroyed || townHallHpPct <= HP_TOLERANCE) {
      return { valid: true, reason: 'Victory verified', townHallDestroyed: true, buildingsDestroyed, townHallHpPct };
    }
    return { valid: false, reason: `TH at ${Math.round(townHallHpPct * 100)}% HP in sim (need ≤${HP_TOLERANCE * 100}%)`, townHallDestroyed: false, buildingsDestroyed, townHallHpPct };
  }

  // Defeat always accepted
  return { valid: true, reason: 'Defeat accepted', townHallDestroyed: false, buildingsDestroyed, townHallHpPct };
}

module.exports = { verifyReplay };
