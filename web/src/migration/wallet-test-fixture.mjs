// Browser-only Wallet Standard fixture. Never signs or broadcasts real transactions.
export function installTestWallet({ wallet, publicKey, unsupportedAccount = false, name = 'Phantom' }) {
  const listeners = new Set();
  const account = { address: wallet, publicKey: new Uint8Array(publicKey), chains: ['solana:mainnet'], features: unsupportedAccount ? ['solana:signMessage'] : ['solana:signMessage', 'solana:signTransaction'] };
  window.signCalls = 0;
  window.messageCalls = 0;
  window.rejectMessage = false;
  window.connectCalls = 0;
  const emit = () => listeners.forEach(fn => fn({ accounts: standard.accounts }));
  const standard = {
    version: '1.0.0', name: 'Phantom', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjYWI5ZmYyIi8+PC9zdmc+',
    chains: ['solana:mainnet'], accounts: [],
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => { window.connectCalls++; standard.accounts = [account]; emit(); return { accounts: standard.accounts }; } },
      'standard:disconnect': { version: '1.0.0', disconnect: async () => { standard.accounts = []; emit(); } },
      'standard:events': { version: '1.0.0', on: (name, fn) => { if (name === 'change') listeners.add(fn); return () => listeners.delete(fn); } },
      'solana:signMessage': { version: '1.0.0', signMessage: async (...inputs) => { window.messageCalls++; if (window.rejectMessage) throw Object.assign(new Error('User rejected request'), { code: 4001 }); if (window.messageGate) await window.messageGate; return inputs.map(input => ({ signedMessage: input.message, signature: new Uint8Array(64) })); } },
      'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signTransaction: async (...inputs) => { window.signCalls++; if (window.transactionGate) await window.transactionGate; return inputs.map(input => ({ signedTransaction: input.transaction })); } },
    },
  };
  standard.name = name;
  window.mockWalletChange = () => { standard.accounts = []; emit(); };
  window.addEventListener('wallet-standard:app-ready', event => event.detail.register(standard));
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: api => api.register(standard) }));
}
