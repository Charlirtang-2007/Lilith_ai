/**
 * Runtime configuration.
 *
 * Everything here can be overridden from `frontend/app/.env` (Vite only
 * exposes variables prefixed with VITE_).
 */

const env = /** @type {Record<string, any>} */ (import.meta.env || {});

/** Where the FastAPI brain lives. */
export const BACKEND_HTTP = (env.VITE_BACKEND_HTTP || 'http://127.0.0.1:8001').replace(/\/$/, '');
export const BACKEND_WS = env.VITE_BACKEND_WS || `${BACKEND_HTTP.replace(/^http/, 'ws')}/ws`;

/** Model folder relative to `static/`. The file name defaults to the folder name. */
export const MODEL_DIR = (env.VITE_LIVE2D_MODEL_DIR || 'live2d/lilith_love').replace(/^\/+|\/+$/g, '');
export const MODEL_NAME = env.VITE_LIVE2D_MODEL_NAME || MODEL_DIR.split('/').pop();
export const MODEL_FILE = env.VITE_LIVE2D_MODEL_FILE || `${MODEL_NAME}.model3.json`;

/** Public model URL. BASE_URL keeps this working if SvelteKit is ever served under a sub-path. */
const base = env.BASE_URL || '/';
function joinUrl(root, path) {
  const left = String(root || '').replace(/\/+$/, '');
  const right = String(path || '').replace(/^\/+/, '');
  return left ? `${left}/${right}` : `/${right}`;
}
const encodedDir = MODEL_DIR.split('/').map((part) => encodeURIComponent(part)).join('/');
export const MODEL_BASE_URL = `${joinUrl(base, encodedDir)}/`;

export const PET_NAME = env.VITE_PET_NAME || 'Lilith';
export const PET_TITLE = env.VITE_PET_TITLE || '女仆 · 桌面伴侣';
export const APP_VERSION = '0.3.0';

/** Logical window size; mirrored in tauri.conf.json. */
export const WINDOW_WIDTH = 300;
export const WINDOW_HEIGHT = 520;

export const STORAGE_PREFIX = 'lilith.v3.';

/** Browser (non-Tauri) previews get a quiet night backdrop so the model reads well. */
export const DEV = !!env.DEV;

export const SHORTCUTS = {
  chat: 'Ctrl K',
  settings: 'Ctrl ,',
  close: 'Esc',
};
