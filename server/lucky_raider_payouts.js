const gameDb = require('./db');
const { deploymentOf, parseSolanaSecretKey } = require('./bridge_helpers');
const { createSolanaConnection, solanaRpcUrls, withSolanaRpcFallback } = require('./solana_rpc');

const SOLANA_MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const MANUAL_PAYOUT_CONFIRM = 'PAY_LUCKY_RAIDER_CLASH';
const PAYOUT_KEY_ENV_CANDIDATES = [
  'LUCKY_RAIDER_SOLANA_PAYOUT_KEY',
  'LUCKY_RAIDER_SOLANA_KEY',
  'CLASH_SOLANA_PAYOUT_KEY',
  'MARKETPLACE_SOLANA_CUSTODY_KEY',
  'CUSTODIAL_MARKETPLACE_SOLANA_KEY',
  'SOLANA_NFT_KEY',
  'NFT_SOLANA_KEY',
  'NFT_KEY',
];

let workerStarted = false;
let workerRunning = false;
let keypairCache = undefined;
let keypairSource = '';
let priceCache = null;
const mintInfoCache = new Map();

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return !!fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function resolveClashMint() {
  const dep = deploymentOf('solana') || {};
  return firstEnv(
    'LUCKY_RAIDER_SOLANA_CLASH_MINT',
    'GAME_SHOP_SOLANA_CLASH_MINT',
    'NFT_SOLANA_CLASH_MINT',
    'SOLANA_CLASH_MINT'
  ) || dep.clashMint || dep.paymentGroups?.clash?.mint || '';
}

function fallbackClashDecimals() {
  return Math.max(0, Math.min(18, Number(
    process.env.LUCKY_RAIDER_SOLANA_CLASH_DECIMALS
    || process.env.GAME_SHOP_SOLANA_CLASH_DECIMALS
    || process.env.NFT_SOLANA_CLASH_DECIMALS
    || process.env.CLASH_DECIMALS
    || 9
  ) || 9));
}

function solanaPayoutKeypair() {
  if (keypairCache !== undefined) return keypairCache;
  let raw = '';
  keypairSource = '';
  for (const name of PAYOUT_KEY_ENV_CANDIDATES) {
    const value = String(process.env[name] || '').trim();
    if (value) {
      raw = value;
      keypairSource = name;
      break;
    }
  }
  if (!raw) {
    keypairCache = null;
    return keypairCache;
  }
  const { Keypair } = require('@solana/web3.js');
  keypairCache = Keypair.fromSecretKey(parseSolanaSecretKey(raw));
  return keypairCache;
}

function normalizeSolanaPubkey(value, label = 'Solana address') {
  const { PublicKey } = require('@solana/web3.js');
  try {
    return new PublicKey(String(value || '').trim()).toBase58();
  } catch {
    throw new Error(`${label} is malformed`);
  }
}

function decimalToUnits(value, decimals) {
  const scale = 10n ** BigInt(Math.max(0, Number(decimals) || 0));
  const s = String(value ?? '0').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return 0n;
  const [whole, frac = ''] = s.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole || '0') * scale + BigInt(fracPadded || '0');
}

