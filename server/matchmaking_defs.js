const GRID_SIZE = 27;
const BOT_BASE_GENERATION = 'raid-recovery-v1';
const BOT_VARIANTS_PER_BUCKET = 8;

const MATCHMAKING_CONFIG = {
  targetSuccessRate: 0.57,
  targetBand: { min: 0.55, max: 0.60 },
  recentRaidWindow: 20,
  minRecoveryRaids: 3,
  recoveryLossStreakSoft: 2,
  recoveryLossStreakBot: 3,
  recoveryLossStreakStrong: 4,
  easyRatio: { min: 0.42, target: 0.62, max: 0.82 },
  normalRatio: { min: 0.72, target: 0.90, max: 1.08 },
  hardRatio: { min: 0.98, target: 1.14, max: 1.32 },
  strongPlayerSuccessRate: 0.70,
  strugglingSuccessRate: 0.45,
  candidatePoolSize: 30,
  minLiveCandidatesBeforeBots: 20,
  botLootMultiplier: {
    easy: 0.78,
    normal: 0.88,
    hard: 0.96,
    recovery_soft: 0.76,
    recovery_strong: 0.70,
  },
  botTrophyMultiplier: {
    easy: 0.75,
    normal: 0.85,
    hard: 0.95,
    recovery_soft: 0.70,
    recovery_strong: 0.60,
  },
};

const BOT_RESOURCES_BY_TH = {
  1: { gold: 2400, wood: 2400, ore: 2400 },
  2: { gold: 5400, wood: 6200, ore: 5600 },
  3: { gold: 12000, wood: 14500, ore: 13000 },
  4: { gold: 23000, wood: 28000, ore: 25000 },
  5: { gold: 42000, wood: 50000, ore: 45000 },
};

const BOT_BUILDING_SIZES = {
  town_hall: [4, 4],
  mine: [3, 3],
  barn: [4, 3],
  port: [4, 3],
  sawmill: [3, 3],
  turret: [2, 2],
  tombstone: [3, 3],
  storage: [4, 5],
  archer_tower: [3, 3],
  mage_tower: [3, 3],
  mortar: [2, 2],
};

const BOT_GRID_SPECS = {
  0: [27, 27],
  1: [27, 3],
  2: [27, 5],
};

