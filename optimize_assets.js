#!/usr/bin/env node
/**
 * Asset optimization script — reduces PCK size by ~50-60%
 *
 * 1. Explosion sprites: 86x 1920×1080 16-bit → 30x 512×512 8-bit (~58MB → ~2MB)
 * 2. Island textures: 4096×4096 → 2048×2048 (~31MB → ~8MB)
 * 3. Flag model texture optimization
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

async function optimizeExplosions() {
  const dir = path.join(ROOT, 'Model/Ship/FootageCrate-Particle_Explosion_Small');
  if (!fs.existsSync(dir)) { console.log('  Explosion dir not found, skipping'); return; }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  console.log(`  Found ${files.length} explosion frames`);

  // Keep every 3rd frame (86 → 29 frames), resize to 512×512, convert to 8-bit
  const backupDir = dir + '_backup';
  if (!fs.existsSync(backupDir)) {
    console.log('  Backing up originals...');
    fs.mkdirSync(backupDir, { recursive: true });
    for (const f of files) {
      fs.copyFileSync(path.join(dir, f), path.join(backupDir, f));
    }
  }

  let kept = 0, removed = 0;
  for (let i = 0; i < files.length; i++) {
    const src = path.join(dir, files[i]);
    if (i % 3 === 0) {
      // Keep this frame — resize and optimize
      await sharp(src)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ quality: 80, effort: 6, colours: 256 })
        .toFile(src + '.tmp');
      fs.renameSync(src + '.tmp', src);
      kept++;
    } else {
      // Remove this frame
      fs.unlinkSync(src);
      // Also remove .import file if exists
      const importFile = src + '.import';
      if (fs.existsSync(importFile)) fs.unlinkSync(importFile);
      removed++;
    }
  }

  const newSize = fs.readdirSync(dir).filter(f => f.endsWith('.png'))
    .reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  console.log(`  Kept ${kept} frames, removed ${removed}. New size: ${(newSize / 1024 / 1024).toFixed(1)}MB`);
}

async function optimizeIslandTextures() {
  const dir = path.join(ROOT, 'Model/Island');
  if (!fs.existsSync(dir)) { console.log('  Island dir not found, skipping'); return; }

  const textures = [
    'Isl_texture_pbr_20250901.png',
    'Isl_texture_pbr_20250901_normal.png',
    'Isl_texture_pbr_20250901_metallic-texture_pbr_20250901_roughness.png',
  ];

  for (const tex of textures) {
    const src = path.join(dir, tex);
    if (!fs.existsSync(src)) continue;

    const backup = src + '.orig';
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(src, backup);
    }

    const sizeBefore = fs.statSync(src).size;
    const isNormal = tex.includes('normal');

    // Resize 4096→2048 for all, keep PNG for normal maps, use high compression
    await sharp(src)
      .resize(2048, 2048)
      .png({ effort: 6 })
      .toFile(src + '.tmp');
    fs.renameSync(src + '.tmp', src);

    const sizeAfter = fs.statSync(src).size;
    console.log(`  ${tex}: ${(sizeBefore/1024/1024).toFixed(1)}MB → ${(sizeAfter/1024/1024).toFixed(1)}MB`);
  }
}

async function optimizeFlagTextures() {
  const dir = path.join(ROOT, 'Model/flag');
  if (!fs.existsSync(dir)) { console.log('  Flag dir not found, skipping'); return; }

  const textures = fs.readdirSync(dir).filter(f => f.endsWith('.png') && !f.endsWith('.import'));
  for (const tex of textures) {
    const src = path.join(dir, tex);
    const backup = src + '.orig';
    if (!fs.existsSync(backup)) fs.copyFileSync(src, backup);

    const sizeBefore = fs.statSync(src).size;
    // Reduce texture size by 50%
    const meta = await sharp(src).metadata();
    const newW = Math.round(meta.width / 2);
    const newH = Math.round(meta.height / 2);

    await sharp(src)
      .resize(newW, newH)
      .png({ effort: 6 })
      .toFile(src + '.tmp');
    fs.renameSync(src + '.tmp', src);

    const sizeAfter = fs.statSync(src).size;
    console.log(`  ${tex}: ${(sizeBefore/1024).toFixed(0)}KB → ${(sizeAfter/1024).toFixed(0)}KB`);
  }
}

async function optimizeCharacterTextures() {
  const dir = path.join(ROOT, 'Model/Characters');
  if (!fs.existsSync(dir)) return;

  // Find all PNG textures in Characters recursively
  function findPngs(d) {
    let results = [];
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) results = results.concat(findPngs(full));
      else if (f.endsWith('.png') && !f.endsWith('.import') && !f.endsWith('.orig'))
        results.push(full);
    }
    return results;
  }

  const pngs = findPngs(dir);
  let totalBefore = 0, totalAfter = 0;

  for (const src of pngs) {
    const sizeBefore = fs.statSync(src).size;
    if (sizeBefore < 50000) continue; // skip tiny textures

    const backup = src + '.orig';
    if (!fs.existsSync(backup)) fs.copyFileSync(src, backup);

    const meta = await sharp(src).metadata();
    // Cap at 1024px max dimension
    const maxDim = 1024;
    if (meta.width > maxDim || meta.height > maxDim) {
      await sharp(src)
        .resize(maxDim, maxDim, { fit: 'inside' })
        .png({ effort: 6 })
        .toFile(src + '.tmp');
      fs.renameSync(src + '.tmp', src);
    }

    const sizeAfter = fs.statSync(src).size;
    totalBefore += sizeBefore;
    totalAfter += sizeAfter;
  }

  if (totalBefore > 0) {
    console.log(`  Characters: ${(totalBefore/1024/1024).toFixed(1)}MB → ${(totalAfter/1024/1024).toFixed(1)}MB (${pngs.length} textures)`);
  }
}

async function main() {
  console.log('=== Asset Optimization ===\n');

  // Calculate total before
  const modelDir = path.join(ROOT, 'Model');
  const totalBefore = parseInt(require('child_process').execSync(`du -sb "${modelDir}"`).toString().split('\t')[0]);
  console.log(`Total Model/ size before: ${(totalBefore/1024/1024).toFixed(1)}MB\n`);

  console.log('[1/4] Explosion sprites (58MB → ~2MB)...');
  await optimizeExplosions();

  console.log('\n[2/4] Island textures (31MB → ~8MB)...');
  await optimizeIslandTextures();

  console.log('\n[3/4] Flag textures...');
  await optimizeFlagTextures();

  console.log('\n[4/4] Character textures...');
  await optimizeCharacterTextures();

  const totalAfter = parseInt(require('child_process').execSync(`du -sb "${modelDir}"`).toString().split('\t')[0]);
  console.log(`\n=== Done! ===`);
  console.log(`Model/ before: ${(totalBefore/1024/1024).toFixed(1)}MB`);
  console.log(`Model/ after:  ${(totalAfter/1024/1024).toFixed(1)}MB`);
  console.log(`Saved: ${((totalBefore - totalAfter)/1024/1024).toFixed(1)}MB (${Math.round((1 - totalAfter/totalBefore)*100)}%)`);
  console.log(`\nBackups saved as .orig files. Re-export Godot to rebuild PCK.`);
}

main().catch(e => { console.error(e); process.exit(1); });
