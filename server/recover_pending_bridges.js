const { db } = require('./db');

const DEFAULT_API_BASE =
  process.env.BRIDGE_API_BASE
  || process.env.NFT_BRIDGE_API_BASE
  || 'http://127.0.0.1:4000/api';

function printUsage() {
  console.log(`Usage: node recover_pending_bridges.js [options]

Options:
  --execute              Actually call /bridge/relay. Default is dry-run.
  --api=<url>            API base URL. Default: ${DEFAULT_API_BASE}
  --limit=<n>            Max pending rows to process. Default: 50.
  --min-age-sec=<n>      Only retry log-only failures older than this. Default: 90.
  --source=<chain>       Filter by source chain.
  --dest=<chain>         Filter by destination chain.
  --tx=<hash>            Filter by burn transaction hash.
  --no-log-errors        Only retry rows already reserved in used_bridge_refs.
  --help                 Show this help.

Examples:
  node recover_pending_bridges.js --limit=10
  node recover_pending_bridges.js --execute --tx=0xabc...
  node recover_pending_bridges.js --execute --api=http://127.0.0.1:4000/api
`);
}

function parseArgs(argv) {
  const opts = {
    execute: false,
    apiBase: DEFAULT_API_BASE,
    limit: 50,
    minAgeSec: 90,
    source: null,
    dest: null,
    tx: null,
    includeLogErrors: true,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--execute') opts.execute = true;
    else if (arg === '--dry-run') opts.execute = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--api=')) opts.apiBase = arg.slice('--api='.length);
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--min-age-sec=')) opts.minAgeSec = Number(arg.slice('--min-age-sec='.length));
    else if (arg.startsWith('--source=')) opts.source = arg.slice('--source='.length).toLowerCase();
    else if (arg.startsWith('--dest=')) opts.dest = arg.slice('--dest='.length).toLowerCase();
    else if (arg.startsWith('--tx=')) opts.tx = arg.slice('--tx='.length);
    else if (arg === '--no-log-errors') opts.includeLogErrors = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 1000) {
    throw new Error('--limit must be an integer between 1 and 1000');
  }
  if (!Number.isInteger(opts.minAgeSec) || opts.minAgeSec < 0 || opts.minAgeSec > 86_400) {
    throw new Error('--min-age-sec must be an integer between 0 and 86400');
  }
  opts.apiBase = String(opts.apiBase || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(opts.apiBase)) {
    throw new Error('--api must be an http(s) URL');
  }
  return opts;
}

function pendingBridgeRows(opts) {
  const where = ['dest_tx_or_asset IS NULL'];
  const params = [];

  if (opts.source) {
    where.push('source_chain = ?');
    params.push(opts.source);
  }
  if (opts.dest) {
    where.push('dest_chain = ?');
    params.push(opts.dest);
  }
  if (opts.tx) {
    where.push('burn_tx_hash = ?');
    params.push(opts.tx);
  }

  params.push(opts.limit);
  return db.prepare(`
    SELECT source_ref, dest_chain, source_chain, burn_tx_hash, dest_address, level, created_at
      FROM used_bridge_refs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ?
  `).all(...params).map((row) => ({ ...row, retry_source: 'ledger' }));
}

function bridgeLogIsRetryable(row) {
  const text = `${row.error || ''} ${row.data || ''}`.toLowerCase();
  if (!text) return false;
  if (/(malformed|unsupported|sourcechain == destchain|destinationchainid|destaddress|memo destaddress|under-paid|under paid|bridgeburn event not in tx logs|reverted|already bridged|sourceref already)/i.test(text)) {
    return false;
  }
  return /(need 2 confirmations|rate limited|http 425|http 429|burn tx not found|timed out|timeout|fetch failed|econn|socket|network|http 502|http 503|http 504|dest tx failed)/i.test(text);
}

