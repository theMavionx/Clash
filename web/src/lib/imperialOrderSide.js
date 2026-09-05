// The shared ticket uses bid/ask; Imperial's routing API uses long/short.
export function imperialOrderSide(value) {
  const side = String(value ?? '').trim().toLowerCase();
  if (['bid', 'buy', 'long'].includes(side)) return 'long';
  if (['ask', 'sell', 'short'].includes(side)) return 'short';
  throw new Error('Select Long or Short for this Imperial order.');
}
