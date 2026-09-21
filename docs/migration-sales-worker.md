# Migration sales worker

Local implementation; not installed or activated on production by this task.

## What it sells

Only unsold CLASH from migration requests whose destination payout is finalized (`paid`). It never sells the full wallet balance just because tokens are present. The main API must remain running to reconcile deposits and payouts.

Existing admin settings control batch size, idle time and maximum slippage. Defaults: $400 batches, then $100 residual batches after ten minutes. **Every new sale requires at least $100 estimated input value**, even after the timer expires. A smaller final remainder waits for more eligible deposits or a higher market valuation. Batch settings below $100 are rejected. The script checks the finalized CLASH ATA and at least 0.01 SOL for gas. Missing tokens, gas, price data or finalized payout means waiting, not a forced sale. The $100 floor is based on the validated CLASH/USD price, not guaranteed net SOL proceeds after slippage and fees.

Simulation starts at 0.5% (or a lower configured starting value), then 1%, 2%, 5%, and only up to the configured cap (hard ceiling 10%). Each step uses a fresh quote. Only a Jupiter slippage simulation error allows escalation; network errors, other failures and uncertain sends do not. Each new batch starts low again.

## Read-only check

From the repository root, with the existing runtime environment configured:

```sh
node server/migration_sales_worker.js --db /absolute/path/to/clash.db --once
```

Omit `--once` to keep checking every 15 seconds. `--interval-ms` accepts 10000–300000. `CLASH_MAIN_DB` may supply the absolute DB path instead of `--db`. Use the actual shared DB, not a stale release-local copy. On Windows pass a quoted absolute Windows path.

The default mode opens SQLite read-only, does not read private keys, and never simulates, signs or sends. A `ready` preview is a batch plan, not a successful quote, simulation or guaranteed fill. It can become stale if another worker acts.

## Owner-controlled execution

After deployment/review, the owner can explicitly run:

```sh
node server/migration_sales_worker.js --db /absolute/path/to/clash.db --execute
```

This is a real financial execution mode, not a dry run. It uses the existing encrypted Solana/Jupiter credentials and migration master-key file (`MIGRATION_KEY_FILE`, or beside the resolved DB), plus existing paid Alchemy environment settings. Do not pass a seed, private key or API key on the command line or put one in this file. It does not change the migration `enabled` setting; when disabled it waits and may reconcile already-confirmed sales but never broadcasts.

The standalone and embedded workers share the same durable lease and sales table. There is no need to run both for throughput. Do not run this script against a copied DB or separate writable database for the same treasury. The runner performs sales only, not user payouts.

`--once --execute` means one state-machine cycle: it may persist a signed sale without broadcasting. Normal continuous operation broadcasts the persisted bytes on a following cycle. A crash/restart retries identical bytes, not a new trade.

## Stop and recovery

- Ctrl+C/SIGTERM stops this runner after the current awaited operation, preserving pending records.
- It does **not** pause the existing embedded API worker. To stop new migration financial activity, use the existing admin emergency pause (`enabled=false`); already-broadcast transactions can still land.
- `review` or `SALE_REQUIRES_RECONCILIATION` means inspect the existing transaction. Do not delete the sale, clear sold balances or create a replacement while its outcome is uncertain.
- API/provider failure logs back off up to five minutes in this CLI. Raw provider exceptions, signed transactions, private keys and credential URLs are not printed.

## Output

JSON state-change records include mode, timestamp, reason, integer base-unit balances, eligible amount, selected batch, sale ID/hash and slippage when applicable. CLASH uses 6 decimals; SOL uses 9. Common wait reasons: `MIGRATION_PAUSED`, `NO_PAID_LOTS`, `BATCH_THRESHOLD_WAIT`, `SALE_BELOW_MINIMUM`, `SALE_BALANCE_UNAVAILABLE`, `SOL_GAS_REQUIRED`. `NO_PAID_LOTS` can mean deposits/payouts are still awaiting finality despite tokens appearing in a wallet.

## Local verification

```sh
node --test server/test-migration.js server/test-migration-chain.js server/test-migration-http.js server/test-migration-sales.js
```

These tests use isolated databases, generated test keys and mocked chain responses. They do not submit a funded transaction.
