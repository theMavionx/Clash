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
  --source=<chain>       Filter by source chain.
  --dest=<chain>         Filter by destination chain.
  --tx=<hash>            Filter by burn transaction hash.
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
    source: null,
    dest: null,
    tx: null,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--execute') opts.execute = true;
    else if (arg === '--dry-run') opts.execute = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--api=')) opts.apiBase = arg.slice('--api='.length);
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--source=')) opts.source = arg.slice('--source='.length).toLowerCase();
    else if (arg.startsWith('--dest=')) opts.dest = arg.slice('--dest='.length).toLowerCase();
    else if (arg.startsWith('--tx=')) opts.tx = arg.slice('--tx='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 1000) {
    throw new Error('--limit must be an integer between 1 and 1000');
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
     ORDER BY created_at ASC
     LIMIT ?
  `).all(...params);
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

  const rows = pendingBridgeRows(opts);
  console.log(`[bridge-recover] pending rows: ${rows.length}`);
  if (!rows.length) return;

  for (const [index, row] of rows.entries()) {
    const prefix = `[${index + 1}/${rows.length}] ${row.source_chain}->${row.dest_chain}`;
    console.log(`${prefix} burn=${row.burn_tx_hash} dest=${row.dest_address} level=${row.level} created=${row.created_at}`);
    if (!opts.execute) {
      console.log(`  dry-run POST ${opts.apiBase}/bridge/relay ${JSON.stringify({
        sourceChain: row.source_chain,
        destChain: row.dest_chain,
        burnTxHash: row.burn_tx_hash,
        destAddress: row.dest_address,
      })}`);
      continue;
    }

    try {
      const result = await relayRow(opts.apiBase, row);
      if (result.ok) {
        console.log(`  ok status=${result.status} ${JSON.stringify(result.response)}`);
      } else {
        console.error(`  failed status=${result.status} ${JSON.stringify(result.response)}`);
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`  failed ${err?.message || err}`);
      process.exitCode = 1;
    }
  }

  if (!opts.execute) {
    console.log('[bridge-recover] dry-run only. Re-run with --execute when the API server is live and relayer wallets are funded.');
  }
}

main().finally(() => {
  try { db.close(); } catch {}
});
