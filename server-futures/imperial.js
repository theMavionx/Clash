const API_BASE = String(process.env.IMPERIAL_API_URL || 'https://api.imperial.space/api/v1').replace(/\/+$/, '');
const BUILDER_CODE = String(process.env.IMPERIAL_BUILDER_CODE || 'CLASH').trim().toUpperCase();
const PARTNER_CODE = String(process.env.IMPERIAL_PARTNER_CODE || '').trim().toUpperCase();
const REQUEST_TIMEOUT_MS = Math.max(2_000, Math.min(30_000, Number(process.env.IMPERIAL_TIMEOUT_MS || 12_000)));
const REQUIRE_BUILDER = !/^(0|false|no)$/i.test(String(process.env.IMPERIAL_REQUIRE_BUILDER_ACTIVE ?? 'true'));

const UNDERWRITER = Object.freeze({ jupiter: 0, flash: 1, phoenix: 2, gmtrade: 3, flash_v2: 4, pairs: 5, touch: 6 });
const UNDERWRITER_LABEL = Object.freeze(Object.fromEntries(Object.entries(UNDERWRITER).map(([name, id]) => [id, name])));
// Public, priced TP/SL is a keeper-triggered StopLimit decrease. PrivateTpSl
// (5) requires triggerPrice=0 on-chain; a priced order fails with Custom25.
// Use the explicit type instead of relying on venue-specific API rewrites.
const PRICED_TPSL_ORDER_TYPE = 2;

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

