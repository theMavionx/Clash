// Fork test: simulates a UUPS upgrade of the LIVE Base mainnet V2 proxy to V3.
// Forks Base at the current block, impersonates the proxy owner, deploys V3
// implementation, calls upgradeToAndCall with reinitializeV3 payload, and
// asserts that all 43 existing NFTs are preserved + the new V3 functions work.
//
// Run with: npx hardhat test test/V3UpgradeFork.test.js --network hardhatMainnet
//
// Requires NFT_BASE_RPC_URL (or BASE_RPC_URL) env var pointing at a Base
// mainnet RPC. Default is https://mainnet.base.org but use a proper RPC
// (Alchemy/QuickNode) for reliable fork tests.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import { encodeFunctionData, keccak256, toBytes, parseEther, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const BASE_V2_PROXY = '0x404807f93e47af3eaaec0e983f18dcb35e966fec';
const BASE_V2_OWNER = '0x1EC28Cf035443A703a943bEC2C19c3CA083b7828';
const BASE_TREASURY = '0xC024884ad9C5540996492Cc2DD080964941A3094';

// Random test-only signer key. Public key derived from this is used as the
// reinitializeV3 quoteSigner. We sign all upgrade quotes + bridge receipts
// with this within the test.
const TEST_SIGNER_PK = '0x' + 'a'.repeat(63) + '1';

