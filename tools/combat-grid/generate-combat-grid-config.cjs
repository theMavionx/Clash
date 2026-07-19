#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SCENE = path.join(REPO_ROOT, 'scenes', 'Main.tscn');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'server', 'combat_grid.generated.json');
const GRID_DEFAULTS = Object.freeze({ grid_width: 27, grid_height: 27 });

// Grid 1 was the removed multi-port strip. Existing database rows can still
// reference it, so keep its final immutable geometry for replay compatibility.
// Active scene grids (0 and 2) are always regenerated from Main.tscn.
const RETIRED_GRID_CONFIGS = Object.freeze({
  1: Object.freeze({
    grid_width: 27,
    grid_height: 3,
    cell_size: 0.122222238117,
    grid_extent_x: 3.300000429153,
    grid_extent_z: 0.366666465998,
    grid_center_x: 1.302690863609,
    grid_center_z: 3.102639913559,
    grid_rotation: 0.764087736607,
  }),
});

function parseArgs(argv) {
  const args = { check: false, scene: DEFAULT_SCENE, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') args.check = true;
    else if (arg === '--scene') args.scene = path.resolve(argv[++index]);
    else if (arg === '--out') args.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parseAttributes(raw) {
  const attributes = {};
  for (const match of raw.matchAll(/([A-Za-z0-9_]+)=(?:"([^"]*)"|([^\s]+))/g)) {
    attributes[match[1]] = match[2] ?? match[3];
  }
  return attributes;
}

function parseScene(text) {
  const sections = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[(node|sub_resource)\s+(.+)\]$/);
    if (sectionMatch) {
      current = {
        kind: sectionMatch[1],
        attributes: parseAttributes(sectionMatch[2]),
        properties: {},
      };
      sections.push(current);
      continue;
    }
    if (!current || !line || line.startsWith(';')) continue;
    const propertyMatch = line.match(/^([A-Za-z0-9_\/]+)\s*=\s*(.+)$/);
    if (propertyMatch) current.properties[propertyMatch[1]] = propertyMatch[2];
  }

  const nodes = sections.filter((section) => section.kind === 'node');
  const nodeMap = new Map();
  for (const node of nodes) {
    const parent = node.attributes.parent;
    node.path = parent == null ? '.' : (parent === '.' ? node.attributes.name : `${parent}/${node.attributes.name}`);
    nodeMap.set(node.path, node);
  }
  return { nodes, nodeMap };
}

function parseNumbers(value, type, count) {
  const match = String(value || '').match(new RegExp(`^${type}\\((.*)\\)$`));
  if (!match) return null;
  const numbers = match[1].split(',').map((part) => Number(part.trim()));
  if (numbers.length !== count || numbers.some((number) => !Number.isFinite(number))) return null;
  return numbers;
}

function identityTransform() {
  return {
    basis: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    origin: [0, 0, 0],
  };
}

function parseTransform(value) {
  const numbers = parseNumbers(value, 'Transform3D', 12);
  if (!numbers) return identityTransform();
  return { basis: numbers.slice(0, 9), origin: numbers.slice(9, 12) };
}

function multiplyBasis(left, right) {
  const result = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let inner = 0; inner < 3; inner += 1) {
        result[row * 3 + column] += left[row * 3 + inner] * right[inner * 3 + column];
      }
    }
  }
  return result;
}

function transformVector(basis, vector) {
  return [
    basis[0] * vector[0] + basis[1] * vector[1] + basis[2] * vector[2],
    basis[3] * vector[0] + basis[4] * vector[1] + basis[5] * vector[2],
    basis[6] * vector[0] + basis[7] * vector[1] + basis[8] * vector[2],
  ];
}

function composeTransforms(parent, local) {
  const translated = transformVector(parent.basis, local.origin);
  return {
    basis: multiplyBasis(parent.basis, local.basis),
    origin: translated.map((value, index) => value + parent.origin[index]),
  };
}

function globalTransformFor(node, nodeMap, cache) {
  if (cache.has(node.path)) return cache.get(node.path);
  const local = parseTransform(node.properties.transform);
  if (node.path === '.') {
    cache.set(node.path, local);
    return local;
  }
  const parentPath = node.attributes.parent || '.';
  const parent = nodeMap.get(parentPath);
  if (!parent) throw new Error(`Missing parent ${parentPath} for node ${node.path}`);
  const result = composeTransforms(globalTransformFor(parent, nodeMap, cache), local);
  cache.set(node.path, result);
  return result;
}

