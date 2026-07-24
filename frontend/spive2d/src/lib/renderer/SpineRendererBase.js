import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { BaseRenderer } from './BaseRenderer.js';
import {
  setupSpineAssetManager,
  initializeSkeleton,
  calculateSpineMVP,
  setupAtlas,
  updateAtlasRegions,
  parseAtlasDeclaredSizes,
  normalizeAtlasText,
  createCanvas
} from './SpineCommon.js';

export class SpineRendererBase extends BaseRenderer {
  _canvas;
  _spine = null;
  _ctx = null;
  _shader = null;
  _batcher = null;
  _skeletonRenderer = null;
  _assetManager = null;
  _mvp = null;
  _dirName = '';
  _fileNames = [];
  _skeletons = {};
  _animationStates = [];
  _alphaMode = 'pma';
  _paused = false;
  _speed = 1.0;
  _attachmentsCache = {};
  _activeSkins = null;
  _isFileJson = false;

  _backendUrl = 'http://localhost:8000/api/current_emotion';
  _randomTimer = null;
  _emotionPollingTimer = null;
  _emotionAbortController = null;
  _currentAnimationName = '';

  constructor(canvas, spineLib, isExport = false) {
    super(isExport);
    this._canvas = canvas;
    this._spine = spineLib;
    this._bgOrEffectCache = new Map();
    this._probeSkeletons = new Map();
    this._textureFilter = 'linear';
    this._loadedAtlases = [];

    // 情绪动画映射表（已修正拼写，保留原始动画名）
    this._emotionAnimConfig = {
      'angry': {
        day: ['emoji_angry_1', 'emoji_angry_2'],
        night: ['stand_pajamas_tsundere'],
      },
      'embarrassed': {
        day: ['emoji_awkward_1'],
        night: ['emoji_awkward_1'],
      },
      'calm': {
        day: ['emoji_calm_1'],
        night: ['emoji_calm_1'],
      },
      'daze': {
        day: ['emoji_daze_1', 'emoji_daze_2', 'emoji_daze_3'],
        night: ['emoji_daze_1', 'emoji_daze_2', 'emoji_daze_3'],
      },
      'fear': {
        day: ['emoji_fear_1', 'emoji_fear_2'],
        night: ['emoji_fear_1', 'emoji_fear_2'],
      },
      'blink': {
        day: ['emoji_front_blink'],
        night: ['emoji_front_blink'],
      },
      'sad': {
        day: ['emoji_sad_1', 'emoji_sad_2'],
        night: ['emoji_sad_1', 'emoji_sad_2'],
      },
      'sleepy': {
        day: ['emoji_sleepy_1', 'emoji_sleepy_2', 'emoji_sleepy_3'],
        night: ['emoji_sleepy_1', 'emoji_sleepy_2', 'emoji_sleepy_3'],
      },
      'smile': {
        day: ['emoji_smile_1', 'emoji_smile_2', 'emoji_smile_3', 'emoji_smile_4'],
        night: ['emoji_smile_1', 'emoji_smile_2', 'emoji_smile_3', 'emoji_smile_4'],
      },
      'surprise': {
        day: ['emoji_surprise_1', 'emoji_surprise_2'],
        night: ['emoji_surprise_1', 'emoji_surprise_2'],
      },
      'wronged': {
        day: ['emoji_wronged_1', 'emoji_wronged_2'],
        night: ['emoji_wronged_1', 'emoji_wronged_2'],
      },
      'lie_down': {
        day: ['liedown_pajamas_flirt', 'liedown_pajamas_idle', 'lie_pajamas_mumble', 'liedown_pajamas_shake_leg'],
        night: ['liedown_pajamas_flirt', 'liedown_pajamas_idle', 'lie_pajamas_mumble', 'liedown_pajamas_shake_leg'],
      },
      'stand': {
        day: ['show_03_idle'],
        night: ['stand_pajamas_idle'],
      },
      'sleep': {
        day: ['lie_pajamas_sleep'],
        night: ['lie_pajamas_sleep'],
      },
      'show': {
        day: ['show_01', 'show_02'],
        night: ['show_01', 'show_02'],
      },
      'sit': {
        day: ['sit_casual_idle', 'sit_casual_shake_leg', 'sit_casual_turnhead'],
        night: ['sit_casual_idle', 'sit_casual_shake_leg', 'sit_casual_turnhead'],
      },
      'birthday': {
        day: ['stand_casual_cake_end', 'stand_casual_cake_idle', 'stand_casual_cake_up'],
        night: ['stand_casual_cake_end', 'stand_casual_cake_idle', 'stand_casual_cake_up'],
      },
      'neutral': {
        day: ['show_03_idle'],
        night: ['stand_pajamas_idle'],
      },
    };

    this._scale = 1;
    this._moveX = 0;
    this._moveY = 0;
    this._rotate = 0;
    this._emotionSequenceId = 0;       // 用于废弃过时的情绪完成回调
    this._pendingEmotionTimer = null;  // 等待切 idle 的定时器
  }

  setBackendUrl(url) {
    this._backendUrl = url;
  }

