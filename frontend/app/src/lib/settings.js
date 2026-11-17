const PREFIX = 'lilith_';

/** localStorage 读写（浏览器 / Tauri WebView 都可用） */
export function saveSetting(key, value) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(PREFIX + key, String(value));
}

export function loadSetting(key, defaultValue = null) {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(PREFIX + key) || defaultValue;
  }
  return defaultValue;
}

export function removeSetting(key) {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(PREFIX + key);
}
