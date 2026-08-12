import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const start = source.indexOf("const renderTradeControls = ({ compactMobile = false, parentScroll = false } = {}) => (");
const end = source.indexOf('// ==================== BOTTOM PANEL (fullscreen)', start);

assert.ok(start >= 0 && end > start, 'fullscreen trade controls block must exist');
const tradeControls = source.slice(start, end);

assert.match(tradeControls, /futures-trade-controls-scroll/u, 'fullscreen controls need their own scroll container');
assert.match(tradeControls, /height:\s*'100%'/u, 'scroll container must be constrained by the available column height');
assert.match(tradeControls, /minHeight:\s*0/u, 'flex child must be allowed to shrink below its content height');
assert.match(tradeControls, /overflowY:\s*'auto'/u, 'overflowing TP\/SL controls must scroll vertically');
assert.match(tradeControls, /WebkitOverflowScrolling:\s*'touch'/u, 'touch scrolling must remain enabled on embedded browsers');
assert.match(tradeControls, /touchAction:\s*'pan-y'/u, 'vertical swipe gestures must be reserved for the controls column');
assert.match(tradeControls, /safe-area-inset-bottom/u, 'last TP\/SL controls need space above the bottom safe area');

console.log('Futures scroll layout PASS: fullscreen trade controls keep TP/SL reachable');
