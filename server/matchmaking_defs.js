const crypto = require('crypto');
const flamethrower = require('./flamethrower_config');
const { CANONICAL_GRID_CONFIGS, gridLocalPointToWorld } = require('./combat_grid_config');
const GENERATING_RAID_BOT_LAYOUTS =
  String(process.env.CLASH_GENERATING_RAID_BOT_LAYOUTS || '') === '1';
const HIGH_TIER_LAYOUT_CATALOG = GENERATING_RAID_BOT_LAYOUTS
  ? {}
  : require('./data/raid-bot-layouts-th6-th7.json'); // catalog now spans TH5-TH9

const MAIN_GRID_WIDTH = 29;
const MAIN_GRID_HEIGHT = 27;
const COAST_GRID_WIDTH = 27;
const BOT_BASE_GENERATION = 'raid-hard-geometry-v6';

// All generated raid targets remain competitive normal/hard bases. Matchmaking
// adapts by selecting tougher geometry or raising the target tier, never by
// creating an intentionally weakened easy-defense catalog.
const BOT_TEMPLATE_COUNTS_BY_TH = {
  1: { normal: 15, hard: 57 },
  2: { normal: 18, hard: 72 },
  3: { normal: 18, hard: 72 },
  4: { normal: 15, hard: 60 },
  5: { normal: 90, hard: 360 },
  6: { normal: 180, hard: 720 },
  7: { normal: 180, hard: 720 },
  8: { normal: 180, hard: 720 },
  9: { normal: 180, hard: 720 },
};

// The deterministic balance lab and production outcomes agree that geometry
// materially changes difficulty even when building counts and levels match.
// Strong players get layouts that resist optimized attacks while regular and
// recovery players continue to face competitive normal bases.
const CHALLENGE_BOT_ARCHETYPES = Object.freeze([
  'corner-keep',
  'asymmetric-left',
]);

// Ranked raids use the same-TH geometry cohort that landed closest to the
// target band in the production-parity balance population. The selected
// archetype has 20 deterministic TH5 layouts, 40 TH6 layouts, and 37 TH7
// layouts, so the
// daily no-repeat rule still has headroom without mixing in softer layouts.
const RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH = Object.freeze({
  5: Object.freeze(['asymmetric-left']),
  6: Object.freeze(['asymmetric-left']),
  7: Object.freeze(['corner-keep']),
  8: Object.freeze(['corner-keep']),
  9: Object.freeze(['corner-keep']),
});

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
  competitiveResultMinPowerRatio: 0.40,
  competitiveResultMaxPowerRatio: 1.60,
  maxTownHallGapBelow: 1,
  maxTownHallGapBelowHighTier: 2,
  maxTownHallGapAbove: 1,
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

const BOT_LOOT_REWARD_RANGE = Object.freeze({ min: 100, max: 2700 });
const BOT_LOOT_BASE_PERCENT = 0.15;

// Most raids stay useful without flooding the economy, while every bot tier
// can still roll a rare high-value target. The values represent the reward
// shown to the attacker, not the bot's internal resource stock.
const BOT_LOOT_REWARD_BANDS = Object.freeze([
  Object.freeze({ weight: 60, min: 100, max: 500 }),
  Object.freeze({ weight: 25, min: 501, max: 1000 }),
  Object.freeze({ weight: 10, min: 1001, max: 1700 }),
  Object.freeze({ weight: 4, min: 1701, max: 2300 }),
  Object.freeze({ weight: 1, min: 2301, max: 2700 }),
]);

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
  shark_trap: [2, 2],
  harpoon: [2, 2],
  cannon: [3, 3],
  flamethrower: [3, 3],
  air_bomb: [3, 3],
};

