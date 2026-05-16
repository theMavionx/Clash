import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv, NFT_DIR, ROOT } from './lib-env.mjs';

const env = loadEnv();
const rootEnvPath = path.join(ROOT, '.env');
const solanaDeploymentPath = path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
const solanaDeployment = fs.existsSync(solanaDeploymentPath)
  ? JSON.parse(fs.readFileSync(solanaDeploymentPath, 'utf8'))
  : {};

const defaults = {
  NFT_BRIDGE_MEMO_SECRET: env.NFT_BRIDGE_MEMO_SECRET || crypto.randomBytes(32).toString('hex'),
  NFT_BRIDGE_SOLANA_TREASURY:
    env.NFT_BRIDGE_SOLANA_TREASURY
    || env.NFT_SOLANA_TREASURY
    || solanaDeployment.treasury
    || '',
  NFT_BRIDGE_FEE_USD_E6: env.NFT_BRIDGE_FEE_USD_E6 || '200000',
  NFT_BRIDGE_BASE_FEE_WEI: env.NFT_BRIDGE_BASE_FEE_WEI || '100000000000000',
  NFT_BRIDGE_ARBITRUM_FEE_WEI: env.NFT_BRIDGE_ARBITRUM_FEE_WEI || '100000000000000',
  NFT_BRIDGE_MONAD_FEE_WEI: env.NFT_BRIDGE_MONAD_FEE_WEI || '6000000000000000000',
  NFT_BRIDGE_APTOS_FEE_OCTAS: env.NFT_BRIDGE_APTOS_FEE_OCTAS || '21000000',
  NFT_BRIDGE_SOLANA_FEE_LAMPORTS: env.NFT_BRIDGE_SOLANA_FEE_LAMPORTS || '2400000',
};

function updateEnvFile(file, entries) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set();
  const next = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!(key in entries)) return line;
    seen.add(key);
    return `${key}=${entries[key]}`;
  });
  for (const [key, value] of Object.entries(entries)) {
    if (!value) continue;
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  fs.writeFileSync(file, `${next.join('\n').replace(/\n+$/, '')}\n`);
}

updateEnvFile(rootEnvPath, defaults);

console.log('[bridge-env] wrote root .env bridge settings');
console.log('[bridge-env] NFT_BRIDGE_MEMO_SECRET=set');
console.log(`[bridge-env] NFT_BRIDGE_SOLANA_TREASURY=${defaults.NFT_BRIDGE_SOLANA_TREASURY ? 'set' : 'missing'}`);
console.log('[bridge-env] fee envs=set');
