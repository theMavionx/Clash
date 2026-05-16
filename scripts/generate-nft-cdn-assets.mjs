// Generate CDN asset layout from the three canonical source images.
//
// Reads:
//   assets/nft/source/L1.jpg   (1★ — Level 1)
//   assets/nft/source/L2.jpg   (2★ — Level 2)
//   assets/nft/source/L3.jpg   (3★ — Level 3)
//
// Writes:
//   web/public/cdn/nft/1/default.jpg
//   web/public/cdn/nft/2/default.jpg
//   web/public/cdn/nft/3/default.jpg
//
// The server (and Nginx in prod) serves `cdn/nft/<level>/<tokenId>.jpg` and
// falls back to `cdn/nft/<level>/default.jpg` when a per-token render
// doesn't exist yet — so this single set of files is enough to launch V3
// with consistent art across every chain.
//
// Run: node scripts/generate-nft-cdn-assets.mjs
// Idempotent: re-running just overwrites the destination files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LEVELS = [
  { level: 1, src: 'assets/nft/source/L1.jpg', stars: '1★' },
  { level: 2, src: 'assets/nft/source/L2.jpg', stars: '2★' },
  { level: 3, src: 'assets/nft/source/L3.jpg', stars: '3★' },
];

const CDN_BASE = path.join(ROOT, 'web', 'public', 'cdn', 'nft');

function readSize(file) {
  try { return (fs.statSync(file).size / 1024).toFixed(1) + ' KB'; }
  catch { return 'missing'; }
}

console.log('NFT CDN asset generator');
console.log('  ROOT =', ROOT);
console.log('  CDN  =', CDN_BASE);
console.log('');

let missing = 0;
for (const { level, src, stars } of LEVELS) {
  const srcPath = path.join(ROOT, src);
  if (!fs.existsSync(srcPath)) {
    console.error(`  ✗ source ${src} not found (size: ${readSize(srcPath)})`);
    missing += 1;
    continue;
  }
  const destDir = path.join(CDN_BASE, String(level));
  fs.mkdirSync(destDir, { recursive: true });
  const destFile = path.join(destDir, 'default.jpg');
  fs.copyFileSync(srcPath, destFile);
  console.log(`  ✓ L${level} ${stars}: ${src} (${readSize(srcPath)}) → ${path.relative(ROOT, destFile)}`);
}

if (missing > 0) {
  console.error(`\nFailed: ${missing} source file(s) missing. Place them under assets/nft/source/ and retry.`);
  process.exit(1);
}

// Sanity write — small metadata about the CDN layout for the server to read.
const manifest = {
  generatedAt: new Date().toISOString(),
  levels: LEVELS.map(({ level, stars }) => ({
    level,
    stars,
    defaultPath: `/cdn/nft/${level}/default.jpg`,
    perTokenPathPattern: `/cdn/nft/${level}/<tokenId>.jpg`,
  })),
  note:
    'Per-token unique art is optional. When `<tokenId>.jpg` does not exist, ' +
    'Nginx falls back to `default.jpg` for that level via try_files. The ' +
    'on-chain `tokenLevel(id)` determines which level\'s art is served.',
};
fs.writeFileSync(path.join(CDN_BASE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n  ✓ manifest: ${path.relative(ROOT, path.join(CDN_BASE, 'manifest.json'))}`);
console.log('\nDone.');
