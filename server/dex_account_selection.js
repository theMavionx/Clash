'use strict';

function planDexAccountWalletUpdate({
  venueWallet = '',
  existingVenueWallet = '',
  loginWallet = '',
  loginChainType = null,
  metadata = {},
} = {}) {
  if (venueWallet) {
    return {
      wallet: venueWallet,
      status: 'ready',
      metadata: { ...metadata },
    };
  }
  const mismatchMetadata = loginWallet
    ? {
        ignored_wallet: loginWallet,
        ignored_chain_type: loginChainType,
      }
    : {};
  if (existingVenueWallet) {
    return {
      wallet: existingVenueWallet,
      status: 'ready',
      metadata: {
        ...metadata,
        ...mismatchMetadata,
        preserved_wallet: existingVenueWallet,
        preserved_because: 'login_wallet_chain_mismatch',
      },
    };
  }
  return {
    wallet: '',
    status: 'disconnected',
    metadata: {
      ...metadata,
      ...mismatchMetadata,
      ...(loginWallet ? { __clear_wallet: true } : {}),
    },
  };
}

module.exports = { planDexAccountWalletUpdate };
