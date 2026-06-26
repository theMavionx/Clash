#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scenes', 'export_manifest.tscn');
// Scan only authored code/scenes for string-based `load("res://...")` calls.
// Godot includes dependencies of these selected resources during export, so
// scanning asset folders themselves would accidentally pull in whole unused
// packs just because their .tres/.tscn files reference each other.
const scanRoots = ['scripts', 'scenes', 'shaders'];
const scanExts = new Set(['.gd', '.tscn', '.tres', '.gdshader']);
const sceneExts = new Set(['.glb', '.gltf', '.fbx']);
const textureExts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const sourceRefPattern = /["'](res:\/\/[^"']+)["']/g;
// Long music is played by React/HTMLAudio on web. Keeping these tracks in the
// Godot web export manifest makes some browsers decode large audio buffers
// during startup, which can stall the loader for minutes on memory-constrained
// Brave/Chrome sessions.
const webHtmlAudioResources = new Set([
  'res://Musik/base/loading_the_game.mp3',
  'res://Musik/base/base_theme.mp3',
  'res://Musik/base/Abient.mp3',
  'res://Musik/fight/comfort_before_attack.ogg',
  'res://Musik/fight/fight_1.mp3',
  'res://Musik/fight/fight_2.wav',
  'res://Musik/fight/result.mp3',
  'res://Musik/demon_king/demon_king_theme.mp3',
]);
// Roots where every script must be force-included regardless of whether the
// scanner saw it referenced as a string. Required because GDScript resolves
// `class_name`, `extends Foo`, and `Foo.new()` *without* a `res://` string,
// so a base class like `BaseTroop` (defined in scripts/base_troop.gd) would
// otherwise be left out of the export and trigger:
//   Parse Error: Could not find script for class "BaseTroop"
// at every subclass on first load. Scripts are tiny — including the whole
// scripts/ tree adds <1 MB and trades a real foot-gun for ~nothing.
const forceIncludeScriptRoots = ['scripts'];
const godotIgnoreDirs = [
  'web/dist',
  'web/node_modules',
  'web/public/godot',
  'node_modules',
  'server/node_modules',
  'server-futures/node_modules',
];

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (scanExts.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function resToFs(resPath) {
  return path.join(root, resPath.replace(/^res:\/\//, ''));
}

function fsToRes(filePath) {
  return 'res://' + path.relative(root, filePath).replace(/\\/g, '/');
}

function ensureGodotIgnores() {
  for (const dir of godotIgnoreDirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    const marker = path.join(abs, '.gdignore');
    if (!fs.existsSync(marker)) fs.writeFileSync(marker, '', 'utf8');
  }
}

function existsAsResource(resPath) {
  return fs.existsSync(resToFs(resPath));
}

function expandPattern(resPath) {
  if (!resPath.includes('%05d')) return [resPath];

  const fsPattern = resToFs(resPath);
  const dir = path.dirname(fsPattern);
  const base = path.basename(fsPattern);
  const re = new RegExp('^' + base.replace('%05d', '\\d{5}').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\\\d\\{5\\}', '\\d{5}') + '$');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((name) => re.test(name))
    .sort()
    .map((name) => fsToRes(path.join(dir, name)));
}

function resourceType(resPath) {
  const ext = path.extname(resPath).toLowerCase();
  if (ext === '.gd') return 'Script';
  if (ext === '.gdshader') return 'Shader';
  if (ext === '.tscn' || ext === '.glb' || ext === '.gltf' || ext === '.fbx') return 'PackedScene';
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) return 'Texture2D';
  return 'Resource';
}

function imageExtForMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  return '.png';
}

function safeImageName(name, fallback, ext) {
  let out = String(name || fallback || 'image').replace(/[\\/:*?"<>|]/g, '_');
  if (!path.extname(out)) out += ext;
  return out;
}

function parseGlb(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.toString('utf8', 0, 4) !== 'glTF') return null;
  let offset = 12;
  let json = null;
  let binOffset = 0;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString('utf8', offset + 4, offset + 8);
    const payloadOffset = offset + 8;
    if (type === 'JSON') {
      json = JSON.parse(data.toString('utf8', payloadOffset, payloadOffset + length).trim());
    } else if (type === 'BIN\0') {
      binOffset = payloadOffset;
    }
    offset = payloadOffset + length;
  }
  return json ? { data, json, binOffset } : null;
}

function ensureEmbeddedGlbImage(glbPath, parsed, image, index) {
  if (image.bufferView == null || !parsed?.binOffset) return null;
  const view = parsed.json.bufferViews?.[image.bufferView];
  if (!view || view.buffer !== 0) return null;
  const ext = imageExtForMime(image.mimeType);
  const glbBase = path.basename(glbPath, path.extname(glbPath));
  const imageName = safeImageName(image.name, String(index), ext);
  const outPath = path.join(path.dirname(glbPath), `${glbBase}_${imageName}`);
  if (!fs.existsSync(outPath)) {
    const start = parsed.binOffset + (view.byteOffset || 0);
    const end = start + view.byteLength;
    fs.writeFileSync(outPath, parsed.data.subarray(start, end));
  }
  return fsToRes(outPath);
}

function textureDepsForScene(resPath) {
  const deps = [];
  const filePath = resToFs(resPath);
  const ext = path.extname(filePath).toLowerCase();
  if (!sceneExts.has(ext) || !fs.existsSync(filePath)) return deps;

  try {
    if (ext === '.gltf') {
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const image of json.images || []) {
        const uri = image.uri || '';
        if (!uri || /^data:/i.test(uri)) continue;
        const texturePath = path.resolve(path.dirname(filePath), decodeURIComponent(uri));
        if (fs.existsSync(texturePath) && textureExts.has(path.extname(texturePath).toLowerCase())) {
          deps.push(fsToRes(texturePath));
        }
      }
      return deps;
    }

    const parsed = parseGlb(filePath);
    if (!parsed) return deps;
    for (const [index, image] of (parsed.json.images || []).entries()) {
      if (image.uri && !/^data:/i.test(image.uri)) {
        const texturePath = path.resolve(path.dirname(filePath), decodeURIComponent(image.uri));
        if (fs.existsSync(texturePath) && textureExts.has(path.extname(texturePath).toLowerCase())) {
          deps.push(fsToRes(texturePath));
        }
      } else {
        const extracted = ensureEmbeddedGlbImage(filePath, parsed, image, index);
        if (extracted && existsAsResource(extracted)) deps.push(extracted);
      }
    }
  } catch (e) {
    console.warn(`Skipping texture dependency scan for ${resPath}: ${e.message || e}`);
  }
  return deps;
}

const refs = new Set();
const files = [];

ensureGodotIgnores();

for (const dir of scanRoots) {
  const abs = path.join(root, dir);
  if (fs.existsSync(abs)) files.push(...walk(abs));
}
const projectFile = path.join(root, 'project.godot');
if (fs.existsSync(projectFile)) files.push(projectFile);

for (const file of files) {
  if (path.resolve(file) === path.resolve(output)) continue;
  const text = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = sourceRefPattern.exec(text))) {
    const resPath = match[1];
    if (resPath.startsWith('res://.godot/')) continue;
    if (resPath.startsWith('res://addons/godot_mcp/')) continue;
    for (const expanded of expandPattern(resPath)) {
      if (webHtmlAudioResources.has(expanded)) continue;
      if (existsAsResource(expanded)) refs.add(expanded);
    }
  }
}