const BASE_LAYOUTS = {
  1: {
    easy: [
      b('town_hall', 1, 11, 11),
      b('mine', 1, 6, 7),
      b('sawmill', 1, 18, 7),
      b('barn', 1, 7, 18),
      b('port', 1, 11, 0, 1, { has_ship: 1 }),
    ],
    normal: [
      b('town_hall', 1, 11, 11),
      b('archer_tower', 1, 12, 6),
      b('mine', 1, 6, 8),
      b('sawmill', 1, 18, 8),
      b('barn', 1, 7, 18),
      b('port', 1, 11, 0, 1, { has_ship: 1 }),
    ],
    hard: [
      b('town_hall', 1, 11, 11),
      b('archer_tower', 1, 12, 6),
      b('mine', 1, 6, 7),
      b('sawmill', 1, 18, 7),
      b('barn', 1, 6, 18),
      b('port', 1, 11, 0, 1, { has_ship: 1 }),
    ],
  },
  2: {
    easy: [
      b('town_hall', 2, 11, 11),
      b('archer_tower', 1, 7, 9),
      b('mine', 1, 4, 5),
      b('mine', 1, 19, 5),
      b('sawmill', 1, 4, 19),
      b('sawmill', 1, 19, 19),
      b('barn', 1, 11, 18),
      b('storage', 1, 16, 12),
      b('port', 1, 8, 0, 1, { has_ship: 1 }),
      b('port', 1, 15, 0, 1, { has_ship: 1 }),
    ],
    normal: [
      b('town_hall', 2, 11, 11),
      b('archer_tower', 2, 7, 9),
      b('archer_tower', 1, 17, 9),
      b('tombstone', 1, 12, 17),
      b('mine', 2, 4, 5),
      b('mine', 1, 19, 5),
      b('sawmill', 2, 4, 19),
      b('sawmill', 1, 19, 19),
      b('barn', 2, 11, 20),
      b('storage', 1, 16, 13),
      b('port', 2, 8, 0, 1, { has_ship: 1 }),
      b('port', 1, 15, 0, 1, { has_ship: 1 }),
    ],
    hard: [
      b('town_hall', 2, 11, 11),
      b('archer_tower', 2, 7, 9),
      b('archer_tower', 2, 17, 9),
      b('tombstone', 2, 12, 17),
      b('mine', 2, 4, 5),
      b('mine', 2, 19, 5),
      b('sawmill', 2, 4, 19),
      b('sawmill', 2, 19, 19),
      b('barn', 2, 11, 20),
      b('storage', 2, 16, 13),
      b('port', 2, 8, 0, 1, { has_ship: 1 }),
      b('port', 2, 15, 0, 1, { has_ship: 1 }),
    ],
  },
  3: {
    easy: [
      b('town_hall', 3, 11, 11),
      b('archer_tower', 2, 7, 8),
      b('archer_tower', 2, 17, 8),
      b('tombstone', 2, 12, 17),
      b('turret', 1, 9, 15),
      b('mine', 2, 4, 5),
      b('mine', 2, 19, 5),
      b('sawmill', 2, 4, 20),
      b('sawmill', 2, 19, 20),
      b('barn', 2, 10, 21),
      b('storage', 2, 16, 13),
      b('port', 2, 5, 0, 1, { has_ship: 1 }),
      b('port', 2, 11, 0, 1, { has_ship: 1 }),
      b('port', 1, 17, 0, 1, { has_ship: 1 }),
    ],
    normal: [
      b('town_hall', 3, 11, 11),
      b('archer_tower', 3, 7, 8),
      b('archer_tower', 2, 17, 8),
      b('archer_tower', 2, 12, 5),
      b('tombstone', 2, 7, 16),
      b('tombstone', 2, 17, 16),
      b('turret', 2, 10, 16),
      b('turret', 1, 15, 16),
      b('mine', 3, 3, 5),
      b('mine', 2, 20, 5),
      b('sawmill', 3, 3, 20),
      b('sawmill', 2, 20, 20),
      b('barn', 3, 10, 21),
      b('storage', 2, 16, 13),
      b('storage', 1, 5, 12),
      b('port', 3, 5, 0, 1, { has_ship: 1 }),
      b('port', 2, 11, 0, 1, { has_ship: 1 }),
      b('port', 2, 17, 0, 1, { has_ship: 1 }),
    ],
    hard: [
      b('town_hall', 3, 11, 11),
      b('archer_tower', 3, 7, 8),
      b('archer_tower', 3, 17, 8),
      b('archer_tower', 3, 12, 5),
      b('tombstone', 3, 7, 16),
      b('tombstone', 3, 17, 16),
      b('tombstone', 2, 12, 19),
      b('turret', 3, 10, 16),
      b('turret', 2, 15, 16),
      b('turret', 2, 12, 8),
      b('mine', 3, 3, 5),
      b('mine', 3, 20, 5),
      b('mine', 2, 3, 13),
      b('sawmill', 3, 3, 20),
      b('sawmill', 3, 20, 20),
      b('sawmill', 2, 20, 13),
      b('barn', 3, 10, 21),
      b('storage', 3, 16, 13),
      b('storage', 2, 5, 12),
      b('port', 3, 3, 0, 1, { has_ship: 1 }),
      b('port', 3, 9, 0, 1, { has_ship: 1 }),
      b('port', 2, 15, 0, 1, { has_ship: 1 }),
      b('port', 2, 21, 0, 1, { has_ship: 1 }),
    ],
  },
  4: {
    easy: [
      b('town_hall', 4, 11, 11),
      b('archer_tower', 3, 7, 8),
      b('archer_tower', 3, 17, 8),
      b('tombstone', 3, 7, 16),
      b('tombstone', 2, 17, 16),
      b('turret', 2, 10, 16),
      b('turret', 2, 15, 16),
      b('mage_tower', 1, 12, 6),
      b('mine', 3, 3, 5),
      b('mine', 3, 20, 5),
      b('sawmill', 3, 3, 20),
      b('sawmill', 3, 20, 20),
      b('barn', 3, 10, 21),
      b('storage', 3, 16, 13),
      b('storage', 2, 5, 12),
      b('port', 3, 3, 0, 1, { has_ship: 1 }),
      b('port', 3, 9, 0, 1, { has_ship: 1 }),
      b('port', 2, 15, 0, 1, { has_ship: 1 }),
      b('port', 2, 21, 0, 1, { has_ship: 1 }),
    ],
    normal: [
      b('town_hall', 4, 11, 11),
      b('archer_tower', 3, 7, 8),
      b('archer_tower', 3, 17, 8),
      b('archer_tower', 2, 12, 5),
      b('tombstone', 3, 7, 16),
      b('tombstone', 2, 17, 16),
      b('tombstone', 2, 12, 19),
      b('turret', 2, 10, 16),
      b('turret', 2, 15, 16),
      b('turret', 1, 12, 8),
      b('mage_tower', 1, 8, 12),
      b('mine', 4, 3, 5),
      b('mine', 3, 20, 5),
      b('mine', 3, 3, 13),
      b('sawmill', 4, 3, 20),
      b('sawmill', 3, 20, 20),
      b('sawmill', 3, 20, 13),
      b('barn', 4, 10, 21),
      b('storage', 3, 16, 13),
      b('storage', 3, 5, 12),
      b('storage', 2, 18, 18),
      b('port', 4, 3, 0, 1, { has_ship: 1 }),
      b('port', 3, 9, 0, 1, { has_ship: 1 }),
      b('port', 3, 15, 0, 1, { has_ship: 1 }),
      b('port', 2, 21, 0, 1, { has_ship: 1 }),
    ],
    hard: [
      b('town_hall', 4, 11, 11),
      b('archer_tower', 4, 7, 8),
      b('archer_tower', 3, 17, 8),
      b('archer_tower', 3, 12, 5),
      b('tombstone', 3, 7, 16),
      b('tombstone', 3, 17, 16),
      b('tombstone', 2, 12, 19),
      b('turret', 3, 10, 16),
      b('turret', 2, 15, 16),
      b('turret', 2, 12, 8),
      b('mage_tower', 2, 8, 12),
      b('mage_tower', 1, 17, 12),
      b('mine', 4, 3, 5),
      b('mine', 4, 20, 5),
      b('mine', 3, 3, 13),
      b('sawmill', 4, 3, 20),
      b('sawmill', 4, 20, 20),
      b('sawmill', 3, 20, 13),
      b('barn', 4, 10, 21),
      b('storage', 4, 16, 13),
      b('storage', 3, 5, 12),
      b('storage', 3, 18, 18),
      b('port', 4, 3, 0, 1, { has_ship: 1 }),
      b('port', 4, 9, 0, 1, { has_ship: 1 }),
      b('port', 3, 15, 0, 1, { has_ship: 1 }),
      b('port', 3, 21, 0, 1, { has_ship: 1 }),
    ],
  },
};

