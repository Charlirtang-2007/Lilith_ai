/**
 * 渲染器基类：只保留桌面宠物用得到的最小接口。
 * 具体实现见 Live2DRenderer.js。
 */
export class BaseRenderer {
  constructor(isExport = false) {
    this.isExport = isExport;
    this._scale = 1;
  }

  getCanvas() {
    throw new Error('getCanvas() 未实现');
  }

  async load(dirName, scene) {
    throw new Error('load() 未实现');
  }

  dispose() {}

  resize(width, height) {}

  getOriginalSize() {
    return { width: 0, height: 0 };
  }

  applyTransform(scale = 1, moveX = 0, moveY = 0, rotate = 0) {
    this._scale = scale;
    this._moveX = moveX;
    this._moveY = moveY;
    this._rotate = rotate;
  }

  resetTransform() {
    this.applyTransform(1, 0, 0, 0);
  }

  getAnimations() {
    return [];
  }

  async setAnimation(value) {}

  getExpressions() {
    return null;
  }

  setExpression(value) {}

  setPaused(paused) {}

  setSpeed(speed) {}

  setTextureFilter(filter) {}

  setAlphaMode(mode) {}

  render() {}
}
