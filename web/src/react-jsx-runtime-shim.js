// Vite 8's dep-optimizer cannot extract named exports (Fragment / jsx /
// jsxs) from React 19's CJS `react/jsx-runtime` — esbuild's CJS-to-ESM
// interop only emits `default` + an unnamed `t` re-export. Packages built
// with `import { Fragment, jsx, jsxs } from "react/jsx-runtime"` (e.g.
// @aptos-labs/wallet-adapter-react) crash at module-init with:
//   "does not provide an export named 'Fragment'"
//
// Workaround: alias `react/jsx-runtime` to this shim in `vite.config.js`.
// We pull jsx / jsxs from the CJS default export (which IS the bag of
// named methods) and Fragment from React's top-level export. Consumers
// get the named imports they want; the runtime is identical.
//
// We DELIBERATELY use `react/jsx-runtime.js` (with explicit `.js`) here
// instead of `react/jsx-runtime` so the vite alias DOES NOT match this
// import — otherwise the shim would import itself and infinite-recurse.

import jsxRuntime from 'react/jsx-runtime.js';
import { Fragment as ReactFragment } from 'react';

export const jsx = jsxRuntime.jsx;
export const jsxs = jsxRuntime.jsxs;
export const Fragment = jsxRuntime.Fragment || ReactFragment;
export default jsxRuntime;
