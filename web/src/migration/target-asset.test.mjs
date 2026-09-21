import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { targetRatio, targetSymbol } from './target-asset.js';
test('payout labels use immutable target token and explicit USDG rate', () => {
  const address = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
  assert.equal(targetSymbol(address.toLowerCase()), 'USDG');
  assert.equal(targetSymbol('0x1111111111111111111111111111111111111111'), 'CLASH');
  assert.equal(targetRatio(address, '0.001'), '1000 CLASH = 1 USDG');
  assert.equal(targetRatio(address, '0.002'), '1 CLASH = 0.002 USDG');
  assert.equal(targetRatio('', '1'), '1 CLASH = 1 CLASH');
});
test('release staging explicitly packages public migration metadata', () => {
  const script = readFileSync(new URL('../../../deploy/deploy.sh', import.meta.url), 'utf8');
  assert.ok(script.includes('install -p -m 0644 "$SOURCE_DIR/shared/migration-assets.json"'));
  assert.ok(script.includes('[ -f "$RELEASE_DIR/shared/migration-assets.json" ]'));
});
