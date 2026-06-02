export const TOKEN_COLORS = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', DOGE: '#C2A633', XRP: '#23292F',
  SUI: '#4DA2FF', TRUMP: '#FFD700', BNB: '#F3BA2F', HYPE: '#00D4AA', ENA: '#7C3AED',
  PAXG: '#E4CE4F', ZEC: '#F4B728', XMR: '#FF6600', AVAX: '#E84142', ADA: '#0033AD',
  DOT: '#E6007A', LINK: '#2A5ADA', ARB: '#213147', OP: '#FF0420', NEAR: '#000',
  BARD: '#6B7280', BASED: '#0052FF', BLESS: '#22C55E', CBRS: '#2563EB',
  COAI: '#7C3AED', DRAM: '#0F172A', EDGE: '#06B6D4', GIGGLE: '#F59E0B',
  KAIA: '#111827', LA: '#84CC16', LITE: '#64748B', RIVER: '#0EA5E9',
  SAHARA: '#D97706', USAR: '#475569',
  MU: '#2B5CFF', SNDK: '#E31E24',
  SKR: '#3B82F6',
  GOLD: '#FFD700', SILVER: '#C0C0C0', XAU: '#FFD700', XAG: '#C0C0C0',
  CL: '#1a1a1a', WTI: '#1a1a1a', BRENT: '#1a1a1a', USOILSPOT: '#1a1a1a',
  NATGAS: '#4CAF50', EUR: '#2E7DFF', GBP: '#7A4CE0', JPY: '#D64242',
  AUD: '#169B62', NZD: '#0062A8', CAD: '#D52B1E', CHF: '#D52B1E',
};

export const STOCK_SYMBOLS = new Set([
  'AAPL', 'AMZN', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'GOOG', 'META', 'NFLX', 'AMD',
  'COIN', 'HOOD', 'MSTR', 'INTC', 'SPY', 'QQQ', 'DIS', 'IBM', 'ORCL', 'PYPL',
  'PLTR', 'SMCI', 'GME', 'BA', 'WMT', 'MCD', 'SBUX', 'BABA', 'KO', 'PEP',
  'JPM', 'BAC', 'GS', 'WFC', 'V', 'MA', 'CRCL', 'AVNT',
  'AVGO', 'BRKB', 'BZ', 'CRWV', 'CSCO', 'EWJ', 'EWY', 'FLNC', 'HD', 'H',
  'MRVL', 'MU', 'PAYP', 'QCOM', 'RKLB', 'SNDK', 'SOXL', 'TSM', 'UBER',
]);

export const COMMODITY_SYMBOLS = new Set([
  'CL', 'COPPER', 'GOLD', 'SILVER', 'NATGAS', 'XAU', 'XAG', 'WTI', 'BRENT', 'USOILSPOT',
]);

const FX_SYMBOLS = new Set([
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF', 'USDSEK',
  'USDSGD', 'USDTRY', 'USDCNH', 'USDINR', 'USDKRW', 'USDMXN', 'USDZAR', 'USDBRL',
  'USDIDR', 'USDTWD',
]);

const LOCAL_ALIASES = {
  PAYP: ['PYPL'],
  BRKB: ['BRK.B', 'BRK-B'],
  POL: ['MATIC'],
  MATIC: ['POL'],
  RNDR: ['RENDER'],
  RENDER: ['RNDR'],
  WTI: ['CL'],
  WTIOIL: ['WTI', 'CL'],
  BRENT: ['CL'],
  // BRENTOIL is the GMX V2 symbol for Brent crude perp. There's no
  // dedicated local Brent logo — the canonical crude-oil mark `CL` (West
  // Texas Intermediate, also our `BRENT` and `WTI` fallback) reads as
  // "this is an oil market" without ambiguity.
  BRENTOIL: ['BRENT', 'WTI', 'CL'],
  USOILSPOT: ['CL'],
  GOLD: ['XAU'],
  SILVER: ['XAG'],
  XAU: ['GOLD'],
  XAG: ['SILVER'],
  // Pacifica-specific quote-suffixed perp; share the base SOL icon.
  SOLUSDC: ['SOL'],
};

