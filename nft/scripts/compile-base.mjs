import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { NFT_DIR } from './lib-env.mjs';

const contractPath = path.join(NFT_DIR, 'contracts', 'DemonKingBase.sol');
const source = fs.readFileSync(contractPath, 'utf8');

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
  sources: {
    'DemonKingBase.sol': { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'],
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

const compiled = output.contracts['DemonKingBase.sol'].DemonKingBase;
const artifact = {
  contractName: 'DemonKingBase',
  sourceName: 'DemonKingBase.sol',
  abi: compiled.abi,
  bytecode: `0x${compiled.evm.bytecode.object}`,
  deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
  metadata: JSON.parse(compiled.metadata),
  compiler: `solc ${solc.version()}`,
};

const outDir = path.join(NFT_DIR, 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'DemonKingBase.json'), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Compiled DemonKingBase with ${artifact.abi.length} ABI entries.`);
