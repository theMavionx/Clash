import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./src/components/BattleLogPanel.jsx', import.meta.url), 'utf8');

test('battle log cards preserve their natural height inside the scroll column', () => {
  assert.match(
    source,
    /card:\s*\{[\s\S]*?flex:\s*['"]0 0 auto['"][\s\S]*?\},\s*summaryButton:/,
  );
  assert.match(
    source,
    /body:\s*\{[\s\S]*?minHeight:\s*0[\s\S]*?overflowY:\s*['"]auto['"]/,
  );
});

test('battle log summary remains a full-size accessible target without fixing card height', () => {
  const summaryStyle = source.match(/summaryButton:\s*\{([\s\S]*?)\n\s*\},\n\s*summaryGrid:/)?.[1] || '';

  assert.match(summaryStyle, /minHeight:\s*44/);
  assert.doesNotMatch(summaryStyle, /(?:^|[,\s])height:\s*\d/);
});
