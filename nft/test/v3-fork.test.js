// Fork test for the Base V2 → V3 UUPS upgrade.
//
// Forks Base mainnet, takes the current V2 proxy with its 43 minted NFTs,
// performs the live upgrade procedure (impl deploy → upgradeToAndCall →
// reinitializeV3), then exercises every V3 surface:
//
//   1. Pre-existing tokens still owned by the same wallets.
//   2. `tokenLevel(id)` reads as 1 for every legacy token (no storage write).
//   3. `upgradeToken` flow with server-signed EIP-712 quote.
//   4. `bridgeMint` flow with server-signed receipt.
//   5. `bridgeBurn` reverts on Base (chainid 8453).
//   6. Replay protection: same nonce and same sourceRef both revert.
//   7. Royalty info via EIP-2981.
//
// Run:  npx hardhat test --network hardhatMainnet test/v3-fork.test.js

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { network } from 'hardhat';
import {
  encodeFunctionData,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  getAddress,
  parseEther,
  hexToBytes,
  zeroAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Constants from production deployments ---
const PROXY = '0x404807f93e47af3eaaec0e983f18dcb35e966fec';
const OWNER = '0x1EC28Cf035443A703a943bEC2C19c3CA083b7828';
const BASE_CHAIN_ID = 8453;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// Deterministic test-only key derived from a label, so no key material lives in git.
const TEST_SIGNER_PK = keccak256(Buffer.from('clash-v3-fork-test-signer'));
const ROYALTY_RECEIVER = '0xC024884ad9C5540996492Cc2DD080964941A3094';
const EIP712_NAME = 'DemonKingBase';
const EIP712_VERSION = '3';

const testSigner = privateKeyToAccount(TEST_SIGNER_PK);

// ABI subset we use (minted from compiled artifact at runtime).
let v3Abi;
let v3Bytecode;

function loadArtifact() {
  // Hardhat 3 compiles into artifacts-hh/ by default.
  const artifactPath = path.resolve(
    __dirname, '..',
    'artifacts-hh',
    'contracts',
    'DemonKingBaseV3.sol',
    'DemonKingBaseV3.json',
  );
  const json = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  v3Abi = json.abi;
  v3Bytecode = json.bytecode;
}

// EIP-712 helpers — build the typed-data hash exactly as Solidity's
// _hashTypedDataV4(structHash) would.
const EIP712_DOMAIN_TYPEHASH = keccak256(
  Buffer.from('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
);

function domainSeparator(name, version, chainId, verifyingContract) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(Buffer.from(name)),
        keccak256(Buffer.from(version)),
        BigInt(chainId),
        verifyingContract,
      ],
    ),
  );
}

function digestFromStruct(domainSep, structHash) {
  // EIP-712 envelope: keccak256(0x19 ‖ 0x01 ‖ domainSep ‖ structHash)
  const buf = new Uint8Array(2 + 32 + 32);
  buf[0] = 0x19;
  buf[1] = 0x01;
  buf.set(hexToBytes(domainSep), 2);
  buf.set(hexToBytes(structHash), 34);
  return keccak256(buf);
}

const UPGRADE_QUOTE_TYPEHASH = keccak256(
  Buffer.from('UpgradeQuote(address owner,uint256 tokenId,uint8 newLevel,address paymentToken,uint256 priceUnits,bytes32 nonce,uint256 deadline)'),
);
const BRIDGE_RECEIPT_TYPEHASH = keccak256(
  Buffer.from('BridgeReceipt(address to,uint8 level,bytes32 sourceRef,uint256 destinationChainId,uint256 deadline)'),
);

function buildUpgradeQuoteHash({ owner, tokenId, newLevel, paymentToken, priceUnits, nonce, deadline }) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint8' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'uint256' },
      ],
      [
        UPGRADE_QUOTE_TYPEHASH,
        owner,
        BigInt(tokenId),
        newLevel,
        paymentToken,
        BigInt(priceUnits),
        nonce,
        BigInt(deadline),
      ],
    ),
  );
}

