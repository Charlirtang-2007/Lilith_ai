/** 轻量通知：只写控制台 + 一个 DOM toast，不打扰桌宠界面 */
export function showNotification(message, type = 'error', duration = 3500) {
  const log = type === 'error' ? console.error : console.log;
  log(`[${type}] ${message}`);
  if (typeof document === 'undefined') return;
  try {
    const el = document.createElement('div');
    el.textContent = message;
    Object.assign(el.style, {
      position: 'fixed',
      left: '50%',
      bottom: '12px',
      transform: 'translateX(-50%)',
      padding: '6px 12px',
      borderRadius: '10px',
      background: type === 'error' ? 'rgba(200,40,40,.85)' : 'rgba(0,0,0,.7)',
      color: '#fff',
      fontSize: '12px',
      zIndex: 9999,
      pointerEvents: 'none',
      transition: 'opacity .3s',
    });
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, duration);
  } catch {
    /* 忽略 */
  }
}