function formatUnits(units, decimals) {
  const amount = BigInt(String(units || '0'));
  const scale = 10n ** BigInt(Math.max(0, Number(decimals) || 0));
  const whole = amount / scale;
  const frac = (amount % scale).toString().padStart(Number(decimals) || 0, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function usdToTokenUnits(usdAmount, tokenUsdPrice, decimals) {
  const usd = decimalToUnits(usdAmount, 12);
  const price = decimalToUnits(tokenUsdPrice, 12);
  if (usd <= 0n || price <= 0n) return 0n;
  const scale = 10n ** BigInt(Math.max(0, Number(decimals) || 0));
  return (usd * scale + price - 1n) / price;
}

async function fetchClashUsdPrice(mint) {
  const override = firstEnv(
    'LUCKY_RAIDER_CLASH_USD_PRICE',
    'NFT_COP_USD_PRICE',
    'COP_USD_PRICE',
    'NFT_CLASH_USD_PRICE',
    'CLASH_USD_PRICE'
  );
  if (override && Number(override) > 0) return { price: String(override), source: 'env' };

  const token = normalizeSolanaPubkey(mint, 'CLASH mint');
  const now = Date.now();
  const cacheMs = Math.max(5_000, Number(process.env.LUCKY_RAIDER_CLASH_PRICE_CACHE_MS || process.env.NFT_CLASH_PRICE_CACHE_MS || 600_000) || 600_000);
  if (priceCache?.token === token && priceCache.expiresAt > now) return priceCache.value;

  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`);
  if (!r.ok) throw new Error(`DexScreener ${r.status}`);
  const json = await r.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  const minLiquidityUsd = Math.max(0, Number(process.env.LUCKY_RAIDER_CLASH_MIN_LIQUIDITY_USD || process.env.NFT_SPL_MIN_LIQUIDITY_USD || 5_000) || 5_000);
  const allowedQuoteSymbols = new Set(
    String(process.env.LUCKY_RAIDER_CLASH_ALLOWED_QUOTE_SYMBOLS || process.env.NFT_SPL_ALLOWED_QUOTE_SYMBOLS || 'USDC,USDT,SOL,WSOL')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
  );
  const bestPair = pairs
    .filter((pair) => (
      String(pair?.chainId || '').toLowerCase() === 'solana'
      && String(pair?.baseToken?.address || '').toLowerCase() === token.toLowerCase()
      && Number(pair?.priceUsd) > 0
      && Number(pair?.liquidity?.usd || 0) >= minLiquidityUsd
      && allowedQuoteSymbols.has(String(pair?.quoteToken?.symbol || '').toUpperCase())
    ))
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
  if (!bestPair) throw new Error(`CLASH/USD Solana price missing or liquidity below ${minLiquidityUsd}`);

  const priceNumber = Number(bestPair.priceUsd);
  const minPrice = Number(process.env.LUCKY_RAIDER_CLASH_MIN_USD || process.env.NFT_CLASH_MIN_USD || 0);
  const maxPrice = Number(process.env.LUCKY_RAIDER_CLASH_MAX_USD || process.env.NFT_CLASH_MAX_USD || 0);
  if (minPrice > 0 && priceNumber < minPrice) throw new Error('CLASH/USD price below safety floor');
  if (maxPrice > 0 && priceNumber > maxPrice) throw new Error('CLASH/USD price above safety ceiling');

  const value = {
    price: String(bestPair.priceUsd),
    source: `DexScreener solana ${bestPair.dexId || ''} ${bestPair.pairAddress || ''}`.trim(),
  };
  priceCache = { token, value, expiresAt: now + cacheMs };
  return value;
}

async function resolveMintInfo(mint) {
  const token = normalizeSolanaPubkey(mint, 'CLASH mint');
  const cached = mintInfoCache.get(token);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const { Connection, PublicKey } = require('@solana/web3.js');
  const { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
  const mintPk = new PublicKey(token);
  const fallback = {
    mint: token,
    decimals: fallbackClashDecimals(),
    tokenProgramId: TOKEN_PROGRAM_ID,
  };
  const value = await withSolanaRpcFallback(async (rpc) => {
    const conn = createSolanaConnection(Connection, rpc, 'confirmed');
    let lastError = null;
    for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].filter(Boolean)) {
      try {
        const info = await getMint(conn, mintPk, 'confirmed', programId);
        return {
          mint: token,
          decimals: Number(info.decimals),
          tokenProgramId: programId,
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('CLASH mint account not found');
  }, { label: 'Lucky Raider CLASH mint lookup' }).catch((err) => {
    console.warn('[lucky-raider-payout] mint lookup failed; using fallback decimals:', err?.message || err);
    return fallback;
  });
  mintInfoCache.set(token, { value, expiresAt: now + 10 * 60_000 });
  return value;
}

async function waitForSolanaSignature(connection, signature, label) {
  if (!signature) return false;
  for (let i = 0; i < 20; i += 1) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
    const value = status?.value?.[0];
    if (value?.err) throw new Error(`${label || 'Solana transaction'} failed: ${JSON.stringify(value.err)}`);
    if (value && ['confirmed', 'finalized'].includes(value.confirmationStatus)) return true;
  }
  return false;
}

async function sendAndConfirmFresh(connection, transaction, signers, label) {
  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = signers[0].publicKey;
  transaction.sign(...signers);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
    maxRetries: 5,
  });
  try {
    const confirmed = await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }, 'confirmed');
    if (confirmed.value?.err) throw new Error(`${label || 'Solana transaction'} failed: ${JSON.stringify(confirmed.value.err)}`);
    return signature;
  } catch (err) {
    if (await waitForSolanaSignature(connection, signature, label)) return signature;
    throw err;
  }
}

async function sendClashToken({ to, amountUnits, payoutId, memo }) {
  const signer = solanaPayoutKeypair();
  if (!signer) throw new Error('Lucky Raider Solana payout signer is not configured');
  const mint = resolveClashMint();
  if (!mint) throw new Error('Lucky Raider CLASH mint is not configured');
  const mintInfo = await resolveMintInfo(mint);
  const amount = BigInt(String(amountUnits || '0'));
  if (amount <= 0n) throw new Error('Lucky Raider payout amount must be greater than zero');

  const { Connection, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');
  const {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
  } = require('@solana/spl-token');

  const mintPk = new PublicKey(mintInfo.mint);
  const tokenProgramId = mintInfo.tokenProgramId;
  const destOwner = new PublicKey(normalizeSolanaPubkey(to, 'Lucky Raider payout wallet'));
  const srcAta = getAssociatedTokenAddressSync(mintPk, signer.publicKey, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const destAta = getAssociatedTokenAddressSync(mintPk, destOwner, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  return withSolanaRpcFallback(async (rpc) => {
    const conn = createSolanaConnection(Connection, rpc, 'confirmed');
    const [srcInfo, destInfo, signerLamports, tokenRentLamports] = await Promise.all([
      conn.getAccountInfo(srcAta, 'confirmed'),
      conn.getAccountInfo(destAta, 'confirmed'),
      conn.getBalance(signer.publicKey, 'confirmed'),
      conn.getMinimumBalanceForRentExemption(165),
    ]);
    if (!srcInfo) throw new Error(`Lucky Raider payout source CLASH account is missing for ${signer.publicKey.toBase58()}`);
    const sourceBalance = BigInt((await conn.getTokenAccountBalance(srcAta, 'confirmed')).value.amount || '0');
    if (sourceBalance < amount) {
      throw new Error(`Lucky Raider payout treasury has insufficient CLASH: need ${formatUnits(amount, mintInfo.decimals)}, available ${formatUnits(sourceBalance, mintInfo.decimals)}`);
    }
    const rentNeeded = destInfo ? 0 : tokenRentLamports;
    if (signerLamports < rentNeeded + 10_000) {
      throw new Error(`Lucky Raider payout treasury needs SOL for recipient token account rent`);
    }

    const tx = new Transaction();
    tx.add(createAssociatedTokenAccountIdempotentInstruction(
      signer.publicKey,
      destAta,
      destOwner,
      mintPk,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ));
    tx.add(createTransferCheckedInstruction(srcAta, mintPk, destAta, signer.publicKey, amount, mintInfo.decimals, [], tokenProgramId));
    tx.add(new TransactionInstruction({
      keys: [],
      programId: new PublicKey(SOLANA_MEMO_PROGRAM),
      data: Buffer.from(String(memo || `Lucky Raider payout ${payoutId || ''}`).slice(0, 180), 'utf8'),
    }));
    return sendAndConfirmFresh(conn, tx, [signer], 'Lucky Raider CLASH payout');
  }, { label: 'Lucky Raider CLASH payout' });
}

function payoutSettings() {
  if (typeof gameDb.getLuckyRaiderPayoutSettings === 'function') {
    return gameDb.getLuckyRaiderPayoutSettings();
  }
  return {
    auto_payout_enabled: envFlag('LUCKY_RAIDER_AUTO_PAYOUT', false),
    manual_payout_enabled: true,
    wallet_link_required: true,
    max_batch_size: Math.max(1, Math.min(100, Math.floor(Number(process.env.LUCKY_RAIDER_PAYOUT_BATCH_SIZE || 10) || 10))),
    max_attempts: Math.max(1, Math.min(50, Math.floor(Number(process.env.LUCKY_RAIDER_PAYOUT_MAX_ATTEMPTS || 5) || 5))),
    retry_seconds: Math.max(0, Math.min(86_400, Math.floor(Number(process.env.LUCKY_RAIDER_PAYOUT_RETRY_SECONDS || 300) || 300))),
  };
}

function payoutRuntimeConfig() {
  const settings = payoutSettings();
  let signerAddress = null;
  let signerReady = false;
  let signerError = '';
  try {
    const signer = solanaPayoutKeypair();
    signerReady = !!signer;
    signerAddress = signer?.publicKey?.toBase58?.() || null;
  } catch (err) {
    signerError = err?.message || String(err);
  }
  const mint = resolveClashMint();
  const payoutsEnabled = envFlag('LUCKY_RAIDER_PAYOUTS_ENABLED', true);
  return {
    enabled: payoutsEnabled && !!settings.auto_payout_enabled,
    payoutsEnabled,
    autoEnabled: payoutsEnabled && !!settings.auto_payout_enabled,
    manualEnabled: payoutsEnabled && !!settings.manual_payout_enabled,
    workerEnabled: envFlag('LUCKY_RAIDER_PAYOUT_WORKER', true),
    settings,
    signerReady,
    signerAddress,
    signerSource: keypairSource || null,
    signerError,
    clashMint: mint || null,
    rpcReady: solanaRpcUrls().length > 0,
  };
}

function validatePayoutRow(row, options = {}) {
  const settings = options.settings || payoutSettings();
  const rawDestination = String(row?.destination_wallet || row?.current_destination_wallet || '').trim();
  const errors = [];
  let destination = rawDestination;
  let walletValid = false;
  let walletLinked = false;
  let walletBlacklisted = false;
  if (!rawDestination) {
    errors.push('missing_destination_wallet');
  } else {
    try {
      destination = normalizeSolanaPubkey(rawDestination, 'Lucky Raider payout wallet');
      walletValid = true;
      walletBlacklisted = typeof gameDb.isWalletBlacklisted === 'function' && gameDb.isWalletBlacklisted(destination);
      if (walletBlacklisted) errors.push('wallet_blacklisted');
      walletLinked = typeof gameDb.isPlayerSolanaWalletLinked === 'function'
        ? gameDb.isPlayerSolanaWalletLinked(row.player_id, destination)
        : false;
      if (settings.wallet_link_required && !walletLinked) {
        errors.push('wallet_not_linked_to_winner');
      }
    } catch (err) {
      errors.push(err?.message || 'invalid_destination_wallet');
    }
  }
  const rewardUsd = Number(row?.reward_amount_usd || 0);
  if (!Number.isFinite(rewardUsd) || rewardUsd <= 0) errors.push('reward_amount_missing');
  if (!['pending', 'failed', 'processing', 'paid'].includes(String(row?.status || ''))) {
    errors.push('unsupported_payout_status');
  }
  return {
    destination,
    wallet_valid: walletValid,
    wallet_linked: walletLinked,
    wallet_blacklisted: walletBlacklisted,
    wallet_link_required: !!settings.wallet_link_required,
    sendable: errors.length === 0 && ['pending', 'failed'].includes(String(row?.status || '')),
    validation_errors: errors,
  };
}

function describeLuckyRaiderPayout(row, options = {}) {
  if (!row) return null;
  const validation = validatePayoutRow(row, options);
  return {
    ...row,
    destination_wallet: validation.destination || row.destination_wallet || null,
    reward_amount_usd: Number(row.reward_amount_usd || 0),
    clash_usd_price: Number(row.clash_usd_price || 0),
    attempts: Number(row.attempts || 0),
    wallet_valid: validation.wallet_valid,
    wallet_linked: validation.wallet_linked,
    wallet_blacklisted: validation.wallet_blacklisted,
    wallet_link_required: validation.wallet_link_required,
    sendable: validation.sendable,
    validation_errors: validation.validation_errors,
  };
}

async function quoteLuckyRaiderPayout(row, options = {}) {
  const settings = options.settings || payoutSettings();
  const described = describeLuckyRaiderPayout(row, { settings });
  if (!described) return null;
  if (!described.sendable) return { ...described, quote_ok: false };
  const mint = resolveClashMint();
  if (!mint) return { ...described, quote_ok: false, quote_error: 'clash_mint_missing' };
  try {
    const mintInfo = await resolveMintInfo(mint);
    const price = await fetchClashUsdPrice(mint);
    const amountUnits = usdToTokenUnits(described.reward_amount_usd, price.price, mintInfo.decimals);
    return {
      ...described,
      quote_ok: amountUnits > 0n,
      clash_mint: mintInfo.mint,
      clash_usd_price: Number(price.price),
      clash_amount: formatUnits(amountUnits, mintInfo.decimals),
      clash_amount_units: amountUnits.toString(),
      price_source: price.source,
      quote_error: amountUnits > 0n ? null : 'calculated_amount_zero',
    };
  } catch (err) {
    return {
      ...described,
      quote_ok: false,
      quote_error: err?.message || String(err),
    };
  }
}

async function processLuckyRaiderPayout(row, options = {}) {
  const settings = options.settings || payoutSettings();
  const maxAttempts = Math.max(1, Math.min(50, Math.floor(Number(options.maxAttempts || settings.max_attempts || process.env.LUCKY_RAIDER_PAYOUT_MAX_ATTEMPTS || 5) || 5)));
  const payout = gameDb.claimTournamentLuckyRaiderPayout(row.id, { maxAttempts });
  if (!payout) return { ok: true, skipped: true, id: row.id, reason: 'not_claimed' };

  try {
    const validation = validatePayoutRow(payout, { settings });
    if (validation.validation_errors.length) {
      throw new Error(validation.validation_errors.join(', '));
    }
    const destination = validation.destination;
    if (destination !== payout.destination_wallet) {
      gameDb.updateTournamentLuckyRaiderPayoutDestination(payout.id, destination);
    }
    const mint = resolveClashMint();
    const mintInfo = await resolveMintInfo(mint);
    const price = await fetchClashUsdPrice(mint);
    const amountUnits = usdToTokenUnits(payout.reward_amount_usd, price.price, mintInfo.decimals);
    if (amountUnits <= 0n) throw new Error('calculated CLASH payout is zero');
    const amountFormatted = formatUnits(amountUnits, mintInfo.decimals);
    const txHash = await sendClashToken({
      to: destination,
      amountUnits,
      payoutId: payout.id,
      memo: `Lucky Raider ${payout.tournament_id}/${payout.day_utc} #${payout.place} ${payout.id}`,
    });
    const updated = gameDb.markTournamentLuckyRaiderPayoutPaid(payout.id, {
      txHash,
      clashUsdPrice: Number(price.price),
      clashAmount: amountFormatted,
      clashAmountUnits: amountUnits.toString(),
      priceSource: price.source,
    });
    return { ok: true, id: payout.id, txHash, payout: updated };
  } catch (err) {
    const updated = gameDb.markTournamentLuckyRaiderPayoutFailed(payout.id, err);
    return { ok: false, id: payout.id, error: err?.message || String(err), payout: updated };
  }
}

