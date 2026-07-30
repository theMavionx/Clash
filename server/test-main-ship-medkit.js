'use strict';

const assert = require('node:assert/strict');
const { verifyReplay } = require('./combat_session');
const {
  CANONICAL_GRID_CONFIGS,
  MEDKIT_ENERGY_COST,
  MEDKIT_UNLOCK_SHIP_LEVEL,
  PLAYER_SHIP_LEVELS,
} = require('./combat_defs');

function gridToWorld(gridX, gridZ, sizeX, sizeZ, grid) {
  const localX = (gridX + sizeX / 2) * grid.cell_size - grid.grid_extent_x / 2;
  const localZ = (gridZ + sizeZ / 2) * grid.cell_size - grid.grid_extent_z / 2;
  const cosRotation = Math.cos(grid.grid_rotation);
  const sinRotation = Math.sin(grid.grid_rotation);
  return {
    x: grid.grid_center_x + localX * cosRotation - localZ * sinRotation,
    z: grid.grid_center_z + localX * sinRotation + localZ * cosRotation,
  };
}

const deployPoint = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
const defenderBuildings = [
  {
    id: 1,
    type: 'town_hall',
    level: 6,
    grid_x: 12,
    grid_z: 8,
    grid_index: 0,
    hp: 8500,
    max_hp: 8500,
  },
  {
    id: 2,
    type: 'turret',
    level: 6,
    grid_x: 12,
    grid_z: 20,
    grid_index: 0,
    hp: 2000,
    max_hp: 2000,
  },
];

function simulate({ shipLevel, medkitDrops }) {
  return verifyReplay({
    defenderBuildings,
    actions: [
      {
        type: 'deploy_troop',
        troop: 'Knight:7',
        troopLevel: 7,
        deploy_index: 0,
        x: deployPoint.x,
        z: deployPoint.z,
        t: 0,
      },
      ...Array.from({ length: medkitDrops }, () => ({
        type: 'medkit_drop',
        x: deployPoint.x,
        z: deployPoint.z,
        t: 0,
      })),
    ],
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { knight: 7 },
    serverShipLevel: shipLevel,
  });
}

const healed = simulate({ shipLevel: MEDKIT_UNLOCK_SHIP_LEVEL, medkitDrops: 1 });
const duplicate = simulate({ shipLevel: MEDKIT_UNLOCK_SHIP_LEVEL, medkitDrops: 2 });
const exhausted = simulate({ shipLevel: MEDKIT_UNLOCK_SHIP_LEVEL, medkitDrops: 3 });
const locked = simulate({ shipLevel: MEDKIT_UNLOCK_SHIP_LEVEL - 1, medkitDrops: 1 });

assert.equal(healed._medkitEventsAccepted, 1);
assert.equal(healed._medkitEventsIgnored, 0);
assert.ok(healed._medkitHealTicks > 0, 'active medkit must tick while a troop is inside');
assert.ok(healed._medkitHealingApplied > 0, 'active medkit must restore actual troop HP');
assert.equal(
  healed._cannonEnergy,
  PLAYER_SHIP_LEVELS[MEDKIT_UNLOCK_SHIP_LEVEL].energy - MEDKIT_ENERGY_COST,
);

assert.equal(duplicate._medkitEventsAccepted, 2);
assert.equal(duplicate._medkitEventsIgnored, 0);
assert.equal(
  duplicate._medkitHealingApplied,
  healed._medkitHealingApplied,
  'overlapping medkits must not multiply healing ticks',
);
assert.equal(
  duplicate._cannonEnergy,
  PLAYER_SHIP_LEVELS[MEDKIT_UNLOCK_SHIP_LEVEL].energy
    - MEDKIT_ENERGY_COST
    - (MEDKIT_ENERGY_COST + 1),
);
assert.equal(exhausted._medkitEventsAccepted, 2);
assert.equal(exhausted._medkitEventsIgnored, 1, 'energy must bound repeated medkits');
assert.equal(locked._medkitEventsAccepted, 0);
assert.equal(locked._medkitEventsIgnored, 1, 'ships below level 6 must not use the medkit');
assert.equal(locked._medkitHealingApplied, 0);

console.log(
  `[MAIN_SHIP_MEDKIT] PASS healed=${healed._medkitHealingApplied}`
  + ` ticks=${healed._medkitHealTicks}`
  + ` energy=${healed._cannonEnergy}`
  + ` repeat_energy=${duplicate._cannonEnergy}`,
);
