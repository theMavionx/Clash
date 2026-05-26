const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const godotDir = path.resolve(process.argv[2] || path.join(__dirname, 'public', 'godot'));
const buildId = String(process.argv[3] || process.env.VITE_BUILD_ID || Date.now());
const output = path.join(godotDir, 'godot-runtime-manifest.json');
const requiredFiles = ['Work.js', 'Work.wasm', 'Work.pck'];

function fileInfo(name) {
  const file = path.join(godotDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing Godot runtime file: ${file}`);
  }
  const data = fs.readFileSync(file);
  return {
    size: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  };
}

const manifest = {
  build: buildId,
  generated_at: new Date().toISOString(),
  files: Object.fromEntries(requiredFiles.map((name) => [name, fileInfo(name)])),
};

fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${output}`);