const BOT_GRID_SPECS = {
  0: [MAIN_GRID_WIDTH, MAIN_GRID_HEIGHT],
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
      b('port', 3, 15, 0, 1, { has_ship: 1 }),
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
      b('port', 3, 3, 0, 1, { has_ship: 1 }),
      b('port', 3, 9, 0, 1, { has_ship: 1 }),
      b('port', 3, 15, 0, 1, { has_ship: 1 }),
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
      b('port', 3, 3, 0, 1, { has_ship: 1 }),
      b('port', 3, 9, 0, 1, { has_ship: 1 }),
      b('port', 3, 15, 0, 1, { has_ship: 1 }),
    ],
  },
  5: {
    easy: [
      b('town_hall', 5, 11, 11),
      b('archer_tower', 1, 6, 7),
      b('archer_tower', 1, 18, 7),
      b('archer_tower', 1, 12, 5),
      b('tombstone', 1, 6, 15),
      b('tombstone', 1, 18, 15),
      b('turret', 1, 9, 17),
      b('turret', 1, 16, 17),
      b('mage_tower', 1, 7, 11),
      b('mage_tower', 1, 19, 11),
      b('mortar', 1, 13, 8),
      b('shark_trap', 1, 3, 23),
      b('mine', 2, 2, 3),
      b('mine', 2, 22, 3),
      b('mine', 1, 2, 20),
      b('sawmill', 2, 22, 20),
      b('sawmill', 2, 2, 10),
      b('sawmill', 1, 22, 10),
      b('barn', 2, 10, 22),
      b('storage', 2, 4, 16),
      b('storage', 1, 20, 16),
    ],
    normal: [
      b('town_hall', 5, 11, 11),
      b('archer_tower', 5, 6, 7),
      b('archer_tower', 4, 18, 7),
      b('archer_tower', 4, 12, 5),
      b('tombstone', 4, 6, 15),
      b('tombstone', 4, 18, 15),
      b('tombstone', 3, 12, 20),
      b('turret', 4, 9, 17),
      b('turret', 4, 16, 17),
      b('turret', 3, 13, 8),
      b('mage_tower', 4, 7, 11),
      b('mage_tower', 3, 19, 11),
      b('mortar', 1, 13, 17),
      b('shark_trap', 4, 3, 23),
      b('shark_trap', 3, 24, 23),
      b('mine', 5, 2, 3),
      b('mine', 4, 22, 3),
      b('mine', 4, 2, 20),
      b('mine', 3, 22, 20),
      b('sawmill', 5, 2, 10),
      b('sawmill', 4, 22, 10),
      b('sawmill', 4, 6, 23),
      b('sawmill', 3, 20, 23),
      b('barn', 5, 10, 22),
      b('storage', 5, 4, 16),
      b('storage', 4, 20, 16),
      b('storage', 3, 4, 10),
    ],
    hard: [
      b('town_hall', 5, 11, 11),
      b('archer_tower', 5, 6, 7),
      b('archer_tower', 5, 18, 7),
      b('archer_tower', 5, 12, 5),
      b('tombstone', 4, 6, 15),
      b('tombstone', 4, 18, 15),
      b('tombstone', 4, 12, 20),
      b('turret', 5, 9, 17),
      b('turret', 5, 16, 17),
      b('turret', 4, 13, 8),
      b('mage_tower', 5, 7, 11),
      b('mage_tower', 5, 19, 11),
      b('mortar', 1, 13, 17),
      b('shark_trap', 5, 3, 23),
      b('shark_trap', 5, 24, 23),
      b('mine', 5, 2, 3),
      b('mine', 5, 22, 3),
      b('mine', 5, 2, 20),
      b('mine', 4, 22, 20),
      b('sawmill', 5, 2, 10),
      b('sawmill', 5, 22, 10),
      b('sawmill', 5, 6, 23),
      b('sawmill', 4, 20, 23),
      b('barn', 5, 10, 22),
      b('storage', 5, 4, 16),
      b('storage', 5, 20, 16),
      b('storage', 4, 4, 10),
    ],
  },
};

