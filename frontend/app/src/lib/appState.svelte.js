import { loadSetting } from './settings.js';

/**
 * 全局渲染状态（桌面宠物只需要这些）。
 * Svelte 5 runes 的 $state 只能在 .svelte.js 里使用。
 */
let initialized = $state(false);
let alphaMode = $state(loadSetting('alpha_mode', 'pma'));
let textureFilter = $state(loadSetting('texture_filter', 'linear'));
let enableIdleAndBreathing = $state(loadSetting('enable_idle_and_breathing', 'true') === 'true');
let enableMouseTracking = $state(loadSetting('enable_mouse_tracking', 'true') === 'true');

export const appState = {
  get initialized() { return initialized; },
  set initialized(v) { initialized = v; },
  get alphaMode() { return alphaMode; },
  set alphaMode(v) { alphaMode = v; },
  get textureFilter() { return textureFilter; },
  set textureFilter(v) { textureFilter = v; },
  get enableIdleAndBreathing() { return enableIdleAndBreathing; },
  set enableIdleAndBreathing(v) { enableIdleAndBreathing = v; },
  get enableMouseTracking() { return enableMouseTracking; },
  set enableMouseTracking(v) { enableMouseTracking = v; },
};
