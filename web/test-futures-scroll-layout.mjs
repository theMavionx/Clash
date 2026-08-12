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

const dragStart = source.indexOf('const handlePointerDown = useCallback((e) => {');
const dragEnd = source.indexOf('const [activeTab, setActiveTab]', dragStart);
assert.ok(dragStart >= 0 && dragEnd > dragStart, 'terminal drag handler must exist');
const dragHandler = source.slice(dragStart, dragEnd);
assert.match(
  dragHandler,
  /e\.currentTarget\.closest\('\.futures-terminal-shell--fullscreen'\)/u,
  'maximized terminal must reject pointer drag before registering move listeners',
);
assert.match(dragHandler, /window\.addEventListener\('mousemove'/u, 'compact terminal must remain draggable');

const tabsWheelStart = source.indexOf('const handleTabsWheel = useCallback((event) => {');
const tabsWheelEnd = source.indexOf('// Branch on DEX.', tabsWheelStart);
assert.ok(tabsWheelStart >= 0 && tabsWheelEnd > tabsWheelStart, 'tabs wheel handler must exist');
const tabsWheelHandler = source.slice(tabsWheelStart, tabsWheelEnd);
assert.match(tabsWheelHandler, /tabs\.scrollWidth - tabs\.clientWidth/u, 'wheel handler must only engage when tabs overflow');
assert.match(tabsWheelHandler, /tabs\.scrollLeft \+ event\.deltaY/u, 'vertical wheel input must move the tabs horizontally');
assert.match(tabsWheelHandler, /event\.preventDefault\(\)/u, 'handled tab-wheel input must not move the page');
assert.match(source, /className="futures-tabs-scroll clash-scroll-hidden"\s+onWheel=\{handleTabsWheel\}/u, 'top tabs must use the wheel handler and hide only the horizontal navigation rail');

const tabsStart = source.indexOf('const TABS = [');
const tabsEnd = source.indexOf('];', tabsStart);
assert.ok(tabsStart >= 0 && tabsEnd > tabsStart, 'terminal tab configuration must exist');
const tabsConfig = source.slice(tabsStart, tabsEnd);
assert.ok(
  tabsConfig.indexOf("id: 'Account'") < tabsConfig.indexOf("id: 'History'")
    && tabsConfig.indexOf("id: 'History'") < tabsConfig.indexOf("id: 'Funding'"),
  'History and Funding must remain the final two terminal tabs',
);

console.log('Futures layout PASS: fullscreen controls scroll, maximized window stays fixed, compact window drags, tabs wheel-scroll horizontally');
