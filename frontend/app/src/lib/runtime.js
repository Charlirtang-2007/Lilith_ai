/**
 * Whether the bundle is running inside a Tauri window.
 *
 * Detected at runtime, not injected by Vite: Tauri installs
 * `__TAURI_INTERNALS__` before any app script runs, so a plain `in` check is
 * accurate in both `npm run dev` (plain browser) and the packaged desktop app.
 */
export const IS_TAURI =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);