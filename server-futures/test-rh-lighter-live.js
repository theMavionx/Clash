const assert = require('assert');

const BASE = String(process.env.RH_LIGHTER_API_URL || 'https://api.rh.lighter.xyz').replace(/\/+$/u, '');

async function read(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'ClashOfPerps-RHLighter-LiveRead/1.0' },
    });
    const text = await response.text();
    assert.strictEqual(response.status, 200, `${path} returned ${response.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const [system, books, funding] = await Promise.all([
    read('/api/v1/systemConfig'),
    read('/api/v1/orderBookDetails'),
    read('/api/v1/funding-rates'),
  ]);
  assert.strictEqual(Number(system?.code), 200);
  assert.ok(Array.isArray(books?.order_book_details) && books.order_book_details.length > 0);
  assert.ok(Array.isArray(funding?.funding_rates));
  console.log(JSON.stringify({
    ok: true,
    api: BASE,
    markets: books.order_book_details.length,
    funding_rows: funding.funding_rates.length,
    max_perps_taker_fee: system?.max_integrator_perps_taker_fee ?? null,
    max_perps_maker_fee: system?.max_integrator_perps_maker_fee ?? null,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
