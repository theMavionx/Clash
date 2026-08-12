import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./src/components/BarnPanel.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('./src/components/BarnPanel.css', import.meta.url), 'utf8');

test('barn unit modal uses one bounded shell with a single scroll owner', () => {
  assert.match(component, /import '\.\/BarnPanel\.css';/);
  assert.match(component, /className="barn-unit-modal__body clash-scroll"/);
  assert.match(component, /aria-label=\{`\$\{displayName\} upgrade details`\}[\s\S]*?tabIndex=\{0\}/);
  assert.match(component, /<footer className="barn-unit-modal__footer">/);
  assert.match(styles, /\.barn-unit-modal\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(styles, /\.barn-unit-modal__body\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.equal((styles.match(/overflow-y:\s*auto/g) || []).length, 1);
  assert.match(styles, /\.barn-unit-modal__footer\s*\{[\s\S]*?flex:\s*0 0 auto;/);
});

test('dialog supports keyboard dismissal, focus containment, and focus restore', () => {
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /aria-labelledby="barn-unit-modal-title"/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /event\.key !== 'Tab'/);
  assert.match(component, /restoreFocusRef\.current\?\.focus\?\.\(\)/);
  assert.match(component, /aria-label=\{`Close \$\{displayName\}`\}/);
  assert.match(styles, /\.barn-unit-modal__close,[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(styles, /\.barn-unit-modal button:focus-visible/);
});

test('upgrade blockers account for progression, NFT ownership, resources, and pending state', () => {
  assert.match(component, /usePlayer, useResources/);
  assert.match(component, /const resourceShortfalls = resourceEntries/);
  assert.match(component, /Town Hall Level \$\{requiredTownHallLevel\} required/);
  assert.match(component, /Upgrade Barn to Level \$\{requiredBarnLevel\}/);
  assert.match(component, /\$\{currentNftTroop\.label\} NFT required/);
  assert.match(component, /Upgrade pending…/);
  assert.match(component, /Maximum level reached/);
  assert.match(component, /disabled=\{upgradeDisabled\}/);
  assert.match(component, /if \(upgradeDisabled\) return;/);
  assert.match(component, /aria-busy=\{upgradePending \|\| undefined\}/);
  assert.match(component, /required\.toLocaleString\(\)\} required, \$\{available\.toLocaleString\(\)\} available/);
  assert.match(component, /available\.toLocaleString\(\)\} available\{shortfall > 0/);
  assert.match(component, /shortfall\.toLocaleString\(\)\} short/);
  assert.match(component, /sendToGodot\('upgrade_troop'/);
});

test('responsive light and dark layouts cover desktop, tablet, and narrow mobile', () => {
  assert.match(styles, /z-index:\s*1300;/);
  assert.match(styles, /\.barn-unit-modal__overlay\s*\{[\s\S]*?pointer-events:\s*auto;/);
  assert.match(styles, /grid-template-columns:\s*300px minmax\(0, 1fr\)/);
  assert.match(styles, /min-height:\s*56px;[\s\S]*?flex:\s*0 0 56px;/);
  assert.match(styles, /@media \(min-width: 600px\) and \(max-width: 899px\)/);
  assert.match(styles, /@media \(max-width: 599px\)[\s\S]*?width:\s*100%;[\s\S]*?max-height:\s*100dvh/);
  assert.match(styles, /@media \(max-width: 359px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /:root\[data-ui-theme='dark'\] \.barn-unit-modal__overlay/);
  assert.match(styles, /--bum-brand:\s*#f26522;/i);
  assert.match(styles, /--bum-long:\s*#087a55;/i);
  assert.match(styles, /--bum-short:\s*#d14343;/i);
});

test('unit navigation and level transition avoid font-dependent glyphs', () => {
  assert.match(component, /&lsaquo;/);
  assert.match(component, /&rsaquo;/);
  assert.match(component, /&rarr;/);
  assert.match(component, /&times;/);
  assert.doesNotMatch(component, /[✖❮❯]/);
});