const COMPETITIVE_BOT_MAX_LEVELS = {
  5: {
    town_hall: 5,
    mine: 5,
    sawmill: 5,
    barn: 5,
    storage: 5,
    archer_tower: 5,
    tombstone: 4,
    turret: 5,
    mage_tower: 5,
    mortar: 5,
    shark_trap: 5,
  },
  6: {
    town_hall: 6,
    mine: 6,
    sawmill: 6,
    barn: 6,
    storage: 6,
    archer_tower: 6,
    tombstone: 5,
    turret: 6,
    mage_tower: 6,
    mortar: 6,
    shark_trap: 6,
    harpoon: 6,
  },
  7: {
    town_hall: 7,
    mine: 7,
    sawmill: 7,
    barn: 7,
    storage: 7,
    archer_tower: 7,
    tombstone: 6,
    turret: 7,
    mage_tower: 7,
    mortar: 7,
    shark_trap: 7,
    harpoon: 7,
    cannon: 7,
  },
  8: {
    town_hall: 8,
    mine: 8,
    sawmill: 8,
    barn: 8,
    storage: 8,
    archer_tower: 8,
    tombstone: 7,
    turret: 8,
    mage_tower: 8,
    mortar: 8,
    shark_trap: 8,
    harpoon: 8,
    cannon: 8,
    flamethrower: 8,
  },
  9: {
    town_hall: 9,
    mine: 9,
    sawmill: 9,
    barn: 9,
    storage: 9,
    archer_tower: 9,
    tombstone: 8,
    turret: 9,
    mage_tower: 9,
    mortar: 9,
    shark_trap: 9,
    harpoon: 9,
    cannon: 9,
    flamethrower: 9,
    air_bomb: 9,
  },
};

const COMPETITIVE_BOT_DEFENSE_TYPES = new Set([
  'archer_tower',
  'tombstone',
  'turret',
  'mage_tower',
  'mortar',
  'shark_trap',
  'harpoon',
  'cannon',
  'flamethrower',
  'air_bomb',
]);

const COMPETITIVE_BOT_ECONOMY_TYPES = new Set([
  'mine',
  'sawmill',
  'barn',
  'storage',
]);

