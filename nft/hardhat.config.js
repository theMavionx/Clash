import { configVariable } from 'hardhat/config';
import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem';

const baseRpcUrl =
  process.env.NFT_BASE_RPC_URL ||
  process.env.BASE_RPC_URL ||
  'https://mainnet.base.org';

/** @type {import('hardhat/config').HardhatUserConfig} */
export default {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: '0.8.30',
    settings: {
      evmVersion: 'cancun',  // Base mainnet is currently Cancun, not Prague.
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,           // needed for initializeV3Fresh (>12 locals)
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    },
  },
  paths: {
    sources: 'contracts',
    tests: 'test',
    artifacts: 'artifacts-hh',
    cache: 'cache-hh',
  },
  // EDR doesn't ship a default hardfork timeline for Base (8453). Tell it
  // "Cancun has always been active on this chain" so forked reads work.
  chainDescriptors: {
    8453: {
      name: 'base',
      chainType: 'l1',
      hardforkHistory: {
        cancun: { blockNumber: 0 },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: 'edr-simulated',
      chainType: 'l1',
      hardfork: 'cancun',
      forking: {
        url: baseRpcUrl,
      },
    },
  },
};
