const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} = require('@solana/web3.js');

const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createMintToCheckedInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getMintLen,
  getTokenMetadata,
  tokenMetadataInitializeWithRentTransfer,
  tokenMetadataUpdateFieldWithRentTransfer,
} = require('@solana/spl-token');
const { createSolanaConnection, solanaPrimaryRpcUrl } = require('./solana_rpc');

const DEFAULT_SYMBOL = 'DKING';
const DEFAULT_COLLECTION_ID = 'demon-king-token2022-v1';
const DEFAULT_PUBLIC_BASE_URL = 'https://clashofperps.fun';

function solanaRpcUrl() {
  const rpcUrl = solanaPrimaryRpcUrl();
  if (!rpcUrl) throw new Error('Solana RPC endpoint is not configured');
  return rpcUrl;
}

function solanaToken2022Symbol() {
  return String(process.env.NFT_SOLANA_TOKEN2022_SYMBOL || DEFAULT_SYMBOL).trim() || DEFAULT_SYMBOL;
}

function solanaToken2022CollectionId() {
  return String(process.env.NFT_SOLANA_TOKEN2022_COLLECTION_ID || DEFAULT_COLLECTION_ID).trim() || DEFAULT_COLLECTION_ID;
}

function publicBaseUrl() {
  return String(process.env.NFT_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

function normalizeLevel(level) {
  const n = Number(level || 1);
  return [1, 2, 3].includes(n) ? n : 1;
}

function token2022MetadataUri({ mint, level, sourceRef }) {
  const url = new URL(`/api/nft/solana/token2022/${mint}`, `${publicBaseUrl()}/`);
  url.searchParams.set('level', String(normalizeLevel(level)));
  url.searchParams.set('collection', solanaToken2022CollectionId());
  if (sourceRef) url.searchParams.set('src', String(sourceRef).slice(0, 80));
  return url.toString();
}

function token2022Name(level) {
  return `Demon King L${normalizeLevel(level)}`;
}

function token2022LooksLikeDemonKing(meta) {
  if (!meta) return false;
  const symbol = String(meta.symbol || '').trim().toUpperCase();
  const name = String(meta.name || '').trim().toLowerCase();
  const uri = String(meta.uri || '').trim().toLowerCase();
  const collectionId = solanaToken2022CollectionId().toLowerCase();
  return symbol === solanaToken2022Symbol().toUpperCase()
    && name.includes('demon king')
    && (uri.includes('/api/nft/solana/token2022/') || uri.includes(collectionId));
}

function levelFromToken2022Metadata(meta) {
  const text = `${meta?.name || ''} ${meta?.uri || ''}`;
  const match = text.match(/(?:level|lvl|l)[=\s_-]*([123])\b/i);
  return match ? Number(match[1]) : 1;
}

function sourceRefFromToken2022Metadata(meta) {
  const uri = String(meta?.uri || '');
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    return parsed.searchParams.get('src') || null;
  } catch {
    const match = uri.match(/[?&]src=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
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
  let confirmed;
  try {
    confirmed = await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }, 'confirmed');
  } catch (err) {
    return recoverExpiredSignatureIfLanded(connection, err, label || 'Solana transaction');
  }
  if (confirmed.value?.err) {
    throw new Error(`${label || 'Solana transaction'} failed: ${JSON.stringify(confirmed.value.err)}`);
  }
  return signature;
}

async function recoverExpiredSignatureIfLanded(connection, err, label) {
  const signature = err?.signature;
  if (!signature) throw err;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    const status = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    }).catch(() => null);
    const value = status?.value?.[0];
    if (value?.err) {
      throw new Error(`${label || 'Solana transaction'} failed: ${JSON.stringify(value.err)}`);
    }
    if (value && ['confirmed', 'finalized'].includes(value.confirmationStatus)) {
      return signature;
    }
  }
  throw err;
}

function payerFromSecretKey(payerSecretKey) {
  if (!payerSecretKey) throw new Error('Solana payer secret key required');
  if (payerSecretKey.secretKey) {
    return Keypair.fromSecretKey(Uint8Array.from(payerSecretKey.secretKey));
  }
  return Keypair.fromSecretKey(Uint8Array.from(payerSecretKey));
}