// Force-include every .gd under script roots — see comment on
// `forceIncludeScriptRoots` for the rationale (class_name / extends are
// resolved without a res:// string and would otherwise be missed).
for (const dir of forceIncludeScriptRoots) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    if (path.extname(file) !== '.gd') continue;
    refs.add(fsToRes(file));
  }
}

refs.add('res://scenes/Main.tscn');

// Godot's scene export can miss texture dependencies hidden behind imported
// glTF/GLB scenes, causing runtime "No loader found for resource ... Texture2D"
// errors. Include only the images referenced by scene assets we already know
// are needed, instead of sweeping every texture under Model/.
for (const resPath of [...refs]) {
  for (const dep of textureDepsForScene(resPath)) refs.add(dep);
}

const sorted = [...refs].sort();
const lines = [];
lines.push(`[gd_scene load_steps=${sorted.length + 1} format=3]`);
lines.push('');

sorted.forEach((resPath, index) => {
  lines.push(`[ext_resource type="${resourceType(resPath)}" path="${resPath}" id="${index + 1}"]`);
});

lines.push('');
lines.push('[node name="ExportManifest" type="ResourcePreloader"]');
const resourceNames = sorted.map((_resPath, index) => `"res_${String(index + 1).padStart(3, '0')}"`);
const resourceRefs = sorted.map((_resPath, index) => `ExtResource("${index + 1}")`);
lines.push(`resources = [PackedStringArray(${resourceNames.join(', ')}), [${resourceRefs.join(', ')}]]`);
lines.push('');

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, lines.join('\n'), 'utf8');

console.log(`Generated ${path.relative(root, output)} with ${sorted.length} resource references.`);
