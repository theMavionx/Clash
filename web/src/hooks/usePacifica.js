import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import { isFarcasterFrame } from './useFarcaster';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { usePacificaAgent } from './usePacificaAgent';
// Privy hooks — called only when VITE_PRIVY_APP_ID is set. That env var is a
// build-time constant, so the conditional call is stable per build (safe under
// rules-of-hooks even though ESLint can't statically prove it).
import { useSignMessage as usePrivySignMessage, useSignAndSendTransaction as usePrivySignAndSend } from '@privy-io/react-auth/solana';
import { useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';

// ---------- Farcaster direct signing ----------
// The @farcaster/mini-app-solana wallet passes UTF-8 strings to provider.signMessage(),
// but Warpcast native expects base64-encoded bytes. We bypass the wallet-standard adapter
// and call the provider directly with base64.
let _fcProvider = null;
async function getFcProvider() {
  if (_fcProvider) return _fcProvider;
  try {
    const { sdk } = await import('@farcaster/miniapp-sdk');
    _fcProvider = await sdk.wallet.getSolanaProvider();
  } catch {}
  return _fcProvider;
}

async function fcSignMessage(msgBytes) {
  const provider = await getFcProvider();
  if (!provider) return null;
  try {
    const msgB64 = btoa(Array.from(msgBytes, b => String.fromCharCode(b)).join(''));
    const res = await provider.signMessage(msgB64);
    if (!res?.signature) return null;
    return Uint8Array.from(atob(res.signature), c => c.charCodeAt(0));
  } catch { return null; }
}

// ---------- Pacifica Config ----------
const API = 'https://api.pacifica.fi/api/v1';
const WS_URL = 'wss://ws.pacifica.fi/ws';
const BUILDER_CODE = 'clashofperps';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';

// Gold rewards are calculated server-side via POST /trading/claim-gold

// Round down to lot size (avoids floating point errors)
function roundToLot(amount, lotSize) {
  if (!lotSize) return String(amount);
  const lot = parseFloat(lotSize);
  const decimals = (lotSize.toString().split('.')[1] || '').length;
  return (Math.floor(parseFloat(amount) / lot) * lot).toFixed(decimals);
}

// Pacifica on-chain deposit constants
const PACIFICA_PROGRAM = new PublicKey('PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH');
const CENTRAL_STATE = new PublicKey('9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY');
const VAULT_TOKEN = new PublicKey('72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ---------- Signing helpers ----------
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const s = {};
    for (const k of Object.keys(v).sort()) s[k] = sortKeys(v[k]);
    return s;
  }
  return v;
}

function buildMessage(type, payload) {
  const header = { type, timestamp: Date.now(), expiry_window: 30000 };
  return JSON.stringify(sortKeys({ ...header, data: payload }));
}

function getATA(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROGRAM
  )[0];
}

// ---------- Hook ----------
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;

