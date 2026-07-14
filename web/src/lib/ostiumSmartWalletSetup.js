/**
 * Compat shim — Futures Ostium one-tap lives in ostiumOneTapSetup.js /
 * ostiumDelegateWallet.js. Keep old import paths working for Bots.
 */
export {
  enableOstiumOneTap as enableOstiumSmartWallet,
  refreshOstiumOneTapStatus as refreshOstiumSmartWalletStatus,
  enableOstiumOneTap,
  refreshOstiumOneTapStatus,
} from './ostiumOneTapSetup';
