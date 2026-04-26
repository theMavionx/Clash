#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_ROOT = path.join(ROOT, '.asset-backups');

const JOBS = [
  {
    file: 'web/public/splash-logo.png',
    kind: 'png',
    resize: { width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'web/public/clashofperps.PNG',
    kind: 'png',
    resize: { width: 1280, height: 720, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'web/public/splash-bg.png',
    kind: 'png',
  },
  {
    file: 'Model/Island/Isl_texture_pbr_20250901.png',
    kind: 'png',
    resize: { width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/Island/Isl_texture_pbr_20250901_normal.png',
    kind: 'png',
    resize: { width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/Island/Isl_texture_pbr_20250901_metallic-texture_pbr_20250901_roughness.png',
    kind: 'png',
    resize: { width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/BrokenModel/BrokenModel_0.jpg',
    kind: 'jpeg',
    resize: { width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/BrokenModel/BrokenModel_1.jpg',
    kind: 'jpeg',
    resize: { width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/BrokenModel/BrokenModel_2.jpg',
    kind: 'jpeg',
    resize: { width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/effeckt/boom/4833049_2540505.png',
    kind: 'png',
    resize: { width: 512, height: 512, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/effeckt/boom/4833049_2540505 (1).png',
    kind: 'png',
    resize: { width: 512, height: 512, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/effeckt/boom/4833049_2540505 (2).png',
    kind: 'png',
    resize: { width: 512, height: 512, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/effeckt/boom/4833049_2540505 (3).png',
    kind: 'png',
    resize: { width: 512, height: 512, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/effeckt/boom/4833049_2540505 (4).png',
    kind: 'png',
    resize: { width: 512, height: 512, fit: 'inside', withoutEnlargement: true },
  },
  {
    file: 'Model/effeckt/boom/4833049_2540505 (5).png',
    kind: 'png',
    resize: { width: 512, height: 512, fit: 'inside', withoutEnlargement: true },
  },
];

function bytes(file) {
  return fs.statSync(file).size;
}

function mb(value) {
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function backup(abs) {
  const rel = path.relative(ROOT, abs);
  const target = path.join(BACKUP_ROOT, `${rel}.orig`);
  const legacyTarget = `${abs}.orig`;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(fs.existsSync(legacyTarget) ? legacyTarget : abs, target);
  }
  return target;
}

async function optimize(job) {
  const abs = path.join(ROOT, job.file);
  if (!fs.existsSync(abs)) {
    console.log(`skip ${job.file} (missing)`);
    return { before: 0, after: 0 };
  }

  const source = backup(abs);
  const before = bytes(source);
  let pipeline = sharp(source, { failOn: 'none' }).rotate();
  if (job.resize) pipeline = pipeline.resize(job.resize);

  if (job.kind === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 78, mozjpeg: true });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 });
  }

  const tmp = `${abs}.tmp`;
  await pipeline.toFile(tmp);
  fs.renameSync(tmp, abs);
  const after = bytes(abs);
  console.log(`${job.file}: ${mb(before)} -> ${mb(after)}`);
  return { before, after };
}

(async () => {
  let beforeTotal = 0;
  let afterTotal = 0;
  for (const job of JOBS) {
    const result = await optimize(job);
    beforeTotal += result.before;
    afterTotal += result.after;
  }
  console.log(`saved: ${mb(beforeTotal - afterTotal)}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
