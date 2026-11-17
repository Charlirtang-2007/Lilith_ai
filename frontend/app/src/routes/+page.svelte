<script>
  import { onMount, tick } from 'svelte';
  import { createRenderer } from '$lib/renderer/createRenderer.js';
  import { getRenderer, setRenderer } from '$lib/rendererStore.svelte.js';
  import { appState } from '$lib/appState.svelte.js';
  import { BACKEND_HTTP, BACKEND_WS, LIVE2D_MODEL_DIR, MODEL_SCALE, IDLE_SWITCH_MS, EMOTION_MOTIONS } from '../config.js';

  let canvasContainer = $state();
  let renderer = null;

  // ===== UI 状态 =====
  let showDragBar = $state(false);
  let showChat = $state(false);
  let chatLocked = $state(false);
  let mouseInWindow = $state(false);
  let lockReleaseTimer = null;
  let isTauri = $state(false);
  let appWindow = null;

  // ===== WebSocket =====
  let ws = null;
  let messages = $state([]);
  let inputText = $state('');
  let wsConnected = $state(false);
  let reconnectTimer = null;

  // ===== 模型变换 =====
  let scale = $state(MODEL_SCALE);

  // ===== 输入框 =====
  let inputEl = $state(null);
  let inputFocused = $state(false);

  // ===== 情绪 =====
  let currentEmotion = '';
  let pendingEmotion = null;
  let emotionTimer = null;
  let leaveTimer = null;

  // ===== 音频 =====
  let audioCtxUnlocked = false;
  let audioAutoplayUnlocked = false;

  function updateMouseThrough() {
    if (!appWindow) return;
    const shouldIgnore = mouseInWindow && !showChat && !showDragBar;
    appWindow.setIgnoreCursorEvents(shouldIgnore);
    document.body.style.cursor = shouldIgnore ? 'none' : 'auto';
  }

  async function setWindowAlwaysOnTop() {
    if (isTauri && appWindow?.setAlwaysOnTop) {
      await appWindow.setAlwaysOnTop(true);
    }
  }

  function scheduleLockRelease() {
    if (lockReleaseTimer) clearTimeout(lockReleaseTimer);
    lockReleaseTimer = setTimeout(() => {
      if (chatLocked && !mouseInWindow) {
        chatLocked = false;
        showChat = false;
        updateMouseThrough();
      }
    }, 3000);
  }

  // ===== 情绪 → 动作（防抖 + 去重）=====
  async function playEmotion(emotion) {
    const candidates = EMOTION_MOTIONS[emotion] || [];
    if (!candidates.length) return;
    // 从模型里找到第一个真实存在的动作（"组名" 或 "组名,序号"）
    const animations = (await getRenderer()?.getAnimations?.()) || [];
    const names = new Set(animations.map((a) => a.name));
    const values = new Set(animations.map((a) => a.value));
    const hit = candidates.find((c) => names.has(c) || values.has(c));
    if (!hit) {
      console.warn(`模型里没有情绪 ${emotion} 对应的动作，保持 idle`);
      return;
    }
    await getRenderer()?.setAnimation?.(hit);
  }

  function requestEmotion(emotion) {
    if (!emotion || emotion === currentEmotion) return;
    if (pendingEmotion === emotion) {
      clearTimeout(emotionTimer);
    } else {
      pendingEmotion = emotion;
    }
    emotionTimer = setTimeout(() => {
      const r = getRenderer();
      if (r?.setAnimation) {
        playEmotion(pendingEmotion).catch(() => {});
        currentEmotion = pendingEmotion;
      }
      pendingEmotion = null;
    }, 300);
  }

  // ===== 解锁 WebView 音频 =====
  function unlockWebViewAudio() {
    if (audioCtxUnlocked) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => { audioCtxUnlocked = true; });
      } else {
        audioCtxUnlocked = true;
      }
    } catch (e) {
      console.warn('⚠️ AudioContext 解锁失败:', e);
    }
  }

  function unlockAudioAutoplay() {
    if (audioAutoplayUnlocked) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 220;
      gain.gain.value = 0.01;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
      audioAutoplayUnlocked = true;
    } catch (e) {
      console.warn('音频解锁失败:', e);
    }
  }

  // ===== 鼠标进出 =====
  function enter() {
    mouseInWindow = true;
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    if (lockReleaseTimer) { clearTimeout(lockReleaseTimer); lockReleaseTimer = null; }
  }

  function leave() {
    mouseInWindow = false;
    if (!chatLocked && !inputFocused) {
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => { showChat = false; }, 2000);
    } else if (chatLocked) {
      scheduleLockRelease();
    }
    showDragBar = false;
  }

  // ===== 主初始化 =====
  onMount(() => {
    init();
    return cleanup;
  });

  async function init() {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      appWindow = getCurrentWindow();
      isTauri = true;
    } catch {
      isTauri = false;
      appWindow = null;
    }

    const existing = getRenderer();
    if (existing) {
      existing.dispose();
      setRenderer(null);
    }

    document.body.style.backgroundColor = 'transparent';
    document.body.style.backgroundImage = 'none';

    // Live2D 场景：目录（以 / 结尾）+ 主文件（*.model3.json）
    const dirName = LIVE2D_MODEL_DIR.endsWith('/') ? LIVE2D_MODEL_DIR : `${LIVE2D_MODEL_DIR}/`;
    const modelName = dirName.replace(/\/$/, '').split('/').pop();
    const fileNames = { name: modelName, mainExt: '.model3.json', files: [], isMerged: false };

    renderer = createRenderer(fileNames);
    const canvas = renderer.getCanvas();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    if (canvasContainer) canvasContainer.appendChild(canvas);

    if (renderer.setTextureFilter) renderer.setTextureFilter('linear');
    renderer.resize(canvas.width, canvas.height);

    try {
      await renderer.load(dirName, fileNames);
      console.log('✅ Live2D 模型加载成功');
    } catch (e) {
      console.error('❌ Live2D 模型加载失败:', e);
      return;
    }

    renderer._scale = scale;
    if (renderer.applyTransform) renderer.applyTransform(scale, 0, 0, 0);

    setRenderer(renderer);
    appState.initialized = true;

    // 周期性随机待机动作
    if (IDLE_SWITCH_MS > 0) {
      const idleTimer = setInterval(() => {
        getRenderer()?.setAnimation?.('Idle').catch(() => {});
      }, IDLE_SWITCH_MS);
      window.__lilithIdleTimer = idleTimer;
    }

    setTimeout(() => connectWebSocket(), 800);
    setWindowAlwaysOnTop();

    document.body.addEventListener('mouseenter', enter);
    document.body.addEventListener('mouseleave', leave);
    if (document.body.matches(':hover')) mouseInWindow = true;
    updateMouseThrough();

    // 首次点击解锁音频自动播放
    document.addEventListener('click', () => unlockAudioAutoplay(), { once: true });
  }

  function cleanup() {
    document.body.removeEventListener('mouseenter', enter);
    document.body.removeEventListener('mouseleave', leave);
    if (lockReleaseTimer) clearTimeout(lockReleaseTimer);
    if (window.__lilithIdleTimer) clearInterval(window.__lilithIdleTimer);
    if (renderer) {
      renderer.dispose();
      setRenderer(null);
      const canvasEl = renderer.getCanvas();
      if (canvasEl?.parentNode) canvasEl.parentNode.removeChild(canvasEl);
      renderer = null;
    }
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (emotionTimer) clearTimeout(emotionTimer);
    if (leaveTimer) clearTimeout(leaveTimer);
  }

  $effect(() => {
    if (chatLocked || inputFocused) {
      showChat = true;
    } else {
      showChat = mouseInWindow && !showDragBar;
    }
    updateMouseThrough();

    if (showChat && inputEl) {
      tick().then(() => inputEl?.focus());
    }
  });

  $effect(() => {
    updateMouseThrough();
  });

  // ===== WebSocket =====
  function connectWebSocket() {
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }

    try {
      ws = new WebSocket(BACKEND_WS);
      ws.onopen = () => {
        console.log('✅ WebSocket 已连接');
        wsConnected = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      };
      ws.onmessage = (event) => {
        try {
          handleWebSocketMessage(JSON.parse(event.data));
        } catch (e) {
          console.error('解析消息失败:', e);
        }
      };
      ws.onerror = () => { wsConnected = false; };
      ws.onclose = () => {
        wsConnected = false;
        ws = null;
        reconnectTimer = setTimeout(connectWebSocket, 5000);
      };
    } catch (e) {
      console.error('创建 WebSocket 失败:', e);
      reconnectTimer = setTimeout(connectWebSocket, 5000);
    }
  }

  function handleWebSocketMessage(data) {
    if (data.type === 'audio_chunk') {
      const text = data.payload?.text || '';
      const emotion = data.payload?.expression || 'neutral';
      messages = [...messages, { from: 'pet', text, emotion }].slice(-100);
      requestEmotion(emotion);

      const audioUrl = data.payload?.audio_url;
      if (audioUrl) {
        playAudio(`${BACKEND_HTTP}${audioUrl}`);
      } else {
        console.warn('⚠️ 收到 audio_chunk 但没有音频，降级为文字');
      }
    } else if (data.type === 'system_message') {
      messages = [...messages, { from: 'system', text: data.payload?.text || '' }].slice(-100);
    }
  }

  function playAudio(src) {
    if (window.currentAudio) {
      window.currentAudio.pause();
      window.currentAudio.src = '';
      window.currentAudio.load();
      window.currentAudio = null;
    }
    const audio = new Audio(src);
    window.currentAudio = audio;
    audio.onerror = () => console.error('❌ 音频加载失败:', src);
    audio.play().catch((err) => {
      console.warn('⛔ 播放被拦截:', err);
    });
  }

  // ===== 交互 =====
  function sendMessage() {
    const text = inputText.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    messages = [...messages, { from: 'user', text }].slice(-100);
    ws.send(JSON.stringify({ type: 'text_input', payload: { text } }));
    inputText = '';
    inputEl?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function lockChat() {
    chatLocked = true;
    updateMouseThrough();
    if (lockReleaseTimer) clearTimeout(lockReleaseTimer);
    tick().then(() => inputEl?.focus());
  }

  function unlockChat() {
    chatLocked = false;
    inputFocused = false;
    showChat = false;
    if (lockReleaseTimer) clearTimeout(lockReleaseTimer);
    updateMouseThrough();
  }

  function handleWheel(e) {
    if (e.target.closest('#chat-overlay')) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.max(0.3, Math.min(3.0, scale + delta));
    if (renderer) {
      renderer._scale = scale;
      renderer.applyTransform?.(scale, 0, 0, 0);
    }
  }

  let resizeTimer;
  function handleResize() {
    if (!renderer) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(window.innerWidth * dpr, window.innerHeight * dpr);
      renderer.applyTransform?.(scale, 0, 0, 0);
    }, 150);
  }

  function onTriggerEnter() { showDragBar = true; }
  function onTriggerLeave() { showDragBar = false; }
