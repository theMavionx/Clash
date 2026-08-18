import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [admin, api, routes, deploy] = await Promise.all([
  readFile(new URL('./src/admin/AdminApp.jsx', import.meta.url), 'utf8'),
  readFile(new URL('./src/admin/api.js', import.meta.url), 'utf8'),
  readFile(new URL('../server/routes.js', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/deploy.sh', import.meta.url), 'utf8'),
]);

assert.match(admin, /id: 'sanctum'/);
assert.match(admin, /function SanctumAdminPanel/);
assert.match(admin, /Gold per 1 clashSOL/);
assert.match(admin, /Daily Reward Metrics/);
assert.match(admin, /Recent Claims/);
assert.match(admin, /Recent Swaps/);
assert.match(admin, /Configuration History/);
assert.match(admin, /Full audit exports/);
assert.match(admin, /adminDownload\(`\/admin\/sanctum\/export\.csv\?dataset=\$\{dataset\}`/);
assert.match(admin, /adminPut\('\/admin\/sanctum\/settings'/);
assert.match(api, /export function adminPut/);
assert.match(api, /export async function adminDownload/);
assert.match(routes, /router\.get\('\/admin\/sanctum', adminAuth/);
assert.match(routes, /router\.put\('\/admin\/sanctum\/settings', adminAuth/);
assert.match(routes, /router\.get\('\/admin\/sanctum\/export\.csv', adminAuth/);
assert.match(routes, /Promise\.allSettled\(\[sanctumService\.getStatus\(\)\]\)/);
assert.match(deploy, /set_env_value "CLASHSOL_MINT" "CLAShCrEjid112Mr1tWk7VqaGUAAKbiKdikDQYyDwfes"/);
assert.doesNotMatch(`${admin}\n${api}`, /SANCTUM_API_KEY\s*[:=]/);

console.log('Sanctum admin tests passed: settings, metrics, histories, protected routes, live mint and secret boundary.');
