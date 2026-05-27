import { BASE_CHAIN_ID, ERC20_ABI } from './avantisContract';
import { DEFAULT_SOLANA_RPC_URL, createSolanaConnection, selectFreshSolanaRpcUrl, solanaBatchSafeRpcUrl } from './solanaRpc';

export const NFT_SALE_COLLECTION = 'mystery';

function nftCollectionPath(collection = NFT_SALE_COLLECTION) {
  const slug = String(collection || NFT_SALE_COLLECTION).trim() || NFT_SALE_COLLECTION;
  return `/api/nft/${encodeURIComponent(slug)}`;
}

export const NFT_SHOP_ABI = [
  {
    name: 'mintWithQuote',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'quote',
        type: 'tuple',
        components: [
          { name: 'buyer', type: 'address' },
          { name: 'paymentToken', type: 'address' },
          { name: 'unitPrice', type: 'uint256' },
          { name: 'quantity', type: 'uint256' },
          { name: 'usdPriceE6', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
];

export async function fetchNftMintConfig({ collection = NFT_SALE_COLLECTION } = {}) {
  const response = await fetch(`${nftCollectionPath(collection)}/mint/config`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`NFT config failed (${response.status})`);
  return response.json();
}

export async function fetchBaseMintQuote({ buyer, payment, quantity = 1, collection = NFT_SALE_COLLECTION }) {
  const response = await fetch(`${nftCollectionPath(collection)}/base/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyer, payment, quantity }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Quote failed (${response.status})`);
  return json;
}

export async function ensureErc20Allowance({ publicClient, walletClient, token, owner, spender, amount }) {
  const allowance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  });
  if (allowance >= amount) return null;

  const hash = await walletClient.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function mintBaseNft({ evmWallet, buyer, payment, quantity = 1, collection = NFT_SALE_COLLECTION }) {
  if (!evmWallet?.provider || !buyer) throw new Error('Base wallet is not connected');
  await evmWallet.ensureChain(BASE_CHAIN_ID);

  const quoteResponse = await fetchBaseMintQuote({ buyer, payment, quantity, collection });
  const quote = normalizeQuote(quoteResponse.quote);
  const shop = quoteResponse.shop;
  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID);
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  if (!publicClient || !walletClient) throw new Error('Base wallet client is not ready');

  const paymentToken = String(quote.paymentToken || '').toLowerCase();
  const nativePayment = /^0x0{40}$/i.test(paymentToken);
  const total = BigInt(quoteResponse.total);

  if (!nativePayment) {
    await ensureErc20Allowance({
      publicClient,
      walletClient,
      token: quote.paymentToken,
      owner: buyer,
      spender: shop,
      amount: total,
    });
  }

  const hash = await walletClient.writeContract({
    address: shop,
    abi: NFT_SHOP_ABI,
    functionName: 'mintWithQuote',
    args: [quote, quoteResponse.signature],
    value: nativePayment ? total : 0n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt, quote: quoteResponse };
}

// Mint on Arbitrum or Monad. Collection quote endpoints return the same
// shape as Base, so this helper mirrors mintBaseNft but parametrises the chain.
const EVM_NFT_CHAIN_IDS = { arbitrum: 42161, monad: 143 };

export async function fetchEvmMintQuote({ chain, buyer, payment, quantity = 1, collection = NFT_SALE_COLLECTION }) {
  const response = await fetch(`${nftCollectionPath(collection)}/${encodeURIComponent(chain)}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyer, payment, quantity }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Quote failed (${response.status})`);
  return json;
}

export async function mintEvmNft({ evmWallet, chain, buyer, payment, quantity = 1, collection = NFT_SALE_COLLECTION }) {
  const chainId = EVM_NFT_CHAIN_IDS[chain];
  if (!chainId) throw new Error(`mintEvmNft: unsupported chain "${chain}"`);
  if (!evmWallet?.provider || !buyer) throw new Error(`${chain} wallet is not connected`);
  await evmWallet.ensureChain(chainId);

  const quoteResponse = await fetchEvmMintQuote({ chain, buyer, payment, quantity, collection });
  const quote = normalizeQuote(quoteResponse.quote);
  const shop = quoteResponse.shop;
  const publicClient = evmWallet.getPublicClient(chainId);
  const walletClient = evmWallet.getWalletClient(chainId);
  if (!publicClient || !walletClient) throw new Error(`${chain} wallet client is not ready`);

  const paymentToken = String(quote.paymentToken || '').toLowerCase();
  const nativePayment = /^0x0{40}$/i.test(paymentToken);
  const total = BigInt(quoteResponse.total);

  if (!nativePayment) {
    await ensureErc20Allowance({
      publicClient,
      walletClient,
      token: quote.paymentToken,
      owner: buyer,
      spender: shop,
      amount: total,
    });
  }

  const hash = await walletClient.writeContract({
    address: shop,
    abi: NFT_SHOP_ABI,
    functionName: 'mintWithQuote',
    args: [quote, quoteResponse.signature],
    value: nativePayment ? total : 0n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt, quote: quoteResponse };
}

// Aptos NFT mint. The Move module accepts USDC through the legacy quote
// entrypoint and APT through the payment-aware quote entrypoint.
// Server signs an ed25519 quote that the Move function verifies on-chain
// before pulling the selected FA via primary_fungible_store::transfer.
//
// Caller passes `aptosWallet` from AptosWalletContext (its
// loginSignAndSubmit is what we invoke — wallet must already be connected
// as the buyer). The server returns vector<u8> fields as hex for JSON
// readability; convert them to byte arrays before handing them to the Aptos
// wallet adapter so Move receives the exact bytes the server signed.
export async function fetchAptosMintQuote({ buyer, quantity = 1, payment = 'usdc', collection = NFT_SALE_COLLECTION }) {
  const path = collection && collection !== 'demonking'
    ? `${nftCollectionPath(collection)}/aptos/quote`
    : '/api/nft/aptos/quote';
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyer, quantity, payment }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Aptos quote failed (${response.status})`);
  return json;
}

export async function mintAptosNft({ aptosWallet, buyer, quantity = 1, payment = 'usdc', collection = NFT_SALE_COLLECTION }) {
  if (!aptosWallet || !buyer) throw new Error('Aptos wallet is not connected');
  const quote = await fetchAptosMintQuote({ buyer, quantity, payment, collection });
  const functionArguments = normalizeAptosMintFunctionArguments(quote);

  const result = await aptosWallet.loginSignAndSubmit({
    data: {
      function: quote.callData.functionId,
      typeArguments: quote.callData.typeArguments || [],
      functionArguments,
    },
  });
  // Different wallets return slightly different shapes — Petra: { hash },
  // Pontem/Martian: { txnHash }. Normalize for the caller.
  const txHash = result?.hash || result?.txnHash || result;
  return { hash: txHash, quote };
}

function normalizeAptosMintFunctionArguments(quote) {
  const args = [...(quote?.callData?.functionArguments || [])];
  if (args.length === 6) {
    args[2] = aptosHexVectorArg(args[2], 'nonce');
    args[4] = aptosHexVectorArg(args[4], 'account_hash');
    args[5] = aptosHexVectorArg(args[5], 'signature', 64);
    return args;
  }
  if (args.length === 7) {
    args[3] = aptosHexVectorArg(args[3], 'nonce');
    args[5] = aptosHexVectorArg(args[5], 'account_hash');
    args[6] = aptosHexVectorArg(args[6], 'signature', 64);
    return args;
  }
  return args;
}

function aptosHexVectorArg(value, label, expectedLength = null) {
  if (Array.isArray(value)) {
    if (expectedLength != null && value.length !== expectedLength) {
      throw new Error(`Bad Aptos ${label}: expected ${expectedLength} bytes, got ${value.length}`);
    }
    return value;
  }
  if (value instanceof Uint8Array) return Array.from(value);
  const hex = String(value || '').replace(/^0x/i, '');
  if (hex.length === 0) return [];
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Bad Aptos ${label}: expected hex bytes`);
  }
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  if (expectedLength != null && bytes.length !== expectedLength) {
    throw new Error(`Bad Aptos ${label}: expected ${expectedLength} bytes, got ${bytes.length}`);
  }
  return bytes;
}