const PLAYER_LIKE_NAMES = [
  'ghost', 'www', 'egorble', 'papajshon', 'nick', 'volumer', 'luckier',
  '0xbro', 'onlywin', 'semlysak', 'idol', 'ggbet', '555gg',
  'mike', 'alex', 'roman', 'den', 'ivan', 'max', 'neo', 'zero', 'void',
  'nova', 'storm', 'flare', 'orbit', 'raven', 'ace', 'drift', 'clutch',
  'prime', 'dexter', 'pepe', 'shiro', 'yuki', 'kage', 'mono', 'toly',
  'solman', 'whale', 'degen', 'hodler', 'lucky', 'sasha', 'dima', 'vlad',
  'kostya', 'serg', 'artem', 'bogdan', 'taras', 'vitalik', 'murad', 'tim',
  'zed', 'kai', 'leo', 'ronin', 'sage', 'mist', 'frost', 'blaze', 'ember',
  'spark', 'echo', 'pixel', 'glitch', 'turbo', 'rocket', 'joker', 'viper',
  'venom', 'cobra', 'panda', 'neko', 'oni', 'shin', 'ryu', 'kira', 'ren',
  'sora', 'akira', 'kenzo', 'haru', 'natsu', 'mako', 'wave', 'tide',
  'reef', 'sail', 'skiff', 'rum', 'jolly', 'hook', 'coin', 'block',
  'chain', 'mint', 'stake', 'yield', 'gasless', 'trader', 'scalper',
  'maker', 'taker', 'bullrun', 'green', 'red', 'blue', 'goldie', 'woody',
  'stoney', 'crusher', 'raider', 'legend', 'newbie', 'casual', 'farmer',
  'grinder', 'pusher', 'defender', 'raiderx', 'moonboy', 'sun', 'star',
  'cloud', 'rain', 'thunder', 'static', 'neon', 'cyber', 'vector',
  'matrix', 'byte', 'cache', 'proxy', 'socket', 'ping', 'latency',
  'sigma', 'omega', 'beta', 'delta', 'gamma', 'kappa', 'ggwp', 'ezwin',
  'nofear', 'allday', 'oneup', 'fivefive', 'nine', 'seven', '0xace',
  '0xmax', '0xneo', '0xvoid', '1tap', 'twotap', 'hype', 'chill',
  'sleep', 'awake',
];
const REQUESTED_PLAYER_NAMES_BY_TH = {
  2: ['ghost', 'www', 'egorble', 'papajshon'],
  3: ['nick', 'volumer', 'luckier'],
  4: ['0xbro', 'onlywin', 'semlysak'],
  5: ['idol', 'ggbet', '555gg'],
  6: ['maverick', 'noctis', 'rainmaker', 'katsuro', 'solace'],
  7: ['blackreef', 'northstar', 'wildcard', 'redline', 'seawolf'],
};
const REQUESTED_PLAYER_NAMES = new Set(Object.values(REQUESTED_PLAYER_NAMES_BY_TH).flat());
const FALLBACK_PLAYER_NAMES = PLAYER_LIKE_NAMES.filter((name) => !REQUESTED_PLAYER_NAMES.has(name));
const GENERATED_NAME_ROOTS = [
  'ace', 'aero', 'aki', 'alfa', 'andy', 'argo', 'ash', 'axel', 'ben',
  'bit', 'bolt', 'bravo', 'bruno', 'cash', 'chad', 'chip', 'cole', 'dash',
  'dax', 'dino', 'don', 'dusk', 'eli', 'enzo', 'finn', 'flux', 'fox',
  'fred', 'gabe', 'gray', 'hex', 'hiro', 'hugo', 'ian', 'jack', 'jake',
  'jay', 'jett', 'joe', 'joey', 'josh', 'juno', 'kane', 'karl', 'kim',
  'kirk', 'kris', 'lex', 'liam', 'loki', 'luke', 'mac', 'mark', 'matt',
  'milo', 'nash', 'niko', 'noah', 'odin', 'ollie', 'otto', 'paul', 'pax',
  'ray', 'rex', 'rico', 'rob', 'sam', 'sean', 'seth', 'sky', 'tom',
  'tony', 'trey', 'tron', 'vince', 'wade', 'will', 'xeno', 'zane', 'zen',
  'aaron', 'adrian', 'amir', 'anton', 'armin', 'basil', 'beck', 'blake',
  'boris', 'cal', 'cato', 'cedar', 'chris', 'cody', 'colt', 'dane',
  'derek', 'dev', 'ed', 'emil', 'eric', 'evan', 'felix', 'gene', 'glen',
  'grant', 'hank', 'isaac', 'jace', 'james', 'jamie', 'jason', 'jeff',
  'jim', 'john', 'jonas', 'jules', 'kevin', 'kyle', 'lars', 'logan',
  'lucas', 'mason', 'mika', 'milan', 'mitch', 'nate', 'neil', 'omar',
  'pete', 'phil', 'quinn', 'ralf', 'ross', 'roy', 'ryan', 'scott',
  'stan', 'steve', 'tate', 'theo', 'toby', 'troy', 'val', 'wes', 'zack',
];
const GENERATED_NAME_SUFFIXES = [
  '', 'x', '7', '77', 'gg', 'win', 'sol', 'eth',
  'one', 'pro', 'tv', '13', '21', '47', '69', '88',
];
const GENERATED_PLAYER_NAMES = GENERATED_NAME_ROOTS
  .flatMap((root) => GENERATED_NAME_SUFFIXES.map((suffix) => `${root}${suffix}`))
  .sort((left, right) => {
    const leftHash = crypto.createHash('sha256').update(`raid-name:${left}`).digest('hex');
    const rightHash = crypto.createHash('sha256').update(`raid-name:${right}`).digest('hex');
    return leftHash.localeCompare(rightHash);
  });

