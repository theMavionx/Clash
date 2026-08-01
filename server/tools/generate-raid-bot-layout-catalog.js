#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const balanceTool = path.join(repoRoot, 'tools', 'pvp-balance', 'run.js');
const outputPath = path.join(
  repoRoot,
  'server',
  'data',
  'raid-bot-layouts-th6-th7.json',
);
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-raid-bot-layouts-'));
const scratchCatalog = path.join(scratchDir, 'catalog.json');
const scratchReport = path.join(scratchDir, 'report.md');
const scratchData = path.join(scratchDir, 'report.json');
const layoutsByTownHall = { 5: 450, 6: 900, 7: 900 };

try {
  const result = spawnSync(
    process.execPath,
    [
      balanceTool,
      '--catalog-only',
      '--profile',
      'th5-th7',
      '--bases',
      '3240',
      '--seed',
      '729',
      '--dump-bases',
      scratchCatalog,
      '--out',
      scratchReport,
      '--json',
      scratchData,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLASH_GENERATING_RAID_BOT_LAYOUTS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `PvP balance catalog generation failed:\n${result.stderr || result.stdout}`,
    );
  }

  const generated = JSON.parse(fs.readFileSync(scratchCatalog, 'utf8'));
  const compact = {};
  for (const townHall of [5, 6, 7]) {
    const layoutsPerTownHall = layoutsByTownHall[townHall];
    compact[townHall] = generated
      .filter((base) => Number(base.townHall) === townHall)
      .slice(0, layoutsPerTownHall)
      .map((base) => ({
        archetype: String(base.archetype),
        buildings: base.buildings
          .filter((building) => building.type !== 'altar')
          .map((building) => [
            String(building.type),
            Number(building.grid_x),
            Number(building.grid_z),
          ]),
      }));
    if (compact[townHall].length !== layoutsPerTownHall) {
      throw new Error(
        `Expected ${layoutsPerTownHall} TH${townHall} layouts, got ${compact[townHall].length}`,
      );
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(compact)}\n`, 'utf8');
  console.log(
    `Wrote TH5=${layoutsByTownHall[5]}, TH6=${layoutsByTownHall[6]}, and TH7=${layoutsByTownHall[7]} layouts to ${outputPath}`,
  );
} finally {
  fs.rmSync(scratchDir, { recursive: true, force: true });
}
