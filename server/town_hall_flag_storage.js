'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FLAG_FILENAME_RE = /^\d+-[a-f0-9]{64}\.(png|jpg|jpeg|webp)$/i;
const PLAYER_ID_RE = /^[A-Za-z0-9_-]+$/;

function getUploadRoot(env = process.env) {
  const configured = String(env.TOWN_HALL_FLAG_UPLOAD_ROOT || '').trim();
  return path.resolve(configured || path.join(__dirname, 'public', 'town-hall-flags'));
}

function normalizePlayerId(value) {
  const playerId = String(value || '').trim();
  return PLAYER_ID_RE.test(playerId) ? playerId : '';
}

function normalizeFlagFilename(value) {
  const filename = String(value || '').trim();
  return FLAG_FILENAME_RE.test(filename) ? filename : '';
}

function filenameFromFlagRecord(flag) {
  const rawUrl = String(flag?.image_url || flag?.imageUrl || '').trim();
  if (!rawUrl) return '';
  const withoutQuery = rawUrl.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  const encodedName = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  let filename = encodedName;
  try {
    filename = decodeURIComponent(encodedName);
  } catch {
    return '';
  }
  return normalizeFlagFilename(filename);
}

function resolveFlagFilePath(playerId, filename, root = getUploadRoot()) {
  const safePlayerId = normalizePlayerId(playerId);
  const safeFilename = normalizeFlagFilename(filename);
  if (!safePlayerId || !safeFilename) return null;

  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, safePlayerId, safeFilename);
  if (!resolved.startsWith(`${absoluteRoot}${path.sep}`)) return null;
  return resolved;
}

function resolveFlagRecordPath(flag, root = getUploadRoot()) {
  const playerId = flag?.player_id || flag?.playerId;
  return resolveFlagFilePath(playerId, filenameFromFlagRecord(flag), root);
}

function flagAssetExists(flag, root = getUploadRoot()) {
  const resolved = resolveFlagRecordPath(flag, root);
  if (!resolved) return false;
  try {
    return fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

function getFlagAssetStatus({ current = null, latest = null } = {}, root = getUploadRoot()) {
  const record = current || latest;
  const assetExists = !!record && flagAssetExists(record, root);
  return {
    assetExists,
    recoveryUploadAvailable: !!latest && !assetExists,
    recoveryPurchaseId: latest?.purchase_id || null,
  };
}

module.exports = {
  FLAG_FILENAME_RE,
  PLAYER_ID_RE,
  getUploadRoot,
  normalizePlayerId,
  normalizeFlagFilename,
  filenameFromFlagRecord,
  resolveFlagFilePath,
  resolveFlagRecordPath,
  flagAssetExists,
  getFlagAssetStatus,
};
