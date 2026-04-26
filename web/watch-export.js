import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GODOT = 'C:/Users/Admin/Downloads/Godot_v4.6-stable_win64.exe/Godot_v4.6-stable_win64_console.exe';
const PROJECT = path.resolve(__dirname, '..');
const EXPORT_PATH = path.resolve(__dirname, 'public/godot/Work.html');
const EXPORT_PRESET = 'Web';
const EXPORT_MODE = process.env.GODOT_EXPORT_MODE === 'debug' ? '--export-debug' : '--export-release';
const MANIFEST_SCRIPT = path.resolve(__dirname, 'generate-godot-export-manifest.cjs');

// Directories to watch
const WATCH_DIRS = [
  path.join(PROJECT, 'scripts'),
  path.join(PROJECT, 'scenes'),
  path.join(PROJECT, 'shaders'),
];

let exporting = false;
let pendingExport = false;

function doExport() {
  if (exporting) {
    pendingExport = true;
    return;
  }
  exporting = true;
  console.log(`\n\x1b[33m[watch]\x1b[0m Exporting Godot project (${EXPORT_MODE.replace('--export-', '')})...`);
  const start = Date.now();
  try {
    execSync(`node "${MANIFEST_SCRIPT}"`, { stdio: 'inherit', timeout: 30000 });
    execSync(
      `"${GODOT}" --headless --path "${PROJECT}" ${EXPORT_MODE} "${EXPORT_PRESET}" "${EXPORT_PATH}"`,
      { stdio: 'inherit', timeout: 600000 }
    );
    console.log(`\x1b[32m[watch]\x1b[0m Export done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.error(`\x1b[31m[watch]\x1b[0m Export failed`);
  }
  exporting = false;
  if (pendingExport) {
    pendingExport = false;
    setTimeout(doExport, 500);
  }
}

// Debounce
let timer = null;
function onChange(file) {
  console.log(`\x1b[36m[watch]\x1b[0m Changed: ${path.basename(file)}`);
  clearTimeout(timer);
  timer = setTimeout(doExport, 1000);
}

// Watch directories
for (const dir of WATCH_DIRS) {
  if (fs.existsSync(dir)) {
    fs.watch(dir, { recursive: true }, (event, filename) => {
      if (filename && !filename.includes('.import')) {
        onChange(path.join(dir, filename));
      }
    });
    console.log(`\x1b[36m[watch]\x1b[0m Watching: ${dir}`);
  }
}

console.log('\x1b[33m[watch]\x1b[0m Doing initial export...');
doExport();
console.log('\x1b[33m[watch]\x1b[0m Watching for changes... (Ctrl+C to stop)');
