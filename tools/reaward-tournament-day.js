#!/usr/bin/env node
'use strict';

const path = require('path');

const tournamentId = Number(process.argv.find(v => v.startsWith('--tournament='))?.split('=')[1] || 0);
const day = String(process.argv.find(v => v.startsWith('--day='))?.split('=')[1] || '');
if (!tournamentId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  throw new Error('Use --tournament=<id> --day=YYYY-MM-DD');
}

const dbModule = process.env.CLASH_DB_MODULE || path.join(__dirname, '..', 'server', 'db.js');
const db = require(dbModule);
const result = db.awardTournamentDailyPoolDay(tournamentId, day, { force: true });
console.log(JSON.stringify(result, null, 2));
