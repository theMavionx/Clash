#!/usr/bin/env node
'use strict';

// Idempotent MM-bot entitlement rollout. It only targets human player rows;
// simulated raid bots are deliberately excluded by server/db.js.
//
// Usage:
//   node deploy/grant-mm-bots-access.js --dry-run
//   node deploy/grant-mm-bots-access.js --apply

const path = require('path');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
if (!apply && !args.has('--dry-run')) {
  console.error('Use --dry-run to inspect coverage or --apply to grant access.');
  process.exitCode = 2;
  return;
}

const explicitDbIndex = process.argv.indexOf('--db');
if (explicitDbIndex >= 0) {
  const dbPath = String(process.argv[explicitDbIndex + 1] || '').trim();
  if (!dbPath) {
    console.error('--db requires a path');
    process.exitCode = 2;
    return;
  }
  process.env.CLASH_MAIN_DB = path.resolve(dbPath);
}

const db = require('../server/db');
const result = db.grantMmBotsToAllRealPlayers({
  apply,
  note: 'Automatic MM bot access rollout',
});

console.log(JSON.stringify({
  action: apply ? 'applied' : 'dry_run',
  ...result,
}, null, 2));