function retryableBridgeLogRows(opts) {
  if (!opts.includeLogErrors) return [];

  const where = [
    "l.phase = 'relay'",
    "l.status = 'error'",
    'l.burn_tx_hash IS NOT NULL',
    "l.burn_tx_hash != ''",
    'l.dest_address IS NOT NULL',
    "l.dest_address != ''",
    "l.created_at <= datetime('now', ?)",
    `NOT EXISTS (
       SELECT 1 FROM used_bridge_refs u
        WHERE u.burn_tx_hash = l.burn_tx_hash
          AND u.dest_chain = l.dest_chain
          AND u.dest_tx_or_asset IS NOT NULL
     )`,
    `NOT EXISTS (
       SELECT 1 FROM bridge_logs ok
        WHERE ok.phase = 'relay'
          AND ok.status = 'ok'
          AND ok.burn_tx_hash = l.burn_tx_hash
          AND ok.dest_chain = l.dest_chain
          AND ok.created_at >= l.created_at
     )`,
  ];
  const params = [`-${opts.minAgeSec} seconds`];

  if (opts.source) {
    where.push('l.source_chain = ?');
    params.push(opts.source);
  }
  if (opts.dest) {
    where.push('l.dest_chain = ?');
    params.push(opts.dest);
  }
  if (opts.tx) {
    where.push('l.burn_tx_hash = ?');
    params.push(opts.tx);
  }

  params.push(Math.max(opts.limit * 5, 50));
  const rows = db.prepare(`
    SELECT l.source_chain, l.dest_chain, l.burn_tx_hash, l.dest_address,
           COALESCE(l.level, 1) AS level,
           MIN(l.created_at) AS created_at,
           MAX(l.error) AS error,
           MAX(l.data) AS data,
           COUNT(*) AS error_count
      FROM bridge_logs l
     WHERE ${where.join(' AND ')}
     GROUP BY l.source_chain, l.dest_chain, l.burn_tx_hash, l.dest_address
     ORDER BY MAX(l.created_at) DESC
     LIMIT ?
  `).all(...params);

  return rows
    .filter(bridgeLogIsRetryable)
    .map((row) => ({
      source_ref: null,
      dest_chain: row.dest_chain,
      source_chain: row.source_chain,
      burn_tx_hash: row.burn_tx_hash,
      dest_address: row.dest_address,
      level: row.level || 1,
      created_at: row.created_at,
      retry_source: 'bridge_logs',
      error_count: row.error_count,
      last_error: row.error,
    }));
}

function pendingBridgeRowsAll(opts) {
  const merged = [];
  const seen = new Set();
  for (const row of [...pendingBridgeRows(opts), ...retryableBridgeLogRows(opts)]) {
    const key = [
      row.source_chain,
      row.dest_chain,
      String(row.burn_tx_hash || '').toLowerCase(),
      String(row.dest_address || '').toLowerCase(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= opts.limit) break;
  }
  return merged;
}

async function relayRow(apiBase, row) {
  const body = {
    sourceChain: row.source_chain,
    destChain: row.dest_chain,
    burnTxHash: row.burn_tx_hash,
    destAddress: row.dest_address,
  };

  const response = await fetch(`${apiBase}/bridge/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return {
    ok: response.ok && !json?.error,
    status: response.status,
    body,
    response: json || text,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }

  await runRecovery(opts, {
    log: console.log,
    error: console.error,
  });
}

async function runRecovery(opts, logger = console) {
  const rows = pendingBridgeRowsAll(opts);
  logger.log?.(`[bridge-recover] retry rows: ${rows.length}`);
  const summary = { total: rows.length, ok: 0, failed: 0, dryRun: !opts.execute, rows: [] };
  if (!rows.length) return summary;

  for (const [index, row] of rows.entries()) {
    const prefix = `[${index + 1}/${rows.length}] ${row.source_chain}->${row.dest_chain}`;
    logger.log?.(`${prefix} source=${row.retry_source} burn=${row.burn_tx_hash} dest=${row.dest_address} level=${row.level} created=${row.created_at}`);
    if (!opts.execute) {
      logger.log?.(`  dry-run POST ${opts.apiBase}/bridge/relay ${JSON.stringify({
        sourceChain: row.source_chain,
        destChain: row.dest_chain,
        burnTxHash: row.burn_tx_hash,
        destAddress: row.dest_address,
      })}`);
      summary.rows.push({ row, ok: null, dryRun: true });
      continue;
    }

    try {
      const result = await relayRow(opts.apiBase, row);
      if (result.ok) {
        logger.log?.(`  ok status=${result.status} ${JSON.stringify(result.response)}`);
        summary.ok += 1;
      } else {
        logger.error?.(`  failed status=${result.status} ${JSON.stringify(result.response)}`);
        summary.failed += 1;
        if (opts.setExitCodeOnFailure !== false) process.exitCode = 1;
      }
      summary.rows.push({ row, ok: result.ok, status: result.status, response: result.response });
    } catch (err) {
      logger.error?.(`  failed ${err?.message || err}`);
      summary.failed += 1;
      summary.rows.push({ row, ok: false, error: err?.message || String(err) });
      if (opts.setExitCodeOnFailure !== false) process.exitCode = 1;
    }
  }

  if (!opts.execute) {
    logger.log?.('[bridge-recover] dry-run only. Re-run with --execute when the API server is live and relayer wallets are funded.');
  }
  return summary;
}

if (require.main === module) {
  main().finally(() => {
    try { db.close(); } catch {}
  });
}

module.exports = {
  parseArgs,
  pendingBridgeRows,
  retryableBridgeLogRows,
  pendingBridgeRowsAll,
  relayRow,
  runRecovery,
};
