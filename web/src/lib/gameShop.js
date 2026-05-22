import { BASE_CHAIN_ID, ERC20_ABI } from './avantisContract';
import { ensureErc20Allowance } from './nftMint';
import { addClientBreadcrumb, reportClientEvent } from './clientLogger';

// 40% allowance headroom: enough cushion for CoP/USD price drift between the
// pre-flight quote and the actual purchase quote (typical drift on a small
// pool is a few %, but 40% absorbs the rare wick) so the user only has to
// sign one approve per session even if the price moves notably.
const ALLOWANCE_BUFFER_NUM = 140n;
const ALLOWANCE_BUFFER_DEN = 100n;
function withAllowanceBuffer(amount) {
  return (amount * ALLOWANCE_BUFFER_NUM) / ALLOWANCE_BUFFER_DEN;
}

function formatCopAmount(units, decimals = 18) {
  // Render a uint256 token amount with up to 4 fractional digits, trimmed.
  // Used only in user-facing balance error messages so we don't expose the
  // raw 18-decimal number, which is unreadable.
  if (typeof units !== 'bigint') units = BigInt(units || 0);
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const frac = units % scale;
  if (frac === 0n) return whole.toString();
  let fracStr = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

class InsufficientCopError extends Error {
  constructor(required, balance) {
    super(`Not enough $CoP on Base. Need ${formatCopAmount(required)} CoP, your wallet has ${formatCopAmount(balance)}.`);
    this.name = 'InsufficientCopError';
    this.required = required;
    this.balance = balance;
  }
}

export const GAME_SHOP_ABI = [
  {
    name: 'purchaseWithQuote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'quote',
        type: 'tuple',
        components: [
          { name: 'buyer', type: 'address' },
          { name: 'paymentToken', type: 'address' },
          { name: 'sku', type: 'bytes32' },
          { name: 'unitPrice', type: 'uint256' },
          { name: 'quantity', type: 'uint256' },
          { name: 'usdPriceE6', type: 'uint256' },
          { name: 'account', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
];

export async function fetchGameShopConfig() {
  const response = await fetch('/api/shop/config', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Shop config failed (${response.status})`);
  return response.json();
}

export async function fetchGameShopQuote({ token, buyer, sku, quantity = 1 }) {
  const response = await fetch('/api/shop/base/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ buyer, sku, quantity }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Shop quote failed (${response.status})`);
  return json;
}

export async function redeemGameShopPurchase({ token, txHash }) {
  const response = await fetch('/api/shop/base/redeem', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ txHash }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Redeem failed (${response.status})`);
  return json;
}

export async function buyGameShopItem({ evmWallet, buyer, token, sku, quantity = 1 }) {
  if (!token) throw new Error('Game session is not ready');
  if (!evmWallet?.provider || !buyer) throw new Error('Base wallet is not connected');
  await evmWallet.ensureChain(BASE_CHAIN_ID);

  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID);
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  if (!publicClient || !walletClient) throw new Error('Base wallet client is not ready');

  // Step 1: pre-flight quote, used only to size the allowance + check balance.
  // The actual purchase tx will use a freshly-fetched quote so its deadline
  // starts AFTER the slow approve+confirm round-trip rather than before it.
  const sizingQuote = await fetchGameShopQuote({ token, buyer, sku, quantity });
  const sizingTotal = BigInt(sizingQuote.total);
  const shop = sizingQuote.shop;
  const paymentToken = sizingQuote.quote.paymentToken;

  // Pre-flight balance check. Catching insufficient funds here lets us show
  // a clear "not enough $CoP" message BEFORE prompting the wallet — without
  // it the user signs an approve, signs a purchase, then gets a confusing
  // "purchaseWithQuote reverted" once safeTransferFrom fails on-chain.
  await assertCopBalance({ publicClient, token: paymentToken, buyer, required: sizingTotal });

  const approveAmount = withAllowanceBuffer(sizingTotal);
  await ensureErc20Allowance({
    publicClient,
    walletClient,
    token: paymentToken,
    owner: buyer,
    spender: shop,
    amount: approveAmount,
  });

  // Step 2: actual purchase. Re-quote so we have a fresh deadline + signature
  // sized to the *current* CoP/USD price. Retry once on revert (e.g. quote
  // happened to expire because the user took a long time to confirm in the
  // wallet, or a flaky RPC dropped the receipt poll).
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fresh = await fetchGameShopQuote({ token, buyer, sku, quantity });
      const freshTotal = BigInt(fresh.total);
      // Re-check balance against the freshest total — the price could have
      // moved against the user since the pre-flight quote, especially after
      // a slow approve. Cheaper than letting the contract revert.
      await assertCopBalance({ publicClient, token: fresh.quote.paymentToken, buyer, required: freshTotal });
      // Top up allowance if the new quote is somehow bigger than what we
      // approved (price moved >40% since pre-flight). ensureErc20Allowance
      // is a no-op when current allowance already covers it.
      if (freshTotal > approveAmount) {
        await ensureErc20Allowance({
          publicClient,
          walletClient,
          token: fresh.quote.paymentToken,
          owner: buyer,
          spender: fresh.shop,
          amount: withAllowanceBuffer(freshTotal),
        });
      }
      const quote = normalizeShopQuote(fresh.quote);
      const hash = await walletClient.writeContract({
        address: fresh.shop,
        abi: GAME_SHOP_ABI,
        functionName: 'purchaseWithQuote',
        args: [quote, fresh.signature],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const grant = await redeemGameShopPurchase({ token, txHash: hash });
      return { hash, receipt, quote: fresh, grant };
    } catch (err) {
      lastError = err;
      // Friendly-message rewrite: when the on-chain failure is actually a
      // CoP balance shortfall (rare race — we pre-checked, but the user
      // could have moved tokens out between the check and the buy tx), turn
      // the cryptic "execution reverted" into the same plain-English error
      // the pre-flight uses.
      if (looksLikeBalanceFailure(err)) {
        try {
          const balance = await readCopBalance({ publicClient, token: paymentToken, buyer });
          throw new InsufficientCopError(BigInt(sizingQuote.total), balance);
        } catch (balanceErr) {
          if (balanceErr instanceof InsufficientCopError) throw balanceErr;
          // Couldn't read balance — fall through with the original error.
        }
      }
      if (err instanceof InsufficientCopError) throw err;
      if (!isRetriableShopError(err) || attempt > 0) throw err;
      // Brief pause so the user (and any RPC/ratelimit) can settle before
      // we re-quote and re-prompt the wallet.
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw lastError;
}

async function readCopBalance({ publicClient, token, buyer }) {
  return publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [buyer],
  });
}

async function assertCopBalance({ publicClient, token, buyer, required }) {
  const balance = await readCopBalance({ publicClient, token, buyer });
  if (BigInt(balance) < BigInt(required)) {
    throw new InsufficientCopError(BigInt(required), BigInt(balance));
  }
}

function looksLikeBalanceFailure(err) {
  const message = String(err?.shortMessage || err?.message || err?.cause?.message || '').toLowerCase();
  // viem usually surfaces the inner ERC20 reason verbatim; be liberal so we
  // catch the same condition regardless of token implementation wording.
  return (
    message.includes('transfer amount exceeds balance')
    || message.includes('insufficient balance')
    || message.includes('insufficient funds')
    || message.includes('erc20: balance')
    || message.includes('not enough')
  );
}

function isRetriableShopError(err) {
  // User explicitly cancelled — never retry, the next attempt would just
  // pop the wallet again and feel like spam.
  const code = err?.code ?? err?.cause?.code;
  if (code === 4001 || code === 'ACTION_REJECTED') return false;
  const message = String(err?.shortMessage || err?.message || '').toLowerCase();
  if (message.includes('user reject')) return false;
  if (message.includes('user denied')) return false;
  // Contract reverts that are race-fixable: stale quote, exhausted nonce
  // (very rare — different deadline window), or generic "execution reverted"
  // we couldn't decode. Network noise / receipt timeouts also worth retrying.
  return (
    message.includes('quote expired')
    || message.includes('quote used')
    || message.includes('reverted')
    || message.includes('timeout')
    || message.includes('replacement')
  );
}

function normalizeShopQuote(quote) {
  return {
    buyer: quote.buyer,
    paymentToken: quote.paymentToken,
    sku: quote.sku,
    unitPrice: BigInt(quote.unitPrice),
    quantity: BigInt(quote.quantity),
    usdPriceE6: BigInt(quote.usdPriceE6),
    account: quote.account,
    nonce: BigInt(quote.nonce),
    deadline: BigInt(quote.deadline),
  };
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const raw = String(value || '').trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
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

function shortShopAddress(address) {
  const text = String(address || '');
  return text.length > 14 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text || null;
}

function solanaShopLog(type, data = {}, level = 'info') {
  addClientBreadcrumb(`shop.solana.${type}`, data, level);
  try {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`[shop-solana] ${type}`, data);
  } catch {}
}

function solanaShopErrorData(error, extra = {}) {
  return {
    name: error?.name || null,
    message: error?.message || String(error || ''),
    short_message: error?.shortMessage || null,
    code: error?.code || error?.cause?.code || null,
    cause: error?.cause?.message || null,
    stack: error?.stack || null,
    ...extra,
  };
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

async function sendSolanaMobileProtocolTransaction({ transaction, options, expectedAddress, PublicKey }) {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
  solanaShopLog('mwa_protocol_open', {
    expected_wallet: shortShopAddress(expectedAddress),
    tx_version: transaction?.version === 0 || transaction?.message?.version === 0 ? 'v0' : 'legacy',
    skip_preflight: !!options?.skipPreflight,
    max_retries: options?.maxRetries ?? null,
  });
  return transact(async (wallet) => {
    const capabilities = await wallet.getCapabilities().catch((err) => {
      solanaShopLog('mwa_capabilities_failed', solanaShopErrorData(err), 'warn');
      return null;
    });
    solanaShopLog('mwa_capabilities', {
      supports_sign_and_send: capabilities?.supports_sign_and_send_transactions ?? null,
      max_transactions_per_request: capabilities?.max_transactions_per_request ?? null,
      supported_transaction_versions: capabilities?.supported_transaction_versions || null,
      features: Array.isArray(capabilities?.features) ? capabilities.features.slice(0, 12) : null,
    });

    const authorization = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: solanaMobileAppIdentity(),
      features: ['solana:signAndSendTransactions'],
    });
    const authorizedAddress = base64AddressToBase58(authorization?.accounts?.[0]?.address, PublicKey);
    solanaShopLog('mwa_authorized', {
      expected_wallet: shortShopAddress(expectedAddress),
      authorized_wallet: shortShopAddress(authorizedAddress),
      account_count: Array.isArray(authorization?.accounts) ? authorization.accounts.length : null,
      has_auth_token: !!authorization?.auth_token,
      wallet_uri_base: authorization?.wallet_uri_base || null,
    });
    if (expectedAddress && authorizedAddress && authorizedAddress !== expectedAddress) {
      throw new Error(`Mobile wallet authorized ${authorizedAddress}, but the connected shop wallet is ${expectedAddress}`);
    }
    solanaShopLog('mwa_sign_and_send_start', {
      tx_version: transaction?.version === 0 || transaction?.message?.version === 0 ? 'v0' : 'legacy',
      commitment: options?.preflightCommitment || 'confirmed',
      skip_preflight: !!options?.skipPreflight,
      max_retries: options?.maxRetries ?? null,
    });
    const [signature] = await wallet.signAndSendTransactions({
      auth_token: authorization.auth_token,
      transactions: [transaction],
      commitment: options?.preflightCommitment || 'confirmed',
      skipPreflight: !!options?.skipPreflight,
      maxRetries: options?.maxRetries,
    });
    solanaShopLog('mwa_sign_and_send_ok', { sig: shortShopAddress(signature) });
    return signature;
  });
}

async function withSolanaRpcFallback({ Connection, createSolanaConnection, primaryConnection, rpcUrls, task }) {
  const endpoints = uniqueStrings([
    primaryConnection?.rpcEndpoint,
    ...(rpcUrls || []),
  ]);
  let lastError = null;
  for (const endpoint of endpoints) {
    const connection = endpoint === primaryConnection?.rpcEndpoint
      ? primaryConnection
      : createSolanaConnection(Connection, endpoint, 'confirmed');
    try {
      // eslint-disable-next-line no-await-in-loop
      return { connection, value: await task(connection) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Solana RPC endpoints failed');
}

async function readSolBalanceWithFallback({ Connection, createSolanaConnection, primaryConnection, rpcUrls, ownerPk }) {
  const result = await withSolanaRpcFallback({
    Connection,
    createSolanaConnection,
    primaryConnection,
    rpcUrls,
    task: (conn) => conn.getBalance(ownerPk, 'confirmed'),
  });
  return { connection: result.connection, lamports: BigInt(result.value || 0) };
}

function parseTokenAccountRows(rows, PublicKey) {
  return (rows || []).map((item) => {
    const info = item?.account?.data?.parsed?.info || {};
    const tokenAmount = info.tokenAmount || {};
    let amount = 0n;
    try { amount = BigInt(tokenAmount.amount || 0); } catch { amount = 0n; }
    return {
      pubkey: item.pubkey,
      amount,
      decimals: Number.isInteger(tokenAmount.decimals) ? tokenAmount.decimals : null,
      programId: new PublicKey(item.account.owner?.toBase58?.() || item.account.owner),
    };
  }).filter((row) => row?.pubkey);
}

async function readTokenAccountsWithFallback({ Connection, createSolanaConnection, PublicKey, primaryConnection, rpcUrls, ownerPk, mintPk }) {
  const result = await withSolanaRpcFallback({
    Connection,
    createSolanaConnection,
    primaryConnection,
    rpcUrls,
    task: (conn) => conn.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk }, 'confirmed'),
  });
  return {
    connection: result.connection,
    accounts: parseTokenAccountRows(result.value?.value || [], PublicKey),
  };
}

async function resolveTokenProgramId({ connection, splToken, mintPk, tokenAccounts }) {
  const fromAccount = tokenAccounts.find((row) => row?.programId)?.programId;
  if (fromAccount) return fromAccount;
  const programs = [splToken.TOKEN_PROGRAM_ID, splToken.TOKEN_2022_PROGRAM_ID].filter(Boolean);
  for (const programId of programs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await splToken.getMint(connection, mintPk, 'confirmed', programId);
      return programId;
    } catch {
      // Try the next token program. Some Solana tokens are Token-2022.
    }
  }
  return splToken.TOKEN_PROGRAM_ID;
}

// =====================================================================
// Solana shop — pays via SPL USDC transfer or native SOL transfer + memo.
// No deployed program: the server's redeem endpoint verifies the on-chain
// tx itself (recipient, amount, memo, ed25519 signature of the memo).
// =====================================================================

export async function fetchSolanaShopQuote({ token, buyer, sku, quantity = 1, payment, path = '/api/shop/solana/quote' }) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ buyer, sku, quantity, payment }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Solana shop quote failed (${response.status})`);
  return json;
}

export async function redeemSolanaShopPurchase({ token, txSignature, buyer, serverSignature, path = '/api/shop/solana/redeem', extra = {} }) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ txSignature, buyer, signature: serverSignature, ...extra }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(json?.error || `Solana redeem failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return json;
}

function isRetriableSolanaRedeemError(err) {
  const status = Number(err?.status);
  const message = String(err?.message || '').toLowerCase();
  return (
    status === 0
    || status === 408
    || status === 409
    || status === 425
    || status === 429
    || status >= 500
    || message.includes('not found or not confirmed')
    || message.includes('failed to fetch')
    || message.includes('timeout')
    || message.includes('network')
  );
}

async function redeemSolanaShopPurchaseWithRetry(args) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await redeemSolanaShopPurchase(args);
    } catch (err) {
      lastError = err;
      if (!isRetriableSolanaRedeemError(err) || attempt >= 4) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    }
  }
  throw lastError || new Error('Solana redeem failed');
}

class InsufficientSolanaBalanceError extends Error {
  constructor(payment, required, balance, decimals) {
    const fmt = (v) => {
      const scale = 10n ** BigInt(decimals);
      const whole = v / scale;
      const frac = v % scale;
      if (frac === 0n) return whole.toString();
      const fs = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
      return fs ? `${whole}.${fs}` : whole.toString();
    };
    super(`Not enough ${payment.toUpperCase()} on Solana. Need ${fmt(required)} ${payment.toUpperCase()}, your wallet has ${fmt(balance)}.`);
    this.name = 'InsufficientSolanaBalanceError';
    this.required = required;
    this.balance = balance;
  }
}

export async function buySolanaShopItem({
  solWallet,
  buyer,
  token,
  sku,
  payment = 'usdc',
  quantity = 1,
  quotePath = '/api/shop/solana/quote',
  redeemPath = '/api/shop/solana/redeem',
  redeemExtra = {},
}) {
  if (!token) throw new Error('Game session is not ready');
  const address = solWallet?.publicKey?.toBase58?.() || buyer;
  if (!address) throw new Error('Solana wallet is not connected');
  const canSendSolanaTx = typeof solWallet?.sendTransaction === 'function';
  const canSignSolanaTx = typeof solWallet?.signTransaction === 'function';
  if (!canSendSolanaTx && !canSignSolanaTx) throw new Error('This Solana wallet cannot sign transactions');
  const adapterName = walletAdapterName(solWallet) || 'wallet';
  const mobileWalletAdapter = isMobileWalletAdapter(solWallet);
  const shopTrace = {
    wallet: shortShopAddress(address),
    adapter: adapterName,
    mobileWalletAdapter,
    sku,
    payment,
    quantity,
  };
  solanaShopLog('start', {
    ...shopTrace,
    can_send_transaction: canSendSolanaTx,
    can_sign_transaction: canSignSolanaTx,
    wallet_source: solWallet?.source || null,
  });

  // Dynamic imports keep solana deps out of the Base-only path bundle. They
  // ship lazily when the user first touches the Solana tab.
  const [
    { Connection, PublicKey, TransactionInstruction, SystemProgram, ComputeBudgetProgram },
    splToken,
    { DEFAULT_SOLANA_RPC_URL, SAME_ORIGIN_SOLANA_RPC_URL, SAME_ORIGIN_SOLANA_LEORPC_URL, SOLANA_RPC_URLS, createSolanaConnection, selectFreshSolanaRpcUrl },
    { isBlockhashExpiredError, sendSolanaTransactionWithRetry },
  ] = await Promise.all([
    import('@solana/web3.js'),
    import('@solana/spl-token'),
    import('./solanaRpc'),
    import('./solanaTx'),
  ]);

  const quote = await fetchSolanaShopQuote({ token, buyer: address, sku, quantity, payment, path: quotePath });
  if (!quote?.treasury) throw new Error('Solana treasury not configured');
  solanaShopLog('quote_ok', {
    ...shopTrace,
    treasury: shortShopAddress(quote.treasury),
    mint: shortShopAddress(quote.mint),
    amount: quote.amount,
    amount_formatted: quote.amountFormatted,
    decimals: quote.decimals,
    price_source: quote.priceSource,
    deadline: quote.deadline,
  });

  // Shop payments are user-facing and short-lived, so prefer our same-origin
  // RPC proxy first. Public browser RPCs are useful fallbacks, but on Seeker
  // / mobile browsers they often fail with CORS/403/closed connections.
  const shopPrimaryRpcUrls = uniqueStrings([
    SAME_ORIGIN_SOLANA_RPC_URL,
    SAME_ORIGIN_SOLANA_LEORPC_URL,
  ]);
  const shopRpcUrls = uniqueStrings([
    ...shopPrimaryRpcUrls,
    ...SOLANA_RPC_URLS,
  ]);
  const rpcSelection = await selectFreshSolanaRpcUrl(shopPrimaryRpcUrls, { timeoutMs: 2500 }).catch(() => null);
  const rpcUrl = rpcSelection?.selected?.url || shopRpcUrls[0] || DEFAULT_SOLANA_RPC_URL;
  let connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
  solanaShopLog('rpc_selected', {
    ...shopTrace,
    rpc_host: (() => { try { return new URL(rpcUrl, window.location.origin).host; } catch { return String(rpcUrl); } })(),
    rpc_source: rpcSelection?.selected?.source || null,
    fallback_count: shopRpcUrls.length,
  });

  const buyerPk = new PublicKey(address);
  const treasuryPk = new PublicKey(quote.treasury);
  const memoProgramPk = new PublicKey(quote.memoProgram);
  const amount = BigInt(quote.amount);

  // Pre-flight balance check — clear "not enough" error before MetaMask /
  // Phantom modal pops. Without this the wallet shows a generic "tx will
  // fail" preview and the user has to guess why.
  if (payment === 'sol') {
    const balanceResult = await readSolBalanceWithFallback({
      Connection,
      createSolanaConnection,
      primaryConnection: connection,
      rpcUrls: shopRpcUrls,
      ownerPk: buyerPk,
    });
    connection = balanceResult.connection;
    const lamports = balanceResult.lamports;
    solanaShopLog('sol_balance_checked', {
      ...shopTrace,
      lamports: lamports.toString(),
      required_lamports: amount.toString(),
      rpc_host: connection?.rpcEndpoint ? (() => { try { return new URL(connection.rpcEndpoint, window.location.origin).host; } catch { return connection.rpcEndpoint; } })() : null,
    });
    // Reserve ~0.001 SOL for fees; tx fee is ~0.000005 but ATA-creation can
    // push it higher. Keeping a buffer avoids "would leave 0 SOL" reverts.
    const reserve = 1_000_000n;
    if (lamports < amount + reserve) {
      throw new InsufficientSolanaBalanceError('sol', amount, lamports, 9);
    }
  } else {
    const mintPk = new PublicKey(quote.mint);
    const tokenRead = await readTokenAccountsWithFallback({
      Connection,
      createSolanaConnection,
      PublicKey,
      primaryConnection: connection,
      rpcUrls: shopRpcUrls,
      ownerPk: buyerPk,
      mintPk,
    });
    connection = tokenRead.connection;
    const tokenAccounts = tokenRead.accounts;
    const buyerBalance = tokenAccounts.reduce((sum, row) => sum + row.amount, 0n);
    const tokenDecimals = tokenAccounts.find((row) => Number.isInteger(row.decimals))?.decimals ?? quote.decimals;
    solanaShopLog('token_accounts_checked', {
      ...shopTrace,
      mint: shortShopAddress(quote.mint),
      account_count: tokenAccounts.length,
      non_empty_accounts: tokenAccounts.filter((row) => row.amount > 0n).length,
      token_balance: buyerBalance.toString(),
      required_amount: amount.toString(),
      decimals: tokenDecimals,
      programs: [...new Set(tokenAccounts.map((row) => row.programId?.toString?.()).filter(Boolean))].map(shortShopAddress),
    });
    if (buyerBalance < amount) {
      throw new InsufficientSolanaBalanceError(payment, amount, buyerBalance, tokenDecimals);
    }
    const feeBalance = await readSolBalanceWithFallback({
      Connection,
      createSolanaConnection,
      primaryConnection: connection,
      rpcUrls: shopRpcUrls,
      ownerPk: buyerPk,
    }).catch(() => null);
    if (feeBalance?.connection) connection = feeBalance.connection;
    const feeFloorLamports = 1_000_000n;
    if (feeBalance?.lamports != null && feeBalance.lamports < feeFloorLamports) {
      throw new InsufficientSolanaBalanceError('sol', feeFloorLamports, feeBalance.lamports, 9);
    }
    solanaShopLog('fee_balance_checked', {
      ...shopTrace,
      lamports: feeBalance?.lamports?.toString?.() ?? null,
      required_floor_lamports: feeFloorLamports.toString(),
    });
    quote._tokenAccounts = tokenAccounts;
    quote._tokenDecimals = tokenDecimals;
  }

  // Build the transfer + memo tx. Single tx, both instructions atomic —
  // either the user gets credited AND the funds move, or neither happens.
  const instructions = [];

  // Keep a stable CU limit for token-account creation. Priority fee and
  // blockhash refresh/retry are handled by sendSolanaTransactionWithRetry.
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));

  if (payment === 'sol') {
    instructions.push(SystemProgram.transfer({
      fromPubkey: buyerPk,
      toPubkey: treasuryPk,
      lamports: amount,
    }));
  } else {
    const mintPk = new PublicKey(quote.mint);
    const tokenAccounts = quote._tokenAccounts || [];
    const tokenProgramId = await resolveTokenProgramId({
      connection,
      splToken,
      mintPk,
      tokenAccounts,
    });
    solanaShopLog('token_program_resolved', {
      ...shopTrace,
      mint: shortShopAddress(quote.mint),
      token_program: shortShopAddress(tokenProgramId?.toString?.()),
    });
    const tokenDecimals = Number.isInteger(quote._tokenDecimals) ? quote._tokenDecimals : quote.decimals;
    const treasuryAta = await splToken.getAssociatedTokenAddress(mintPk, treasuryPk, false, tokenProgramId);
    instructions.push(splToken.createAssociatedTokenAccountIdempotentInstruction(
      buyerPk,        // payer
      treasuryAta,    // ata
      treasuryPk,     // owner
      mintPk,
      tokenProgramId,
    ));
    let remaining = amount;
    for (const source of tokenAccounts.filter((row) => row.amount > 0n)) {
      if (remaining <= 0n) break;
      const piece = source.amount >= remaining ? remaining : source.amount;
      instructions.push(splToken.createTransferCheckedInstruction(
        source.pubkey,
        mintPk,
        treasuryAta,
        buyerPk,
        piece,
        tokenDecimals,
        [],
        source.programId || tokenProgramId,
      ));
      remaining -= piece;
    }
    if (remaining > 0n) {
      throw new InsufficientSolanaBalanceError(payment, amount, amount - remaining, tokenDecimals);
    }
  }

  // Memo instruction — server reads this back from the on-chain tx and
  // verifies its signature before crediting the user. We put it LAST so
  // an explorer rendering it as "purchase note" lines up with the transfer
  // above it in the UI.
  instructions.push(new TransactionInstruction({
    keys: [],
    programId: memoProgramPk,
    data: Buffer.from(quote.memo, 'utf8'),
  }));
  solanaShopLog('instructions_ready', {
    ...shopTrace,
    instruction_count: instructions.length,
    programs: instructions.map((ix) => shortShopAddress(ix?.programId?.toString?.())).filter(Boolean),
    force_v0: mobileWalletAdapter,
  });

  let signature;
  try {
    signature = await sendSolanaTransactionWithRetry({
      instructions,
      ownerPk: buyerPk,
      connection,
      sendTransaction: canSendSolanaTx
        ? (tx, conn, opts) => (
            mobileWalletAdapter
              ? sendSolanaMobileProtocolTransaction({
                  transaction: tx,
                  options: opts,
                  expectedAddress: address,
                  PublicKey,
                })
              : solWallet.sendTransaction(tx, conn, opts)
          )
        : null,
      // Prefer adapter sendTransaction for browser/mobile wallets: it signs
      // and submits through the wallet in one path, avoiding the Seeker/Phantom
      // "Missing signature for public key" failure seen when signTransaction
      // returns an unsigned legacy tx.
      signTransaction: canSendSolanaTx && solWallet?.source !== 'privy'
        ? null
        : (canSignSolanaTx ? (tx) => solWallet.signTransaction(tx) : null),
      maxAttempts: 4,
      priorityFeeMicroLamports: 250_000,
      skipPreflight: false,
      // The Solana Mobile Wallet Adapter serializes legacy Transaction with
      // requireAllSignatures=true before Seed Vault signs it. Versioned v0
      // transactions serialize unsigned cleanly and let MWA add the user's
      // signature inside signAndSendTransaction.
      forceVersionedTransaction: mobileWalletAdapter,
      walletPathOverride: mobileWalletAdapter ? 'mwa_protocol_sign_and_send' : null,
      label: `shop.${payment}.${adapterName}`,
    });
  } catch (err) {
    const payload = solanaShopErrorData(err, {
      ...shopTrace,
      quote_amount: quote?.amount || null,
      quote_mint: shortShopAddress(quote?.mint),
      quote_treasury: shortShopAddress(quote?.treasury),
      instruction_count: instructions.length,
      force_v0: mobileWalletAdapter,
    });
    solanaShopLog('failed', payload, 'error');
    reportClientEvent('shop.solana.failed', payload, {
      level: 'error',
      source: 'shop.solana',
      message: `Solana shop ${payment} failed: ${payload.message}`,
      stack: err?.stack,
    });
    if (isBlockhashExpiredError(err)) {
      const friendly = new Error('Solana confirmed the payment too slowly for this RPC. The app now checks fallback RPCs, but this attempt expired before it could be redeemed. Try once more after refreshing.');
      friendly.shortMessage = friendly.message;
      friendly.code = 'solana_blockhash_expired';
      friendly.cause = err;
      throw friendly;
    }
    throw err;
  }
  solanaShopLog('tx_submitted', { ...shopTrace, sig: shortShopAddress(signature) });

  const grant = await redeemSolanaShopPurchaseWithRetry({
    token,
    txSignature: signature,
    buyer: address,
    serverSignature: quote.signature,
    path: redeemPath,
    extra: redeemExtra,
  });
  solanaShopLog('redeemed', {
    ...shopTrace,
    sig: shortShopAddress(signature),
    grant_resources: grant?.resources || null,
    shield_until: grant?.shield_until || null,
  });
  return { signature, quote, grant };
}

// =====================================================================
// Generic EVM shop (Arbitrum, Monad). No deployed contract — just a
// plain ERC20.transfer(treasury, exactAmount) where the server has
// signed a memo binding (sku, qty, account, amount) and verifies the
// resulting tx-receipt server-side.
// =====================================================================

const ERC20_SHOP_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];

export async function fetchEvmShopQuote({ token, chain, buyer, sku, payment = 'usdc', quantity = 1 }) {
  const response = await fetch('/api/shop/evm/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ chain, buyer, sku, payment, quantity }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Shop quote failed (${response.status})`);
  return json;
}

export async function redeemEvmShopPurchase({ token, chain, txHash, memo, signature }) {
  const response = await fetch('/api/shop/evm/redeem', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ chain, txHash, memo, signature }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Redeem failed (${response.status})`);
  return json;
}

// Per-chain switchChain shim. Caller passes the right chainId object;
// we don't keep a hardcoded list to avoid coupling shop logic to the
// trading-side chain configs.
async function ensureEvmChain(evmWallet, chainId) {
  if (typeof evmWallet?.ensureChain === 'function') {
    await evmWallet.ensureChain(chainId);
    return;
  }
  if (!evmWallet?.provider?.request) return;
  const chainHex = '0x' + Number(chainId).toString(16);
  try {
    await evmWallet.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
  } catch (err) {
    if (err?.code === 4902) {
      throw new Error(`Add ${chainId} to your wallet first`);
    }
    throw err;
  }
}

export async function buyEvmShopItem({ evmWallet, buyer, token, chain, sku, payment = 'usdc', quantity = 1 }) {
  if (!token) throw new Error('Game session is not ready');
  if (!evmWallet?.provider || !buyer) throw new Error('EVM wallet is not connected');
  if (!chain) throw new Error('Chain not specified');

  const quote = await fetchEvmShopQuote({ token, chain, buyer, sku, payment, quantity });
  if (!quote?.treasury) throw new Error('Shop treasury not configured');
  if (quote.kind === 'erc20' && !quote.mint) throw new Error('ERC20 mint missing in quote');

  await ensureEvmChain(evmWallet, quote.chainId);
  const publicClient = evmWallet.getPublicClient(quote.chainId);
  const walletClient = evmWallet.getWalletClient(quote.chainId);
  if (!publicClient || !walletClient) throw new Error('EVM wallet client is not ready');

  const required = BigInt(quote.amount);
  const fmt = (v) => {
    const scale = 10n ** BigInt(quote.decimals);
    const whole = v / scale;
    const frac = v % scale;
    if (frac === 0n) return whole.toString();
    const fs = frac.toString().padStart(quote.decimals, '0').slice(0, 4).replace(/0+$/, '');
    return fs ? `${whole}.${fs}` : whole.toString();
  };
  const tokenLabel = String(quote.payment || 'usdc').toUpperCase();
  const chainLabel = quote.label || chain;

  let txHash;
  if (quote.kind === 'native') {
    // Native pay (ETH on Arbitrum, MON on Monad). Just send `value` to the
    // treasury — no token contract involved. Pre-flight checks raw balance
    // and tries to leave a tiny reserve for gas so we don't drain the
    // wallet to where the tx itself can't ship.
    const balance = await publicClient.getBalance({ address: buyer });
    // 0.0002 of native (rough safety margin for a ~21k-gas plain transfer
    // on Arbitrum/Monad, even with priority fee). Cheap chains; this is
    // conservative.
    const gasReserve = 200_000_000_000_000n; // 0.0002 ETH/MON
    if (BigInt(balance) < required + gasReserve) {
      throw new Error(`Not enough ${tokenLabel} on ${chainLabel}. Need ${fmt(required)} + gas, your wallet has ${fmt(BigInt(balance))}.`);
    }
    txHash = await walletClient.sendTransaction({
      to: quote.treasury,
      value: required,
    });
  } else {
    // ERC20 pay (USDC). transfer() to treasury, then redeem on the server.
    const balance = await publicClient.readContract({
      address: quote.mint,
      abi: ERC20_SHOP_ABI,
      functionName: 'balanceOf',
      args: [buyer],
    });
    if (BigInt(balance) < required) {
      throw new Error(`Not enough ${tokenLabel} on ${chainLabel}. Need ${fmt(required)}, your wallet has ${fmt(BigInt(balance))}.`);
    }
    txHash = await walletClient.writeContract({
      address: quote.mint,
      abi: ERC20_SHOP_ABI,
      functionName: 'transfer',
      args: [quote.treasury, required],
    });
  }
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const grant = await redeemEvmShopPurchase({
    token,
    chain,
    txHash,
    memo: quote.memo,
    signature: quote.signature,
  });
  return { txHash, quote, grant };
}

// =====================================================================
// Aptos shop (Decibel). Uses 0x1::primary_fungible_store::transfer for
// USDC (FA) or 0x1::aptos_account::transfer for native APT. Aptos wallet
// adapter contracts expose signAndSubmitTransaction which builds the tx
// for us — we only have to assemble the entry-function payload.
// =====================================================================

export async function fetchAptosShopQuote({ token, buyer, sku, payment = 'usdc', quantity = 1 }) {
  const response = await fetch('/api/shop/aptos/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ buyer, sku, payment, quantity }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Aptos shop quote failed (${response.status})`);
  return json;
}