function b(type, level, gridX, gridZ, gridIndex = 0, extra = {}) {
  return { type, level, grid_x: gridX, grid_z: gridZ, grid_index: gridIndex, ...extra };
}

function transformBuilding(building, variant) {
  const size = BOT_BUILDING_SIZES[building.type] || [1, 1];
  const next = { ...building };
  if (next.grid_index === 0) {
    if (variant & 1) next.grid_x = GRID_SIZE - next.grid_x - size[0];
    if (variant & 2) next.grid_z = GRID_SIZE - next.grid_z - size[1];
    const shift = ((variant >> 2) % 2) === 0 ? -1 : 1;
    if (variant >= 4 && next.type !== 'town_hall') {
      next.grid_x = clamp(next.grid_x + shift, 0, GRID_SIZE - size[0]);
      next.grid_z = clamp(next.grid_z - shift, 0, GRID_SIZE - size[1]);
    }
  } else if (next.grid_index === 1) {
    if (variant & 1) next.grid_x = GRID_SIZE - next.grid_x - size[0];
    if (variant >= 4) next.grid_x = clamp(next.grid_x + 1, 0, GRID_SIZE - size[0]);
  }
  return next;
}

function botResources(th, difficulty) {
  const base = BOT_RESOURCES_BY_TH[th] || BOT_RESOURCES_BY_TH[1];
  const mult = difficulty === 'easy' ? 0.82 : difficulty === 'hard' ? 1.12 : 1.0;
  return {
    gold: Math.round(base.gold * mult),
    wood: Math.round(base.wood * mult),
    ore: Math.round(base.ore * mult),
  };
}

