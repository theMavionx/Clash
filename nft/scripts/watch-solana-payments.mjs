import { spawn } from 'node:child_process';
import path from 'node:path';
import { NFT_DIR } from './lib-env.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEntries(raw) {
  return String(raw || 'dragon:clash')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [collection = 'dragon', payment = 'clash'] = entry.split(':').map((part) => part.trim()).filter(Boolean);
      return { collection, payment };
    });
}

function runSync(entry) {
  return new Promise((resolve) => {
    const args = [
      path.join('scripts', 'sync-solana-token-payment.mjs'),
      `--collection=${entry.collection}`,
      `--payment=${entry.payment}`,
    ];
    const child = spawn(process.execPath, args, {
      cwd: NFT_DIR,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('exit', (code) => resolve(code || 0));
    child.on('error', (err) => {
      console.error(`[solana-payment-sync] spawn failed: ${err?.message || err}`);
      resolve(1);
    });
  });
}

async function tick(entries) {
  for (const entry of entries) {
    const code = await runSync(entry);
    if (code !== 0) {
      console.error(`[solana-payment-sync] ${entry.collection}:${entry.payment} exited with ${code}`);
    }
  }
}

const enabled = process.env.NFT_SOLANA_PAYMENT_SYNC_ENABLED !== '0';
if (!enabled) {
  console.log('[solana-payment-sync] disabled by NFT_SOLANA_PAYMENT_SYNC_ENABLED=0');
  process.exit(0);
}

const entries = parseEntries(process.env.NFT_SOLANA_PAYMENT_SYNC_COLLECTIONS);
const intervalMs = Math.max(60_000, Number(process.env.NFT_SOLANA_PAYMENT_SYNC_INTERVAL_MS || 300_000));
console.log(`[solana-payment-sync] watching ${entries.map((e) => `${e.collection}:${e.payment}`).join(', ')} every ${intervalMs}ms`);

while (true) {
  await tick(entries);
  if (process.env.NFT_SOLANA_PAYMENT_SYNC_RUN_ONCE === '1') break;
  await sleep(intervalMs);
}