  // =================== 时间判断（精确到 22:30） ===================
  _getTimeOfDay() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    return (hour > 22 || (hour === 22 && minute >= 30) || hour < 6) ? 'night' : 'day';
  }

  /**
   * 获取当前时段应该循环的待机动画列表（idle）
   */
  _getCurrentIdleList() {
    if (this._getTimeOfDay() === 'day') {
      return [
        'show_03_idle',
        'emoji_front_blink',
        'sit_casual_idle',
        'sit_casual_shake_leg',
        'sit_casual_turnhead',
      ];
    } else {
      return [
        'stand_pajamas_idle',
        'liedown_pajamas_flirt',
        'liedown_pajamas_idle',
        'lie_pajamas_mumble',
        'liedown_pajamas_shake_leg',
        'lie_pajamas_sleep',
        'sit_casual_idle',
      ];
    }
  }

  // =================== 自动随机待机动画（仅从当前时段 idle 中选择，默认 300 秒） ===================
  startAutoRandomAnim(interval = 300000) {
  console.log('🔧 [DEBUG] startAutoRandomAnim 被调用');
  console.log('🔧 [DEBUG] 传入的 interval:', interval);
  console.trace('🔧 调用栈'); // 打印是谁调用了这个方法

  this.stopAutoRandomAnim();
  this.stopEmotionPolling();

  if (Object.keys(this._skeletons).length === 0) {
    console.warn('⚠️ [DEBUG] 没有骨骼数据，拒绝启动自动待机');
    return;
  }

  let lastAnim = null;
  this._randomTimer = setInterval(() => {
    const pool = this._getCurrentIdleList();
    console.log(`🔧 [DEBUG] 当前时段: ${this._getTimeOfDay()}，待机池:`, pool);
    if (pool.length === 0) return;
    let available = pool;
    if (lastAnim && pool.length > 1) {
      available = pool.filter(name => name !== lastAnim);
    }
    const randomAnim = available[Math.floor(Math.random() * available.length)];
    lastAnim = randomAnim;
    console.log(`🔧 [DEBUG] 自动切换待机: ${randomAnim}`);
    this._setAnimationDirect(randomAnim, true);
  }, interval);

  console.log(`✅ 自动待机动画已启动（${this._getTimeOfDay() === 'day' ? '白天' : '夜晚'}），间隔 ${interval / 1000} 秒`);
}

  stopAutoRandomAnim() {
    if (this._randomTimer) {
      clearInterval(this._randomTimer);
      this._randomTimer = null;
      console.log('🔄 自动待机动画已停止');
    }
  }

  // =================== 情绪轮询 ===================
  startEmotionPolling(interval = 3000) {
    this.stopAutoRandomAnim();
    this.stopEmotionPolling();
    const poll = async () => {
      try {
        const response = await fetch(this._backendUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.animation) this._applyEmotionAnimation(data.animation);
        }
      } catch (e) {
        console.warn('情绪轮询失败:', e);
      }
    };
    poll();
    this._emotionPollingTimer = setInterval(poll, interval);
    console.log('🔄 情绪轮询已启动，间隔 ' + interval + 'ms');
  }

  stopEmotionPolling() {
    if (this._emotionPollingTimer) {
      clearInterval(this._emotionPollingTimer);
      this._emotionPollingTimer = null;
      console.log('🔄 情绪轮询已停止');
    }
  }

      _applyEmotionAnimation(emotion) {
    // 1. 清除上一次还未触发的 idle 切换定时器
    if (this._pendingEmotionTimer) {
      clearTimeout(this._pendingEmotionTimer);
      this._pendingEmotionTimer = null;
    }

    // 2. 递增情绪序列号，使之前注册的所有 complete 回调失效
    this._emotionSequenceId = (this._emotionSequenceId || 0) + 1;
    const currentSeqId = this._emotionSequenceId;

    // 3. 确定要播放的动画名称（与原有逻辑一致）
    let finalAnimName = emotion;
    if (emotion === 'neutral' && Math.random() < 0.3) {
      finalAnimName = this.getIdleRandomAnim();
    } else {
      const picked = this._pickRandomAnimation(emotion);
      if (picked) finalAnimName = picked;
    }

    // 4. 检查动画是否存在（遍历所有骨架）
    let animExists = false;
    for (const key in this._skeletons) {
      if (this._skeletons[key].skeleton.data.findAnimation(finalAnimName)) {
        animExists = true;
        break;
      }
    }
    if (!animExists) {
      console.warn(`动画 "${finalAnimName}" 不存在，回退到随机 idle`);
      finalAnimName = this.getIdleRandomAnim();
    }

    const isEmotion = this._emotionAnimConfig.hasOwnProperty(emotion);
    const isIdle = this._getCurrentIdleList().includes(finalAnimName);

    // 5. 统计有多少个骨架会播放【非循环】的情绪动画（用于在所有骨架播完后统一切 idle）
    const skeletonKeys = Object.keys(this._skeletons);
    let nonLoopingCount = 0;
    for (const key of skeletonKeys) {
      const entry = this._skeletons[key];
      // 只统计能播放该动画且非 idle 的骨架
      if (entry.skeleton.data.findAnimation(finalAnimName) && !isIdle) {
        nonLoopingCount++;
      }
    }

    // 6. 当所有非循环骨架都播完时，才触发一次 idle 切换
    let completedCount = 0;
    const onOneTrackComplete = () => {
      // 如果在此期间来了新的情绪指令，放弃本次切 idle
      if (this._emotionSequenceId !== currentSeqId) return;
      completedCount++;
      if (completedCount >= nonLoopingCount) {
        // 所有非循环骨架均已结束，延迟 0.8 秒后切入 idle
        this._pendingEmotionTimer = setTimeout(() => {
          // 再次检查序列号，防止在 0.8 秒等待期间新情绪覆盖
          if (this._emotionSequenceId !== currentSeqId) return;
          const idleAnim = this.getIdleRandomAnim();
          for (const k in this._skeletons) {
            const ent = this._skeletons[k];
            if (ent.skeleton.data.findAnimation(idleAnim)) {
              ent.state.setAnimation(0, idleAnim, true);
            } else {
              ent.state.clearTracks();
              ent.skeleton.setToSetupPose();
              ent.state.apply(ent.skeleton);
              ent.skeleton.updateWorldTransform(2);
            }
          }
          this._currentAnimationName = idleAnim;
          this._pendingEmotionTimer = null;
        }, 800);
      }
    };

    // 7. 为每个骨架重置并设置新动画
    for (const key of skeletonKeys) {
      const entry = this._skeletons[key];

      // ★ 关键：强制重置 track 和骨架到 setup pose，确保同名动画也能从头播放
      entry.state.clearTracks();
      entry.skeleton.setToSetupPose();
      entry.state.apply(entry.skeleton);
      entry.skeleton.updateWorldTransform(2);

      if (entry.skeleton.data.findAnimation(finalAnimName)) {
        const loop = isIdle;
        const trackEntry = entry.state.setAnimation(0, finalAnimName, loop);

        // 只有非循环的情绪动画才需要监听结束事件
        if (isEmotion && !isIdle && trackEntry) {
          trackEntry.listener = {
            complete: () => {
              onOneTrackComplete();
            }
          };
        }
      } else {
        // 该骨架没有目标动画 → 直接播放一个随机的 idle，避免静止
        const idleFallback = this.getIdleRandomAnim();
        if (entry.skeleton.data.findAnimation(idleFallback)) {
          entry.state.setAnimation(0, idleFallback, true);
        }
      }
    }

    this._currentAnimationName = finalAnimName;
    console.log('✅ 情绪动画应用完成:', finalAnimName);
  }

  // =================== 辅助方法 ===================
  getRandomShowAnim() {
    return ['show_01', 'show_02'][Math.floor(Math.random() * 2)];
  }

  getIdleRandomAnim() {
    const list = this._getCurrentIdleList();
    return list[Math.floor(Math.random() * list.length)];
  }

  _pickRandomAnimation(emotion) {
    const timeOfDay = this._getTimeOfDay();
    const config = this._emotionAnimConfig[emotion];
    if (config) {
      const candidates = config[timeOfDay] || config.day;
      if (candidates && candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return null;
  }

  _getRandomAnimationName() {
    const anims = this.getAnimations();
    if (anims.length === 0) return null;
    return anims[Math.floor(Math.random() * anims.length)].value;
  }

   _setAnimationDirect(animName, isIdle = false) {
    for (const key in this._skeletons) {
        const entry = this._skeletons[key];
        // 强制重置 track 和骨架姿势，确保待机切换时动画一定从第 0 帧播放
        entry.state.clearTracks();
        entry.skeleton.setToSetupPose();
        entry.state.apply(entry.skeleton);
        entry.skeleton.updateWorldTransform(2);

        if (entry.skeleton.data.findAnimation(animName)) {
            entry.state.setAnimation(0, animName, isIdle);
        } else {
            entry.state.clearTracks();
            entry.skeleton.setToSetupPose();
            entry.state.apply(entry.skeleton);
            entry.skeleton.updateWorldTransform(2);
        }
    }
    this._currentAnimationName = animName;
  }

  // =================== 手动设置动画 ===================
  async setAnimation(value) {
    this.stopAutoRandomAnim();
    this.stopEmotionPolling();


    if (this._emotionAbortController) {
        this._emotionAbortController.abort();
    }
    const abortController = new AbortController();
    this._emotionAbortController = abortController;

    if (value === '') {
        for (const key in this._skeletons) {
            const entry = this._skeletons[key];
            entry.state.clearTracks();
            entry.skeleton.setToSetupPose();
            entry.state.apply(entry.skeleton);
            entry.skeleton.updateWorldTransform(2);
        }
        this._currentAnimationName = '';
        return;
    }

    let emotion = value;
    try {
        const response = await fetch(this._backendUrl, { signal: abortController.signal });
        if (abortController.signal.aborted) return;
        if (response.ok) {
            const data = await response.json();
            if (abortController.signal.aborted) return;
            if (data.animation) emotion = data.animation;
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn('后端请求失败，使用传入的情绪标识:', emotion);
    }
    if (abortController.signal.aborted) return;

        // 直接使用统一的应用函数（该函数内部已处理重置、切 idle 等逻辑）
    this._applyEmotionAnimation(emotion);


}

  // =================== 渲染初始化 ===================
  async initCtx(alphaMode = 'pma') {
    this._alphaMode = alphaMode;
    this._ctx = new this._spine.ManagedWebGLRenderingContext(this._canvas, {
      preserveDrawingBuffer: true,
      alpha: true,
      premultipliedAlpha: true,
      antialias: true
    });
    const gl = this._ctx.gl;
    if (gl) {
      gl.clearColor(0, 0, 0, 0);
      const originalBlendFunc = gl.blendFunc.bind(gl);
      const originalBlendFuncSeparate = gl.blendFuncSeparate.bind(gl);
      const patchBlend = (target) => {
        target.blendFunc = (src, dst) => {
          if (dst === gl.ONE_MINUS_SRC_ALPHA) {
            const srcFactor = this._alphaMode === 'npm' ? gl.SRC_ALPHA : gl.ONE;
            originalBlendFuncSeparate(srcFactor, dst, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          } else if (src === gl.ONE && dst === gl.ONE) {
            originalBlendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
          } else if (src === gl.SRC_ALPHA && dst === gl.ONE) {
            originalBlendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
          } else {
            originalBlendFunc(src, dst);
          }
        };
        target.blendFuncSeparate = (srcRGB, dstRGB, srcAlpha, dstAlpha) => {
          if (dstRGB === gl.ONE_MINUS_SRC_ALPHA) {
            if (srcAlpha === gl.ONE_MINUS_SRC_COLOR) {
              if (this._alphaMode === 'npm') {
                originalBlendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
              } else {
                originalBlendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_COLOR);
              }
            } else {
              originalBlendFuncSeparate(srcRGB, dstRGB, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            }
          } else {
            originalBlendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha);
          }
        };
      };
      patchBlend(gl);
      patchBlend(this._ctx);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, alphaMode === 'unpack');
    }
    this._shader = this._spine.Shader.newTwoColoredTextured(this._ctx);
    this._batcher = new this._spine.PolygonBatcher(this._ctx);
    this._skeletonRenderer = new this._spine.SkeletonRenderer(this._ctx);
    this._mvp = new this._spine.Matrix4();
  }

  async setAlphaMode(mode) {
    this._alphaMode = mode;
    if (this._ctx?.gl) {
      const gl = this._ctx.gl;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, mode === 'unpack');
    }
    if (this._dirName) {
      await this.loadAssets(this._dirName, this._fileNames, this._isFileJson);
      await this._waitForAssets();
      await this.processLoadedAssets();
      if (this._activeSkins) this.applySkins(Array.from(this._activeSkins));
    }
  }

  setSpeed(speed) { this._speed = speed; }
  setPaused(paused) { this._paused = paused; }

  setTextureFilter(filter) {
    this._textureFilter = filter;
    if (this._canvas?.style) {
      this._canvas.style.imageRendering = filter === 'nearest' ? 'pixelated' : 'auto';
    }
    if (!this._spine) return;
    const filterType = filter === 'nearest'
      ? this._spine.TextureFilter.Nearest
      : this._spine.TextureFilter.Linear;
    for (const atlas of this._loadedAtlases) {
      if (!atlas?.pages) continue;
      for (const page of atlas.pages) {
        page.minFilter = filterType;
        page.magFilter = filterType;
        if (page.texture?.setFilters) page.texture.setFilters(filterType, filterType);
      }
    }
    if (this._paused) {
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
      this.render(0, { dpr });
    }
  }

  getCurrentTime() {
    for (const key of this._getSortedSkeletonKeys()) {
      const entry = this._skeletons[key]?.state.tracks[0];
      if (!entry) continue;
      const duration = entry.animation.duration;
      if (duration > 0) return entry.trackTime % duration;
    }
    return 0;
  }

  getFPS() { return 60; }

  _waitForAssets() {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (!this._assetManager || this._assetManager.isLoadingComplete()) resolve();
        else if (Date.now() - start > 10000) {
          console.warn('[SpineRendererBase] Asset loading timed out after 10s');
          resolve();
        } else requestAnimationFrame(check);
      };
      check();
    });
  }

  async loadAssets(dirName, scene, isJson) {
    this._dirName = dirName;
    this._fileNames = scene;
    this._isFileJson = isJson;
    this._skeletons = {};
    this._animationStates = [];
    this._attachmentsCache = {};
    this._bgOrEffectCache = new Map();
    this._probeSkeletons = new Map();
    this._activeSkins = null;
    this._parameterItems = null;
    this._parameterItemsMap = null;
    this._loadedAtlases = [];
    this._assetManager = new this._spine.AssetManager(this._ctx.gl, '');
    setupSpineAssetManager(this._assetManager, this._spine, this._ctx.gl);

    const mainExt = scene.mainExt;
    const atlasExt = scene.atlasExt;
    const normalizedDirName = dirName.endsWith('/') ? dirName : `${dirName}/`;
    const makePath = (name, ext) => `${normalizedDirName}${name}${ext}`;

    const loadModel = (name) => {
      if (!this._isFileJson) this._assetManager.loadBinary(makePath(name, mainExt));
      else this._assetManager.loadText(makePath(name, mainExt));
      this._assetManager.loadTextureAtlas(makePath(name, atlasExt));
    };

    if (scene.isMerged) {
      for (const name of scene.files) loadModel(name);
    } else {
      loadModel(scene.name);
      for (const extraFile of scene.files) {
        if (!extraFile.endsWith('.skel') && !extraFile.endsWith('.json') && !extraFile.endsWith('.asset')) continue;
        loadModel(scene.name + extraFile.substring(0, extraFile.lastIndexOf('.')));
      }
    }
  }

  async processLoadedAssets() {
    const sceneInfo = this._fileNames;
    if (sceneInfo.isMerged) {
      for (let i = 0; i < sceneInfo.files.length; i++) {
        const skel = await this._loadSkeleton(sceneInfo.files[i]);
        if (skel) this._skeletons[String(i)] = skel;
      }
    } else {
      const skel0 = await this._loadSkeleton(sceneInfo.name);
      if (skel0) this._skeletons['0'] = skel0;
      for (let i = 0; i < sceneInfo.files.length; i++) {
        const extraFile = sceneInfo.files[i];
        if (!extraFile.endsWith('.skel') && !extraFile.endsWith('.json') && !extraFile.endsWith('.asset')) continue;
        const name2 = sceneInfo.name + extraFile.substring(0, extraFile.lastIndexOf('.'));
        const skelN = await this._loadSkeleton(name2);
        if (skelN) this._skeletons[String(i + 1)] = skelN;
      }
    }
    this._hideMaskMosaicAttachments();
    this._scheduleFitBounds();
  }
  // 背景/特效判定（直接使用当前 slot 的世界变换）
  _isBackgroundOrEffect(name, attachment, slot) {
    if (!name) return false;
    const cacheKey = `${slot?.data?.name || ''}##${name}`;
    if (this._bgOrEffectCache?.has(cacheKey)) return this._bgOrEffectCache.get(cacheKey);

    const lower = name.toLowerCase();
    const slotName = slot?.data?.name?.toLowerCase() || '';
    const bgEffectRegex = /(?:^|[_/.-])(backgrounds?|bgs?|effects?|effs?|fxs?|efxs?)(?:[_/.-]|$|[0-9])/i;
    if (bgEffectRegex.test(lower) || bgEffectRegex.test(slotName)) {
      this._bgOrEffectCache?.set(cacheKey, true);
      return true;
    }
    const coreRegex = /(chara|character|body|head|face|hair|arm|leg|skirt|cloth|pelvis|neck|hand|foot|torso|spine|chest|hip|bust|skin|sleeve|glove|shoe|socks|weapon|sword|shield|spear|bow|staff|scythe|dress|coat|jacket|cape|wing|tail|horn|ear|eye|mouth|nose)/i;
    if (coreRegex.test(lower) || coreRegex.test(slotName)) {
      this._bgOrEffectCache?.set(cacheKey, false);
      return false;
    }

    const wb = this._getSlotWorldBounds(slot);
    const result = wb && (wb.w > 1000 || wb.h > 1000 || (wb.w > 500 && wb.h > 500));
    this._bgOrEffectCache?.set(cacheKey, result);
    return result;
  }

  _getSlotWorldBounds(slot) {
    const attachment = slot.attachment;
    if (!attachment) return null;
    let vertices;
    if (attachment.computeWorldVertices) {
      if (typeof attachment.worldVerticesLength === 'number') {
        vertices = new Float32Array(attachment.worldVerticesLength);
        attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
      } else if (slot.bone) {
        vertices = new Float32Array(8);
        const skeleton = slot.skeleton || (typeof slot.getSkeleton === 'function' ? slot.getSkeleton() : null) || slot.bone.skeleton;
        const version = skeleton?.data?.version || '';
        const verNum = parseFloat(version) || 0;
        if (verNum >= 4.1) {
          attachment.computeWorldVertices(slot, vertices, 0, 2);
        } else {
          attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
        }
      }
    }
    if (vertices) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let hasNan = false;
      for (let i = 0; i < vertices.length; i += 2) {
        const x = vertices[i], y = vertices[i + 1];
        if (isNaN(x) || isNaN(y)) { hasNan = true; break; }
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      if (!hasNan) return { w: maxX - minX, h: maxY - minY, minX, maxX, minY, maxY };
    }
    const bone = slot.bone;
    if (bone) {
      let scaleX = Math.abs(bone.scaleX || 1), scaleY = Math.abs(bone.scaleY || 1);
      let curr = bone.parent;
      while (curr) {
        scaleX *= Math.abs(curr.scaleX || 1);
        scaleY *= Math.abs(curr.scaleY || 1);
        curr = curr.parent;
      }
      const w = (attachment.width || 0) * scaleX;
      const h = (attachment.height || 0) * scaleY;
      const x = bone.worldX || 0, y = bone.worldY || 0;
      return { w, h, minX: x - w/2, maxX: x + w/2, minY: y - h/2, maxY: y + h/2 };
    }
    return null;
  }

  _getCoreBounds(skeleton) {
    const coreRegex = /(body|chara|character|head|face|hair|arm|leg|skirt|cloth|pelvis|neck|hand|foot|torso|spine|chest|hip|bust|skin|sleeve|glove|shoe|socks|weapon|sword|shield|spear|bow|staff|scythe|dress|coat|jacket|cape|wing|tail|horn|ear|eye|mouth|nose)/i;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const slot of skeleton.slots) {
      const slotName = slot.data.name;
      const attachmentName = slot.attachment?.name || '';
      if (slot.attachment && (coreRegex.test(slotName) || coreRegex.test(attachmentName))) {
        if (this._isBackgroundOrEffect(slot.attachment.name, slot.attachment, slot)) continue;
        const wb = this._getSlotWorldBounds(slot);
        if (wb) {
          minX = Math.min(minX, wb.minX); minY = Math.min(minY, wb.minY);
          maxX = Math.max(maxX, wb.maxX); maxY = Math.max(maxY, wb.maxY);
        }
      }
    }
    if (minX !== Infinity) return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    return null;
  }

  _getFitBounds(skel, maxRatio = 1.15) {
    let bounds = skel.bounds;
    if (skel.fitBounds && skel.bounds) {
      const fitW = skel.fitBounds.size.x;
      const fitH = skel.fitBounds.size.y;
      const setupW = skel.bounds.size.x;
      const setupH = skel.bounds.size.y;
      const fitCenterX = skel.fitBounds.offset.x + fitW * 0.5;
      const setupCenterX = skel.bounds.offset.x + setupW * 0.5;
      if (setupW > 400 && setupH > 400) {
        const isTooSmall = fitW < 0.75 * setupW || fitH < 0.75 * setupH;
        if (isTooSmall) {
          const setupSkewed = Math.abs(setupCenterX) > setupW * 0.2;
          const centerDiverged = Math.abs(fitCenterX - setupCenterX) > setupW * 0.2;
          bounds = (setupSkewed || centerDiverged) ? skel.fitBounds : skel.bounds;
        } else {
          const isBloated = (fitW > 1.15 * setupW && fitW < 2.0 * setupW) ||
            (fitH > 1.15 * setupH && fitH < 2.0 * setupH);
          if (isBloated) bounds = skel.bounds;
          else bounds = skel.fitBounds;
        }
      } else {
        bounds = skel.fitBounds;
      }
    } else {
      bounds = (skel.fitBounds) ? skel.fitBounds : skel.bounds;
    }

    let result = bounds;
    if (bounds && bounds.size && bounds.offset) {
      const w = bounds.size.x;
      const h = bounds.size.y;
      if (w > 0 && h > 0) {
        const left = bounds.offset.x;
        const right = bounds.offset.x + w;
        const centerX = bounds.offset.x + bounds.size.x * 0.5;
        const originNearCenter = Math.abs(centerX) <= w * 0.12;
        const maxExtent = originNearCenter
          ? Math.max(Math.abs(left), Math.abs(right))
          : (w * 0.5);
        const symWidth = 2 * maxExtent;
        const centerY = bounds.offset.y + bounds.size.y * 0.5;
        const fitCenterX = originNearCenter ? 0 : centerX;
        if (symWidth > maxRatio * h) {
          const clampedW = maxRatio * h;
          result = {
            offset: { x: fitCenterX - clampedW * 0.5, y: centerY - h * 0.5 },
            size: { x: clampedW, y: h }
          };
        } else {
          result = {
            offset: { x: fitCenterX - symWidth * 0.5, y: centerY - h * 0.5 },
            size: { x: symWidth, y: h }
          };
        }
      }
    }
    return result;
  }

  _getPrimarySkeleton() {
    const entries = Object.entries(this._skeletons || {});
    if (entries.length === 0) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const [key, entry] of entries) {
      if (!entry?.skeleton) continue;
      const core = this._getCoreBounds(entry.skeleton);
      const fit = entry.fitBounds || entry.bounds;
      const anim = entry._ab?.normalUnion;
      const coreArea = (core?.w > 0 && core?.h > 0) ? (core.w * core.h) : 0;
      const fitArea = (fit?.size?.x > 0 && fit?.size?.y > 0) ? (fit.size.x * fit.size.y) : 0;
      const animArea = (anim?.w > 0 && anim?.h > 0) ? (anim.w * anim.h) : 0;
      const name = String(entry.name || '').toLowerCase();
      const bgLike = /(?:^|[_/.-])(bg|backgrounds?|back|shadow|floor|ground)(?:[_/.-]|$)/.test(name);
      const nameWeight = bgLike ? 0.35 : 1.0;
      const score = Math.max(coreArea, animArea * 0.9, fitArea * 0.6) * nameWeight;
      if (score > bestScore) { bestScore = score; best = { key, entry }; }
    }
    if (best) return best;
    const [key, entry] = entries[0];
    return { key, entry };
  }

  _idle() {
    return new Promise((res) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => res(), { timeout: 100 });
      else setTimeout(res, 0);
    });
  }

  _cancelFit() { this._fitToken = (this._fitToken || 0) + 1; }
  _revealCanvas() { if (this._canvas) this._canvas.style.opacity = '1'; }

  _scheduleFitBounds() {
    if (this.isExport) return;
    this._cancelFit();
    this._fitRevealReady = false;
    if (this._revealTimer) clearTimeout(this._revealTimer);
    this._revealTimer = setTimeout(() => { this._fitRevealReady = true; this._revealCanvas(); }, 1200);
    this._computeFitBoundsAsync(this._fitToken);
  }

  async _computeFitBoundsAsync(token) {
    let primaryDone = false;
    for (const key of Object.keys(this._skeletons)) {
      if (token !== this._fitToken || !this._ctx) return;
      const e = this._skeletons[key];
      if (!e) continue;
      const ab = await this._sampleAnimBounds(e, key, token);
      if (token !== this._fitToken || !this._ctx) return;
      if (ab) {
        e._ab = ab;
        const nb = ab.normalUnion;
        if (nb && nb.w > 0 && nb.h > 0 && !ab.weakAnchor) {
          e.fitBounds = { offset: { x: nb.offX, y: nb.offY }, size: { x: nb.w, y: nb.h } };
        }
      }
      if (!primaryDone) {
        primaryDone = true;
        this._fitRevealReady = true;
        if (this._paused) { this.render(0, { dpr: window.devicePixelRatio || 1 }); this._revealCanvas(); }
      }
    }
  }

  async _sampleAnimBounds(entry, key, token, samplesPerSec = 12) {
    const data = entry.skeleton.data;
    const probe = new this._spine.Skeleton(data);
    if (data.skins.length > 1) {
      const combined = new this._spine.Skin('_fit');
      for (const s of data.skins) combined.addSkin(s);
      probe.setSkin(combined);
    } else {
      probe.setSkin(entry.skeleton.skin || data.defaultSkin);
    }
    const off = new this._spine.Vector2();
    const sz = new this._spine.Vector2();
    const perAnim = [];
    let lastYield = performance.now();
    for (const anim of data.animations) {
      if (token !== this._fitToken) return null;
      const a = { name: anim.name, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const n = Math.min(48, Math.max(2, Math.ceil((anim.duration || 0) * samplesPerSec)));
      for (let i = 0; i <= n; i++) {
        const t = anim.duration ? (anim.duration * i) / n : 0;
        probe.setToSetupPose();
        anim.apply(probe, 0, t, true, null, 1.0, 0, 0);
        probe.updateWorldTransform(2);
        this._syncHiddenAttachments(probe, key);
        const coreBox = this._getCoreBounds(probe);
        const hasReliableCoreBox = !!(coreBox && coreBox.w >= 220 && coreBox.h >= 220);
        const margin = coreBox ? Math.max(400, coreBox.h * 0.6) : 0;
        for (const slot of probe.slots) {
          if (slot.attachment) {
            const isBgOrEff = this._isBackgroundOrEffect(slot.attachment.name, slot.attachment, slot);
            if (isBgOrEff) { slot.attachment = null; continue; }
            const wb = this._getSlotWorldBounds(slot);
            if (wb) {
              const isOutlier = hasReliableCoreBox && (
                wb.maxX < coreBox.minX - margin || wb.minX > coreBox.maxX + margin ||
                wb.maxY < coreBox.minY - margin || wb.minY > coreBox.maxY + margin
              );
              if (wb.w > 1800 || wb.h > 1800 || isOutlier) slot.attachment = null;
            }
          }
        }
        probe.getBounds(off, sz, []);
        if (sz.x === -Infinity) continue;
        a.minX = Math.min(a.minX, off.x); a.minY = Math.min(a.minY, off.y);
        a.maxX = Math.max(a.maxX, off.x + sz.x); a.maxY = Math.max(a.maxY, off.y + sz.y);
      }
      perAnim.push(a);
      if (performance.now() - lastYield > 10) { await this._idle(); lastYield = performance.now(); }
    }
    return this._reduceAnimBounds(perAnim);
  }

  _reduceAnimBounds(perAnim) {
    const toBox = (b) => ({ offX: b.minX, offY: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY });
    const union = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const a of perAnim) {
      if (!isFinite(a.minX)) continue;
      union.minX = Math.min(union.minX, a.minX); union.minY = Math.min(union.minY, a.minY);
      union.maxX = Math.max(union.maxX, a.maxX); union.maxY = Math.max(union.maxY, a.maxY);
    }
    const valid = perAnim.filter(b => isFinite(b.minX));
    const wOf = b => b.maxX - b.minX, hOf = b => b.maxY - b.minY, aOf = b => wOf(b) * hOf(b);
    let candidates = valid.filter(b => wOf(b) >= 150 && hOf(b) >= 150);
    if (candidates.length === 0) candidates = valid;
    let aw = 0, ah = 0, best = null;
    if (candidates.length > 0) {
      const sortedCandidates = [...candidates].sort((x, y) => aOf(x) - aOf(y));
      best = sortedCandidates[0];
      aw = wOf(best); ah = hOf(best);
    }
    const K = 1.3;
    const isEffect = (b) => aw > 0 && (wOf(b) > K * aw || hOf(b) > K * ah);
    const effectAnims = valid.filter(isEffect).map(b => b.name);
    const kept = valid.filter(b => !isEffect(b));
    const normals = kept.length ? kept : valid;
    const nu = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const b of normals) {
      nu.minX = Math.min(nu.minX, b.minX); nu.minY = Math.min(nu.minY, b.minY);
      nu.maxX = Math.max(nu.maxX, b.maxX); nu.maxY = Math.max(nu.maxY, b.maxY);
    }
    return {
      union: toBox(union),
      normalUnion: normals.length ? toBox(nu) : toBox(union),
      perAnim: perAnim.map(toBox),
      effectAnims,
      anchorBox: { w: aw, h: ah },
      weakAnchor: valid.length > 0 && effectAnims.length > valid.length * 0.6,
    };
  }

  _projectToPixel(x, y) {
    const m = this._mvp.values;
    const cx = m[0] * x + m[4] * y + m[12];
    const cy = m[1] * x + m[5] * y + m[13];
    const cw = m[3] * x + m[7] * y + m[15] || 1;
    const ndcX = cx / cw, ndcY = cy / cw;
    return {
      px: (ndcX * 0.5 + 0.5) * this._canvas.width,
      py: (1 - (ndcY * 0.5 + 0.5)) * this._canvas.height,
    };
  }

  _evalFit(box, margin = 0.05) {
    const W = this._canvas.width, H = this._canvas.height;
    const corners = [
      this._projectToPixel(box.offX, box.offY),
      this._projectToPixel(box.offX + box.w, box.offY),
      this._projectToPixel(box.offX, box.offY + box.h),
      this._projectToPixel(box.offX + box.w, box.offY + box.h),
    ];
    const xs = corners.map(c => c.px), ys = corners.map(c => c.py);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const boxW = maxX - minX, boxH = maxY - minY;
    const safeW = W * (1 - 2 * margin), safeH = H * (1 - 2 * margin);
    const pad = 1;
    return {
      rectPx: { x: minX, y: minY, w: boxW, h: boxH },
      clipped: minX < -pad || minY < -pad || maxX > W + pad || maxY > H + pad,
      fill: +Math.max(boxW / safeW, boxH / safeH).toFixed(3),
      centerErr: +(Math.hypot((minX + maxX) / 2 - W / 2, (minY + maxY) / 2 - H / 2) / Math.hypot(W, H)).toFixed(4),
    };
  }

  _hideMaskMosaicAttachments() {
    for (const key in this._skeletons) {
      const skelEntry = this._skeletons[key];
      const skeleton = skelEntry.skeleton;
      const state = skelEntry.state;
      const skelId = key;
      const attachmentMap = new Map();
      const addFromSkin = (skin) => {
        if (!skin || !skin.attachments) return;
        if (Array.isArray(skin.attachments)) {
          skin.attachments.forEach((slotAttachments, slotIndex) => {
            if (!slotAttachments) return;
            if (slotAttachments.name !== undefined && slotAttachments.slotIndex !== undefined) {
              attachmentMap.set(`${slotAttachments.name}##${slotAttachments.slotIndex}`, slotAttachments.slotIndex);
            } else {
              for (const name in slotAttachments) attachmentMap.set(`${name}##${slotIndex}`, slotIndex);
            }
          });
        } else {
          for (const slotIdx in skin.attachments) {
            const slotAttachments = skin.attachments[slotIdx];
            if (!slotAttachments) continue;
            for (const name in slotAttachments) attachmentMap.set(`${name}##${slotIdx}`, parseInt(slotIdx));
          }
        }
      };
      if (skeleton.data.defaultSkin) addFromSkin(skeleton.data.defaultSkin);
      if (skeleton.skin) addFromSkin(skeleton.skin);
      skeleton.slots.forEach((slot, slotIndex) => {
        const names = [];
        if (slot.attachment) names.push(slot.attachment.name);
        if (slot.data.attachmentName && !names.includes(slot.data.attachmentName)) names.push(slot.data.attachmentName);
        names.forEach(n => attachmentMap.set(`${n}##${slotIndex}`, slotIndex));
      });
      if (state?.tracks?.[0]) {
        const animation = state.tracks[0].animation;
        if (animation.timelines) {
          animation.timelines.forEach(timeline => {
            if (timeline.attachmentNames) {
              timeline.attachmentNames.forEach(name => {
                if (name) attachmentMap.set(`${name}##${timeline.slotIndex}`, timeline.slotIndex);
              });
            }
          });
        }
      }
      attachmentMap.forEach((slotIndex, keyAndIdx) => {
        const [name] = keyAndIdx.split('##');
        if (name && (name.includes('MaskMosaic') || name.includes('mozaiku'))) {
          const compositeKey = `${skelId}##${name}##${slotIndex}`;
          this._attachmentsCache[compositeKey] = [slotIndex, name, skelId];
          const slot = skeleton.slots[slotIndex];
          if (slot?.attachment && slot.attachment.name === name) slot.attachment = null;
        }
      });
    }
    this._syncAllHiddenAttachments();
  }

  async _loadSkeleton(fileName) {
    const sceneInfo = this._fileNames;
    const normalizedDirName = this._dirName.endsWith('/') ? this._dirName : `${this._dirName}/`;
    const makePath = (name, ext) => `${normalizedDirName}${name}${ext}`;
    const atlasPath = makePath(fileName, sceneInfo.atlasExt);
    const atlas = this._assetManager.get(atlasPath);
    if (!atlas) return null;
    if (atlas.regions) setupAtlas(atlas);
    this._loadedAtlases.push(atlas);
    const isWebUrl = this._dirName.startsWith('http://') || this._dirName.startsWith('https://');
    await this._resizeAtlasPages(atlas, atlasPath, isWebUrl);
    const filterType = this._textureFilter === 'nearest'
      ? this._spine.TextureFilter.Nearest
      : this._spine.TextureFilter.Linear;
    for (const page of atlas.pages) {
      page.minFilter = filterType;
      page.magFilter = filterType;
      if (page.texture?.setFilters) page.texture.setFilters(filterType, filterType);
    }
    const { skeleton, state, initialSkinNames } = initializeSkeleton(
      this._spine,
      atlas,
      this._assetManager.get(makePath(fileName, sceneInfo.mainExt)),
      this._isFileJson
    );
    if (!this._activeSkins) this._activeSkins = new Set(initialSkinNames);
    this._animationStates.push(state);
    const bounds = this._calculateBounds(skeleton);
    if (skeleton.data.width === 0 || isNaN(skeleton.data.width)) {
      skeleton.data.width = bounds.size.x;
      skeleton.data.height = bounds.size.y;
    }
    const animations = skeleton.data.animations;
    if (animations.length > 0) state.setAnimation(0, animations[0].name, true);
    return { skeleton, state, bounds, name: fileName };
  }

  async _resizeAtlasPages(atlas, atlasPath, isWebUrl) {
    let atlasText = null;
    try {
      const isLocalAsset = (() => {
        try {
          const url = new URL(atlasPath);
          return url.protocol === 'tauri:' || url.hostname === 'tauri.localhost' || url.hostname === 'asset.localhost';
        } catch (e) {
          return atlasPath.startsWith('tauri://');
        }
      })();

      const hasTauriInvoke = typeof window !== 'undefined' &&
        ((window.__TAURI_INTERNALS__ !== undefined && typeof window.__TAURI_INTERNALS__.invoke === 'function') ||
          (window.__TAURI__?.core?.invoke !== undefined));

      if (isWebUrl && !isLocalAsset && hasTauriInvoke) {
        const fetched = await invoke('fetch_url_bytes', { url: atlasPath });
        atlasText = new TextDecoder().decode(new Uint8Array(fetched));
      } else {
        let fetchUrl = atlasPath;
        if (isLocalAsset) {
          if (!atlasPath.startsWith('asset://') && !atlasPath.startsWith('tauri://')) {
            fetchUrl = convertFileSrc(atlasPath);
          }
        }
        const res = await fetch(fetchUrl);
        if (res.ok) atlasText = await res.text();
      }
    } catch (e) {
      console.warn('[SpineRendererBase] Could not fetch atlas text for resize check:', e);
    }

    if (atlasText) atlasText = normalizeAtlasText(atlasText);
    else return;

    const declaredSizes = parseAtlasDeclaredSizes(atlasText);
    const gl = this._ctx.gl;
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const resizedPages = new Set();

    for (const page of atlas.pages) {
      const tex = page.texture;
      if (!tex || !tex.getImage) continue;
      const img = tex.getImage();
      if (!img) continue;
      const declared = declaredSizes.get(page.name);
      if (!declared || (img.width === declared.width && img.height === declared.height)) continue;

      const canvas = createCanvas(declared.width, declared.height);
      const ctx2d = canvas.getContext('2d');
      ctx2d.imageSmoothingEnabled = false;
      const source = img._bitmap || img;
      ctx2d.drawImage(source, 0, 0, declared.width, declared.height);
      tex._image = canvas;
      tex.bind();
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._alphaMode === 'unpack');
      page.width = declared.width;
      page.height = declared.height;
      resizedPages.add(page);
    }

    if (previousTexture) gl.bindTexture(gl.TEXTURE_2D, previousTexture);
    if (resizedPages.size > 0 && atlas.regions) updateAtlasRegions(atlas, resizedPages);
  }

  _calculateBounds(skeleton) {
    const originalSkin = skeleton.skin;
    const allSkins = skeleton.data.skins;
    if (allSkins.length > 1) {
      const combinedSkin = new this._spine.Skin('_bounds');
      for (const skin of allSkins) combinedSkin.addSkin(skin);
      skeleton.setSkin(combinedSkin);
    }
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform(2);
    const setupCoreBox = this._getCoreBounds(skeleton);
    const hasReliableSetupCoreBox = !!(setupCoreBox && setupCoreBox.w >= 220 && setupCoreBox.h >= 220);
    const setupMargin = setupCoreBox ? Math.max(400, setupCoreBox.h * 0.6) : 0;
    for (const slot of skeleton.slots) {
      if (slot.attachment) {
        const isBgOrEff = this._isBackgroundOrEffect(slot.attachment.name, slot.attachment, slot);
        const wb = this._getSlotWorldBounds(slot);
        if (isBgOrEff) { slot.attachment = null; continue; }
        if (wb) {
          const isOutlier = hasReliableSetupCoreBox && (
            wb.maxX < setupCoreBox.minX - setupMargin || wb.minX > setupCoreBox.maxX + setupMargin ||
            wb.maxY < setupCoreBox.minY - setupMargin || wb.minY > setupCoreBox.maxY + setupMargin
          );
          if (wb.w > 1800 || wb.h > 1800 || isOutlier) slot.attachment = null;
        }
      }
    }
    const offset = new this._spine.Vector2(), size = new this._spine.Vector2();
    skeleton.getBounds(offset, size, []);
    if (size.x === -Infinity || size.y === -Infinity) {
      const animations = skeleton.data.animations;
      for (const anim of animations) {
        anim.apply(skeleton, 0, 0, false, null, 1.0, 0, 0);
        skeleton.updateWorldTransform(2);
        const fallbackCoreBox = this._getCoreBounds(skeleton);
        const hasReliableFallbackCoreBox = !!(fallbackCoreBox && fallbackCoreBox.w >= 220 && fallbackCoreBox.h >= 220);
        const fallbackMargin = fallbackCoreBox ? Math.max(400, fallbackCoreBox.h * 0.6) : 0;
        for (const slot of skeleton.slots) {
          if (slot.attachment) {
            const isBgOrEff = this._isBackgroundOrEffect(slot.attachment.name, slot.attachment, slot);
            if (isBgOrEff) { slot.attachment = null; continue; }
            const wb = this._getSlotWorldBounds(slot);
            if (wb) {
              const isOutlier = hasReliableFallbackCoreBox && (
                wb.maxX < fallbackCoreBox.minX - fallbackMargin || wb.minX > fallbackCoreBox.maxX + fallbackMargin ||
                wb.maxY < fallbackCoreBox.minY - fallbackMargin || wb.minY > fallbackCoreBox.maxY + fallbackMargin
              );
              if (wb.w > 1800 || wb.h > 1800 || isOutlier) slot.attachment = null;
            }
          }
        }
        skeleton.getBounds(offset, size, []);
        if (size.x !== -Infinity) break;
      }
    }
    if (size.x === -Infinity) { size.x = 2048; size.y = 2048; offset.x = -1024; offset.y = -1024; }
    skeleton.setSkin(originalSkin);
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform(2);
    return { offset, size };
  }

  render(delta = 0, options = {}) {
    if (!this._ctx) return;
    const gl = this._ctx.gl;
    if (!gl) return;
    this.updateMVP(options);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const sortedKeys = this._getSortedSkeletonKeys();
    for (const key of sortedKeys) {
      const { skeleton, state } = this._skeletons[key];
      if (delta > 0 && !this._paused) state.update(delta * this._speed);
      state.apply(skeleton);
      this._applyParameterOverrides(key);
      skeleton.updateWorldTransform(2);
      this._syncHiddenAttachments(skeleton, key);
      this._shader.bind();
      this._shader.setUniformi(this._spine.Shader.SAMPLER, 0);
      this._shader.setUniform4x4f(this._spine.Shader.MVP_MATRIX, this._mvp.values);
      this._batcher.begin(this._shader);
      this._skeletonRenderer.premultipliedAlpha = (this._alphaMode === 'unpack' || this._alphaMode === 'pma');
      this._skeletonRenderer.draw(this._batcher, skeleton);
      this._batcher.end();
    }
  }

  updateMVP(options = {}) {
    if (!this._ctx) return;
    const primary = this._getPrimarySkeleton();
    if (!primary?.entry) return;
    const isExportOrCapture = this.isExport || options.isExport || options.screenBaseScale !== undefined || options.ignoreTransform !== undefined;
    const fitBounds = this._getFitBounds(primary.entry, isExportOrCapture ? 2.5 : 1.15);
    let screenBaseScale = options.screenBaseScale;
    if (!screenBaseScale && !this.isExport) {
      screenBaseScale = Math.max(
        fitBounds.size.x / window.innerWidth,
        fitBounds.size.y / window.innerHeight
      );
    }
    const applyMvp = (b) => calculateSpineMVP(this._spine, this._mvp, this._canvas.width, this._canvas.height, b, {
      scale: this._scale,
      x: this._moveX,
      y: this._moveY,
      rotation: this._rotate
    }, { ...options, screenBaseScale });
    applyMvp(fitBounds);
    this._ctx.gl.viewport(0, 0, this._canvas.width, this._canvas.height);
  }

  _getSortedSkeletonKeys() {
    const sceneInfo = this._fileNames;
    return Object.keys(this._skeletons).sort((a, b) => {
      const getLayer = (k) => {
        if (!sceneInfo.isMerged && k === '0') return 0;
        const name = (sceneInfo.isMerged ? sceneInfo.files[parseInt(k)] : sceneInfo.files[parseInt(k) - 1] || '').toLowerCase();
        return name.includes('_fg') ? 1 : (name.includes('_bg') ? -1 : 0);
      };
      return getLayer(a) - getLayer(b) || parseInt(a) - parseInt(b);
    });
  }

  _syncHiddenAttachments(skeleton, id) {
    if (!this._attachmentsCache) return;
    for (const compositeKey in this._attachmentsCache) {
      const entry = this._attachmentsCache[compositeKey];
      const [idx, name, cachedSkelId] = entry;
      if (String(cachedSkelId || '0') === String(id)) {
        const slot = skeleton.slots[idx];
        if (slot?.attachment && slot.attachment.name === name) slot.attachment = null;
      }
    }
  }

  getOriginalSize() {
    const primary = this._getPrimarySkeleton();
    const skel = primary?.entry;
    if (!skel) return { width: 0, height: 0 };
    const fitBounds = this._getFitBounds(skel, 2.5);
    return fitBounds?.size ? { width: Math.round(fitBounds.size.x), height: Math.round(fitBounds.size.y) } : { width: 0, height: 0 };
  }

  getMainOriginalSize() {
    const primary = this._getPrimarySkeleton();
    const skel = primary?.entry;
    if (!skel) return { width: 0, height: 0 };
    const fitBounds = this._getFitBounds(skel, 1.15);
    return fitBounds?.size ? { width: Math.round(fitBounds.size.x), height: Math.round(fitBounds.size.y) } : { width: 0, height: 0 };
  }

  captureFrame(width, height, options = {}) {
    if (!this._ctx || Object.keys(this._skeletons).length === 0) return null;
    const oldWidth = this._canvas.width;
    const oldHeight = this._canvas.height;
    const oldScale = this._scale;
    const oldMoveX = this._moveX;
    const oldMoveY = this._moveY;
    const oldRotate = this._rotate;
    this._canvas.width = Math.round(width);
    this._canvas.height = Math.round(height);
    if (options.ignoreTransform) {
      this._scale = 1; this._moveX = 0; this._moveY = 0; this._rotate = 0;
    }
    let screenBaseScale = options.screenBaseScale;
    if (!screenBaseScale && typeof window !== 'undefined') {
      const primary = this._getPrimarySkeleton();
      const firstSkel = primary?.entry;
      if (firstSkel) {
        const fitBounds = this._getFitBounds(firstSkel, 2.5);
        if (fitBounds?.size) {
          screenBaseScale = Math.max(
            fitBounds.size.x / window.innerWidth,
            fitBounds.size.y / window.innerHeight
          );
        }
      }
    }
    const renderOptions = { ...options, dpr: options.dpr || 1, screenBaseScale };
    this.render(0, renderOptions);
    const captureCanvas = createCanvas(this._canvas.width, this._canvas.height);
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(this._canvas, 0, 0);
    this._canvas.width = oldWidth;
    this._canvas.height = oldHeight;
    this._scale = oldScale;
    this._moveX = oldMoveX;
    this._moveY = oldMoveY;
    this._rotate = oldRotate;
    return captureCanvas;
  }

  getAnimationDuration() {
    for (const key of this._getSortedSkeletonKeys()) {
      const duration = this._skeletons[key]?.state.tracks[0]?.animation.duration;
      if (duration !== undefined && duration > 0) return duration;
    }
    return 0.1;
  }

  getAnimations() {
    const allAnimations = new Set();
    const result = [];
    for (const key in this._skeletons) {
      const skeleton = this._skeletons[key]?.skeleton;
      if (skeleton) {
        for (const anim of skeleton.data.animations) {
          if (!allAnimations.has(anim.name)) {
            allAnimations.add(anim.name);
            result.push({ name: anim.name, value: anim.name });
          }
        }
      }
    }
    return result;
  }

  getPropertyCategories() {
    const categories = [];
    let hasMultipleSkins = false;
    for (const key in this._skeletons) {
      if (this._skeletons[key].skeleton.data.skins.length > 1) {
        hasMultipleSkins = true;
        break;
      }
    }
    if (hasMultipleSkins) categories.push('skins');
    categories.push('attachments');
    categories.push('parameters');
    return categories;
  }

  getPropertyItems(category) {
    if (Object.keys(this._skeletons).length === 0) return [];
    if (category === 'parameters') return this._getParameterItems();
    if (category === 'skins') return this._getSkinsItems();
    const items = [];
    for (const key in this._skeletons) {
      const skelEntry = this._skeletons[key];
      const skeleton = skelEntry.skeleton;
      const state = skelEntry.state;
      const skelName = skelEntry.name || key;
      const skelId = key;
      const attachmentMap = new Map();
      const addFromSkin = (skin) => {
        if (!skin || !skin.attachments) return;
        if (Array.isArray(skin.attachments)) {
          skin.attachments.forEach((slotAttachments, slotIndex) => {
            if (!slotAttachments) return;
            if (slotAttachments.name !== undefined && slotAttachments.slotIndex !== undefined) {
              attachmentMap.set(`${slotAttachments.name}##${slotAttachments.slotIndex}`, slotAttachments.slotIndex);
            } else {
              for (const name in slotAttachments) attachmentMap.set(`${name}##${slotIndex}`, slotIndex);
            }
          });
        } else {
          for (const slotIdx in skin.attachments) {
            const slotAttachments = skin.attachments[slotIdx];
            if (!slotAttachments) continue;
            for (const name in slotAttachments) attachmentMap.set(`${name}##${slotIdx}`, parseInt(slotIdx));
          }
        }
      };
      if (skeleton.data.defaultSkin) addFromSkin(skeleton.data.defaultSkin);
      if (skeleton.skin) addFromSkin(skeleton.skin);
      skeleton.slots.forEach((slot, slotIndex) => {
        const names = [];
        if (slot.attachment) names.push(slot.attachment.name);
        if (slot.data.attachmentName && !names.includes(slot.data.attachmentName)) names.push(slot.data.attachmentName);
        names.forEach(n => attachmentMap.set(`${n}##${slotIndex}`, slotIndex));
      });
      if (state?.tracks?.[0]) {
        const animation = state.tracks[0].animation;
        if (animation.timelines) {
          animation.timelines.forEach(timeline => {
            if (timeline.attachmentNames) {
              timeline.attachmentNames.forEach(name => {
                if (name) attachmentMap.set(`${name}##${timeline.slotIndex}`, timeline.slotIndex);
              });
            }
          });
        }
      }
      attachmentMap.forEach((slotIndex, keyAndIdx) => {
        const [name] = keyAndIdx.split('##');
        const compositeKey = `${skelId}##${name}##${slotIndex}`;
        const mergedIndex = (parseInt(skelId) * 1000000) + slotIndex;
        const prefixPattern = new RegExp(`^\\[${skelName}\\]\\s*`);
        const displayName = (Object.keys(this._skeletons).length > 1 ? `[${skelName}] ${name}` : name).replace(prefixPattern, '');
        items.push({
          name: name,
          displayName: displayName,
          index: mergedIndex,
          type: 'checkbox',
          checked: !this._attachmentsCache[compositeKey],
        });
      });
    }
    return items.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
  }

  _getSkinsItems() {
    const items = [];
    const seenNames = new Set();
    for (const key in this._skeletons) {
      const skelEntry = this._skeletons[key];
      const skel = skelEntry.skeleton;
      const skins = skel.data.skins;
      const skelName = skelEntry.name || key;
      if (!this._activeSkins) {
        this._activeSkins = new Set();
        if (skel.skin) this._activeSkins.add(skel.skin.name);
        else {
          let name = 'default';
          if (skins.length > 1 && skins[0].name === 'default') name = skins[1].name;
          else if (skins.length > 0) name = skins[0].name;
          this._activeSkins.add(name);
        }
      }
      skins.forEach((skin, index) => {
        const prefixPattern = new RegExp(`^\\[${skelName}\\]\\s*`);
        const displayName = (Object.keys(this._skeletons).length > 1 ? `[${skelName}] ${skin.name}` : skin.name).replace(prefixPattern, '');
        if (!seenNames.has(skin.name)) {
          seenNames.add(skin.name);
          items.push({
            name: skin.name,
            displayName: displayName,
            index,
            type: 'checkbox',
            checked: this._activeSkins.has(skin.name),
          });
        }
      });
    }
    return items.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
  }

  _getParameterItems() {
    const items = [];
    const sortedKeys = this._getSortedSkeletonKeys();
    for (const key of sortedKeys) {
      const skelEntry = this._skeletons[key];
      const skel = skelEntry.skeleton;
      const skelName = skelEntry.name || key;
      const skelId = parseInt(key);
      const animatedBonesRot = new Set();
      const animatedBonesTrans = new Set();
      const animatedBonesScale = new Set();
      const animatedBonesAny = new Set();
      const animatedIK = new Set();
      const animatedTF = new Set();
      const animatedPath = new Set();
      const animations = skel.data.animations;
      const hasAnimations = animations && animations.length > 0;
      if (hasAnimations) {
        for (const anim of animations) {
          if (!anim.timelines) continue;
          for (const tl of anim.timelines) {
            const isMoving = tl.frames && (tl.frames.length > (tl.constructor.name.includes('Rotate') ? 2 : 3) || tl.frames[0] > 0);
            if (tl.boneIndex !== undefined) {
              const bi = tl.boneIndex;
              const type = tl.constructor.name;
              if (isMoving) {
                animatedBonesAny.add(bi);
                if (type.includes('Rotate')) animatedBonesRot.add(bi);
                if (type.includes('Translate')) animatedBonesTrans.add(bi);
                if (type.includes('Scale')) animatedBonesScale.add(bi);
              }
            }
            if (isMoving) {
              if (tl.ikConstraintIndex !== undefined) animatedIK.add(tl.ikConstraintIndex);
              if (tl.transformConstraintIndex !== undefined) animatedTF.add(tl.transformConstraintIndex);
              if (tl.pathConstraintIndex !== undefined) animatedPath.add(tl.pathConstraintIndex);
            }
          }
        }
      }
      const deformBones = new Set();
      if (skel.data.skins) {
        skel.data.skins.forEach(skin => {
          if (!skin.attachments) return;
          skin.attachments.forEach(slotAttachments => {
            if (!slotAttachments) return;
            Object.values(slotAttachments).forEach(attachment => {
              if (attachment && attachment.bones) attachment.bones.forEach(bId => deformBones.add(bId));
            });
          });
        });
      }
      const ikTargets = new Set();
      const drivenBones = new Set();
      if (skel.ikConstraints) {
        skel.ikConstraints.forEach(ik => {
          if (ik.target) ikTargets.add(skel.bones.indexOf(ik.target));
          if (ik.bones) ik.bones.forEach(b => drivenBones.add(skel.bones.indexOf(b)));
        });
      }
      if (skel.transformConstraints) {
        skel.transformConstraints.forEach(tc => {
          if (tc.bones) tc.bones.forEach(b => drivenBones.add(skel.bones.indexOf(b)));
        });
      }
      const hasChildren = new Set();
      skel.bones.forEach((bone, i) => {
        if (bone.parent) hasChildren.add(skel.bones.indexOf(bone.parent));
      });
      const usedNames = new Set();
      const isMerged = !!this._fileNames?.isMerged;
      const addRange = (name, target, prop, min = 0, max = 1, step = 0.01, localId) => {
        const fullPropName = `${name}_${prop}`;
        if (isMerged && usedNames.has(fullPropName)) return;
        usedNames.add(fullPropName);
        const displayName = (Object.keys(this._skeletons).length > 1 && !isMerged ? `[${skelName}] ${name}` : name).replace(/\[.*?\]\s*/g, '');
        items.push({
          name: name,
          displayName: displayName,
          index: (skelId * 1000000) + localId,
          type: 'range',
          min, max, step,
          value: target[prop],
          _target: target,
          _prop: prop,
          _skeletonId: key
        });
      };
      if (skel.ikConstraints) {
        skel.ikConstraints.forEach((ik, i) => {
          if (!hasAnimations || animatedIK.has(i)) addRange(`IK: ${ik.data.name}`, ik, 'mix', 0, 1, 0.01, 0 + i);
        });
      }
      if (skel.transformConstraints) {
        skel.transformConstraints.forEach((tc, i) => {
          if (!hasAnimations || animatedTF.has(i)) {
            const props = ['mixRotate', 'rotateMix', 'mixX', 'translateMix', 'mixY', 'mixScaleX', 'scaleMix', 'mixScaleY', 'mixShearY', 'shearMix'];
            props.forEach((p, pi) => {
              if (tc[p] !== undefined) addRange(`TF ${tc.data.name}: ${p}`, tc, p, 0, 1, 0.01, 10000 + i * 10 + pi);
            });
          }
        });
      }
      if (skel.pathConstraints) {
        skel.pathConstraints.forEach((pc, i) => {
          if (!hasAnimations || animatedPath.has(i)) {
            const props = ['mixRotate', 'rotateMix', 'mixX', 'translateMix', 'mixY'];
            props.forEach((p, pi) => {
              if (pc[p] !== undefined) addRange(`Path ${pc.data.name}: ${p}`, pc, p, 0, 1, 0.01, 20000 + i * 10 + pi);
            });
          }
        });
      }
      if (skel.bones) {
        skel.bones.forEach((bone, i) => {
          const name = bone.data.name;
          if (name.startsWith('_')) return;
          const isRoot = (i === 0);
          const isIKTarget = ikTargets.has(i);
          if (drivenBones.has(i) && !isIKTarget && !isRoot) return;
          const isDeformOnly = deformBones.has(i) && !hasChildren.has(i) && !isIKTarget;
          if (isDeformOnly && !isRoot) return;
          const hasRot = animatedBonesRot.has(i);
          const hasTrans = animatedBonesTrans.has(i);
          const hasScale = animatedBonesScale.has(i);
          if (hasAnimations && !animatedBonesAny.has(i) && !isRoot && !isIKTarget) return;
          const range = 1000;
          const baseId = 100000 + i * 10;
          if (!hasAnimations || hasTrans || isRoot || isIKTarget) {
            addRange(`Bone ${name}: x`, bone, 'x', -range, range, 0.5, baseId + 0);
            addRange(`Bone ${name}: y`, bone, 'y', -range, range, 0.5, baseId + 1);
          }
          if (!hasAnimations || hasRot || isRoot) addRange(`Bone ${name}: rotation`, bone, 'rotation', -360, 360, 1, baseId + 2);
          if (!hasAnimations || hasScale) {
            addRange(`Bone ${name}: scaleX`, bone, 'scaleX', -10, 10, 0.1, baseId + 3);
            addRange(`Bone ${name}: scaleY`, bone, 'scaleY', -10, 10, 0.1, baseId + 4);
          }
        });
      }
    }
    this._parameterItems = items;
    this._parameterItemsMap = new Map(items.map(i => [i.index, i]));
    return items;
  }

  _applyParameterOverrides(skeletonId) {
    if (this.parameterOverrides.size === 0) return;
    if ((!this._parameterItemsMap || this._parameterItemsMap.size === 0) && Object.keys(this._skeletons).length > 0) this._getParameterItems();
    if (!this._parameterItemsMap) return;
    const skelIdInt = parseInt(skeletonId);
    for (let [index, value] of this.parameterOverrides) {
      const idx = Number(index);
      if (Math.floor(idx / 1000000) === skelIdInt) {
        const item = this._parameterItemsMap.get(idx);
        if (item) item._target[item._prop] = value;
      }
    }
  }

  updatePropertyItem(category, name, mergedIndex, value) {
    if (category === 'parameters') {
      const idx = Number(mergedIndex);
      const item = this._parameterItemsMap?.get(idx) || this._parameterItems?.find(i => i.index === idx);
      if (item) {
        const val = Number(value);
        const prop = item._prop;
        const itemName = item.name;
        const isMerged = !!this._fileNames?.isMerged;
        for (const k in this._skeletons) {
          if (!isMerged && k !== item._skeletonId) continue;
          const s = this._skeletons[k].skeleton;
          let targetObj = null;
          let localIdBase = 0;
          if (itemName.startsWith('Bone ')) {
            const bName = itemName.split(': ')[0].replace('Bone ', '');
            targetObj = s.findBone(bName);
            if (targetObj) localIdBase = 100000 + s.bones.indexOf(targetObj) * 10;
          } else if (itemName.startsWith('IK: ')) {
            const ikName = itemName.replace('IK: ', '');
            targetObj = s.findIkConstraint(ikName);
            if (targetObj) localIdBase = 0 + s.ikConstraints.indexOf(targetObj);
          } else if (itemName.startsWith('TF ')) {
            const tfName = itemName.split(': ')[0].replace('TF ', '');
            targetObj = s.findTransformConstraint(tfName);
            if (targetObj) localIdBase = 10000 + s.transformConstraints.indexOf(targetObj) * 10;
          } else if (itemName.startsWith('Path ')) {
            const pathName = itemName.split(': ')[0].replace('Path ', '');
            targetObj = s.findPathConstraint(pathName);
            if (targetObj) localIdBase = 20000 + s.pathConstraints.indexOf(targetObj) * 10;
          }
          if (targetObj) {
            targetObj[prop] = val;
            const skelId = parseInt(k);
            let finalIdx = (skelId * 1000000) + localIdBase;
            if (itemName.includes(': ')) {
              const suffix = itemName.split(': ')[1];
              if (suffix === 'y') finalIdx += 1;
              if (suffix === 'rotation') finalIdx += 2;
              if (suffix === 'scaleX') finalIdx += 3;
              if (suffix === 'scaleY') finalIdx += 4;
              const props = ['mixRotate', 'rotateMix', 'mixX', 'translateMix', 'mixY', 'mixScaleX', 'scaleMix', 'mixScaleY', 'mixShearY', 'shearMix'];
              const pi = props.indexOf(prop);
              if (pi !== -1) finalIdx += pi;
            }
            this.parameterOverrides.set(finalIdx, val);
          }
        }
      }
    } else if (category === 'skins') {
      this._toggleSkin(name, value);
    } else if (category === 'attachments') {
      const skeletonId = String(Math.floor(mergedIndex / 1000000));
      const slotIndex = mergedIndex % 1000000;
      this._toggleAttachment(name, slotIndex, value, skeletonId);
    }
  }

  resetOverrides(category) {
    super.resetOverrides(category);
    if (category === 'parameters') {
      for (const key in this._skeletons) {
        const { skeleton, state } = this._skeletons[key];
        skeleton.setToSetupPose();
        state.apply(skeleton);
        skeleton.updateWorldTransform(2);
      }
    } else if (category === 'attachments') {
      this._attachmentsCache = {};
      for (const key in this._skeletons) {
        const { skeleton, state } = this._skeletons[key];
        skeleton.setToSetupPose();
        state.apply(skeleton);
        skeleton.updateWorldTransform(2);
      }
      this._hideMaskMosaicAttachments();
    }
    this.render(0);
  }

  _toggleSkin(name, checked) {
    if (!this._activeSkins) this._activeSkins = new Set();
    if (checked) this._activeSkins.add(name);
    else this._activeSkins.delete(name);
    this.applySkins(Array.from(this._activeSkins));
  }

  applySkins(names) {
    for (const key in this._skeletons) {
      const skel = this._skeletons[key].skeleton;
      const newSkin = new this._spine.Skin('_');
      this._activeSkins = new Set(names);
      for (const n of names) {
        const s = skel.data.findSkin(n);
        if (s) newSkin.addSkin(s);
      }
      skel.setSkin(newSkin);
      skel.setToSetupPose();
      this._skeletons[key].state.apply(skel);
      skel.updateWorldTransform(2);
    }
    this._syncAllHiddenAttachments();
  }

  _toggleAttachment(name, slotIndex, checked, targetSkeletonId) {
    const skeletonId = targetSkeletonId || '0';
    const compositeKey = `${skeletonId}##${name}##${slotIndex}`;
    const skelEntry = this._skeletons[skeletonId];
    if (!skelEntry) return;
    if (checked) {
      if (this._attachmentsCache[compositeKey]) {
        delete this._attachmentsCache[compositeKey];
        const skeleton = skelEntry.skeleton;
        skeleton.setToSetupPose();
        if (skelEntry.state) skelEntry.state.apply(skeleton);
      }
    } else {
      this._attachmentsCache[compositeKey] = [slotIndex, name, skeletonId];
      const skeleton = skelEntry.skeleton;
      if (skeleton.slots[slotIndex]?.attachment?.name === name) skeleton.slots[slotIndex].attachment = null;
    }
    this._syncAllHiddenAttachments();
  }

  _syncAllHiddenAttachments() {
    for (const key in this._skeletons) {
      const skeleton = this._skeletons[key].skeleton;
      for (const compositeKey in this._attachmentsCache) {
        const entry = this._attachmentsCache[compositeKey];
        const [idx, name, cachedSkelId] = entry;
        if (String(cachedSkelId || '0') === String(key)) {
          const slot = skeleton.slots[idx];
          if (slot?.attachment && slot.attachment.name === name) slot.attachment = null;
        }
      }
    }
  }

  seekAnimation(progress) {
    for (const key in this._skeletons) {
      const { skeleton, state } = this._skeletons[key];
      const entry = state.tracks[0];
      if (entry) {
        entry.trackTime = entry.animation.duration * progress;
        state.apply(skeleton);
        this._applyParameterOverrides(key);
        skeleton.updateWorldTransform(2);
      }
    }
  }

  getSyncState() {
    const state = super.getSyncState();
    state.activeSkins = this._activeSkins ? Array.from(this._activeSkins) : null;
    state.attachmentsCache = this._attachmentsCache;
    state.skeletonBounds = {};
    for (const key in this._skeletons) {
      const entry = this._skeletons[key];
      if (entry) {
        state.skeletonBounds[key] = { bounds: entry.bounds, fitBounds: entry.fitBounds, _ab: entry._ab };
      }
    }
    return state;
  }

  applySyncState(state) {
    super.applySyncState(state);
    if (!state) return;
    if (state.activeSkins) this.applySkins(state.activeSkins);
    if (state.attachmentsCache) {
      this._attachmentsCache = state.attachmentsCache;
      this._syncAllHiddenAttachments();
    }
    if (state.skeletonBounds) {
      for (const key in state.skeletonBounds) {
        const entry = this._skeletons[key];
        if (entry) {
          const boundsInfo = state.skeletonBounds[key];
          entry.bounds = boundsInfo.bounds;
          entry.fitBounds = boundsInfo.fitBounds;
          entry._ab = boundsInfo._ab;
        } else {
          console.warn(`[SpineRendererBase] Sync bounds for key=${key} but skeleton not loaded`);
        }
      }
    }
  }

  startRenderLoop() {
    if (this._rafId) return;
    this._lastTime = performance.now();
    const loop = (now) => {
      const delta = (now - this._lastTime) / 1000;
      this._lastTime = now;
      if (!this._paused) this.render(delta);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stopRenderLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  dispose() {
    this.stopAutoRandomAnim();
    this.stopEmotionPolling();
    this.stopRenderLoop();
    if (this._emotionAbortController) {
      this._emotionAbortController.abort();
      this._emotionAbortController = null;
    }
    if (this._revealTimer) {
      clearTimeout(this._revealTimer);
      this._revealTimer = null;
    }
    if (this._ctx) {
      this._ctx.gl.getExtension('WEBGL_lose_context')?.loseContext();
      this._ctx = null;
    }
    this._skeletons = {};
    this._animationStates = [];
    this._bgOrEffectCache?.clear();
    this._probeSkeletons?.clear();
  }
}