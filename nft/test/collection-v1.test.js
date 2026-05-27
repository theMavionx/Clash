// Unit tests for the configurable collection contracts used by new NFT drops.

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

function load(name) {
  const p = path.resolve(__dirname, '..', 'artifacts-hh', 'contracts', `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const nftArtifact = load('ClashCollectionNftV1');
const shopArtifact = load('ClashCollectionShopV1');
const proxyArtifact = load('DemonKingProxy');

const SIGNER = privateKeyToAccount(keccak256(Buffer.from('clash-collection-v1-test-signer')));
const TREASURY = '0xC024884ad9C5540996492Cc2DD080964941A3094';
const NFT_EIP712_NAME = 'ClashCollection:test:base';
const SHOP_EIP712_NAME = 'ClashCollectionShop:test:base';
const EIP712_VERSION = '1';

describe('ClashCollectionNftV1', { concurrency: false }, () => {
  let publicClient;
  let owner;
  let holder;
  let recipient;
  let nft;
  let chainId;

  before(async () => {
    const conn = await network.connect();
    publicClient = await conn.viem.getPublicClient();
    const wallets = await conn.viem.getWalletClients();
    owner = wallets[0];
    holder = wallets[1];
    recipient = wallets[2];
    chainId = await publicClient.getChainId();

    const implHash = await owner.deployContract({ abi: nftArtifact.abi, bytecode: nftArtifact.bytecode });
    const impl = (await publicClient.waitForTransactionReceipt({ hash: implHash })).contractAddress;
    const initData = encodeFunctionData({
      abi: nftArtifact.abi,
      functionName: 'initialize',
      args: [
        'New Clash NFT',
        'NCN',
        owner.account.address,
        'https://example.test/api/nft/new/base/',
        'https://example.test/api/nft/new/base/contract',
        1n,
        10n,
        0n,
        SIGNER.address,
        zeroAddress,
        zeroAddress,
        getAddress(TREASURY),
        250,
        NFT_EIP712_NAME,
        EIP712_VERSION,
      ],
    });
    const proxyHash = await owner.deployContract({
      abi: proxyArtifact.abi,
      bytecode: proxyArtifact.bytecode,
      args: [impl, initData],
    });
    nft = (await publicClient.waitForTransactionReceipt({ hash: proxyHash })).contractAddress;
    await owner.writeContract({ address: nft, abi: nftArtifact.abi, functionName: 'unpause' });
  });

  it('mints with configurable metadata and defaults to level 1', async () => {
    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'name' }), 'New Clash NFT');
    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'symbol' }), 'NCN');

    await owner.writeContract({
      address: nft,
      abi: nftArtifact.abi,
      functionName: 'adminMint',
      args: [holder.account.address, 1n],
    });

    assert.equal(
      getAddress(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'ownerOf', args: [1n] })),
      getAddress(holder.account.address),
    );
    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'tokenLevel', args: [1n] }), 1);
    assert.equal(
      await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'tokenURI', args: [1n] }),
      'https://example.test/api/nft/new/base/1',
    );
  });

  it('enforces sale/admin cap but lets bridge mints exceed local cap', async () => {
    await assert.rejects(
      owner.writeContract({
        address: nft,
        abi: nftArtifact.abi,
        functionName: 'adminMint',
        args: [holder.account.address, 1n],
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
        name: NFT_EIP712_NAME,
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
    const signature = await SIGNER.sign({ hash: digest });

    await owner.writeContract({
      address: nft,
      abi: nftArtifact.abi,
      functionName: 'bridgeMint',
      args: [recipient.account.address, 3, sourceRef, deadline, signature],
    });

    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'maxSupply' }), 1n);
    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'totalMinted' }), 2n);
    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'tokenLevel', args: [2n] }), 3);
  });

  it('upgrades with a signed quote and decrements current supply on bridge burn', async () => {
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 3600n;
    const nonce = keccak256(Buffer.from('upgrade-token-1'));
    const digest = hashTypedData({
      domain: {
        name: NFT_EIP712_NAME,
        version: EIP712_VERSION,
        chainId,
        verifyingContract: nft,
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
        owner: holder.account.address,
        tokenId: 1n,
        newLevel: 2,
        paymentToken: zeroAddress,
        priceUnits: 0n,
        nonce,
        deadline,
      },
    });
    const signature = await SIGNER.sign({ hash: digest });

    await holder.writeContract({
      address: nft,
      abi: nftArtifact.abi,
      functionName: 'upgradeToken',
      args: [1n, 2, zeroAddress, 0n, nonce, deadline, signature],
    });
    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'tokenLevel', args: [1n] }), 2);

    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'currentSupply' }), 2n);
    await holder.writeContract({
      address: nft,
      abi: nftArtifact.abi,
      functionName: 'bridgeBurn',
      args: [1n, 42161n],
    });
    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'currentSupply' }), 1n);
  });
});

describe('ClashCollectionShopV1', { concurrency: false }, () => {
  let publicClient;
  let owner;
  let buyer;
  let nft;
  let shop;
  let chainId;

  before(async () => {
    const conn = await network.connect();
    publicClient = await conn.viem.getPublicClient();
    const wallets = await conn.viem.getWalletClients();
    owner = wallets[0];
    buyer = wallets[1];
    chainId = await publicClient.getChainId();

    const nftImplHash = await owner.deployContract({ abi: nftArtifact.abi, bytecode: nftArtifact.bytecode });
    const nftImpl = (await publicClient.waitForTransactionReceipt({ hash: nftImplHash })).contractAddress;
    const nftInit = encodeFunctionData({
      abi: nftArtifact.abi,
      functionName: 'initialize',
      args: [
        'New Clash NFT',
        'NCN',
        owner.account.address,
        'https://example.test/api/nft/new/base/',
        'https://example.test/api/nft/new/base/contract',
        555n,
        10n,
        0n,
        SIGNER.address,
        zeroAddress,
        zeroAddress,
        getAddress(TREASURY),
        250,
        NFT_EIP712_NAME,
        EIP712_VERSION,
      ],
    });
    const nftProxyHash = await owner.deployContract({
      abi: proxyArtifact.abi,
      bytecode: proxyArtifact.bytecode,
      args: [nftImpl, nftInit],
    });
    nft = (await publicClient.waitForTransactionReceipt({ hash: nftProxyHash })).contractAddress;

    const shopImplHash = await owner.deployContract({ abi: shopArtifact.abi, bytecode: shopArtifact.bytecode });
    const shopImpl = (await publicClient.waitForTransactionReceipt({ hash: shopImplHash })).contractAddress;
    const shopInit = encodeFunctionData({
      abi: shopArtifact.abi,
      functionName: 'initialize',
      args: [
        owner.account.address,
        nft,
        SIGNER.address,
        zeroAddress,
        zeroAddress,
        8_900_000n,
        5_000_000n,
        SHOP_EIP712_NAME,
        EIP712_VERSION,
      ],
    });
    const shopProxyHash = await owner.deployContract({
      abi: proxyArtifact.abi,
      bytecode: proxyArtifact.bytecode,
      args: [shopImpl, shopInit],
    });
    shop = (await publicClient.waitForTransactionReceipt({ hash: shopProxyHash })).contractAddress;
    await owner.writeContract({ address: nft, abi: nftArtifact.abi, functionName: 'setAuthorizedMinter', args: [shop, true] });
    await owner.writeContract({ address: shop, abi: shopArtifact.abi, functionName: 'setSaleActive', args: [true] });
  });

  it('mints through a server-signed quote', async () => {
    const block = await publicClient.getBlock();
    const quote = {
      buyer: buyer.account.address,
      paymentToken: zeroAddress,
      unitPrice: 0n,
      quantity: 2n,
      usdPriceE6: 8_900_000n,
      nonce: 1n,
      deadline: block.timestamp + 3600n,
    };
    const digest = hashTypedData({
      domain: {
        name: SHOP_EIP712_NAME,
        version: EIP712_VERSION,
        chainId,
        verifyingContract: shop,
      },
      types: {
        MintQuote: [
          { name: 'buyer', type: 'address' },
          { name: 'paymentToken', type: 'address' },
          { name: 'unitPrice', type: 'uint256' },
          { name: 'quantity', type: 'uint256' },
          { name: 'usdPriceE6', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'MintQuote',
      message: quote,
    });
    const signature = await SIGNER.sign({ hash: digest });

    await buyer.writeContract({
      address: shop,
      abi: shopArtifact.abi,
      functionName: 'mintWithQuote',
      args: [quote, signature],
    });

    assert.equal(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'totalMinted' }), 2n);
    assert.equal(
      getAddress(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'ownerOf', args: [1n] })),
      getAddress(buyer.account.address),
    );
    assert.equal(
      getAddress(await publicClient.readContract({ address: nft, abi: nftArtifact.abi, functionName: 'ownerOf', args: [2n] })),
      getAddress(buyer.account.address),
    );
  });
});
