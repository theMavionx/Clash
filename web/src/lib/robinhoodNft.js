import { parseAbi } from 'viem';
import bs58 from 'bs58';
import { withRobinhoodPurchase } from './robinhoodShopRecovery';
const ABI = parseAbi(['function transfer(address to, uint256 value) returns (bool)', 'function balanceOf(address owner) view returns (uint256)']);
export async function nftRequest(path, token, body) {
  const response = await fetch(`/api/shop/nft-robinhood/${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-token': token }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'NFT request unavailable');
  return result;
}
export async function buyRobinhoodNft({ token, evmWallet, solWallet }) {
  const buyer = evmWallet?.address;
  const recipient = solWallet?.publicKey?.toBase58?.();
  if (!buyer || !recipient) throw new Error('Connect Robinhood payment and Solana recipient wallets');
  const { orders } = await nftRequest('orders',token);
  let order = orders.find(r => !['delivered','expired'].includes(r.state));
  if (order && order.state !== 'awaiting_payment') return order;
  if (!order) {
    if (!solWallet.signMessage) throw new Error('Connect a Solana wallet that supports message verification');
    const challenge = await nftRequest('challenge',token,{ buyer,recipient });
    const signature = bs58.encode(await solWallet.signMessage(new TextEncoder().encode(challenge.message)));
    order = await nftRequest('quote',token,{ buyer,recipient,expires:challenge.expires,signature });
  }
  if (order.buyer.toLowerCase() !== buyer.toLowerCase() || order.recipient !== recipient) throw new Error('Reconnect the wallets of your existing NFT order; no new payment was created');
  if (Date.now()/1000 >= order.deadline) throw new Error('Quote expired. Payment reconciliation is in progress; do not pay again');
  await evmWallet.ensureChain(4663);
  const result = await withRobinhoodPurchase({ token,buyer,sku:`nft:${order.id}`,payment:'clash',quantity:1,
    send: async ({ beforeSubmit,rejected,submitted }) => {
      const balance = await evmWallet.getPublicClient(4663).readContract({ address:order.token,abi:ABI,functionName:'balanceOf',args:[buyer] });
      if (balance < BigInt(order.amount)) throw new Error('Not enough CLASH on Robinhood');
      beforeSubmit();
      let txHash;
      try { txHash = await evmWallet.getWalletClient(4663).writeContract({ address:order.token,abi:ABI,functionName:'transfer',args:[order.treasury,BigInt(order.amount)] }); }
      catch(error) { if (error.code===4001 || error.cause?.code===4001) rejected(); throw error; }
      const pending = { txHash,orderId:order.id }; submitted(pending); return pending;
    },
    redeem: async () => {
      const status = (await nftRequest('orders',token)).orders.find(r => r.id===order.id);
      if (!status || status.state==='awaiting_payment') throw Object.assign(new Error('Payment confirmation pending; keep this order'),{status:409});
      if (status.state==='expired') throw new Error('Unpaid order expired');
      return status;
    },
  });
  return result.grant;
}