function vectorLength(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalize(vector) {
  const length = vectorLength(vector);
  if (!(length > 0)) throw new Error('Cannot normalize a zero-length basis axis');
  return vector.map((value) => value / length);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function column(basis, index) {
  return [basis[index], basis[3 + index], basis[6 + index]];
}

function godotYaw(basis) {
  // Basis.get_euler() first removes scale/shear. Reproduce its YXZ yaw using
  // Gram-Schmidt columns so tilted planes match Node3D.global_rotation.y.
  const x = normalize(column(basis, 0));
  const rawY = column(basis, 1);
  const yProjection = dot(x, rawY);
  const y = normalize(rawY.map((value, index) => value - x[index] * yProjection));
  const z = normalize(cross(x, y));
  return Math.atan2(z[0], z[2]);
}

function parseIntProperty(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNodePath(value) {
  const match = String(value || '').match(/^NodePath\("([^"]+)"\)$/);
  return match ? match[1] : '';
}

function resolveNodePath(ownerPath, rawNodePath) {
  const base = ownerPath;
  return path.posix.normalize(path.posix.join(base, rawNodePath)).replace(/^\.\//, '');
}

function gridIndexForPlane(planeName) {
  if (planeName === 'gridPlane2') return 1;
  if (planeName === 'shipPlane') return 2;
  return 0;
}

function rounded(value) {
  return Number(Number(value).toFixed(12));
}

function buildGridConfig(sceneText) {
  const parsed = parseScene(sceneText);
  const transformCache = new Map();
  const activeGrids = {};
  const sources = {};

  for (const system of parsed.nodes) {
    const nodePath = parseNodePath(system.properties.grid_plane_path);
    if (!nodePath) continue;
    const planePath = resolveNodePath(system.path, nodePath);
    const plane = parsed.nodeMap.get(planePath);
    if (!plane) throw new Error(`Grid plane ${planePath} referenced by ${system.path} was not found`);
    const transform = globalTransformFor(plane, parsed.nodeMap, transformCache);
    const gridIndex = gridIndexForPlane(plane.attributes.name);
    const width = parseIntProperty(system.properties.grid_width, GRID_DEFAULTS.grid_width);
    const height = parseIntProperty(system.properties.grid_height, GRID_DEFAULTS.grid_height);
    const extentX = vectorLength(column(transform.basis, 0));
    const extentZ = vectorLength(column(transform.basis, 2));
    activeGrids[gridIndex] = {
      grid_width: width,
      grid_height: height,
      cell_size: rounded(extentX / width),
      grid_extent_x: rounded(extentX),
      grid_extent_z: rounded(extentZ),
      grid_center_x: rounded(transform.origin[0]),
      grid_center_z: rounded(transform.origin[2]),
      grid_rotation: rounded(godotYaw(transform.basis)),
    };
    sources[gridIndex] = `${system.path} -> ${planePath}`;
  }

  if (!activeGrids[0]) throw new Error('Main building grid (index 0) was not found');
  if (!activeGrids[2]) throw new Error('Attack grid (index 2) was not found');
  const grids = { ...RETIRED_GRID_CONFIGS, ...activeGrids };
  const orderedGrids = Object.fromEntries(Object.entries(grids).sort(([left], [right]) => Number(left) - Number(right)));
  const signature = crypto.createHash('sha256').update(JSON.stringify(orderedGrids)).digest('hex');
  return {
    schema_version: 1,
    source_scene: 'scenes/Main.tscn',
    config_sha256: signature,
    sources: {
      ...Object.fromEntries(Object.keys(RETIRED_GRID_CONFIGS).map((key) => [key, 'retired compatibility grid'])),
      ...sources,
    },
    grids: orderedGrids,
  };
}

function stableJson(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function generate({ scene = DEFAULT_SCENE, output = DEFAULT_OUTPUT, check = false } = {}) {
  const sceneText = fs.readFileSync(scene, 'utf8');
  const config = buildGridConfig(sceneText);
  const expected = stableJson(config);
  const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  if (check) {
    if (current !== expected) {
      throw new Error(`Combat grid snapshot is stale. Run: node tools/combat-grid/generate-combat-grid-config.cjs`);
    }
    return { changed: false, config };
  }
  if (current === expected) return { changed: false, config };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temp, expected, 'utf8');
  fs.renameSync(temp, output);
  return { changed: true, config };
}

if (require.main === module) {
  try {
    const result = generate(parseArgs(process.argv.slice(2)));
    console.log(`[combat-grid] ${result.changed ? 'updated' : 'current'} ${path.relative(REPO_ROOT, DEFAULT_OUTPUT)} version=${result.config.config_sha256.slice(0, 16)}`);
  } catch (error) {
    console.error(`[combat-grid] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildGridConfig,
  generate,
  parseScene,
};
