const PRICE_IDS = {
  eth: { env: 'NFT_ETH_USD', coingecko: 'ethereum', binance: 'ETHUSDT' },
  sol: { env: 'NFT_SOL_USD', coingecko: 'solana', binance: 'SOLUSDT' },
};

export function decimalToUnits(value, decimals) {
  const raw = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid decimal value: ${value}`);
  const [whole, frac = ''] = raw.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals)
    + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}

export function unitsToDecimalString(units, decimals) {
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const frac = (units % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function usdToNativeUnits(usdAmount, assetUsd, decimals) {
  const usd = decimalToUnits(usdAmount, 12);
  const price = decimalToUnits(assetUsd, 12);
  const scale = 10n ** BigInt(decimals);
  return (usd * scale + price - 1n) / price;
}

export function usdToTokenUnits(usdAmount, decimals) {
  return decimalToUnits(usdAmount, decimals);
}

async function fetchBinancePrice(symbol) {
  const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  if (!response.ok) throw new Error(`Binance price failed: ${response.status}`);
  const json = await response.json();
  if (!json.price) throw new Error(`Binance price missing for ${symbol}`);
  return String(json.price);
}

async function fetchCoingeckoPrice(id) {
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
  if (!response.ok) throw new Error(`CoinGecko price failed: ${response.status}`);
  const json = await response.json();
  const value = json?.[id]?.usd;
  if (!value) throw new Error(`CoinGecko price missing for ${id}`);
  return String(value);
}

export async function fetchUsdPrice(env, asset) {
  const config = PRICE_IDS[asset];
  if (!config) throw new Error(`Unsupported asset price: ${asset}`);
  if (env[config.env]) return String(env[config.env]);
  try {
    return await fetchCoingeckoPrice(config.coingecko);
  } catch (err) {
    console.warn(`CoinGecko ${asset} price failed: ${err.message}; trying Binance.`);
    return fetchBinancePrice(config.binance);
  }
}

export async function buildUsdPriceQuote(env, usdAmount) {
  const [ethUsd, solUsd] = await Promise.all([
    fetchUsdPrice(env, 'eth'),
    fetchUsdPrice(env, 'sol'),
  ]);
  const ethWei = usdToNativeUnits(usdAmount, ethUsd, 18);
  const solLamports = usdToNativeUnits(usdAmount, solUsd, 9);
  const usdcUnits = usdToTokenUnits(usdAmount, 6);
  return {
    usdAmount: String(usdAmount),
    ethUsd,
    solUsd,
    ethWei,
    ethAmount: unitsToDecimalString(ethWei, 18),
    solLamports,
    solAmount: unitsToDecimalString(solLamports, 9),
    usdcUnits,
    usdcAmount: unitsToDecimalString(usdcUnits, 6),
  };
}
