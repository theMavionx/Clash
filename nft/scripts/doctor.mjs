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
  console.log(`Solana address: ${keypair.publicKey.toBase58()}`);
  console.log(`Solana RPC: ${rpcUrl}`);
  console.log(`Solana balance: ${balance / LAMPORTS_PER_SOL} SOL`);
} catch (err) {
  console.log(`Solana check failed: ${err.message}`);
}
