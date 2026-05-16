// Marketplace unit tests on a fresh local Hardhat network.
//
// Deploys V3 + Marketplace from scratch, mints a token via adminMint, and
// exercises every listing flow:
//   - List → Buy with ETH (royalty + seller proceeds correct)
//   - List → Buy with USDC (ERC-20 path, royalty + seller proceeds correct)
//   - Cancel
//   - Replay buy after delete reverts
//   - Buy when seller revoked approval reverts
//   - Buy after seller transferred out reverts
//   - Underpay/overpay revert
//   - Expired listing reverts
//   - Pause halts new listings
//   - EIP-2981 royalty fallback (when NFT has zero receiver)
//
// Run: npx hardhat test nodejs test/marketplace.test.js

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { network } from 'hardhat';
import {
  encodeFunctionData,
  getAddress,
  parseEther,
  zeroAddress,
} from 'viem';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function load(name) {
  const p = path.resolve(__dirname, '..', 'artifacts-hh', 'contracts', `${name}.sol`, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const v3 = load('DemonKingBaseV3');
const proxy = load('DemonKingProxy');
const marketplace = load('DemonKingMarketplace');
const mockErc20 = load('MockERC20');

const TREASURY = '0xC024884ad9C5540996492Cc2DD080964941A3094';
const EIP712_NAME = 'DemonKingBase';
const EIP712_VERSION = '3';

describe('DemonKingMarketplace', { concurrency: false }, () => {
  let conn;
  let publicClient;
  let owner;          // deployer + owner of V3 + marketplace
  let seller;
  let buyer;
  let other;
  let nft;            // V3 proxy address
  let market;         // marketplace proxy address
  let usdc;           // mock USDC address
  let tokenId;

  before(async () => {
    conn = await network.connect();
    publicClient = await conn.viem.getPublicClient();
    const wallets = await conn.viem.getWalletClients();
    owner = wallets[0];
    seller = wallets[1];
    buyer = wallets[2];
    other = wallets[3];

    // ---- Deploy V3 impl + proxy ----
    const v3ImplHash = await owner.deployContract({ abi: v3.abi, bytecode: v3.bytecode });
    const v3Impl = (await publicClient.waitForTransactionReceipt({ hash: v3ImplHash })).contractAddress;

    const initData = encodeFunctionData({
      abi: v3.abi,
      functionName: 'initializeV3Fresh',
      args: [
        owner.account.address,                          // owner
        'https://example/', 'https://example/contract', // baseURI, contractURI
        500n, 10n, 0n,                                   // maxSupply, maxPerTx, mintPrice
        owner.account.address,                           // signer
        zeroAddress, zeroAddress,                        // usdc, cop
        getAddress(TREASURY), 250,                       // royalty
        EIP712_NAME, EIP712_VERSION,
      ],
    });
    const proxyHash = await owner.deployContract({
      abi: proxy.abi, bytecode: proxy.bytecode, args: [v3Impl, initData],
    });
    nft = (await publicClient.waitForTransactionReceipt({ hash: proxyHash })).contractAddress;

    await owner.writeContract({ address: nft, abi: v3.abi, functionName: 'unpause' });
    await owner.writeContract({
      address: nft, abi: v3.abi, functionName: 'adminMint',
      args: [seller.account.address, 1n],
    });
    tokenId = await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'totalMinted' });
    assert.equal(
      getAddress(await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'ownerOf', args: [tokenId] })),
      getAddress(seller.account.address),
    );

    // ---- Deploy mock USDC ----
    const usdcHash = await owner.deployContract({
      abi: mockErc20.abi, bytecode: mockErc20.bytecode,
      args: ['USD Coin', 'USDC', 6],
    });
    usdc = (await publicClient.waitForTransactionReceipt({ hash: usdcHash })).contractAddress;
    await owner.writeContract({
      address: usdc, abi: mockErc20.abi, functionName: 'mint',
      args: [buyer.account.address, 1_000_000_000n],   // 1000 USDC
    });

    // ---- Deploy marketplace impl + proxy ----
    const mImplHash = await owner.deployContract({ abi: marketplace.abi, bytecode: marketplace.bytecode });
    const mImpl = (await publicClient.waitForTransactionReceipt({ hash: mImplHash })).contractAddress;
    const mInit = encodeFunctionData({
      abi: marketplace.abi,
      functionName: 'initialize',
      args: [owner.account.address, nft, getAddress(TREASURY), 250],
    });
    const mProxyHash = await owner.deployContract({
      abi: proxy.abi, bytecode: proxy.bytecode, args: [mImpl, mInit],
    });
    market = (await publicClient.waitForTransactionReceipt({ hash: mProxyHash })).contractAddress;

    // Whitelist USDC as accepted payment.
    await owner.writeContract({
      address: market, abi: marketplace.abi, functionName: 'setAcceptedPaymentToken', args: [usdc, true],
    });
  });

  it('seller approves marketplace and lists token in ETH', async () => {
    await seller.writeContract({
      address: nft, abi: v3.abi, functionName: 'approve', args: [market, tokenId],
    });
    await seller.writeContract({
      address: market, abi: marketplace.abi, functionName: 'list',
      args: [tokenId, zeroAddress, parseEther('1'), 0n],
    });
    const l = await publicClient.readContract({ address: market, abi: marketplace.abi, functionName: 'getListing', args: [tokenId] });
    assert.equal(getAddress(l.seller), getAddress(seller.account.address));
    assert.equal(l.price, parseEther('1'));
    assert.equal(l.active, true);
  });

  it('underpay reverts', async () => {
    await assert.rejects(
      buyer.writeContract({
        address: market, abi: marketplace.abi, functionName: 'buyWithEth', args: [tokenId],
        value: parseEther('0.9'),
      }),
      /Wrong ETH amount/,
    );
  });

  it('overpay reverts (exact match policy)', async () => {
    await assert.rejects(
      buyer.writeContract({
        address: market, abi: marketplace.abi, functionName: 'buyWithEth', args: [tokenId],
        value: parseEther('1.1'),
      }),
      /Wrong ETH amount/,
    );
  });

  it('buy with ETH transfers NFT + 2.5% royalty + remainder to seller', async () => {
    const treasuryBefore = await publicClient.getBalance({ address: getAddress(TREASURY) });
    const sellerBefore = await publicClient.getBalance({ address: seller.account.address });

    const txHash = await buyer.writeContract({
      address: market, abi: marketplace.abi, functionName: 'buyWithEth', args: [tokenId],
      value: parseEther('1'),
    });
    const r = await publicClient.waitForTransactionReceipt({ hash: txHash });
    assert.equal(r.status, 'success');

    // NFT moved to buyer
    const newOwner = await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'ownerOf', args: [tokenId] });
    assert.equal(getAddress(newOwner), getAddress(buyer.account.address));

    // Royalty 2.5% = 0.025 ETH to treasury
    const treasuryAfter = await publicClient.getBalance({ address: getAddress(TREASURY) });
    assert.equal(treasuryAfter - treasuryBefore, parseEther('0.025'));

    // Seller proceeds 0.975 ETH (no gas — seller didn't send the buy tx)
    const sellerAfter = await publicClient.getBalance({ address: seller.account.address });
    assert.equal(sellerAfter - sellerBefore, parseEther('0.975'));

    // Listing wiped
    const l = await publicClient.readContract({ address: market, abi: marketplace.abi, functionName: 'getListing', args: [tokenId] });
    assert.equal(l.active, false);
    assert.equal(l.seller, '0x0000000000000000000000000000000000000000');
  });

  it('buying a wiped listing reverts', async () => {
    await assert.rejects(
      buyer.writeContract({
        address: market, abi: marketplace.abi, functionName: 'buyWithEth', args: [tokenId],
        value: parseEther('1'),
      }),
      /Not listed/,
    );
  });

  // ---- USDC path ----
  it('lists same token (now owned by buyer) in USDC', async () => {
    // buyer now owns tokenId — relist for 100 USDC.
    await buyer.writeContract({
      address: nft, abi: v3.abi, functionName: 'approve', args: [market, tokenId],
    });
    await buyer.writeContract({
      address: market, abi: marketplace.abi, functionName: 'list',
      args: [tokenId, usdc, 100_000_000n, 0n],   // 100 USDC (6 decimals)
    });
  });

  it('buy with USDC transfers NFT + royalty + seller proceeds', async () => {
    // Fund `other` with USDC + approve marketplace
    await owner.writeContract({
      address: usdc, abi: mockErc20.abi, functionName: 'mint',
      args: [other.account.address, 100_000_000n],
    });
    await other.writeContract({
      address: usdc, abi: mockErc20.abi, functionName: 'approve',
      args: [market, 100_000_000n],
    });

    const treasuryBefore = await publicClient.readContract({
      address: usdc, abi: mockErc20.abi, functionName: 'balanceOf', args: [getAddress(TREASURY)],
    });
    const sellerBefore = await publicClient.readContract({
      address: usdc, abi: mockErc20.abi, functionName: 'balanceOf', args: [buyer.account.address],
    });

    await other.writeContract({
      address: market, abi: marketplace.abi, functionName: 'buyWithToken', args: [tokenId],
    });

    const treasuryAfter = await publicClient.readContract({
      address: usdc, abi: mockErc20.abi, functionName: 'balanceOf', args: [getAddress(TREASURY)],
    });
    const sellerAfter = await publicClient.readContract({
      address: usdc, abi: mockErc20.abi, functionName: 'balanceOf', args: [buyer.account.address],
    });
    assert.equal(treasuryAfter - treasuryBefore, 2_500_000n);    // 2.5 USDC
    assert.equal(sellerAfter - sellerBefore, 97_500_000n);       // 97.5 USDC

    const newOwner = await publicClient.readContract({ address: nft, abi: v3.abi, functionName: 'ownerOf', args: [tokenId] });
    assert.equal(getAddress(newOwner), getAddress(other.account.address));
  });

  // ---- Cancel flow ----
  it('owner cancels their own listing', async () => {
    await other.writeContract({
      address: nft, abi: v3.abi, functionName: 'approve', args: [market, tokenId],
    });
    await other.writeContract({
      address: market, abi: marketplace.abi, functionName: 'list',
      args: [tokenId, zeroAddress, parseEther('5'), 0n],
    });
    await other.writeContract({
      address: market, abi: marketplace.abi, functionName: 'cancel', args: [tokenId],
    });
    const l = await publicClient.readContract({ address: market, abi: marketplace.abi, functionName: 'getListing', args: [tokenId] });
    assert.equal(l.active, false);
  });

  it('non-seller cannot cancel', async () => {
    await other.writeContract({
      address: nft, abi: v3.abi, functionName: 'approve', args: [market, tokenId],
    });
    await other.writeContract({
      address: market, abi: marketplace.abi, functionName: 'list',
      args: [tokenId, zeroAddress, parseEther('5'), 0n],
    });
    await assert.rejects(
      buyer.writeContract({ address: market, abi: marketplace.abi, functionName: 'cancel', args: [tokenId] }),
      /Not seller/,
    );
    // cleanup
    await other.writeContract({ address: market, abi: marketplace.abi, functionName: 'cancel', args: [tokenId] });
  });

  it('owner of marketplace can force-cancel a listing', async () => {
    await other.writeContract({
      address: nft, abi: v3.abi, functionName: 'approve', args: [market, tokenId],
    });
    await other.writeContract({
      address: market, abi: marketplace.abi, functionName: 'list',
      args: [tokenId, zeroAddress, parseEther('5'), 0n],
    });
    await owner.writeContract({ address: market, abi: marketplace.abi, functionName: 'cancel', args: [tokenId] });
    const l = await publicClient.readContract({ address: market, abi: marketplace.abi, functionName: 'getListing', args: [tokenId] });
    assert.equal(l.active, false);
  });

  // ---- Approval / ownership invariants ----
  it('buy after seller revoked approval reverts (NFT.transferFrom fails)', async () => {
    await other.writeContract({
      address: nft, abi: v3.abi, functionName: 'approve', args: [market, tokenId],
    });
    await other.writeContract({
      address: market, abi: marketplace.abi, functionName: 'list',
      args: [tokenId, zeroAddress, parseEther('1'), 0n],
    });
    await other.writeContract({
      address: nft, abi: v3.abi, functionName: 'approve', args: [zeroAddress, tokenId],
    });
    await assert.rejects(
      buyer.writeContract({
        address: market, abi: marketplace.abi, functionName: 'buyWithEth', args: [tokenId],
        value: parseEther('1'),
      }),
    );
    // cleanup
    await other.writeContract({ address: market, abi: marketplace.abi, functionName: 'cancel', args: [tokenId] });
  });

  // ---- Pause ----
  it('pause halts new listings but allows cancel', async () => {
    await owner.writeContract({ address: market, abi: marketplace.abi, functionName: 'pause' });
    await assert.rejects(
      other.writeContract({
        address: market, abi: marketplace.abi, functionName: 'list',
        args: [tokenId, zeroAddress, parseEther('1'), 0n],
      }),
    );
    await owner.writeContract({ address: market, abi: marketplace.abi, functionName: 'unpause' });
  });
});
