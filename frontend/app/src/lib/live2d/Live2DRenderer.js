/**
 * Live2D renderer for a transparent desktop-pet window.
 *
 * Design notes (the things the previous implementation got wrong):
 *  - The Pixi app owns a real, attached canvas. Sizing comes from the host,
 *    never from `window.innerWidth` at load time.
 *  - The model is bottom-anchored inside a root container. Zoom / offsets /
 *    podium-insets are pure layout, so resizing never reloads the model.
 *  - A per-frame "look" layer is injected through `beforeModelUpdate`:
 *    procedural expressions, .exp3 files, lip sync and idle sway are applied
 *    after motion/physics and immediately before Cubism draws.
 *  - Alpha hit testing reads the actual rendered pixel, so click-through
 *    follows the silhouette instead of a rectangular window.
 */

const PIXI = /** @type {any} */ (globalThis).PIXI;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function blendOf(raw) {
  if (raw === 1 || raw === 'Multiply') return 'multiply';
  if (raw === 2 || raw === 'Overwrite') return 'overwrite';
  return 'add';
}

function encodePath(path) {
  return String(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export class Live2DRenderer {
  #host;
  #app;
  #canvas;
  #root;
  #model = null;
  #disposed = false;
  #quality = 'auto';
  #layout = { zoom: 1, offsetX: 0, offsetY: 0, topInset: 92, bottomInset: 8 };
  #base = { x: 0, y: 0, scale: 1 };
  #life = { breath: true, blink: true, mouse: true, sway: true, reduceMotion: false };
  #saved = { breath: null, eyeBlink: null };
  #params = new Map();
  #customDefs = new Map();
  #customMeta = [];
  #currentParams = new Map();
  #targetParams = new Map();
  #currentCustom = new Map();
  #targetCustom = new Map();
  // Per-frame scratch union of "current" and "target" keys. Reused and cleared
  // every frame so the smoothing pass allocates nothing in steady state.
  #scratchIds = new Set();
  #lipIds = [];
  #mouthProvider = null;
  #mouth = 0;
  #bump = 0;
  // Vertical gravity physics (load drop-in only). `#physOffsetY` is the offset
  // from `#base.y`; negative = above the ground plane, 0 = rest.
  #physOffsetY = 0;
  #physVelocity = 0;
  #physActive = false;
  #gravity = 2800;
  #restitution = 0.35;
  #settleVelocity = 60;
  #lastFrameAt = 0;
  #fps = 60;
  #fpsFrames = 0;
  #fpsStarted = 0;
  #pixel = new Uint8Array(4);
  #pixelSupported = true;
  #beforeUpdate = null;
  #onPointerMove = null;
  #onPointerLeave = null;
  #onWebglLost = null;
  #onWebglRestored = null;
  #onVisibility = null;
  #contextLost = false;
  #onContextLost = null;
  #onContextRestored = null;
  #bottomHit = null;
  #hitRect = null;
  #ready = false;
  #loadGeneration = 0;

  /** @param {HTMLElement} host @param {{ quality?: string, onContextLost?: (() => void) | null, onContextRestored?: (() => void) | null }} [options] */
  constructor(host, options = {}) {
    if (!PIXI?.live2d?.Live2DModel) {
      throw new Error('Live2D 运行库未加载：请确认 app.html 中脚本顺序为 pixi → live2d → cubismcore → index');
    }
    if (!host) throw new Error('Live2D 舞台容器不存在');
    this.#host = host;
    this.#quality = options.quality || 'auto';
    this.#onContextLost = options.onContextLost || null;
    this.#onContextRestored = options.onContextRestored || null;

    const app = new PIXI.Application({
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: this.#resolution(),
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.#app = app;

    const canvas = app.view;
    canvas.className = 'live2d-canvas';
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      opacity: '0',
      transition: 'opacity .45s ease',
      touchAction: 'none',
      pointerEvents: 'none',
    });
    host.appendChild(canvas);
    this.#canvas = canvas;

    this.#root = new PIXI.Container();
    this.#root.sortableChildren = false;
    app.stage.addChild(this.#root);

    this.#beforeUpdate = () => this.#applyFrame();
    this.#bindEvents();
    this.resize(host.clientWidth || 1, host.clientHeight || 1);
  }

  #resolution() {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (this.#quality === 'standard') return 1;
    if (this.#quality === 'high') return Math.min(2.5, Math.max(2, dpr));
    return Math.min(2, Math.max(1, dpr));
  }

  #bindEvents() {
    this.#onPointerMove = (event) => {
      if (!this.#life.mouse || !this.#model) return;
      try {
        this.#model.focus(event.clientX, event.clientY);
      } catch {
        /* focus is best-effort */
      }
    };
    this.#onPointerLeave = () => {
      if (!this.#model) return;
      try {
        this.#model.focus(window.innerWidth / 2, window.innerHeight * 0.25);
      } catch {
        /* ignore */
      }
    };
    this.#onWebglLost = (event) => {
      event.preventDefault();
      this.#contextLost = true;
      try {
        if (this.#model) this.#model.autoUpdate = false;
      } catch {
        /* ignore */
      }
      this.#app.stop();
      console.warn('[live2d] WebGL context lost');
      this.#onContextLost?.();
    };
    this.#onWebglRestored = () => {
      this.#contextLost = false;
      // Alpha hit-test may have been disabled after the loss; re-enable it for
      // the freshly restored context (the stage reloads the model itself).
      this.#pixelSupported = true;
      this.#onContextRestored?.();
    };
    this.#onVisibility = () => {
      if (!this.#model) return;
      if (document.hidden) {
        this.#model.autoUpdate = false;
        this.#app.stop();
      } else {
        this.#model.autoUpdate = true;
        this.#lastFrameAt = performance.now();
        this.#app.start();
      }
    };
    window.addEventListener('pointermove', this.#onPointerMove);
    document.addEventListener('pointerleave', this.#onPointerLeave);
    window.addEventListener('blur', this.#onPointerLeave);
    document.addEventListener('visibilitychange', this.#onVisibility);
    this.#canvas.addEventListener('webglcontextlost', this.#onWebglLost);
    this.#canvas.addEventListener('webglcontextrestored', this.#onWebglRestored);
  }

  #unbindEvents() {
    window.removeEventListener('pointermove', this.#onPointerMove);
    document.removeEventListener('pointerleave', this.#onPointerLeave);
    window.removeEventListener('blur', this.#onPointerLeave);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#canvas.removeEventListener('webglcontextlost', this.#onWebglLost);
    this.#canvas.removeEventListener('webglcontextrestored', this.#onWebglRestored);
  }

  getCanvas() {
    return this.#canvas;
  }

  get ready() {
    return this.#ready;
  }

  get fps() {
    return Math.round(this.#fps);
  }

  /**
   * Load (or reload) a model. Returns metadata for the settings UI.
   * @param {{ modelUrl?: string, modelDirUrl?: string, customExpressions?: Array<{id:string,label?:string,file:string}>, reduceMotion?: boolean, onProgress?: ((value:number,label:string)=>void) | null }} [options]
   */
  async load({ modelUrl, modelDirUrl, customExpressions = [], reduceMotion, onProgress } = {}) {
    const generation = ++this.#loadGeneration;
    if (this.#disposed) return null;
    const progress = (value, label) => onProgress?.(clamp(value, 0, 1), label);

    progress(0.08, '连接模型');
    this.#destroyModel();
    this.#ready = false;
    this.#canvas.style.opacity = '0';
    this.#currentParams.clear();
    this.#targetParams.clear();
    this.#currentCustom.clear();
    this.#targetCustom.clear();
    this.#customDefs.clear();
    this.#customMeta = [];
    this.#params.clear();
    this.#mouth = 0;
    this.#bump = 0;
    this.#physOffsetY = 0;
    this.#physVelocity = 0;
    this.#physActive = false;
    this.#life.reduceMotion = Boolean(reduceMotion);

    if (!modelUrl) throw new Error('模型地址为空');
    try {
      PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;
    } catch {
      /* older/newer Pixi */
    }

    progress(0.18, '读取模型');
    let model;
    try {
      model = await PIXI.live2d.Live2DModel.from(modelUrl, {
        autoInteract: false,
        autoUpdate: true,
      });
    } catch (err) {
      throw new Error(`模型加载失败：${err?.message || err}`);
    }
    if (generation !== this.#loadGeneration || this.#disposed) {
      model.destroy({ children: true, texture: true, baseTexture: true });
      return null;
    }

    this.#model = model;
    this.#ready = true;
    model.interactive = false;
    model.anchor.set(0.5, 1);
    this.#root.addChild(model);

    const internal = model.internalModel;
    this.#saved.breath = internal?.breath || null;
    this.#saved.eyeBlink = internal?.eyeBlink || null;
    this.#lipIds = internal?.motionManager?.lipSyncIds || [];
    if (!this.#lipIds.length) this.#lipIds = ['ParamMouthOpenY'];

    const core = internal?.coreModel;
    if (core) {
      const ids = core._parameterIds || core._model?.parameters?.ids || [];
      const minimums = core._parameterMinimumValues;
      const maximums = core._parameterMaximumValues;
      ids.forEach((id, index) => {
        if (!id) return;
        this.#params.set(id, {
          index,
          min: minimums ? minimums[index] : -1,
          max: maximums ? maximums[index] : 1,
        });
      });
    }

    internal.on('beforeModelUpdate', this.#beforeUpdate);
    this.#applyLife();
    this.#lastFrameAt = performance.now();
    this.#fpsStarted = this.#lastFrameAt;
    this.resize(this.#host.clientWidth || 1, this.#host.clientHeight || 1);

    progress(0.55, '编排表情');
    const loaded = await this.#loadCustomExpressions(modelDirUrl, customExpressions);
    if (generation !== this.#loadGeneration || this.#disposed || !this.#model) return null;
    this.#customMeta = loaded;

    this.#applyLayout();
    if (this.#life.reduceMotion || document.hidden) {
      // Reduced motion or a hidden tab: land immediately, no fall / bounce.
      this.#physOffsetY = 0;
      this.#physVelocity = 0;
      this.#physActive = false;
    } else {
      this.#dropIn();
    }
    this.#applyTransform();
    this.#canvas.style.opacity = '1';
    progress(1, '就绪');

    const motions = internal?.motionManager?.definitions || {};
    const motionCount = Object.values(motions).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0
    );

    console.info(
      `%c[live2d] ${model.internalModel?.settings?.name || 'model'} ready`,
      'color:#a9c9ff',
      `${Math.round(internal?.originalWidth || 0)}×${Math.round(internal?.originalHeight || 0)}`,
      `${this.#params.size} params`,
      `${motionCount} motions`,
      `${loaded.length} expressions`
    );

    return {
      name: internal?.settings?.name || 'Live2D',
      width: Math.round(internal?.originalWidth || 0),
      height: Math.round(internal?.originalHeight || 0),
      parameters: this.#params.size,
      motions: motionCount,
      expressions: loaded,
      fps: this.fps,
    };
  }

  async #loadCustomExpressions(modelDirUrl, definitions) {
    if (!Array.isArray(definitions) || !definitions.length) return [];
    const results = [];
    await Promise.all(
      definitions.map(async (definition) => {
        if (!definition?.file || !definition?.id) return;
        try {
          const url = `${modelDirUrl}${encodePath(definition.file)}`;
          const response = await fetch(url, { cache: 'no-cache' });
          if (!response.ok) return;
          const json = await response.json();
          const params = (json?.Parameters || [])
            .filter((item) => item && this.#params.has(item.Id))
            .map((item) => ({
              id: item.Id,
              value: Number(item.Value) || 0,
              blend: blendOf(item.Blend),
            }));
          if (!params.length) return;
          this.#customDefs.set(definition.id, params);
          results.push({ id: definition.id, label: definition.label || definition.id, file: definition.file });
        } catch (err) {
          console.info(`[live2d] expression skipped: ${definition.file}`, err?.message || err);
        }
      })
    );
    // Preserve the configured order, not the network completion order.
    return definitions
      .filter((definition) => results.some((item) => item.id === definition.id))
      .map((definition) => results.find((item) => item.id === definition.id));
  }

  resize(width, height) {
    if (this.#disposed || !this.#app) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.#app.renderer.resize(w, h);
    this.#applyLayout();
  }

  /** @param {{zoom?:number, offsetX?:number, offsetY?:number, topInset?:number, bottomInset?:number}} next */
  layout(next = {}) {
    Object.assign(this.#layout, next);
    this.#applyLayout();
  }

  #applyLayout() {
    if (!this.#model || !this.#app) return;
    const screen = this.#app.renderer.screen;
    const w = screen.width || this.#host.clientWidth || 1;
    const h = screen.height || this.#host.clientHeight || 1;
    const ow = this.#model.internalModel?.originalWidth || 1;
    const oh = this.#model.internalModel?.originalHeight || 1;
    const { zoom, offsetX, offsetY, topInset, bottomInset } = this.#layout;

    const availableH = Math.max(40, h - topInset - bottomInset);
    const availableW = Math.max(40, w - 8);
    const scale = Math.min(availableW / ow, availableH / oh) * zoom;
    const drawHeight = oh * scale;
    const x = w / 2 + (offsetX / 100) * w;
    // When zoomed in, keep the head anchored under the top inset and let the
    // feet overflow below the dock; when zoomed out, centre the spare space.
    const y =
      (drawHeight <= availableH
        ? topInset + (availableH + drawHeight) / 2
        : topInset + drawHeight) + (offsetY / 100) * h;

    this.#hitRect = {
      x: x - (ow * scale) / 2,
      y: y - drawHeight,
      width: ow * scale,
      height: drawHeight,
    };
    this.#base = { x, y, scale };
    this.#bottomHit = null;
    // Vertical placement is owned by the gravity physics (`#physOffsetY`);
    // a resize recomputes `#base` without clobbering an in-flight drop.
    this.#applyTransform();
  }

  /** Single source of truth for root placement: base + per-frame drop offset. */
  #applyTransform() {
    if (!this.#root) return;
    const bumpScale = this.#bump > 0.001 ? 1 + this.#bump * 0.014 : 1;
    this.#root.position.x = this.#base.x;
    this.#root.position.y = this.#base.y + this.#physOffsetY;
    this.#root.scale.set(this.#base.scale * bumpScale);
    this.#root.rotation = 0;
  }

  /** Start the load fall: the model enters from above the window top. */
  #dropIn() {
    const scale = this.#base.scale;
    const oh = this.#model?.internalModel?.originalHeight || 0;
    const drawHeight = oh * scale;
    this.#physOffsetY = -(this.#base.y + drawHeight + 16);
    this.#physVelocity = 0;
    this.#physActive = true;
  }

  /** Top-centre of the rendered character (useful for bubbles / debugging). */
  getHeadPoint() {
    if (!this.#model) return { x: 0, y: 0 };
    const ow = this.#model.internalModel?.originalWidth || 0;
    const oh = this.#model.internalModel?.originalHeight || 0;
    return {
      x: this.#base.x - (ow * this.#base.scale) / 2,
      y: this.#base.y - oh * this.#base.scale,
    };
  }

  setQuality(quality) {
    const next = quality || 'auto';
    if (this.#quality === next) return;
    this.#quality = next;
    if (this.#disposed || !this.#app) return;
    try {
      this.#app.renderer.resolution = this.#resolution();
      // Render target changed: alpha hit-test is valid again.
      this.#pixelSupported = true;
      this.resize(this.#host.clientWidth || 1, this.#host.clientHeight || 1);
    } catch (err) {
      console.warn('[live2d] quality change failed', err);
    }
  }

  setOpacity(opacity) {
    this.#canvas.style.opacity = String(clamp(Number(opacity) || 1, 0.2, 1));
  }

  setLife(next = {}) {
    Object.assign(this.#life, next);
    this.#applyLife();
    if (!this.#life.mouse) {
      try {
        this.#model?.focus(window.innerWidth / 2, window.innerHeight * 0.25);
      } catch {
        /* ignore */
      }
    }
  }

  #applyLife() {
    const internal = this.#model?.internalModel;
    if (!internal) return;
    if ('breath' in this.#life) {
      internal.breath = this.#life.breath ? this.#saved.breath : null;
    }
    if ('blink' in this.#life) {
      internal.eyeBlink = this.#life.blink ? this.#saved.eyeBlink : null;
    }
  }

  setMouthProvider(provider) {
    this.#mouthProvider = typeof provider === 'function' ? provider : null;
  }

  /** Fade the whole look layer to a new expression. */
  applyLook(look, { immediate = false } = {}) {
    const params = look?.params || {};
    const custom = look?.custom || {};
    this.#targetParams.clear();
    for (const [id, value] of Object.entries(params)) {
      if (!this.#params.has(id)) continue;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric === 0) continue;
      this.#targetParams.set(id, numeric);
    }
    this.#targetCustom.clear();
    for (const [id, weight] of Object.entries(custom)) {
      if (!this.#customDefs.has(id)) continue;
      const numeric = Number(weight);
      if (!Number.isFinite(numeric) || numeric <= 0) continue;
      this.#targetCustom.set(id, clamp(numeric, 0, 1));
    }
    if (immediate) {
      this.#currentParams = new Map(this.#targetParams);
      this.#currentCustom = new Map(this.#targetCustom);
    }
  }

  clearLook() {
    this.applyLook({ params: {}, custom: {} });
  }

  poke() {
    this.#bump = 1;
  }

  /**
   * Is the rendered character under this client-space point?
   * Uses the actual alpha channel with a small forgiving radius.
   */
  hitTest(clientX, clientY, radius = 7) {
    if (!this.#model || this.#contextLost || this.#disposed) return false;
    const rect = this.#canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return false;

    // Cheap bounding-box reject before touching the GPU. `#hitRect` and the
    // canvas CSS local coords share the same logical space (canvas top-left is
    // the origin), so compare in local coords — never in viewport coords.
    const box = this.#hitRect;
    if (!box) return false;
    const pad = radius + 6;
    const inBox =
      localX >= box.x - pad &&
      localX <= box.x + box.width + pad &&
      localY >= box.y - pad &&
      localY <= box.y + box.height + pad;
    if (!inBox) return false;

    if (this.#pixelSupported) {
      const offsets = [
        [0, 0],
        [radius, 0],
        [-radius, 0],
        [0, radius],
        [0, -radius],
      ];
      for (const [dx, dy] of offsets) {
        const alpha = this.#sampleAlpha(localX + dx, localY + dy);
        if (alpha == null) break;
        if (alpha > 18) return true;
      }
      if (this.#pixelSupported) return false;
    }

    // Fallback when alpha sampling is unavailable: the model's bounding box
    // (which we already passed above).
    return true;
  }

  #sampleAlpha(x, y) {
    const gl = this.#app?.renderer?.gl;
    if (!gl || gl.isContextLost?.()) return null;
    const resolution = this.#app.renderer.resolution || 1;
    const px = Math.floor(x * resolution);
    const py = this.#canvas.height - 1 - Math.floor(y * resolution);
    if (px < 0 || py < 0 || px >= this.#canvas.width || py >= this.#canvas.height) return 0;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.#pixel);
      return this.#pixel[3];
    } catch (err) {
      this.#pixelSupported = false;
      console.info('[live2d] alpha hit-test unavailable', err);
      return null;
    }
  }

  /** Inject the expression / lip sync / idle layer into the render loop. */
  #applyFrame() {
    const model = this.#model;
    if (!model || this.#disposed) return;
    const core = model.internalModel?.coreModel;
    if (!core) return;

    const now = performance.now();
    let dt = (now - this.#lastFrameAt) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    this.#lastFrameAt = now;

    this.#fpsFrames++;
    if (now - this.#fpsStarted >= 600) {
      this.#fps = (this.#fpsFrames * 1000) / (now - this.#fpsStarted);
      this.#fpsFrames = 0;
      this.#fpsStarted = now;
    }

    const smooth = 1 - Math.exp(-dt / 0.12);
    const ids = this.#scratchIds;
    ids.clear();
    for (const id of this.#currentParams.keys()) ids.add(id);
    for (const id of this.#targetParams.keys()) ids.add(id);
    for (const id of ids) {
      const target = this.#targetParams.get(id) || 0;
      const current = this.#currentParams.get(id) || 0;
      const next = current + (target - current) * smooth;
      if (Math.abs(next - target) < 0.001 && Math.abs(target) < 0.001) {
        this.#currentParams.delete(id);
      } else {
        this.#currentParams.set(id, next);
      }
    }
    ids.clear();
    for (const id of this.#currentCustom.keys()) ids.add(id);
    for (const id of this.#targetCustom.keys()) ids.add(id);
    for (const id of ids) {
      const target = this.#targetCustom.get(id) || 0;
      const current = this.#currentCustom.get(id) || 0;
      const next = current + (target - current) * smooth;
      if (Math.abs(next - target) < 0.002 && Math.abs(target) < 0.002) {
        this.#currentCustom.delete(id);
      } else {
        this.#currentCustom.set(id, next);
      }
    }

    try {
      for (const [id, value] of this.#currentParams) {
        if (Math.abs(value) > 0.001) core.addParameterValueById(id, value, 1);
      }

      for (const [id, weight] of this.#currentCustom) {
        const definitions = this.#customDefs.get(id);
        if (!definitions) continue;
        for (const parameter of definitions) {
          if (parameter.blend === 'multiply') {
            core.multiplyParameterValueById(parameter.id, parameter.value, weight);
          } else if (parameter.blend === 'overwrite') {
            core.setParameterValueById(parameter.id, parameter.value, weight);
          } else {
            core.addParameterValueById(parameter.id, parameter.value, weight);
          }
        }
      }

      // Lip sync (falls back to the standard mouth parameter).
      let mouthTarget = 0;
      if (this.#mouthProvider) {
        try {
          mouthTarget = clamp(Number(this.#mouthProvider()) || 0, 0, 1);
        } catch {
          mouthTarget = 0;
        }
      }
      this.#mouth += (mouthTarget - this.#mouth) * (1 - Math.exp(-dt / 0.045));
      if (this.#mouth > 0.003) {
        for (const id of this.#lipIds) core.addParameterValueById(id, this.#mouth * 0.82, 1);
      }

      // A whisper of idle sway keeps the character from reading as a still
      // image even when the model ships no idle motion.
      if (this.#life.sway) {
        const t = now / 1000;
        const body =
          Math.sin(t * 0.23) * 0.55 + Math.sin(t * 0.61 + 1.7) * 0.22 + Math.sin(t * 0.11) * 0.18;
        core.addParameterValueById('ParamBodyAngleZ', body * 0.42, 1);
        core.addParameterValueById('ParamAngleZ', body * 0.14, 1);
        core.addParameterValueById('ParamBodyAngleX', Math.sin(t * 0.17 + 0.4) * 0.7, 1);
      }

      // Vertical gravity: load drop + poke hop, integrated on the same `dt`.
      // `#physOffsetY` is negative above the ground plane (0 = rest position).
      if (this.#physActive) {
        this.#physVelocity += this.#gravity * dt;
        this.#physOffsetY += this.#physVelocity * dt;
        if (this.#physOffsetY > 0) {
          this.#physOffsetY = 0;
          this.#physVelocity = -this.#physVelocity * this.#restitution;
          if (Math.abs(this.#physVelocity) <= this.#settleVelocity) {
            this.#physOffsetY = 0;
            this.#physVelocity = 0;
            this.#physActive = false;
          }
        }
      }

      // Decay the poke squash & stretch (no vertical lift — gravity owns that).
      if (this.#bump > 0.001) {
        this.#bump *= Math.exp(-dt * 6.2);
        if (this.#bump < 0.001) this.#bump = 0;
      }

      // Re-apply placement every frame so a resize never clobbers a drop.
      this.#applyTransform();
    } catch (err) {
      // Never spam the console every frame.
      if (!this.#frameErrorLogged) {
        this.#frameErrorLogged = true;
        console.warn('[live2d] look layer error', err);
      }
    }
  }

  #frameErrorLogged = false;

  #destroyModel() {
    if (!this.#model) return;
    const model = this.#model;
    this.#model = null;
    try {
      model.internalModel?.off?.('beforeModelUpdate', this.#beforeUpdate);
    } catch {
      /* ignore */
    }
    try {
      this.#root.removeChild(model);
    } catch {
      /* ignore */
    }
    try {
      model.destroy({ children: true, texture: true, baseTexture: true });
    } catch (err) {
      console.warn('[live2d] model destroy failed', err);
    }
  }

  /** Small, non-private snapshot used by devtools / visual checks. */
  getDebugState() {
    const round = (map) =>
      Object.fromEntries([...map].map(([key, value]) => [key, Math.round(value * 1000) / 1000]));
    return {
      ready: this.#ready,
      fps: this.fps,
      layout: { ...this.#layout },
      base: { ...this.#base },
      currentParams: round(this.#currentParams),
      targetParams: round(this.#targetParams),
      currentCustom: round(this.#currentCustom),
      targetCustom: round(this.#targetCustom),
      expressions: this.#customMeta,
      mouth: Math.round(this.#mouth * 1000) / 1000,
    };
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unbindEvents();
    this.#destroyModel();
    try {
      this.#app.destroy(true, { children: true, texture: true, baseTexture: true });
    } catch (err) {
      console.warn('[live2d] app destroy failed', err);
    }
    this.#canvas.remove();
  }
}
