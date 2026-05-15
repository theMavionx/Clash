import { BASE_CHAIN_ID, ERC20_ABI } from './avantisContract';
import { ensureErc20Allowance } from './nftMint';

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
