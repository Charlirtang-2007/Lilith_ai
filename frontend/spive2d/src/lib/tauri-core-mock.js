// src/lib/tauri-core-mock.js

/**
 * 直接返回原路径，不做任何转换（浏览器环境下不需要 Tauri 的路径转换）
 */
export const convertFileSrc = (path) => path;

/**
 * 模拟 invoke，在浏览器中直接返回 undefined 并给出控制台提示
 * 如果有特定命令需要模拟返回值，可以在这里扩展
 */
export const invoke = async (cmd, args) => {
  console.warn(`[Tauri mock] invoke called: ${cmd}`, args);
  return undefined;
};

// 如果你的项目还用到其他 core API（如 transformCallback），
// 可以照此模式继续补充，目前这两个是最常见的。