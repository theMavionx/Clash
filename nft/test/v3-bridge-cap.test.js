// V3 bridge cap regression test.
//
// Local maxSupply must gate primary sale/admin mints, but bridgeMint must
// still work after that local cap is full so Base can act as the marketplace
// hub for NFTs bridged in from the rest of the mesh.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { network } from 'hardhat';
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  keccak256,
  zeroAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EIP712_NAME = 'DemonKingBase';
const EIP712_VERSION = '3';
const TEST_SIGNER = privateKeyToAccount(keccak256(Buffer.from('clash-v3-bridge-cap-test-signer')));
const TREASURY = '0xC024884ad9C5540996492Cc2DD080964941A3094';

function load(name) {
  const p = path.resolve(__dirname, '..', 'artifacts-hh', 'contracts', `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const v3 = load('DemonKingBaseV3');
const proxy = load('DemonKingProxy');

describe('DemonKingBaseV3 bridge cap', { concurrency: false }, () => {
  let publicClient;
  let owner;
  let recipient;
  let nft;
  let chainId;

  before(async () => {
    const conn = await network.connect();
    publicClient = await conn.viem.getPublicClient();
    const wallets = await conn.viem.getWalletClients();
    owner = wallets[0];
    recipient = wallets[1];
    chainId = await publicClient.getChainId();

    const implHash = await owner.deployContract({ abi: v3.abi, bytecode: v3.bytecode });
    const impl = (await publicClient.waitForTransactionReceipt({ hash: implHash })).contractAddress;
    const initData = encodeFunctionData({
      abi: v3.abi,
      functionName: 'initializeV3Fresh',
      args: [
        owner.account.address,
        'https://example/',
        'https://example/contract',
        1n,
        10n,
        0n,
        TEST_SIGNER.address,
        zeroAddress,
        zeroAddress,
        getAddress(TREASURY),
        250,
        EIP712_NAME,
        EIP712_VERSION,
      ],
    });
    const proxyHash = await owner.deployContract({
      abi: proxy.abi,
      bytecode: proxy.bytecode,
      args: [impl, initData],
    });
    nft = (await publicClient.waitForTransactionReceipt({ hash: proxyHash })).contractAddress;
    await owner.writeContract({ address: nft, abi: v3.abi, functionName: 'unpause' });
  });

  it('bridgeMint can exceed local maxSupply after adminMint cap is full', async () => {
    await owner.writeContract({
      address: nft,
      abi: v3.abi,
      functionName: 'adminMint',
      args: [owner.account.address, 1n],
    });
    assert.equal(
      await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'totalMinted' }),
      1n,
    );

    await assert.rejects(
      owner.writeContract({
        address: nft,
        abi: v3.abi,
        functionName: 'adminMint',
        args: [owner.account.address, 1n],
      }),
      /Sold out/,
    );

    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 3600n;
    const sourceRef = keccak256(
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
        ['EVM', 42161n, '0x5cc846b2ba0f030a5165a456ed903a5989e19f3f', 999n],
      ),
    );
    const digest = hashTypedData({
      domain: {
        name: EIP712_NAME,
        version: EIP712_VERSION,
        chainId,
        verifyingContract: nft,
      },
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
      message: {
        to: recipient.account.address,
        level: 3,
        sourceRef,
        destinationChainId: BigInt(chainId),
        deadline,
      },
    });
    const signature = await TEST_SIGNER.sign({ hash: digest });

    const hash = await owner.writeContract({
      address: nft,
      abi: v3.abi,
      functionName: 'bridgeMint',
      args: [recipient.account.address, 3, sourceRef, deadline, signature],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    assert.equal(
      await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'maxSupply' }),
      1n,
    );
    assert.equal(
      await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'totalMinted' }),
      2n,
    );
    assert.equal(
      getAddress(await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'ownerOf', args: [2n] })),
      getAddress(recipient.account.address),
    );
    assert.equal(
      await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'tokenLevel', args: [2n] }),
      3,
    );
  });
});
