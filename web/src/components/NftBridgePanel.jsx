// Bridge panel — rendered inside NftMintPanel when view === 'bridge'.
//
// Lets the player move a Demon King NFT between any of the five supported
// chains (Base / Arbitrum / Monad / Aptos / Solana). The flow:
//
//   1. Pick source chain + dest chain.
//   2. Connect the right source wallet (or stay on the already-connected
//      one if it matches the source chain). The dest can be either
//      auto-filled from a connected wallet or pasted as an address.
//   3. Enter the source-chain NFT identifier — EVM tokenId, Aptos token
//      address, or Solana asset pubkey.
//   4. POST /bridge/init → user signs burn tx on source.
//   5. POST /bridge/confirm with the burn tx hash → server returns either:
//        - signed receipt → user submits mint on dest, OR
//        - server-mediated Solana mint already done.
//
// We deliberately use plain text inputs for the source NFT identifier
// rather than auto-fetching the player's tokens. Wiring an "owned NFTs"
// indexer per chain is significant work; once the bridge is proven, that
// upgrade is purely additive (see [[shop-auto-chain]]).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { createPublicClient, createWalletClient, custom, fallback, http, encodeFunctionData, getAddress } from 'viem';
import { base, arbitrum } from 'viem/chains';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { bridgeInit, bridgeRelay, fetchOwnedNfts, nftLevelImageUrl } from '../lib/nftV3Client';
import { addClientBreadcrumb } from '../lib/clientLogger';
import { DEFAULT_SOLANA_RPC_URL, createSolanaConnection, selectFreshSolanaRpcUrl, solanaBatchSafeRpcUrl } from '../lib/solanaRpc';
import { sendSolanaTransactionWithRetry } from '../lib/solanaTx';
import { buildSolanaWalletTxOptions } from '../lib/solanaSeekerTx';
import { INK_CHAIN_ID, inkChain } from '../lib/nadoConfig';

// Chain logos live in web/public/tokens — same dir we already use for
// trading-pair token icons. Using real brand marks instead of emoji
// squares so the picker reads as a network selector, not a color test.
const CHAINS = [
  { id: 'base',     label: 'Base',     kind: 'evm',    logo: '/tokens/BASE.svg' },
  { id: 'arbitrum', label: 'Arbitrum', kind: 'evm',    logo: '/tokens/ARB.svg' },
  { id: 'monad',    label: 'Monad',    kind: 'evm',    logo: '/tokens/MON.svg' },
  { id: 'ink',      label: 'Ink',      kind: 'evm',    logo: '/tokens/INK.png' },
  { id: 'aptos',    label: 'Aptos',    kind: 'aptos',  logo: '/tokens/APT.png' },
  { id: 'solana',   label: 'Solana',   kind: 'solana', logo: '/tokens/SOL.svg' },
];
const BRIDGE_COLLECTIONS = [
  { id: 'demonking', label: 'Demon King', chains: ['base', 'arbitrum', 'monad', 'ink', 'aptos', 'solana'] },
  { id: 'dragon', label: 'Dragon', chains: ['base', 'arbitrum', 'monad', 'ink', 'aptos', 'solana'] },
];
const BRIDGE_COLLECTION_BY_ID = Object.fromEntries(BRIDGE_COLLECTIONS.map((c) => [c.id, c]));
const MAX_BATCH_BRIDGE_NFTS = 10;

function ChainLogo({ chain, size = 18 }) {
  const c = CHAIN_BY_ID[chain] || (typeof chain === 'object' ? chain : null);
  if (!c?.logo) return null;
  return (
    <img
      src={c.logo}
      alt={c.label}
      width={size}
      height={size}
      style={{ verticalAlign: 'middle', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

const CHAIN_BY_ID = Object.fromEntries(CHAINS.map((c) => [c.id, c]));

const EVM_CHAIN_IDS = { base: 8453, arbitrum: 42161, monad: 143, ink: INK_CHAIN_ID };
const EVM_VIEM_CHAINS = { base, arbitrum, ink: inkChain };
// Monad is not in viem/chains; describe inline.
const MONAD_VIEM_CHAIN = {
  id: 143, name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
};
function viemChain(chainKey) {
  if (chainKey === 'monad') return MONAD_VIEM_CHAIN;
  return EVM_VIEM_CHAINS[chainKey];
}

function siteOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://clashofperps.fun';
}

function bridgeReadTransport(chainKey) {
  if (chainKey === 'base') {
    return fallback([
      http(`${siteOrigin()}/rpc/base-alchemy`),
      http(`${siteOrigin()}/rpc/base`),
    ]);
  }
  if (chainKey === 'ink') {
    return fallback([
      http(`${siteOrigin()}/rpc/ink`),
      http('https://rpc-gel.inkonchain.com'),
    ]);
  }
  return http();
}

function publicKeyString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toBase58 === 'function') return value.toBase58();
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) return value.toString();
  return '';
}

function solanaCoreAssetCollection(asset) {
  const grouping = Array.isArray(asset?.grouping) ? asset.grouping : [];
  const group = grouping.find((row) => String(row?.group_key || row?.key || '').toLowerCase() === 'collection');
  const groupValue = publicKeyString(group?.group_value || group?.value);
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(groupValue)) return groupValue;
  const updateAuthority = asset?.updateAuthority;
  if (updateAuthority?.type === 'Collection') return publicKeyString(updateAuthority.address);
  if (updateAuthority?.__kind === 'Collection') {
    const fromFields = Array.isArray(updateAuthority.fields)
      ? updateAuthority.fields[0]
      : updateAuthority.fields;
    return publicKeyString(fromFields?.address || fromFields?.publicKey || fromFields);
  }
  const candidates = [
    asset?.collection?.publicKey,
    asset?.collection?.address,
    asset?.collection,
    asset?.collectionAddress,
  ];
  for (const candidate of candidates) {
    const value = publicKeyString(candidate);
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return value;
  }
  return '';
}

// Minimum ABI for the V3 contract's bridgeBurn call. The full ABI lives
// on the server; the client only needs this one function.
const V3_BURN_ABI = [{
  type: 'function', name: 'bridgeBurn', stateMutability: 'payable',
  inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'destinationChainId', type: 'uint256' }],
  outputs: [],
}];

// Identifier label per source chain — the user types this into the source
// NFT field. Reuses the same names as the orchestrator /bridge/init.
function sourceIdLabel(chainKey) {
  if (CHAIN_BY_ID[chainKey]?.kind === 'evm') return 'Token ID (e.g. 42)';
  if (chainKey === 'aptos')                  return 'Aptos token address (0x...)';
  if (chainKey === 'solana')                 return 'Solana mint / asset pubkey (base58)';
  return 'NFT identifier';
}

function destAddressLabel(chainKey) {
  if (CHAIN_BY_ID[chainKey]?.kind === 'evm') return 'Destination EVM address (0x...)';
  if (chainKey === 'aptos')                  return 'Destination Aptos address (0x...)';
  if (chainKey === 'solana')                 return 'Destination Solana pubkey (base58)';
  return 'Destination address';
}

function shortAddr(s, head = 6, tail = 4) {
  if (!s) return '';
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function shortNftRef(value, head = 6, tail = 5) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= head + tail + 3) return raw;
  return `${raw.slice(0, head)}...${raw.slice(-tail)}`;
}

function extractNftSerialFromText(text) {
  const raw = String(text || '');
  return raw.match(/(?:demon\s*king\s*)?#\s*(\d{1,8})/i)?.[1]
    || raw.match(/(?:^|[/?&=_-])(?:token|id|nft|king)?[_-]?(\d{1,8})(?:\D|$)/i)?.[1]
    || '';
}

function nftIdentifier(nft) {
  return String(nft?.tokenAddress || nft?.asset || nft?.mint || nft?.tokenId || nft?.id || '').trim();
}

function parseSourceIdList(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  ));
}

function bridgeBatchId() {
  return globalThis.crypto?.randomUUID?.()
    || `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nftDisplaySerial(nft) {
  const candidates = [
    nft?.displayId,
    nft?.tokenIndex,
    nft?.token_index,
    nft?.serial,
    nft?.number,
    nft?.edition,
    nft?.nftId,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').replace(/^#/, '').trim();
    if (/^\d+$/.test(value)) return value;
  }
  return extractNftSerialFromText(nft?.name)
    || extractNftSerialFromText(nft?.uri)
    || extractNftSerialFromText(nft?.imageUrl);
}

function nftPickerLabel(nft, chainKey, fallbackInput = '') {
  const chainKind = CHAIN_BY_ID[chainKey]?.kind;
  const raw = nftIdentifier(nft) || String(fallbackInput || '').trim();
  const serial = nftDisplaySerial(nft);
  if (serial && raw && raw !== serial) return `#${serial} - ${shortNftRef(raw)}`;
  if (serial) return `#${serial}`;
  if (!raw) return '---';
  if (chainKind === 'evm' && /^\d+$/.test(raw)) return `#${raw}`;
  if (raw.startsWith('0x') || raw.length > 18) return shortNftRef(raw);
  return `#${raw}`;
}

function isToken2022SolanaBurn(burn) {
  const program = String(burn?.program || burn?.standard || '').toLowerCase();
  return program.includes('token-2022')
    || program.includes('token2022')
    || !!burn?.tokenAccount
    || (burn?.mint && burn?.mint === burn?.asset);
}