export async function mintSolanaNft({ solWallet, config, payment }) {
  const address = solWallet?.publicKey?.toBase58?.();
  if (!address) throw new Error('Solana wallet is not connected');
  if (!solWallet?.signTransaction) throw new Error('This Solana wallet cannot sign transactions');
  if (!config?.candyMachine || !config?.candyGuard || !config?.collection) {
    throw new Error('Solana Candy Machine is not configured');
  }
  if (!config.saleActive) throw new Error('Solana sale is closed');

  const group = payment === 'sol' ? 'sol' : payment === 'skr' ? 'skr' : 'usdc';
  const groupConfig = config.paymentGroups?.[group] || config.groups?.[group] || null;
  if (!groupConfig) throw new Error(`Solana ${group.toUpperCase()} payment is not configured`);

  const [
    { ComputeBudgetProgram, Connection, PublicKey: Web3PublicKey },
    { createUmi },
    { generateSigner, publicKey, signerIdentity, some },
    { mplCore },
    { mintV1, mplCandyMachine },
    { fromWeb3JsInstruction, fromWeb3JsTransaction, toWeb3JsTransaction },
    bs58Module,
    { sendSignedSolanaTransactionWithRetry },
  ] = await Promise.all([
    import('@solana/web3.js'),
    import('@metaplex-foundation/umi-bundle-defaults'),
    import('@metaplex-foundation/umi'),
    import('@metaplex-foundation/mpl-core'),
    import('@metaplex-foundation/mpl-core-candy-machine'),
    import('@metaplex-foundation/umi-web3js-adapters'),
    import('bs58'),
    import('./solanaTx'),
  ]);
  const bs58 = bs58Module.default || bs58Module;
  const rpcSelection = await selectFreshSolanaRpcUrl(undefined, { timeoutMs: 2500 }).catch(() => null);
  const rpcUrl = rpcSelection?.selected?.url || DEFAULT_SOLANA_RPC_URL;
  await assertSolanaMintBalances({
    Connection,
    Web3PublicKey,
    address,
    group,
    groupConfig,
    config,
    rpcUrl,
  });

  const walletSigner = createSolanaWalletSigner({
    publicKey,
    wallet: solWallet,
    toWeb3JsTransaction,
    fromWeb3JsTransaction,
  });

  const mintArgs = group === 'sol'
    ? { solPayment: some({ destination: publicKey(groupConfig.destination || config.treasury) }) }
    : {
        tokenPayment: some({
          mint: publicKey(groupConfig.mint),
          destinationAta: publicKey(groupConfig.destinationAta),
        }),
      };

  let signature;
  let assetAddress;
  let result;
  try {
    const sendConnection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
    const sent = await sendSignedSolanaTransactionWithRetry({
      connection: sendConnection,
      label: `nft.mint.${group}`,
      maxAttempts: 4,
      skipPreflight: false,
      buildSignedTransaction: async ({ connection: attemptConnection, blockhash, lastValidBlockHeight }) => {
        const attemptUmi = createUmi(solanaBatchSafeRpcUrl(attemptConnection?.rpcEndpoint || rpcUrl))
          .use(mplCore())
          .use(mplCandyMachine())
          .use(signerIdentity(walletSigner, true));
        const asset = generateSigner(attemptUmi);
        const builder = mintV1(attemptUmi, {
          candyMachine: publicKey(config.candyMachine),
          candyGuard: publicKey(config.candyGuard),
          asset,
          collection: publicKey(config.collection),
          owner: publicKey(address),
          group: some(group),
          mintArgs,
        })
          .prepend([
            {
              instruction: fromWeb3JsInstruction(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 })),
              signers: [],
              bytesCreatedOnChain: 0,
            },
            {
              instruction: fromWeb3JsInstruction(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })),
              signers: [],
              bytesCreatedOnChain: 0,
            },
          ])
          .setBlockhash({ blockhash, lastValidBlockHeight });
        const signed = await builder.buildAndSign(attemptUmi);
        const signatureBytes = signed.signatures?.[0];
        if (!signatureBytes) throw new Error('Wallet did not return a signed mint transaction signature');
        return {
          signature: bs58.encode(signatureBytes),
          rawTransaction: attemptUmi.transactions.serialize(signed),
          asset: asset.publicKey.toString(),
        };
      },
    });
    signature = sent.signature;
    assetAddress = sent.buildResult?.asset;
    result = sent;
  } catch (err) {
    throw explainSolanaMintError(err, { group, groupConfig, config });
  }
  const tx = String(signature);
  return {
    tx,
    signature: tx,
    asset: assetAddress,
    result,
    group,
  };
}

