import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function componentFiles(dir = path.join(root, 'src/components')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return componentFiles(file);
    if (!/\.(?:js|jsx|css)$/u.test(entry.name)) return [];
    if (entry.name === 'generateShareImage.js' || entry.name === 'FuturesTerminal.css') return [];
    return [file];
  });
}

test('the app root owns the shared visual and accessibility behavior', () => {
  const gameUi = read('src/components/GameUI.jsx');
  const css = read('src/components/FuturesTerminal.css');
  assert.match(gameUi, /className="clash-ui-root"/u);
  assert.match(css, /\.clash-ui-root button:focus-visible/u);
  assert.match(css, /\.clash-ui-root \[role="button"\]:focus-visible/u);
  assert.match(css, /:root\[data-ui-theme='dark'\]/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.doesNotMatch(gameUi, /FeedbackButton/u);
});

test('critical shared tokens exist in both light and dark themes', () => {
  const css = read('src/components/FuturesTerminal.css');
  for (const token of ['brand', 'brand-ring', 'text-disabled', 'shadow-card', 'icon', 'icon-active']) {
    const matches = css.match(new RegExp(`--terminal-${token}:`, 'gu')) || [];
    assert.equal(matches.length, 2, `--terminal-${token} must exist in light and dark themes`);
  }
});

test('button icons keep a stable palette across themes and pressed controls do not filter their contents', () => {
  const css = read('src/components/FuturesTerminal.css');
  const theme = read('src/styles/theme.js');
  const actions = read('src/components/ActionButtons.jsx');
  assert.equal((css.match(/--terminal-icon: #768399;/gu) || []).length, 2);
  assert.equal((css.match(/--terminal-icon-active: #F26522;/gu) || []).length, 2);
  assert.match(css, /\.clash-ui-root button > svg,[\s\S]*?color: var\(--terminal-button-icon, currentColor\);/u);
  assert.doesNotMatch(css, /\.clash-ui-root button > svg,[\s\S]{0,220}?(?:filter|opacity):/u);
  assert.match(css, /\.futures-terminal-shell \.tab-btn > svg\s*\{[^}]*var\(--terminal-icon\)/su);
  assert.match(css, /\.futures-terminal-shell \.tab-btn\[aria-pressed='true'\] > svg\s*\{[^}]*var\(--terminal-icon-active\)/su);
  assert.match(actions, /const SurrenderFlagIcon[\s\S]{0,500}stroke="currentColor"/u);
  assert.doesNotMatch(css, /\.clash-ui-root button:active:not\(:disabled\)\s*\{[^}]*filter:/su);
  assert.match(theme, /'--terminal-button-icon': tone\.iconColor/u);
  assert.doesNotMatch(theme, /transition: '[^']*filter/u);
});

test('legacy parchment palette no longer leaks into React game panels', () => {
  const legacy = /#(?:fdf8e7|e8dfc8|d4c8b0|bba882|a3906a|77573d|5c3a21|fffaf0|ebdaba|fff5d6|c9b590|a98f63)\b/iu;
  for (const file of componentFiles()) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), legacy, `${path.relative(root, file)} still uses the legacy palette`);
  }
});

test('primary non-trading screens consume the shared theme tokens', () => {
  for (const file of [
    'src/components/ShopPanel.jsx',
    'src/components/TournamentPanel.jsx',
    'src/components/ProfileModal.jsx',
    'src/components/BattleLogPanel.jsx',
    'src/components/NftMintPanel.jsx',
    'src/components/NftMarketplacePanel.jsx',
    'src/components/NftBridgePanel.jsx',
    'src/components/CustodialMarketplacePanel.jsx',
    'src/components/BotsPanel.jsx',
    'src/components/AiChatPanel.jsx',
    'src/components/BuildingInfoPanel.jsx',
    'src/components/BarnPanel.jsx',
  ]) {
    const source = file.endsWith('/BarnPanel.jsx')
      ? `${read(file)}\n${read('src/components/BarnPanel.css')}`
      : read(file);
    assert.match(source, /var\(--(?:terminal|bum)-(?:surface|text|border)/u, `${file} is not connected to the shared theme`);
  }
});

test('profile wallet rows stay legible in both interface themes', () => {
  const profile = read('src/components/ProfileModal.jsx');
  assert.match(profile, /walletRow:[\s\S]*?background: 'var\(--terminal-surface-raised\)'[\s\S]*?border: '1px solid var\(--terminal-border-strong\)'/u);
  assert.match(profile, /walletRowSub: \{ color: 'var\(--terminal-text-secondary\)'/u);
  assert.match(profile, /connectedChip:[\s\S]*?background: 'var\(--terminal-long-soft\)'[\s\S]*?border: '1px solid var\(--terminal-long-border\)'/u);
  assert.match(profile, /copied === wallet\.address \? 'var\(--terminal-long-soft\)' : 'var\(--terminal-surface-muted\)'/u);
  assert.doesNotMatch(profile, /walletRow:[\s\S]{0,300}rgba\(255,255,255,0\.42\)/u);
});

test('shared button contract owns geometry, semantic tones, and icon controls', () => {
  const theme = read('src/styles/theme.js');
  assert.match(theme, /export const uiButton/u);
  assert.match(theme, /export const uiIconButton/u);
  for (const variant of ['primary', 'secondary', 'neutral', 'success', 'danger', 'warning', 'info', 'ghost']) {
    assert.match(theme, new RegExp(`\\n  ${variant}: \\{`, 'u'), `missing ${variant} button variant`);
  }
  assert.match(theme, /minHeight: 40/u);
  assert.match(theme, /borderRadius: 10/u);
  assert.match(theme, /boxSizing: 'border-box'/u);
  assert.match(theme, /const depth = variant === 'ghost' \? 'none' : 'var\(--terminal-shadow-control\)'/u);
  assert.match(theme, /boxShadow: depth/u);
  assert.match(theme, /export const cartoonBtn = \(bg, border\) => uiButton\('primary'/u);
  for (const file of componentFiles()) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /cartoonBtn\(/u, `${path.relative(root, file)} bypasses the shared semantic variants`);
  }
});

test('shared depth tokens add restrained volume in both themes', () => {
  const css = read('src/components/FuturesTerminal.css');
  const player = read('src/components/PlayerInfo.jsx');
  assert.equal((css.match(/--terminal-shadow-control:/gu) || []).length, 2);
  assert.equal((css.match(/--terminal-shadow-card:/gu) || []).length, 2);
  assert.doesNotMatch(css, /\.clash-ui-root button \{[\s\S]{0,180}box-shadow:/u);
  assert.match(player, /0 0 0 2px rgba\(255,255,255,0\.86\)/u);
});

test('responsive controls keep equal geometry and independent click targets', () => {
  const futures = read('src/components/FuturesPanel.jsx');
  const shop = read('src/components/ShopPanel.jsx');
  const player = read('src/components/PlayerInfo.jsx');

  assert.match(futures, /function terminalButton\(\)[\s\S]{0,220}width: 'min\(100%, 240px\)'/u);
  assert.match(shop, /width: 'min\(calc\(100% - 24px\), 500px\)'/u);
  assert.match(shop, /flex: '1 1 0',[\s\r\n]*minWidth: 0/u);

  const wrapperStart = player.indexOf('<div\n      style={{ ...styles.wrap');
  const profileTriggerStart = player.indexOf('<div\n        style={styles.levelCircleContainer}', wrapperStart);
  assert.ok(wrapperStart >= 0 && profileTriggerStart > wrapperStart, 'player controls are present');
  const passiveWrapper = player.slice(wrapperStart, profileTriggerStart);
  assert.doesNotMatch(passiveWrapper, /role="button"|onClick=|tabIndex=/u);
  assert.match(player.slice(profileTriggerStart), /aria-label="Open profile"[\s\S]*?aria-label="Open leaderboard"/u);
});

test('secondary dashboards no longer contain light-only card islands', () => {
  const bots = read('src/components/BotsPanel.jsx');
  const hermes = read('src/components/AiChatPanel.jsx');
  const tournaments = read('src/components/TournamentPanel.jsx');

  assert.doesNotMatch(bots, /#(?:FBE2E2|F4EEDC|FFFDF5|DDD5C4|E4DED2|efe6cf|f8f1df)\b/iu);
  assert.doesNotMatch(hermes, /#(?:e4f8dc|f7ecc9|fff2d4|fff2cf|f6e8bf)\b/iu);
  assert.doesNotMatch(tournaments, /#(?:e8f3f8|f7edd0)\b/iu);
});

test('common app actions consume the shared button contract', () => {
  for (const file of [
    'src/components/ProfileModal.jsx',
    'src/components/BotsPanel.jsx',
    'src/components/RegisterPanel.jsx',
    'src/components/ShopPanel.jsx',
    'src/components/TournamentPanel.jsx',
    'src/components/NftMintPanel.jsx',
    'src/components/NftMarketplacePanel.jsx',
    'src/components/NftBridgePanel.jsx',
    'src/components/CustodialMarketplacePanel.jsx',
    'src/components/SanctumLstPanel.jsx',
    'src/components/NftGoldBoostButton.jsx',
    'src/components/BattleResultOverlay.jsx',
    'src/components/WalletSessionRecovery.jsx',
    'src/components/trading/TradingSetupGate.jsx',
  ]) {
    assert.match(read(file), /ui(?:Icon)?Button\(/u, `${file} does not use the shared button contract`);
  }
});

test('profile and futures setup selectors no longer reintroduce venue bevels', () => {
  const profile = read('src/components/ProfileModal.jsx');
  const picker = read('src/components/GameUI.jsx');
  const mode = read('src/components/FuturesModeSelect.jsx');
  assert.doesNotMatch(profile, /linear-gradient\(180deg, \$\{cfg\.color\}/u);
  assert.doesNotMatch(profile, /linear-gradient\(180deg, #6ab344|linear-gradient\(180deg, #0EA5E9/u);
  assert.match(profile, /style=\{uiButton\('secondary', \{ minHeight: 32/u);
  assert.doesNotMatch(picker, /background:\s*`linear-gradient\([\s\S]{0,80}cfg\.color/u);
  assert.match(picker, /uiButton\('secondary'/u);
  assert.doesNotMatch(mode, /🌱|⚡|cardIcon/u);
  assert.match(mode, /uiButton\('secondary'/u);
});

test('ranked and result interactions are semantic and use the app design system', () => {
  const ranked = read('src/components/RankedAttackSelector.css');
  const result = read('src/components/BattleResultOverlay.jsx');
  const player = read('src/components/PlayerInfo.jsx');
  assert.match(ranked, /background:\s*var\(--terminal-surface\)/u);
  assert.match(ranked, /box-shadow:\s*0 0 0 3px var\(--terminal-brand-ring\)/u);
  assert.doesNotMatch(ranked, /border:\s*3px solid #a86709|box-shadow:\s*0 6px 0/u);
  assert.match(result, /<button[\s\S]*?Share/u);
  assert.match(result, /<button[\s\S]*?Return/u);
  assert.match(player, /role="button"[\s\S]*?tabIndex=\{0\}/u);
});

test('secondary feature modals and Hermes use shared surfaces and brand actions', () => {
  const sanctum = read('src/components/SanctumLstPanel.jsx');
  const boost = read('src/components/NftGoldBoostButton.jsx');
  const hermes = read('src/components/AiChatPanel.jsx');
  assert.match(sanctum, /panel:[\s\S]{0,420}background: 'var\(--terminal-surface\)'/u);
  assert.match(sanctum, /preset: \{ \.\.\.uiButton\('secondary'/u);
  assert.doesNotMatch(sanctum, /linear-gradient\(160deg, #fffdf3|boxShadow: '0 3px 0 #a72b26'/u);
  assert.match(boost, /modal:[\s\S]{0,280}background: 'var\(--terminal-surface\)'/u);
  assert.doesNotMatch(boost, /linear-gradient\(180deg, #f7c85a|background: '#fff4d4'/u);
  assert.match(hermes, /sendReady:[\s\S]{0,160}background: 'var\(--terminal-orange\)'/u);
  assert.doesNotMatch(hermes, /hermes-send-glow:not\(:disabled\)[\s\S]{0,180}rgba\(31,109,52/u);
});

test('every visible scrollbar uses the shared ClashBot treatment', () => {
  const css = read('src/components/FuturesTerminal.css');
  assert.match(css, /\*::-webkit-scrollbar\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/su);
  assert.match(css, /\*::-webkit-scrollbar-thumb\s*\{[^}]*min-height:\s*44px;[^}]*border:\s*3px solid transparent;[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--terminal-scrollbar-thumb\);[^}]*background-clip:\s*padding-box;/su);
  assert.match(css, /\*::-webkit-scrollbar-thumb:hover\s*\{[^}]*var\(--terminal-scrollbar-thumb-hover\)/su);
  assert.match(css, /\*::-webkit-scrollbar-thumb:active\s*\{[^}]*var\(--terminal-scrollbar-thumb-active\)/su);
  assert.match(css, /\*::-webkit-scrollbar-button,[\s\S]*display:\s*none;[\s\S]*width:\s*0;[\s\S]*height:\s*0;/u);
  assert.doesNotMatch(css, /terminal-scrollbar-(?:highlight|shade|shadow)/u);
  assert.match(css, /--terminal-scrollbar-thumb: rgba\(55, 65, 81, 0\.72\);[\s\S]*?--terminal-scrollbar-thumb-hover: #f26522;[\s\S]*?--terminal-scrollbar-thumb-active: #dc5418;/u);
});
