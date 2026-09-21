"use strict";

// Owner-operated CLI. Importing this module does not start a worker.
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const { createMigration, MigrationError } = require("./migration_core");

/** Parse explicit operator flags; a typo must never select execution mode. */
function parseArgs(args) {
  const options = { execute: false, once: false, intervalMs: 15000 };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error("INVALID_ARGUMENTS");
    seen.add(flag);
    if (flag === "--execute") options.execute = true;
    else if (flag === "--once") options.once = true;
    else if (flag === "--help") options.help = true;
    else if (flag === "--db" || flag === "--interval-ms") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS");
      if (flag === "--db") options.dbPath = value;
      else {
        if (!/^\d+$/.test(value)) throw new Error("INVALID_ARGUMENTS");
        options.intervalMs = Number(value);
      }
    } else throw new Error("INVALID_ARGUMENTS");
  }
  if (!Number.isInteger(options.intervalMs) || options.intervalMs < 10000 ||
    options.intervalMs > 300000) throw new Error("INVALID_INTERVAL");
  return options;
}

function safeError(error) {
  return error instanceof MigrationError && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
    ? error.code : "WORKER_UNAVAILABLE";
}

/** Poll serially with state-change logs, bounded backoff and graceful cancellation. */
async function runWorker({ service, execute = false, once = false, intervalMs = 15000,
  signal, logger = record => console.log(JSON.stringify(record)),
  wait = (ms, signal) => sleep(ms, undefined, { signal }) }) {
  let previous, failures = 0;
  while (!signal?.aborted) {
    let result;
    try {
      result = await (execute ? service.tickSales() : service.salesPreview());
      failures = ["UPSTREAM_RETRY", "UPSTREAM_UNAVAILABLE", "PRICE_UNAVAILABLE"]
        .includes(result.reason) ? failures + 1 : 0;
    } catch (error) {
      result = { state: "error", reason: safeError(error) };
      failures++;
    }
    // Explicit field whitelist: never print raw tx, secrets, RPC URLs, provider
    // response bodies, stack traces or user deposit/payout records.
    const record = { component: "migration_sales", mode: execute ? "execute" : "check" };
    for (const field of ["state", "reason", "saleId", "hash", "treasury", "inputUnits",
      "tokenBalanceUnits", "solLamports", "eligibleUnits", "slippageBps", "maxSlippageBps",
      "nextEligibleAt"]) {
      if (result[field] !== undefined) record[field] = result[field];
    }
    const encoded = JSON.stringify(record);
    if (encoded !== previous) {
      try { logger({ at: new Date().toISOString(), ...record }); } catch { /* No settlement retry for logging failure. */ }
      previous = encoded;
    }
    if (once) return result;
    try {
      await wait(Math.min(300000, intervalMs * 2 ** Math.min(failures, 5)), signal);
    } catch (error) {
      if (signal?.aborted) break;
      throw error;
    }
  }
  return { state: "stopped" };
}

/** Open an existing ledger; default to a read-only connection with no key access. */
async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseArgs(args);
  if (options.help) {
    console.log("Migration sales: --db <absolute existing DB> [--once] [--interval-ms 15000] [--execute]\n" +
      "Default: read-only balance/eligibility checks; no signing, simulation or broadcast.\n" +
      "--execute: owner-controlled real sales of paid migration lots only. Requires enabled migration.\n" +
      "Uses existing encrypted treasury/Jupiter keys, admin batch thresholds and shared worker lease.\n" +
      "The main API must remain running to reconcile deposits/payouts. Ctrl+C stops this runner, not the embedded worker.");
    return;
  }
  const dbPath = options.dbPath || env.CLASH_MAIN_DB;
  if (!dbPath || !path.isAbsolute(dbPath) || !fs.existsSync(dbPath))
    throw new Error("EXISTING_ABSOLUTE_DB_REQUIRED");
  const Database = require("better-sqlite3");
  const { createMigrationChain } = require("./migration_chain");
  const db = new Database(dbPath, { readonly: !options.execute, fileMustExist: true });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    for (const table of ["migration_config", "migration_requests", "migration_sales", "migration_secrets"])
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
        throw new Error("MIGRATION_DB_REQUIRED");
    const service = createMigration({ db, chain: createMigrationChain(env),
      keyFile: env.MIGRATION_KEY_FILE || path.join(path.dirname(fs.realpathSync(dbPath)), "migration-master.key") });
    const result = await runWorker({ ...options, service, signal: controller.signal });
    if (result.state === "error") process.exitCode = 1;
    return result;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    db.close();
  }
}

if (require.main === module) main().catch(() => {
  console.error(JSON.stringify({ component: "migration_sales", state: "error",
    reason: "WORKER_START_FAILED", hint: "Check --help, database path, permissions and provider configuration. No secret details are logged." }));
  process.exitCode = 1;
});

module.exports = { parseArgs, runWorker, main };
