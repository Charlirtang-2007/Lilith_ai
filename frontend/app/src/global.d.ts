declare global {
  interface Window {
    __TAURI__?: any;
    __TAURI_INTERNALS__?: any;
    webkitAudioContext?: typeof AudioContext;
    currentAudio?: HTMLAudioElement | null;
    __lilithIdleTimer?: ReturnType<typeof setInterval>;
  }
  const PIXI: any;
}
export {};
