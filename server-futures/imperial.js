const API_BASE = String(process.env.IMPERIAL_API_URL || 'https://api.imperial.space/api/v1').replace(/\/+$/, '');
const BUILDER_CODE = String(process.env.IMPERIAL_BUILDER_CODE || 'CLASH').trim().toUpperCase();
const PARTNER_CODE = String(process.env.IMPERIAL_PARTNER_CODE || '').trim().toUpperCase();
const REQUEST_TIMEOUT_MS = Math.max(2_000, Math.min(30_000, Number(process.env.IMPERIAL_TIMEOUT_MS || 12_000)));
const REQUIRE_BUILDER = !/^(0|false|no)$/i.test(String(process.env.IMPERIAL_REQUIRE_BUILDER_ACTIVE ?? 'true'));

const UNDERWRITER = Object.freeze({ jupiter: 0, flash: 1, phoenix: 2, gmtrade: 3, flash_v2: 4, pairs: 5, touch: 6 });
const UNDERWRITER_LABEL = Object.freeze(Object.fromEntries(Object.entries(UNDERWRITER).map(([name, id]) => [id, name])));

function error(message, status = 400, details = null) {
  return Object.assign(new Error(message), { status, details });
}

function isSolanaAddress(value) {
  const text = String(value || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  try {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let number = 0n;
    for (const char of text) number = number * 58n + BigInt(alphabet.indexOf(char));
    let bytes = 0;
    while (number > 0n) { number >>= 8n; bytes += 1; }
    for (const char of text) { if (char !== '1') break; bytes += 1; }
    return bytes === 32;
  } catch { return false; }
}

function wallet(value) {
  const out = String(value || '').trim();
  if (!isSolanaAddress(out)) throw error('A valid linked Solana wallet is required for Imperial.', 409);
  return out;
}

function profileIndex(value) {
  const out = Number(value ?? 0);
  if (!Number.isInteger(out) || out < 0 || out > 5) throw error('Imperial profileIndex must be between 0 and 5.');
  return out;
}

function positive(value, label) {
  const out = Number(value);
  if (!Number.isFinite(out) || out <= 0) throw error(`${label} must be greater than zero.`);
  return out;
}

function usdMicro(value, label) {
  const out = positive(value, label);
  const micro = Math.round(out * 1_000_000);
  if (!Number.isSafeInteger(micro)) throw error(`${label} is too large.`);
  return micro;
}

function numberFrom(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function apiList(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['dataList', 'data', 'items', 'rows', 'profiles', 'positions', 'orders', 'trades', 'history', 'rates', 'prices', 'events']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

async function request(path, { method = 'GET', jwt = '', body, query, signal, fetchImpl = fetch } = {}) {
  const url = new URL(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok || data?.success === false) {
      const message = data?.detail || data?.message || data?.error || `Imperial API request failed (${response.status})`;
      throw error(String(message), response.status || 502, data);
    }
    return data;
  } catch (cause) {
    if (cause?.name === 'AbortError') throw error('Imperial API request timed out.', 504);
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

function configStatus() {
  return {
    api_url: API_BASE,
    app_url: 'https://app.imperial.space/perps/sol',
    builder_code: BUILDER_CODE,
    partner_code_configured: !!PARTNER_CODE,
    builder_required: REQUIRE_BUILDER,
    profiles: 6,
    boost_supported: true,
  };
}

async function getBuilderStatus(fetchImpl = fetch) {
  try {
    const data = await request('/mobile/builder/summary', { query: { code: BUILDER_CODE }, fetchImpl });
    return { configured: true, active: data?.active !== false, code: BUILDER_CODE, data };
  } catch (cause) {
    if (cause?.status === 404) return { configured: false, active: false, code: BUILDER_CODE, error: cause.message };
    return { configured: false, active: false, code: BUILDER_CODE, error: cause.message, unavailable: true };
  }
}

async function assertBuilder(fetchImpl = fetch) {
  const status = await getBuilderStatus(fetchImpl);
  if (REQUIRE_BUILDER && !status.active) {
    throw error(`Imperial builder code ${BUILDER_CODE} is not active. Trading is disabled until Imperial registers it.`, 503, status);
  }
  return status;
}

async function connect(body, fetchImpl = fetch) {
  const owner = wallet(body?.wallet);
  const message = String(body?.message || '');
  const signature = String(body?.signature || '');
  if (!message.startsWith(`imperial:mobile-connect:${owner}:`)) throw error('Imperial connection message does not match the linked wallet.');
  if (!signature) throw error('Wallet signature is required.');
  const connected = await request('/mobile/connect', { method: 'POST', body: { wallet: owner, message, signature }, fetchImpl });
  const exchanged = await request('/mobile/exchange', { method: 'POST', body: { code: connected?.code }, fetchImpl });
  if (!exchanged?.jwt) throw error('Imperial did not return a session token.', 502);
  return { jwt: exchanged.jwt, expiresAt: exchanged.expiresAt || null, wallet: owner };
}

async function revoke(jwt, fetchImpl = fetch) {
  if (!jwt) return { success: true };
  return request('/mobile/revoke', { method: 'POST', jwt, fetchImpl });
}

async function partnerStatus(jwt, fetchImpl = fetch) {
  if (!jwt) return { registered: false, code: null };
  try { return await request('/mobile/partner/registration', { jwt, fetchImpl }); }
  catch (cause) { if (cause?.status === 404) return { registered: false, code: null }; throw cause; }
}

async function registerPartner(jwt, fetchImpl = fetch) {
  if (!PARTNER_CODE) return { skipped: true, reason: 'partner_code_not_configured' };
  const current = await partnerStatus(jwt, fetchImpl);
  if (current?.registered || current?.code) return { ...current, preserved: true };
  return request('/mobile/partner/register', { method: 'POST', jwt, body: { code: PARTNER_CODE }, fetchImpl });
}

async function getRoute(input, fetchImpl = fetch) {
  const symbol = String(input?.symbol || input?.asset || '').toUpperCase().replace(/[-/](PERP|USD|USDC)$/i, '');
  if (!symbol) throw error('Imperial market symbol is required.');
  const side = String(input?.side || '').toLowerCase();
  if (!['long', 'short'].includes(side)) throw error('Imperial side must be long or short.');
  return request('/route', {
    query: {
      asset: symbol,
      side,
      notional: positive(input?.notional, 'Notional'),
      desiredLeverage: positive(input?.leverage || 1, 'Leverage'),
      holdHours: Math.max(1, Math.min(720, Number(input?.holdHours || 24))),
      wallet: input?.wallet || undefined,
      profileIndex: input?.profileIndex ?? undefined,
      stickyVenue: venueName(input?.stickyVenue ?? input?.pinnedUnderwriter) || undefined,
      subaccountDefaultVenue: venueName(input?.subaccountDefaultVenue) || undefined,
      excludedVenues: input?.excludedVenues || undefined,
    },
    fetchImpl,
  });
}

function venueName(value) {
  if (value === undefined || value === null || value === '') return '';
  if (Number.isInteger(Number(value)) && UNDERWRITER_LABEL[Number(value)]) return UNDERWRITER_LABEL[Number(value)];
  const key = String(value).trim().toLowerCase().replace(/[ -]+/g, '_').replace(/^flash_trade$/, 'flash');
  return UNDERWRITER[key] !== undefined ? key : '';
}

function venueId(route) {
  const raw = route?.underwriter ?? route?.venue ?? route?.selectedVenue ?? route?.route?.underwriter ?? route?.route?.venue;
  if (Number.isInteger(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 6) return Number(raw);
  const key = String(raw || '').toLowerCase().replace(/[ -]+/g, '_');
  if (UNDERWRITER[key] !== undefined) return UNDERWRITER[key];
  throw error('Imperial did not return a supported underlying venue.', 502, route);
}

function routeLoanUsd(route) {
  return numberFrom(route?.loanSplit?.loanAmountUsd ?? route?.loan_split?.loan_amount_usd ?? route?.loanAmountUsd, 0);
}

function marketPriceScale(price, underwriter, flashExponent = null) {
  const p = positive(price, 'Market price');
  // Imperial documents 1e6 for Jupiter/Phoenix and 1e9 for GMTrade. Flash
  // uses the per-market exponent returned by /flash/markets.
  if (underwriter === UNDERWRITER.jupiter || underwriter === UNDERWRITER.phoenix) return Math.round(p * 1_000_000);
  if (underwriter === UNDERWRITER.flash && Number.isInteger(Number(flashExponent))) return Math.round(p * (10 ** -Number(flashExponent)));
  if (underwriter === UNDERWRITER.gmtrade) return Math.round(p * 1_000_000_000);
  if ([UNDERWRITER.flash_v2, UNDERWRITER.pairs, UNDERWRITER.touch].includes(underwriter)) return 0;
  return undefined;
}

async function observedMarketPrice(symbol, underwriter, fallback, fetchImpl = fetch) {
  if (numberFrom(fallback, 0) > 0) return Number(fallback);
  const rows = apiList(await request('/mark-prices', { fetchImpl }));
  const row = rows.find(value => String(value?.symbol || '').toUpperCase() === String(symbol || '').toUpperCase());
  const venue = UNDERWRITER_LABEL[underwriter];
  const entry = row?.[venue] || (venue === 'flash' ? row?.flash_trade : null);
  const price = numberFrom(entry?.price ?? entry?.markPrice, 0);
  if (!(price > 0)) throw error(`Imperial did not return a ${venue || 'venue'} mark price for ${symbol}.`, 502);
  return price;
}

async function encodedMarketPrice({ symbol, side, underwriter, price, resting = false, fetchImpl = fetch }) {
  if (resting || [UNDERWRITER.flash_v2, UNDERWRITER.pairs, UNDERWRITER.touch].includes(underwriter)) return 0;
  const observed = await observedMarketPrice(symbol, underwriter, price, fetchImpl);
  if (underwriter !== UNDERWRITER.flash) return marketPriceScale(observed, underwriter);
  const markets = apiList(await request('/flash/markets', { fetchImpl }));
  const market = markets.find(row => String(row?.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()
    && String(row?.side || '').toLowerCase() === String(side || '').toLowerCase());
  if (!market || !Number.isInteger(Number(market.priceExponent))) {
    throw error(`Imperial did not return the Flash price exponent for ${symbol} ${side}.`, 502);
  }
  return marketPriceScale(observed, underwriter, Number(market.priceExponent));
}

function makeOpenOrder(owner, body, route) {
  const symbol = String(body?.symbol || '').toUpperCase().replace(/[-/](PERP|USD|USDC)$/i, '');
  const side = String(body?.side || '').toLowerCase();
  const notional = positive(body?.notionalUsd ?? body?.notional_usd ?? body?.amount, 'Notional');
  const leverage = positive(body?.leverage || 1, 'Leverage');
  const selected = venueId(route);
  const kind = String(body?.orderType || body?.order_type || 'market').toLowerCase();
  const limit = kind !== 'market';
  const out = {
    wallet: owner,
    profileIndex: profileIndex(body?.profileIndex),
    symbol,
    side: side === 'short' ? 1 : 0,
    orderType: limit ? 1 : 0,
    action: 0,
    triggerCondition: side === 'short' ? 1 : 0,
    sizeUsd: usdMicro(notional, 'Notional'),
    collateralAmount: usdMicro(notional / leverage, 'Collateral'),
    slippageBps: Math.max(1, Math.min(5_000, Math.round(numberFrom(body?.slippageBps, 50)))),
    triggerPrice: limit ? Math.round(positive(body?.price, 'Limit price') * 1_000_000_000) : 0,
    underwriter: selected,
    priority: Math.max(0, Math.min(2, Math.round(numberFrom(body?.priority, 0)))),
    fundingStatus: 0,
    builderCode: BUILDER_CODE,
  };
  const loanUsd = body?.boost === true ? routeLoanUsd(route) : 0;
  if (loanUsd > 0) out.loanAmountUsd = usdMicro(loanUsd, 'Boost loan');
  return out;
}

function makeAttachedCloseOrders(entry, body) {
  const isShort = entry.side === 1;
  return [
    ['take_profit', body?.takeProfit ?? body?.take_profit ?? body?.tp, isShort ? 1 : 0],
    ['stop_loss', body?.stopLoss ?? body?.stop_loss ?? body?.sl, isShort ? 0 : 1],
  ].flatMap(([kind, value, triggerCondition]) => {
    const price = Number(value);
    if (!(price > 0)) return [];
    return [{
      ...entry,
      orderType: 5,
      action: 1,
      triggerCondition,
      sizeUsd: 0,
      collateralAmount: 0,
      closeBps: 10_000,
      triggerPrice: Math.round(price * 1_000_000_000),
      marketPrice: 0,
      loanAmountUsd: undefined,
      _clashKind: kind,
    }];
  });
}

function recordOrderProof(db, base, payload, result, orderType) {
  db?.recordImperialOrderProof?.({
    ...base,
    orderType,
    orderPda: result?.orderPda || result?.order_pda || null,
    txSignature: result?.signature || result?.txSignature || result?.transactionSignature || null,
    requestJson: { ...payload, _clashBuilderFeeBps: base.builderFeeBps ?? null },
    responseJson: result,
  });
}

async function placeOrder({ playerId, owner, jwt, body, db, fetchImpl = fetch }) {
  const linked = wallet(owner);
  const builderStatus = await assertBuilder(fetchImpl);
  const route = await getRoute({
    symbol: body?.symbol,
    side: body?.side,
    notional: body?.notionalUsd ?? body?.notional_usd ?? body?.amount,
    leverage: body?.leverage,
    holdHours: body?.holdHours,
    wallet: linked,
    profileIndex: profileIndex(body?.profileIndex),
    pinnedUnderwriter: body?.pinnedUnderwriter,
  }, fetchImpl);
  const payload = makeOpenOrder(linked, body, route);
  payload.marketPrice = await encodedMarketPrice({
    symbol: payload.symbol,
    side: body?.side,
    underwriter: payload.underwriter,
    price: body?.marketPrice ?? route?.markPrice ?? route?.price,
    resting: payload.orderType !== 0,
    fetchImpl,
  });
  // Preflight is authoritative and catches profile/venue/liquidity failures
  // before a transaction is submitted by Imperial's mobile order endpoint.
  const preflight = await request('/mobile/orders/preflight', { method: 'POST', jwt, body: payload, fetchImpl });
  if (preflight?.ok === false) {
    throw error(preflight?.error || 'Imperial rejected the order during preflight.', 422, preflight);
  }
  const proofBase = {
    playerId,
    wallet: linked,
    profileIndex: payload.profileIndex,
    symbol: payload.symbol,
    side: body.side,
    builderCode: BUILDER_CODE,
    builderFeeBps: numberFrom(builderStatus?.data?.feeBps ?? builderStatus?.data?.builderFeeBps, 0) || null,
    underwriter: payload.underwriter,
  };
  const closeOrders = makeAttachedCloseOrders(payload, body);
  if (closeOrders.length) {
    const cleanCloseOrders = closeOrders.map(({ _clashKind, ...order }) => order);
    const batch = await request('/mobile/orders/batch', {
      method: 'POST', jwt, body: { entry: payload, closeOrders: cleanCloseOrders }, fetchImpl,
    });
    if (batch?.entry?.success === false) {
      throw error(batch.entry.error || 'Imperial rejected the entry order.', 422, batch.entry);
    }
    recordOrderProof(db, proofBase, payload, batch?.entry || {}, body.orderType || 'market');
    closeOrders.forEach((order, index) => {
      const { _clashKind, ...cleanOrder } = order;
      recordOrderProof(db, proofBase, cleanOrder, batch?.closeOrders?.[index] || {}, _clashKind);
    });
    const failedCloseOrders = apiList(batch?.closeOrders).filter(result => result?.success === false);
    return {
      ...(batch?.entry || {}),
      batch,
      attachedTpsl: true,
      route,
      preflight,
      builderCode: BUILDER_CODE,
      underlyingVenue: UNDERWRITER_LABEL[payload.underwriter],
      ...(failedCloseOrders.length ? {
        partialSuccess: true,
        error: `Imperial opened the position, but ${failedCloseOrders.length} attached TP/SL order(s) failed. Review the position and add protection again.`,
        closeOrderErrors: failedCloseOrders.map(result => ({ error: result?.error || 'Unknown Imperial close-order failure', errorCode: result?.errorCode || null })),
      } : {}),
    };
  }
  const result = await request('/mobile/orders', { method: 'POST', jwt, body: payload, fetchImpl });
  recordOrderProof(db, proofBase, payload, result, body.orderType || 'market');
  return { ...result, route, preflight, builderCode: BUILDER_CODE, underlyingVenue: UNDERWRITER_LABEL[payload.underwriter] };
}

async function authoritativePosition(jwt, owner, id, fetchImpl = fetch) {
  const positions = apiList(await request('/positions', { query: { walletAddress: owner }, fetchImpl }));
  const wanted = String(id || '');
  const found = positions.find(row => String(row?.id ?? row?.positionPda ?? row?.position_pda) === wanted);
  if (!found) throw error('Imperial position was not found for this linked wallet.', 404);
  return found;
}

async function closePosition({ playerId, owner, jwt, positionId, body, db, fetchImpl = fetch }) {
  const linked = wallet(owner);
  // Never trap an existing position behind builder onboarding. New entries are
  // fail-closed in placeOrder(), but a close must remain available even while
  // Imperial is activating CLASH. Add attribution whenever the code is active.
  const builderStatus = await getBuilderStatus(fetchImpl).catch(cause => ({ active: false, error: cause?.message || 'builder status unavailable' }));
  const activeBuilderCode = builderStatus?.active ? BUILDER_CODE : null;
  const position = await authoritativePosition(jwt, linked, positionId, fetchImpl);
  const selected = venueId(position);
  const payload = {
    wallet: linked,
    profileIndex: profileIndex(position?.profileIndex),
    symbol: String(position?.asset || position?.symbol || '').toUpperCase(),
    side: String(position?.side || '').toLowerCase() === 'short' || Number(position?.side) === 1 ? 1 : 0,
    orderType: 0,
    action: 1,
    triggerCondition: 0,
    sizeUsd: 0,
    collateralAmount: 0,
    closeBps: body?.fullClose === false ? Math.max(1, Math.min(10_000, Math.round(numberFrom(body?.closeBps, 10_000)))) : 10_000,
    slippageBps: Math.max(1, Math.min(5_000, Math.round(numberFrom(body?.slippageBps, 50)))),
    triggerPrice: 0,
    underwriter: selected,
    priority: 0,
    fundingStatus: 0,
    ...(activeBuilderCode ? { builderCode: activeBuilderCode } : {}),
  };
  payload.marketPrice = await encodedMarketPrice({
    symbol: payload.symbol,
    side: Number(payload.side) ? 'short' : 'long',
    underwriter: selected,
    price: position?.markPrice,
    fetchImpl,
  });
  const preflight = await request('/mobile/orders/preflight', { method: 'POST', jwt, body: payload, fetchImpl });
  if (preflight?.ok === false) throw error(preflight?.error || 'Imperial rejected the close during preflight.', 422, preflight);
  const result = await request('/mobile/orders', { method: 'POST', jwt, body: payload, fetchImpl });
  if (activeBuilderCode) db?.recordImperialOrderProof?.({ playerId, wallet: linked, profileIndex: payload.profileIndex, symbol: payload.symbol, side: Number(payload.side) ? 'short' : 'long', orderType: 'close', builderCode: activeBuilderCode, underwriter: selected, orderPda: result?.orderPda || null, txSignature: result?.signature || result?.txSignature || null, requestJson: { ...payload, _clashBuilderFeeBps: numberFrom(builderStatus?.data?.feeBps ?? builderStatus?.data?.builderFeeBps, 0) || null }, responseJson: result });
  return { ...result, preflight, builderCode: activeBuilderCode, builderAttributionSkipped: !activeBuilderCode };
}

async function setPositionTpsl({ playerId, owner, jwt, positionId, body, db, fetchImpl = fetch }) {
  const linked = wallet(owner);
  const builderStatus = await getBuilderStatus(fetchImpl).catch(cause => ({ active: false, error: cause?.message || 'builder status unavailable' }));
  const activeBuilderCode = builderStatus?.active ? BUILDER_CODE : null;
  const position = await authoritativePosition(jwt, linked, positionId, fetchImpl);
  const selected = venueId(position);
  const isShort = String(position?.side || '').toLowerCase() === 'short' || Number(position?.side) === 1;
  const levels = [
    ['take_profit', body?.takeProfit ?? body?.take_profit, isShort ? 1 : 0],
    ['stop_loss', body?.stopLoss ?? body?.stop_loss, isShort ? 0 : 1],
  ].filter(([, value]) => Number(value) > 0);
  if (!levels.length) throw error('Set at least one valid Imperial TP or SL price.');
  const results = [];
  for (const [kind, value, triggerCondition] of levels) {
    const payload = {
      wallet: linked,
      profileIndex: profileIndex(position?.profileIndex),
      symbol: String(position?.asset || position?.symbol || '').toUpperCase(),
      side: isShort ? 1 : 0,
      orderType: 5,
      action: 1,
      triggerCondition,
      sizeUsd: 0,
      collateralAmount: 0,
      closeBps: 10_000,
      slippageBps: 50,
      triggerPrice: Math.round(positive(value, kind) * 1_000_000_000),
      underwriter: selected,
      priority: 0,
      fundingStatus: 0,
      marketPrice: 0,
      ...(activeBuilderCode ? { builderCode: activeBuilderCode } : {}),
    };
    const preflight = await request('/mobile/orders/preflight', { method: 'POST', jwt, body: payload, fetchImpl });
    if (preflight?.ok === false) throw error(preflight?.error || `Imperial rejected the ${kind} during preflight.`, 422, preflight);
    const result = await request('/mobile/orders', { method: 'POST', jwt, body: payload, fetchImpl });
    if (activeBuilderCode) db?.recordImperialOrderProof?.({ playerId, wallet: linked, profileIndex: payload.profileIndex, symbol: payload.symbol, side: isShort ? 'short' : 'long', orderType: kind, builderCode: activeBuilderCode, underwriter: selected, orderPda: result?.orderPda || null, txSignature: result?.signature || result?.txSignature || null, requestJson: { ...payload, _clashBuilderFeeBps: numberFrom(builderStatus?.data?.feeBps ?? builderStatus?.data?.builderFeeBps, 0) || null }, responseJson: result });
    results.push({ kind, preflight, ...result });
  }
  return { success: true, orders: results, builderCode: activeBuilderCode, builderAttributionSkipped: !activeBuilderCode };
}

async function cancelOrder(jwt, owner, orderPda, fetchImpl = fetch) {
  const linked = wallet(owner);
  const orders = await request('/orders', { query: { walletAddress: linked }, fetchImpl });
  const all = [...apiList(orders?.jupiterOrders), ...apiList(orders?.passthroughOrders), ...apiList(orders)];
  const target = all.find(row => String(row?.orderPda ?? row?.order_pda ?? row?.id) === String(orderPda));
  if (!target) throw error('Imperial order was not found for this linked wallet.', 404);
  return request('/mobile/orders/cancel', { method: 'POST', jwt, body: { wallet: linked, profileIndex: profileIndex(target?.profileIndex), orderPda: String(orderPda), cascadeChildren: true }, fetchImpl });
}

async function authoritativeOrder(owner, orderPda, fetchImpl = fetch) {
  const linked = wallet(owner);
  const orders = await request('/orders', { query: { walletAddress: linked }, fetchImpl });
  const all = [...apiList(orders?.jupiterOrders), ...apiList(orders?.passthroughOrders), ...apiList(orders)];
  const target = all.find(row => String(row?.orderPda ?? row?.order_pda ?? row?.id) === String(orderPda));
  if (!target) throw error('Imperial order was not found for this linked wallet.', 404);
  return target;
}

async function updateOrder(jwt, owner, orderPda, body, fetchImpl = fetch) {
  const linked = wallet(owner);
  const target = await authoritativeOrder(linked, orderPda, fetchImpl);
  const payload = {
    wallet: linked,
    orderPda: String(orderPda),
    profileIndex: profileIndex(target?.profileIndex),
  };
  if (body?.triggerPrice !== undefined) payload.triggerPrice = Math.round(positive(body.triggerPrice, 'Trigger price') * 1_000_000_000);
  if (body?.sizeUsd !== undefined) payload.sizeUsd = usdMicro(body.sizeUsd, 'Order size');
  if (body?.closeBps !== undefined) payload.closeBps = Math.max(1, Math.min(10_000, Math.round(numberFrom(body.closeBps))));
  if (body?.slippageBps !== undefined) payload.slippageBps = Math.max(1, Math.min(5_000, Math.round(numberFrom(body.slippageBps))));
  if (body?.priority !== undefined) payload.priority = Math.max(0, Math.round(numberFrom(body.priority)));
  if (Object.keys(payload).length === 3) throw error('No supported Imperial order update was provided.');
  return request('/mobile/orders/update', { method: 'POST', jwt, body: payload, fetchImpl });
}

async function editCollateral(jwt, owner, positionId, body, fetchImpl = fetch) {
  const linked = wallet(owner);
  const position = await authoritativePosition(jwt, linked, positionId, fetchImpl);
  const selected = venueId(position);
  const price = positive(body?.price ?? position?.markPrice, 'Market price');
  const scaledPrice = await encodedMarketPrice({
    symbol: position?.asset || position?.symbol,
    side: String(position?.side || '').toLowerCase() === 'short' || Number(position?.side) === 1 ? 'short' : 'long',
    underwriter: selected,
    price,
    fetchImpl,
  });
  if (scaledPrice === undefined) throw error('Collateral editing is unavailable for this Imperial underlying venue.');
  const marketMint = String(position?.marketMint || position?.market_mint || '').trim();
  if (!marketMint) throw error('Imperial did not return the market mint required for collateral editing.', 409);
  return request('/mobile/orders/collateral', {
    method: 'POST',
    jwt,
    body: {
      wallet: linked,
      marketMint,
      side: String(position?.side || '').toLowerCase() === 'short' || Number(position?.side) === 1 ? 1 : 0,
      action: String(body?.action || '').toLowerCase() === 'remove' ? 1 : 0,
      collateralAmount: usdMicro(body?.amount, 'Collateral amount'),
      slippageBps: Math.max(1, Math.min(5_000, Math.round(numberFrom(body?.slippageBps, 50)))),
      profileIndex: profileIndex(position?.profileIndex),
      underwriter: selected,
      price: scaledPrice,
    },
    fetchImpl,
  });
}

function normalizedMarketRows(raw) {
  const venueKeys = ['jupiter', 'flash', 'phoenix', 'gmtrade', 'flash_v2', 'pairs', 'touch'];
  return apiList(raw).map(row => {
    const venues = venueKeys.flatMap(venue => {
      const entry = row?.[venue];
      const price = numberFrom(entry?.price ?? entry?.markPrice, 0);
      return entry && price > 0 ? [{ venue, ...entry, price }] : [];
    });
    const preferred = venues.find(entry => entry.venue === 'phoenix') || venues[0] || {};
    return { symbol: row?.symbol, price: numberFrom(preferred.price, 0), markPrice: numberFrom(preferred.price, 0), venues };
  }).filter(row => row.symbol && row.price > 0);
}

function normalizedFundingRows(raw) {
  const venueKeys = ['jupiter', 'flash', 'phoenix', 'gmtrade', 'flash_v2', 'pairs', 'touch'];
  return apiList(raw).map(row => {
    const venues = venueKeys.flatMap(venue => row?.[venue] ? [{ venue, ...row[venue] }] : []);
    const preferred = venues.find(entry => Number.isFinite(Number(entry.longFundingRatePerHourPercent)))
      || venues.find(entry => Number.isFinite(Number(entry.longBorrowRatePerHourPercent))) || {};
    const ratePercent = numberFrom(preferred.longFundingRatePerHourPercent ?? preferred.longBorrowRatePerHourPercent, 0);
    return { symbol: row?.symbol, fundingRate: ratePercent / 100, venues };
  }).filter(row => row.symbol);
}

async function getMarketInfo(fetchImpl = fetch) {
  const [marksRaw, fundingRaw] = await Promise.all([
    request('/mark-prices', { fetchImpl }),
    request('/funding-rates', { fetchImpl }),
  ]);
  const fundingBySymbol = new Map(normalizedFundingRows(fundingRaw).map(row => [row.symbol, row]));
  return normalizedMarketRows(marksRaw).map(row => ({
    ...row,
    funding_rate: fundingBySymbol.get(row.symbol)?.fundingRate || 0,
    funding_venues: fundingBySymbol.get(row.symbol)?.venues || [],
    lot_size: 0.000001,
    max_leverage: 250,
  }));
}

async function getPrices(fetchImpl = fetch) {
  return normalizedMarketRows(await request('/mark-prices', { fetchImpl }))
    .map(row => ({ symbol: row.symbol, price: row.price, mark_price: row.markPrice, venues: row.venues }));
}

async function snapshot(jwt, owner, selectedProfile = 0, fetchImpl = fetch) {
  const linked = wallet(owner);
  const idx = profileIndex(selectedProfile);
  const [balancesRaw, v2BalancesRaw, positionsRaw, ordersRaw, tradesRaw, marksRaw, fundingRaw, builder, partner] = await Promise.all([
    request('/mobile/balances', { jwt, fetchImpl }),
    request('/mobile/v2/balance', { jwt, fetchImpl }).catch(() => ({ profiles: [] })),
    request('/positions', { query: { walletAddress: linked }, fetchImpl }),
    request('/orders', { query: { walletAddress: linked }, fetchImpl }),
    request('/trades', { query: { walletAddress: linked, limit: 200 }, fetchImpl }),
    request('/mark-prices', { fetchImpl }),
    request('/funding-rates', { fetchImpl }),
    getBuilderStatus(fetchImpl),
    partnerStatus(jwt, fetchImpl),
  ]);
  const balances = apiList(balancesRaw);
  const selected = balances.find(row => Number(row?.profileIndex ?? row?.index) === idx) || balances[idx] || {};
  const v2Balances = apiList(v2BalancesRaw);
  const selectedV2 = v2Balances.find(row => Number(row?.profileIndex ?? row?.index) === idx) || v2Balances[idx] || {};
  const profileUsdc = numberFrom(selected?.usdc, 0) / 1_000_000;
  const v2AvailableUsdc = numberFrom(selectedV2?.availableUsdc, 0) / 1_000_000;
  const balanceUsd = profileUsdc + v2AvailableUsdc;
  return {
    account: {
      balance: balanceUsd,
      equity: balanceUsd,
      available_to_spend: balanceUsd,
      profile_usdc: profileUsdc,
      flash_v2_available_usdc: v2AvailableUsdc,
      profile_index: idx,
      profiles: balances.map(row => ({ ...row, usdcUsd: numberFrom(row?.usdc, 0) / 1_000_000 })),
      v2_profiles: v2Balances.map(row => ({ ...row, availableUsdcUsd: numberFrom(row?.availableUsdc, 0) / 1_000_000 })),
    },
    positions: apiList(positionsRaw),
    orders: [...apiList(ordersRaw?.jupiterOrders), ...apiList(ordersRaw?.passthroughOrders), ...apiList(ordersRaw)],
    trades: apiList(tradesRaw),
    marks: normalizedMarketRows(marksRaw),
    funding: normalizedFundingRows(fundingRaw),
    builder_status: builder,
    partner_status: partner,
  };
}

async function history(jwt, owner, options = {}, fetchImpl = fetch) {
  const linked = wallet(owner);
  const idx = profileIndex(options.profileIndex);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const [orders, pnl, funding] = await Promise.all([
    request('/order-history', { query: { walletAddress: linked, limit }, fetchImpl }),
    request('/pnl-history', { query: { walletAddress: linked, resolution: options.resolution === '1h' ? '1h' : '1d' }, fetchImpl }),
    request('/funding-history', { query: { walletAddress: linked, limit }, fetchImpl }),
  ]);
  const sameProfile = row => row?.profileIndex === undefined || Number(row.profileIndex) === idx;
  return { orders: apiList(orders).filter(sameProfile), pnl: apiList(pnl), funding: apiList(funding).filter(sameProfile) };
}

async function buildDeposit(jwt, owner, body, fetchImpl = fetch) {
  return request('/deposit/build-tx', { method: 'POST', jwt, body: { wallet: wallet(owner), profileIndex: profileIndex(body?.profileIndex), amount: usdMicro(body?.amount, 'Deposit amount'), mode: body?.mode === 'withdraw' ? 'withdraw' : 'deposit' }, fetchImpl });
}

async function depositToV2(jwt, owner, body, fetchImpl = fetch) {
  return request('/mobile/v2/deposit', {
    method: 'POST', jwt,
    body: { wallet: wallet(owner), profileIndex: profileIndex(body?.profileIndex), amount: usdMicro(body?.amount, 'Flash V2 deposit amount') },
    fetchImpl,
  });
}

async function setMarginMode(jwt, owner, body, fetchImpl = fetch) {
  const mode = String(body?.marginMode || body?.margin_mode || '').toLowerCase();
  if (!['isolated', 'unified'].includes(mode)) throw error('Imperial margin mode must be isolated or unified.');
  return request(`/passthrough/users/${wallet(owner)}/profiles/${profileIndex(body?.profileIndex)}/margin-mode`, { method: 'PUT', jwt, body: { marginMode: mode }, fetchImpl });
}

async function syncProfile(jwt, owner, body, fetchImpl = fetch) {
  return request(`/passthrough/users/${wallet(owner)}/profiles/${profileIndex(body?.profileIndex)}/sync`, { method: 'POST', jwt, fetchImpl });
}

function asIso(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value);
    const ms = n > 10_000_000_000 ? n : n * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function executionRowsFromOrder(detail, proof) {
  const fills = apiList(detail?.fills).length ? apiList(detail?.fills) : apiList(detail?.data?.fills);
  const source = fills.length ? fills : [detail];
  return source.flatMap((fill, index) => {
    const status = String(fill?.status || detail?.displayStatus || detail?.status || '').toLowerCase();
    const signature = fill?.txSignature || fill?.transactionSignature || fill?.signature || detail?.executionSignature || proof.tx_signature;
    const rawNotional = fill?.sizeUsd ?? fill?.notionalUsd ?? fill?.filledSizeUsd ?? detail?.filledSizeUsd;
    const notional = numberFrom(rawNotional, 0);
    const normalizedNotional = notional;
    if (!signature || normalizedNotional <= 0 || (status && !/fill|execut|success|confirm/.test(status))) return [];
    const priceRaw = fill?.price ?? fill?.executionPrice ?? detail?.price ?? detail?.averagePrice;
    const priceNumber = numberFrom(priceRaw, 0);
    const price = priceNumber;
    return [{
      signature: String(signature),
      notional: normalizedNotional,
      amount: String(fill?.size ?? fill?.quantity ?? normalizedNotional),
      price: price > 0 ? String(price) : null,
      pnl: fill?.pnlRealized ?? fill?.realizedPnl ?? null,
      fee: fill?.feesUsd ?? fill?.fees ?? fill?.feeUsd ?? null,
      createdAt: asIso(fill?.time ?? fill?.timestamp ?? fill?.createdAt ?? detail?.executedAt ?? detail?.createdAt, proof.created_at),
      index,
      raw: fill,
    }];
  });
}

function executionRowsFromActions(trades, proof) {
  const expected = String(proof.tx_signature || '');
  if (!expected) return [];
  const out = [];
  for (const trade of apiList(trades)) {
    for (const [index, action] of apiList(trade?.actions).entries()) {
      const signatures = [action?.tx1Signature, action?.tx2Signature, action?.tx3Signature, action?.signature].filter(Boolean).map(String);
      if (!signatures.includes(expected)) continue;
      const rawNotional = action?.orderSizeUsd ?? action?.sizeDeltaUsd ?? action?.sizeUsd ?? action?.notionalUsd;
      const raw = numberFrom(rawNotional, 0);
      const notional = raw;
      if (notional <= 0 || !/success|fill|execut|confirm/i.test(String(action?.status || 'success'))) continue;
      const priceRaw = action?.entryPrice ?? action?.price ?? trade?.entryPrice;
      const priceNum = numberFrom(priceRaw, 0);
      out.push({ signature: expected, notional, amount: String(action?.sizeDelta ?? notional), price: String(priceNum || ''), pnl: action?.pnlRealized ?? null, fee: action?.platformFee ?? action?.jupiterFee ?? action?.proOrderFee ?? null, createdAt: asIso(action?.tx1Timestamp ?? action?.timestamp, proof.created_at), index, raw: action });
    }
  }
  return out;
}

async function importTradesForPlayer({ playerId, owner, jwt, db, limit = 500, fetchImpl = fetch }) {
  const linked = wallet(owner);
  const proofs = db?.listImperialOrderProofs?.(playerId, linked, limit) || [];
  if (!proofs.length) return { imported: 0, updated: 0, checked: 0, reason: 'No Clash-routed Imperial orders' };
  let trades = null;
  let imported = 0;
  let updated = 0;
  const errors = [];
  for (const proof of proofs) {
    try {
      let rows = [];
      if (proof.order_pda) {
        const detail = await request(`/order-history/${encodeURIComponent(proof.order_pda)}`, { jwt, fetchImpl });
        rows = executionRowsFromOrder(detail, proof);
      } else if (proof.tx_signature) {
        trades ||= await request('/trades', { query: { walletAddress: linked, limit: 200 }, fetchImpl });
        rows = executionRowsFromActions(trades, proof);
      }
      for (const row of rows) {
        let storedRequest = {};
        try { storedRequest = typeof proof.request_json === 'string' ? JSON.parse(proof.request_json) : (proof.request_json || {}); } catch {}
        const result = db.upsertVerifiedTrade(playerId, {
          symbol: proof.symbol,
          side: proof.side,
          orderType: proof.order_type,
          amount: row.amount,
          price: row.price,
          orderId: null,
          clientOrderId: `imperial:${linked}:${proof.profile_index}:${row.signature}:${row.index}`,
          status: 'filled',
          dex: 'imperial',
          notional_usd: row.notional,
          verifiedSource: 'imperial_api',
          pnl: row.pnl,
          fee: row.fee,
          proofJson: JSON.stringify({ builderCode: proof.builder_code, builderFeeBps: numberFrom(storedRequest?._clashBuilderFeeBps, 0) || null, underwriter: proof.underwriter, orderPda: proof.order_pda, signature: row.signature, execution: row.raw }),
          createdAt: row.createdAt,
        });
        imported += result.inserted || 0;
        updated += result.updated || 0;
      }
    } catch (cause) {
      errors.push({ orderPda: proof.order_pda, signature: proof.tx_signature, error: cause.message });
    }
  }
  return { imported, updated, checked: proofs.length, errors: errors.slice(0, 10), builderCode: BUILDER_CODE };
}

module.exports = {
  API_BASE, BUILDER_CODE, PARTNER_CODE, REQUIRE_BUILDER, UNDERWRITER, UNDERWRITER_LABEL,
  apiList, isSolanaAddress, wallet, profileIndex, request, configStatus, getBuilderStatus,
  connect, revoke, partnerStatus, registerPartner, getRoute, makeOpenOrder, placeOrder,
  closePosition, setPositionTpsl, cancelOrder, updateOrder, editCollateral, snapshot, history, buildDeposit, depositToV2, setMarginMode, syncProfile,
  getMarketInfo, getPrices,
  importTradesForPlayer, executionRowsFromOrder, executionRowsFromActions, normalizedMarketRows, normalizedFundingRows,
};
