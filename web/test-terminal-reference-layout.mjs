import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('./src/components/FuturesTerminal.css', import.meta.url), 'utf8');
const dialog = await readFile(new URL('./src/components/trading/PositionActionDialog.jsx', import.meta.url), 'utf8');
const dialogCss = await readFile(new URL('./src/components/trading/PositionActionDialog.css', import.meta.url), 'utf8');
const chart = await readFile(new URL('./src/components/TradingViewWidget.jsx', import.meta.url), 'utf8');

test('wheel chains out of ticket and plain chart wheel does not trap workspace scrolling', () => {
  const ticket = panel.slice(panel.indexOf('const renderTradeControls'), panel.indexOf('{/* Optional funding hint'));
  assert.match(ticket, /overscrollBehaviorY: 'auto'/);
  assert.doesNotMatch(ticket, /overscrollBehaviorY: 'contain'/);
  assert.match(ticket, /event\.target\.type === 'number'\) event\.target\.blur\(\)/);
  assert.match(chart, /handleScroll: \{ mouseWheel: false/);
  assert.match(chart, /handleScale: \{ mouseWheel: event\.shiftKey \}/);
  assert.match(chart, /removeEventListener\('wheel', onChartWheel, true\)/);
});

test('desktop keeps a tall chart/book/ticket workspace before account activity', () => {
  const start = panel.indexOf('futures-terminal-workspace--desktop');
  const workspace = panel.slice(start, panel.indexOf('// Normal (mobile) layout', start));
  assert.ok(start > 0);
  assert.ok(workspace.indexOf('futures-terminal-chart') < workspace.indexOf('<BottomPanel'));
  assert.ok(workspace.indexOf('futures-terminal-book') < workspace.indexOf('<BottomPanel'));
  assert.match(css, /height: max\(620px, calc\(100dvh - 180px\)\)/);
  assert.match(css, /min-width: 340px !important/);
  assert.match(workspace, /overflow: 'visible'/);
});

test('tablet has a market view switch and phone retains a tall chart with decimal inputs', () => {
  assert.match(css, /max-width: 1199px\) and \(min-width: 768px/);
  assert.match(css, /data-market-view='book'/);
  assert.match(panel, /clamp\(360px, 48dvh, 520px\)/);
  assert.match(panel, /aria-label="Limit price"\s+inputMode="decimal"/);
  assert.match(css, /font-size: 16px !important/);
});

test('size presets call the same sizing handler as the slider', () => {
  assert.match(panel, /\[0, 25, 50, 75, 100\]\.map/);
  assert.match(panel, /onClick=\{\(\) => handleSizePct\(value\)\}/);
  assert.match(panel, /onChange=\{e => handleSizePct\(Number\(e.target.value\)\)\}/);
  assert.match(panel, /aria-label="Position size percentage"/);
});

test('reference palette is scoped to terminal and its explicit trading portal', () => {
  assert.match(css, /\.futures-terminal-shell,\s*\.futures-terminal-portal\s*\{/);
  assert.match(css, /\[data-ui-theme='dark'\] \.futures-terminal-portal/);
  assert.match(dialog, /position-action-dialog futures-terminal-portal/);
  assert.match(dialog, /dialog.showModal\(\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('entry TP/SL is inline while existing position dialogs retain scrolling actions', () => {
  assert.match(dialogCss, /\.position-action-dialog\[open\]/);
  assert.match(dialogCss, /\.open-tpsl-draft__content\s*\{[^}]*overflow:auto/s);
  assert.match(dialogCss, /\.open-tpsl-draft__actions\s*\{[^}]*flex:none/s);
  const entry = panel.slice(panel.indexOf('function OpenTpslEditor('), panel.indexOf('function OpenTpslEditor(') + 10000);
  assert.match(entry, /className="open-tpsl-inline"/);
  assert.match(entry, /role="switch"/);
  assert.match(dialog, /dialog.showModal\(\)/);
});
