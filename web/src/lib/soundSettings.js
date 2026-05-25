export const SOUND_ENABLED_STORAGE_KEY = 'clash_sound_enabled_v1';

export function readSoundEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeSoundEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Storage can be unavailable in embedded browsers; Godot still receives
    // the live setting for this session.
  }
}
