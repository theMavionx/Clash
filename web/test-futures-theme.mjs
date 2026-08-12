import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Futures theme is persisted and applied through a root data attribute', () => {
  const hook = read('src/hooks/useFuturesTheme.js');
  assert.match(hook, /clash:futures-theme:v1/u);
  assert.match(hook, /localStorage\.setItem\(FUTURES_THEME_STORAGE_KEY, theme\)/u);
  assert.match(hook, /document\.documentElement\.dataset\.futuresTheme/u);
  assert.match(hook, /window\.addEventListener\('storage'/u);
});

test('Profile exposes an accessible Light and Dark interface theme selector', () => {
  const profile = read('src/components/ProfileModal.jsx');
  assert.match(profile, /role="group" aria-label="Interface color theme"/u);
  assert.match(profile, /aria-pressed=\{futuresTheme === FUTURES_THEME_LIGHT\}/u);
  assert.match(profile, /aria-pressed=\{futuresTheme === FUTURES_THEME_DARK\}/u);
  assert.match(profile, /setFuturesTheme\(FUTURES_THEME_LIGHT\)/u);
  assert.match(profile, /setFuturesTheme\(FUTURES_THEME_DARK\)/u);
});

test('the complete Futures surface consumes the shared token contract', () => {
  const css = read('src/components/FuturesTerminal.css');
  for (const token of [
    '--terminal-canvas', '--terminal-surface', '--terminal-surface-subtle',
    '--terminal-border', '--terminal-text', '--terminal-text-muted',
    '--terminal-orange', '--terminal-long', '--terminal-short',
    '--terminal-loading-overlay', '--terminal-chart-grid',
  ]) {
    assert.match(css, new RegExp(`${token}:`, 'u'), `missing ${token}`);
  }
  assert.match(css, /:root\[data-futures-theme='dark'\]/u);

  const files = [
    'src/components/FuturesPanel.jsx', 'src/components/OrderBook.jsx',
    'src/components/EvmWalletModal.jsx', 'src/components/FilterPopup.jsx',
    'src/components/FundingHistory.jsx', 'src/components/FuturesModeSelect.jsx',
    'src/components/GoldRewardToast.jsx', 'src/components/QuestsTab.jsx',
    'src/components/RegisterPanel.jsx', 'src/components/TradeHistory.jsx',
    'src/components/TradeIdeaModal.jsx', 'src/components/WalletSessionRecovery.jsx',
    'src/components/basic/styles.js',
    'src/components/trading/OndoDepositNetworkSelector.jsx',
    'src/components/trading/TradingSetupGate.jsx',
  ];
  const legacyPalette = /#(?:fdf8e7|e8dfc8|d4c8b0|bba882|a3906a|77573d|5c3a21|fffaf0|ebdaba)\b/iu;
  for (const file of files) {
    assert.doesNotMatch(read(file), legacyPalette, `${file} still contains the legacy parchment palette`);
  }
});

test('canvas chart recreates with dedicated light and dark colors', () => {
  const chart = read('src/components/TradingViewWidget.jsx');
  assert.match(chart, /useFuturesTheme\(\)/u);
  assert.match(chart, /darkTheme \? '#111827' : '#FFFFFF'/u);
  assert.match(chart, /darkTheme \? '#34D399' : '#087A55'/u);
  assert.match(chart, /darkTheme \? '#F87171' : '#D14343'/u);
  assert.match(chart, /\}, \[darkTheme\]\);/u);
});