async function processPendingLuckyRaiderPayouts(options = {}) {
  const config = payoutRuntimeConfig();
  const mode = options.mode === 'manual' ? 'manual' : 'auto';
  if (mode === 'manual' && options.confirm !== MANUAL_PAYOUT_CONFIRM) {
    return { ok: false, skipped: true, reason: 'manual_confirm_required', config };
  }
  if (mode === 'manual' && !config.manualEnabled) return { ok: true, skipped: true, reason: 'manual_payout_disabled', config };
  if (mode !== 'manual' && !config.autoEnabled) return { ok: true, skipped: true, reason: 'auto_payout_disabled', config };
  if (!config.clashMint) return { ok: true, skipped: true, reason: 'clash_mint_missing', config };
  if (!config.signerReady) return { ok: true, skipped: true, reason: config.signerError || 'signer_missing', config };
  if (!config.rpcReady) return { ok: true, skipped: true, reason: 'solana_rpc_missing', config };

  const ids = Array.isArray(options.ids)
    ? options.ids.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 100)
    : [];
  const listOptions = {
    limit: options.limit || config.settings.max_batch_size || process.env.LUCKY_RAIDER_PAYOUT_BATCH_SIZE || 10,
    maxAttempts: options.maxAttempts || config.settings.max_attempts || process.env.LUCKY_RAIDER_PAYOUT_MAX_ATTEMPTS || 5,
    retrySeconds: options.retrySeconds || config.settings.retry_seconds || process.env.LUCKY_RAIDER_PAYOUT_RETRY_SECONDS || 300,
  };
  const rows = ids.length
    ? ids.map((id) => gameDb.getTournamentLuckyRaiderPayout?.(id)).filter(Boolean)
    : gameDb.listPendingTournamentLuckyRaiderPayouts(listOptions);
  const results = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await processLuckyRaiderPayout(row, { ...options, settings: config.settings }));
  }
  return {
    ok: results.every((r) => r.ok || r.skipped),
    mode,
    processed: results.length,
    paid: results.filter((r) => r.ok && !r.skipped).length,
    failed: results.filter((r) => r.ok === false).length,
    results,
    config,
  };
}

