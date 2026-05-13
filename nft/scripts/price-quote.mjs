import { loadEnv } from './lib-env.mjs';
import { buildUsdPriceQuote } from './lib-prices.mjs';

const env = loadEnv();
const usdAmount = process.argv[2] || env.NFT_USD_PRICE || '8.9';
const quote = await buildUsdPriceQuote(env, usdAmount);
console.log(JSON.stringify({
  usdAmount: quote.usdAmount,
  ethUsd: quote.ethUsd,
  solUsd: quote.solUsd,
  ethWei: quote.ethWei.toString(),
  ethAmount: quote.ethAmount,
  solLamports: quote.solLamports.toString(),
  solAmount: quote.solAmount,
  usdcUnits: quote.usdcUnits.toString(),
  usdcAmount: quote.usdcAmount,
}, null, 2));
