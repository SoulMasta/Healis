const STORAGE_KEY = 'healis.preferences.v1';

const DEFAULTS = Object.freeze({
  notifications: true,
  tips: true,
  dark: false,
});

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadPreferences() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParseJson(raw) : null;
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
  return {
    notifications: parsed.notifications !== undefined ? Boolean(parsed.notifications) : DEFAULTS.notifications,
    tips: parsed.tips !== undefined ? Boolean(parsed.tips) : DEFAULTS.tips,
    dark: parsed.dark !== undefined ? Boolean(parsed.dark) : DEFAULTS.dark,
  };
}

export function savePreferences(next) {
  const value = {
    notifications: Boolean(next?.notifications),
    tips: Boolean(next?.tips),
    dark: Boolean(next?.dark),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event('healis:preferences'));
  return value;
}

export function resetPreferences() {
  return savePreferences(DEFAULTS);
}

export function applyThemePreference(prefs) {
  const dark = Boolean(prefs?.dark);
  try {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch {
    // ignore
  }
}

export const PREFERENCES_STORAGE_KEY = STORAGE_KEY;

