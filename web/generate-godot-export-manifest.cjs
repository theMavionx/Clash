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
const sourceRefPattern = /["'](res:\/\/[^"']+)["']/g;
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

const sorted = [...refs].sort();
const lines = [];
lines.push(`[gd_scene load_steps=${sorted.length + 1} format=3]`);
lines.push('');

sorted.forEach((resPath, index) => {
  lines.push(`[ext_resource type="${resourceType(resPath)}" path="${resPath}" id="${index + 1}"]`);
});

lines.push('');
lines.push('[node name="ExportManifest" type="ResourcePreloader"]');
lines.push('resources = {');
sorted.forEach((_resPath, index) => {
  const comma = index === sorted.length - 1 ? '' : ',';
  lines.push(`"res_${String(index + 1).padStart(3, '0')}": ExtResource("${index + 1}")${comma}`);
});
lines.push('}');
lines.push('');

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, lines.join('\n'), 'utf8');

console.log(`Generated ${path.relative(root, output)} with ${sorted.length} resource references.`);