function buildBridgeReceiptHash({ to, level, sourceRef, deadline }) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint8' },
        { type: 'bytes32' },
        { type: 'uint256' },
      ],
      [BRIDGE_RECEIPT_TYPEHASH, to, level, sourceRef, BigInt(deadline)],
    ),
  );
}

describe('V2 → V3 fork upgrade on Base mainnet', { concurrency: false }, () => {
  let conn;
  let publicClient;
  let walletClient;
  let testClient;
  let ownerClient;
  let tok1OwnerClient;
  let preTotalMinted;
  let preToken1Owner;
  let preToken43Owner;
  let chainId;     // resolved at runtime — may be 8453 (real Base) or 31337 (default Hardhat)

  before(async () => {
    loadArtifact();
    conn = await network.connect();   // single connection reused across tests
    publicClient = await conn.viem.getPublicClient();
    testClient = await conn.viem.getTestClient();
    walletClient = await conn.viem.getWalletClients().then((w) => w[0]);
    chainId = await publicClient.getChainId();
    console.log('    Fork chain id:', chainId);

    // ---- Snapshot pre-state of the live V2 proxy ----
    const v2Abi = [
      { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
      { name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
      { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 't', type: 'uint256' }], outputs: [{ type: 'address' }] },
    ];
    const ownerAddr = await publicClient.readContract({ address: PROXY, abi: v2Abi, functionName: 'owner' });
    preTotalMinted = await publicClient.readContract({ address: PROXY, abi: v2Abi, functionName: 'totalMinted' });
    assert.equal(getAddress(ownerAddr), getAddress(OWNER), 'V2 proxy owner mismatch — wrong fork or stale state');
    assert.ok(preTotalMinted >= 1n, 'expected at least 1 NFT minted before upgrade');
    preToken1Owner = await publicClient.readContract({ address: PROXY, abi: v2Abi, functionName: 'ownerOf', args: [1n] });
    if (preTotalMinted >= 43n) {
      preToken43Owner = await publicClient.readContract({ address: PROXY, abi: v2Abi, functionName: 'ownerOf', args: [43n] });
    }

    // ---- Fund + impersonate the proxy owner ----
    await testClient.setBalance({ address: OWNER, value: parseEther('1000') });
    await testClient.impersonateAccount({ address: OWNER });
    ownerClient = await conn.viem.getWalletClient(OWNER);
  });

  it('1. deploys V3 implementation', async () => {
    const hash = await ownerClient.deployContract({
      abi: v3Abi,
      bytecode: v3Bytecode,
      args: [],
      gas: 10_000_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.ok(receipt.contractAddress, 'no contract address');
    globalThis.__v3Impl = receipt.contractAddress;
    console.log('    V3 impl deployed:', receipt.contractAddress);
  });

  it('1b. ensures contract is unpaused (fork block may have it paused)', async () => {
    const v2Abi = [
      { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
      { name: 'unpause', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
    ];
    const isPaused = await publicClient.readContract({ address: PROXY, abi: v2Abi, functionName: 'paused' });
    if (isPaused) {
      const hash = await ownerClient.writeContract({ address: PROXY, abi: v2Abi, functionName: 'unpause' });
      await publicClient.waitForTransactionReceipt({ hash });
    }
  });

  it('2. upgrades proxy (auto-detect: fresh V3 init OR rev-upgrade existing V3)', async () => {
    // V2 → V3 first-time: upgradeToAndCall(newImpl, reinitializeV3(...))
    // V3 → V3' (this branch): upgradeTo(newImpl)         — no reinit, just impl swap
    //
    // Detection: if `quoteSigner()` already returns a non-zero address, the
    // proxy is already V3-initialized; skip reinit and just rev the impl.
    let alreadyV3 = false;
    try {
      const sig = await publicClient.readContract({
        address: PROXY, abi: v3Abi, functionName: 'quoteSigner',
      });
      alreadyV3 = /^0x[0-9a-fA-F]{40}$/.test(sig) && sig !== '0x0000000000000000000000000000000000000000';
    } catch { /* V2 proxy — quoteSigner doesn't exist */ }

    const UPGRADE_AND_CALL_ABI = [{
      type: 'function', name: 'upgradeToAndCall', stateMutability: 'payable',
      inputs: [{ name: 'newImpl', type: 'address' }, { name: 'data', type: 'bytes' }], outputs: [],
    }];

    if (alreadyV3) {
      // Just swap the implementation, no re-init.
      const hash = await ownerClient.writeContract({
        address: PROXY, abi: UPGRADE_AND_CALL_ABI, functionName: 'upgradeToAndCall',
        args: [globalThis.__v3Impl, '0x'], gas: 1_000_000n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, 'success', 'upgradeTo reverted');
      console.log('    Rev-upgrade tx ok (no reinit), gas used:', receipt.gasUsed);
      // Re-point quoteSigner to test key so signatures verify in later steps.
      await ownerClient.writeContract({
        address: PROXY, abi: v3Abi, functionName: 'setQuoteSigner',
        args: [testSigner.address],
      });
    } else {
      const initData = encodeFunctionData({
        abi: v3Abi,
        functionName: 'reinitializeV3',
        args: [testSigner.address, BASE_USDC, zeroAddress, ROYALTY_RECEIVER, 250, EIP712_NAME, EIP712_VERSION],
      });
      const hash = await ownerClient.writeContract({
        address: PROXY, abi: UPGRADE_AND_CALL_ABI, functionName: 'upgradeToAndCall',
        args: [globalThis.__v3Impl, initData], gas: 2_000_000n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, 'success', 'upgradeToAndCall reverted');
      console.log('    First-time V3 init ok, gas used:', receipt.gasUsed);
    }
  });

  it('3. all V2 state preserved after upgrade', async () => {
    const totalMinted = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'totalMinted' });
    assert.equal(totalMinted, preTotalMinted, 'totalMinted changed after upgrade');

    const owner1 = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'ownerOf', args: [1n] });
    assert.equal(getAddress(owner1), getAddress(preToken1Owner), 'token #1 owner changed');

    if (preToken43Owner) {
      const owner43 = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'ownerOf', args: [43n] });
      assert.equal(getAddress(owner43), getAddress(preToken43Owner), 'token #43 owner changed');
    }
  });

  it('4. tokenLevel returns 1 for every pre-existing NFT (implicit L1)', async () => {
    for (let i = 1n; i <= preTotalMinted; i++) {
      const level = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'tokenLevel', args: [i] });
      assert.equal(level, 1, `tokenLevel(${i}) should be 1, got ${level}`);
    }
  });

  it('5. V3 reinit fields set correctly', async () => {
    const signer = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'quoteSigner' });
    assert.equal(getAddress(signer), getAddress(testSigner.address));
    const usdc = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'usdcToken' });
    assert.equal(getAddress(usdc), getAddress(BASE_USDC));
    const royaltyTo = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'royaltyReceiver' });
    assert.equal(getAddress(royaltyTo), getAddress(ROYALTY_RECEIVER));
    const royaltyBps = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'royaltyBps' });
    assert.equal(royaltyBps, 250);
  });

  it('6. reinitializeV3 is one-shot (replay reverts)', async () => {
    await assert.rejects(
      ownerClient.writeContract({
        address: PROXY,
        abi: v3Abi,
        functionName: 'reinitializeV3',
        args: [
          testSigner.address,
          BASE_USDC,
          zeroAddress,
          ROYALTY_RECEIVER,
          250,
          EIP712_NAME,
          EIP712_VERSION,
        ],
      }),
    );
  });

  it('7. royaltyInfo (EIP-2981) returns 2.5% to treasury', async () => {
    const [receiver, amount] = await publicClient.readContract({
      address: PROXY, abi: v3Abi, functionName: 'royaltyInfo',
      args: [1n, parseEther('1')],
    });
    assert.equal(getAddress(receiver), getAddress(ROYALTY_RECEIVER));
    assert.equal(amount, parseEther('1') * 250n / 10000n);
  });

  it('8. upgradeToken (ETH path) — owner of token #1 can upgrade to L2', async () => {
    // Impersonate the real owner of token #1.
    const tok1Owner = getAddress(preToken1Owner);
    await testClient.setBalance({ address: tok1Owner, value: parseEther('10') });
    await testClient.impersonateAccount({ address: tok1Owner });
    tok1OwnerClient = await conn.viem.getWalletClient(tok1Owner);

    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 600n;
    const nonce = keccak256(Buffer.from('upgrade-quote-test-1'));
    const priceUnits = parseEther('0.003');     // arbitrary test price in ETH

    const digest = hashTypedData({
      domain: { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: PROXY },
      types: {
        UpgradeQuote: [
          { name: 'owner', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'newLevel', type: 'uint8' },
          { name: 'paymentToken', type: 'address' },
          { name: 'priceUnits', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'UpgradeQuote',
      message: {
        owner: tok1Owner,
        tokenId: 1n,
        newLevel: 2,
        paymentToken: zeroAddress,
        priceUnits,
        nonce,
        deadline,
      },
    });
    const sig = await testSigner.sign({ hash: digest });

    const hash = await tok1OwnerClient.writeContract({
      address: PROXY,
      abi: v3Abi,
      functionName: 'upgradeToken',
      args: [1n, 2, zeroAddress, priceUnits, nonce, deadline, sig],
      value: priceUnits,
      gas: 300_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success', 'upgradeToken reverted');

    const newLevel = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'tokenLevel', args: [1n] });
    assert.equal(newLevel, 2, 'level should be 2 after upgrade');
  });

  it('9. upgradeToken nonce replay reverts', async () => {
    const tok1Owner = getAddress(preToken1Owner);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 600n;
    const nonce = keccak256(Buffer.from('upgrade-quote-test-1')); // SAME nonce as step 8
    // After step 8, token #1 is now L2, so to keep `newLevel == current + 1`
    // we sign for L2→L3 — but with the already-used nonce. The contract should
    // reject on the nonce check before even checking level.
    const priceUnits = parseEther('0.003');

    const digest = hashTypedData({
      domain: { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: PROXY },
      types: {
        UpgradeQuote: [
          { name: 'owner', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'newLevel', type: 'uint8' },
          { name: 'paymentToken', type: 'address' },
          { name: 'priceUnits', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'UpgradeQuote',
      message: { owner: tok1Owner, tokenId: 1n, newLevel: 3, paymentToken: zeroAddress, priceUnits, nonce, deadline },
    });
    const sig = await testSigner.sign({ hash: digest });

    await assert.rejects(
      tok1OwnerClient.writeContract({
        address: PROXY, abi: v3Abi, functionName: 'upgradeToken',
        args: [1n, 3, zeroAddress, priceUnits, nonce, deadline, sig], value: priceUnits,
        gas: 300_000n,
      }),
      /Nonce used/,
    );
  });

  it('10. bridgeMint with server-signed receipt creates a new L2 token', async () => {
    // Ensure cap allows. Bump maxSupply if needed.
    const maxSupply = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'maxSupply' });
    const totalMinted = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'totalMinted' });
    if (totalMinted + 1n > maxSupply) {
      await ownerClient.writeContract({
        address: PROXY, abi: v3Abi, functionName: 'setMaxSupply', args: [maxSupply + 100n],
      });
    }

    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 86400n;
    // Simulate a burn on Arbitrum tokenId 7 → sourceRef:
    const sourceRef = keccak256(
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
        ['EVM', 42161n, '0x5cc846b2ba0f030a5165a456ed903a5989e19f3f', 7n],
      ),
    );
    const recipient = getAddress('0x000000000000000000000000000000000000beef');

    const digest = hashTypedData({
      domain: { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: PROXY },
      types: {
        BridgeReceipt: [
          { name: 'to', type: 'address' },
          { name: 'level', type: 'uint8' },
          { name: 'sourceRef', type: 'bytes32' },
          { name: 'destinationChainId', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'BridgeReceipt',
      message: { to: recipient, level: 2, sourceRef, destinationChainId: BigInt(chainId), deadline },
    });
    const sig = await testSigner.sign({ hash: digest });

    const before = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'totalMinted' });
    const hash = await ownerClient.writeContract({
      address: PROXY, abi: v3Abi, functionName: 'bridgeMint',
      args: [recipient, 2, sourceRef, deadline, sig], gas: 400_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    const after = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'totalMinted' });
    assert.equal(after, before + 1n);
    const newId = after;
    const newOwner = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'ownerOf', args: [newId] });
    assert.equal(getAddress(newOwner), getAddress(recipient));
    const level = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'tokenLevel', args: [newId] });
    assert.equal(level, 2);
  });

  it('11. bridgeMint replay (same sourceRef) reverts', async () => {
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 86400n;
    const sourceRef = keccak256(
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
        ['EVM', 42161n, '0x5cc846b2ba0f030a5165a456ed903a5989e19f3f', 7n],
      ),
    );
    const recipient = getAddress('0x000000000000000000000000000000000000beef');
    const digest = hashTypedData({
      domain: { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: PROXY },
      types: {
        BridgeReceipt: [
          { name: 'to', type: 'address' },
          { name: 'level', type: 'uint8' },
          { name: 'sourceRef', type: 'bytes32' },
          { name: 'destinationChainId', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'BridgeReceipt',
      message: { to: recipient, level: 2, sourceRef, destinationChainId: BigInt(chainId), deadline },
    });
    const sig = await testSigner.sign({ hash: digest });

    await assert.rejects(
      ownerClient.writeContract({
        address: PROXY, abi: v3Abi, functionName: 'bridgeMint',
        args: [recipient, 2, sourceRef, deadline, sig], gas: 400_000n,
      }),
      /Already bridged/,
    );
  });

  it('12. bridgeBurn full mesh — destinationChainId required + same-chain rejected', async () => {
    // V3 bridge is now bidirectional (full mesh). bridgeBurn takes an
    // explicit destination chainId; same-chain bridges are rejected.
    // On the fork (chainid 31337), any destination != 31337 should succeed.
    const tokenIdToBurn = preTotalMinted; // burn the last legacy token
    const ownerOfLast = await publicClient.readContract({
      address: PROXY, abi: v3Abi, functionName: 'ownerOf', args: [tokenIdToBurn],
    });
    await testClient.setBalance({ address: ownerOfLast, value: parseEther('10') });
    await testClient.impersonateAccount({ address: ownerOfLast });
    const ownerLastClient = await conn.viem.getWalletClient(getAddress(ownerOfLast));

    // Same-chain bridge attempt → reverts.
    await assert.rejects(
      ownerLastClient.writeContract({
        address: PROXY, abi: v3Abi, functionName: 'bridgeBurn',
        args: [tokenIdToBurn, BigInt(chainId)], gas: 300_000n,
      }),
      /Same-chain bridge/,
    );

    // Cross-chain burn (destination Arbitrum) → succeeds.
    const hash = await ownerLastClient.writeContract({
      address: PROXY, abi: v3Abi, functionName: 'bridgeBurn',
      args: [tokenIdToBurn, 42161n], gas: 300_000n,
    });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(r.status, 'success', 'bridgeBurn should succeed for cross-chain destination');
    await assert.rejects(
      publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'ownerOf', args: [tokenIdToBurn] }),
    );
  });

  it('13. supportsInterface advertises ERC-2981 and ERC-4906', async () => {
    const ERC721 = '0x80ac58cd';
    const ERC2981 = '0x2a55205a';
    const ERC4906 = '0x49064906';
    const ERC165 = '0x01ffc9a7';
    const FAKE = '0xdeadbeef';
    const r721 = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'supportsInterface', args: [ERC721] });
    const r2981 = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'supportsInterface', args: [ERC2981] });
    const r4906 = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'supportsInterface', args: [ERC4906] });
    const r165 = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'supportsInterface', args: [ERC165] });
    const rFake = await publicClient.readContract({ address: PROXY, abi: v3Abi, functionName: 'supportsInterface', args: [FAKE] });
    console.log('    supportsInterface: ERC721=' + r721 + ' ERC2981=' + r2981 + ' ERC4906=' + r4906 + ' ERC165=' + r165 + ' FAKE=' + rFake);
    assert.equal(r721, true, 'should support ERC721');
    assert.equal(r2981, true, 'should support ERC2981');
    assert.equal(r4906, true, 'should support ERC4906');
    assert.equal(r165, true, 'should support ERC165');
    assert.equal(rFake, false, 'should NOT support random interface');
  });
});
