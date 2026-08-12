import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./src/components/BuildingInfoPanel.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('./src/components/BuildingInfoPanel.css', import.meta.url), 'utf8');

test('building modal keeps a single scroll owner and fixed action footer', () => {
  assert.match(component, /building-info-modal__body clash-scroll/);
  assert.match(component, /aria-label=\{`\$\{building\.name\} details`\}/);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(component, /<footer className="building-info-modal__footer">/);
  assert.match(styles, /\.building-info-modal\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(styles, /\.building-info-modal__body\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /\.building-info-modal__footer\s*\{[\s\S]*?flex:\s*0 0 auto;/);
});

test('upgrade hierarchy presents cost before the stat comparison grid', () => {
  const costIndex = component.indexOf('costFirst && rightContent');
  const statsIndex = component.indexOf('className="building-info-modal__stats"');
  assert.ok(costIndex >= 0 && statsIndex > costIndex);
  assert.match(styles, /\.building-info-modal__stats-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(component, /upgradeTo != null/);
  assert.match(component, /String\(upgradeTo\) !== String\(current\)/);
});

test('desktop, tablet, and mobile layouts are explicitly bounded', () => {
  assert.match(styles, /width:\s*min\(920px, calc\(100vw - 40px\)\)/);
  assert.match(styles, /grid-template-columns:\s*290px minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(min-width: 600px\) and \(max-width: 899px\)/);
  assert.match(styles, /@media \(max-width: 599px\)[\s\S]*?width:\s*100%;[\s\S]*?max-height:\s*100dvh/);
  assert.match(styles, /@media \(max-width: 359px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('dialog has keyboard dismissal, focus containment, and accessible controls', () => {
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /event\.key !== 'Tab'/);
  assert.match(component, /aria-label=\{`Close \$\{title\}`\}/);
  assert.match(styles, /\.building-info-modal__close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(styles, /\.building-info-modal__action\s*\{[\s\S]*?min-height:\s*48px;/);
  assert.match(styles, /\.building-info-modal__body:focus-visible/);
});

test('modal stays above the game HUD and blocks unaffordable upgrades', () => {
  assert.match(styles, /\.building-info-modal__overlay\s*\{[\s\S]*?z-index:\s*1300;/);
  assert.match(styles, /\.building-info-modal__overlay\s*\{[\s\S]*?pointer-events:\s*auto;/);
  assert.match(component, /const getResourceShortfalls/);
  assert.match(component, /disabled:\s*upgradeShortfalls\.length > 0/);
  assert.match(component, /disabled=\{actionDisabled\}/);
  assert.match(component, /aria-disabled=\{actionDisabled\}/);
  assert.match(component, /building-info-modal__action-status/);
  assert.match(styles, /\.building-info-modal__action:disabled/);
});