export async function redeemAptosShopPurchase({ token, txHash, memo, signature }) {
  const response = await fetch('/api/shop/aptos/redeem', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token } : {}),
    },
    body: JSON.stringify({ txHash, memo, signature }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Aptos redeem failed (${response.status})`);
  return json;
}

export async function buyAptosShopItem({ aptosWallet, buyer, token, sku, payment = 'usdc', quantity = 1 }) {
  if (!token) throw new Error('Game session is not ready');
  if (!aptosWallet) throw new Error('Aptos wallet is not connected');
  const address = buyer || aptosWallet?.address || aptosWallet?.account?.address;
  if (!address) throw new Error('Aptos buyer address missing');

  const quote = await fetchAptosShopQuote({ token, buyer: address, sku, payment, quantity });
  if (!quote?.treasury) throw new Error('Aptos treasury not configured');

  // Build InputTransactionData payload (new @aptos-labs SDK shape). The
  // FA primary-store transfer works for any fungible asset; APT after the
  // FA migration is also addressable this way via mint 0xa. The wallet
  // adapter accepts `{ data: { function, typeArguments, functionArguments } }`
  // and injects `sender` itself.
  const payload = {
    data: {
      function: '0x1::primary_fungible_store::transfer',
      typeArguments: ['0x1::fungible_asset::Metadata'],
      functionArguments: [quote.asset, quote.treasury, String(quote.amount)],
    },
  };

  // Use the AptosWalletContext wrapper if present (`loginSignAndSubmit`),
  // otherwise fall back to the raw adapter's `signAndSubmitTransaction`.
  // Petra/Pontem both work through this wrapper after the AIP-62 migration.
  const submitFn = aptosWallet.loginSignAndSubmit
    || aptosWallet.signAndSubmitTransaction
    || aptosWallet.signAndSubmit;
  if (typeof submitFn !== 'function') {
    throw new Error('Connected Aptos wallet cannot sign transactions');
  }
  const submitResult = await submitFn.call(aptosWallet, payload);
  const txHash = submitResult?.hash
    || submitResult?.txnHash
    || submitResult?.transactionHash
    || submitResult?.signature;
  if (!txHash) throw new Error('Aptos tx submission returned no hash');

  // Wait for transaction confirmation via the public Aptos fullnode.
  // Adapter wallets typically don't expose a confirm helper, so we poll.
  const fullnode = (typeof window !== 'undefined' && window.APTOS_FULLNODE)
    || 'https://fullnode.mainnet.aptoslabs.com/v1';
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${fullnode}/transactions/by_hash/${txHash}`).catch(() => null);
    if (r && r.ok) {
      const data = await r.json().catch(() => null);
      if (data?.success === true) break;
      if (data?.success === false) throw new Error(`Aptos tx failed on-chain: ${data?.vm_status || 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const grant = await redeemAptosShopPurchase({
    token,
    txHash,
    memo: quote.memo,
    signature: quote.signature,
  });
  return { txHash, quote, grant };
}
