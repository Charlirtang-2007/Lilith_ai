declare global {
  interface Window {
    __TAURI__?: any;
    __TAURI_INTERNALS__?: any;
    webkitAudioContext?: typeof AudioContext;
    __lilithRenderer?: any;
  }
  const PIXI: any;
}
export {};
