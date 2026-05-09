// Resolve a Solana wallet's `.skr` AllDomains handle.
//
// Background:
//   Every Seeker device owner gets a free `.skr` domain (built on AllDomains)
//   that maps a human-readable name to their Seed Vault Solana address. Source:
//   https://docs.solanamobile.com/solana-mobile-stack/skr-domain.md.
//
// We use the `@onsol/tldparser` SDK rather than going through Bonfida (Bonfida
// only handles `.sol`; AllDomains owns every other TLD including `.skr`,
// `.bonk`, `.poor`, …). For the Seeker nickname-suggest flow we only need
// the *primary* domain set on the wallet — `getMainDomain(addr)` returns
// `{ tld, domain, nameAccount }`. If the user's primary is a `.skr` we
// surface it; if their primary is a non-`.skr` domain (e.g. `.poor`) we
// fall through to the existing `player_<hex>` placeholder rather than
// confusing them with a suggestion that doesn't reflect their Seeker.
//
// Hardening:
//   - Lazy import: SDK + Anchor are heavy. We dynamic-import on first call
//     so non-Seeker bundles never pay for the kB.
//   - LocalStorage cache keyed by wallet base58: 24h TTL. The user's primary
//     domain rarely changes; re-resolving on every render burns RPC quota.
//   - Per-call timeout (6s): RPC stalls must not block the register form.
//   - Catch-all: any failure (RPC down, SDK throws, invalid pubkey) resolves
//     to `null`. The register flow already has a `player_<hex>` fallback;
//     we never want a domain lookup error to break login.

import { Connection, PublicKey } from '@solana/web3.js';

const CACHE_KEY = 'clash_skr_name_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RPC_TIMEOUT_MS = 6000;

// Reuse the same RPC list as WalletProvider — the lookup is independent of
// the user's wallet adapter connection (it only needs read-only access),
// so we hit a public RPC directly rather than threading the adapter's
// `useConnection()` hook through useAuthFlow.
const RPC_FALLBACKS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
  'https://solana.drpc.org',
];

let parserPromise = null;
async function getParser(rpcUrl) {
  if (parserPromise) return parserPromise;
  parserPromise = (async () => {
    const { TldParser } = await import('@onsol/tldparser');
    const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
    return new TldParser(connection);
  })();
  return parserPromise;
}

function readCache(wallet) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const all = JSON.parse(raw);
    const entry = all?.[wallet];
    if (!entry || typeof entry.ts !== 'number') return undefined;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      delete all[wallet];
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
      return undefined;
    }
    return entry.handle ?? null;
  } catch {
    return undefined;
  }
}

function writeCache(wallet, handle) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[wallet] = { handle: handle || null, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* storage disabled */ }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('skrName: RPC timeout')), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Resolve the primary `.skr` handle for a Solana base58 wallet address.
 *
 * @param {string} wallet — base58 Solana address (44 chars-ish).
 * @returns {Promise<{ name: string, full: string } | null>}
 *   `{ name: 'alice', full: 'alice.skr' }` when the user's MAIN domain is
 *   on the `.skr` TLD, otherwise `null`.
 */
export async function resolveSkrName(wallet) {
  if (!wallet || typeof wallet !== 'string') return null;

  const cached = readCache(wallet);
  if (cached !== undefined) {
    if (!cached) return null;
    return { name: cached, full: `${cached}.skr` };
  }

  let pubkey;
  try { pubkey = new PublicKey(wallet); }
  catch { return null; }

  for (const rpcUrl of RPC_FALLBACKS) {
    try {
      const parser = await getParser(rpcUrl);
      const main = await withTimeout(parser.getMainDomain(pubkey), RPC_TIMEOUT_MS);
      if (!main || !main.domain) {
        writeCache(wallet, null);
        return null;
      }
      // On-chain shape (verified against tldparser@1.2.1
      // dist/cjs/svm/utils.js:396 — `mainDomain: data.domain + data.tld`):
      //   `tld`    is stored WITH the leading dot, e.g. `".skr"`
      //   `domain` is the bare name, e.g. `"alice"`
      const tld = String(main.tld || '').toLowerCase().replace(/^\./, '');
      const name = String(main.domain || '').toLowerCase();
      if (tld === 'skr' && name) {
        writeCache(wallet, name);
        return { name, full: `${name}.skr` };
      }
      // Primary domain is on a different TLD (.poor, .bonk, .glow, …).
      // We don't suggest non-`.skr` domains — see file header.
      writeCache(wallet, null);
      return null;
    } catch (err) {
      // `getMainDomain` THROWS "Unable to find MainDomain account at <addr>"
      // when the wallet has no primary domain set — the common case for
      // most wallets. Treat that as a definitive negative (cache it for
      // 24h so we don't re-probe across all three RPCs every render) and
      // bail without trying the next endpoint. ANY other error (timeout,
      // 429, parse fail) is a transport problem — we DO try the next RPC
      // and DO NOT cache a negative.
      const msg = String(err?.message || err || '');
      if (/Unable to find MainDomain account/i.test(msg)) {
        writeCache(wallet, null);
        return null;
      }
      if (rpcUrl === RPC_FALLBACKS[RPC_FALLBACKS.length - 1]) {
        console.warn('[skrName] all RPCs failed:', msg);
      }
      // Reset parserPromise so the next attempt re-binds to a healthy RPC.
      parserPromise = null;
    }
  }
  return null;
}
