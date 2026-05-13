import { createPublicClient, formatEther, http } from 'viem';
import { base } from 'viem/chains';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loadEnv, parseEthAccount, parseSolanaKeypair } from './lib-env.mjs';

const env = loadEnv();

try {
  const { account, source } = parseEthAccount(env);
  const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const [chainId, balance] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: account.address }),
  ]);
  console.log(`Base address: ${account.address}`);
  console.log(`Base key source: ${source}`);
  console.log(`Base chainId: ${chainId}`);
  console.log(`Base balance: ${formatEther(balance)} ETH`);
} catch (err) {
  console.log(`Base check failed: ${err.message}`);
}

try {
  const keypair = parseSolanaKeypair(env);
  const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);
  const maxSupply = Number(env.NFT_SOLANA_SUPPLY || env.NFT_SUPPLY || 250);
  const useConfigLines = env.NFT_SOLANA_USE_CONFIG_LINES === '1'
    || String(env.NFT_SOLANA_METADATA_MODE || '').toLowerCase() === 'config-lines';
  const { getCandyMachineSize } = await import('@metaplex-foundation/mpl-core-candy-machine');
  const { none } = await import('@metaplex-foundation/umi');
  const hiddenCmSize = getCandyMachineSize(maxSupply, none());
  const configCmSize = getCandyMachineSize(maxSupply, { nameLength: 32, uriLength: 200 });
  const [hiddenCmRent, configCmRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(hiddenCmSize),
    connection.getMinimumBalanceForRentExemption(configCmSize),
  ]);
  console.log(`Solana address: ${keypair.publicKey.toBase58()}`);
  console.log(`Solana RPC: ${rpcUrl}`);
  console.log(`Solana balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  console.log(`Solana metadata mode: ${useConfigLines ? 'config-lines' : 'hidden-settings'}`);
  console.log(`Solana Candy Machine rent estimate: hidden=${hiddenCmRent / LAMPORTS_PER_SOL} SOL, config-lines=${configCmRent / LAMPORTS_PER_SOL} SOL`);
} catch (err) {
  console.log(`Solana check failed: ${err.message}`);
}
