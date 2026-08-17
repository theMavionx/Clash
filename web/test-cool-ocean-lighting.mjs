import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mainScene, webProfile] = await Promise.all([
  readFile(path.join(root, "scenes", "Main.tscn"), "utf8"),
  readFile(path.join(root, "scripts", "web_render_profile.gd"), "utf8"),
]);

assert.match(mainScene, /tonemap_exposure = 0\.7\b/);
assert.match(mainScene, /tonemap_white = 7\.0\b/);
assert.match(
  mainScene,
  /\[node name="DirectionalLight3D"[\s\S]*?light_color = Color\(0\.92, 0\.95, 1, 1\)[\s\S]*?light_energy = 1\.1\b/,
);
assert.match(
  mainScene,
  /\[node name="FillLight"[\s\S]*?light_color = Color\(0\.58, 0\.7, 1, 1\)[\s\S]*?light_energy = 0\.46\b/,
);

assert.match(webProfile, /environment\.tonemap_exposure = 0\.7\b/);
assert.match(webProfile, /environment\.tonemap_white = 7\.0\b/);
assert.match(
  webProfile,
  /directional_light\.name == "DirectionalLight3D":[\s\S]*?light_color = Color\(0\.92, 0\.95, 1\.0, 1\.0\)[\s\S]*?light_energy = 1\.10\b/,
);
assert.match(
  webProfile,
  /directional_light\.name == "FillLight":[\s\S]*?light_color = Color\(0\.58, 0\.70, 1\.0, 1\.0\)[\s\S]*?light_energy = 0\.46\b/,
);

console.log("COOL_OCEAN_LIGHTING_CONTRACT_PASS");
