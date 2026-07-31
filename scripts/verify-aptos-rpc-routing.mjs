import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runtimeFiles(relativeDir, extensions) {
  const root = path.join(repoRoot, relativeDir);
  const rows = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (extensions.some(ext => entry.name.endsWith(ext))) rows.push(target);
    }
  };
  visit(root);
  return rows;
}

const mainServerFiles = runtimeFiles('server', ['.js'])
  .filter(file => !path.basename(file).startsWith('test-'))
  .filter(file => path.basename(file) !== 'aptos_api.js');

for (const file of mainServerFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(repoRoot, file);
  assert.doesNotMatch(
    source,
    /process\.env\.(?:APTOS_NODE_API_KEY|DECIBEL_API_KEY)\b/u,
    `${relative} bypasses the shared Aptos key pool`,
  );
  assert.doesNotMatch(
    source,
    /https:\/\/(?:fullnode|indexer)\.mainnet\.aptoslabs\.com/u,
    `${relative} hardcodes an Aptos RPC outside server/aptos_api.js`,
  );
  assert.doesNotMatch(
    source,
    /new\s+sdk\.Aptos\s*\(\s*new\s+sdk\.AptosConfig/u,
    `${relative} creates a single-key Aptos SDK client`,
  );
}

const browserFiles = runtimeFiles('web/src', ['.js', '.jsx']);
const browserRpcOwners = new Set([
  path.normalize('web/src/lib/aptosRpc.js'),
  path.normalize('web/src/hooks/useDecibel.js'),
  path.normalize('web/src/lib/decibel.js'),
]);
for (const file of browserFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.normalize(path.relative(repoRoot, file));
  if (!browserRpcOwners.has(relative)) {
    assert.doesNotMatch(
      source,
      /https:\/\/(?:fullnode|indexer)\.mainnet\.aptoslabs\.com/u,
      `${relative} hardcodes an Aptos browser RPC outside the shared routing modules`,
    );
  }
}

for (const relative of [
  'server/routes.js',
  'server/bridge_helpers.js',
  'server/custodial_marketplace.js',
  'server/nft_v3_endpoints.js',
]) {
  const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  assert.match(source, /fetchWithAptosKeys/u, `${relative} is not using shared Aptos fetch`);
}

console.log('Aptos RPC routing verification passed');