async function assertSolanaMintBalances({ Connection, Web3PublicKey, address, group, groupConfig, config, rpcUrl }) {
  const connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
  const owner = new Web3PublicKey(address);
  let solLamports = null;

  try {
    solLamports = BigInt(await connection.getBalance(owner, 'confirmed'));
  } catch {
    solLamports = null;
  }

  if (group === 'sol') {
    const requiredLamports = BigInt(groupConfig.lamports || config.priceLamports || 0);
    if (solLamports != null && requiredLamports > 0n && solLamports < requiredLamports) {
      throw friendlySolanaError(
        `Not enough SOL: mint costs ${formatSol(requiredLamports)} SOL, wallet has ${formatSol(solLamports)} SOL. Choose USDC or add SOL.`,
        'not_enough_sol',
      );
    }
    return;
  }

  const requiredToken = BigInt(groupConfig.amount || 0);
  const tokenLabel = String(groupConfig.symbol || group || 'token').toUpperCase();
  let tokenDecimals = Number(groupConfig.decimals ?? (group === 'skr' ? 6 : 6));
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) tokenDecimals = 6;
  if (requiredToken > 0n && groupConfig.mint) {
    try {
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
        mint: new Web3PublicKey(groupConfig.mint),
      });
      const tokenBalance = accounts.value.reduce((sum, item) => {
        const amount = item?.account?.data?.parsed?.info?.tokenAmount;
        if (Number.isInteger(amount?.decimals)) tokenDecimals = amount.decimals;
        const raw = amount?.amount || '0';
        try { return sum + BigInt(raw); } catch { return sum; }
      }, 0n);
      if (tokenBalance < requiredToken) {
        throw friendlySolanaError(
          `Not enough ${tokenLabel}: mint costs ${formatTokenAmount(requiredToken, tokenDecimals)} ${tokenLabel}, wallet has ${formatTokenAmount(tokenBalance, tokenDecimals)} ${tokenLabel}.`,
          `not_enough_${group}`,
        );
      }
    } catch (err) {
      if (String(err?.code || '').startsWith('not_enough_')) throw err;
    }
  }

  const feeFloorLamports = 3_000_000n;
  if (solLamports != null && solLamports < feeFloorLamports) {
    throw friendlySolanaError(
      `Need a little SOL for Solana fees/rent even with ${tokenLabel}. Add at least ${formatSol(feeFloorLamports)} SOL.`,
      'not_enough_sol_fees',
    );
  }
}

