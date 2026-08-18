const assert = require('assert/strict');
const Database = require('better-sqlite3');
const { Keypair } = require('@solana/web3.js');
const {
  createSanctumRewardsService,
  rewardGoldForBalance,
} = require('./sanctum_rewards');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      name TEXT,
      gold INTEGER NOT NULL DEFAULT 0,
      wood INTEGER NOT NULL DEFAULT 0,
      ore INTEGER NOT NULL DEFAULT 0,
      is_bot INTEGER NOT NULL DEFAULT 0,
      last_activity_at TEXT
    );
    CREATE TABLE player_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      chain_type TEXT NOT NULL,
      address TEXT NOT NULL,
      label TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chain_type, address)
    );
    CREATE TABLE sanctum_reward_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled INTEGER NOT NULL DEFAULT 1,
      gold_per_clashsol INTEGER NOT NULL,
      effective_day_utc TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sanctum_daily_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      wallet TEXT NOT NULL,
      reward_day_utc TEXT NOT NULL,
      balance_atomics TEXT NOT NULL,
      token_decimals INTEGER NOT NULL DEFAULT 9,
      gold_per_clashsol INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      claimed_gold INTEGER NOT NULL DEFAULT 0,
      rpc_slot INTEGER,
      status TEXT NOT NULL,
      claimed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, reward_day_utc),
      UNIQUE(wallet, reward_day_utc)
    );
    CREATE TABLE sanctum_reward_wallets (
      player_id TEXT PRIMARY KEY REFERENCES players(id),
      wallet TEXT NOT NULL UNIQUE,
      verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sanctum_balance_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      wallet TEXT NOT NULL,
      observed_day_utc TEXT NOT NULL,
      sample_bucket INTEGER NOT NULL,
      balance_atomics TEXT NOT NULL,
      rpc_slot INTEGER,
      observed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(wallet, observed_day_utc, sample_bucket)
    );
    CREATE TABLE sanctum_snapshot_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT REFERENCES players(id),
      wallet TEXT,
      observed_day_utc TEXT NOT NULL,
      sample_bucket INTEGER NOT NULL,
      result TEXT NOT NULL,
      error TEXT,
      rpc_slot INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sanctum_order_intents (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'stake',
      input_mint TEXT NOT NULL,
      output_mint TEXT NOT NULL,
      input_amount TEXT NOT NULL,
      output_amount TEXT NOT NULL,
      slippage_bps INTEGER NOT NULL,
      status TEXT NOT NULL,
      tx_signature TEXT,
      consumed_at TEXT,
      last_error TEXT,
      last_error_code TEXT,
      last_error_stage TEXT,
      submitted_at TEXT,
      confirmed_at TEXT,
      confirmation_status TEXT,
      confirmation_slot INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE resource_delta_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      gold_delta INTEGER NOT NULL,
      wood_delta INTEGER NOT NULL,
      ore_delta INTEGER NOT NULL,
      gold_before INTEGER NOT NULL,
      wood_before INTEGER NOT NULL,
      ore_before INTEGER NOT NULL,
      gold_after INTEGER NOT NULL,
      wood_after INTEGER NOT NULL,
      ore_after INTEGER NOT NULL,
      gold_cap_before INTEGER NOT NULL,
      wood_cap_before INTEGER NOT NULL,
      ore_cap_before INTEGER NOT NULL,
      gold_cap_after INTEGER NOT NULL,
      wood_cap_after INTEGER NOT NULL,
      ore_cap_after INTEGER NOT NULL,
      lost_gold_to_cap INTEGER NOT NULL,
      lost_wood_to_cap INTEGER NOT NULL,
      lost_ore_to_cap INTEGER NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO sanctum_reward_settings
      (enabled, gold_per_clashsol, effective_day_utc, changed_by)
    VALUES (1, 2000, '2026-08-18', 'seed');
  `);
  return db;
}

async function expectCode(promiseOrFn, code) {
  await assert.rejects(
    async () => (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn),
    error => {
      assert.equal(error?.code, code);
      return true;
    },
  );
}

async function run() {
  assert.equal(rewardGoldForBalance('1250000000', 2000), 2500);
  assert.equal(rewardGoldForBalance('999999999', 2000), 1999);
  assert.equal(rewardGoldForBalance('999999999999999999999999', 1_000_000), 1_000_000_000);

  const isolationDb = makeDb();
  const isolationWallets = [Keypair.generate().publicKey.toBase58(), Keypair.generate().publicKey.toBase58()];
  isolationDb.prepare('INSERT INTO players (id, name, gold) VALUES (?, ?, 0)').run('huge-holder', 'Huge Holder');
  isolationDb.prepare('INSERT INTO players (id, name, gold) VALUES (?, ?, 0)').run('normal-holder', 'Normal Holder');
  isolationDb.prepare(`
    INSERT INTO sanctum_balance_observations
      (player_id, wallet, observed_day_utc, sample_bucket, balance_atomics, rpc_slot, observed_at)
    VALUES
      ('huge-holder', ?, '2026-08-17', 8, '999999999999999999999999', 1, '2026-08-17 04:00:00'),
      ('huge-holder', ?, '2026-08-17', 24, '999999999999999999999999', 2, '2026-08-17 12:00:00'),
      ('normal-holder', ?, '2026-08-17', 8, '1000000000', 3, '2026-08-17 04:00:00'),
      ('normal-holder', ?, '2026-08-17', 24, '1000000000', 4, '2026-08-17 12:00:00')
  `).run(isolationWallets[0], isolationWallets[0], isolationWallets[1], isolationWallets[1]);
  const isolationService = createSanctumRewardsService({
    db: isolationDb,
    now: () => Date.parse('2026-08-18T00:05:00.000Z'),
    getResourceCaps: () => ({ gold: 2_000_000_000, wood: 10_000, ore: 10_000 }),
    readBalance: async () => ({ balanceAtomics: '0', slot: 1 }),
  });
  const isolatedFinalization = isolationService.finalizeCompletedRewards();
  assert.equal(isolatedFinalization.created, 2, 'one oversized holder must not block other wallets');
  assert.equal(
    isolationDb.prepare('SELECT reward_gold FROM sanctum_daily_rewards WHERE player_id = ?').get('huge-holder').reward_gold,
    1_000_000_000,
  );
  assert.equal(
    isolationDb.prepare('SELECT reward_gold FROM sanctum_daily_rewards WHERE player_id = ?').get('normal-holder').reward_gold,
    2000,
  );

  const raceDb = makeDb();
  const raceWalletA = Keypair.generate().publicKey.toBase58();
  const raceWalletB = Keypair.generate().publicKey.toBase58();
  raceDb.prepare('INSERT INTO players (id, name, gold) VALUES (?, ?, 0)').run('race-player', 'Race Player');
  let releaseBalanceRead;
  const delayedBalance = new Promise(resolve => { releaseBalanceRead = resolve; });
  const raceService = createSanctumRewardsService({
    db: raceDb,
    now: () => Date.parse('2026-08-18T12:00:00.000Z'),
    getResourceCaps: () => ({ gold: 10_000, wood: 10_000, ore: 10_000 }),
    readBalance: async () => delayedBalance,
  });
  raceService.linkRewardWallet({ playerId: 'race-player', wallet: raceWalletA });
  const staleObservation = raceService.recordBalanceObservation({
    playerId: 'race-player',
    wallet: raceWalletA,
    observedAt: Date.parse('2026-08-18T04:00:00.000Z'),
  });
  raceService.linkRewardWallet({ playerId: 'race-player', wallet: raceWalletB });
  releaseBalanceRead({ balanceAtomics: '1000000000', slot: 42 });
  await expectCode(staleObservation, 'WALLET_CHANGED_DURING_READ');
  assert.equal(
    raceDb.prepare('SELECT COUNT(*) AS count FROM sanctum_balance_observations WHERE player_id = ?').get('race-player').count,
    0,
    'a stale in-flight RPC result must not be stored after the reward wallet changes',
  );

  const db = makeDb();
  const wallets = [0, 1, 2, 3].map(() => Keypair.generate().publicKey.toBase58());
  db.prepare('INSERT INTO players (id, name, gold, wood, ore) VALUES (?, ?, ?, 5, 6)')
    .run('p1', 'Holder One', 100);
  db.prepare(`INSERT INTO player_wallets (player_id, chain_type, address, is_primary) VALUES (?, 'solana', ?, 1)`)
    .run('p1', wallets[0]);

  let currentNow = Date.parse('2026-08-18T12:00:00.000Z');
  let reads = 0;
  const balances = new Map([
    [wallets[0], '1250000000'],
    [wallets[1], '500000000'],
    [wallets[2], '100000000'],
    [wallets[3], '200000000'],
  ]);
  const service = createSanctumRewardsService({
    db,
    now: () => currentNow,
    getResourceCaps: playerId => ({ gold: playerId === 'p2' ? 1_000 : 10_000, wood: 10_000, ore: 10_000 }),
    readBalance: async wallet => {
      reads += 1;
      return { balanceAtomics: balances.get(wallet) || '0', slot: 12345 + reads };
    },
  });

  service.linkRewardWallet({ playerId: 'p1', wallet: wallets[0] });
  const beforeObservations = await service.getPlayerStatus({ playerId: 'p1', wallet: wallets[0] });
  assert.equal(beforeObservations.linked, true);
  assert.equal(beforeObservations.today, null);
  assert.equal(beforeObservations.pending_gold, 0);
  assert.equal(reads, 0, 'opening status must never create an instant reward snapshot');

  await service.recordBalanceObservation({
    playerId: 'p1', wallet: wallets[0], observedAt: Date.parse('2026-08-18T05:00:00.000Z'),
  });
  balances.set(wallets[0], '750000000');
  await service.recordBalanceObservation({
    playerId: 'p1', wallet: wallets[0], observedAt: Date.parse('2026-08-18T12:00:00.000Z'),
  });
  await expectCode(
    () => service.linkRewardWallet({ playerId: 'p1', wallet: wallets[1] }),
    'WALLET_SWITCH_LOCKED',
  );
  assert.equal(service.resolveLinkedWallet('p1'), wallets[0]);
  assert.equal(reads, 2);
  assert.equal(service.finalizeCompletedRewards().created, 0, 'current UTC day cannot mature early');
  currentNow = Date.parse('2026-08-19T00:05:00.000Z');
  const matured = await service.getPlayerStatus({ playerId: 'p1', wallet: wallets[0] });
  assert.equal(matured.pending_gold, 1500, 'daily Gold must use the lowest observed clashSOL balance');
  assert.equal(matured.pending_days, 1);

  const claim = service.claim({ playerId: 'p1' });
  assert.equal(claim.total, 1500);
  assert.equal(claim.resources.gold, 1600);
  assert.equal(db.prepare('SELECT gold FROM players WHERE id = ?').get('p1').gold, 1600);
  assert.equal(db.prepare('SELECT status FROM sanctum_daily_rewards WHERE player_id = ?').get('p1').status, 'claimed');
  assert.equal(db.prepare('SELECT gold_delta FROM resource_delta_events WHERE player_id = ?').get('p1').gold_delta, 1500);
  await expectCode(() => service.claim({ playerId: 'p1' }), 'NOTHING_TO_CLAIM');

  db.prepare('INSERT INTO players (id, name, gold) VALUES (?, ?, ?)').run('p2', 'Partial Storage', 900);
  db.prepare(`INSERT INTO player_wallets (player_id, chain_type, address, is_primary) VALUES (?, 'solana', ?, 1)`)
    .run('p2', wallets[1]);
  service.linkRewardWallet({ playerId: 'p2', wallet: wallets[1] });
  await service.recordBalanceObservation({
    playerId: 'p2', wallet: wallets[1], observedAt: Date.parse('2026-08-17T04:00:00.000Z'),
  });
  await service.recordBalanceObservation({
    playerId: 'p2', wallet: wallets[1], observedAt: Date.parse('2026-08-17T12:00:00.000Z'),
  });
  service.finalizeCompletedRewards();
  const full = await service.getPlayerStatus({ playerId: 'p2' });
  assert.equal(full.pending_gold, 1000);
  assert.equal(full.claimable_now, 100);
  const partial = service.claim({ playerId: 'p2' });
  assert.equal(partial.total, 100);
  assert.equal(partial.pending_remaining, 900);
  assert.equal(db.prepare('SELECT status FROM sanctum_daily_rewards WHERE player_id = ?').get('p2').status, 'ready');
  assert.equal(db.prepare('SELECT gold FROM players WHERE id = ?').get('p2').gold, 1000);
  assert.equal(db.prepare('SELECT claimed_gold FROM sanctum_daily_rewards WHERE player_id = ?').get('p2').claimed_gold, 100);
  await expectCode(() => service.claim({ playerId: 'p2' }), 'GOLD_STORAGE_FULL');
  db.prepare('UPDATE players SET gold = 0 WHERE id = ?').run('p2');
  const remainder = service.claim({ playerId: 'p2' });
  assert.equal(remainder.total, 900);
  assert.equal(remainder.pending_remaining, 0);

  const nextSettings = service.updateSettings({ enabled: true, goldPerClashSol: 3000, changedBy: 'admin:test' });
  assert.equal(nextSettings.current.gold_per_clashsol, 2000);
  assert.equal(nextSettings.next.gold_per_clashsol, 3000);
  assert.equal(nextSettings.next.effective_day_utc, '2026-08-20');
  assert.equal((await service.getPlayerStatus({ playerId: 'p2' })).settings.current.gold_per_clashsol, 2000);

  db.prepare('INSERT INTO players (id, name, gold) VALUES (?, ?, 0)').run('p3', 'Latest Wallet');
  db.prepare(`INSERT INTO player_wallets (player_id, chain_type, address, is_primary, updated_at) VALUES (?, 'solana', ?, 0, '2026-08-17 00:00:00')`)
    .run('p3', wallets[2]);
  db.prepare(`INSERT INTO player_wallets (player_id, chain_type, address, is_primary, updated_at) VALUES (?, 'solana', ?, 1, '2026-08-18 00:00:00')`)
    .run('p3', wallets[3]);
  service.linkRewardWallet({ playerId: 'p3', wallet: wallets[3] });
  const batch = await service.snapshotAllEligiblePlayers();
  assert.equal(batch.failed, 0);
  assert.equal(batch.created, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sanctum_snapshot_events WHERE result = 'success'").get().count, 3);
  const p3 = db.prepare('SELECT wallet, balance_atomics FROM sanctum_balance_observations WHERE player_id = ?').get('p3');
  assert.equal(p3.wallet, wallets[3]);
  assert.equal(p3.balance_atomics, '200000000');

  db.prepare(`
    INSERT INTO sanctum_order_intents (
      id, player_id, wallet, direction, input_mint, output_mint,
      input_amount, output_amount, slippage_bps, status, tx_signature, consumed_at
    ) VALUES ('swap-1', 'p1', ?, 'stake', 'SOL', 'clashSOL', '100', '99', 30, 'consumed', 'sig', datetime('now'))
  `).run(wallets[0]);
  const history = service.history({ playerId: 'p1' });
  assert.equal(history.items.some(item => item.type === 'gold' && item.status === 'claimed'), true);
  assert.equal(history.items.some(item => item.type === 'swap' && item.direction === 'stake'), true);
  const firstPage = service.history({ playerId: 'p1', limit: 1 });
  const secondPage = service.history({ playerId: 'p1', limit: 1, cursor: firstPage.next_cursor });
  assert.equal(firstPage.items.length, 1);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(`${firstPage.items[0].type}:${firstPage.items[0].id}`, `${secondPage.items[0].type}:${secondPage.items[0].id}`);
  const metrics = service.adminMetrics();
  assert.equal(metrics.settings.current.gold_per_clashsol, 2000);
  assert.equal(metrics.settings.next.gold_per_clashsol, 3000);
  assert.equal(Number(metrics.summary.issued_lifetime), 2500);
  assert.equal(Number(metrics.summary.swaps_complete), 1);
  assert.equal(service.adminExport({ dataset: 'rewards' }).length >= 2, true);
  assert.equal(service.adminExport({ dataset: 'observations' }).length >= 5, true);
  assert.equal(service.adminExport({ dataset: 'snapshot-events' }).length, 3);

  currentNow = Date.parse('2026-08-20T00:05:00.000Z');
  assert.equal(service.effectiveSettings().gold_per_clashsol, 3000);
  console.log('Sanctum reward tests passed: delayed minimum-balance accrual, partial capacity-safe claim, explicit reward wallet, next-day config, history and metrics.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
