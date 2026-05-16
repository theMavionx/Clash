// Storage-layout safety check for the V2 → V3 UUPS upgrade.
//
// Compiles V2 and V3 with solc's `storageLayout` output, then asserts:
//   1. Every V2 slot has an identically-typed slot at the same offset in V3.
//   2. V3 only appends new variables after V2's last slot.
//
// Fails the process with a non-zero exit code on any drift.

import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { NFT_DIR } from './lib-env.mjs';

const contractsDir = path.join(NFT_DIR, 'contracts');
const sources = Object.fromEntries(
  fs.readdirSync(contractsDir)
    .filter((file) => file.endsWith('.sol'))
    .map((file) => [file, { content: fs.readFileSync(path.join(contractsDir, file), 'utf8') }])
);

function resolveImport(importPath) {
  const candidates = [
    path.join(NFT_DIR, 'node_modules', importPath),
    path.join(NFT_DIR, 'contracts', importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') };
  }
  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['storageLayout', 'abi'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
const errors = (output.errors || []).filter((e) => e.severity === 'error');
if (errors.length > 0) {
  for (const err of errors) console.error(err.formattedMessage || err.message);
  process.exit(1);
}

function getLayout(sourceName, contractName) {
  const layout = output.contracts?.[sourceName]?.[contractName]?.storageLayout;
  if (!layout) {
    throw new Error(`No storageLayout for ${contractName} in ${sourceName}`);
  }
  return layout;
}

const v2 = getLayout('DemonKingBaseV2.sol', 'DemonKingBaseV2');
const v3 = getLayout('DemonKingBaseV3.sol', 'DemonKingBaseV3');

function tabulate(layout) {
  // Returns map: slot.offset string → { label, type }
  const m = new Map();
  for (const entry of layout.storage) {
    // Use slot+offset as the key (variables can pack into the same slot).
    const key = `${entry.slot}:${entry.offset}`;
    m.set(key, {
      label: entry.label,
      type: entry.type,
      slot: entry.slot,
      offset: entry.offset,
      astId: entry.astId,
    });
  }
  return m;
}

function resolveType(layout, typeKey) {
  // Recursive type resolution — turns "t_mapping(t_uint256,t_uint8)" into a readable normalized signature.
  const t = layout.types?.[typeKey];
  if (!t) return typeKey;
  if (t.encoding === 'mapping') {
    return `mapping(${resolveType(layout, t.key)} => ${resolveType(layout, t.value)})`;
  }
  if (t.encoding === 'inplace' && t.base) {
    return `${resolveType(layout, t.base)}[${t.numberOfBytes ? Math.floor(Number(t.numberOfBytes) / 32) : ''}]`;
  }
  if (t.encoding === 'bytes') return t.label;
  return t.label || typeKey;
}

const v2Map = tabulate(v2);
const v3Map = tabulate(v3);

console.log('=== V2 storage ===');
for (const [k, v] of [...v2Map.entries()].sort((a, b) => Number(a[0].split(':')[0]) - Number(b[0].split(':')[0]))) {
  console.log(`  slot ${v.slot.padStart(3, ' ')} off ${v.offset}  ${v.label.padEnd(28, ' ')}  ${resolveType(v2, v.type)}`);
}

console.log('\n=== V3 storage ===');
for (const [k, v] of [...v3Map.entries()].sort((a, b) => Number(a[0].split(':')[0]) - Number(b[0].split(':')[0]))) {
  console.log(`  slot ${v.slot.padStart(3, ' ')} off ${v.offset}  ${v.label.padEnd(28, ' ')}  ${resolveType(v3, v.type)}`);
}

console.log('\n=== Compatibility check ===');

let drift = 0;

// Pick V2's OWN __gap (the contract's, not the inherited one from UpgradeableReentrancyGuard).
// It's the __gap with the HIGHEST slot in V2.
const v2OwnGap = [...v2Map.values()]
  .filter((v) => v.label === '__gap')
  .sort((a, b) => Number(b.slot) - Number(a.slot))[0];
if (!v2OwnGap) {
  console.error('✗ V2 has no __gap — cannot reason about upgrade safety.');
  process.exit(1);
}
const v2GapSlot = Number(v2OwnGap.slot);
const v2GapLen = Math.floor(Number(v2.types[v2OwnGap.type].numberOfBytes) / 32);
const v2GapEnd = v2GapSlot + v2GapLen;
console.log(`\n  V2 contract __gap: starts slot ${v2GapSlot}, length ${v2GapLen}, ends at slot ${v2GapEnd} (exclusive).`);

// 1. Every V2 slot BEFORE v2's own __gap must exist identically in V3.
//    (Inherited __gap from UpgradeableReentrancyGuard is also covered here.)
for (const [k, v2Var] of v2Map.entries()) {
  if (v2Var === v2OwnGap) continue;  // V2's own gap is replaced by V3 vars + smaller gap
  const v3Var = v3Map.get(k);
  if (!v3Var) {
    console.error(`✗ MISSING in V3: slot ${v2Var.slot}.${v2Var.offset} ${v2Var.label}`);
    drift += 1;
    continue;
  }
  const v2Type = resolveType(v2, v2Var.type);
  const v3Type = resolveType(v3, v3Var.type);
  if (v2Type !== v3Type) {
    console.error(`✗ TYPE MISMATCH at slot ${v2Var.slot}.${v2Var.offset}: V2=${v2Type}  V3=${v3Type}`);
    drift += 1;
    continue;
  }
  if (v2Var.label !== v3Var.label) {
    console.warn(`! RENAME at slot ${v2Var.slot}.${v2Var.offset}: V2=${v2Var.label}  V3=${v3Var.label} (storage-compatible, just a label change)`);
  }
}

// 2. New V3 variables must occupy only V2's own __gap range [v2GapSlot, v2GapEnd).
//    Anything past v2GapEnd would mean V3 grew the contract's storage footprint.
const v3GapV3 = [...v3Map.values()].find((v) => v.label === '__gap_v3');
for (const v3Var of v3Map.values()) {
  if (v3Var.label === '__gap_v3') continue;
  if (v2Map.has(`${v3Var.slot}:${v3Var.offset}`)) continue;  // matched a V2 slot already
  const slotNum = Number(v3Var.slot);
  if (slotNum < v2GapSlot) {
    console.error(`✗ V3 var "${v3Var.label}" at slot ${slotNum} sits BEFORE V2's __gap[${v2GapLen}] start (${v2GapSlot}).`);
    drift += 1;
  } else if (slotNum >= v2GapEnd) {
    console.error(`✗ V3 var "${v3Var.label}" at slot ${slotNum} sits PAST V2's __gap[${v2GapLen}] end (${v2GapEnd}).`);
    drift += 1;
  }
}

// 3. V3's __gap_v3 must end exactly at V2's gap end (so a future V4 has the same room).
if (v3GapV3) {
  const v3GapLen = Math.floor(Number(v3.types[v3GapV3.type].numberOfBytes) / 32);
  const v3GapEnd = Number(v3GapV3.slot) + v3GapLen;
  console.log(`  V3 __gap_v3      : starts slot ${v3GapV3.slot}, length ${v3GapLen}, ends at slot ${v3GapEnd}.`);
  if (v3GapEnd !== v2GapEnd) {
    console.error(`✗ Reserved storage region ends mismatch: V2 ends at ${v2GapEnd}, V3 ends at ${v3GapEnd}. Adjust __gap_v3 length.`);
    drift += 1;
  } else {
    console.log(`  ✓ Reserved-region end matches V2.`);
  }
} else {
  console.error('✗ V3 has no __gap_v3 — future upgrades will not have storage headroom.');
  drift += 1;
}

if (drift > 0) {
  console.error(`\nFAILED: ${drift} layout issue(s). Fix DemonKingBaseV3.sol before deploying.`);
  process.exit(1);
}
console.log('\n✓ Storage layout compatible. V2 → V3 upgrade is safe to deploy.');
