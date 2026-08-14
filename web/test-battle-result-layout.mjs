import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./src/components/BattleResultOverlay.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('./src/components/BattleResultOverlay.css', import.meta.url), 'utf8');

test('battle result uses a semantic dialog with fixed header and action footer', () => {
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /<header className="battle-result__header">/);
  assert.match(component, /<div className="battle-result__body clash-scroll">/);
  assert.match(component, /<footer className="battle-result__footer">/);
  assert.match(css, /\.battle-result__header[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(css, /\.battle-result__footer[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(css, /\.battle-result__body[\s\S]*?min-height:\s*0;[\s\S]*?flex:\s*1 1 auto;/);
});

test('dialog owns focus, keyboard and gamepad actions, and shared button styling', () => {
  assert.match(component, /import \{ uiButton \} from '\.\.\/styles\/theme';/);
  assert.match(component, /style=\{uiButton\('secondary', \{ minHeight: 44 \}\)\}/);
  assert.match(component, /style=\{uiButton\('primary', \{ minHeight: 44 \}\)\}/);
  assert.match(component, /returnButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /event\.key !== 'Tab'/);
  assert.match(component, /restoreFocusRef\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(component, /navigator\.getGamepads\(\)/);
  assert.match(component, /pad\?\.buttons\?\.\[0\]\?\.pressed/);
  assert.match(component, /pad\?\.buttons\?\.\[1\]\?\.pressed/);
  assert.match(component, /focusAdjacentAction\(-1\)/);
  assert.match(component, /focusAdjacentAction\(1\)/);
});

test('results body is the only vertical scroll owner and the shell is viewport bounded', () => {
  assert.match(css, /\.battle-result\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 16px\);[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.battle-result__body[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/);
  assert.equal((css.match(/overflow-y:\s*auto/g) || []).length, 1);
});

test('wide and short landscape layouts pair loot and trophies with casualties full width', () => {
  assert.match(css, /\.battle-result__grid[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.battle-result__panel--wide\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
  assert.match(component, /<ResultPanel id="battle-result-casualties-title" title="Casualties" wide>/);
  assert.match(css, /@media \(max-height:\s*680px\) and \(min-width:\s*600px\)/);
});

test('phone targets stack panels and preserve 44px actions', () => {
  assert.match(css, /@media \(max-width:\s*599px\)[\s\S]*?\.battle-result__grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width:\s*359px\)/);
  assert.match(css, /\.battle-result__action\s*\{[\s\S]*?min-height:\s*44px;/);

  const targets = [
    { width: 1140, height: 922, mode: 'two-column' },
    { width: 1366, height: 768, mode: 'two-column' },
    { width: 1024, height: 600, mode: 'two-column-short' },
    { width: 390, height: 844, mode: 'stacked-phone' },
    { width: 320, height: 568, mode: 'stacked-narrow-phone' },
  ];
  assert.deepEqual(targets.map(({ width }) => (width <= 599 ? 'stacked' : 'two-column')), [
    'two-column',
    'two-column',
    'two-column',
    'stacked',
    'stacked',
  ]);
});

test('responsive dialog keeps border-box sizing and reduced-motion support', () => {
  assert.match(css, /\.battle-result-backdrop \*,[\s\S]*?box-sizing:\s*border-box;/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none !important;/);
});
