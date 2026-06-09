const STORAGE_KEY = 'clash_last_player_dex_v1';
const DB_NAME = 'clash_browser_prefs';
const DB_VERSION = 1;
const STORE_NAME = 'prefs';
const PREF_KEY = 'last_player_dex';
const MAX_PLAYERS = 20;

function normalizeDex(dex) {
  return String(dex || '').trim().toLowerCase();
}

export function playerDexPreferenceKey(playerOrCandidate = {}) {
  const id = playerOrCandidate.id || playerOrCandidate.player_id;
  if (id) return `player:${String(id)}`;
  const wallet = playerOrCandidate.wallet || playerOrCandidate.wallet_address;
  if (wallet) return `wallet:${String(wallet).trim().toLowerCase()}`;
  const token = playerOrCandidate.token;
  if (token) return `token:${String(token)}`;
  return 'last';
}

function emptyRecord() {
  return { version: 1, lastDex: '', lastPlayerKey: '', byPlayer: {} };
}

function normalizeRecord(value) {
  const record = value && typeof value === 'object' ? value : emptyRecord();
  return {
    version: 1,
    lastDex: normalizeDex(record.lastDex),
    lastPlayerKey: String(record.lastPlayerKey || ''),
    byPlayer: record.byPlayer && typeof record.byPlayer === 'object' ? record.byPlayer : {},
  };
}

function readLocalRecord() {
  try {
    return normalizeRecord(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return emptyRecord();
  }
}

function writeLocalRecord(record) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeRecord(record))); } catch { /* storage disabled */ }
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function readDbRecord() {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(PREF_KEY);
    req.onsuccess = () => resolve(normalizeRecord(req.result));
    req.onerror = () => resolve(null);
  });
}

async function writeDbRecord(record) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(normalizeRecord(record), PREF_KEY);
  } catch { /* storage disabled */ }
}

function trimPlayers(byPlayer) {
  return Object.fromEntries(
    Object.entries(byPlayer || {})
      .sort(([, a], [, b]) => Number(b?.ts || 0) - Number(a?.ts || 0))
      .slice(0, MAX_PLAYERS)
  );
}

export function readLastPlayerDexPreference(playerOrCandidate = {}) {
  const record = readLocalRecord();
  const playerKey = playerDexPreferenceKey(playerOrCandidate);
  return normalizeDex(record.byPlayer?.[playerKey]?.dex || record.lastDex);
}

export async function readLastPlayerDexPreferenceAsync(playerOrCandidate = {}) {
  const local = readLastPlayerDexPreference(playerOrCandidate);
  if (local) return local;
  const dbRecord = await readDbRecord();
  if (!dbRecord) return '';
  writeLocalRecord(dbRecord);
  const playerKey = playerDexPreferenceKey(playerOrCandidate);
  return normalizeDex(dbRecord.byPlayer?.[playerKey]?.dex || dbRecord.lastDex);
}

export function writeLastPlayerDexPreference(playerOrCandidate = {}, dex) {
  const nextDex = normalizeDex(dex);
  if (!nextDex) return;
  const playerKey = playerDexPreferenceKey(playerOrCandidate);
  const record = readLocalRecord();
  const next = normalizeRecord({
    ...record,
    lastDex: nextDex,
    lastPlayerKey: playerKey,
    byPlayer: trimPlayers({
      ...record.byPlayer,
      [playerKey]: { dex: nextDex, ts: Date.now() },
    }),
  });
  writeLocalRecord(next);
  writeDbRecord(next);
}