async function previewPendingLuckyRaiderPayouts(options = {}) {
  const config = payoutRuntimeConfig();
  const ids = Array.isArray(options.ids)
    ? options.ids.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 100)
    : [];
  const listOptions = {
    limit: options.limit || config.settings.max_batch_size || process.env.LUCKY_RAIDER_PAYOUT_BATCH_SIZE || 10,
    maxAttempts: options.maxAttempts || config.settings.max_attempts || process.env.LUCKY_RAIDER_PAYOUT_MAX_ATTEMPTS || 5,
    retrySeconds: options.retrySeconds || config.settings.retry_seconds || process.env.LUCKY_RAIDER_PAYOUT_RETRY_SECONDS || 300,
  };
  const rows = ids.length
    ? ids.map((id) => gameDb.getTournamentLuckyRaiderPayout?.(id)).filter(Boolean)
    : gameDb.listPendingTournamentLuckyRaiderPayouts(listOptions);
  const payouts = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    payouts.push(await quoteLuckyRaiderPayout(row, { settings: config.settings }));
  }
  return {
    ok: true,
    config,
    scanned: rows.length,
    sendable: payouts.filter((row) => row?.sendable && row?.quote_ok).length,
    blocked: payouts.filter((row) => !row?.sendable || row?.quote_ok === false).length,
    payouts,
  };
}

