import { encodeFunctionData, formatUnits, parseUnits } from 'viem';

export const DOMFI_CHAIN_ID = 8453;
export const DOMFI_REFERRAL_CODE = 'CLASHOFPERPS';
export const DOMFI_REFERRAL_URL = 'https://app.domination.finance/ref/CLASHOFPERPS';
export const DOMFI_REGISTRY = '0xe438360464EaDa40b7921C993322bD4dA8881103';
export const DOMFI_TRADING = '0x7447cb5350a096364A13bEAf77916dfB35db9445';
export const DOMFI_TRADING_STORAGE = '0x608ff95777F419040a3b1E42ed73dD3EFf42Cc24';
export const DOMFI_PAIRS_STORAGE = '0x444079DDCaFd4feE3812E2fF79c5F74a1F4f9Be1';
export const DOMFI_PAIR_INFOS = '0x256fD248cDc91A6B098eEE2580f313fdCaFa2059';
export const DOMFI_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const DOMFI_TRADE_ABI = [
  {
    type: 'function',
    name: 'openTrade',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'collateral', type: 'uint256' },
          { name: 'openPrice', type: 'uint192' },
          { name: 'tp', type: 'uint192' },
          { name: 'sl', type: 'uint192' },
          { name: 'trader', type: 'address' },
          { name: 'leverage', type: 'uint32' },
          { name: 'pairIndex', type: 'uint16' },
          { name: 'index', type: 'uint8' },
          { name: 'buy', type: 'bool' },
        ],
      },
      { name: 'orderType', type: 'uint8' },
      { name: 'slippageP', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'closeTradeMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint16' },
      { name: 'index', type: 'uint8' },
      { name: 'closeP', type: 'uint16' },
      { name: 'slippageP', type: 'uint256' },
      { name: 'wantedPrice', type: 'uint192' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelOpenLimitOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint16' },
      { name: 'index', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateTp',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint16' },
      { name: 'index', type: 'uint8' },
      { name: 'newTp', type: 'uint192' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateSl',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pairIndex', type: 'uint16' },
      { name: 'index', type: 'uint8' },
      { name: 'newSl', type: 'uint192' },
    ],
    outputs: [],
  },
];

export const DOMFI_ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
];

export function domfiCollateralRaw(value) {
  return parseUnits(String(value), 6);
}

export function domfiPriceRaw(value) {
  return parseUnits(String(value), 18);
}

export function domfiLeverageRaw(value) {
  return parseUnits(String(value), 2);
}

export function domfiPercentRaw(value) {
  return parseUnits(String(value), 2);
}

export function domfiUsdcDisplay(value) {
  return Number(formatUnits(BigInt(value || 0), 6));
}

export function normalizeDomfiWalletBalanceSnapshot(snapshot) {
  if (!snapshot || snapshot.available !== true) return null;
  try {
    const usdcRaw = BigInt(snapshot.usdc_raw);
    const ethRaw = snapshot.eth_wei == null ? null : BigInt(snapshot.eth_wei);
    if (usdcRaw < 0n || (ethRaw != null && ethRaw < 0n)) return null;
    return {
      usdcRaw,
      ethRaw,
      source: String(snapshot.source || 'server_base_rpc'),
      stale: snapshot.stale === true,
    };
  } catch {
    return null;
  }
}

function crc32cTable() {
  const polynomial = 0x82f63b78;
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? ((value >>> 1) ^ polynomial) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
}

const CRC32C_TABLE = crc32cTable();

