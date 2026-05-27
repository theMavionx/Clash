import { getAddress } from 'viem';

export const CUSTODIAL_EVM_CHAIN_IDS = {
  base: 8453,
  arbitrum: 42161,
  monad: 143,
};

const ERC20_TRANSFER_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const ERC721_TRANSFER_ABI = [
  { name: 'safeTransferFrom', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
];

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'x-token': token } : {}),
  };
}

async function apiJson(url, { method = 'GET', token, body, signal } = {}) {
  const res = await fetch(url, {
    method,
    headers: method === 'GET' ? (token ? { 'x-token': token } : {}) : authHeaders(token),
    body: body == null ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json?.error || `${url} failed (${res.status})`), { status: res.status, body: json });
  return json;
}

export function formatCustodialUnits(units, decimals = 6) {
  const raw = BigInt(String(units || '0'));
  const d = Math.max(0, Number(decimals) || 0);
  const scale = 10n ** BigInt(d);
  const whole = scale > 0n ? raw / scale : raw;
  const frac = scale > 0n ? (raw % scale).toString().padStart(d, '0').replace(/0+$/, '') : '';
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function formatCustodialUsdc(units) {
  return formatCustodialUnits(units, 6);
}

function walletAdapterName(solWallet) {
  return String(
    solWallet?.wallet?.adapter?.name
    || solWallet?.adapter?.name
    || solWallet?.wallet?.name
    || solWallet?.walletClientType
    || '',
  );
}

function isMobileWalletAdapter(solWallet) {
  return /Mobile Wallet Adapter/i.test(walletAdapterName(solWallet));
}

function base64AddressToBase58(address, PublicKey) {
  if (!address) return null;
  try {
    const decode = typeof atob === 'function'
      ? (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
      : (value) => Uint8Array.from(Buffer.from(value, 'base64'));
    return new PublicKey(decode(address)).toBase58();
  } catch {
    return null;
  }
}

function solanaMobileAppIdentity() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://clashofperps.fun';
  return {
    name: 'Clash of Perps',
    uri: origin,
    icon: '/icons/icon-512.png',
  };
}

async function sendSolanaMobileProtocolTransaction({ transaction, options, expectedAddress, PublicKey }) {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
  return transact(async (wallet) => {
    const authorization = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: solanaMobileAppIdentity(),
      features: ['solana:signAndSendTransactions'],
    });
    const authorizedAddress = base64AddressToBase58(authorization?.accounts?.[0]?.address, PublicKey);
    if (expectedAddress && authorizedAddress && authorizedAddress !== expectedAddress) {
      throw new Error(`Mobile wallet authorized ${authorizedAddress}, but the connected marketplace wallet is ${expectedAddress}`);
    }
    const [signature] = await wallet.signAndSendTransactions({
      auth_token: authorization.auth_token,
      transactions: [transaction],
      commitment: options?.preflightCommitment || 'confirmed',
      skipPreflight: !!options?.skipPreflight,
      maxRetries: options?.maxRetries,
    });
    return signature;
  });
}

function solanaWalletTxOptions({ solWallet, owner, PublicKey, label }) {
  const adapterName = walletAdapterName(solWallet) || 'wallet';
  const mobileWalletAdapter = isMobileWalletAdapter(solWallet);
  const canSendSolanaTx = typeof solWallet?.sendTransaction === 'function' || mobileWalletAdapter;
  const canSignSolanaTx = typeof solWallet?.signTransaction === 'function';
  if (!canSendSolanaTx && !canSignSolanaTx) {
    throw new Error('This Solana wallet cannot sign transactions');
  }
  return {
    sendTransaction: canSendSolanaTx
      ? (tx, conn, opts) => (
          mobileWalletAdapter
            ? sendSolanaMobileProtocolTransaction({
                transaction: tx,
                options: opts,
                expectedAddress: owner,
                PublicKey,
              })
            : solWallet.sendTransaction(tx, conn, opts)
        )
      : null,
    signTransaction: canSendSolanaTx && solWallet?.source !== 'privy'
      ? null
      : (canSignSolanaTx ? (tx) => solWallet.signTransaction(tx) : null),
    preferWalletSendTransaction: canSendSolanaTx,
    forceVersionedTransaction: mobileWalletAdapter,
    walletPathOverride: mobileWalletAdapter ? 'mwa_protocol_sign_and_send' : null,
    label: `${label}.${adapterName}`,
  };
}

