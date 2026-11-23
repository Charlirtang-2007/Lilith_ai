import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [sveltekit()],

  // Tauri 开发 / 构建专用
  // 预构建 Tauri API，避免运行时首次加载触发页面整页重载
  optimizeDeps: {
    include: [
      '@tauri-apps/api/window',
      '@tauri-apps/api/webviewWindow',
      '@tauri-apps/api/core',
      '@tauri-apps/api/dpi',
      '@tauri-apps/api/event',
    ],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
