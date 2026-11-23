/**
 * Thin, defensive bridge to the Tauri window.
 *
 * The desktop pet needs three things the web platform cannot give us:
 *  - transparent window cursor hit testing (click-through outside the model),
 *  - dragging the window from the character,
 *  - always-on-top / close.
 *
 * Every call degrades to a no-op in a browser, so the same UI can be developed
 * with `npm run dev`.
 */
import { IS_TAURI } from '../runtime.js';
import { WINDOW_WIDTH, WINDOW_HEIGHT } from '../../config.js';

let win = null;
let initPromise = null;
let lastError = null;
// `onMoved` / `onScaleChanged` unlisten handles; emptied by `disposeWindowBridge`.
const geometryUnlisteners = [];
let bridgeDisposed = false;
// `null` = untested, `true` = usable, `false` = missing or permission denied.
// Cached so a denied permission costs one failed IPC, not one per refresh.
let innerPositionUsable = null;

const geometry = {
  x: 0,
  y: 0,
  scale: 1,
  at: 0,
};

async function loadWindow() {
  const mod = await import('@tauri-apps/api/window');
  return mod.getCurrentWindow();
}

/** Initialise once. Resolves to `true` when a Tauri window is available. */
export function initWindowBridge() {
  if (!IS_TAURI) return Promise.resolve(false);
  if (!initPromise) {
    bridgeDisposed = false;
    initPromise = loadWindow()
      .then(async (w) => {
        // Unmounted while the dynamic import was in flight: drop the handle and
        // do not subscribe to events for a page that is already gone.
        if (bridgeDisposed) return false;
        win = w;
        await watchGeometryChanges();
        await enforceWindowSize();
        return true;
      })
      .catch((err) => {
        lastError = err;
        console.warn('[window] Tauri API unavailable:', err);
        return false;
      });
  }
  return initPromise;
}

async function enforceWindowSize() {
  if (!win) return;
  try {
    const { LogicalSize } = await import('@tauri-apps/api/dpi');
    await win.setSizeConstraints({
      minWidth: WINDOW_WIDTH,
      maxWidth: WINDOW_WIDTH,
      minHeight: WINDOW_HEIGHT,
      maxHeight: WINDOW_HEIGHT,
    });
    await win.setSize(new LogicalSize(WINDOW_WIDTH, WINDOW_HEIGHT));
  } catch (err) {
    console.warn('[window] size constraints unavailable:', err);
  }
}

/**
 * Subscribe to native geometry changes so the cached window origin cannot go
 * stale after a drag, a monitor switch or a DPI change. Best-effort: a missing
 * event permission only logs and leaves the 700 ms cache in place.
 */
async function watchGeometryChanges() {
  if (!win) return;
  try {
    const offMoved = await win.onMoved(() => invalidateWindowGeometry());
    if (bridgeDisposed) {
      offMoved();
      return;
    }
    geometryUnlisteners.push(offMoved);
    const offScale = await win.onScaleChanged(() => invalidateWindowGeometry());
    if (bridgeDisposed) {
      offScale();
      return;
    }
    geometryUnlisteners.push(offScale);
  } catch (err) {
    console.warn('[window] geometry listeners unavailable:', err);
  }
}

export function hasWindow() {
  return !!win;
}

export function getLastWindowError() {
  return lastError;
}

async function call(method, ...args) {
  if (!win || typeof win[method] !== 'function') return null;
  try {
    return await win[method](...args);
  } catch (err) {
    lastError = err;
    console.warn(`[window] ${method} failed:`, err);
    return null;
  }
}

/** Toggle click-through. `true` makes the whole window transparent to input.
 *  Resolves to `true` only when the IPC call actually succeeded. */
export async function setIgnoreCursorEvents(ignore) {
  if (!win || typeof win.setIgnoreCursorEvents !== 'function') return false;
  try {
    await win.setIgnoreCursorEvents(!!ignore);
    return true;
  } catch (err) {
    lastError = err;
    console.warn('[window] setIgnoreCursorEvents failed:', err);
    return false;
  }
}

export async function setAlwaysOnTop(value) {
  return call('setAlwaysOnTop', !!value);
}

export async function startDragging() {
  return call('startDragging');
}

export async function closeWindow() {
  return call('close');
}

export async function focusWindow() {
  return call('setFocus');
}

/**
 * Physical position of the window's client area. `innerPosition` shares the
 * origin of the DOM/CSS coordinate space; `outerPosition` includes native
 * chrome, so it is only a fallback for runtimes without the inner call.
 */
async function readWindowPosition() {
  if (innerPositionUsable !== false && typeof win?.innerPosition === 'function') {
    const pos = await call('innerPosition');
    if (pos && typeof pos.x === 'number') {
      innerPositionUsable = true;
      return pos;
    }
    innerPositionUsable = false;
  }
  return call('outerPosition');
}

async function refreshGeometry(force = false) {
  const now = performance.now();
  if (!force && now - geometry.at < 700) return geometry;
  const [pos, scale] = await Promise.all([readWindowPosition(), call('scaleFactor')]);
  if (pos && typeof pos.x === 'number') {
    geometry.x = pos.x;
    geometry.y = pos.y;
    geometry.scale = scale || 1;
    geometry.at = now;
  }
  return geometry;
}

/**
 * Cursor position in this window's CSS coordinate space.
 * Returns `null` when the position is unknown (browser, permission denied…).
 */
export async function cursorLocalPosition() {
  if (!win) return null;
  const [cursor] = await Promise.all([call('cursorPosition'), refreshGeometry()]);
  if (!cursor || typeof cursor.x !== 'number') return null;
  const sx = (cursor.x - geometry.x) / geometry.scale;
  const sy = (cursor.y - geometry.y) / geometry.scale;
  return { x: sx, y: sy };
}

/** Force a geometry refresh (after a native drag, monitor change, …). */
export function invalidateWindowGeometry() {
  geometry.at = 0;
}

/**
 * Unsubscribe the geometry listeners and drop the window handle. Call from the
 * host page's teardown; a no-op when the bridge never initialised.
 */
export function disposeWindowBridge() {
  bridgeDisposed = true;
  for (const off of geometryUnlisteners.splice(0)) {
    try {
      off();
    } catch (err) {
      console.info('[window] geometry unlisten failed', err);
    }
  }
  geometry.at = 0;
  innerPositionUsable = null;
  win = null;
  initPromise = null;
}
