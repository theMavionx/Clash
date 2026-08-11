function positiveSafeInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return numeric;
}

// Phoenix accepts exactly one limit-order sizing format. The order packet is
// already quantized to the market's tick and base-lot sizes, so keep the API
// request native and never mix these fields with decimal price/quantity.
export function phoenixIsolatedLimitNativeFields(orderPacket) {
  return {
    priceInTicks: positiveSafeInteger(orderPacket?.priceInTicks, 'Phoenix isolated limit price'),
    numBaseLots: positiveSafeInteger(orderPacket?.numBaseLots, 'Phoenix isolated limit size'),
  };
}
