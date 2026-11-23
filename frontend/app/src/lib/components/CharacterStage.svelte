<script>
  /**
   * The character stage: canvas host, model lifecycle, pointer gestures.
   * Presentation only — conversation and window state live in +page.svelte.
   */
  import { onMount, onDestroy } from 'svelte';
  import { Live2DRenderer } from '$lib/live2d/Live2DRenderer.js';
  import { CUSTOM_EXPRESSIONS } from '$lib/expressions.js';
  import { MODEL_BASE_URL, MODEL_FILE, DEV } from '../../config.js';
  import { IS_TAURI } from '$lib/runtime.js';
  import { startDragging } from '$lib/tauri/windowBridge.js';
  import Icon from './Icon.svelte';

  let {
    quality = 'auto',
    zoom = 1,
    offsetX = 0,
    offsetY = 0,
    opacity = 1,
    breath = true,
    blink = true,
    sway = true,
    mouseTracking = true,
    lipSync = true,
    interactive = true,
    getMouthLevel = null,
    onready = null,
    onerror = null,
    onrestored = null,
    onpoke = null,
    onopenchat = null,
    oncontext = null,
  } = $props();

  let host = $state(null);
  let status = $state('loading'); // loading | ready | error
  let statusText = $state('正在准备渲染器');
  let progress = $state(0.04);
  let errorMessage = $state('');

  let renderer = null;
  let stageReady = $state(false);
  let destroyed = false;
  let resizeObserver = null;
  let resizeFrame = 0;
  let pointerCandidate = null;
  let dragging = false;
  let lastPokeAt = 0;
  let bootGeneration = 0;

  // `sway` arrives as `!settings.reduceMotion` from the page, so recover the
  // reduce-motion flag for the renderer's drop / gravity physics.
  const reduceMotion = $derived(!sway);

  const TOP_INSET = 92;
  const BOTTOM_INSET = 8;

  onMount(() => {
    boot();
    return () => {
      destroyed = true;
      removePointerListeners();
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeFrame);
      renderer?.dispose();
      if (DEV && /** @type {any} */ (window).__lilithRenderer === renderer) {
        delete /** @type {any} */ (window).__lilithRenderer;
      }
      renderer = null;
      stageReady = false;
    };
  });

  onDestroy(() => {
    destroyed = true;
  });

  async function boot() {
    if (!host || destroyed) return;
    const generation = ++bootGeneration;
    status = 'loading';
    statusText = '正在准备渲染器';
    progress = 0.04;
    errorMessage = '';

    if (renderer) {
      renderer.dispose();
      renderer = null;
      stageReady = false;
    }
    host.querySelectorAll('canvas.live2d-canvas').forEach((canvas) => canvas.remove());

    try {
      renderer = new Live2DRenderer(host, {
        quality,
        onContextLost: handleContextLost,
        onContextRestored: handleContextRestored,
      });
    } catch (err) {
      handleFailure(err);
      return;
    }
    if (DEV) {
      /** @type {any} */ (window).__lilithRenderer = renderer;
    }
    stageReady = true;
    observeSize();

    const cacheBust = DEV ? `?v=${Date.now()}` : '';
    const url = `${MODEL_BASE_URL}${encodeURIComponent(MODEL_FILE)}${cacheBust}`;
    try {
      const info = await renderer.load({
        modelUrl: url,
        modelDirUrl: MODEL_BASE_URL,
        customExpressions: CUSTOM_EXPRESSIONS,
        reduceMotion,
        onProgress: (value, label) => {
          progress = value;
          if (label) statusText = label;
        },
      });
      if (generation !== bootGeneration || destroyed) return;
      if (!info) throw new Error('模型没有返回可用数据');
      status = 'ready';
      statusText = '就绪';
      applySettings();
      onready?.(info);
    } catch (err) {
      handleFailure(err);
    }
  }

  function handleFailure(err) {
    console.error('[stage]', err);
    status = 'error';
    errorMessage = err?.message || String(err);
    onerror?.(err);
  }

  function handleContextLost() {
    status = 'error';
    errorMessage = 'WebGL 上下文丢失，正在尝试恢复…';
    onerror?.(new Error(errorMessage));
  }

  function handleContextRestored() {
    onrestored?.();
    // Cubism shader/program GL resources may not survive a context restore on
    // every driver, so do a full reload for a deterministic recovery.
    window.setTimeout(() => {
      if (!destroyed) boot();
    }, 0);
  }

  function observeSize() {
    resizeObserver?.disconnect();
    if (!host) return;
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (renderer && host) renderer.resize(host.clientWidth, host.clientHeight);
      });
    });
    resizeObserver.observe(host);
  }

  function applySettings() {
    if (!renderer) return;
    renderer.layout({
      zoom,
      offsetX,
      offsetY,
      topInset: TOP_INSET,
      bottomInset: BOTTOM_INSET,
    });
    renderer.setQuality(quality);
    renderer.setOpacity(opacity);
    renderer.setLife({ breath, blink, mouse: mouseTracking, sway, reduceMotion });
    renderer.setMouthProvider(lipSync && getMouthLevel ? getMouthLevel : null);
  }

  // Split effects so dragging a slider only re-runs layout — changing quality
  // reallocates the render target, which is far too expensive per frame.
  $effect(() => {
    void stageReady;
    void zoom;
    void offsetX;
    void offsetY;
    if (!stageReady || !renderer) return;
    renderer.layout({
      zoom,
      offsetX,
      offsetY,
      topInset: TOP_INSET,
      bottomInset: BOTTOM_INSET,
    });
  });

  $effect(() => {
    void stageReady;
    void quality;
    if (!stageReady || !renderer) return;
    renderer.setQuality(quality);
  });

  $effect(() => {
    void stageReady;
    void opacity;
    if (!stageReady || !renderer) return;
    renderer.setOpacity(opacity);
  });

  $effect(() => {
    void stageReady;
    void breath;
    void blink;
    void sway;
    void mouseTracking;
    if (!stageReady || !renderer) return;
    renderer.setLife({ breath, blink, mouse: mouseTracking, sway, reduceMotion });
  });

  $effect(() => {
    void stageReady;
    void lipSync;
    void getMouthLevel;
    if (!stageReady || !renderer) return;
    renderer.setMouthProvider(lipSync && getMouthLevel ? getMouthLevel : null);
  });

  // ----- pointer gestures (only over the rendered character) -----

  function isInteractiveTarget(event) {
    const path = event.composedPath?.() || [];
    return path.some((node) => node instanceof HTMLElement && node.dataset?.hit !== undefined);
  }

  function blockGesture() {
    if (!interactive) {
      pointerCandidate = null;
      dragging = false;
      return true;
    }
    return false;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (blockGesture()) return;
    if (isInteractiveTarget(event)) return;
    if (!renderer || status !== 'ready') return;
    if (!renderer.hitTest(event.clientX, event.clientY)) return;
    pointerCandidate = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    dragging = false;
  }

  function onPointerMove(event) {
    if (blockGesture()) return;
    if (!pointerCandidate || event.pointerId !== pointerCandidate.id) return;
    const dx = event.clientX - pointerCandidate.x;
    const dy = event.clientY - pointerCandidate.y;
    if (!pointerCandidate.moved && Math.hypot(dx, dy) > 5) {
      pointerCandidate.moved = true;
      dragging = true;
      if (IS_TAURI) {
        startDragging();
        pointerCandidate = null;
      }
    }
  }

  function onPointerUp(event) {
    if (blockGesture()) return;
    if (!pointerCandidate || event.pointerId !== pointerCandidate.id) return;
    const candidate = pointerCandidate;
    pointerCandidate = null;
    if (candidate.moved || dragging) {
      dragging = false;
      return;
    }
    const now = performance.now();
    const isDouble = now - lastPokeAt < 320;
    lastPokeAt = now;
    renderer?.poke();
    onpoke?.({ x: event.clientX, y: event.clientY });
    if (isDouble) onopenchat?.();
  }

  function onPointerCancel() {
    pointerCandidate = null;
    dragging = false;
  }

  function onContextMenu(event) {
    if (blockGesture()) return;
    if (!renderer || status !== 'ready') return;
    if (!renderer.hitTest(event.clientX, event.clientY)) return;
    event.preventDefault();
    oncontext?.({ x: event.clientX, y: event.clientY });
  }

  function addPointerListeners() {
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('contextmenu', onContextMenu);
  }

  function removePointerListeners() {
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('contextmenu', onContextMenu);
  }

  onMount(addPointerListeners);
  onDestroy(removePointerListeners);

  // ----- public API -----

  /** Apply a resolved look ({ params, custom }). */
  export function applyLook(look, options) {
    renderer?.applyLook(look, options);
  }

  export function clearLook() {
    renderer?.clearLook();
  }

  export function poke() {
    renderer?.poke();
  }

  export function hitTest(x, y, radius) {
    return renderer?.hitTest(x, y, radius) ?? false;
  }

  export function reload() {
    boot();
  }

  export function getRenderer() {
    return renderer;
  }
