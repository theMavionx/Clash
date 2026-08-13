import { useEffect, useSyncExternalStore } from 'react';

export const FUTURES_THEME_LIGHT = 'light';
export const FUTURES_THEME_DARK = 'dark';
export const FUTURES_THEME_STORAGE_KEY = 'clash:futures-theme:v1';
export const FUTURES_THEME_DEFAULT = FUTURES_THEME_DARK;

const THEME_EVENT = 'clash:futures-theme-change';
let memoryTheme = FUTURES_THEME_DEFAULT;

export function normalizeFuturesTheme(value) {
  if (value === FUTURES_THEME_LIGHT) return FUTURES_THEME_LIGHT;
  if (value === FUTURES_THEME_DARK) return FUTURES_THEME_DARK;
  return FUTURES_THEME_DEFAULT;
}

function readStoredTheme() {
  if (typeof window === 'undefined') return FUTURES_THEME_DEFAULT;
  try {
    const storedTheme = window.localStorage.getItem(FUTURES_THEME_STORAGE_KEY);
    memoryTheme = normalizeFuturesTheme(storedTheme ?? memoryTheme);
    return memoryTheme;
  } catch {
    return memoryTheme;
  }
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const normalized = normalizeFuturesTheme(theme);
  document.documentElement.dataset.uiTheme = normalized;
  // Keep the original attribute during the migration so already-built
  // Futures chunks and old cached CSS continue to resolve the same theme.
  document.documentElement.dataset.futuresTheme = normalized;
}

function subscribe(callback) {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event) => {
    if (event.key !== FUTURES_THEME_STORAGE_KEY) return;
    memoryTheme = normalizeFuturesTheme(event.newValue);
    applyTheme(memoryTheme);
    callback();
  };
  const handleThemeChange = () => callback();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(THEME_EVENT, handleThemeChange);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(THEME_EVENT, handleThemeChange);
  };
}

export function setFuturesTheme(value) {
  const theme = normalizeFuturesTheme(value);
  memoryTheme = theme;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(FUTURES_THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be disabled in privacy modes. The visible theme still
      // changes for the current page through the document data attribute.
    }
    applyTheme(theme);
    window.dispatchEvent(new Event(THEME_EVENT));
  }
  return theme;
}

export function useFuturesTheme() {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, () => FUTURES_THEME_DEFAULT);
  useEffect(() => applyTheme(theme), [theme]);
  return { theme, setTheme: setFuturesTheme };
}

applyTheme(readStoredTheme());