const COINGECKO_LOGOS = {
  REZ: 'https://coin-images.coingecko.com/coins/images/37327/large/renzo_200x200.png?1714025012',
  GOAT: 'https://coin-images.coingecko.com/coins/images/50717/large/GOAT_LOGO_NEW.jpg?1731292759',
  ARKM: 'https://coin-images.coingecko.com/coins/images/30929/large/Arkham_Logo_CG.png',
  DYM: 'https://coin-images.coingecko.com/coins/images/34182/large/dym.png',
  ORDI: 'https://coin-images.coingecko.com/coins/images/30162/large/ordi.png',
  POPCAT: 'https://coin-images.coingecko.com/coins/images/33760/large/image.jpg',
  CHILLGUY: 'https://coin-images.coingecko.com/coins/images/51746/large/Scherm%C2%ADafbeelding_2024-11-15_om_20.57.58.png',
  KAITO: 'https://coin-images.coingecko.com/coins/images/54411/large/Qm4DW488_400x400.jpg',
  ZORA: 'https://coin-images.coingecko.com/coins/images/54693/large/zora.jpg',
};

export function canonTokenSymbol(sym) {
  const raw = String(sym || '').toUpperCase().trim();
  if (!raw) return '';
  return raw.replace(/[^A-Z0-9]/g, '');
}

function uniq(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

function localCandidates(sym) {
  const s = canonTokenSymbol(sym);
  const out = [s];
  if (LOCAL_ALIASES[s]) out.push(...LOCAL_ALIASES[s]);
  return uniq(out);
}

function fxPairDataUri(sym) {
  const s = canonTokenSymbol(sym);
  if (!FX_SYMBOLS.has(s) || s.length !== 6) return null;
  const a = s.slice(0, 3);
  const b = s.slice(3, 6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0EA5E9"/><stop offset="1" stop-color="#5C3A21"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="url(#g)"/><circle cx="32" cy="32" r="27" fill="#ffffff" fill-opacity=".13" stroke="#ffffff" stroke-opacity=".55" stroke-width="2"/><text x="32" y="28" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="15" font-weight="900" fill="#fff">${a}</text><text x="32" y="44" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="15" font-weight="900" fill="#fff">${b}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function generatedTokenDataUri(sym) {
  const s = canonTokenSymbol(sym);
  if (!s) return null;
  const bg = tokenFallbackColor(s, '#475569');
  const label = s.length <= 5 ? s : s.slice(0, 5);
  const fontSize = label.length <= 3 ? 22 : label.length <= 4 ? 18 : 15;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="url(#g)"/><circle cx="32" cy="32" r="27" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/><text x="32" y="38" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="${fontSize}" font-weight="900" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function commodityCandidates(sym) {
  const s = canonTokenSymbol(sym);
  if (s === 'BRENT' || s === 'BRENTOIL' || s === 'WTI' || s === 'USOILSPOT') return ['CL'];
  if (s === 'SILVER') return ['XAG', 'SILVER'];
  if (s === 'GOLD') return ['XAU', 'GOLD'];
  return localCandidates(s);
}

export function tokenFallbackColor(sym, fallback = '#a3906a') {
  const s = canonTokenSymbol(sym);
  return TOKEN_COLORS[s] || TOKEN_COLORS[(LOCAL_ALIASES[s] || [])[0]] || fallback;
}

export function tokenLogoSources(sym) {
  const s = canonTokenSymbol(sym);
  if (!s) return [];
  const srcs = [];
  const fxBadge = fxPairDataUri(s);
  if (fxBadge) return [fxBadge];
  const localSyms = COMMODITY_SYMBOLS.has(s) ? commodityCandidates(s) : localCandidates(s);
  for (const candidate of localSyms) {
    srcs.push(`/tokens/${candidate}.svg`, `/tokens/${candidate}.png`);
  }
  if (COMMODITY_SYMBOLS.has(s)) return uniq(srcs);
  if (COINGECKO_LOGOS[s]) srcs.push(COINGECKO_LOGOS[s]);
  if (STOCK_SYMBOLS.has(s)) {
    srcs.push(`https://assets.parqet.com/logos/symbol/${s}?format=png`);
  }
  if (s === 'BRKB') {
    srcs.push(
      'https://assets.parqet.com/logos/symbol/BRK.B?format=png',
      'https://assets.parqet.com/logos/symbol/BRK-B?format=png',
    );
  }
  if (s === 'PAYP') {
    srcs.push('https://assets.parqet.com/logos/symbol/PYPL?format=png');
  }
  srcs.push(
    `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${s.toLowerCase()}.svg`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${s.toLowerCase()}.png`,
  );
  const generated = generatedTokenDataUri(s);
  if (generated) srcs.push(generated);
  return uniq(srcs);
}
