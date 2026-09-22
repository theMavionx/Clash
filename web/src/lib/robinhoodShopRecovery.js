// A failed receipt/redeem request must never turn into another token transfer.
const active = new Set();
export async function withRobinhoodPurchase({ token, buyer, sku, payment, quantity, send, redeem, storage = localStorage }) {
  const session = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const key = `clash.rhshop.v1:${session}:${buyer.toLowerCase()}:${sku}:${payment}:${quantity}`;
  if (active.has(key)) throw new Error('Purchase is already processing');
  active.add(key);
  try {
    let pending = JSON.parse(storage.getItem(key) || 'null');
    if (pending && !pending.txHash) throw new Error('Wallet submission status is unknown. Do not pay again; contact support to check your wallet transaction.');
    if (!pending) {
      pending = await send({
        beforeSubmit: () => storage.setItem(key, JSON.stringify({ submitting: true })),
        rejected: () => storage.removeItem(key),
        submitted: value => storage.setItem(key, JSON.stringify(value)),
      });
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const grant = await redeem(pending);
        storage.removeItem(key);
        return { ...pending, grant };
      } catch (error) {
        if (attempt === 19 || ![409, 429, 502, 503, 504].includes(error.status)) {
          throw new Error(`Payment ${pending.txHash} is saved. Retry this purchase to verify the same payment, not send again. ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  } finally { active.delete(key); }
}
