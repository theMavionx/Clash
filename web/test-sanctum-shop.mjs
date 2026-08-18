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
assert.doesNotMatch(constructionShop, /SanctumLstPanel|activeTab === 'Web3'|SANCTUM LST/);
assert.match(sanctumTab, /SOL → clashSOL/);
assert.match(sanctumTab, /clashSOL → SOL/);
assert.match(sanctumTab, /Daily Gold/);
assert.match(sanctumTab, /History/);
assert.match(sanctumTab, /onGodotMessage/);
assert.match(sanctumTab, /Hold clashSOL today; Gold is calculated tomorrow/);
assert.match(sanctumTab, /Live APY metadata is delayed/);
assert.match(sanctumTab, /Balance observations begin with the next scheduled sample/);
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
assert.match(sanctumTab, /sanctum-swap-progress__body/);
assert.match(sanctumTab, /sanctum-swap-progress__footer-status/);
assert.match(sanctumTab, /aria-live="polite" aria-atomic="true"/);
assert.match(sanctumClient, /getClashSolOrderStatus/);
assert.match(sanctumClient, /getClashSolActiveOrder/);
assert.match(sanctumClient, /API_REQUEST_TIMEOUT_MS = 8_000/);
assert.match(sanctumClient, /controller\.abort\(\)/);
assert.match(sanctumClient, /CLIENT_TIMEOUT/);
assert.match(sanctumCss, /@media \(max-width: 480px\)/);
assert.match(sanctumCss, /\.sanctum-swap-progress__backdrop/);
assert.match(sanctumCss, /\.sanctum-swap-progress__body[^}]*overflow-y: auto/s);
assert.match(sanctumCss, /max-height: 100dvh/);
assert.match(sanctumCss, /env\(safe-area-inset-bottom\)/);
assert.match(sanctumCss, /@keyframes sanctum-swap-spin/);
assert.match(sanctumCss, /prefers-reduced-motion[\s\S]*\.sanctum-swap-progress__spinner/);
assert.match(sanctumCss, /\.sanctum-shop > \* \{ flex: 0 0 auto; \}/);
assert.doesNotMatch(sanctumCss, /\.sanctum-shop__history[^}]*overflow-y/u);
assert.doesNotMatch(`${sanctumTab}\n${sanctumClient}`, /SANCTUM_API_KEY|apiKey=/);

console.log('clashSOL Battle Shop tests passed: placement, bidirectional swap UI, auth proof, rewards, and client-side secret boundary.');
