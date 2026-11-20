import assert from 'node:assert/strict';
import { entryScriptFromHtml, isStaleBuild } from './src/lib/staleBuildNotice.js';

const html = '<head><script type="module" crossorigin src="/assets/main-CRAfx993.js"></script><link rel="modulepreload" href="/assets/vendor-x.js"></head>';
assert.equal(entryScriptFromHtml(html), '/assets/main-CRAfx993.js');
assert.equal(entryScriptFromHtml('<script src="https://clashofperps.fun/assets/main-AB.js" type="module"></script>'), '/assets/main-AB.js');
assert.equal(entryScriptFromHtml('<html>no scripts</html>'), null);
assert.equal(isStaleBuild('/assets/main-A.js', '/assets/main-B.js'), true);
assert.equal(isStaleBuild('/assets/main-A.js', '/assets/main-A.js'), false);
assert.equal(isStaleBuild('/assets/main-A.js', null), false);
assert.equal(isStaleBuild(null, '/assets/main-B.js'), false);
console.log('stale build notice: ok');
