import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');

const bottomStart = source.indexOf('const BottomPanel = memo(function BottomPanel({');
const bottomEnd = source.indexOf('function FuturesPanel()', bottomStart);
assert.ok(bottomStart >= 0 && bottomEnd > bottomStart, 'fullscreen activity panel must exist');
const bottomPanel = source.slice(bottomStart, bottomEnd);

assert.match(bottomPanel, /closePosition, cancelOrder, setTpsl/u, 'fullscreen positions must reuse the venue close and TP\/SL handlers');
assert.match(bottomPanel, /setShareTrade = \(\) => \{\}/u, 'fullscreen positions must expose the existing share flow');
assert.match(bottomPanel, /setExpandedPositionAction\(expanded === 'close' \? null : `\$\{rowKey\}:close`\)/u, 'Close must open a confirmation editor instead of submitting immediately');
assert.match(bottomPanel, /type="range"[\s\S]*?min="5"[\s\S]*?max="100"/u, 'fullscreen Close editor must support partial close from 5% to 100%');
assert.match(bottomPanel, /<TpslEditor[\s\S]*?mode=\{tpslInputMode\}/u, 'fullscreen positions must expose the shared Price, % PnL and $ PnL editor');
assert.match(bottomPanel, /await setTpsl\(/u, 'fullscreen TP\/SL submit must call the existing venue handler');
assert.match(bottomPanel, /onClick=\{\(\) => setShareTrade\(shareSnapshot\)\}/u, 'fullscreen positions must share the current position snapshot');

const fullscreenStart = source.indexOf('if (fullscreen) {');
const fullscreenEnd = source.indexOf('// Normal (mobile) layout', fullscreenStart);
assert.ok(fullscreenStart >= 0 && fullscreenEnd > fullscreenStart, 'fullscreen trade workspace must exist');
const fullscreenTrade = source.slice(fullscreenStart, fullscreenEnd);

assert.match(fullscreenTrade, /<PositionsList[\s\S]*?positions=\{openedSortedPositions\}/u, 'fullscreen mobile trade view must show open-position controls');
assert.match(fullscreenTrade, /<PositionsList[\s\S]*?setShareTrade=\{setShareTrade\}/u, 'fullscreen mobile position cards must expose Share without changing tabs');
assert.match(fullscreenTrade, /<BottomPanel[\s\S]*?setTpsl=\{setTpsl\}/u, 'fullscreen desktop activity dock must receive TP\/SL');
assert.match(fullscreenTrade, /setShareTrade=\{setShareTrade\}/u, 'fullscreen desktop activity dock must receive Share');

console.log('Fullscreen position actions PASS: desktop and mobile Trade views expose partial Close, TP/SL and Share through existing handlers');
