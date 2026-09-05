import bs58 from 'bs58';

function publicKeyText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value?.toBase58?.() || value?.toString?.() || '';
}

function signatureBytes(value) {
  const signature = value?.signature ?? value;
  if (signature instanceof Uint8Array) return signature;
  if (Array.isArray(signature)) return Uint8Array.from(signature);
  if (typeof signature === 'string') {
    if (/^(?:0x)?[0-9a-f]{128}$/i.test(signature)) {
      const hex = signature.startsWith('0x') ? signature.slice(2) : signature;
      return Uint8Array.from(hex.match(/.{2}/g), byte => Number.parseInt(byte, 16));
    }
    try {
      const decoded = Uint8Array.from(bs58.decode(signature));
      if (decoded.length === 64) return decoded;
    } catch { /* try base64 below */ }
    try {
      const decoded = Uint8Array.from(globalThis.atob(signature), char => char.charCodeAt(0));
      if (decoded.length === 64) return decoded;
    } catch { /* invalid encoded signature */ }
  }
  return null;
}

function matchingPhantomProvider(adapterAddress, provider) {
  if (!adapterAddress || !provider?.isPhantom || typeof provider.request !== 'function') return null;
  return publicKeyText(provider.publicKey) === adapterAddress ? provider : null;
}

export async function signBulkMessage({
  message,
  adapterAddress,
  solWallet,
  privyWallet,
  privySignMessage,
  phantomProvider = globalThis.window?.phantom?.solana || globalThis.window?.solana,
}) {
  if (adapterAddress) {
    const phantom = matchingPhantomProvider(adapterAddress, phantomProvider);
    if (phantom) {
      // Bulk's documented offchain format is a binary Solana v0 envelope.
      // Phantom's generic wallet-adapter path assumes UTF-8 and can reject
      // binary envelopes as disguised transactions. Its provider API exposes
      // the supported hexadecimal display mode for this exact case.
      const result = await phantom.request({
        method: 'signMessage',
        params: { message, display: 'hex' },
      });
      const bytes = signatureBytes(result);
      if (bytes) return bytes;
      throw new Error('Phantom returned an invalid Bulk message signature.');
    }
    if (typeof solWallet?.signMessage === 'function') return solWallet.signMessage(message);
  }

  if (privyWallet && privySignMessage) {
    const result = await privySignMessage({ message, wallet: privyWallet });
    const bytes = signatureBytes(result);
    if (bytes) return bytes;
  }

  throw new Error('Connect a Solana wallet that supports message signing.');
}