async function runLuckyRaiderPayoutSweep(label = 'timer', options = {}) {
  if (workerRunning) return { ok: true, skipped: true, reason: 'already_running' };
  workerRunning = true;
  try {
    const result = await processPendingLuckyRaiderPayouts(options);
    if (Number(result?.processed || 0) > 0 || Number(result?.failed || 0) > 0) {
      console.log(`[lucky-raider-payout ${label}] processed=${result.processed || 0} paid=${result.paid || 0} failed=${result.failed || 0}`);
    }
    return result;
  } catch (err) {
    console.warn('[lucky-raider-payout] sweep failed:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    workerRunning = false;
  }
}

function startLuckyRaiderPayoutWorker() {
  if (!envFlag('LUCKY_RAIDER_PAYOUT_WORKER', true)) return;
  if (workerStarted) return;
  workerStarted = true;
  const intervalMs = Math.max(60_000, Number(process.env.LUCKY_RAIDER_PAYOUT_INTERVAL_MS || 5 * 60_000) || 5 * 60_000);
  setTimeout(() => runLuckyRaiderPayoutSweep('startup').catch(() => {}), 30_000).unref?.();
  setInterval(() => runLuckyRaiderPayoutSweep('interval').catch(() => {}), intervalMs).unref?.();
}

module.exports = {
  MANUAL_PAYOUT_CONFIRM,
  fetchClashUsdPrice,
  payoutRuntimeConfig,
  describeLuckyRaiderPayout,
  previewPendingLuckyRaiderPayouts,
  processPendingLuckyRaiderPayouts,
  runLuckyRaiderPayoutSweep,
  startLuckyRaiderPayoutWorker,
};
