import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const panelSource = await readFile(new URL('./src/components/BuildingInfoPanel.jsx', import.meta.url), 'utf8');
const panelCss = await readFile(new URL('./src/components/BuildingInfoPanel.css', import.meta.url), 'utf8');

test('ship troop selection uses the shared progression modal and one scroll body', () => {
  assert.match(panelSource, /className="building-info-modal unit-load-modal"/);
  assert.match(panelSource, /className="building-info-modal__body clash-scroll unit-load-modal__body"/);
  assert.match(panelSource, /aria-labelledby="unit-load-modal-title"/);
  assert.match(panelCss, /\.unit-load-modal__body\s*\{[^}]*display:\s*flex/s);
  assert.doesNotMatch(panelSource, /<div style=\{\{\.\.\.LT\.overlay[^]*Main Ship Lv\./);
});

test('troop cards form a deterministic responsive 5-4-3-2 grid', () => {
  assert.match(panelCss, /\.unit-load-modal__grid\s*\{[^}]*repeat\(5,/s);
  assert.match(panelCss, /@media \(max-width:\s*899px\)[^]*repeat\(4,/s);
  assert.match(panelCss, /@media \(max-width:\s*599px\)[^]*repeat\(3,/s);
  assert.match(panelCss, /@media \(max-width:\s*359px\)[^]*repeat\(2,/s);
  assert.match(panelSource, /className=\{`unit-catalog-card/);
});

test('loaded cards and unit details remain keyboard accessible', () => {
  assert.match(panelSource, /aria-pressed=\{isSwapping\}/);
  assert.match(panelSource, /className="unit-load-card__action"/);
  assert.match(panelSource, /className="unit-catalog-card__action"/);
  assert.match(panelSource, /<button[\s\S]*?className="unit-catalog-card__info"/);
  assert.doesNotMatch(panelSource, /<span[\s\S]{0,120}className="unit-catalog-card__info"/);
  assert.match(panelSource, /ref=\{troopInfoRef\}/);
  assert.match(panelSource, /event\.key === 'Escape'[^]*setTroopInfo\(null\)/s);
  assert.match(panelSource, /if \(event\.key !== 'Tab'\) return;\s*event\.stopImmediatePropagation\(\)/);
  assert.match(panelCss, /\.unit-catalog-card__info\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(panelCss, /\.unit-catalog-card__info > span\s*\{[^}]*width:\s*26px[^}]*height:\s*26px/s);
  assert.match(panelCss, /\.unit-catalog-card > :not\(\.unit-catalog-card__action\):not\(\.unit-catalog-card__info\)[^}]*pointer-events:\s*none/s);
  assert.match(panelCss, /\.unit-catalog-card__info\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(panelCss, /\.unit-info-modal__close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
});

test('unaffordable ship and altar upgrades are blocked before mutation', () => {
  assert.match(panelSource, /if \(!canAffordAltarCost\(cost\)\) \{\s*setAltarError\('Not enough resources'\);\s*return;/);
  assert.match(panelSource, /const canClickUpgrade = current < 3 && nextCost && canAffordUpgrade && !altarBusy/);
  assert.match(panelSource, /"UNLOCK GUNBOAT"[^]*disabled: getResourceShortfalls\(shipCost\)\.length > 0/s);
  assert.match(panelSource, /currentTownHallLevel < shipNextTownHall/);
  assert.match(panelSource, /if \(shipUpgradeBlockedReason \|\| shipLevel >= shipMaxLevel\) return/);
  assert.match(panelSource, /aria-busy=\{shipUpgradePending \|\| undefined\}/);
  assert.match(panelSource, /disabled=\{!!shipUpgradeBlockedReason\}/);
  assert.match(panelCss, /\.unit-load-modal__ship-summary\s*\{[^}]*flex-wrap:\s*wrap/s);
});

test('flag and altar configuration use the same modal shell and theme tokens', () => {
  assert.match(panelSource, /className="building-info-modal building-config-modal"/);
  assert.match(panelSource, /className="building-info-modal building-info-modal--wide altar-config-modal"/);
  assert.match(panelCss, /\.building-config-modal__body[^]*var\(--bim-surface\)/s);
  assert.match(panelCss, /\.altar-config-modal__scroll[^]*var\(--bim-canvas\)/s);
  assert.match(panelSource, /building-config-modal__flag-card--active/);
  assert.doesNotMatch(panelCss, /:has\(img\)/);
  assert.match(panelSource, /altarTreeBodyMobile:\s*\{[^}]*overflow:\s*'visible'/s);
  assert.match(panelSource, /clash-scroll-hidden/);
  assert.doesNotMatch(panelSource, /clash-scroll--hidden/);
});