function b(type, level, gridX, gridZ, gridIndex = 0, extra = {}) {
  return {
    type,
    level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: gridIndex,
    ...(type === 'flamethrower' ? {
      facing_step: botFlamethrowerFacingStep(gridX, gridZ, gridIndex),
    } : {}),
    ...extra,
  };
}

function botFlamethrowerFacingStep(gridX, gridZ, gridIndex = 0) {
  const grid = CANONICAL_GRID_CONFIGS[gridIndex] || CANONICAL_GRID_CONFIGS[0];
  const approach = CANONICAL_GRID_CONFIGS[2];
  const [width, height] = flamethrower.BUILDING.footprint;
  const localX = -grid.grid_extent_x / 2 + Number(gridX) * grid.cell_size + width * grid.cell_size / 2;
  const localZ = -grid.grid_extent_z / 2 + Number(gridZ) * grid.cell_size + height * grid.cell_size / 2;
  const center = gridLocalPointToWorld(grid, localX, localZ);
  return flamethrower.nearestStepToward(center, {
    x: approach.grid_center_x,
    z: approach.grid_center_z,
  });
}

function transformBuilding(building, variant) {
  const size = BOT_BUILDING_SIZES[building.type] || [1, 1];
  const next = { ...building };
  const shiftGroup = Math.floor(variant / 4);
  const shift = shiftGroup === 0
    ? 0
    : (shiftGroup % 2 === 1 ? Math.ceil(shiftGroup / 2) : -Math.ceil(shiftGroup / 2));
  if (next.grid_index === 0) {
    if (variant & 1) next.grid_x = MAIN_GRID_WIDTH - next.grid_x - size[0];
    if (variant & 2) next.grid_z = MAIN_GRID_HEIGHT - next.grid_z - size[1];
    if (shift !== 0 && next.type !== 'town_hall') {
      next.grid_x = clamp(next.grid_x + shift, 0, MAIN_GRID_WIDTH - size[0]);
      next.grid_z = clamp(next.grid_z - shift, 0, MAIN_GRID_HEIGHT - size[1]);
    }
  } else if (next.grid_index === 1) {
    if (variant & 1) next.grid_x = COAST_GRID_WIDTH - next.grid_x - size[0];
    if (shift !== 0) next.grid_x = clamp(next.grid_x + shift, 0, COAST_GRID_WIDTH - size[0]);
  }
  return next;
}

function seededBotLootReward(seed, resource) {
  const digest = crypto.createHash('sha256')
    .update(`raid-loot-reward:${seed}:${resource}`)
    .digest();
  const totalWeight = BOT_LOOT_REWARD_BANDS.reduce((sum, band) => sum + band.weight, 0);
  let weightedRoll = digest.readUInt16BE(0) % totalWeight;
  let selectedBand = BOT_LOOT_REWARD_BANDS[BOT_LOOT_REWARD_BANDS.length - 1];
  for (const band of BOT_LOOT_REWARD_BANDS) {
    if (weightedRoll < band.weight) {
      selectedBand = band;
      break;
    }
    weightedRoll -= band.weight;
  }
  const width = selectedBand.max - selectedBand.min + 1;
  return selectedBand.min + (digest.readUInt32BE(2) % width);
}

function botResourceStockForReward(reward, lootPercent) {
  const target = clamp(
    Math.floor(Number(reward) || 0),
    BOT_LOOT_REWARD_RANGE.min,
    BOT_LOOT_REWARD_RANGE.max,
  );
  const percent = Math.max(0.000001, Number(lootPercent) || BOT_LOOT_BASE_PERCENT);
  let stock = Math.ceil(target / percent);
  while (Math.floor(stock * percent) < target) stock += 1;
  while (stock > 1 && Math.floor((stock - 1) * percent) >= target) stock -= 1;
  return stock;
}