function orderSide(value) {
  const side = String(value ?? '').trim().toLowerCase();
  if (['long', 'bid', 'buy'].includes(side)) return 'long';
  if (['short', 'ask', 'sell'].includes(side)) return 'short';
  throw error('Imperial side must be long or short.');
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
    if (value !== undefined && value !== null && (value !== '' || key === 'excludedVenues')) url.searchParams.set(key, String(value));
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
    ws_url: new URL('/ws', API_BASE).href.replace(/^http/, 'ws'),
    market_ws_url: new URL('/ws/market', API_BASE).href.replace(/^http/, 'ws'),
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
  return { jwt: exchanged.jwt, expiresAt: exchanged.expiresAt || exchanged.expires_at || null, wallet: owner };
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
  const side = orderSide(input?.side);
  const pinnedInput = input?.stickyVenue ?? input?.pinnedUnderwriter;
  const pinned = venueName(pinnedInput);
  if (pinnedInput != null && pinnedInput !== '' && !pinned) throw error('Unknown Imperial venue.');
  let excluded;
  if (input?.excludedVenues != null) {
    const entries = Array.isArray(input.excludedVenues) ? input.excludedVenues : String(input.excludedVenues).split(',');
    const names = entries.map(value => String(value).trim()).filter(Boolean);
    if (names.some(value => !venueName(value))) throw error('Unknown excluded Imperial venue.');
    excluded = [...new Set(names.map(venueName))].join(',');
  }
  return request('/route', {
    query: {
      asset: symbol,
      side,
      notional: positive(input?.notional, 'Notional'),
      desiredLeverage: positive(input?.leverage || 1, 'Leverage'),
      holdHours: Math.max(1, Math.min(720, Number(input?.holdHours || 24))),
      wallet: input?.wallet || undefined,
      profileIndex: input?.profileIndex ?? undefined,
      stickyVenue: pinned || undefined,
      subaccountDefaultVenue: venueName(input?.subaccountDefaultVenue) || undefined,
      excludedVenues: excluded,
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
  const side = orderSide(body?.side);
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
  // The router calculates reach/safer-liq borrowing for the requested leverage.
  // Never accept a loan amount from the client.
  const loanUsd = routeLoanUsd(route);
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
      orderType: PRICED_TPSL_ORDER_TYPE,
      action: 1,
      triggerCondition,
      sizeUsd: entry.sizeUsd,
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
  body = { ...body, side: orderSide(body?.side) };
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
    excludedVenues: body?.excludedVenues,
  }, fetchImpl);
  const pinned = venueName(body?.pinnedUnderwriter);
  if (body?.pinnedUnderwriter != null && body.pinnedUnderwriter !== '' && !pinned) {
    throw error('Unknown Imperial venue.');
  }
  if (pinned && UNDERWRITER_LABEL[venueId(route)] !== pinned) {
    throw error('The selected venue cannot serve this order. Choose Auto-route or another venue.', 422);
  }
  if (route?.clamped === true) {
    throw error(`Imperial supports up to ${route.clampedMaxLeverage ?? route.maxLeverage}x for this route. Lower leverage or choose another venue.`, 422);
  }
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
  if (body?.fullClose === false && (!Number.isInteger(Number(body.closeBps)) || Number(body.closeBps) < 1 || Number(body.closeBps) > 10000)) {
    throw error('A partial Imperial close requires closeBps between 1 and 10000.');
  }
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
  const prepared = [];
  for (const [kind, value, triggerCondition] of levels) {
    const payload = {
      wallet: linked,
      profileIndex: profileIndex(position?.profileIndex),
      symbol: String(position?.asset || position?.symbol || '').toUpperCase(),
      side: isShort ? 1 : 0,
      orderType: PRICED_TPSL_ORDER_TYPE,
      action: 1,
      triggerCondition,
      // Resting protection is sized at placement, unlike a market full close.
      sizeUsd: usdMicro(position.sizeUsd ?? position.size_usd, 'Position size'),
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
    prepared.push({kind,payload,preflight});
  }
  // Validate both legs before submitting either. API submission is sequential,
  // not atomic: if the second write fails, disclose the already-created leg.
  for (const {kind,payload,preflight} of prepared) {
    let result;
    try { result = await request('/mobile/orders', { method: 'POST', jwt, body: payload, fetchImpl }); }
    catch (cause) {
      if (!results.length) throw cause;
      throw error(`Imperial created ${results.map(row => row.kind).join(', ')}, but ${kind} failed: ${cause.message}. Review existing protection before retrying.`, cause.status || 502, {partialSuccess:true,orders:results});
    }
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

// Share a bounded public stats read across player snapshots; prices must not
// become unavailable just because the secondary statistics endpoint failed.
const marketStatsCache = new WeakMap();
async function marketStats(fetchImpl) {
  const cached = marketStatsCache.get(fetchImpl);
  if (cached && cached.until > Date.now()) return cached.promise;
  const promise = request('/stats/markets', { query: { period: '24h' }, fetchImpl }).catch(() => null);
  marketStatsCache.set(fetchImpl, { until: Date.now() + 30000, promise });
  return promise;
}

function normalizedMarketRows(raw, stats = null) {
  const statsBySymbol = new Map(apiList(stats).map(row => [row.symbol, row]));
  const venueKeys = ['jupiter', 'flash', 'phoenix', 'gmtrade', 'flash_v2', 'pairs', 'touch'];
  return apiList(raw).map(row => {
    const venues = venueKeys.flatMap(venue => {
      const entry = row?.[venue];
      const price = numberFrom(entry?.price ?? entry?.markPrice, 0);
      return entry && price > 0 ? [{ venue, ...entry, price }] : [];
    });
    const fresh = venues.filter(entry => entry.fetchedAtUnixMs != null && Date.now()-Number(entry.fetchedAtUnixMs)<60000);
    const preferred = row?.index?.price > 0 ? row.index : fresh.find(entry => entry.venue === 'phoenix') || fresh[0] || venues[0] || {};
    const statistics = statsBySymbol.get(row?.symbol);
    return { symbol: row?.symbol, price: numberFrom(preferred.price, 0), markPrice: numberFrom(preferred.price, 0), venues,
      oracle: row?.index?.price > 0 ? Number(row.index.price) : null,
      oracle_source: row?.index?.source || null,
      oracle_at: row?.index?.fetchedAtUnixMs ?? null,
      // Imperial's own routed activity, not the total activity of each venue.
      volume_24h: stats ? numberFrom(statistics?.volumeUsd, 0) : null,
      open_interest: stats ? numberFrom(statistics?.openInterestUsd, 0) : null,
      price_change_24h: null,
      stats_source: stats ? 'imperial' : null,
    };
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
  const [marksRaw, fundingRaw, stats] = await Promise.all([
    request('/mark-prices', { fetchImpl }),
    request('/funding-rates', { fetchImpl }),
    marketStats(fetchImpl),
  ]);
  const fundingBySymbol = new Map(normalizedFundingRows(fundingRaw).map(row => [row.symbol, row]));
  return normalizedMarketRows(marksRaw, stats).map(row => ({
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

async function positionSnapshot(owner, selectedProfile = 0, fetchImpl = fetch) {
  const idx = profileIndex(selectedProfile);
  const raw = await request('/positions', {query:{walletAddress:wallet(owner)},fetchImpl});
  return {positions:apiList(raw).filter(row => row.profileIndex == null || Number(row.profileIndex) === idx), phoenixCrossSeats:raw.phoenixCrossSeats};
}

async function snapshot(jwt, owner, selectedProfile = 0, fetchImpl = fetch) {
  const linked = wallet(owner);
  const idx = profileIndex(selectedProfile);
  const [balancesRaw, v2BalancesRaw, positionsRaw, ordersRaw, marksRaw, fundingRaw, builder, partner, profileRaw, stats] = await Promise.all([
    request('/mobile/balances', { jwt, fetchImpl }),
    request('/mobile/v2/balance', { jwt, fetchImpl }).catch(() => ({ profiles: [] })),
    positionSnapshot(linked, idx, fetchImpl),
    request('/orders', { query: { walletAddress: linked }, fetchImpl }),
    request('/mark-prices', { fetchImpl }),
    request('/funding-rates', { fetchImpl }),
    getBuilderStatus(fetchImpl),
    partnerStatus(jwt, fetchImpl),
    request(`/passthrough/users/${linked}/profiles`, {jwt,fetchImpl}).catch(() => null),
    marketStats(fetchImpl),
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
      margin_mode: apiList(profileRaw).find(row => Number(row.profileIndex) === idx)?.marginMode ?? null,
      profiles: balances.map(row => ({ ...row, usdcUsd: numberFrom(row?.usdc, 0) / 1_000_000 })),
      v2_profiles: v2Balances.map(row => ({ ...row, availableUsdcUsd: numberFrom(row?.availableUsdc, 0) / 1_000_000 })),
    },
    positions: positionsRaw.positions,
    phoenixCrossSeats: positionsRaw.phoenixCrossSeats,
    orders: [...apiList(ordersRaw?.jupiterOrders), ...apiList(ordersRaw?.passthroughOrders), ...apiList(ordersRaw)].filter(row => row.profileIndex == null || Number(row.profileIndex) === idx),
    marks: normalizedMarketRows(marksRaw, stats),
    funding: normalizedFundingRows(fundingRaw),
    builder_status: builder,
    partner_status: partner,
  };
}

async function history(jwt, owner, options = {}, fetchImpl = fetch) {
  const linked = wallet(owner);
  const idx = profileIndex(options.profileIndex);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const sameProfile = row => row?.profileIndex == null || Number(row.profileIndex) === idx;
  // Independent tabs must not wait for (or fail with) unrelated history feeds.
  if (options.kind === 'trades') {
    const trades = await request('/trades', {query:{walletAddress:linked,limit},fetchImpl});
    return {trades:apiList(trades).filter(sameProfile),totalCount:trades.totalCount};
  }
  if (options.kind === 'funding') {
    const funding = await request('/funding-history', {query:{walletAddress:linked,limit},fetchImpl});
    return {funding:apiList(funding),totalCount:funding.totalCount,scope:'wallet'};
  }
  const [orders, pnl, funding, trades] = await Promise.all([
    request('/order-history', { query: { walletAddress: linked, limit }, fetchImpl }),
    request('/pnl-history', { query: { walletAddress: linked, resolution: options.resolution === '1h' ? '1h' : '1d' }, fetchImpl }),
    request('/funding-history', { query: { walletAddress: linked, limit }, fetchImpl }),
    request('/trades', { query: { walletAddress: linked, limit }, fetchImpl }),
  ]);
  return { orders: apiList(orders).filter(sameProfile), pnl: apiList(pnl), funding: apiList(funding).filter(sameProfile), trades:apiList(trades).filter(sameProfile) };
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
  detail = detail?.data || detail;
  if (!detail || detail.orderPda !== proof.order_pda
    || Number(detail.profileIndex) !== Number(proof.profile_index)
    || (proof.tx_signature && detail.creationSignature !== proof.tx_signature)) return [];
  const fills = apiList(detail?.fills).length ? apiList(detail?.fills) : apiList(detail?.data?.fills);
  // Order-history uses raw fixed-point values, unlike the human-unit /trades
  // action feed. Never infer units from magnitude or use requested order size.
  const source = fills.length ? fills : Number(detail.fillCount) === 1 ? [{
    status: detail.status, txSignature: detail.executionSignature,
    sizeUsd: detail.filledSizeUsd, price: detail.avgFillPrice,
    feesUsd: detail.feesUsd, time: detail.executedAt,
  }] : [];
  return source.flatMap(fill => {
    const status = String(fill?.status || '').toLowerCase();
    const signature = fill?.txSignature;
    const notional = Math.abs(numberFrom(fill?.sizeUsd, 0)) / 1e6;
    const price = numberFrom(fill?.price, 0) / 1e9;
    // Without an immutable fill ID, multiple executions in one transaction
    // cannot be distinguished safely. Leave them for the action feed.
    if (!signature || source.filter(item => item?.txSignature === signature).length !== 1
      || notional <= 0 || price <= 0 || !/^(completed|filled|executed|success|confirmed|settled)$/.test(status)) return [];
    return [{
      signature: String(signature),
      executionId: null,
      executionSignature: String(signature),
      executionSignatureUnique: true,
      notional,
      amount: String(notional / price),
      price: String(price),
      pnl: null,
      fee: fill?.feesUsd == null ? null : numberFrom(fill.feesUsd, 0) / 1e6,
      createdAt: asIso(fill?.time ?? fill?.timestamp ?? fill?.createdAt ?? detail?.executedAt ?? detail?.createdAt, proof.created_at),
      raw: fill,
    }];
  });
}

function executionRowsFromActions(trades, proof, executionSignatures = []) {
  const expected = String(proof.tx_signature || '');
  if (!expected && !executionSignatures.length) return [];
  const out = [];
  const allActions = apiList(trades).flatMap(trade => apiList(trade?.actions));
  for (const trade of apiList(trades)) {
    if (trade?.profileIndex != null && Number(trade.profileIndex) !== Number(proof.profile_index ?? 0)) continue;
    if (trade?.walletAddress && trade.walletAddress !== proof.wallet) continue;
    for (const action of apiList(trade?.actions)) {
      const matching = allActions.filter(item => item?.tx2Signature && item.tx2Signature === action?.tx2Signature);
      const executionSignatureUnique = matching.length === 1;
      const creationMatch = !!expected && [action?.tx1Signature, action?.signature].filter(Boolean).map(String).includes(expected);
      // A shared settlement transaction is not proof that all of its actions
      // belong to this Clash order. Enrich by final signature only if unique.
      const finalMatch = executionSignatureUnique && (String(action?.tx2Signature || '') === expected
        || executionSignatures.includes(String(action?.tx2Signature || '')));
      if (!creationMatch && !finalMatch) continue;
      const rawNotional = action?.sizeDeltaUsd ?? action?.sizeDelta ?? action?.sizeUsd ?? action?.notionalUsd;
      const raw = numberFrom(rawNotional, 0);
      const notional = Math.abs(raw);
      if (notional <= 0 || !action?.tx2Signature || !/^(completed|converted|success|filled|executed|confirmed|settled)$/i.test(String(action?.status || ''))) continue;
      const executionId = action?.id ? String(action.id) : null;
      const executionSignature = String(action.tx2Signature);
      if (!executionId && !executionSignatureUnique) continue;
      const priceRaw = action?.entryPrice ?? action?.price ?? trade?.entryPrice;
      const priceNum = numberFrom(priceRaw, 0);
      out.push({ signature: expected, executionId, executionSignature, executionSignatureUnique, notional, amount: String(Math.abs(numberFrom(action?.sizeDeltaTokens, priceNum > 0 ? notional / priceNum : notional))), price: String(priceNum || ''), pnl: action?.pnlRealized ?? null, fee: action?.platformFee ?? action?.jupiterFee ?? action?.proOrderFee ?? null, createdAt: asIso(action?.tx2Timestamp ?? action?.timestamp, proof.created_at), raw: action });
    }
  }
  return out;
}

function existingImperialClientOrderId(db, playerId, owner, profile, row) {
  if (!db?.db?.prepare) return null;
  const prefix = `imperial:${owner}:${profile}:`;
  const candidates = db.db.prepare(`SELECT client_order_id, proof_json FROM trade_history
    WHERE player_id = ? AND dex = 'imperial' AND status = 'filled'
      AND verified_source = 'imperial_api' AND substr(client_order_id, 1, ?) = ? ORDER BY id`).all(String(playerId), prefix.length, prefix);
  for (const candidate of candidates) {
    let prior;
    try { prior = JSON.parse(candidate.proof_json); } catch { continue; }
    if (prior?.builderCode !== BUILDER_CODE || !prior.signature) continue;
    const id = prior.executionId || prior.execution?.id;
    const signature = prior.executionSignature || prior.execution?.tx2Signature || prior.execution?.txSignature;
    if (row.executionId && id && String(id) === row.executionId) return candidate.client_order_id;
    if ((!id || !row.executionId) && row.executionSignatureUnique && signature === row.executionSignature) return candidate.client_order_id;
  }
  return null;
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
      if (proof.builder_code !== BUILDER_CODE) continue;
      if (proof.order_pda) {
        const detail = await request(`/order-history/${encodeURIComponent(proof.order_pda)}`, { jwt, fetchImpl });
        const orderRows = executionRowsFromOrder(detail, proof);
        if (orderRows.length) {
          trades ||= await request('/trades', { query: { walletAddress: linked, limit: 200 }, fetchImpl });
          const actionRows = executionRowsFromActions(trades, { ...proof, wallet: linked }, orderRows.map(row => row.executionSignature));
          const allActions = apiList(trades).flatMap(trade => apiList(trade?.actions));
          rows = [...actionRows, ...orderRows.filter(row =>
            !actionRows.some(action => action.executionSignature === row.executionSignature)
            && allActions.filter(action => action?.tx2Signature === row.executionSignature).length <= 1)];
        }
      } else if (proof.tx_signature) {
        trades ||= await request('/trades', { query: { walletAddress: linked, limit: 200 }, fetchImpl });
        rows = executionRowsFromActions(trades, { ...proof, wallet: linked });
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
          clientOrderId: existingImperialClientOrderId(db, playerId, linked, proof.profile_index, row)
            || `imperial:${linked}:${proof.profile_index}:exec:${row.executionId ? `id:${row.executionId}` : `sig:${row.executionSignature}`}`,
          status: 'filled',
          dex: 'imperial',
          notional_usd: row.notional,
          verifiedSource: 'imperial_api',
          pnl: row.pnl,
          fee: row.fee,
          proofJson: JSON.stringify({ builderCode: proof.builder_code, builderFeeBps: numberFrom(storedRequest?._clashBuilderFeeBps, 0) || null, builderFeeBasisUsd: numberFrom(row.raw?.collateralDeposited, 0) || null, underwriter: proof.underwriter, orderPda: proof.order_pda, signature: row.signature, wallet: linked, profileIndex: Number(proof.profile_index), executionId: row.executionId, executionSignature: row.executionSignature, executionSignatureUnique: row.executionSignatureUnique, execution: row.raw }),
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
  closePosition, setPositionTpsl, cancelOrder, updateOrder, editCollateral, snapshot, positionSnapshot, history, buildDeposit, depositToV2, setMarginMode, syncProfile,
  getMarketInfo, getPrices,
  importTradesForPlayer, executionRowsFromOrder, executionRowsFromActions, normalizedMarketRows, normalizedFundingRows,
};
