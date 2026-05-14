import { BASE_CHAIN_ID } from './avantisContract';
import { ensureErc20Allowance } from './nftMint';

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

  const quoteResponse = await fetchGameShopQuote({ token, buyer, sku, quantity });
  const quote = normalizeShopQuote(quoteResponse.quote);
  const shop = quoteResponse.shop;
  const publicClient = evmWallet.getPublicClient(BASE_CHAIN_ID);
  const walletClient = evmWallet.getWalletClient(BASE_CHAIN_ID);
  if (!publicClient || !walletClient) throw new Error('Base wallet client is not ready');

  await ensureErc20Allowance({
    publicClient,
    walletClient,
    token: quote.paymentToken,
    owner: buyer,
    spender: shop,
    amount: BigInt(quoteResponse.total),
  });

  const hash = await walletClient.writeContract({
    address: shop,
    abi: GAME_SHOP_ABI,
    functionName: 'purchaseWithQuote',
    args: [quote, quoteResponse.signature],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const grant = await redeemGameShopPurchase({ token, txHash: hash });
  return { hash, receipt, quote: quoteResponse, grant };
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