async function initializeToken2022MetadataWithRecover({
  conn,
  payer,
  mint,
  level,
  uri,
}) {
  try {
    return await tokenMetadataInitializeWithRentTransfer(
      conn,
      payer,
      mint,
      payer.publicKey,
      payer,
      token2022Name(level),
      solanaToken2022Symbol(),
      uri,
      [],
      { commitment: 'confirmed', preflightCommitment: 'confirmed', maxRetries: 5 },
      TOKEN_2022_PROGRAM_ID,
    );
  } catch (err) {
    return recoverExpiredSignatureIfLanded(conn, err, 'Token-2022 NFT metadata');
  }
}

function token2022MintRentBytes() {
  return getMintLen([ExtensionType.MetadataPointer]);
}

async function estimateToken2022NftRent(connection = createSolanaConnection(Connection, solanaRpcUrl(), 'confirmed')) {
  const mintBytes = token2022MintRentBytes();
  const mintRentLamports = await connection.getMinimumBalanceForRentExemption(mintBytes);
  // Metadata is added by tokenMetadataInitializeWithRentTransfer after mint
  // account creation. This estimate assumes our compact name/symbol/URI.
  const sampleUri = token2022MetadataUri({
    mint: '11111111111111111111111111111111',
    level: 1,
    sourceRef: '0x'.padEnd(66, '0'),
  });
  const approxMetadataBytes = 4 + token2022Name(1).length
    + 4 + solanaToken2022Symbol().length
    + 4 + sampleUri.length
    + 32 + 32 + 8;
  const approxMetadataRentLamports = await connection.getMinimumBalanceForRentExemption(mintBytes + approxMetadataBytes);
  return {
    mintBytes,
    mintRentLamports,
    approxMetadataBytes,
    approxTotalMintRentLamports: approxMetadataRentLamports,
  };
}