</script>

<svelte:window onresize={handleResize} onwheel={handleWheel} />

<!-- 顶部拖拽区 -->
<div id="top-trigger" role="presentation" onmouseenter={onTriggerEnter} onmouseleave={onTriggerLeave}>
  {#if showDragBar}
    <div id="drag-bar" data-tauri-drag-region></div>
  {/if}
</div>

<!-- Live2D 画布 -->
<div id="canvasContainer" bind:this={canvasContainer}></div>

<!-- 对话框 -->
{#if showChat}
  <div id="chat-overlay" role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') lockChat() }} onclick={lockChat}>
    <div id="message-list">
      {#each messages as msg, i (i)}
        <div class="bubble {msg.from}">
          {msg.text}
          {#if msg.emotion}<span class="emotion-tag"> [{msg.emotion}]</span>{/if}
        </div>
      {/each}
    </div>
    <div id="input-area">
      <input
        bind:this={inputEl}
        bind:value={inputText}
        onkeydown={handleKeyDown}
        onfocus={() => {
          inputFocused = true;
          unlockWebViewAudio();
          if (leaveTimer) {
            clearTimeout(leaveTimer);
            leaveTimer = null;
          }
        }}
        onclick={() => unlockAudioAutoplay()}
        onblur={() => inputFocused = false}
        placeholder="说点什么..."
        disabled={!wsConnected}
      />
      <button onclick={sendMessage} disabled={!wsConnected}>发送</button>
      <button onclick={unlockChat} class="close-btn">✕</button>
    </div>
    <div id="connection-status" class:connected={wsConnected}>
      {wsConnected ? '🟢 已连接' : '🔴 未连接'}
    </div>
  </div>
{/if}

<style>
  #top-trigger {
    position: fixed; top: 0; left: 0;
    width: 100%; height: 30px;
    z-index: 150; pointer-events: auto;
  }
  #drag-bar {
    width: 100%; height: 100%;
    -webkit-app-region: drag;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(4px);
    cursor: move;
  }
  #canvasContainer {
    position: fixed; top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 0; pointer-events: none;
  }
  #canvasContainer :global(canvas) {
    width: 100% !important; height: 100% !important;
    border: none !important; outline: none !important;
    box-shadow: none !important; margin: 0 !important; padding: 0 !important;
  }
  :global(body) {
    margin: 0; padding: 0;
    background: transparent !important;
    overflow: hidden;
    user-select: none;
    pointer-events: auto;
  }
  #chat-overlay {
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%);
    width: 80%; max-height: 50%;
    display: flex; flex-direction: column; align-items: center;
    z-index: 200; font-family: system-ui, -apple-system, sans-serif;
    pointer-events: auto;
    background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(10px);
    border-radius: 16px; padding: 12px 16px;
  }
  #message-list {
    width: 100%; overflow-y: auto;
    display: flex; flex-direction: column; gap: 6px;
    max-height: 200px; padding: 4px 0;
  }
  .bubble {
    padding: 6px 12px; border-radius: 12px; max-width: 70%;
    word-wrap: break-word; background: rgba(0,0,0,0.5);
    color: white; backdrop-filter: blur(4px); font-size: 14px;
  }
  .bubble.user { align-self: flex-end; background: #4a9eff; }
  .bubble.pet { align-self: flex-start; }
  .bubble.system { align-self: center; opacity: 0.8; font-size: 12px; }
  .emotion-tag { font-size: 10px; opacity: 0.7; margin-left: 4px; }
  #input-area { display: flex; gap: 8px; margin-top: 8px; width: 100%; max-width: 400px; }
  #input-area input {
    flex: 1; padding: 6px 12px; border-radius: 20px; border: none;
    background: rgba(255,255,255,0.15); color: white; outline: none; font-size: 14px;
    backdrop-filter: blur(4px);
  }
  #input-area input::placeholder { color: rgba(255,255,255,0.6); }
  #input-area input:disabled { opacity: 0.5; cursor: not-allowed; }
  #input-area button {
    padding: 6px 16px; border-radius: 20px; border: none;
    background: #4a9eff; color: white; cursor: pointer; font-size: 14px; transition: background 0.2s;
  }
  #input-area button:hover:not(:disabled) { background: #6ab0ff; }
  #input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
  .close-btn { background: rgba(255,255,255,0.2); font-size: 16px; line-height: 1; }
  .close-btn:hover { background: rgba(255,255,255,0.35); }
  #connection-status {
    margin-top: 6px; font-size: 12px; color: rgba(255,255,255,0.6);
    background: rgba(0,0,0,0.3); padding: 2px 10px; border-radius: 12px; backdrop-filter: blur(2px);
  }
  #connection-status.connected { color: #8f8; }
</style>
