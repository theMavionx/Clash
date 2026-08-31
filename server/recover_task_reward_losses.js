// Owner-operated repair: preview by default; only audited cap losses from one
// exact player/event boundary are reserved. Does not replay quests or trades.
const fs = require('fs');
const Database = require('better-sqlite3');
const { legacyTaskRewardLosses, createTaskRewardService } = require('./task_rewards');

function main(args) {
  const values = Object.fromEntries(args.filter(arg => arg.startsWith('--') && arg.includes('='))
    .map(arg => { const split = arg.indexOf('='); return [arg.slice(2, split), arg.slice(split + 1)]; }));
  const execute = args.includes('--execute');
  if (!values.db || !values.player || !values['through-event'] || (execute && !values.reason)) {
    throw new Error('Use --db=PATH --player=EXACT_ID --through-event=ID [--execute --reason=AUDIT_REASON]');
  }
  const db = new Database(fs.realpathSync(values.db), { readonly: !execute, fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(values.player);
    if (!player) throw new Error('Exact player not found');
    const boundary = Number(values['through-event']);
    const rows = legacyTaskRewardLosses(db, player.id, boundary);
    console.log(JSON.stringify({ mode: execute ? 'execute' : 'preview', player, rows }));
    if (execute) {
      // The deployed API must initialize the new tables before repair. No
      // unrelated db.js migrations or background jobs are run by this script.
      const service = createTaskRewardService({ db, initialize: false });
      console.log(JSON.stringify(service.recoverLegacy(player.id, boundary, values.reason)));
    }
  } finally { db.close(); }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
