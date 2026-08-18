import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clashSolWalletAuthMessage,
  createClashSolWalletAuthProof,
} from './src/lib/sanctumLst.js';

const wallet = '9xQeWvG816bUx9EPjHmaT23yvVMHfVfuPTeMr31wxrSj';
const issuedAt = '2026-08-18T10:00:00.000Z';
assert.equal(
  clashSolWalletAuthMessage({ wallet, issuedAt }),
  [
    'Clash wallet auth',
    'Action: wallet-auth',
    `Wallet: ${wallet}`,
    'DEX: sanctum',
    `Issued At: ${issuedAt}`,
  ].join('\n'),
);

let signedBytes = null;
const proof = await createClashSolWalletAuthProof({
  wallet,
  signMessage: async (bytes) => {
    signedBytes = bytes;
    return Uint8Array.from({ length: 64 }, (_, index) => index);
  },
});
assert.equal(new TextDecoder().decode(signedBytes), proof.message);
assert.equal(proof.wallet, wallet);
assert.equal(proof.dex, 'sanctum');
assert.equal(proof.chain_type, 'solana');
assert.equal(proof.signature_encoding, 'base64');
assert.equal(Buffer.from(proof.signature, 'base64').length, 64);

const [battleShop, constructionShop, sanctumTab, sanctumCss, sanctumClient] = await Promise.all([
  readFile(new URL('./src/components/NftMintPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('./src/components/ShopPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('./src/components/SanctumShopTab.jsx', import.meta.url), 'utf8'),
  readFile(new URL('./src/components/SanctumShopTab.css', import.meta.url), 'utf8'),
  readFile(new URL('./src/lib/sanctumLst.js', import.meta.url), 'utf8'),
]);

assert.match(battleShop, /id: 'clashsol'/);
assert.match(battleShop, /<SanctumShopTab/);
assert.match(
  battleShop,
  /shopTabs:\s*\{[\s\S]*?flex: '0 0 auto',[\s\S]*?minHeight: 54,[\s\S]*?boxSizing: 'border-box'/,
  'Battle Shop tabs must keep their natural height when Marketplace owns vertical scrolling',
);
assert.match(
  battleShop,
  /shopActionRow:\s*\{[\s\S]*?flex: '0 0 auto'/,
  'Battle Shop action row must not collapse under Marketplace overflow',
);
assert.match(
  battleShop,
  /chainSwitchPanel:\s*\{[\s\S]*?flex: '0 0 auto'/,
  'Battle Shop chain picker must not collapse under Marketplace overflow',
);
assert.doesNotMatch(constructionShop, /SanctumLstPanel|activeTab === 'Web3'|SANCTUM LST/);
assert.match(sanctumTab, /const SANCTUM_STAKE_URL = 'https:\/\/app\.sanctum\.so\/stake\/clashSOL'/);
assert.match(sanctumTab, /const EMBEDDED_SWAP_ENABLED = false/);
assert.match(sanctumTab, /useState\('rewards'\)/);
assert.match(sanctumTab, /Stake SOL for clashSOL/);
assert.match(sanctumTab, /Official Sanctum app · clashSOL preselected/);
assert.match(sanctumTab, /target="_blank" rel="noopener noreferrer"/);
assert.match(sanctumTab, /The swap happens entirely on Sanctum/);
assert.match(sanctumTab, /Link the same holder wallet below/);
assert.match(sanctumTab, /Hold through the UTC day; Gold matures the next day/);
assert.match(sanctumTab, /EMBEDDED_SWAP_ENABLED && section === 'swap'/);
assert.match(sanctumTab, /EMBEDDED_SWAP_ENABLED && progressOpen && swapProgress/);
assert.doesNotMatch(
  sanctumTab.slice(sanctumTab.indexOf('<nav className="sanctum-shop__nav"'), sanctumTab.indexOf('</nav>', sanctumTab.indexOf('<nav className="sanctum-shop__nav"'))),
  /\['swap', 'Swap'\]/,
  'The in-app swap tab must stay hidden while Sanctum owns transaction execution',
);
assert.match(sanctumTab, /SOL → clashSOL/);
assert.match(sanctumTab, /clashSOL → SOL/);
assert.match(sanctumTab, /Daily Gold/);
assert.match(sanctumTab, /History/);
assert.match(sanctumTab, /onGodotMessage/);
assert.match(sanctumTab, /Hold through the UTC day; Gold matures the next day/);
assert.match(sanctumTab, /Live APY metadata is delayed/);
assert.match(sanctumTab, /Est\. validator APY/);
assert.match(sanctumTab, /awaiting its first valid completed-epoch APY/);
assert.match(sanctumTab, /same validator vote account/);
assert.match(sanctumTab, /wallet may safely recalculate the standard Solana priority fee/);
assert.match(sanctumTab, /caps it at 0\.005 SOL and rejects any changed swap or added transfer/);
assert.match(sanctumTab, /Balance observations begin with the next scheduled sample/);
assert.match(sanctumTab, /per 1 clashSOL for each eligible UTC day/);
assert.match(sanctumTab, /You keep custody/);
assert.match(sanctumTab, /Unclaimed Gold is banked/);
assert.match(sanctumTab, /Lowest balance recorded/);
assert.match(sanctumTab, /Gold becomes claimable/);
assert.match(sanctumTab, /claimableNow/);
assert.match(sanctumTab, /gold_per_clashsol \?\? 2000/);
assert.match(sanctumTab, /getClashSolBalances/);
assert.match(sanctumTab, /Load older activity/);
assert.match(sanctumTab, /Confirm in wallet/);
assert.match(sanctumTab, /Submit to Solana/);
assert.match(sanctumTab, /Confirm on-chain/);
assert.match(sanctumTab, /Update balances/);
assert.match(sanctumTab, /submission_unknown/);
assert.match(sanctumTab, /getClashSolActiveOrder/);
assert.match(sanctumTab, /Could not restore the active swap/);
assert.match(sanctumTab, /activeSwapNonTerminal/);
assert.match(sanctumTab, /const swapControlsDisabled = busy \|\| activeSwapNonTerminal/);
assert.match(sanctumTab, /if \(activeSwapNonTerminal\) \{\s*setProgressOpen\(true\);\s*return;/s);
assert.match(sanctumTab, /disabled=\{swapControlsDisabled\}/);
assert.match(sanctumTab, /disabled=\{swapControlsDisabled \|\| availableInputAtomics <= 0n\}/);
assert.match(sanctumTab, /localStorage\.setItem/);
assert.match(sanctumTab, /order: resumableOrderSummary\(order\)/);
const persistedSwapBlock = sanctumTab.slice(
  sanctumTab.indexOf('localStorage.setItem'),
  sanctumTab.indexOf('localStorage.setItem') + 360,
);
assert.doesNotMatch(persistedSwapBlock, /signedTransaction|transaction:/);
assert.match(sanctumTab, /View on Solscan/);
assert.match(sanctumTab, /Minimize/);
assert.match(sanctumTab, /Swap in progress/);
assert.match(sanctumTab, /Submission status is still being checked/);
assert.match(sanctumTab, /priority fee above the 0\.005 SOL safety limit/);
assert.match(sanctumTab, /sanctum-swap-progress__body/);
assert.match(sanctumTab, /sanctum-swap-progress__footer-status/);
assert.match(sanctumTab, /aria-live="polite" aria-atomic="true"/);
assert.match(sanctumTab, /import \{ createPortal \} from 'react-dom'/);
assert.match(
  sanctumTab,
  /progressOpen && swapProgress && createPortal\(\([\s\S]*?sanctum-swap-progress__backdrop[\s\S]*?\), document\.body\)/,
  'Swap progress must portal to document.body instead of the transformed Battle Shop carousel',
);
assert.match(
  sanctumTab,
  /event\.key === 'Escape'[\s\S]*?if \(progressTerminal\) clearSwapProgress\(\);[\s\S]*?else setProgressOpen\(false\);/,
  'Escape must minimize an active swap and clear terminal progress',
);
assert.match(sanctumClient, /getClashSolOrderStatus/);
assert.match(sanctumClient, /getClashSolActiveOrder/);
assert.match(sanctumClient, /API_REQUEST_TIMEOUT_MS = 8_000/);
assert.match(sanctumClient, /controller\.abort\(\)/);
assert.match(sanctumClient, /CLIENT_TIMEOUT/);
assert.match(sanctumCss, /@media \(max-width: 480px\)/);
assert.match(sanctumCss, /\.sanctum-swap-progress__backdrop/);
assert.match(sanctumCss, /\.sanctum-swap-progress__backdrop[^}]*z-index: 18000/s);
assert.match(
  sanctumCss,
  /\.sanctum-swap-progress__backdrop[^}]*inset: 0[^}]*width: 100vw[^}]*height: 100dvh[^}]*box-sizing: border-box/s,
  'Portal backdrop must cover the complete viewport even when html reserves a stable scrollbar gutter',
);
assert.match(sanctumCss, /\.sanctum-swap-progress__backdrop[^}]*-webkit-backdrop-filter: blur\(5px\)[^}]*backdrop-filter: blur\(5px\)/s);
assert.match(sanctumCss, /width: min\(480px, calc\(100vw - 32px\)\)/);
assert.match(sanctumCss, /max-height: min\(760px, calc\(100dvh - 32px\)\)/);
assert.match(sanctumCss, /\.sanctum-swap-progress__body[^}]*overflow-x: hidden[^}]*overflow-y: auto[^}]*scrollbar-gutter: stable/s);
assert.doesNotMatch(sanctumCss, /\.sanctum-swap-progress__header[^}]*position: sticky/s);
assert.doesNotMatch(sanctumCss, /\.sanctum-swap-progress__actions[^}]*position: sticky/s);
assert.match(sanctumCss, /width: 100vw; height: 100dvh; max-height: 100dvh; border: 0; border-radius: 0/);
assert.match(sanctumCss, /env\(safe-area-inset-bottom\)/);
assert.match(sanctumCss, /@media \(min-width: 481px\) and \(max-height: 600px\) and \(orientation: landscape\)/);
assert.match(sanctumCss, /@keyframes sanctum-swap-spin/);
assert.match(sanctumCss, /prefers-reduced-motion[\s\S]*\.sanctum-swap-progress__spinner/);
assert.match(sanctumCss, /\.sanctum-shop > \* \{ flex: 0 0 auto; \}/);
assert.match(sanctumCss, /\.sanctum-shop__stake-steps/);
assert.match(sanctumCss, /\.sanctum-shop__stake-cta/);
assert.match(sanctumCss, /\.sanctum-shop__benefits/);
assert.match(sanctumCss, /\.sanctum-shop__reward-timeline/);
assert.doesNotMatch(sanctumCss, /\.sanctum-shop__history[^}]*overflow-y/u);
assert.doesNotMatch(`${sanctumTab}\n${sanctumClient}`, /SANCTUM_API_KEY|apiKey=/);

console.log('clashSOL Battle Shop tests passed: official Sanctum staking handoff, holder rewards, activity, and client-side secret boundary.');
