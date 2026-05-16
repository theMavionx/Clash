// Compares storage layouts of two compiled contracts and verifies that the
// new layout is an "append-only / gap-consuming" extension of the old one.
//
// Rules:
//   1. Every non-gap variable in OLD must appear in NEW at the same slot+offset
//      with the same label and type.
//   2. NEW may add new variables, but only inside ranges previously occupied
//      by __gap arrays in OLD.
//   3. NEW may shrink an OLD __gap, but never delete or shift it.
//
// Inheritance can produce multiple __gap entries with identical labels (e.g.
// UpgradeableReentrancyGuard.__gap + DemonKingBaseV2.__gap). Disambiguation
// is by slot — not label.
//
// Usage:
//   node scripts/check-storage-layout.mjs DemonKingBaseV2 DemonKingBaseV3

import fs from 'node:fs';
import path from 'node:path';
import { NFT_DIR } from './lib-env.mjs';

const [oldName, newName] = process.argv.slice(2);
if (!oldName || !newName) {
  console.error('Usage: node scripts/check-storage-layout.mjs <oldContract> <newContract>');
  process.exit(1);
}

function loadLayout(name) {
  const file = path.join(NFT_DIR, 'artifacts', `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Artifact ${name}.json not found.`);
  const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!artifact.storageLayout) throw new Error(`${name} has no storageLayout.`);
  return artifact.storageLayout;
}

function typeBytes(layout, typeId) {
  return Number(layout.types[typeId]?.numberOfBytes || 32);
}
function typeLabel(layout, typeId) {
  return layout.types[typeId]?.label || typeId;
}
function slotsOccupied(layout, v) {
  return Math.ceil(typeBytes(layout, v.type) / 32);
}
function isGap(v) {
  return v.label.startsWith('__gap');
}

const oldLayout = loadLayout(oldName);
const newLayout = loadLayout(newName);

const oldVars = oldLayout.storage.map((v) => ({
  ...v,
  slotNum: Number(v.slot),
  end: Number(v.slot) + slotsOccupied(oldLayout, v) - 1,
  tlabel: typeLabel(oldLayout, v.type),
}));
const newVars = newLayout.storage.map((v) => ({
  ...v,
  slotNum: Number(v.slot),
  end: Number(v.slot) + slotsOccupied(newLayout, v) - 1,
  tlabel: typeLabel(newLayout, v.type),
}));

const newBySlotOffset = new Map(newVars.map((v) => [`${v.slotNum}@${v.offset}`, v]));

const errors = [];
const oldGaps = oldVars.filter(isGap);
const oldNonGap = oldVars.filter((v) => !isGap(v));

// Rule 1: every non-gap old var must have a matching new var at same slot+offset.
for (const o of oldNonGap) {
  const key = `${o.slotNum}@${o.offset}`;
  const n = newBySlotOffset.get(key);
  if (!n) {
    errors.push(`MISSING: old "${o.label}" at slot ${key} has no corresponding new var`);
    continue;
  }
  if (n.label !== o.label) {
    errors.push(`LABEL CHANGED at slot ${key}: old="${o.label}" new="${n.label}"`);
  }
  if (n.tlabel !== o.tlabel) {
    errors.push(`TYPE CHANGED at slot ${key} (${o.label}): old="${o.tlabel}" new="${n.tlabel}"`);
  }
}

// Rule 2: every new var that is NOT a non-gap match with old must live inside
// an old __gap range AND not collide with any old non-gap var.
const oldNonGapByKey = new Map(oldNonGap.map((v) => [`${v.slotNum}@${v.offset}`, v]));
const newAdded = [];
for (const n of newVars) {
  const key = `${n.slotNum}@${n.offset}`;
  // If this slot matches an old NON-GAP var with the same label, it's the
  // preserved-var case checked in Rule 1.
  const oMatch = oldNonGapByKey.get(key);
  if (oMatch && oMatch.label === n.label) continue;
  newAdded.push(n);

  // Check collision with old non-gap vars.
  const overlapsNonGap = oldNonGap.find((v) => n.slotNum >= v.slotNum && n.slotNum <= v.end);
  if (overlapsNonGap) {
    errors.push(`COLLISION: new "${n.label}" at slot ${n.slotNum} overlaps old non-gap "${overlapsNonGap.label}" (slots ${overlapsNonGap.slotNum}-${overlapsNonGap.end})`);
    continue;
  }

  // Check it falls inside an old __gap.
  const insideGap = oldGaps.find((g) => n.slotNum >= g.slotNum && n.slotNum <= g.end);
  if (!insideGap) {
    errors.push(`OUT-OF-RANGE: new "${n.label}" at slot ${n.slotNum} is past the end of old storage (no old gap covers it)`);
  }
}

// Print summary.
console.log(`\n=== Storage compatibility: ${oldName} → ${newName} ===\n`);
console.log(`Old vars: ${oldVars.length}  (non-gap: ${oldNonGap.length}, gap: ${oldGaps.length})`);
console.log(`New vars: ${newVars.length}`);

if (newAdded.length > 0) {
  console.log(`\nNewly added in ${newName} (${newAdded.length}):`);
  for (const v of newAdded) {
    console.log(`  + ${v.label.padEnd(28)}  slot ${String(v.slotNum).padStart(3)}@${v.offset}  ${v.tlabel}`);
  }
}

if (errors.length > 0) {
  console.error(`\n❌ INCOMPATIBLE — ${errors.length} issue(s):`);
  for (const e of errors) console.error('  ' + e);
  console.error('');
  process.exit(1);
}

console.log(`\n✅ COMPATIBLE — ${newName} is a safe UUPS upgrade target for ${oldName}.\n`);