function explainSolanaMintError(err, { group, groupConfig, config }) {
  const text = collectErrorText(err);
  if (/0x1781|MintNotLive/i.test(text)) {
    return friendlySolanaError('Solana sale is not live yet. Refresh and try again.', 'mint_not_live', err);
  }
  if (/0x1782|NotEnoughSOL/i.test(text)) {
    const requiredLamports = BigInt(groupConfig?.lamports || config?.priceLamports || 0);
    const price = requiredLamports > 0n ? `${formatSol(requiredLamports)} SOL` : 'the SOL mint price';
    const message = group === 'sol'
      ? `Not enough SOL: mint costs ${price}. Choose USDC or add SOL.`
      : 'Need a little SOL for Solana fees/rent even with USDC.';
    return friendlySolanaError(message, 'not_enough_sol', err);
  }
  if (/0x1784|NotEnoughTokens/i.test(text)) {
    const requiredToken = BigInt(groupConfig?.amount || 0);
    const tokenLabel = String(groupConfig?.symbol || group || 'token').toUpperCase();
    const decimals = Number.isInteger(Number(groupConfig?.decimals)) ? Number(groupConfig.decimals) : (group === 'skr' ? 6 : 6);
    const price = requiredToken > 0n ? `${formatTokenAmount(requiredToken, decimals)} ${tokenLabel}` : `the ${tokenLabel} mint price`;
    return friendlySolanaError(`Not enough ${tokenLabel}: mint costs ${price}.`, `not_enough_${group}`, err);
  }
  if (/block height exceeded|signature .* has expired|blockhash.*expired|blockhash not found/i.test(text)) {
    return friendlySolanaError(
      'Solana blockhash expired before the network accepted the transaction. Fresh-blockhash retries ran out; approve the wallet popup promptly and try again.',
      'solana_blockhash_expired',
      err,
    );
  }
  return err;
}

