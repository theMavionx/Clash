import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./src/components/TournamentPanel.jsx', import.meta.url), 'utf8');

test('tournament modal is wider on desktop and bounded on tablet viewports', () => {
  assert.match(component, /className="tournament-modal" style=\{S\.modal\}/);
  assert.match(component, /modal:\s*\{[\s\S]*?width:\s*480,\s*maxWidth:\s*'calc\(100dvw - 32px\)'/);
  assert.match(component, /modal:\s*\{[\s\S]*?height:\s*'min\(88dvh, 620px\)'/);
  assert.doesNotMatch(component, /width:\s*380,\s*maxWidth:\s*'94vw'/);
});

test('phone layout keeps the full-width shell', () => {
  assert.match(component, /@media \(max-width: 600px\) \{[\s\S]*?\.tournament-modal \{[\s\S]*?width:\s*100dvw !important;[\s\S]*?max-width:\s*100dvw !important;/);
  assert.match(component, /\.tournament-modal \{[\s\S]*?height:\s*min\(620px, 85dvh\) !important;[\s\S]*?max-height:\s*min\(620px, 85dvh\) !important;[\s\S]*?left:\s*0 !important;[\s\S]*?transform:\s*translateY\(-50%\) !important;[\s\S]*?border-radius:\s*0 !important;/);
});

test('touch, tablet, and short-landscape layouts expose 44px controls and fields', () => {
  assert.match(component, /@media \(max-width: 899px\), \(max-height: 600px\) \{[\s\S]*?\.tournament-modal button \{[\s\S]*?min-height:\s*44px;/);
  assert.match(component, /\.tournament-modal input,[\s\S]*?\.tournament-modal select,[\s\S]*?\.tournament-modal textarea \{[\s\S]*?min-height:\s*44px;[\s\S]*?box-sizing:\s*border-box;/);
  assert.match(component, /\.tournament-modal__close \{[\s\S]*?min-width:\s*44px !important;[\s\S]*?min-height:\s*44px !important;/);
});

test('modal body remains the only vertical scroll owner', () => {
  assert.match(component, /className="clash-scroll"/);
  assert.match(component, /modal:\s*\{[\s\S]*?overflow:\s*'hidden'/);
  assert.match(component, /body:\s*\{[\s\S]*?minHeight:\s*0,[\s\S]*?overflowY:\s*'auto',\s*overflowX:\s*'hidden',[\s\S]*?overscrollBehavior:\s*'contain',[\s\S]*?WebkitOverflowScrolling:\s*'touch'/);
  assert.equal((component.match(/overflowY:\s*'auto'/g) || []).length, 1);
});

test('very narrow phones reflow dense tournament grids', () => {
  assert.match(component, /className="tournament-modal__ranked-summary-grid" style=\{S\.rankedSummaryGrid\}/);
  assert.match(component, /className="tournament-modal__daily-grid" style=\{S\.dailyGrid\}/);
  assert.match(component, /className="tournament-modal__lucky-grid" style=\{S\.luckyGrid\}/);
  assert.match(component, /@media \(max-width: 359px\) \{[\s\S]*?\.tournament-modal__ranked-summary-grid,[\s\S]*?\.tournament-modal__daily-grid \{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important;/);
  assert.match(component, /\.tournament-modal__lucky-grid \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) !important;/);
});

test('compact ranked, daily, reward, and leaderboard labels remain at least 10px', () => {
  for (const styleName of [
    'rankedSummaryLive',
    'rankedSummaryLocked',
    'rankedSummaryLabel',
    'dailyCompactLabel',
    'dailyMiniLabel',
    'dailyPlayerMeta',
    'statLabel',
    'topDexBadge',
  ]) {
    assert.match(component, new RegExp(`${styleName}: \\{[\\s\\S]*?fontSize: 10`));
  }
  assert.doesNotMatch(component, /fontSize:\s*[89](?:,|\b)/);
});
