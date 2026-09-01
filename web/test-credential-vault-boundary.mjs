import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const boundary = read('./src/components/CredentialVaultBoundary.jsx');
const app = read('./src/App.jsx');

test('credential vault starts automatically for the authenticated player', () => {
  assert.match(boundary, /const token = player\?\.token \|\| \(typeof window !== 'undefined' \? window\._playerToken : null\)/u);
  assert.match(boundary, /credentialVault\.begin\(\{ token, playerId \}\)/u);
  assert.match(boundary, /\}, \[token, playerId, guest\]\)/u);
  assert.match(app, /<CredentialVaultBoundary><GameUI\s*\/><\/CredentialVaultBoundary>/u);
});

test('healthy production sync has no persistent synced badge', () => {
  assert.doesNotMatch(boundary, /Trading keys ·|verify to sync/u);
  assert.match(boundary, /const needsAttention = state\.pending > 0[\s\S]*?state\.candidates\.length > 0[\s\S]*?state\.conflicts\.length > 0[\s\S]*?!!state\.error/u);
  assert.match(boundary, /const showManager = import\.meta\.env\.DEV \|\| needsAttention/u);
  assert.match(boundary, /\{showManager && <button/u);
});