function collectErrorText(err) {
  return [
    err?.message,
    err?.shortMessage,
    err?.name,
    err?.transactionMessage,
    err?.cause?.message,
    err?.cause?.transactionMessage,
    ...(Array.isArray(err?.logs) ? err.logs : []),
    ...(Array.isArray(err?.transactionLogs) ? err.transactionLogs : []),
    ...(Array.isArray(err?.simulationLogs) ? err.simulationLogs : []),
  ].filter(Boolean).join('\n');
}

function friendlySolanaError(message, code, cause = null) {
  const error = new Error(message);
  error.shortMessage = message;
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function formatSol(lamports) {
  const value = Number(lamports) / 1_000_000_000;
  if (!Number.isFinite(value)) return '0';
  return value >= 1 ? value.toFixed(3) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function formatTokenAmount(rawAmount, decimals) {
  const divisor = 10n ** BigInt(decimals);
  const whole = rawAmount / divisor;
  const fraction = rawAmount % divisor;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function normalizeQuote(quote) {
  return {
    buyer: quote.buyer,
    paymentToken: quote.paymentToken,
    unitPrice: BigInt(quote.unitPrice),
    quantity: BigInt(quote.quantity),
    usdPriceE6: BigInt(quote.usdPriceE6),
    nonce: BigInt(quote.nonce),
    deadline: BigInt(quote.deadline),
  };
}

function createSolanaWalletSigner({ publicKey, wallet, toWeb3JsTransaction, fromWeb3JsTransaction }) {
  const walletPublicKey = publicKey(wallet.publicKey.toBase58());
  const signTransaction = async (transaction) => {
    const web3Transaction = toWeb3JsTransaction(transaction);
    const signed = await wallet.signTransaction(web3Transaction);
    return fromWeb3JsTransaction(signed);
  };

  return {
    publicKey: walletPublicKey,
    signMessage: async (message) => {
      if (!wallet.signMessage) throw new Error('This Solana wallet cannot sign messages');
      return wallet.signMessage(message);
    },
    signTransaction,
    signAllTransactions: async (transactions) => {
      if (wallet.signAllTransactions) {
        const signed = await wallet.signAllTransactions(transactions.map(toWeb3JsTransaction));
        return signed.map(fromWeb3JsTransaction);
      }
      return Promise.all(transactions.map(signTransaction));
    },
  };
}
