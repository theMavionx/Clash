export const USER_DISMISSED_WALLET_RE = /not authorized|authorized by the user|user rejected|user denied|declined|cancel/i;

export function isUserDismissedWalletError(error) {
  const name = error?.name || '';
  const message = error?.message || String(error || '');
  return name === 'WalletConnectionError' && USER_DISMISSED_WALLET_RE.test(message);
}

export function isPhantomInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Phantom\/(ios|android)/i.test(navigator.userAgent || '');
}

export function adapterName(adapterOrWallet) {
  const adapter = adapterOrWallet?.adapter || adapterOrWallet;
  return adapter?.name || adapter?._wallet?.name || 'Solana wallet';
}

export function forgetSelectedWallet(localStorageKey, adapterOrWallet) {
  try {
    const selected = localStorage.getItem(localStorageKey);
    const name = adapterName(adapterOrWallet);
    if (!selected || selected === name || selected.includes(name) || name.includes(selected)) {
      localStorage.removeItem(localStorageKey);
    }
  } catch { /* private mode / quota etc - non-fatal */ }
}

function findWallet(wallets, pattern) {
  return (wallets || []).find((wallet) => pattern.test(adapterName(wallet)));
}

export function openSolanaWallet({ wallets, select, connect, openWalletModal, inFrame }) {
  if (inFrame) {
    const farcaster = findWallet(wallets, /farcaster/i);
    if (farcaster) {
      select(farcaster.adapter.name);
      setTimeout(() => {
        Promise.resolve(connect()).catch(() => {});
      }, 100);
      return;
    }
  }

  if (isPhantomInAppBrowser()) {
    const phantom = findWallet(wallets, /phantom/i);
    if (phantom) {
      select(phantom.adapter.name);
      setTimeout(() => {
        Promise.resolve(connect()).catch((error) => {
          if (!isUserDismissedWalletError(error)) openWalletModal(true);
        });
      }, 100);
      return;
    }
  }

  openWalletModal(true);
}