export function usePacifica() {
  const { publicKey, signMessage, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  // Privy embedded-wallet integration. When PRIVY_ENABLED is false (no app id),
  // skip these hooks entirely — the provider isn't mounted, so calling them
  // would throw.
  let privySignMessage = null;
  let privyWalletObj = null;
  let privySendTx = null;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signMessage: pSign } = usePrivySignMessage();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { wallets: pWallets } = usePrivyWallets();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signAndSendTransaction: pSend } = usePrivySignAndSend();
    privySignMessage = pSign;
    privySendTx = pSend;
    privyWalletObj = (pWallets || []).find(w => w && w.walletClientType === 'privy') || (pWallets || [])[0] || null;
  }
  const privyAddr = privyWalletObj?.address || null;
  const privyActive = !publicKey && !!privyAddr;

  // Gate WS + polling on DEX. FuturesPanel instantiates BOTH hooks but only
  // one is shown — without this gate Pacifica WS would stay subscribed and
  // Pacifica HTTP polls would run while the user is trading on Avantis.
  const { dex } = useDex();
  const isActiveDex = dex === 'pacifica';

  const [account, setAccount] = useState(null);
  const [positions, _setPositionsRaw] = useState([]);
  const setPositions = (v) => {
    _setPositionsRaw(v);
    const list = typeof v === 'function' ? null : v;
    if (list) window._openPositionsCount = list.length;
  };
  const [orders, setOrders] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null); // flash notification
  const wsRef = useRef(null);
  const marketsRef = useRef([]);
  const withdrawTimerRef = useRef(null);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const walletAddr = publicKey?.toBase58() || privyAddr;

  // Master-wallet sign helper used by the agent-wallet hook for the ONE
  // popup the user ever sees: bind / revoke. Uses the same priority chain
  // as `signedRequest` below (FC → Privy → adapter) so any wallet type
  // can authorise the agent.
  const masterSign = useCallback(async (msgBytes) => {
    if (isFarcasterFrame()) {
      const sig = await fcSignMessage(msgBytes);
      if (sig) return sig;
    }
    if (privyActive && privySignMessage && privyWalletObj) {
      const result = await privySignMessage({ message: msgBytes, wallet: privyWalletObj });
      return result?.signature || result;
    }
    if (publicKey && signMessage) {
      return await signMessage(msgBytes);
    }
    throw new Error('No wallet available to sign');
  }, [publicKey, signMessage, privyActive, privySignMessage, privyWalletObj]);

  const {
    agent: pacAgent,
    bindAgent,
    signWithAgentKey,
    forgetLocally: forgetAgentLocally,
    revokeOnServer: revokeAgentOnServer,
    binding: bindingAgent,
    bindError: bindAgentError,
  } = usePacificaAgent({ walletAddr, masterSign });

  // Reactive player token — kept in a ref so callbacks that are declared with
  // `[walletAddr]` deps (like claimGold) don't need to recreate every time
  // the token updates. The token itself updates via the GodotProvider state
  // message on register/login/account-switch; `window._playerToken` is set
  // there as well but can go briefly null during logout transitions, so this
  // ref + window fallback is the most robust read.
  const player = usePlayer();
  const tokenRef = useRef(null);
  useEffect(() => {
    tokenRef.current = player?.token || null;
  }, [player?.token]);

  // Claim gold from game server (server verifies trades via Pacifica API).
  // Uses the reactive `player.token` — `window._playerToken` can be stale
  // (empty or belonging to a logged-out previous account) right after an
  // account switch or Farcaster auto-login, causing the server to reject
  // with 401 and the user silently seeing zero gold for trades that DO
  // exist on Pacifica's side.
  const claimGold = useCallback(async () => {
    if (!walletAddr) return;
    const token = tokenRef.current || window._playerToken;
    if (!token) {
      console.warn('[usePacifica] claimGold skipped — no token yet (account still loading)');
      return;
    }
    try {
      const res = await fetch(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the server's error reason instead of swallowing. The most
        // common one observed on new-account flows is 401 "Invalid token"
        // (stale token) or 400 "wallet required" (walletAddr not propagated).
        console.warn('[usePacifica] claim-gold failed:', res.status, data?.error || data?.reason || '(no body)');
        return data;
      }
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        // Update React resource bar immediately
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch (e) {
      console.warn('[usePacifica] claim-gold network error:', e?.message || e);
      return null;
    }
  }, [walletAddr]);

  // Fetch wallet USDC balance — try connection first, fallback to direct RPC
  const fetchWalletUsdc = useCallback(async () => {
    if (!walletAddr) return;
    const ownerPk = publicKey || new PublicKey(walletAddr);
    const ata = getATA(ownerPk, USDC_MINT);

    // Try main connection
    try {
      const bal = await connection.getTokenAccountBalance(ata);
      setWalletUsdc(parseFloat(bal.value.uiAmount || 0));
      return;
    } catch {}

    // Fallback RPCs
    const rpcs = [
      'https://solana-rpc.publicnode.com',
      'https://api.mainnet-beta.solana.com',
      'https://rpc.ankr.com/solana',
    ];
    for (const url of rpcs) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'getTokenAccountBalance',
            params: [ata.toBase58()],
          }),
        });
        const data = await res.json();
        if (data.result?.value) {
          setWalletUsdc(parseFloat(data.result.value.uiAmount || 0));
          return;
        }
      } catch {}
    }
    setWalletUsdc(0);
  }, [walletAddr, publicKey, connection]);

  // Sign & send to Pacifica API.
  //
  // Fast path: if the user has bound an agent wallet, sign locally with
  // the agent's private key (no popup). Trade-class endpoints support
  // agent-signed requests by including `agent_wallet: <pubkey>` in the
  // body — Pacifica verifies the signature against that pubkey rather
  // than the master.
  //
  // Bind, revoke, and other master-only operations bypass the agent path
  // by calling `masterSign` directly elsewhere in this file.
  const signedRequest = useCallback(async (method, endpoint, type, payload) => {
    // Try agent-key fast path first — covers the hot endpoints (orders,
    // positions/tpsl, account/leverage, account/margin) without prompting.
    if (signWithAgentKey) {
      const headerBag = signWithAgentKey(type, payload);
      if (headerBag) {
        const body = { ...headerBag, ...payload };
        const res = await fetch(`${API}${endpoint}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(text || `API error ${res.status}`);
        }
      }
    }

    const hasAdapter = !!(publicKey && signMessage);
    const hasPrivy = !!(privyActive && privySignMessage && privyWalletObj);
    if (!hasAdapter && !hasPrivy) throw new Error('Wallet not connected');

    const account = publicKey ? publicKey.toBase58() : privyAddr;
    const message = buildMessage(type, payload);
    const msgBytes = new TextEncoder().encode(message);
    let sigBytes;

    // In Farcaster frame: sign via SDK provider with base64 (bypasses broken UTF-8 path)
    if (isFarcasterFrame()) {
      sigBytes = await fcSignMessage(msgBytes);
    }

    // Privy embedded wallet path (email login, no adapter)
    if (!sigBytes && privyActive && privySignMessage && privyWalletObj) {
      try {
        const result = await privySignMessage({ message: msgBytes, wallet: privyWalletObj });
        // Privy returns { signature: Uint8Array } in recent versions; older SDK returned raw Uint8Array.
        sigBytes = result?.signature || result;
      } catch (e) {
        if (e?.message?.includes('rejected') || e?.message?.includes('cancelled')) {
          throw new Error('Signature rejected');
        }
        throw e;
      }
    }

    // Standard wallet-adapter signMessage (Phantom, etc.)
    if (!sigBytes && hasAdapter) {
      try {
        sigBytes = await signMessage(msgBytes);
      } catch (e) {
        if (e.message?.includes('UserKeyring') || e.message?.includes('rejected')) {
          throw new Error('Please unlock your wallet and try again');
        }
        throw e;
      }
    }

    const signature = bs58.encode(sigBytes);

    const body = {
      account,
      signature,
      timestamp: JSON.parse(message).timestamp,
      expiry_window: 30000,
      ...payload,
    };

    const res = await fetch(`${API}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json;
    } catch {
      // Farcaster wallet signMessage is not compatible with Pacifica verification
      if (text.includes('erification failed')) {
        throw new Error('Signature verification failed. Connect Phantom or another Solana wallet to trade.');
      }
      throw new Error(text || `API error ${res.status}`);
    }
  }, [publicKey, signMessage, privyActive, privySignMessage, privyWalletObj, privyAddr, signWithAgentKey]);

  // Onboarding activation — must be defined before signedRequestWithActivation
  const activate = useCallback(async () => {
    if (!walletAddr) return;
    try {
      await signedRequest('POST', '/referral/user/code/claim', 'claim_referral_code', { code: 'Vip' });
    } catch {}
    try {
      await signedRequest('POST', '/account/builder_codes/approve', 'approve_builder_code', {
        builder_code: BUILDER_CODE, max_fee_rate: '0.001',
      });
    } catch {}
  }, [walletAddr, signedRequest]);

  // Auto-activate: retry on 403 — wraps signedRequest with activation fallback
  const activatedRef = useRef(false);
  const signedRequestWithActivation = useCallback(async (method, endpoint, type, payload) => {
    const res = await signedRequest(method, endpoint, type, payload);
    const needsActivation = res.code === 403 || res.error?.includes('not approved') || res.error?.includes('builder code');
    if (needsActivation && !activatedRef.current) {
      activatedRef.current = true;
      await activate();
      return signedRequest(method, endpoint, type, payload);
    }
    return res;
  }, [signedRequest, activate]);

  // ---------- Market Data (public) ----------
  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/info`).then(r => r.json());
      if (res.data) { setMarkets(res.data); marketsRef.current = res.data; }
    } catch {}
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/info/prices`).then(r => r.json());
      if (res.data) setPrices(res.data);
    } catch {}
  }, []);

  // ---------- Account Data ----------
  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/account?account=${walletAddr}`).then(r => r.json());
      if (res.data) setAccount(res.data);
    } catch {}
  }, [walletAddr]);

  const fetchPositions = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/positions?account=${walletAddr}`).then(r => r.json());
      if (res.data) { setPositions(res.data); setDataReady(true); }
    } catch {}
  }, [walletAddr]);

  const fetchOrders = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/orders?account=${walletAddr}`).then(r => r.json());
      if (res.data) setOrders(res.data);
    } catch {}
  }, [walletAddr]);

  const [marginModes, setMarginModes] = useState({}); // { BTC: false (cross), ETH: true (isolated) }

  const fetchLeverageSettings = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetch(`${API}/account/settings?account=${walletAddr}`).then(r => r.json());
      if (res.data?.margin_settings) {
        const levMap = {};
        const marginMap = {};
        for (const s of res.data.margin_settings) {
          levMap[s.symbol] = s.leverage;
          marginMap[s.symbol] = s.isolated;
        }
        setLeverageSettings(levMap);
        setMarginModes(marginMap);
      }
    } catch {}
  }, [walletAddr]);


  // ---------- Deposit (on-chain) ----------
  const depositToPacifica = useCallback(async (amountUsdc) => {
    const ownerPk = publicKey || (privyAddr ? new PublicKey(privyAddr) : null);
    if (!ownerPk) { setError('Wallet not connected'); return; }
    const canSendAdapter = !!sendTransaction;
    const canSendPrivy = privyActive && !!privySendTx && !!privyWalletObj;
    if (!canSendAdapter && !canSendPrivy) { setError('Wallet cannot send transactions'); return; }

    setLoading(true);
    setError(null);
    try {
      const amountRaw = Math.floor(parseFloat(amountUsdc) * 1e6);
      if (amountRaw < 10e6) throw new Error('Minimum 10 USDC');

      // Check SOL balance for gas fees
      let solBal = 0;
      try { solBal = await connection.getBalance(ownerPk); } catch {}
      if (solBal < 5000000) throw new Error('Not enough SOL for gas fees (need ~0.005 SOL)');

      // Check USDC balance
      const depositorAta = getATA(ownerPk, USDC_MINT);
      let usdcBal = 0;
      try {
        const tokenBal = await connection.getTokenAccountBalance(depositorAta);
        usdcBal = Math.floor(parseFloat(tokenBal.value.uiAmount || 0) * 1e6);
      } catch {}
      if (usdcBal < amountRaw) throw new Error(`Not enough USDC (have ${(usdcBal / 1e6).toFixed(2)}, need ${amountUsdc})`);
      const [eventAuth] = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], PACIFICA_PROGRAM);

      // Discriminator for "deposit"
      const disc = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:deposit'))).slice(0, 8);
      const amtBuf = new ArrayBuffer(8);
      new DataView(amtBuf).setBigUint64(0, BigInt(amountRaw), true);
      const data = new Uint8Array([...disc, ...new Uint8Array(amtBuf)]);

      const ix = new TransactionInstruction({
        programId: PACIFICA_PROGRAM,
        keys: [
          { pubkey: ownerPk, isSigner: true, isWritable: true },
          { pubkey: depositorAta, isSigner: false, isWritable: true },
          { pubkey: CENTRAL_STATE, isSigner: false, isWritable: true },
          { pubkey: VAULT_TOKEN, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: ASSOC_TOKEN_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: USDC_MINT, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: eventAuth, isSigner: false, isWritable: false },
          { pubkey: PACIFICA_PROGRAM, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
      });

      const tx = new Transaction().add(ix);
      // Privy's signAndSendTransaction needs feePayer + blockhash pre-set.
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = ownerPk;

      let sig;
      if (canSendAdapter && publicKey) {
        sig = await sendTransaction(tx, connection);
      } else {
        // Privy's useSignAndSendTransaction expects a serialized Uint8Array, not
        // a Transaction object. Partial-sign=false so Privy signs fully.
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await privySendTx({
          transaction: new Uint8Array(serialized),
          wallet: privyWalletObj,
        });
        const sigBytes = result?.signature || result;
        // Signature is Uint8Array — encode to base58 for confirmTransaction
        sig = typeof sigBytes === 'string' ? sigBytes : bs58.encode(sigBytes);
      }
      await connection.confirmTransaction(sig, 'confirmed');

      // Auto-activate after first deposit
      await activate();
      fetchAccount();
      fetchWalletUsdc();

      // First deposit gold is handled server-side via POST /trading/claim-gold
      claimGold();

      return { success: true, signature: sig };
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [publicKey, sendTransaction, connection, activate, fetchAccount, fetchWalletUsdc, privyActive, privySendTx, privyWalletObj, privyAddr, claimGold]);

  // ---------- Trading ----------
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
      const res = await signedRequestWithActivation('POST', '/orders/create_market', 'create_market_order', {
        symbol, side, amount: roundToLot(amount, lot),
        slippage_percent: String(slippage || '0.5'),
        reduce_only: false,
        builder_code: BUILDER_CODE,
      });
      if (res.error) throw new Error(res.error);
      fetchPositions();
      fetchOrders();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, signedRequestWithActivation, fetchPositions, fetchOrders, fetchAccount]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
      const tick = marketsRef.current.find(m => m.symbol === symbol)?.tick_size;
      const res = await signedRequestWithActivation('POST', '/orders/create', 'create_order', {
        symbol, side, price: tick ? roundToLot(price, tick) : String(price), amount: roundToLot(amount, lot),
        tif: tif || 'GTC', reduce_only: false,
        builder_code: BUILDER_CODE,
      });
      if (res.error) throw new Error(res.error);
      fetchOrders();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, signedRequestWithActivation, fetchOrders, fetchAccount]);

  const closePosition = useCallback(async (symbol, side, amount) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const closeSide = side === 'bid' ? 'ask' : 'bid';
      const lot = marketsRef.current.find(m => m.symbol === symbol)?.lot_size;
      const res = await signedRequestWithActivation('POST', '/orders/create_market', 'create_market_order', {
        symbol, side: closeSide, amount: roundToLot(amount, lot),
        slippage_percent: '1', reduce_only: true,
        builder_code: BUILDER_CODE,
      });
      if (res.error) throw new Error(res.error);
      fetchPositions();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, signedRequestWithActivation, fetchPositions, fetchAccount]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!walletAddr) return;
    try {
      const res = await signedRequestWithActivation('POST', '/orders/cancel', 'cancel_order', { symbol, order_id: orderId });
      if (res.error) throw new Error(res.error);
      fetchOrders();
      return res;
    } catch (e) { setError(e.message); }
  }, [walletAddr, signedRequestWithActivation, fetchOrders]);

  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss) => {
    if (!walletAddr) return;
    try {
      const payload = { symbol, side, builder_code: BUILDER_CODE };
      if (takeProfit) payload.take_profit = { stop_price: takeProfit };
      if (stopLoss) payload.stop_loss = { stop_price: stopLoss };
      const res = await signedRequestWithActivation('POST', '/positions/tpsl', 'set_position_tpsl', payload);
      if (res.error) throw new Error(res.error);
      return res;
    } catch (e) { setError(e.message); }
  }, [walletAddr, signedRequestWithActivation]);

  const setLeverage = useCallback(async (symbol, leverage) => {
    if (!walletAddr) return;
    try {
      // Cap at symbol's actual max (Pacifica rejects otherwise with InvalidLeverage).
      const mkt = marketsRef.current.find(m => m.symbol === symbol);
      const maxLev = mkt?.max_leverage ? Number(mkt.max_leverage) : 50;
      const capped = Math.max(1, Math.min(Number(leverage), maxLev));
      const res = await signedRequestWithActivation('POST', '/account/leverage', 'update_leverage', {
        symbol, leverage: capped,
      });
      if (res.error) {
        if (res.code === 422) throw new Error('Close your ' + symbol + ' position first (can only increase leverage)');
        if (/InvalidLeverage/i.test(res.error)) {
          throw new Error(`Leverage ${capped}x not accepted by Pacifica (max for ${symbol} is ${maxLev}x). Close open position first.`);
        }
        throw new Error(res.error);
      }
      fetchLeverageSettings();
      return res;
    } catch (e) { setError(e.message); }
  }, [walletAddr, signedRequestWithActivation, fetchLeverageSettings]);

  const setMarginMode = useCallback(async (symbol, isIsolated) => {
    if (!walletAddr) return;
    try {
      const res = await signedRequestWithActivation('POST', '/account/margin', 'update_margin_mode', {
        symbol, is_isolated: isIsolated,
      });
      if (res.error) {
        if (res.code === 422) throw new Error('Close your ' + symbol + ' position first to change margin mode');
        throw new Error(res.error);
      }
      fetchLeverageSettings();
      return res;
    } catch (e) { setError(e.message); }
  }, [walletAddr, signedRequestWithActivation, fetchLeverageSettings]);

  const withdraw = useCallback(async (amount) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await signedRequestWithActivation('POST', '/account/withdraw', 'withdraw', { amount: String(amount) });
      if (res.error) throw new Error(res.error);
      fetchAccount();
      clearTimeout(withdrawTimerRef.current);
      withdrawTimerRef.current = setTimeout(fetchWalletUsdc, 5000); // refresh after settlement
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, signedRequestWithActivation, fetchAccount]);

  // ---------- WebSocket ----------
  useEffect(() => {
    if (!walletAddr || !isActiveDex) return;

    let ws, reconnectTimer, pingTimer, pongTimer;
    let latestPrices = null;
    let priceThrottleTimer = null;
    let claimGoldTimer = null;
    let retryCount = 0;
    const PING_INTERVAL = 15000;
    const PONG_TIMEOUT = 5000;
    const MAX_BACKOFF = 30000;

    function refetchAll() {
      fetchPrices();
      if (walletAddr) {
        fetchAccount();
        fetchPositions();
        fetchOrders();
        fetchLeverageSettings();
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF);
      retryCount++;
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount = 0;
        ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'prices' } }));
        if (walletAddr) {
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_positions', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_order_updates', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_info', account: walletAddr } }));
          ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'account_trades', account: walletAddr } }));
        }
        // Refetch via REST to close any gap from disconnect period
        refetchAll();

        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
            // Start pong timeout — if no pong received, force reconnect
            clearTimeout(pongTimer);
            pongTimer = setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) ws.close();
            }, PONG_TIMEOUT);
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // Pong received — clear timeout
          if (msg.channel === 'pong' || msg.method === 'pong' || msg.pong) {
            clearTimeout(pongTimer);
            return;
          }

          if (msg.channel === 'prices') {
            latestPrices = msg.data;
            if (!priceThrottleTimer) {
              priceThrottleTimer = setTimeout(() => {
                setPrices(latestPrices);
                priceThrottleTimer = null;
              }, 1000);
            }
          }
          if (msg.channel === 'account_positions') {
            // WS positions use short keys: s=symbol, d=side, a=amount, p=entry_price, m=margin, f=funding, i=isolated
            const raw = Array.isArray(msg.data) ? msg.data : [];
            const incoming = raw.map(p => ({
              symbol: p.symbol || p.s,
              side: p.side || p.d,
              amount: p.amount || p.a,
              entry_price: p.entry_price || p.p,
              margin: p.margin || p.m || '0',
              funding: p.funding || p.f || '0',
              isolated: p.isolated ?? p.i ?? false,
              liquidation_price: p.liquidation_price || p.l,
            }));
            setPositions(prev => {
              // Empty array = all positions closed
              if (incoming.length === 0) return [];
              // Merge incoming with existing positions by symbol:side key
              const key = (p) => `${p.symbol}:${p.side}`;
              const map = new Map(prev.map(p => [key(p), p]));
              for (const p of incoming) {
                if (parseFloat(p.amount) === 0) map.delete(key(p));
                else map.set(key(p), p);
              }
              return [...map.values()];
            });
          }
          if (msg.channel === 'account_info') {
            // WS uses short keys — normalize to match REST format
            const d = msg.data;
            setAccount(prev => ({
              ...prev,
              balance: d.balance || d.b || prev?.balance || '0',
              account_equity: d.account_equity || d.ae || prev?.account_equity || '0',
              available_to_spend: d.available_to_spend || d.as || prev?.available_to_spend || '0',
              available_to_withdraw: d.available_to_withdraw || d.aw || prev?.available_to_withdraw || '0',
              total_margin_used: d.total_margin_used || d.mu || prev?.total_margin_used || '0',
              positions_count: d.positions_count ?? d.pc ?? prev?.positions_count ?? 0,
              orders_count: d.orders_count ?? d.oc ?? prev?.orders_count ?? 0,
              fee_level: d.fee_level ?? d.f ?? prev?.fee_level,
              maker_fee: prev?.maker_fee,
              taker_fee: prev?.taker_fee,
            }));
          }
          if (msg.channel === 'account_order_updates' && msg.data) {
            setOrders(prev => {
              const map = new Map(prev.map(o => [o.i || o.order_id, o]));
              const items = Array.isArray(msg.data) ? msg.data : [msg.data];
              for (const o of items) {
                const id = o.i || o.order_id;
                if (o.os === 'filled' || o.os === 'cancelled') map.delete(id);
                else map.set(id, o);
              }
              return [...map.values()];
            });
          }
          // Real-time: when trade happens, claim gold from server
          if (msg.channel === 'account_trades' && msg.data) {
            // Small delay to let Pacifica finalize the trade
            clearTimeout(claimGoldTimer);
            claimGoldTimer = setTimeout(claimGold, 1000);
          }
        } catch {}
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        clearTimeout(pongTimer);
        scheduleReconnect();
      };
      ws.onerror = () => {
        if (!cancelled) ws.close();
      };
    }

    let cancelled = false;

    // Online/offline listeners — pause reconnect when offline, resume when back
    function handleOnline() {
      if (cancelled) return;
      clearTimeout(reconnectTimer);
      retryCount = 0;
      if (!ws || ws.readyState !== WebSocket.OPEN) connect();
    }
    function handleOffline() {
      clearTimeout(reconnectTimer);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    connect();
    fetchPrices();
    if (walletAddr) { fetchAccount(); fetchPositions(); fetchOrders(); fetchWalletUsdc(); fetchLeverageSettings(); }

    return () => {
      cancelled = true;
      clearInterval(pingTimer);
      clearTimeout(pongTimer);
      clearTimeout(reconnectTimer);
      clearTimeout(priceThrottleTimer);
      clearTimeout(claimGoldTimer);
      clearTimeout(withdrawTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); }
    };
  }, [walletAddr, isActiveDex]);

  // Fetch markets once
  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

  return {
    connected: !!walletAddr, walletAddr, account, positions, orders, prices, markets, walletUsdc, leverageSettings, marginModes, dataReady,
    loading, error, clearError, goldEarned, clearGoldEarned,
    depositToPacifica, withdraw, activate, claimGold,
    placeMarketOrder, placeLimitOrder, closePosition, cancelOrder,
    setTpsl, setLeverage, setMarginMode,
    fetchAccount, fetchPositions, fetchOrders,
    // Agent wallet — opt-in 1-tap trading. `pacAgent` is null until the
    // user calls `bindAgent` (one master-wallet popup) — afterwards every
    // signed request goes through the agent key silently.
    pacAgent, bindAgent, bindingAgent, bindAgentError,
    forgetAgentLocally, revokeAgentOnServer,
  };
}