function botResources(th, difficulty, seed = '', previous = null) {
  const multiplier = MATCHMAKING_CONFIG.botLootMultiplier[difficulty]
    || MATCHMAKING_CONFIG.botLootMultiplier.normal;
  const lootPercent = BOT_LOOT_BASE_PERCENT * multiplier;
  const resources = {};
  const usedStocks = new Set();
  const usedRewards = new Set();

  for (const resource of ['gold', 'wood', 'ore']) {
    let reward = seededBotLootReward(`${th}:${difficulty}:${seed}`, resource);
    let amount = botResourceStockForReward(reward, lootPercent);
    while (
      usedRewards.has(reward)
      || usedStocks.has(amount)
      || (previous && amount === Number(previous[resource]))
    ) {
      reward = reward >= BOT_LOOT_REWARD_RANGE.max
        ? BOT_LOOT_REWARD_RANGE.min
        : reward + 1;
      amount = botResourceStockForReward(reward, lootPercent);
    }
    resources[resource] = amount;
    usedRewards.add(reward);
    usedStocks.add(amount);
  }
  return resources;
}

let botTemplateCache = null;

function buildBotBaseTemplates() {
  if (botTemplateCache) return botTemplateCache;
  const templates = [];
  let fallbackNameIndex = 0;
  const usedNames = new Set();
  for (const th of Object.keys(BOT_TEMPLATE_COUNTS_BY_TH).map(Number)) {
    if (GENERATING_RAID_BOT_LAYOUTS && th >= 6) continue;
    let tierNameIndex = 0;
    for (const difficulty of Object.keys(BOT_TEMPLATE_COUNTS_BY_TH[th])) {
      const variantCount = BOT_TEMPLATE_COUNTS_BY_TH[th]?.[difficulty] || 0;
      for (let variant = 0; variant < variantCount; variant += 1) {
        const id = `bot-th${th}-${difficulty}-${variant + 1}`;
        const requestedNames = REQUESTED_PLAYER_NAMES_BY_TH[th] || [];
        const requestedName = requestedNames[tierNameIndex] || null;
        const name = requestedName && !usedNames.has(requestedName)
          ? requestedName
          : nextFallbackPlayerName(fallbackNameIndex++, usedNames);
        usedNames.add(name);
        templates.push({
          id,
          name,
          th,
          difficulty,
          archetype: botTemplateArchetype(th, difficulty, variant),
          variant: variant + 1,
          generation: BOT_BASE_GENERATION,
          resources: botResources(th, difficulty, id),
          trophies: th * 120 + (difficulty === 'easy' ? 0 : difficulty === 'normal' ? 40 : 90),
          buildings: buildTemplateLayout(th, difficulty, variant),
        });
        tierNameIndex += 1;
      }
    }
  }
  botTemplateCache = templates;
  return botTemplateCache;
}

function highTierLayoutIndex(th, difficulty, variant) {
  const normalCount = Number(BOT_TEMPLATE_COUNTS_BY_TH[th]?.normal) || 0;
  return difficulty === 'hard' ? normalCount + variant : variant;
}

function highTierLayoutEntry(th, difficulty, variant) {
  const catalog = HIGH_TIER_LAYOUT_CATALOG[String(th)] || [];
  const index = highTierLayoutIndex(th, difficulty, variant);
  const entry = catalog[index];
  if (!entry || !Array.isArray(entry.buildings)) {
    throw new Error(`Missing generated TH${th} raid layout ${index + 1}/${catalog.length}`);
  }
  return entry;
}

function botTemplateArchetype(th, difficulty, variant) {
  if (th < 5) return `th${th}-static`;
  return String(highTierLayoutEntry(th, difficulty, variant).archetype || 'unknown');
}

function buildTemplateLayout(th, difficulty, variant) {
  if (th < 5) {
    const layout = repairLayout(
      BASE_LAYOUTS[th][difficulty].map((building) => transformBuilding(building, variant)),
    );
    return applyCompetitiveBotLevels(layout, th, difficulty, variant);
  }
  const entry = highTierLayoutEntry(th, difficulty, variant);
  const layout = entry.buildings.map(([type, gridX, gridZ]) => b(
    type,
    competitiveBotMaxLevel(th, type),
    gridX,
    gridZ,
  ));
  return applyCompetitiveBotLevels(layout, th, difficulty, variant);
}