async function mintToken2022Nft({ recipient, level = 1, sourceRef = null, payerSecretKey = null, connection = null } = {}) {
  if (!recipient) throw new Error('recipient required');
  const conn = connection || createSolanaConnection(Connection, solanaRpcUrl(), 'confirmed');
  const payer = payerFromSecretKey(payerSecretKey);
  const recipientPk = new PublicKey(recipient);
  const mint = Keypair.generate();
  const mintBytes = token2022MintRentBytes();
  const mintRent = await conn.getMinimumBalanceForRentExemption(mintBytes);
  const uri = token2022MetadataUri({ mint: mint.publicKey.toBase58(), level, sourceRef });
  const ata = getAssociatedTokenAddressSync(
    mint.publicKey,
    recipientPk,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const setupTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintBytes,
      lamports: mintRent,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      payer.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMint2Instruction(
      mint.publicKey,
      0,
      payer.publicKey,
      payer.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  const setupSig = await sendAndConfirmFresh(conn, setupTx, [payer, mint], 'Token-2022 NFT setup');

  const metadataSig = await initializeToken2022MetadataWithRecover({
    conn,
    payer,
    mint: mint.publicKey,
    level,
    uri,
  });

  const mintTx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      recipientPk,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createMintToCheckedInstruction(
      mint.publicKey,
      ata,
      payer.publicKey,
      1,
      0,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createSetAuthorityInstruction(
      mint.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createSetAuthorityInstruction(
      mint.publicKey,
      payer.publicKey,
      AuthorityType.FreezeAccount,
      null,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  const mintSig = await sendAndConfirmFresh(conn, mintTx, [payer], 'Token-2022 NFT mint');

  return {
    standard: 'token2022',
    assetAddress: mint.publicKey.toBase58(),
    mint: mint.publicKey.toBase58(),
    tokenAccount: ata.toBase58(),
    txSig: mintSig,
    setupSig,
    metadataSig,
    uri,
    level: normalizeLevel(level),
  };
}

async function completeExistingToken2022NftMint({
  mint,
  recipient,
  level = 1,
  sourceRef = null,
  payerSecretKey = null,
  connection = null,
  setupSig = null,
} = {}) {
  if (!mint) throw new Error('mint required');
  if (!recipient) throw new Error('recipient required');
  const conn = connection || createSolanaConnection(Connection, solanaRpcUrl(), 'confirmed');
  const payer = payerFromSecretKey(payerSecretKey);
  const recipientPk = new PublicKey(recipient);
  const mintPk = new PublicKey(mint);
  const uri = token2022MetadataUri({ mint: mintPk.toBase58(), level, sourceRef });
  const ata = getAssociatedTokenAddressSync(
    mintPk,
    recipientPk,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  let metadataSig = null;
  const existingMeta = await getTokenMetadata(conn, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => null);
  if (!token2022LooksLikeDemonKing(existingMeta)) {
    metadataSig = await initializeToken2022MetadataWithRecover({
      conn,
      payer,
      mint: mintPk,
      level,
      uri,
    });
  }

  const mintInfo = await getMint(conn, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const supply = BigInt(mintInfo.supply);
  let mintSig = null;
  if (supply === 0n) {
    const mintTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata,
        recipientPk,
        mintPk,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      createMintToCheckedInstruction(
        mintPk,
        ata,
        payer.publicKey,
        1,
        0,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
      createSetAuthorityInstruction(
        mintPk,
        payer.publicKey,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
      createSetAuthorityInstruction(
        mintPk,
        payer.publicKey,
        AuthorityType.FreezeAccount,
        null,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );
    mintSig = await sendAndConfirmFresh(conn, mintTx, [payer], 'Token-2022 NFT mint');
  } else if (supply !== 1n) {
    throw new Error(`Token-2022 mint has unexpected supply ${supply.toString()}`);
  }

  const accounts = await conn.getParsedTokenAccountsByOwner(recipientPk, { mint: mintPk }, 'confirmed');
  const tokenAccount = (accounts.value || []).find((row) => {
    const parsed = row?.account?.data?.parsed?.info;
    return String(parsed?.mint || '') === mintPk.toBase58()
      && String(parsed?.owner || '') === recipientPk.toBase58()
      && String(parsed?.tokenAmount?.amount || '') === '1'
      && Number(parsed?.tokenAmount?.decimals) === 0;
  });
  if (!tokenAccount) throw new Error('Token-2022 recipient token account was not found after mint');

  return {
    standard: 'token2022',
    assetAddress: mintPk.toBase58(),
    mint: mintPk.toBase58(),
    tokenAccount: tokenAccount.pubkey.toBase58(),
    txSig: mintSig,
    setupSig,
    metadataSig,
    uri,
    level: normalizeLevel(level),
  };
}

async function getToken2022NftInfo({ mint, expectedOwner, connection = null, collectionPubkey = null } = {}) {
  if (!mint) throw new Error('mint required');
  if (!expectedOwner) throw new Error('expectedOwner required');
  const conn = connection || createSolanaConnection(Connection, solanaRpcUrl(), 'confirmed');
  const mintPk = new PublicKey(mint);
  const ownerPk = new PublicKey(expectedOwner);
  const [meta, mintInfo, accounts] = await Promise.all([
    getTokenMetadata(conn, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => null),
    getMint(conn, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => null),
    conn.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk }, 'confirmed'),
  ]);
  if (!token2022LooksLikeDemonKing(meta)) {
    throw new Error('Solana Token-2022 mint is not a Demon King NFT');
  }
  if (mintInfo && BigInt(mintInfo.supply) === 0n) {
    throw new Error('Solana Token-2022 mint is already burned (supply is 0)');
  }
  if (!mintInfo || Number(mintInfo.decimals) !== 0 || BigInt(mintInfo.supply) !== 1n) {
    throw new Error('Solana Token-2022 mint is not a 1-of-1 NFT');
  }
  const tokenAccount = (accounts.value || []).find((row) => {
    const parsed = row?.account?.data?.parsed?.info;
    return String(parsed?.mint || '') === mintPk.toBase58()
      && String(parsed?.owner || '') === ownerPk.toBase58()
      && String(parsed?.tokenAmount?.amount || '') === '1'
      && Number(parsed?.tokenAmount?.decimals) === 0;
  });
  if (!tokenAccount) throw new Error('Solana source wallet does not own this Token-2022 NFT');
  return {
    standard: 'token2022',
    asset: mintPk.toBase58(),
    mint: mintPk.toBase58(),
    tokenAccount: tokenAccount.pubkey.toBase58(),
    owner: ownerPk.toBase58(),
    collection: collectionPubkey || mintPk.toBase58(),
    level: levelFromToken2022Metadata(meta),
    metadata: meta,
  };
}

async function upgradeToken2022NftLevel({
  mint,
  owner,
  level,
  sourceRef = null,
  payerSecretKey = null,
  connection = null,
} = {}) {
  if (!mint) throw new Error('mint required');
  if (!owner) throw new Error('owner required');
  const nextLevel = normalizeLevel(level);
  if (nextLevel <= 1) throw new Error('Token-2022 upgrade level must be 2 or 3');
  const conn = connection || createSolanaConnection(Connection, solanaRpcUrl(), 'confirmed');
  const payer = payerFromSecretKey(payerSecretKey);
  const info = await getToken2022NftInfo({ mint, expectedOwner: owner, connection: conn });
  const currentLevel = normalizeLevel(info.level);
  if (nextLevel !== currentLevel + 1) {
    throw new Error(`Solana Demon King must upgrade by 1 level (current L${currentLevel}, requested L${nextLevel})`);
  }
  const mintPk = new PublicKey(mint);
  const nextSourceRef = sourceRef || sourceRefFromToken2022Metadata(info.metadata);
  const uri = token2022MetadataUri({ mint: mintPk.toBase58(), level: nextLevel, sourceRef: nextSourceRef });
  const confirmOptions = { commitment: 'confirmed', preflightCommitment: 'confirmed', maxRetries: 5 };
  const nameSig = await tokenMetadataUpdateFieldWithRentTransfer(
    conn,
    payer,
    mintPk,
    payer.publicKey,
    'name',
    token2022Name(nextLevel),
    [],
    confirmOptions,
    TOKEN_2022_PROGRAM_ID,
  ).catch((err) => recoverExpiredSignatureIfLanded(conn, err, 'Token-2022 NFT name update'));
  const uriSig = await tokenMetadataUpdateFieldWithRentTransfer(
    conn,
    payer,
    mintPk,
    payer.publicKey,
    'uri',
    uri,
    [],
    confirmOptions,
    TOKEN_2022_PROGRAM_ID,
  ).catch((err) => recoverExpiredSignatureIfLanded(conn, err, 'Token-2022 NFT uri update'));
  return {
    ...info,
    level: nextLevel,
    previousLevel: currentLevel,
    imageUrl: token2022MetadataUri({ mint: mintPk.toBase58(), level: nextLevel, sourceRef: nextSourceRef }),
    updateTxSig: uriSig || nameSig,
    nameTxSig: nameSig,
    uriTxSig: uriSig,
  };
}

function createToken2022BurnInstructions({ mint, owner, tokenAccount, destination = null }) {
  const mintPk = new PublicKey(mint);
  const ownerPk = new PublicKey(owner);
  const tokenAccountPk = tokenAccount
    ? new PublicKey(tokenAccount)
    : getAssociatedTokenAddressSync(
      mintPk,
      ownerPk,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  const closeDestination = destination ? new PublicKey(destination) : ownerPk;
  return [
    createBurnCheckedInstruction(
      tokenAccountPk,
      mintPk,
      ownerPk,
      1,
      0,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createCloseAccountInstruction(
      tokenAccountPk,
      closeDestination,
      ownerPk,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
}

module.exports = {
  TOKEN_2022_PROGRAM_ID,
  token2022MetadataUri,
  token2022Name,
  solanaToken2022CollectionId,
  solanaToken2022Symbol,
  token2022LooksLikeDemonKing,
  levelFromToken2022Metadata,
  estimateToken2022NftRent,
  mintToken2022Nft,
  completeExistingToken2022NftMint,
  getToken2022NftInfo,
  upgradeToken2022NftLevel,
  createToken2022BurnInstructions,
};
