import { BASE_CHAIN_ID, ERC20_ABI } from './avantisContract';

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

export async function fetchNftMintConfig() {
  const response = await fetch('/api/nft/mint/config', { cache: 'no-store' });
  if (!response.ok) throw new Error(`NFT config failed (${response.status})`);
  return response.json();
}

export async function fetchBaseMintQuote({ buyer, payment, quantity = 1 }) {
  const response = await fetch('/api/nft/base/quote', {
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

export async function mintBaseNft({ evmWallet, buyer, payment, quantity = 1 }) {
  if (!evmWallet?.provider || !buyer) throw new Error('Base wallet is not connected');
  await evmWallet.ensureChain(BASE_CHAIN_ID);

  const quoteResponse = await fetchBaseMintQuote({ buyer, payment, quantity });
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