function competitiveBotMaxLevel(th, type) {
  return Math.max(1, Number(COMPETITIVE_BOT_MAX_LEVELS[th]?.[type]) || 1);
}

function applyCompetitiveBotLevels(buildings, th, difficulty, variant) {
  if (th < 5) return buildings;

  const maxed = buildings.map((building) => ({
    ...building,
    level: competitiveBotMaxLevel(th, building.type),
  }));
  const variantNumber = Math.max(1, Number(variant) + 1);
  const downgradeCount = difficulty === 'hard'
    ? (variantNumber % 4 === 1 ? 1 : 0)
    : variantNumber % 4 === 1
      ? 0
      : variantNumber % 4 === 0
        ? 2
        : 1;
  if (downgradeCount <= 0) return maxed;

  const rankedCandidates = maxed
    .map((building, index) => ({
      index,
      building,
      rank: crypto.createHash('sha256')
        .update([
          'raid-bot-level',
          th,
          difficulty,
          variantNumber,
          building.type,
          building.grid_index || 0,
          building.grid_x,
          building.grid_z,
        ].join(':'))
        .digest('hex'),
    }))
    .filter(({ building }) => (
      building.type !== 'town_hall'
      && competitiveBotMaxLevel(th, building.type) > 1
    ))
    .sort((left, right) => left.rank.localeCompare(right.rank));

  const economyCandidates = rankedCandidates.filter(({ building }) => (
    COMPETITIVE_BOT_ECONOMY_TYPES.has(building.type)
  ));
  const defenseCandidates = rankedCandidates.filter(({ building }) => (
    COMPETITIVE_BOT_DEFENSE_TYPES.has(building.type)
  ));
  const selected = [];

  if (economyCandidates.length > 0) selected.push(economyCandidates[0]);
  if (difficulty === 'normal' && downgradeCount > 1 && defenseCandidates.length > 0) {
    selected.push(defenseCandidates[0]);
  }
  for (const candidate of rankedCandidates) {
    if (selected.length >= downgradeCount) break;
    if (selected.some((entry) => entry.index === candidate.index)) continue;
    selected.push(candidate);
  }

  const downgradedIndices = new Set(
    selected.slice(0, downgradeCount).map(({ index }) => index),
  );
  return maxed.map((building, index) => (
    downgradedIndices.has(index)
      ? { ...building, level: Math.max(1, building.level - 1) }
      : building
  ));
}

function fallbackPlayerName(index) {
  if (index < FALLBACK_PLAYER_NAMES.length) return FALLBACK_PLAYER_NAMES[index];
  const generatedIndex = index - FALLBACK_PLAYER_NAMES.length;
  if (generatedIndex < GENERATED_PLAYER_NAMES.length) return GENERATED_PLAYER_NAMES[generatedIndex];
  const overflowIndex = generatedIndex - GENERATED_PLAYER_NAMES.length;
  const root = GENERATED_NAME_ROOTS[overflowIndex % GENERATED_NAME_ROOTS.length];
  const numericSuffix = 100 + Math.floor(overflowIndex / GENERATED_NAME_ROOTS.length);
  return `${root}${numericSuffix}`;
}

function nextFallbackPlayerName(index, usedNames) {
  let nextIndex = index;
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const candidate = fallbackPlayerName(nextIndex);
    nextIndex += 1;
    if (!usedNames.has(candidate)) return candidate;
  }
  throw new Error('Unable to allocate a unique raid bot template name');
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

module.exports = {
  BOT_BASE_GENERATION,
  BOT_LOOT_REWARD_RANGE,
  CHALLENGE_BOT_ARCHETYPES,
  RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH,
  MATCHMAKING_CONFIG,
  buildBotBaseTemplates,
  botResources,
};
