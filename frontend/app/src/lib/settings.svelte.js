/**
 * Persisted UI + performance preferences.
 *
 * A single reactive object is shared by every component. Changes are written
 * to localStorage on a trailing debounce, so dragging a slider is cheap.
 */
import { STORAGE_PREFIX } from '../config.js';

const KEY = `${STORAGE_PREFIX}settings`;

export const DEFAULT_SETTINGS = {
  /* Character */
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
  quality: 'auto', // auto | standard | high
  breath: true,
  blink: true,
  mouseTracking: true,
  lipSync: true,
  autoEmotion: true,
  showSparkles: true,
  ambientGlow: true,

  /* Window / behaviour */
  alwaysOnTop: true,
  autoClickThrough: true,
  reduceMotion: false,

  /* Conversation */
  volume: 0.85,
  muted: false,
  dnd: false,
  tts: false,
  bubbleSeconds: 10,
};

function readStored() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function hydrate() {
  const stored = readStored();
  const next = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (
      Object.prototype.hasOwnProperty.call(stored, key) &&
      typeof stored[key] === typeof DEFAULT_SETTINGS[key]
    ) {
      next[key] = stored[key];
    }
  }
  // Guard against values from a broken/hand-edited config.
  next.zoom = Math.min(1.8, Math.max(0.6, Number(next.zoom) || 1));
  next.offsetX = Math.min(30, Math.max(-30, Number(next.offsetX) || 0));
  next.offsetY = Math.min(20, Math.max(-20, Number(next.offsetY) || 0));
  next.opacity = Math.min(1, Math.max(0.3, Number(next.opacity) || 1));
  next.volume = Math.min(1, Math.max(0, Number(next.volume) ?? 0.85));
  next.bubbleSeconds = Math.min(60, Math.max(3, Number(next.bubbleSeconds) || 10));
  return next;
}

export const settings = $state(hydrate());

if (typeof window !== 'undefined') {
  let timer = 0;
  $effect.root(() => {
    $effect(() => {
      const snapshot = JSON.stringify($state.snapshot(settings));
      // Touch the value so the effect tracks every property.
      void snapshot;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(KEY, snapshot);
        } catch {
          /* Storage can be full/disabled — never break the app for it. */
        }
      }, 180);
    });
  });
}

/**
 * Helper for Svelte `in:` / `out:` / `transition:` params. Those transitions
 * animate on the rAF / Web Animations path, so the CSS-only motion reduction
 * in `app.css` can't stop them. Zeroing their duration makes them complete
 * instantly when the user has enabled "减少动效".
 * @param {{ duration?: number, [key: string]: unknown }} params
 * @returns {{ duration?: number, [key: string]: unknown }}
 */
export function motion(params) {
  return settings.reduceMotion ? { ...params, duration: 0 } : params;
}

/** Restore every preference to its shipped default. */
export function resetSettings() {
  Object.assign(settings, DEFAULT_SETTINGS);
}

/** Remove the saved blob (used by "reset" to make the change explicit). */
export function clearStoredSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