</script>

<div class="stage" bind:this={host} aria-hidden="true"></div>

{#if status === 'loading'}
  <div class="stage-overlay" role="status" aria-live="polite">
    <div class="sigil" aria-hidden="true">
      <span class="sigil-ring"></span>
      <span class="sigil-ring sigil-ring--slow"></span>
      <Icon name="loader" size={22} />
    </div>
    <p class="eyebrow">LILITH</p>
    <h2>正在唤醒</h2>
    <p class="status-line">{statusText}<span class="dots"></span></p>
    <div class="progress" aria-hidden="true">
      <i style:width="{Math.round(progress * 100)}%"></i>
    </div>
  </div>
{:else if status === 'error'}
  <div class="stage-error glass grain" data-hit role="alert">
    <div class="error-icon"><Icon name="alert" size={20} /></div>
    <div class="error-copy">
      <p class="eyebrow">模型未能加载</p>
      <p class="error-message">{errorMessage}</p>
      <p class="error-hint">检查模型目录、贴图尺寸与 <code>app.html</code> 的库加载顺序。</p>
    </div>
    <button class="retry" onclick={reload}>重试</button>
  </div>
{/if}

<style>
  .stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    contain: layout paint style;
  }

  .stage :global(canvas.live2d-canvas) {
    position: absolute !important;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    display: block;
  }

  .stage-overlay {
    position: absolute;
    left: 50%;
    top: 38%;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translate(-50%, -50%);
    width: min(80%, 320px);
    text-align: center;
    animation: lilith-fade-in 0.4s ease both;
    pointer-events: none;
  }
  .sigil {
    position: relative;
    display: grid;
    place-items: center;
    width: 66px;
    height: 66px;
    margin-bottom: 18px;
    border-radius: 50%;
    color: var(--ice);
    background: radial-gradient(circle at 50% 35%, rgba(169, 201, 255, 0.22), rgba(10, 14, 24, 0.2));
    border: 1px solid var(--ice-line);
  }
  .sigil :global(svg) {
    animation: lilith-spin 1.6s linear infinite;
  }
  .sigil-ring {
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    border: 1px solid rgba(169, 201, 255, 0.16);
    animation: sigil-pulse 2.8s ease-in-out infinite;
  }
  .sigil-ring--slow {
    inset: -22px;
    animation-delay: -1.4s;
    opacity: 0.6;
  }
  @keyframes sigil-pulse {
    0%,
    100% {
      transform: scale(0.94);
      opacity: 0.35;
    }
    50% {
      transform: scale(1.04);
      opacity: 0.85;
    }
  }
  .eyebrow {
    margin: 0 0 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.34em;
    color: var(--ice);
    opacity: 0.8;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--text-1);
  }
  .status-line {
    margin: 8px 0 14px;
    font-size: 12px;
    color: var(--text-3);
    min-height: 18px;
  }
  .dots::after {
    content: "";
    display: inline-block;
    width: 14px;
    text-align: left;
    animation: dots 1.4s steps(4, end) infinite;
  }
  @keyframes dots {
    0% {
      content: "";
    }
    25% {
      content: ".";
    }
    50% {
      content: "..";
    }
    75%,
    100% {
      content: "...";
    }
  }
  .progress {
    width: 140px;
    height: 2px;
    overflow: hidden;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.08);
  }
  .progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent, var(--ice), transparent);
    transition: width 0.4s var(--ease-out);
  }

  .stage-error {
    position: absolute;
    left: 50%;
    top: 44%;
    z-index: 20;
    width: min(88%, 360px);
    transform: translate(-50%, -50%);
    display: grid;
    grid-template-columns: 38px 1fr;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius-lg);
    pointer-events: auto;
    animation: lilith-rise 0.3s var(--ease-out) both;
  }
  .stage-error > * {
    position: relative;
    z-index: 1;
  }
  .error-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    color: var(--danger);
    background: rgba(255, 142, 146, 0.12);
    border: 1px solid rgba(255, 142, 146, 0.2);
  }
  .error-copy {
    min-width: 0;
  }
  .error-copy .eyebrow {
    color: var(--danger);
    letter-spacing: 0.18em;
    margin-bottom: 4px;
  }
  .error-message {
    margin: 0 0 6px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-1);
    word-break: break-word;
  }
  .error-hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-3);
  }
  .error-hint code {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
  }
  .retry {
    grid-column: 2;
    justify-self: start;
    margin-top: 2px;
    padding: 5px 14px;
    border-radius: 99px;
    font-size: 12px;
    color: var(--ink-1);
    background: var(--ice-strong);
    transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-fast);
  }
  .retry:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }
</style>
