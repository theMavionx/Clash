import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('global scrollbar matches the ClashBot control geometry and states', async () => {
  const css = await read('./src/components/FuturesTerminal.css');

  assert.match(css, /\*::\-webkit-scrollbar\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/s);
  assert.match(css, /\*::\-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent;/s);
  assert.match(css, /\*::\-webkit-scrollbar-thumb\s*\{[^}]*min-height:\s*44px;[^}]*border:\s*3px solid transparent;[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--terminal-scrollbar-thumb\);[^}]*background-clip:\s*padding-box;/s);
  assert.match(css, /\*::\-webkit-scrollbar-thumb:hover\s*\{[^}]*var\(--terminal-scrollbar-thumb-hover\)/s);
  assert.match(css, /\*::\-webkit-scrollbar-thumb:active\s*\{[^}]*var\(--terminal-scrollbar-thumb-active\)/s);
  assert.match(css, /\*::\-webkit-scrollbar-button,[\s\S]*display:\s*none;[\s\S]*width:\s*0;[\s\S]*height:\s*0;/);
  assert.match(css, /\.clash-scroll-hidden\s*\{[^}]*scrollbar-width:\s*none\s*!important;/s);
  assert.doesNotMatch(css, /terminal-scrollbar-(?:highlight|shade|shadow)/);
});

test('content panels expose the shared scrollbar while navigation rails hide it', async () => {
  const [battle, futures, tournament, leaderboard, profile] = await Promise.all([
    read('./src/components/BattleLogPanel.jsx'),
    read('./src/components/FuturesPanel.jsx'),
    read('./src/components/TournamentPanel.jsx'),
    read('./src/components/LeaderboardPanel.jsx'),
    read('./src/components/ProfileModal.jsx'),
  ]);

  assert.match(battle, /battle-log-filter-row clash-scroll-hidden/);
  assert.match(battle, /battle-log-body clash-scroll/);
  assert.match(futures, /futures-tabs-scroll clash-scroll-hidden/);
  assert.match(futures, /futures-market-strip clash-scroll-hidden/);
  assert.match(futures, /futures-panel-body futures-terminal-body/);
  assert.match(tournament, /className="clash-scroll-hidden" style=\{S\.dailyChips\}/);
  assert.match(tournament, /className="clash-scroll"/);
  assert.match(leaderboard, /className="clash-scroll"/);
  assert.match(profile, /className="clash-scroll"/);

  for (const source of [battle, futures, tournament, leaderboard, profile]) {
    assert.doesNotMatch(source, /scrollbarWidth:\s*['"]none['"]/);
  }
});

test('legacy component scrollbar skins no longer compete with the global theme', async () => {
  const [indexCss, futures, shop, mint] = await Promise.all([
    read('./src/index.css'),
    read('./src/components/FuturesPanel.jsx'),
    read('./src/components/ShopPanel.jsx'),
    read('./src/components/NftMintPanel.jsx'),
  ]);

  assert.doesNotMatch(indexCss, /\.shop-scroll::\-webkit-scrollbar/);
  assert.doesNotMatch(futures, /\.grad-scrollbar::\-webkit-scrollbar/);
  assert.doesNotMatch(shop, /\.grad-scrollbar::\-webkit-scrollbar/);
  assert.doesNotMatch(mint, /\.shop-scroll::\-webkit-scrollbar/);
});