export async function fetchCustodialMarketplaceConfig({ signal } = {}) {
  return apiJson('/api/marketplace/custodial/config', { signal });
}

export async function fetchCustodialListings({ status = 'active', assetChain = '', level = 'all', sort = 'newest', limit = 50, offset = 0, signal } = {}) {
  const params = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
  if (assetChain) params.set('assetChain', assetChain);
  if (level && level !== 'all') params.set('level', String(level));
  if (sort) params.set('sort', String(sort));
  return apiJson(`/api/marketplace/custodial/listings?${params.toString()}`, { signal });
}

export async function fetchMyCustodialOrders({ token, signal } = {}) {
  return apiJson('/api/marketplace/custodial/orders/mine', { token, signal });
}

export async function fetchCustodialOrder({ token, orderId, signal } = {}) {
  return apiJson(`/api/marketplace/custodial/orders/${encodeURIComponent(orderId)}`, { token, signal });
}

export async function createCustodialListing({
  token,
  assetChain,
  assetId,
  sellerWallet,
  sellerPayoutChain,
  sellerPayoutAddress,
  priceUsdc,
}) {
  return apiJson('/api/marketplace/custodial/listings', {
    method: 'POST',
    token,
    body: { assetChain, assetId, sellerWallet, sellerPayoutChain, sellerPayoutAddress, priceUsdc },
  });
}

export async function confirmCustodialDeposit({ token, orderId, txHash }) {
  return apiJson(`/api/marketplace/custodial/listings/${encodeURIComponent(orderId)}/deposit`, {
    method: 'POST',
    token,
    body: { txHash },
  });
}

export async function cancelCustodialListing({ token, orderId }) {
  return apiJson(`/api/marketplace/custodial/listings/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    token,
    body: {},
  });
}

export async function createCustodialBuyIntent({
  token,
  orderId,
  buyerWallet,
  paymentChain = 'base',
  destChain = 'base',
  destAddress,
}) {
  return apiJson(`/api/marketplace/custodial/orders/${encodeURIComponent(orderId)}/buy-intent`, {
    method: 'POST',
    token,
    body: { buyerWallet, paymentChain, destChain, destAddress },
  });
}

export async function confirmCustodialPayment({ token, orderId, txHash }) {
  return apiJson(`/api/marketplace/custodial/orders/${encodeURIComponent(orderId)}/payment`, {
    method: 'POST',
    token,
    body: { txHash },
  });
}

export async function releaseCustodialReservation({ token, orderId, reason = 'payment_not_submitted' }) {
  return apiJson(`/api/marketplace/custodial/orders/${encodeURIComponent(orderId)}/release-reservation`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

async function ensureEvmChain(evmWallet, chainId) {
  if (typeof evmWallet?.ensureChain === 'function') {
    await evmWallet.ensureChain(chainId);
    return;
  }
  const provider = evmWallet?.provider;
  if (!provider?.request) return;
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${Number(chainId).toString(16)}` }],
  });
}

