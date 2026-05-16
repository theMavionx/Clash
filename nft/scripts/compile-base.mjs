import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { NFT_DIR } from './lib-env.mjs';

const contractsDir = path.join(NFT_DIR, 'contracts');
const sources = Object.fromEntries(
  fs.readdirSync(contractsDir)
    .filter((file) => file.endsWith('.sol'))
    .map((file) => [file, { content: fs.readFileSync(path.join(contractsDir, file), 'utf8') }])
);

function resolveImport(importPath) {
  const candidates = [
    path.join(NFT_DIR, 'node_modules', importPath),
    path.join(NFT_DIR, 'contracts', importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') };
  }
  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,           // needed for V3's initializeV3Fresh (>12 locals)
    evmVersion: 'cancun',  // matches Hardhat config + Base mainnet target
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata', 'storageLayout'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
const errors = output.errors || [];
for (const err of errors) {
  const log = err.severity === 'error' ? console.error : console.warn;
  log(err.formattedMessage || err.message);
}
if (errors.some((err) => err.severity === 'error')) process.exit(1);

const outDir = path.join(NFT_DIR, 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
let count = 0;
for (const [sourceName, contracts] of Object.entries(output.contracts)) {
  if (!sources[sourceName]) continue;
  for (const [contractName, compiled] of Object.entries(contracts)) {
    if (!compiled.evm?.bytecode?.object) continue;
    const artifact = {
      contractName,
      sourceName,
      abi: compiled.abi,
      bytecode: `0x${compiled.evm.bytecode.object}`,
      deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
      metadata: JSON.parse(compiled.metadata),
      storageLayout: compiled.storageLayout || null,
      compiler: `solc ${solc.version()}`,
    };
    fs.writeFileSync(path.join(outDir, `${contractName}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`Compiled ${contractName} with ${artifact.abi.length} ABI entries.`);
    count += 1;
  }
}
if (count === 0) throw new Error('No deployable contracts compiled.');
