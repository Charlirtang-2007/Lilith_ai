import { Live2DRenderer } from './Live2DRenderer.js';

/**
 * 当前只使用 Live2D 渲染。
 * （原 Spine / 分层贴图渲染已移除，避免引入 Spine Runtime 的授权问题。）
 */
export function createRenderer(scene, isExport = false) {
  return new Live2DRenderer(isExport);
}