function buildBotBaseTemplates() {
  const templates = [];
  for (const th of Object.keys(BASE_LAYOUTS).map(Number)) {
    for (const difficulty of Object.keys(BASE_LAYOUTS[th])) {
      for (let variant = 0; variant < BOT_VARIANTS_PER_BUCKET; variant += 1) {
        const id = `bot-th${th}-${difficulty}-${variant + 1}`;
        templates.push({
          id,
          name: `Raid Bot TH${th} ${titleCase(difficulty)} ${variant + 1}`,
          th,
          difficulty,
          variant: variant + 1,
          generation: BOT_BASE_GENERATION,
          resources: botResources(th, difficulty),
          trophies: th * 120 + (difficulty === 'easy' ? 0 : difficulty === 'normal' ? 40 : 90),
          buildings: repairLayout(BASE_LAYOUTS[th][difficulty].map((building) => transformBuilding(building, variant))),
        });
      }
    }
  }
  return templates;
}

function repairLayout(buildings) {
  const occupied = new Set();
  const repaired = [];
  for (const building of buildings) {
    let next = { ...building };
    if (!canPlace(next, occupied)) {
      const slot = findOpenSlot(next, occupied);
      next = { ...next, ...slot };
    }
    occupy(next, occupied);
    repaired.push(next);
  }
  return repaired;
}

function canPlace(building, occupied) {
  const [w, h] = BOT_BUILDING_SIZES[building.type] || [1, 1];
  const [gridW, gridH] = BOT_GRID_SPECS[building.grid_index || 0] || BOT_GRID_SPECS[0];
  if (building.grid_x < 0 || building.grid_z < 0 || building.grid_x + w > gridW || building.grid_z + h > gridH) return false;
  for (let x = building.grid_x; x < building.grid_x + w; x += 1) {
    for (let z = building.grid_z; z < building.grid_z + h; z += 1) {
      if (occupied.has(cellKey(building.grid_index || 0, x, z))) return false;
    }
  }
  return true;
}

function findOpenSlot(building, occupied) {
  const [w, h] = BOT_BUILDING_SIZES[building.type] || [1, 1];
  const gridIndex = building.grid_index || 0;
  const [gridW, gridH] = BOT_GRID_SPECS[gridIndex] || BOT_GRID_SPECS[0];
  const maxX = gridW - w;
  const maxZ = gridH - h;
  const total = Math.max(1, (maxX + 1) * (maxZ + 1));
  const start = Math.abs((building.grid_x * 31 + building.grid_z * 17 + String(building.type).length * 13)) % total;
  for (let i = 0; i < total; i += 1) {
    const idx = (start + i) % total;
    const x = idx % (maxX + 1);
    const z = Math.floor(idx / (maxX + 1));
    const candidate = { ...building, grid_x: x, grid_z: z };
    if (canPlace(candidate, occupied)) return { grid_x: x, grid_z: z };
  }
  return { grid_x: 0, grid_z: 0 };
}

function occupy(building, occupied) {
  const [w, h] = BOT_BUILDING_SIZES[building.type] || [1, 1];
  const gridIndex = building.grid_index || 0;
  for (let x = building.grid_x; x < building.grid_x + w; x += 1) {
    for (let z = building.grid_z; z < building.grid_z + h; z += 1) {
      occupied.add(cellKey(gridIndex, x, z));
    }
  }
}

function cellKey(gridIndex, x, z) {
  return `${gridIndex}:${x}:${z}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function titleCase(value) {
  const text = String(value || '');
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

module.exports = {
  BOT_BASE_GENERATION,
  MATCHMAKING_CONFIG,
  buildBotBaseTemplates,
};