async function waitForAptosTx(txHash, label = 'Aptos transaction') {
  const fullnode = (typeof window !== 'undefined' && window.APTOS_FULLNODE)
    || 'https://fullnode.mainnet.aptoslabs.com/v1';
  for (let i = 0; i < 40; i += 1) {
    const r = await fetch(`${fullnode}/transactions/by_hash/${txHash}`).catch(() => null);
    if (r && r.ok) {
      const data = await r.json().catch(() => null);
      if (data?.success === true) return data;
      if (data?.success === false) throw new Error(`${label} failed on-chain: ${data?.vm_status || 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${label} was submitted but confirmation timed out`);
}

function aptosSubmitHash(result) {
  return result?.hash || result?.txnHash || result?.transactionHash || result?.signature || result;
}

export async function payCustodialOrderOnEvm({
  evmWallet,
  buyerWallet,
  token,
  orderId,
  paymentChain = 'base',
  destChain = 'base',
  destAddress,
  onProgress,
}) {
  if (!token) throw new Error('Game session is not ready');
  if (!evmWallet || !buyerWallet) throw new Error('EVM wallet is not connected');
  onProgress?.({ step: 'reservation', status: 'active' });
  const intent = await createCustodialBuyIntent({
    token,
    orderId,
    buyerWallet,
    paymentChain,
    destChain,
    destAddress: destAddress || buyerWallet,
  });
  const order = intent.order;
  const payment = order?.payment;
  onProgress?.({ step: 'reservation', status: 'complete', order });
  const chainId = CUSTODIAL_EVM_CHAIN_IDS[payment?.chain || paymentChain];
  if (!payment?.treasury || !payment?.tokenAddress || !payment?.amountTokenUnits || !chainId) {
    throw new Error('Payment intent is incomplete');
  }

  await ensureEvmChain(evmWallet, chainId);
  const publicClient = evmWallet.getPublicClient?.(chainId);
  const walletClient = evmWallet.getWalletClient?.(chainId);
  if (!publicClient || !walletClient) throw new Error('EVM wallet client is not ready');

  const amount = BigInt(payment.amountTokenUnits);
  const usdc = getAddress(payment.tokenAddress);
  const treasury = getAddress(payment.treasury);
  const buyer = getAddress(buyerWallet);
  const balance = await publicClient.readContract({
    address: usdc,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'balanceOf',
    args: [buyer],
  });
  if (BigInt(balance) < amount) {
    throw new Error(`Not enough USDC. Need ${formatCustodialUnits(amount, payment.decimals)}, wallet has ${formatCustodialUnits(balance, payment.decimals)}.`);
  }
  onProgress?.({ step: 'payment', status: 'active', order });
  const txHash = await walletClient.writeContract({
    address: usdc,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [treasury, amount],
  });
  onProgress?.({ step: 'payment', status: 'submitted', order, txHash });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  onProgress?.({ step: 'payment', status: 'complete', order, txHash });
  onProgress?.({ step: 'transfer', status: 'active', order, txHash });
  const confirmed = await confirmCustodialPayment({ token, orderId, txHash });
  onProgress?.({ step: 'transfer', status: confirmed?.order?.status === 'delivered' ? 'complete' : 'active', order: confirmed?.order, txHash });
  return { intent, txHash, confirmed };
}

export async function payCustodialOrderOnSolana({
  solWallet,
  buyerWallet,
  token,
  orderId,
  destChain,
  destAddress,
  onProgress,
}) {
  if (!token) throw new Error('Game session is not ready');
  const owner = buyerWallet || solWallet?.publicKey?.toBase58?.();
  if (!owner) throw new Error('Solana wallet is not connected');
  onProgress?.({ step: 'reservation', status: 'active' });
  const intent = await createCustodialBuyIntent({
    token,
    orderId,
    buyerWallet: owner,
    paymentChain: 'solana',
    destChain,
    destAddress: destAddress || owner,
  });
  const payment = intent.order?.payment;
  onProgress?.({ step: 'reservation', status: 'complete', order: intent.order });
  if (!payment?.treasury || !payment?.tokenAddress || !payment?.amountTokenUnits) throw new Error('Payment intent is incomplete');

  const [
    { Connection, PublicKey },
    splToken,
    { SAME_ORIGIN_SOLANA_RPC_URL, DEFAULT_SOLANA_RPC_URL, createSolanaConnection },
    { sendSolanaTransactionWithRetry },
  ] = await Promise.all([
    import('@solana/web3.js'),
    import('@solana/spl-token'),
    import('./solanaRpc'),
    import('./solanaTx'),
  ]);
  const connection = createSolanaConnection(Connection, SAME_ORIGIN_SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL, 'confirmed');
  const ownerPk = new PublicKey(owner);
  const mintPk = new PublicKey(payment.tokenAddress);
  const treasuryPk = new PublicKey(payment.treasury);
  const sourceAta = await splToken.getAssociatedTokenAddress(mintPk, ownerPk, false, splToken.TOKEN_PROGRAM_ID);
  const treasuryAta = await splToken.getAssociatedTokenAddress(mintPk, treasuryPk, false, splToken.TOKEN_PROGRAM_ID);
  const amount = BigInt(payment.amountTokenUnits);
  const instructions = [
    splToken.createAssociatedTokenAccountIdempotentInstruction(
      ownerPk,
      treasuryAta,
      treasuryPk,
      mintPk,
      splToken.TOKEN_PROGRAM_ID,
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    splToken.createTransferCheckedInstruction(
      sourceAta,
      mintPk,
      treasuryAta,
      ownerPk,
      amount,
      payment.decimals || 6,
      [],
      splToken.TOKEN_PROGRAM_ID,
    ),
  ];
  onProgress?.({ step: 'payment', status: 'active', order: intent.order });
  const txHash = await sendSolanaTransactionWithRetry({
    instructions,
    ownerPk,
    connection,
    ...solanaWalletTxOptions({
      solWallet,
      owner,
      PublicKey,
      label: 'custodial_marketplace.payment_solana',
    }),
    maxAttempts: 4,
    priorityFeeMicroLamports: 250_000,
  });
  onProgress?.({ step: 'payment', status: 'complete', order: intent.order, txHash });
  onProgress?.({ step: 'transfer', status: 'active', order: intent.order, txHash });
  const confirmed = await confirmCustodialPayment({ token, orderId, txHash });
  onProgress?.({ step: 'transfer', status: confirmed?.order?.status === 'delivered' ? 'complete' : 'active', order: confirmed?.order, txHash });
  return { intent, txHash, confirmed };
}

export async function payCustodialOrderOnAptos({
  aptosWallet,
  buyerWallet,
  token,
  orderId,
  destChain,
  destAddress,
  onProgress,
}) {
  if (!token) throw new Error('Game session is not ready');
  const buyer = buyerWallet || aptosWallet?.address;
  if (!buyer) throw new Error('Aptos wallet is not connected');
  onProgress?.({ step: 'reservation', status: 'active' });
  const intent = await createCustodialBuyIntent({
    token,
    orderId,
    buyerWallet: buyer,
    paymentChain: 'aptos',
    destChain,
    destAddress: destAddress || buyer,
  });
  const payment = intent.order?.payment;
  onProgress?.({ step: 'reservation', status: 'complete', order: intent.order });
  if (!payment?.treasury || !payment?.tokenAddress || !payment?.amountTokenUnits) throw new Error('Payment intent is incomplete');
  const submitFn = aptosWallet?.loginSignAndSubmit || aptosWallet?.signAndSubmitTransaction || aptosWallet?.signAndSubmit;
  if (typeof submitFn !== 'function') throw new Error('Connected Aptos wallet cannot sign transactions');
  onProgress?.({ step: 'payment', status: 'active', order: intent.order });
  const result = await submitFn.call(aptosWallet, {
    data: {
      function: '0x1::primary_fungible_store::transfer',
      typeArguments: ['0x1::fungible_asset::Metadata'],
      functionArguments: [payment.tokenAddress, payment.treasury, String(payment.amountTokenUnits)],
    },
  });
  const txHash = aptosSubmitHash(result);
  if (!txHash) throw new Error('Aptos tx submission returned no hash');
  onProgress?.({ step: 'payment', status: 'submitted', order: intent.order, txHash });
  await waitForAptosTx(txHash, 'Aptos marketplace payment');
  onProgress?.({ step: 'payment', status: 'complete', order: intent.order, txHash });
  onProgress?.({ step: 'transfer', status: 'active', order: intent.order, txHash });
  const confirmed = await confirmCustodialPayment({ token, orderId, txHash });
  onProgress?.({ step: 'transfer', status: confirmed?.order?.status === 'delivered' ? 'complete' : 'active', order: confirmed?.order, txHash });
  return { intent, txHash, confirmed };
}

export async function payCustodialOrder({
  evmWallet,
  solWallet,
  aptosWallet,
  buyerWallet,
  token,
  orderId,
  paymentChain = 'base',
  destChain,
  destAddress,
  onProgress,
}) {
  if (CUSTODIAL_EVM_CHAIN_IDS[paymentChain]) {
    return payCustodialOrderOnEvm({ evmWallet, buyerWallet, token, orderId, paymentChain, destChain, destAddress, onProgress });
  }
  if (paymentChain === 'solana') {
    return payCustodialOrderOnSolana({ solWallet, buyerWallet, token, orderId, destChain, destAddress, onProgress });
  }
  if (paymentChain === 'aptos') {
    return payCustodialOrderOnAptos({ aptosWallet, buyerWallet, token, orderId, destChain, destAddress, onProgress });
  }
  throw new Error(`Unsupported payment chain ${paymentChain}`);
}

export async function depositEvmNftToCustody({
  evmWallet,
  token,
  order,
  owner,
}) {
  if (!token) throw new Error('Game session is not ready');
  const chainId = CUSTODIAL_EVM_CHAIN_IDS[order?.assetChain];
  if (!evmWallet || !owner || !chainId) throw new Error('EVM wallet is not connected');
  if (!order?.assetCollection || !order?.assetId || !order?.vaultAddress) throw new Error('Listing deposit data is incomplete');
  await ensureEvmChain(evmWallet, chainId);
  const publicClient = evmWallet.getPublicClient?.(chainId);
  const walletClient = evmWallet.getWalletClient?.(chainId);
  if (!publicClient || !walletClient) throw new Error('EVM wallet client is not ready');
  const txHash = await walletClient.writeContract({
    address: getAddress(order.assetCollection),
    abi: ERC721_TRANSFER_ABI,
    functionName: 'safeTransferFrom',
    args: [getAddress(owner), getAddress(order.vaultAddress), BigInt(order.assetId)],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  const confirmed = await confirmCustodialDeposit({ token, orderId: order.id, txHash });
  return { txHash, confirmed };
}

export async function depositToken2022NftToCustody({
  solWallet,
  token,
  order,
  nft = null,
}) {
  if (!token) throw new Error('Game session is not ready');
  const owner = solWallet?.publicKey?.toBase58?.();
  if (!owner) throw new Error('Solana wallet is not connected');
  if (!order?.assetId || !order?.vaultAddress) throw new Error('Listing deposit data is incomplete');
  if (nft?.standard && nft.standard !== 'token2022') {
    throw new Error('Automatic custody deposit currently supports Token-2022 Demon King NFTs only');
  }

  const [
    { Connection, PublicKey },
    splToken,
    { SAME_ORIGIN_SOLANA_RPC_URL, DEFAULT_SOLANA_RPC_URL, createSolanaConnection },
    { sendSolanaTransactionWithRetry },
  ] = await Promise.all([
    import('@solana/web3.js'),
    import('@solana/spl-token'),
    import('./solanaRpc'),
    import('./solanaTx'),
  ]);

  const connection = createSolanaConnection(Connection, SAME_ORIGIN_SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL, 'confirmed');
  const ownerPk = new PublicKey(owner);
  const mintPk = new PublicKey(order.assetId);
  const vaultPk = new PublicKey(order.vaultAddress);
  const tokenProgram = splToken.TOKEN_2022_PROGRAM_ID;
  const sourceAta = nft?.tokenAccount
    ? new PublicKey(nft.tokenAccount)
    : await splToken.getAssociatedTokenAddress(mintPk, ownerPk, false, tokenProgram);
  const vaultAta = await splToken.getAssociatedTokenAddress(mintPk, vaultPk, false, tokenProgram);

  const instructions = [
    splToken.createAssociatedTokenAccountIdempotentInstruction(
      ownerPk,
      vaultAta,
      vaultPk,
      mintPk,
      tokenProgram,
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    splToken.createTransferCheckedInstruction(
      sourceAta,
      mintPk,
      vaultAta,
      ownerPk,
      1,
      0,
      [],
      tokenProgram,
    ),
  ];

  const txHash = await sendSolanaTransactionWithRetry({
    instructions,
    ownerPk,
    connection,
    ...solanaWalletTxOptions({
      solWallet,
      owner,
      PublicKey,
      label: 'custodial_marketplace.deposit_solana_token2022',
    }),
    maxAttempts: 4,
    priorityFeeMicroLamports: 250_000,
  });
  const confirmed = await confirmCustodialDeposit({ token, orderId: order.id, txHash });
  return { txHash, confirmed };
}

export async function depositCoreNftToCustody({
  solWallet,
  token,
  order,
}) {
  if (!token) throw new Error('Game session is not ready');
  const owner = solWallet?.publicKey?.toBase58?.();
  if (!owner) throw new Error('Solana wallet is not connected');
  if (!order?.assetId || !order?.vaultAddress) throw new Error('Listing deposit data is incomplete');

  const [
    { createUmi },
    { publicKey, createNoopSigner },
    { mplCore, fetchAsset, fetchCollection, transfer },
    { toWeb3JsInstruction },
    { Connection, PublicKey },
    { DEFAULT_SOLANA_RPC_URL, selectFreshSolanaRpcUrl, solanaBatchSafeRpcUrl, createSolanaConnection },
    { sendSolanaTransactionWithRetry },
  ] = await Promise.all([
    import('@metaplex-foundation/umi-bundle-defaults'),
    import('@metaplex-foundation/umi'),
    import('@metaplex-foundation/mpl-core'),
    import('@metaplex-foundation/umi-web3js-adapters'),
    import('@solana/web3.js'),
    import('./solanaRpc'),
    import('./solanaTx'),
  ]);

  const rpcProbe = await selectFreshSolanaRpcUrl(undefined, { timeoutMs: 2500 }).catch(() => ({ selected: null }));
  const rpcUrl = solanaBatchSafeRpcUrl(rpcProbe.selected?.url || DEFAULT_SOLANA_RPC_URL);
  const umi = createUmi(rpcUrl).use(mplCore());
  const ownerPk = new PublicKey(owner);
  const ownerSigner = createNoopSigner(publicKey(owner));
  const asset = await fetchAsset(umi, publicKey(order.assetId));
  const updateAuthority = asset?.updateAuthority;
  const collectionAddress = updateAuthority?.__kind === 'Collection'
    ? String(updateAuthority.fields?.[0] || '')
    : '';
  const collection = collectionAddress
    ? await fetchCollection(umi, publicKey(collectionAddress)).catch(() => null)
    : null;
  const builder = transfer(umi, {
    asset,
    ...(collection ? { collection } : {}),
    payer: ownerSigner,
    authority: ownerSigner,
    newOwner: publicKey(order.vaultAddress),
  });
  const instructions = builder.getInstructions().map(toWeb3JsInstruction);
  const connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
  const txHash = await sendSolanaTransactionWithRetry({
    instructions,
    ownerPk,
    connection,
    ...solanaWalletTxOptions({
      solWallet,
      owner,
      PublicKey,
      label: 'custodial_marketplace.deposit_solana_core',
    }),
    maxAttempts: 4,
    priorityFeeMicroLamports: 250_000,
  });
  const confirmed = await confirmCustodialDeposit({ token, orderId: order.id, txHash });
  return { txHash, confirmed };
}

export async function depositAptosNftToCustody({
  aptosWallet,
  token,
  order,
}) {
  if (!token) throw new Error('Game session is not ready');
  if (!aptosWallet?.address) throw new Error('Aptos wallet is not connected');
  if (!order?.assetId || !order?.vaultAddress) throw new Error('Listing deposit data is incomplete');
  const submitFn = aptosWallet.loginSignAndSubmit || aptosWallet.signAndSubmitTransaction || aptosWallet.signAndSubmit;
  if (typeof submitFn !== 'function') throw new Error('Connected Aptos wallet cannot sign transactions');
  const result = await submitFn.call(aptosWallet, {
    data: {
      function: '0x1::object::transfer',
      typeArguments: ['0x4::token::Token'],
      functionArguments: [order.assetId, order.vaultAddress],
    },
  });
  const txHash = aptosSubmitHash(result);
  if (!txHash) throw new Error('Aptos tx submission returned no hash');
  await waitForAptosTx(txHash, 'Aptos marketplace NFT deposit');
  const confirmed = await confirmCustodialDeposit({ token, orderId: order.id, txHash });
  return { txHash, confirmed };
}

export async function depositNftToCustody({
  evmWallet,
  solWallet,
  aptosWallet,
  token,
  order,
  nft = null,
  owner,
}) {
  const chain = order?.assetChain || nft?.chain;
  if (CUSTODIAL_EVM_CHAIN_IDS[chain]) return depositEvmNftToCustody({ evmWallet, token, order, owner });
  if (chain === 'solana' && nft?.standard === 'token2022') return depositToken2022NftToCustody({ solWallet, token, order, nft });
  if (chain === 'solana') return depositCoreNftToCustody({ solWallet, token, order, nft });
  if (chain === 'aptos') return depositAptosNftToCustody({ aptosWallet, token, order });
  throw new Error(`Unsupported NFT chain ${chain || ''}`);
}
