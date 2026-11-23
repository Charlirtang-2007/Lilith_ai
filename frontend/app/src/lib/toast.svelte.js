/** Tiny toast queue. Component: `ToastHost.svelte`. */

let seq = 0;
const timers = new Map();

export const toasts = $state([]);

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number} ttl milliseconds
 */
export function toast(message, type = 'info', ttl = 3600) {
  if (!message) return;
  const id = ++seq;
  toasts.push({ id, message, type });
  if (toasts.length > 4) dismissToast(toasts[0]?.id);
  const timer = setTimeout(() => dismissToast(id), ttl);
  timers.set(id, timer);
  return id;
}

export function dismissToast(id) {
  if (id == null) return;
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  const idx = toasts.findIndex((t) => t.id === id);
  if (idx >= 0) toasts.splice(idx, 1);
}