export default function NftBridgePanel({
  styles,
  onBack,
  onClose,
  evmWallet: evmWalletOverride = null,
  evmAddress: evmAddressOverride = null,
  onOpenEvmModal = null,
}) {
  const contextEvmWallet = useEvmWallet();
  const tradingEvmWallet = evmWalletOverride || contextEvmWallet;
  const solWallet = useSolWallet();
  const aptosWallet = useAptosWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();

  const [collection, setCollection] = useState('demonking');
  const [sourceChain, setSourceChain] = useState('base');
  const [destChain,   setDestChain]   = useState('solana');
  const [sourceIdInput, setSourceIdInput] = useState('');
  const [destAddrInput, setDestAddrInput] = useState('');
  const [useConnectedDest, setUseConnectedDest] = useState(true);
  const [status, setStatus] = useState('idle');   // idle | burning | confirming | dest-tx | success | error
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState(null);
  const [pendingRelay, setPendingRelay] = useState(null);
  const [busy, setBusy] = useState(false);
  // Wizard step: 1 = pick source NFT, 2 = pick destination chain + address,
  // 3 = confirm + bridge. Each step gets a dedicated screen; only the final
  // step fires the bridge orchestration. Status overlays the confirm step
  // once the user clicks Bridge.
  const [wizardStep, setWizardStep] = useState(1);
  // NFT picker state — auto-fetched browser-first when the source wallet is
  // connected. `ownedLoading` blocks the bridge button while we resolve the
  // user's tokens so they don't accidentally submit an empty id.
  const [ownedNfts, setOwnedNfts] = useState(null);     // array | null = not loaded yet | [] = none
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [ownedError, setOwnedError] = useState(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [batchItems, setBatchItems] = useState([]);
  // Horizontal-scroll ref for the NFT picker — arrows appear when the
  // collection is wider than the viewport (>4 cards visually). scrollBy
  // jumps roughly one card-width per click.
  const nftScrollRef = useRef(null);
  function scrollNfts(dir) {
    const el = nftScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  // ── Wallet addresses on each chain (read-only refs) ─────────────────
  const evmAddress  = evmAddressOverride || tradingEvmWallet?.address || null;
  const solAddress  = solWallet?.publicKey?.toBase58?.() || null;
  const aptAddress  = aptosWallet?.address || null;
  const activeCollection = BRIDGE_COLLECTION_BY_ID[collection] || BRIDGE_COLLECTIONS[0];
  const bridgeCollectionHidden = false;
  const availableChains = useMemo(
    () => CHAINS.filter((chain) => activeCollection.chains.includes(chain.id)),
    [activeCollection],
  );

  // The "auto-fill destination address" toggle picks up the connected
  // wallet for the chosen dest chain. Updates whenever destChain changes.
  const autoDestAddr = useMemo(() => {
    const kind = CHAIN_BY_ID[destChain]?.kind;
    if (kind === 'evm')    return evmAddress || '';
    if (kind === 'solana') return solAddress || '';
    if (kind === 'aptos')  return aptAddress || '';
    return '';
  }, [destChain, evmAddress, solAddress, aptAddress]);

  useEffect(() => {
    if (useConnectedDest) setDestAddrInput(autoDestAddr);
  }, [useConnectedDest, autoDestAddr]);

  useEffect(() => {
    const ids = availableChains.map((chain) => chain.id);
    setSourceChain((current) => (ids.includes(current) ? current : ids[0] || 'base'));
    setDestChain((current) => {
      const nextSource = ids.includes(sourceChain) ? sourceChain : ids[0];
      if (ids.includes(current) && current !== nextSource) return current;
      return ids.find((id) => id !== nextSource) || ids[0] || 'solana';
    });
    setOwnedNfts(null);
    setOwnedError(null);
    setSourceIdInput('');
    setSelectedSourceIds([]);
    setBatchItems([]);
    setNotice(null);
  }, [collection, availableChains, sourceChain]);

  // Source wallet address for the *current* source chain. Used both as the
  // owner argument for /nft/owned and as a UX label.
  const sourceWalletAddr = useMemo(() => {
    const kind = CHAIN_BY_ID[sourceChain]?.kind;
    if (kind === 'evm')    return evmAddress;
    if (kind === 'solana') return solAddress;
    if (kind === 'aptos')  return aptAddress;
    return null;
  }, [sourceChain, evmAddress, solAddress, aptAddress]);

  // Fetch the player's NFTs on the source chain whenever the chain or
  // connected wallet changes. Solana tries browser RPC first, then falls
  // back to the server because mobile browsers can block public indexers/RPCs.
  useEffect(() => {
    setOwnedNfts(null);
    setOwnedError(null);
    setSourceIdInput('');
    setSelectedSourceIds([]);
    setBatchItems([]);
    if (!sourceWalletAddr) return;
    let cancelled = false;
    const ctl = new AbortController();
    setOwnedLoading(true);
    const loadTimer = setTimeout(() => {
      fetchOwnedNfts({ collection, chain: sourceChain, address: sourceWalletAddr, signal: ctl.signal })
        .then((res) => {
          if (cancelled) return;
          setOwnedNfts(res.tokens || []);
          // Auto-select if exactly one.
          if (res.tokens?.length === 1) {
            const t = res.tokens[0];
            const id = nftIdentifier(t);
            setSourceIdInput(id);
            setSelectedSourceIds(id ? [id] : []);
          }
        })
        .catch((err) => {
          if (cancelled || err?.name === 'AbortError') return;
          setOwnedError(err?.message || 'Failed to load NFTs');
        })
        .finally(() => { if (!cancelled) setOwnedLoading(false); });
    }, 150);
    return () => { cancelled = true; clearTimeout(loadTimer); ctl.abort(); };
  }, [collection, sourceChain, sourceWalletAddr]);

  function selectNft(t) {
    const id = nftIdentifier(t);
    if (!id) return;
    setNotice(null);
    setSelectedSourceIds((prev) => {
      const exists = prev.includes(id);
      const next = exists
        ? prev.filter((item) => item !== id)
        : [...prev, id].slice(0, MAX_BATCH_BRIDGE_NFTS);
      setSourceIdInput(next.join(', '));
      if (!exists && prev.length >= MAX_BATCH_BRIDGE_NFTS) {
        setNotice(`Batch bridge supports up to ${MAX_BATCH_BRIDGE_NFTS} NFTs at once.`);
      }
      return next;
    });
  }

  function selectAllVisibleNfts() {
    const ids = (ownedNfts || []).map(nftIdentifier).filter(Boolean).slice(0, MAX_BATCH_BRIDGE_NFTS);
    setSelectedSourceIds(ids);
    setSourceIdInput(ids.join(', '));
    setNotice((ownedNfts || []).length > MAX_BATCH_BRIDGE_NFTS
      ? `Selected first ${MAX_BATCH_BRIDGE_NFTS} NFTs. Run another batch for the rest.`
      : null);
  }

  function clearSelectedNfts() {
    setSelectedSourceIds([]);
    setSourceIdInput('');
    setNotice(null);
  }

  // Default the source chain to wherever the player already has a wallet
  // connected, and pick a different default dest. Best-effort heuristic;
  // user can override via the pickers.
  useEffect(() => {
    let defaultSrc = 'base';
    if (evmAddress) defaultSrc = 'base';
    else if (solAddress) defaultSrc = 'solana';
    else if (aptAddress) defaultSrc = 'aptos';
    setSourceChain((cur) => cur || defaultSrc);
    setDestChain((cur) => (cur === defaultSrc ? (defaultSrc === 'base' ? 'aptos' : 'base') : cur || (defaultSrc === 'base' ? 'aptos' : 'base')));
    // Only on first mount; subsequent changes are user-driven.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Source-wallet readiness for the chosen sourceChain ──────────────
  // The bridge needs the user to actually own the NFT on source, which
  // means a connected wallet whose address matches what they typed.
  const sourceWalletReady = useMemo(() => {
    const kind = CHAIN_BY_ID[sourceChain]?.kind;
    if (kind === 'evm')    return !!evmAddress;
    if (kind === 'solana') return !!solAddress;
    if (kind === 'aptos')  return !!aptAddress;
    return false;
  }, [sourceChain, evmAddress, solAddress, aptAddress]);

  // ── Connect-wallet handlers per chain kind ─────────────────────────
  const connectSourceWallet = useCallback(async () => {
    const kind = CHAIN_BY_ID[sourceChain]?.kind;
    try {
      if (kind === 'evm') {
        if (!evmAddress) {
          if (typeof onOpenEvmModal === 'function') {
            onOpenEvmModal(sourceChain);
            setNotice(`Choose a ${CHAIN_BY_ID[sourceChain]?.label || 'Base'} wallet to load your NFTs.`);
          } else {
            setNotice('Connect an EVM wallet first.');
          }
          return;
        }
        await tradingEvmWallet.ensureChain(EVM_CHAIN_IDS[sourceChain]);
      } else if (kind === 'solana') {
        if (!solAddress) setSolanaModalVisible(true);
      } else if (kind === 'aptos') {
        if (!aptAddress) await aptosWallet.connect();
      }
    } catch (err) {
      setNotice(err?.message?.slice?.(0, 160) || 'Wallet connect failed');
    }
  }, [sourceChain, evmAddress, solAddress, aptAddress, tradingEvmWallet, aptosWallet, setSolanaModalVisible, onOpenEvmModal]);

  // ── Send the source burn tx via the appropriate wallet ─────────────
  // Returns the burn tx hash that the server's /bridge/confirm can verify.
  const submitSourceBurn = useCallback(async (initRes) => {
    const kind = CHAIN_BY_ID[sourceChain]?.kind;
    if (kind === 'evm') {
      // initRes.burn.args = [tokenId, destChainId]
      const [tokenIdStr, destChainIdStr] = initRes.burn.args;
      const tokenId = BigInt(tokenIdStr);
      const destChainId = BigInt(destChainIdStr);
      const bridgeFeeValue = BigInt(initRes.burn.value || initRes.bridgeFee?.amount || '0');
      await tradingEvmWallet.ensureChain(EVM_CHAIN_IDS[sourceChain]);
      const walletClient = createWalletClient({
        account: evmAddress, chain: viemChain(sourceChain), transport: custom(tradingEvmWallet.provider),
      });
      const hash = await walletClient.writeContract({
        address: getAddress(initRes.sourceContract),
        abi: V3_BURN_ABI, functionName: 'bridgeBurn',
        args: [tokenId, destChainId],
        value: bridgeFeeValue,
      });
      const publicClient = tradingEvmWallet.getPublicClient?.(EVM_CHAIN_IDS[sourceChain])
        || createPublicClient({ chain: viemChain(sourceChain), transport: bridgeReadTransport(sourceChain) });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
      return hash;
    }
    if (kind === 'aptos') {
      // Aptos burn — go through AptosWalletContext's `loginSignAndSubmit`,
      // which wraps the official wallet-adapter and expects the modern
      // InputTransactionData shape `{ data: { function, typeArguments,
      // functionArguments } }`. The legacy entry_function_payload shape
      // isn't accepted by the latest @aptos-labs/wallet-adapter-react.
      const fn = `${initRes.sourceModule.replace(/::.*$/, '')}::demon_king::${initRes.burn.functionName}`;
      const submitted = await aptosWallet.loginSignAndSubmit({
        data: { function: fn, typeArguments: [], functionArguments: initRes.burn.args },
      });
      // Different wallets return { hash } / { txnHash } / a raw string.
      const txHash = submitted?.hash || submitted?.txnHash || submitted;
      return txHash;
    }
    if (kind === 'solana') {
      // Solana burn flow is custom — we need to compose a tx with the
      // mpl-core burn ix + memo ix. Adapter only signs; tx construction
      // happens here. Lazy-load deps to keep the bundle small for the
      // EVM-only majority of users.
      if (isToken2022SolanaBurn(initRes.burn)) {
        const [
          { Connection, PublicKey, SystemProgram, TransactionInstruction },
          {
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_2022_PROGRAM_ID,
            createBurnCheckedInstruction,
            createCloseAccountInstruction,
            getAssociatedTokenAddressSync,
          },
        ] = await Promise.all([
          import('@solana/web3.js'),
          import('@solana/spl-token'),
        ]);
        if (!solWallet?.publicKey) throw new Error('Solana wallet is not connected');
        const ownerPk = solWallet.publicKey;
        const mintPk = new PublicKey(initRes.burn.mint || initRes.burn.asset);
        const tokenAccountPk = initRes.burn.tokenAccount
          ? new PublicKey(initRes.burn.tokenAccount)
          : getAssociatedTokenAddressSync(
            mintPk,
            ownerPk,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          );
        const instructions = [
          createBurnCheckedInstruction(
            tokenAccountPk,
            mintPk,
            ownerPk,
            1,
            0,
            [],
            TOKEN_2022_PROGRAM_ID,
          ),
        ];
        instructions.push(
          createCloseAccountInstruction(
            tokenAccountPk,
            ownerPk,
            ownerPk,
            [],
            TOKEN_2022_PROGRAM_ID,
          ),
        );
        const feeLamports = BigInt(initRes.bridgeFee?.amount || '0');
        if (feeLamports > 0n) {
          if (!initRes.feeTreasury) throw new Error('Solana bridge fee treasury is not configured');
          instructions.push(SystemProgram.transfer({
            fromPubkey: ownerPk,
            toPubkey: new PublicKey(initRes.feeTreasury),
            lamports: Number(feeLamports),
          }));
        }
        instructions.push(new TransactionInstruction({
          programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
          keys: [],
          data: Buffer.from(initRes.burn.requiredMemo, 'utf8'),
        }));

        const rpcProbe = await selectFreshSolanaRpcUrl().catch(() => ({ selected: null }));
        const conn = createSolanaConnection(Connection, rpcProbe.selected?.url || DEFAULT_SOLANA_RPC_URL, 'confirmed');
        return sendSolanaTransactionWithRetry({
          instructions,
          ownerPk,
          connection: conn,
          ...buildSolanaWalletTxOptions({
            solWallet,
            owner: ownerPk.toBase58(),
            label: 'bridge.burn_solana_token2022',
            venueLabel: 'Bridge',
          }),
          maxAttempts: 4,
          priorityFeeMicroLamports: 250_000,
          skipPreflight: false,
        });
      }

      const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
      const { publicKey, createNoopSigner, signerIdentity } = await import('@metaplex-foundation/umi');
      const { mplCore, burn, fetchAsset, fetchCollection } = await import('@metaplex-foundation/mpl-core');
      const { toWeb3JsInstruction } = await import('@metaplex-foundation/umi-web3js-adapters');
      const { Connection, PublicKey, SystemProgram, TransactionInstruction } = await import('@solana/web3.js');

      const coreRpcProbe = await selectFreshSolanaRpcUrl().catch(() => ({ selected: null }));
      const coreRpcUrl = solanaBatchSafeRpcUrl(coreRpcProbe.selected?.url || DEFAULT_SOLANA_RPC_URL);
      const umi = createUmi(coreRpcUrl).use(mplCore());
      const ownerAddress = solWallet?.publicKey?.toBase58?.() || solAddress;
      if (!ownerAddress) throw new Error('Solana wallet is not connected');
      const ownerPk = new PublicKey(ownerAddress);
      const ownerSigner = createNoopSigner(publicKey(ownerAddress));
      umi.use(signerIdentity(ownerSigner, true));

      const memoText = initRes.burn.requiredMemo;
      const asset = await fetchAsset(umi, publicKey(initRes.burn.asset));
      const onChainOwner = publicKeyString(asset?.owner);
      if (onChainOwner && onChainOwner !== ownerAddress) {
        throw new Error(`Solana source wallet is not the asset owner (expected ${ownerAddress}, on-chain owner ${onChainOwner})`);
      }
      const assetCollection = solanaCoreAssetCollection(asset);
      const signedCollection = String(initRes.burn.collection || '').trim();
      const collectionAddress = signedCollection || assetCollection;
      let collection = null;
      if (signedCollection && assetCollection && signedCollection !== assetCollection) {
        addClientBreadcrumb('bridge.solana_core_collection_mismatch', {
          asset: initRes.burn.asset,
          signedCollection,
          assetCollection,
        }, 'warn');
      }
      if (collectionAddress) {
        collection = await fetchCollection(umi, publicKey(collectionAddress)).catch((err) => {
          throw new Error(`Solana Core collection ${collectionAddress} could not be loaded for bridge burn: ${err?.message || err}`);
        });
      }
      const burnIx = burn(umi, collection ? { asset, collection } : { asset });
      const instructions = burnIx.getInstructions().map(toWeb3JsInstruction);
      const feeLamports = BigInt(initRes.bridgeFee?.amount || '0');
      if (feeLamports > 0n) {
        if (!initRes.feeTreasury) throw new Error('Solana bridge fee treasury is not configured');
        instructions.push(SystemProgram.transfer({
          fromPubkey: ownerPk,
          toPubkey: new PublicKey(initRes.feeTreasury),
          lamports: Number(feeLamports),
        }));
      }
      instructions.push(new TransactionInstruction({
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        keys: [],
        data: Buffer.from(memoText, 'utf8'),
      }));
      const conn = createSolanaConnection(Connection, coreRpcUrl, 'confirmed');
      return sendSolanaTransactionWithRetry({
        instructions,
        ownerPk,
        connection: conn,
        ...buildSolanaWalletTxOptions({
          solWallet,
          owner: ownerAddress,
          label: 'bridge.burn_solana_core',
          venueLabel: 'Bridge',
        }),
        maxAttempts: 4,
        priorityFeeMicroLamports: 250_000,
        skipPreflight: false,
      });
    }
    throw new Error(`Unsupported source kind ${kind}`);
  }, [sourceChain, evmAddress, solAddress, tradingEvmWallet, aptosWallet, solWallet]);

  // ── Submit the dest-side mint tx with the server-signed receipt ────
  // Returns { hash, recipient } when applicable. For Solana destinations
  // the server has already minted, so we just surface the asset address.
  const submitDestMint = useCallback(async (confirmRes) => {
    if (confirmRes.mode === 'solana-mint') {
      // Server already minted — nothing to submit. Return what we have.
      return { hash: confirmRes.txSig, asset: confirmRes.assetAddress };
    }
    if (confirmRes.mode === 'evm-receipt') {
      const destKey = destChain;
      await tradingEvmWallet.ensureChain(EVM_CHAIN_IDS[destKey]);
      const walletClient = createWalletClient({
        account: evmAddress, chain: viemChain(destKey), transport: custom(tradingEvmWallet.provider),
      });
      const [to, level, sourceRef, deadline, signature] = confirmRes.callData.args;
      const data = encodeFunctionData({
        abi: [{
          type: 'function', name: 'bridgeMint', stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' }, { name: 'level', type: 'uint8' },
            { name: 'sourceRef', type: 'bytes32' }, { name: 'deadline', type: 'uint256' },
            { name: 'signature', type: 'bytes' },
          ], outputs: [],
        }], functionName: 'bridgeMint',
        args: [to, Number(level), sourceRef, BigInt(deadline), signature],
      });
      const hash = await walletClient.sendTransaction({ to: getAddress(confirmRes.destContract), data });
      const publicClient = tradingEvmWallet.getPublicClient?.(EVM_CHAIN_IDS[destKey])
        || createPublicClient({ chain: viemChain(destKey), transport: bridgeReadTransport(destKey) });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
      return { hash };
    }
    if (confirmRes.mode === 'aptos-receipt') {
      // Use AptosWalletContext.loginSignAndSubmit (wraps the official
      // wallet-adapter) with the modern InputTransactionData shape rather
      // than the deprecated `entry_function_payload`. `destModule` here is
      // `0x...::demon_king` so we append `::bridge_mint` to form the full
      // function id the adapter expects.
      const submitted = await aptosWallet.loginSignAndSubmit({
        data: {
          function: `${confirmRes.destModule}::bridge_mint`,
          typeArguments: [],
          functionArguments: confirmRes.callData.args,
        },
      });
      return { hash: submitted?.hash || submitted?.txnHash || submitted };
    }
    throw new Error(`Unexpected confirm mode ${confirmRes.mode}`);
  }, [destChain, evmAddress, tradingEvmWallet, aptosWallet]);

  async function relayBridgeWithRetries({
    collection: relayCollection = collection,
    sourceChain: relaySource,
    destChain: relayDest,
    burnTxHash,
    destAddress,
    batchId,
    batchIndex,
    batchTotal,
  }) {
    const maxAttempts = 10;
    for (let attempt = 1; ; attempt++) {
      try {
        return await bridgeRelay({
          collection: relayCollection,
          sourceChain: relaySource,
          destChain: relayDest,
          burnTxHash,
          destAddress,
          batchId,
          batchIndex,
          batchTotal,
        });
      } catch (e) {
        const tooEarly = e?.status === 425
          || /need\s+\d+\s+confirmations/i.test(String(e?.message || ''));
        if (!tooEarly || attempt >= maxAttempts) throw e;
        const delayMs = 1000 * (2 + attempt);
        setNotice(`Waiting for source-chain confirmations (attempt ${attempt + 1}/${maxAttempts})...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  function bridgeSuccessResult({ relayRes, relayCollection = collection, relaySource, relayDest, burnTxHash, destAddress, sourceId = null }) {
    return {
      collection: relayCollection,
      sourceChain: relaySource,
      destChain: relayDest,
      sourceId,
      burnTxHash,
      sourceRef: relayRes.sourceRef,
      destAddress,
      destResult: relayRes.destTxHash
        ? { hash: relayRes.destTxHash, asset: relayRes.assetAddress }
        : { hash: relayRes.txSig, asset: relayRes.assetAddress },
      level: relayRes.level || relayRes.burned?.level || null,
    };
  }

  function setBatchItem(index, patch, fallbackItems = null) {
    setBatchItems((items) => {
      const base = items.length ? items : (fallbackItems || items);
      return base.map((item, i) => (i === index ? { ...item, ...patch } : item));
    });
  }

  const retryPendingRelay = useCallback(async () => {
    if (!pendingRelay) return;
    setBusy(true);
    setNotice(null);
    setStatus('confirming');
    try {
      const relayRes = await relayBridgeWithRetries(pendingRelay);
      setPendingRelay(null);
      setStatus('success');
      const retryResult = bridgeSuccessResult({
        relayRes,
        relayCollection: pendingRelay.collection || collection,
        relaySource: pendingRelay.sourceChain,
        relayDest: pendingRelay.destChain,
        burnTxHash: pendingRelay.burnTxHash,
        destAddress: pendingRelay.destAddress,
        sourceId: pendingRelay.sourceId || null,
      });
      if (pendingRelay.batchIndex) {
        setBatchItem(Number(pendingRelay.batchIndex) - 1, {
          phase: 'done',
          sourceRef: relayRes.sourceRef,
          destTxHash: retryResult.destResult?.hash || null,
          assetAddress: retryResult.destResult?.asset || null,
          level: retryResult.level,
        });
      }
      setResult(retryResult);
      addClientBreadcrumb('bridge.relay.retry.success', {
        collection: pendingRelay.collection || collection,
        sourceChain: pendingRelay.sourceChain,
        destChain: pendingRelay.destChain,
        sourceRef: relayRes.sourceRef,
      });
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      setNotice(msg.slice(0, 200));
      setStatus('error');
      addClientBreadcrumb('bridge.relay.retry.failed', {
        collection: pendingRelay.collection || collection,
        sourceChain: pendingRelay.sourceChain,
        destChain: pendingRelay.destChain,
        message: msg,
      }, 'warn');
    } finally {
      setBusy(false);
    }
  }, [pendingRelay, collection]);

  // ── End-to-end orchestration ───────────────────────────────────────
  const handleBridge = useCallback(async () => {
    setNotice(null);
    setBusy(true);
    setResult(null);
    setPendingRelay(null);
    setBatchItems([]);
    let activeBatchIndex = -1;
    try {
      if (!sourceWalletReady) {
        setNotice(`Connect your ${CHAIN_BY_ID[sourceChain].label} wallet first.`);
        return;
      }
      const rawSrcIds = (selectedSourceIds.length ? selectedSourceIds : parseSourceIdList(sourceIdInput))
        .map((id) => id.trim())
        .filter(Boolean);
      if (!rawSrcIds.length) {
        setNotice('Enter the NFT identifier on the source chain.');
        return;
      }
      if (rawSrcIds.length > MAX_BATCH_BRIDGE_NFTS) {
        setNotice(`Batch bridge supports up to ${MAX_BATCH_BRIDGE_NFTS} NFTs at once.`);
        return;
      }
      const srcIds = rawSrcIds.slice(0, MAX_BATCH_BRIDGE_NFTS);
      const destAddr = destAddrInput.trim();
      if (!destAddr) {
        setNotice('Enter (or connect) the destination wallet address.');
        return;
      }

      const kind = CHAIN_BY_ID[sourceChain].kind;
      const batchId = srcIds.length > 1 ? bridgeBatchId() : null;
      const initialItems = srcIds.map((id, index) => ({
        id,
        label: nftPickerLabel((ownedNfts || []).find((token) => nftIdentifier(token) === id), sourceChain, id),
        index: index + 1,
        phase: 'queued',
      }));
      setBatchItems(initialItems);
      const results = [];

      for (let i = 0; i < srcIds.length; i += 1) {
        activeBatchIndex = i;
        const srcId = srcIds[i];
        const batchMeta = { batchId, batchIndex: i + 1, batchTotal: srcIds.length };
        setNotice(srcIds.length > 1 ? `Bridging ${i + 1}/${srcIds.length}: ${initialItems[i]?.label || srcId}` : null);

        // 1) /bridge/init
        setStatus('burning');
        setBatchItem(i, { phase: 'init' }, initialItems);
        const initBody = { collection, sourceChain, destChain, destAddress: destAddr, sourceOwner: sourceWalletAddr, ...batchMeta };
        if (kind === 'evm')         initBody.sourceTokenId      = srcId;
        else if (kind === 'aptos')  initBody.sourceTokenAddress = srcId;
        else if (kind === 'solana') initBody.sourceAsset        = srcId;
        const initRes = await bridgeInit(initBody);
        addClientBreadcrumb('bridge.init', { collection, sourceChain, destChain, mode: initRes.mode, batchId, batchIndex: i + 1, batchTotal: srcIds.length });

        // 2) Submit burn on source.
        setBatchItem(i, { phase: 'burning' });
        const burnTxHash = await submitSourceBurn(initRes);
        const pending = { collection, sourceChain, destChain, burnTxHash, destAddress: destAddr, sourceId: srcId, ...batchMeta };
        setBatchItem(i, { phase: 'relay', burnTxHash });
        setPendingRelay(pending);

        // 3) /bridge/relay — server submits the destination mint. Batch
        // mode is sequential so every burn is independently recoverable.
        setStatus('confirming');
        const relayRes = await relayBridgeWithRetries(pending);
        const itemResult = bridgeSuccessResult({
          relayRes,
          relayCollection: collection,
          relaySource: sourceChain,
          relayDest: destChain,
          burnTxHash,
          destAddress: destAddr,
          sourceId: srcId,
        });
        results.push(itemResult);
        setBatchItem(i, {
          phase: 'done',
          burnTxHash,
          sourceRef: relayRes.sourceRef,
          destTxHash: itemResult.destResult?.hash || null,
          assetAddress: itemResult.destResult?.asset || null,
          level: itemResult.level,
        });
        setPendingRelay(null);
        setNotice(null);
        addClientBreadcrumb('bridge.relay', { collection, sourceChain, destChain, mode: relayRes.mode, sourceRef: relayRes.sourceRef, batchId, batchIndex: i + 1, batchTotal: srcIds.length });
        addClientBreadcrumb('bridge.success', { collection, sourceChain, destChain, sourceRef: relayRes.sourceRef, batchId, batchIndex: i + 1, batchTotal: srcIds.length });
      }
      setStatus('success');
      setResult(results.length === 1 ? results[0] : {
        batch: true,
        collection,
        sourceChain,
        destChain,
        destAddress: destAddr,
        count: results.length,
        results,
      });
    } catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      if (activeBatchIndex >= 0) setBatchItem(activeBatchIndex, { phase: 'error', error: msg.slice(0, 160) });
      setNotice(msg.slice(0, 200));
      setStatus('error');
      addClientBreadcrumb('bridge.failed', { collection, sourceChain, destChain, message: msg }, 'warn');
    } finally {
      setBusy(false);
    }
  }, [collection, sourceChain, destChain, sourceIdInput, selectedSourceIds, destAddrInput, sourceWalletAddr, sourceWalletReady, submitSourceBurn, ownedNfts]);

  // ── Render ─────────────────────────────────────────────────────────
  const statusLabel = {
    idle: '',
    burning: 'Step 1/3: signing burn tx…',
    confirming: 'Step 2/3: server verifying burn…',
    'dest-tx': 'Step 3/3: minting on destination…',
    success: '✓ Bridge complete',
    error: 'Bridge failed.',
  }[status];

  const sourceWalletAddrLabel = (() => {
    const kind = CHAIN_BY_ID[sourceChain]?.kind;
    if (kind === 'evm')    return evmAddress  ? shortAddr(evmAddress)  : 'Connect EVM';
    if (kind === 'solana') return solAddress  ? shortAddr(solAddress)  : 'Connect Solana';
    if (kind === 'aptos')  return aptAddress  ? shortAddr(aptAddress)  : 'Connect Aptos';
    return '';
  })();

  const sourceIdsToBridge = useMemo(() => {
    const ids = selectedSourceIds.length ? selectedSourceIds : parseSourceIdList(sourceIdInput);
    return ids.slice(0, MAX_BATCH_BRIDGE_NFTS);
  }, [selectedSourceIds, sourceIdInput]);
  const selectedNfts = useMemo(() => {
    if (!ownedNfts?.length || !sourceIdsToBridge.length) return [];
    const byId = new Map(ownedNfts.map((token) => [nftIdentifier(token), token]));
    return sourceIdsToBridge.map((id) => byId.get(id)).filter(Boolean);
  }, [ownedNfts, sourceIdsToBridge]);
  const bridgeBatchCount = sourceIdsToBridge.length;

  // Find the selected NFT object for preview rendering in steps 2/3. We
  // match on whichever identifier shape this chain uses (tokenId / token
  // address / asset pubkey). If the user pasted manually and the picker
  // didn't pre-select, `nftPreview` is null and we render a generic card.
  const nftPreview = (ownedNfts || []).find((t) => {
    const id = nftIdentifier(t);
    return id && id === sourceIdInput;
  }) || null;

  function canAdvanceFromStep1() {
    return sourceWalletReady && bridgeBatchCount > 0 && bridgeBatchCount <= MAX_BATCH_BRIDGE_NFTS;
  }
  function canAdvanceFromStep2() {
    return !!destAddrInput.trim() && destChain !== sourceChain;
  }

  // Restart wizard after a successful bridge or hard reset.
  function resetWizard() {
    setWizardStep(1);
    setStatus('idle');
    setResult(null);
    setPendingRelay(null);
    setNotice(null);
    setSourceIdInput('');
    setSelectedSourceIds([]);
    setBatchItems([]);
  }

  // The card pixel preview for an NFT — uses the indexer's imageUrl if
  // present, otherwise renders a placeholder glyph. Same shape on every
  // step so the player sees their NFT travel through the wizard.
  function NftCardLarge({ nft, chainKey }) {
    const chain = CHAIN_BY_ID[chainKey];
    const rawId = nftIdentifier(nft) || String(sourceIdInput || '').trim();
    const idShort = nftPickerLabel(nft, chainKey, sourceIdInput);
    const level = nft?.level ?? 1;
    const fallbackImage = nftLevelImageUrl(level, rawId, collection);
    return (
      <div style={localStyles.nftCardLarge}>
        <div style={localStyles.nftCardLargeImgWrap}>
          {!bridgeCollectionHidden && nft?.imageUrl
            ? <img src={nft.imageUrl} alt="" style={localStyles.nftCardLargeImg}
                onError={(e) => {
                  if (!e.currentTarget.dataset.fallbackApplied) {
                    e.currentTarget.dataset.fallbackApplied = '1';
                    e.currentTarget.src = fallbackImage;
                    return;
                  }
                  e.currentTarget.style.display = 'none';
                }} />
            : <span style={{ fontSize: 64, lineHeight: 1 }}>🐲</span>}
        </div>
        <div style={localStyles.nftCardLargeMeta}>
          <span style={localStyles.nftCardLargeTitle}>{activeCollection.label}</span>
          <span title={rawId}
            style={{ ...localStyles.nftCardLargeSub, display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
            <ChainLogo chain={chainKey} size={14} />
            <span style={localStyles.nftCardLargeSubText}>{chain?.label} - {idShort}</span>
          </span>
          <span style={localStyles.nftCardLargeLevel}>
            Level {level} {'★'.repeat(level)}
          </span>
        </div>
      </div>
    );
  }

  function BridgeBatchCard({ chainKey, mode = 'source' }) {
    const chain = CHAIN_BY_ID[chainKey];
    const first = selectedNfts[0] || nftPreview;
    const firstLevel = first?.level ?? 1;
    const fallbackImage = nftLevelImageUrl(firstLevel, sourceIdsToBridge[0] || null, collection);
    const count = Math.max(bridgeBatchCount, 1);
    const ids = sourceIdsToBridge.slice(0, 4).map((id) => {
      const nft = (ownedNfts || []).find((token) => nftIdentifier(token) === id);
      return nftPickerLabel(nft, sourceChain, id);
    });
    return (
      <div style={localStyles.batchCard}>
        <div style={localStyles.batchThumbStack}>
          <div style={{ ...localStyles.batchThumb, transform: 'translate(10px, 8px)', opacity: 0.35 }} />
          <div style={{ ...localStyles.batchThumb, transform: 'translate(5px, 4px)', opacity: 0.55 }} />
          <div style={localStyles.batchThumb}>
            {!bridgeCollectionHidden && first?.imageUrl
              ? <img src={first.imageUrl} alt="" style={localStyles.nftCardLargeImg}
                  onError={(e) => {
                    if (!e.currentTarget.dataset.fallbackApplied) {
                      e.currentTarget.dataset.fallbackApplied = '1';
                      e.currentTarget.src = fallbackImage;
                    }
                  }} />
              : <span style={{ fontSize: 38, lineHeight: 1 }}>NFT</span>}
          </div>
        </div>
        <div style={localStyles.batchMeta}>
          <span style={localStyles.nftCardLargeTitle}>
            {count} {activeCollection.label} NFT{count === 1 ? '' : 's'}
          </span>
          <span style={localStyles.nftCardLargeSub}>
            <ChainLogo chain={chainKey} size={14} /> {chain?.label} - {mode === 'source' ? 'source burn' : 'destination mint'}
          </span>
          <span style={localStyles.batchIds} title={sourceIdsToBridge.join(', ')}>
            {ids.join(', ')}{sourceIdsToBridge.length > ids.length ? ` +${sourceIdsToBridge.length - ids.length}` : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-scroll" style={localStyles.root}>
      {/* ─── Step 1: pick the NFT ──────────────────────────────── */}
      {wizardStep === 1 && (
        <>
          <div style={localStyles.stepHeader}>
            <span style={localStyles.stepTitle}>Pick your NFT</span>
            <span style={localStyles.stepSubtitle}>Step 1 of 3 — choose what to bridge</span>
          </div>

          {/* Source chain pills — auto-detected from connected wallets, but
              the player can flip if they own NFTs on multiple chains. */}
          <div style={localStyles.row}>
            <span style={localStyles.label}>Collection</span>
            <div style={localStyles.chainPicker}>
              {BRIDGE_COLLECTIONS.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => setCollection(c.id)}
                  style={{
                    ...localStyles.chainChip,
                    ...(collection === c.id ? localStyles.chainChipActive : null),
                  }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div style={localStyles.row}>
            <span style={localStyles.label}>Source chain</span>
            <div style={localStyles.chainPicker}>
              {availableChains.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => setSourceChain(c.id)}
                  style={{
                    ...localStyles.chainChip,
                    ...(sourceChain === c.id ? localStyles.chainChipActive : null),
                  }}
                >
                  <ChainLogo chain={c.id} size={16} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source-wallet chip / connect prompt. */}
          {!sourceWalletReady && (
            <div style={localStyles.row}>
              <button type="button" onClick={connectSourceWallet} style={localStyles.connectBtn}>
                Connect {CHAIN_BY_ID[sourceChain]?.label} wallet
              </button>
            </div>
          )}

          {/* Owned-NFT picker. Same UX as before but lifted to its own step. */}
          <div style={localStyles.row}>
            {!sourceWalletAddr ? (
              <div style={localStyles.helperHint}>Connect your source wallet to load your NFTs.</div>
            ) : ownedLoading ? (
              <div style={localStyles.helperHint}>Loading NFTs you own on {CHAIN_BY_ID[sourceChain].label}…</div>
            ) : ownedError ? (
              <div style={localStyles.notice}>Could not load NFTs: {ownedError.slice(0, 100)}</div>
            ) : ownedNfts && ownedNfts.length === 0 ? (
              <div style={localStyles.helperHint}>
                No NFTs found on {CHAIN_BY_ID[sourceChain].label} for {shortAddr(sourceWalletAddr)}. Paste a token ID below if you know it.
              </div>
            ) : ownedNfts && ownedNfts.length > 0 ? (
              // Horizontal carousel. Up to ~4 cards fit on a 360–420 px wide
              // shop modal; beyond that the row scrolls and we surface left/
              // right arrow chevrons so trackpad-less mice can advance.
              <div style={localStyles.nftPickerBlock}>
                <div style={localStyles.batchPickerBar}>
                  <span style={localStyles.batchPickerText}>
                    {bridgeBatchCount || 0} selected / {Math.min(ownedNfts.length, MAX_BATCH_BRIDGE_NFTS)} max
                  </span>
                  <div style={localStyles.batchPickerActions}>
                    <button type="button" onClick={selectAllVisibleNfts} style={localStyles.miniBtn}>
                      Select all
                    </button>
                    {bridgeBatchCount > 0 && (
                      <button type="button" onClick={clearSelectedNfts} style={localStyles.miniBtnMuted}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div style={localStyles.nftCarouselRow}>
                {ownedNfts.length > 4 && (
                  <button type="button"
                    onClick={() => scrollNfts(-1)}
                    style={localStyles.nftArrowBtn}
                    aria-label="Previous NFTs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18 9 12l6-6" />
                    </svg>
                  </button>
                )}
                <div ref={nftScrollRef} style={localStyles.nftScroll}>
                  {ownedNfts.map((t) => {
                    const id = nftIdentifier(t);
                    const selected = sourceIdsToBridge.includes(id);
                    const idShort = nftPickerLabel(t, sourceChain);
                    const fallbackImage = nftLevelImageUrl(t.level ?? 1, id, collection);
                    return (
                      <button key={id} type="button" onClick={() => selectNft(t)}
                        style={{ ...localStyles.nftCard, ...(selected ? localStyles.nftCardActive : null) }}
                        title={id}>
                        {t.imageUrl && (
                          <img src={t.imageUrl} alt={idShort} style={localStyles.nftImg}
                            onError={(e) => {
                              if (!e.currentTarget.dataset.fallbackApplied) {
                                e.currentTarget.dataset.fallbackApplied = '1';
                                e.currentTarget.src = fallbackImage;
                                return;
                              }
                              e.currentTarget.style.visibility = 'hidden';
                            }} />
                        )}
                        <div style={localStyles.nftMeta}>
                          <span style={localStyles.nftId} title={id}>{idShort}</span>
                          <span style={localStyles.nftLevel}>L{t.level ?? 1}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                  {ownedNfts.length > 4 && (
                    <button type="button"
                      onClick={() => scrollNfts(1)}
                      style={localStyles.nftArrowBtn}
                      aria-label="Next NFTs">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <input type="text"
              value={sourceIdInput}
              onChange={(e) => {
                setSelectedSourceIds([]);
                setSourceIdInput(e.target.value);
              }}
              placeholder={`Or paste one or many: ${sourceIdLabel(sourceChain)}`}
              style={localStyles.input} />
          </div>

          {notice && <div style={localStyles.notice}>{notice}</div>}
        </>
      )}

      {/* ─── Step 2: pick destination ──────────────────────────── */}
      {wizardStep === 2 && (
        <>
          <div style={localStyles.stepHeader}>
            <span style={localStyles.stepTitle}>Choose destination</span>
            <span style={localStyles.stepSubtitle}>Step 2 of 3 — where the NFT will land</span>
          </div>

          {/* Small preview of the selected NFT so the user remembers what's
              flying. Tap to go back if it's the wrong one. */}
          <button type="button" onClick={() => setWizardStep(1)}
            style={localStyles.previewBtn} title="Change NFT">
            {bridgeBatchCount > 1
              ? <BridgeBatchCard chainKey={sourceChain} mode="source" />
              : <NftCardLarge nft={nftPreview} chainKey={sourceChain} />}
            <span style={localStyles.previewBtnHint}>Tap to change</span>
          </button>

          <div style={localStyles.row}>
            <span style={localStyles.label}>Destination chain</span>
            <div style={localStyles.chainPicker}>
              {availableChains.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => setDestChain(c.id)}
                  disabled={sourceChain === c.id}
                  style={{
                    ...localStyles.chainChip,
                    ...(destChain === c.id ? localStyles.chainChipActive : null),
                    ...(sourceChain === c.id ? localStyles.chainChipDisabled : null),
                  }}>
                  <ChainLogo chain={c.id} size={16} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          <div style={localStyles.row}>
            <span style={localStyles.label}>Recipient address</span>
            <label style={localStyles.checkboxRow}>
              <input type="checkbox" checked={useConnectedDest}
                onChange={(e) => setUseConnectedDest(e.target.checked)} />
              <span>Use connected wallet ({autoDestAddr ? shortAddr(autoDestAddr) : 'none — connect below or paste'})</span>
            </label>
            <input type="text"
              value={destAddrInput}
              onChange={(e) => { setDestAddrInput(e.target.value); setUseConnectedDest(false); }}
              placeholder={destAddressLabel(destChain)}
              style={localStyles.input} />
          </div>

          {notice && <div style={localStyles.notice}>{notice}</div>}
        </>
      )}

      {/* ─── Step 3: confirm + bridge ──────────────────────────── */}
      {wizardStep === 3 && (
        <>
          <div style={localStyles.stepHeader}>
            <span style={localStyles.stepTitle}>Confirm bridge</span>
            <span style={localStyles.stepSubtitle}>Step 3 of 3 — review and sign</span>
          </div>

          {bridgeBatchCount > 1
            ? <BridgeBatchCard chainKey={sourceChain} mode="source" />
            : <NftCardLarge nft={nftPreview} chainKey={sourceChain} />}

          <div style={localStyles.bridgeArrowRow}>
            <span style={localStyles.bridgeArrow}>⬇</span>
            <span style={localStyles.bridgeArrowLabel}>bridge • level preserved</span>
          </div>

          {bridgeBatchCount > 1
            ? <BridgeBatchCard chainKey={destChain} mode="dest" />
            : <NftCardLarge nft={nftPreview} chainKey={destChain} />}

          <div style={localStyles.confirmMeta}>
            <div>
              <span style={localStyles.confirmLabel}>To</span>
              <span style={localStyles.confirmValue}>{shortAddr(destAddrInput, 8, 6)}</span>
            </div>
            <div>
              <span style={localStyles.confirmLabel}>Steps</span>
              <span style={localStyles.confirmValue}>
                {bridgeBatchCount > 1 ? `${bridgeBatchCount}x burn -> relay` : 'burn -> confirm -> mint'}
              </span>
            </div>
          </div>

          {/* Validation/idle notices stay inline so they're seen alongside
              the confirm cards. Bridge progress + success/error states are
              now hoisted into BridgeStatusModal below, so the user doesn't
              have to scroll past tall NFT cards to see status. */}
          {notice && status === 'idle' && (
            <div style={localStyles.notice}>{notice}</div>
          )}
        </>
      )}

      {/* ─── Step indicator dots ───────────────────────────────── */}
      <div style={localStyles.stepDots}>
        {[1, 2, 3].map((n) => (
          <span key={n} style={{
            ...localStyles.stepDot,
            ...(wizardStep === n ? localStyles.stepDotActive : null),
            ...(wizardStep > n ? localStyles.stepDotDone : null),
          }} />
        ))}
      </div>

      {/* ─── Navigation actions ────────────────────────────────── */}
      <div style={localStyles.actions}>
        {wizardStep === 1 && (
          <>
            <button type="button" onClick={onBack} style={localStyles.backBtn}>Back to shop</button>
            <button type="button"
              onClick={() => { if (canAdvanceFromStep1()) setWizardStep(2); else setNotice('Pick an NFT or paste a token ID first.'); }}
              disabled={!canAdvanceFromStep1()}
              style={{ ...localStyles.bridgeBtn, ...(!canAdvanceFromStep1() ? localStyles.bridgeBtnDisabled : null) }}>
              Next → choose chain
            </button>
          </>
        )}
        {wizardStep === 2 && (
          <>
            <button type="button" onClick={() => setWizardStep(1)} style={localStyles.backBtn}>Back</button>
            <button type="button"
              onClick={() => { if (canAdvanceFromStep2()) setWizardStep(3); else setNotice('Enter a destination address.'); }}
              disabled={!canAdvanceFromStep2()}
              style={{ ...localStyles.bridgeBtn, ...(!canAdvanceFromStep2() ? localStyles.bridgeBtnDisabled : null) }}>
              Next → review
            </button>
          </>
        )}
        {wizardStep === 3 && (
          <>
            <button type="button"
              onClick={status === 'success' ? resetWizard : () => setWizardStep(2)}
              disabled={busy}
              style={localStyles.backBtn}>
              {status === 'success' ? 'Bridge another' : 'Back'}
            </button>
            <button type="button"
              onClick={status === 'success' ? onBack : pendingRelay ? retryPendingRelay : handleBridge}
              disabled={busy}
              style={{ ...localStyles.bridgeBtn, ...(busy ? localStyles.bridgeBtnDisabled : null) }}>
              {busy
                ? (bridgeBatchCount > 1 ? `Bridging ${bridgeBatchCount} NFTs...` : 'Bridging...')
                : status === 'success'
                ? 'Done - back to shop'
                : pendingRelay
                ? 'Retry mint ->'
                : bridgeBatchCount > 1
                ? `Bridge ${bridgeBatchCount} NFTs ->`
                : 'Bridge NFT ->'}
            </button>
          </>
        )}
      </div>

      {/* Progress modal — opens the moment a bridge tx is signed and
          stays through success/error. Lives at the bottom of the panel
          tree so its fixed-position overlay covers everything inside the
          shop modal without being clipped by the wizard's scroll
          container. */}
      {status !== 'idle' && (
        <BridgeStatusModal
          status={status}
          notice={notice}
          result={result}
          pendingRelay={pendingRelay}
          busy={busy}
          sourceChain={sourceChain}
          destChain={destChain}
          batchItems={batchItems}
          onRetry={retryPendingRelay}
          onAnother={resetWizard}
          onBackToShop={onBack}
          onClose={resetWizard}
        />
      )}
    </div>
  );
}

// ── Bridge progress modal ─────────────────────────────────────────────
// Renders on top of the wizard once a bridge tx is signed. Shows a clean
// three-step indicator (burn / verify+relay / mint) plus success/error
// state with tx hashes. Replaces the inline status blocks that used to
// pile up under the confirm cards and force the user to scroll.
function BridgeStatusModal({
  status, notice, result, pendingRelay, busy,
  sourceChain, destChain, batchItems = [],
  onRetry, onAnother, onBackToShop, onClose,
}) {
  const isFinished = status === 'success' || status === 'error';
  const isWorking  = !isFinished;
  const isBatch = batchItems.length > 1 || result?.batch;
  // Map each pipeline step to its current visual state. The "confirming"
  // status covers both server verification AND server-side relay (one
  // network step from the user's point of view), so we collapse steps
  // 2 and 3 into a single row while the relay is in flight.
  const stepState = (idx) => {
    if (status === 'success') return 'done';
    if (status === 'error') {
      // Best-effort mapping: if pendingRelay exists, burn succeeded.
      if (pendingRelay && idx === 1) return 'done';
      if (pendingRelay && idx === 2) return 'error';
      if (idx === 1) return 'error';
      return 'pending';
    }
    if (status === 'burning')    return idx === 1 ? 'active' : 'pending';
    if (status === 'confirming') return idx === 1 ? 'done' : idx === 2 ? 'active' : 'pending';
    if (status === 'dest-tx')    return idx <= 2 ? 'done' : 'active';
    return 'pending';
  };

  const steps = [
    { idx: 1, label: 'Burn on source',         hint: `${CHAIN_BY_ID[sourceChain]?.label}` },
    { idx: 2, label: 'Server verify & relay',  hint: 'no extra signature needed' },
    { idx: 3, label: 'Mint on destination',    hint: `${CHAIN_BY_ID[destChain]?.label}` },
  ];

  const title = status === 'success' ? (isBatch ? 'Batch bridge complete' : 'Bridge complete')
              : status === 'error'   ? (isBatch ? 'Batch bridge stopped' : 'Bridge failed')
              : isBatch              ? `Bridging ${batchItems.length} NFTs...`
              : 'Bridging your NFT...';

  return (
    <div
      style={modalStyles.overlay}
      onClick={isWorking ? undefined : onClose}
      role="dialog" aria-modal="true"
    >
      <div style={modalStyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <span style={modalStyles.title}>{title}</span>
          {isFinished && (
            <button type="button" onClick={onClose} style={modalStyles.closeBtn} aria-label="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div style={modalStyles.body}>
          {/* Step indicator list — sticky to top so it's visible
              regardless of result/error text length below. */}
          <ol style={modalStyles.stepList}>
            {steps.map((step) => {
              const st = stepState(step.idx);
              return (
                <li key={step.idx} style={modalStyles.stepItem}>
                  <span style={{ ...modalStyles.stepBubble, ...modalStyles[`stepBubble_${st}`] }}>
                    {st === 'done'    ? '✓'
                    : st === 'error'  ? '!'
                    : st === 'active' ? <span style={modalStyles.spinner} />
                    : step.idx}
                  </span>
                  <span style={modalStyles.stepText}>
                    <span style={{ ...modalStyles.stepLabel, ...modalStyles[`stepLabel_${st}`] }}>
                      {step.label}
                    </span>
                    <span style={modalStyles.stepHint}>{step.hint}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          {batchItems.length > 1 && (
            <div style={modalStyles.batchList}>
              {batchItems.map((item) => (
                <div key={`${item.index}-${item.id}`} style={modalStyles.batchItem}>
                  <span style={modalStyles.batchIndex}>{item.index}</span>
                  <span style={modalStyles.batchLabel} title={item.id}>{item.label || shortNftRef(item.id)}</span>
                  <span style={{
                    ...modalStyles.batchPill,
                    ...(item.phase === 'done' ? modalStyles.batchPillDone : null),
                    ...(item.phase === 'error' ? modalStyles.batchPillError : null),
                  }}>
                    {item.phase === 'done' ? 'done'
                      : item.phase === 'error' ? 'error'
                      : item.phase === 'relay' ? 'relay'
                      : item.phase === 'burning' ? 'sign'
                      : item.phase === 'init' ? 'prep'
                      : 'queued'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {status === 'error' && notice && (
            <div style={modalStyles.errorBox}>{notice}</div>
          )}

          {status === 'success' && result && !result.batch && (
            <div style={modalStyles.resultBox}>
              <div style={modalStyles.resultHeadline}>
                <b>{CHAIN_BY_ID[result.sourceChain]?.label}</b>
                <span style={{ opacity: 0.5, margin: '0 6px' }}>→</span>
                <b>{CHAIN_BY_ID[result.destChain]?.label}</b>
              </div>
              <div style={modalStyles.resultMeta}>
                <span>Burn</span><span style={modalStyles.resultMono}>{shortAddr(result.burnTxHash, 8, 6)}</span>
                {result.destResult?.hash && (<>
                  <span>Dest tx</span><span style={modalStyles.resultMono}>{shortAddr(result.destResult.hash, 8, 6)}</span>
                </>)}
                {result.destResult?.asset && (<>
                  <span>New asset</span><span style={modalStyles.resultMono}>{shortAddr(result.destResult.asset, 8, 6)}</span>
                </>)}
                <span>Level</span><span><b>L{result.level || '?'}</b> · preserved</span>
              </div>
            </div>
          )}

          {status === 'success' && result?.batch && (
            <div style={modalStyles.resultBox}>
              <div style={modalStyles.resultHeadline}>
                <b>{result.count} NFTs bridged</b>
                <span style={{ opacity: 0.5, margin: '0 6px' }}>from</span>
                <b>{CHAIN_BY_ID[result.sourceChain]?.label}</b>
                <span style={{ opacity: 0.5, margin: '0 6px' }}>to</span>
                <b>{CHAIN_BY_ID[result.destChain]?.label}</b>
              </div>
              <div style={modalStyles.batchResultGrid}>
                {result.results.map((row, idx) => (
                  <div key={`${row.sourceId || idx}-${row.burnTxHash}`} style={modalStyles.batchResultRow}>
                    <span style={modalStyles.resultMono}>{shortNftRef(row.sourceId || row.sourceRef || String(idx + 1), 5, 4)}</span>
                    <span>L{row.level || '?'}</span>
                    <span style={modalStyles.resultMono}>{shortAddr(row.destResult?.hash || row.destResult?.asset || '', 6, 4)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingRelay && status === 'error' && (
            <div style={modalStyles.pendingBox}>
              <div style={{ fontWeight: 900, marginBottom: 2 }}>Burn saved</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Burn: {shortAddr(pendingRelay.burnTxHash, 8, 6)}<br />
                Retry mints on the destination — burn won't happen twice.
              </div>
            </div>
          )}

          {isWorking && (
            <div style={modalStyles.workingHint}>
              Keep this window open until {isBatch ? 'every selected NFT finishes' : 'all three steps finish'}.
            </div>
          )}
        </div>

        <div style={modalStyles.footer}>
          {status === 'success' && (
            <>
              <button type="button" onClick={onAnother} style={modalStyles.secondaryBtn}>
                Bridge another
              </button>
              <button type="button" onClick={onBackToShop} style={modalStyles.primaryBtn}>
                Done
              </button>
            </>
          )}
          {status === 'error' && (
            <>
              <button type="button" onClick={onClose} style={modalStyles.secondaryBtn}>
                Close
              </button>
              {pendingRelay ? (
                <button type="button" onClick={onRetry} disabled={busy} style={modalStyles.primaryBtn}>
                  Retry mint →
                </button>
              ) : (
                <button type="button" onClick={onAnother} style={modalStyles.primaryBtn}>
                  Try again
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const localStyles = {
  // Root is flex:1 + overflow-y:auto so the wizard scrolls inside the
  // fixed-height shop modal body. Step 3 in particular has tall NFT
  // cards + status — without this the bottom action buttons can sit
  // below the panel edge with no way to scroll there.
  root: {
    flex: 1, minHeight: 0,
    display: 'flex', flexDirection: 'column', gap: 10,
    overflowY: 'auto',
    // Parchment scrollbar to match the rest of the shop UI.
    scrollbarWidth: 'thin',
    scrollbarColor: '#bba882 #fdf8e7',
    margin: '0 -16px', padding: '0 16px',
  },
  intro: { fontSize: 13, color: '#5C3A21', margin: '4px 0 8px', lineHeight: 1.4 },
  row: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 700, color: '#5C3A21', letterSpacing: 0.2 },
  chainPicker: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chainChip: {
    padding: '6px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: '#fff6dc', border: '2px solid #d4c8b0', color: '#5C3A21',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  chainChipActive: {
    background: '#ffd97a', border: '2px solid #9f8759', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  chainChipDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  walletChip: {
    alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 10, fontSize: 12,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer', fontWeight: 600,
  },
  input: {
    padding: '8px 10px', borderRadius: 8, border: '2px solid #d4c8b0',
    background: '#fff', color: '#3a2810', fontSize: 13, fontFamily: 'monospace',
    outline: 'none',
  },
  checkboxRow: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5C3A21',
    cursor: 'pointer',
  },
  notice: {
    padding: '6px 10px', borderRadius: 8, background: '#fff0e0', color: '#7a4a1a',
    fontSize: 12, border: '1px solid #f0c4a0',
  },
  noticeOk: { background: '#e8f5e0', color: '#2e6b1a', border: '1px solid #b0d4a0' },
  successBox: {
    padding: 10, borderRadius: 10, background: '#fff6dc', border: '2px solid #d4c8b0',
    color: '#5C3A21', fontSize: 13,
  },
  actions: { display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  backBtn: {
    padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer',
  },
  bridgeBtn: {
    padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 800,
    background: '#7ce04a', border: '2px solid #4a8f2c', color: '#1a3d0a',
    cursor: 'pointer', minWidth: 140,
  },
  bridgeBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  helperHint: { fontSize: 12, color: '#7a5a30', fontStyle: 'italic' },
  // Horizontal NFT carousel row: [◀] [scrollable strip of cards] [▶].
  // Arrows are only rendered when >4 NFTs; the strip is overflow-x: auto
  // so wheel/trackpad still works, and arrows give a click target for
  // mice without horizontal-scroll wheels.
  nftCarouselRow: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  nftPickerBlock: {
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  batchPickerBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, padding: '6px 8px', borderRadius: 10,
    background: '#fff8e6', border: '1px solid #d4c8b0',
  },
  batchPickerText: { fontSize: 11, fontWeight: 900, color: '#5C3A21' },
  batchPickerActions: { display: 'flex', gap: 6, flexShrink: 0 },
  miniBtn: {
    padding: '4px 8px', borderRadius: 8,
    background: '#ffd97a', border: '1px solid #9f8759',
    color: '#5C3A21', fontSize: 11, fontWeight: 900,
    cursor: 'pointer',
  },
  miniBtnMuted: {
    padding: '4px 8px', borderRadius: 8,
    background: '#fff6dc', border: '1px solid #d4c8b0',
    color: '#7a5a30', fontSize: 11, fontWeight: 900,
    cursor: 'pointer',
  },
  nftScroll: {
    display: 'flex', gap: 8,
    overflowX: 'auto', overflowY: 'hidden',
    padding: 6, flex: 1, minWidth: 0,
    background: '#fff8e6',
    border: '2px solid #d4c8b0',
    borderRadius: 10,
    scrollSnapType: 'x mandatory',
    scrollbarWidth: 'thin',
  },
  nftArrowBtn: {
    width: 28, height: 56, borderRadius: 8, padding: 0,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  nftCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 4, gap: 4,
    borderRadius: 8, border: '2px solid transparent',
    background: '#fff', cursor: 'pointer',
    transition: 'border-color 0.1s',
    flexShrink: 0, width: 96,
    scrollSnapAlign: 'start',
  },
  nftCardActive: {
    border: '2px solid #9f8759',
    background: '#ffd97a',
    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
  },
  nftImg: {
    width: 72, height: 72, objectFit: 'cover', borderRadius: 6,
    background: '#e8dfc8',
  },
  nftMeta: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', minWidth: 0, fontSize: 11, fontWeight: 700, color: '#5C3A21',
  },
  nftId: {
    fontFamily: 'monospace',
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nftLevel: { color: '#7a5a30', flexShrink: 0 },

  // ── Wizard chrome ─────────────────────────────────────────────────
  stepHeader: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 },
  stepTitle:  { fontSize: 17, fontWeight: 900, color: '#5C3A21' },
  stepSubtitle: { fontSize: 11, color: '#9f8759', letterSpacing: 0.4, textTransform: 'uppercase' },

  stepDots: {
    display: 'flex', justifyContent: 'center', gap: 8, marginTop: 6, marginBottom: 2,
  },
  stepDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#e8dfc8',
    border: '1px solid #d4c8b0',
  },
  stepDotActive: { background: '#ffd97a', border: '1px solid #9f8759', boxShadow: '0 0 0 2px rgba(255,217,122,0.4)' },
  stepDotDone:   { background: '#7ce04a', border: '1px solid #4a8f2c' },

  connectBtn: {
    alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 10, fontSize: 13,
    background: '#ffd97a', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer', fontWeight: 700,
  },

  // ── Large NFT card (shown on steps 2 + 3) ────────────────────────
  nftCardLarge: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: 10, borderRadius: 14,
    background: 'linear-gradient(180deg, #fff6dc 0%, #ffefc4 100%)',
    border: '2px solid #d4c8b0',
    boxShadow: '0 2px 6px rgba(95,58,33,0.08)',
  },
  nftCardLargeImgWrap: {
    width: 80, height: 80, borderRadius: 12,
    background: '#fff', border: '2px solid #d4c8b0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  nftCardLargeImg: { width: '100%', height: '100%', objectFit: 'cover' },
  nftCardLargeMeta: {
    display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0,
  },
  nftCardLargeTitle: { fontSize: 15, fontWeight: 800, color: '#5C3A21' },
  nftCardLargeSub: { fontSize: 12, color: '#7a5a30', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nftCardLargeSubText: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nftCardLargeLevel: { fontSize: 12, fontWeight: 700, color: '#b8860b' },
  batchCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: 10, borderRadius: 14,
    background: 'linear-gradient(180deg, #fff6dc 0%, #ffefc4 100%)',
    border: '2px solid #d4c8b0',
    boxShadow: '0 2px 6px rgba(95,58,33,0.08)',
  },
  batchThumbStack: {
    position: 'relative',
    width: 92,
    height: 84,
    flexShrink: 0,
  },
  batchThumb: {
    position: 'absolute',
    inset: 0,
    width: 76,
    height: 76,
    borderRadius: 12,
    background: '#fff',
    border: '2px solid #d4c8b0',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#5C3A21',
    fontWeight: 900,
  },
  batchMeta: {
    display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0,
  },
  batchIds: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#5C3A21',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Tap-to-edit wrapper around the NFT preview on step 2.
  previewBtn: {
    padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch',
  },
  previewBtnHint: { fontSize: 10, color: '#9f8759', textAlign: 'right', fontStyle: 'italic' },

  // Bridge arrow between source + dest cards on step 3.
  bridgeArrowRow: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, margin: '4px 0',
  },
  bridgeArrow: { fontSize: 22, color: '#7ce04a' },
  bridgeArrowLabel: { fontSize: 10, color: '#9f8759', letterSpacing: 0.4, textTransform: 'uppercase' },

  confirmMeta: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '8px 10px', borderRadius: 8,
    background: '#fff8e6', border: '1px solid #d4c8b0',
    fontSize: 12, color: '#5C3A21',
  },
  confirmLabel: { fontWeight: 700, marginRight: 6, color: '#7a5a30' },
  confirmValue: { fontFamily: 'monospace', wordBreak: 'break-all' },
};

// ── Bridge progress modal styles ─────────────────────────────────────
// Sized to fit comfortably inside the 500px shop modal; the overlay
// covers the whole viewport (position: fixed) so it sits above the shop
// modal's own backdrop. Parchment palette mirrors the rest of the shop
// chrome so it doesn't read as a system dialog.
const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(20, 12, 4, 0.55)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 300, pointerEvents: 'all', padding: 16,
  },
  panel: {
    width: 380, maxWidth: '100%', maxHeight: '88vh',
    background: '#fdf8e7',
    border: '5px solid #d4c8b0', borderRadius: 18,
    boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'inherit', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px',
    background: '#d4c8b0', borderBottom: '3px solid #bba882',
  },
  title: { fontSize: 16, fontWeight: 900, color: '#5C3A21' },
  closeBtn: {
    width: 26, height: 26, borderRadius: '50%',
    background: '#E53935', border: '2px solid #fff', color: '#fff',
    cursor: 'pointer', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  body: {
    padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
    overflowY: 'auto',
    scrollbarWidth: 'thin', scrollbarColor: '#bba882 #fdf8e7',
  },

  stepList: {
    listStyle: 'none', margin: 0, padding: 0,
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  stepItem: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  stepBubble: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, flexShrink: 0,
    background: '#e8dfc8', color: '#9f8759', border: '2px solid #d4c8b0',
    transition: 'background 0.2s, border-color 0.2s',
  },
  stepBubble_pending: {},
  stepBubble_active: {
    background: '#fff6dc', border: '2px solid #c2851b', color: '#5C3A21',
    boxShadow: '0 0 0 3px rgba(255,217,122,0.4)',
  },
  stepBubble_done: {
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '2px solid #1f6d34', color: '#fff',
  },
  stepBubble_error: {
    background: '#E53935', border: '2px solid #7f0000', color: '#fff',
  },
  stepText: { display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 },
  stepLabel: { fontSize: 13, fontWeight: 800, color: '#7a5a30' },
  stepLabel_active: { color: '#5C3A21' },
  stepLabel_done:   { color: '#5C3A21' },
  stepLabel_error:  { color: '#b71c1c' },
  stepLabel_pending: {},
  stepHint: { fontSize: 11, color: '#9f8759', fontWeight: 700 },

  // Tiny CSS spinner used in the "active" bubble. Rotation is driven by
  // the global `nft-mint-ring-spin` keyframes injected by NftMintPanel —
  // the bridge panel is always rendered as a child of NftMintPanel so
  // those keyframes are in scope.
  spinner: {
    width: 12, height: 12, borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(92,58,33,0.25)',
    borderTopColor: '#5C3A21',
    animation: 'nft-mint-ring-spin 0.9s linear infinite',
  },

  batchList: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: 8, borderRadius: 10,
    background: '#fff8e6', border: '1px solid #d4c8b0',
  },
  batchItem: {
    display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr) auto',
    alignItems: 'center', gap: 7, fontSize: 11, color: '#5C3A21',
  },
  batchIndex: {
    width: 20, height: 20, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: '#d4c8b0', color: '#5C3A21', fontWeight: 900,
  },
  batchLabel: {
    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontFamily: 'monospace', fontWeight: 800,
  },
  batchPill: {
    padding: '2px 6px', borderRadius: 999,
    background: '#e8dfc8', color: '#7a5a30',
    fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
  },
  batchPillDone: { background: '#d9efc0', color: '#1f6d34' },
  batchPillError: { background: '#ffd8d8', color: '#9d1e1e' },

  resultBox: {
    padding: '10px 12px', borderRadius: 10,
    background: 'linear-gradient(180deg, #f1fbe5 0%, #d9efc0 100%)',
    border: '2px solid #7db85a', color: '#1f3e0a',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  resultHeadline: { fontSize: 14 },
  resultMeta: {
    display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 3,
    fontSize: 12,
  },
  resultMono: { fontFamily: 'monospace', wordBreak: 'break-all' },
  batchResultGrid: {
    display: 'flex', flexDirection: 'column', gap: 4,
    fontSize: 11,
  },
  batchResultRow: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    gap: 8, alignItems: 'center',
    padding: '4px 0', borderTop: '1px solid rgba(31, 109, 52, 0.18)',
  },

  pendingBox: {
    padding: '8px 10px', borderRadius: 10,
    background: '#fff1cc', border: '2px solid #d9a928', color: '#5C3A21',
  },

  errorBox: {
    padding: '8px 10px', borderRadius: 10,
    background: '#fdecea', border: '2px solid #E53935', color: '#7a1f1c',
    fontSize: 12, fontWeight: 700,
  },

  workingHint: {
    fontSize: 11, color: '#7a5a30', fontStyle: 'italic', textAlign: 'center',
  },

  footer: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: '10px 14px',
    borderTop: '3px solid #d4c8b0', background: '#f5ecd2',
  },
  primaryBtn: {
    padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 900,
    background: 'linear-gradient(180deg, #91df7d 0%, #3b9b41 100%)',
    border: '2px solid #1f6d34', color: '#fff',
    cursor: 'pointer',
    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
  },
  secondaryBtn: {
    padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800,
    background: '#fff6dc', border: '2px solid #9f8759', color: '#5C3A21',
    cursor: 'pointer',
  },
};