export function domfiCrc32c(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32C_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

export function encodeDomfiReferralSuffix(codeId) {
  const id = BigInt(codeId);
  if (id < 0n || id > 0xffffffffffffffffn) throw new Error('DomFi referral code ID must fit uint64');
  const bytes = new Uint8Array(20);
  bytes.set([68, 77, 70, 82], 0); // ASCII "DMFR"
  bytes[4] = 1; // trailer version
  bytes[5] = 0;
  bytes[6] = 0;
  bytes[7] = 8; // uint64 payload length
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setBigUint64(8, id, false);
  view.setUint32(16, domfiCrc32c(bytes.subarray(0, 16)), false);
  return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function appendDomfiReferralSuffix(data, codeId) {
  if (!codeId && codeId !== 0 && codeId !== 0n) return data;
  return `${data}${encodeDomfiReferralSuffix(codeId).slice(2)}`;
}

export function domfiReferralCodeIdForOpen(status) {
  if (!status || status.attach_on_next_open !== true || status.binding != null) return null;
  const codeId = String(status?.referral?.code_id ?? '');
  return /^\d+$/u.test(codeId) ? codeId : null;
}

export function prepareDomfiOpenCalldata({
  wallet,
  pairIndex,
  collateral,
  leverage,
  price,
  side,
  orderType = 'market',
  slippage = '0.5',
  takeProfit = 0,
  stopLoss = 0,
  referralCodeId = null,
}) {
  const normalizedType = String(orderType).toLowerCase();
  const orderTypeRaw = normalizedType === 'market' ? 0 : normalizedType === 'stop' ? 2 : 1;
  const data = encodeFunctionData({
    abi: DOMFI_TRADE_ABI,
    functionName: 'openTrade',
    args: [
      {
        collateral: domfiCollateralRaw(collateral),
        openPrice: domfiPriceRaw(price),
        tp: Number(takeProfit) > 0 ? domfiPriceRaw(takeProfit) : 0n,
        sl: Number(stopLoss) > 0 ? domfiPriceRaw(stopLoss) : 0n,
        trader: wallet,
        leverage: domfiLeverageRaw(leverage),
        pairIndex: Number(pairIndex),
        index: 0,
        buy: ['bid', 'buy', 'long'].includes(String(side).toLowerCase()),
      },
      orderTypeRaw,
      orderTypeRaw === 0 ? domfiPercentRaw(slippage) : 1n,
    ],
  });
  return referralCodeId == null ? data : appendDomfiReferralSuffix(data, referralCodeId);
}

export function prepareDomfiCloseCalldata({ pairIndex, tradeIndex, closePercent = 100, slippage = '0.5', price }) {
  const roundedClosePercent = Math.round(Number(closePercent) * 100) / 100;
  if (!Number.isFinite(roundedClosePercent) || roundedClosePercent <= 0 || roundedClosePercent > 100) {
    throw new Error('DomFi close percent must be between 0 and 100');
  }
  return encodeFunctionData({
    abi: DOMFI_TRADE_ABI,
    functionName: 'closeTradeMarket',
    args: [
      Number(pairIndex),
      Number(tradeIndex),
      Number(domfiPercentRaw(String(roundedClosePercent))),
      domfiPercentRaw(slippage),
      domfiPriceRaw(price),
    ],
  });
}

const DOMFI_READ_RETRY_DELAYS_MS = [0, 300, 900];
const DOMFI_TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function domfiRetryDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchDomfiJson(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const attempts = method === 'GET' ? DOMFI_READ_RETRY_DELAYS_MS.length : 1;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await domfiRetryDelay(DOMFI_READ_RETRY_DELAYS_MS[attempt]);
    try {
      const response = await fetch(`/api/futures${pathname}`, options);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(payload?.detail || payload?.error || `DomFi request failed (${response.status})`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const aborted = options.signal?.aborted || error?.name === 'AbortError';
      const transient = error?.status == null || DOMFI_TRANSIENT_STATUS.has(Number(error.status));
      if (aborted || !transient || attempt >= attempts - 1) throw error;
    }
  }
  throw lastError || new Error('DomFi request failed');
}

export function assertDomfiConfig(config) {
  const contracts = config?.contracts || {};
  const expected = {
    registry: DOMFI_REGISTRY,
    trading: DOMFI_TRADING,
    trading_storage: DOMFI_TRADING_STORAGE,
    pairs_storage: DOMFI_PAIRS_STORAGE,
    pair_infos: DOMFI_PAIR_INFOS,
    collateral: DOMFI_USDC,
  };
  if (Number(config?.chain_id) !== DOMFI_CHAIN_ID) throw new Error('DomFi chain configuration mismatch');
  for (const [key, value] of Object.entries(expected)) {
    if (String(contracts[key] || '').toLowerCase() !== value.toLowerCase()) {
      throw new Error(`DomFi ${key} deployment mismatch`);
    }
  }
  if (String(config?.referral_code || '').toUpperCase() !== DOMFI_REFERRAL_CODE) {
    throw new Error('DomFi referral configuration mismatch');
  }
  return true;
}