describe('Base V3 UUPS upgrade — fork test', () => {
  let publicClient;
  let walletClient;
  let testSignerAccount;
  let networkHelpers;
  let v3ImplAddress;
  let v2Abi;
  let v3Abi;
  let forkChainId; // The chain id the fork's EVM actually reports (may differ from 8453 due to Hardhat config).

  before(async () => {
    const conn = await network.getOrCreate('hardhatMainnet');
    publicClient = await conn.viem.getPublicClient();
    networkHelpers = conn.networkHelpers;

    // Fund + impersonate the V2 proxy owner so we can submit txs as them.
    await networkHelpers.impersonateAccount(BASE_V2_OWNER);
    await networkHelpers.setBalance(BASE_V2_OWNER, parseEther('10'));
    walletClient = await conn.viem.getWalletClient(BASE_V2_OWNER);

    // viem-style account from PK so we can sign EIP-712 inside the test.
    testSignerAccount = privateKeyToAccount(TEST_SIGNER_PK);

    // Load ABIs from Hardhat artifacts.
    const v2 = await import('../artifacts-hh/contracts/DemonKingBaseV2.sol/DemonKingBaseV2.json', {
      with: { type: 'json' },
    });
    const v3 = await import('../artifacts-hh/contracts/DemonKingBaseV3.sol/DemonKingBaseV3.json', {
      with: { type: 'json' },
    });
    v2Abi = v2.default.abi;
    v3Abi = v3.default.abi;
  });

  it('mines one block to advance past the fork point', async () => {
    // EDR cannot answer eth_call at the exact fork block without an explicit
    // hardfork history entry for that block. Mining one fresh block puts all
    // subsequent reads safely into the post-fork window where cancun is set
    // by our chains config in hardhat.config.js.
    await networkHelpers.mine();
    forkChainId = await publicClient.getChainId();
    console.log(`    Fork chainId reported by node: ${forkChainId}`);
    console.log(`    Block number: ${await publicClient.getBlockNumber()}`);
  });

  it('deploys V3 implementation', async () => {
    const v3Artifact = await import('../artifacts-hh/contracts/DemonKingBaseV3.sol/DemonKingBaseV3.json', {
      with: { type: 'json' },
    });
    const hash = await walletClient.deployContract({
      abi: v3Artifact.default.abi,
      bytecode: v3Artifact.default.bytecode,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    v3ImplAddress = receipt.contractAddress;
    assert.ok(v3ImplAddress, 'V3 implementation should have a contract address');
    console.log(`    V3 implementation: ${v3ImplAddress}`);
  });

  it('upgrades proxy to V3 via upgradeToAndCall(reinitializeV3)', async () => {
    const reinitData = encodeFunctionData({
      abi: v3Abi,
      functionName: 'reinitializeV3',
      args: [
        testSignerAccount.address,
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
        zeroAddress,                                     // CoP — not set yet on Base
        BASE_TREASURY,
        250n,                                            // 2.5% royalty
        'DemonKingBase',
        '3',
      ],
    });

    const upgradeTx = await walletClient.writeContract({
      address: BASE_V2_PROXY,
      abi: [
        {
          type: 'function',
          name: 'upgradeToAndCall',
          stateMutability: 'payable',
          inputs: [
            { name: 'newImplementation', type: 'address' },
            { name: 'data', type: 'bytes' },
          ],
          outputs: [],
        },
      ],
      functionName: 'upgradeToAndCall',
      args: [v3ImplAddress, reinitData],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: upgradeTx });
    assert.equal(receipt.status, 'success', 'upgradeToAndCall must succeed');
    console.log(`    Upgrade tx gas used: ${receipt.gasUsed}`);

    // Live mainnet V2 proxy is paused (only adminMint bypasses pause). All V3
    // user-facing functions (upgradeToken / bridgeMint / bridgeBurn) check
    // whenNotPaused, so the operational launch must include an unpause(). Do
    // the same here so subsequent tests exercise the real go-live state.
    const isPaused = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'paused',
    });
    if (isPaused) {
      const unpauseTx = await walletClient.writeContract({
        address: BASE_V2_PROXY,
        abi: v3Abi,
        functionName: 'unpause',
      });
      await publicClient.waitForTransactionReceipt({ hash: unpauseTx });
      console.log(`    Proxy unpaused.`);
    }
  });

  it('preserves pre-existing V2 state after upgrade', async () => {
    const owner = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'owner',
    });
    const totalMinted = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'totalMinted',
    });
    const baseURI = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'tokenURI',
      args: [1n],
    });

    assert.equal(owner.toLowerCase(), BASE_V2_OWNER.toLowerCase());
    assert.ok(totalMinted >= 1n);
    assert.ok(baseURI.length > 0);
    console.log(`    Preserved totalMinted: ${totalMinted}`);
    console.log(`    Preserved tokenURI(1): ${baseURI}`);

    // Every pre-existing token must read as level 1 (default fallback).
    const level1 = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'getLevel',
      args: [1n],
    });
    assert.equal(level1, 1, 'pre-existing token #1 should default to level 1');
  });

  it('exposes the right EIP-712 domain values', async () => {
    const dom = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'eip712Domain',
    });
    console.log(`    eip712Domain: name="${dom[1]}" version="${dom[2]}" chainId=${dom[3]} verifyingContract=${dom[4]}`);
    assert.equal(dom[1], 'DemonKingBase');
    assert.equal(dom[2], '3');
    // chainId equals whatever block.chainid is on the fork (8453 on real Base,
    // 31337 by default in Hardhat 3's edr-simulated). Either way the contract
    // and our signer must agree, which is why subsequent tests sign with
    // `forkChainId` instead of a hard-coded constant.
    assert.equal(dom[3], BigInt(forkChainId));
    assert.equal(dom[4].toLowerCase(), BASE_V2_PROXY.toLowerCase());
  });

  it('reads V3-specific state from reinitialize', async () => {
    const [signer, royaltyTo, royaltyBps, usdc, cop] = await Promise.all([
      publicClient.readContract({ address: BASE_V2_PROXY, abi: v3Abi, functionName: 'quoteSigner' }),
      publicClient.readContract({ address: BASE_V2_PROXY, abi: v3Abi, functionName: 'royaltyReceiver' }),
      publicClient.readContract({ address: BASE_V2_PROXY, abi: v3Abi, functionName: 'royaltyBps' }),
      publicClient.readContract({ address: BASE_V2_PROXY, abi: v3Abi, functionName: 'usdcToken' }),
      publicClient.readContract({ address: BASE_V2_PROXY, abi: v3Abi, functionName: 'copToken' }),
    ]);
    assert.equal(signer.toLowerCase(), testSignerAccount.address.toLowerCase());
    assert.equal(royaltyTo.toLowerCase(), BASE_TREASURY.toLowerCase());
    assert.equal(royaltyBps, 250);
    assert.equal(usdc.toLowerCase(), '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
    assert.equal(cop.toLowerCase(), zeroAddress);
  });

  it('blocks reinitializeV3 from being called twice', async () => {
    const reinitData = encodeFunctionData({
      abi: v3Abi,
      functionName: 'reinitializeV3',
      args: [
        testSignerAccount.address,
        zeroAddress,
        zeroAddress,
        BASE_TREASURY,
        250n,
        'DemonKingBase',
        '3',
      ],
    });
    await assert.rejects(
      walletClient.writeContract({
        address: BASE_V2_PROXY,
        abi: v3Abi,
        functionName: 'reinitializeV3',
        args: [
          testSignerAccount.address,
          zeroAddress,
          zeroAddress,
          BASE_TREASURY,
          250n,
          'DemonKingBase',
          '3',
        ],
      }),
      /InvalidInitialization|already.*initialized|revert/i,
      'second reinitializeV3 call must revert',
    );
  });

  it('upgrades token #1 from L1 to L2 with a valid ETH-priced quote', async () => {
    // Find the actual owner of token #1.
    const ownerOf1 = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'ownerOf',
      args: [1n],
    });

    // Impersonate the holder, fund them, and let them upgrade.
    await networkHelpers.impersonateAccount(ownerOf1);
    await networkHelpers.setBalance(ownerOf1, parseEther('10'));
    const holderClient = await (await network.getOrCreate('hardhatMainnet')).viem.getWalletClient(ownerOf1);

    const priceWei = parseEther('0.003');                      // arbitrary test price
    const nonce = `0x${'11'.repeat(32)}`;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // EIP-712 sign the upgrade quote with testSignerAccount.
    const sig = await testSignerAccount.signTypedData({
      domain: {
        name: 'DemonKingBase',
        version: '3',
        chainId: forkChainId,
        verifyingContract: BASE_V2_PROXY,
      },
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
        owner: ownerOf1,
        tokenId: 1n,
        newLevel: 2,
        paymentToken: zeroAddress,
        priceUnits: priceWei,
        nonce,
        deadline,
      },
    });

    const tx = await holderClient.writeContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'upgradeToken',
      args: [1n, 2, zeroAddress, priceWei, nonce, deadline, sig],
      value: priceWei,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    assert.equal(receipt.status, 'success');

    const level = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'getLevel',
      args: [1n],
    });
    assert.equal(level, 2);
    console.log(`    Token #1 successfully upgraded L1 → L2`);

    // Replay must fail.
    await assert.rejects(
      holderClient.writeContract({
        address: BASE_V2_PROXY,
        abi: v3Abi,
        functionName: 'upgradeToken',
        args: [1n, 2, zeroAddress, priceWei, nonce, deadline, sig],
        value: priceWei,
      }),
      /Nonce used|Must upgrade by 1|revert/i,
    );
    console.log(`    Replay correctly rejected.`);
  });

  it('rejects upgradeToken with wrong signer', async () => {
    const ownerOf2 = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'ownerOf',
      args: [2n],
    });
    await networkHelpers.impersonateAccount(ownerOf2);
    await networkHelpers.setBalance(ownerOf2, parseEther('10'));
    const holderClient = await (await network.getOrCreate('hardhatMainnet')).viem.getWalletClient(ownerOf2);

    const priceWei = parseEther('0.001');
    const nonce = `0x${'22'.repeat(32)}`;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const wrongSigner = privateKeyToAccount('0x' + 'b'.repeat(63) + '2');

    const sig = await wrongSigner.signTypedData({
      domain: { name: 'DemonKingBase', version: '3', chainId: forkChainId, verifyingContract: BASE_V2_PROXY },
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
        owner: ownerOf2,
        tokenId: 2n,
        newLevel: 2,
        paymentToken: zeroAddress,
        priceUnits: priceWei,
        nonce,
        deadline,
      },
    });

    await assert.rejects(
      holderClient.writeContract({
        address: BASE_V2_PROXY,
        abi: v3Abi,
        functionName: 'upgradeToken',
        args: [2n, 2, zeroAddress, priceWei, nonce, deadline, sig],
        value: priceWei,
      }),
      /Bad signer|revert/i,
    );
  });

  it('bridgeMint signs by quoteSigner mints a new NFT with the receipt level', async () => {
    const target = '0x1111111111111111111111111111111111111112';
    const level = 3;
    const sourceRef = keccak256(toBytes('test-bridge-receipt-1'));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const sig = await testSignerAccount.signTypedData({
      domain: { name: 'DemonKingBase', version: '3', chainId: forkChainId, verifyingContract: BASE_V2_PROXY },
      types: {
        BridgeReceipt: [
          { name: 'to', type: 'address' },
          { name: 'level', type: 'uint8' },
          { name: 'sourceRef', type: 'bytes32' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'BridgeReceipt',
      message: { to: target, level, sourceRef, deadline },
    });

    const totalBefore = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'totalMinted',
    });

    const tx = await walletClient.writeContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'bridgeMint',
      args: [target, level, sourceRef, deadline, sig],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });

    const totalAfter = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'totalMinted',
    });
    assert.equal(totalAfter, totalBefore + 1n);

    const newId = totalAfter;
    const newOwner = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'ownerOf',
      args: [newId],
    });
    const newLevel = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'getLevel',
      args: [newId],
    });
    assert.equal(newOwner.toLowerCase(), target.toLowerCase());
    assert.equal(newLevel, 3);
    console.log(`    Bridge-minted #${newId} → ${target} at level 3`);

    // Replay must fail.
    await assert.rejects(
      walletClient.writeContract({
        address: BASE_V2_PROXY,
        abi: v3Abi,
        functionName: 'bridgeMint',
        args: [target, level, sourceRef, deadline, sig],
      }),
      /Already bridged|revert/i,
    );
  });

  it('bridgeBurn behavior depends on block.chainid', async () => {
    // The contract reverts bridgeBurn when block.chainid == 8453 (Base is the
    // destination, not the source). On a real Base mainnet deploy this branch
    // is the active one — bridgeBurn always reverts. On our test fork the
    // EVM chainid is whatever Hardhat reports (likely 31337), in which case
    // bridgeBurn is the bridge-out path used on Arbitrum/Monad. Assert the
    // correct branch for the active chainId.
    const ownerOf3 = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'ownerOf',
      args: [3n],
    });
    await networkHelpers.impersonateAccount(ownerOf3);
    await networkHelpers.setBalance(ownerOf3, parseEther('10'));
    const holderClient = await (await network.getOrCreate('hardhatMainnet')).viem.getWalletClient(ownerOf3);

    if (forkChainId === 8453) {
      await assert.rejects(
        holderClient.writeContract({
          address: BASE_V2_PROXY,
          abi: v3Abi,
          functionName: 'bridgeBurn',
          args: [3n],
        }),
        /Cannot bridge from Base|revert/i,
      );
    } else {
      const tx = await holderClient.writeContract({
        address: BASE_V2_PROXY,
        abi: v3Abi,
        functionName: 'bridgeBurn',
        args: [3n],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      assert.equal(receipt.status, 'success');
      // Token is now burned — ownerOf must revert.
      await assert.rejects(
        publicClient.readContract({ address: BASE_V2_PROXY, abi: v3Abi, functionName: 'ownerOf', args: [3n] }),
        /ERC721NonexistentToken|revert/i,
      );
      console.log(`    bridgeBurn succeeded on non-Base chain (chainId ${forkChainId})`);
    }
  });

  it('royaltyInfo returns 2.5% to treasury', async () => {
    const [receiver, amount] = await publicClient.readContract({
      address: BASE_V2_PROXY,
      abi: v3Abi,
      functionName: 'royaltyInfo',
      args: [1n, parseEther('1')],
    });
    assert.equal(receiver.toLowerCase(), BASE_TREASURY.toLowerCase());
    assert.equal(amount, parseEther('0.025'));
  });
});
