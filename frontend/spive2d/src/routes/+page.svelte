<script>
  import { onMount, tick } from 'svelte';
  import { createRenderer } from '$lib/renderer/createRenderer.js';
  import { getRenderer, setRenderer } from '$lib/rendererStore.svelte.js';
  import { appState } from '$lib/appState.svelte.js';

  let canvasContainer = $state();
  let renderer = null;

  // UI 状态
  let showDragBar = $state(false);
  let showChat = $state(false);
  let chatLocked = $state(false);
  let mouseInWindow = $state(false);
  let lockReleaseTimer = null;
  let isTauri = $state(false);
  let appWindow = null;

  // WebSocket
  let ws = null;
  let messages = $state([]);
  let inputText = $state('');
  let wsConnected = $state(false);
  let reconnectTimer = null;

  // 缩放
  let scale = $state(1.0);
  let moveX = $state(0);
  let moveY = $state(0);

  // 输入框引用
  let inputEl = $state(null);
  let inputFocused = $state(false);

  // 情绪防抖相关
  let currentEmotion = '';
  let pendingEmotion = null;
  let emotionTimer = null;
  let leaveTimer = null;

  // 音频解锁状态
  let audioCtxUnlocked = false;
  let audioAutoplayUnlocked = false;

  // ===== 鼠标穿透控制 =====
  function updateMouseThrough() {
    if (!appWindow) return;
    const shouldIgnore = mouseInWindow && !showChat && !showDragBar;
    appWindow.setIgnoreCursorEvents(shouldIgnore);
    document.body.style.cursor = shouldIgnore ? 'none' : 'auto';
  }

  // ===== 置顶 =====
  async function setWindowAlwaysOnTop() {
    if (isTauri && appWindow?.setAlwaysOnTop) {
      await appWindow.setAlwaysOnTop(true);
    }
  }

  // ===== 锁定释放计时器 =====
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

  // ===== 情绪切换（防抖 + 去重） =====
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
        r.setAnimation(pendingEmotion).catch(() => {});
        currentEmotion = pendingEmotion;
      }
      pendingEmotion = null;
    }, 300);
  }

  // ===== 解锁 Web Audio API 上下文 =====
  function unlockWebViewAudio() {
    if (audioCtxUnlocked) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          audioCtxUnlocked = true;
          console.log("✅ AudioContext 已解锁");
        });
      } else {
        audioCtxUnlocked = true;
      }
    } catch (e) {
      console.warn("⚠️ AudioContext 解锁失败:", e);
    }
  }

  // ===== 解锁 HTMLAudioElement 自动播放 =====
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
      console.log('✅ 音频自动播放已解锁');
    } catch (e) {
      console.warn('音频解锁失败:', e);
    }
  }

  // ===== 主初始化 =====
  onMount(async () => {
    // 检测 Tauri 环境
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      appWindow = getCurrentWindow();
      isTauri = true;
    } catch {
      isTauri = false;
      appWindow = null;
    }

    // 清理旧渲染器
    const existing = getRenderer();
    if (existing) {
      existing.dispose();
      setRenderer(null);
    }

    document.body.style.backgroundColor = 'transparent';
    document.body.style.backgroundImage = 'none';

    const fileNames = {
      name: 'Lilith',
      mainExt: '.skel',
      atlasExt: '.atlas',
      files: [],
      isMerged: false
    };

    renderer = createRenderer(fileNames);
    const canvas = renderer.getCanvas();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    if (canvasContainer) canvasContainer.appendChild(canvas);

    if (renderer.setAlphaMode) renderer.setAlphaMode('pma');
    if (renderer.setTextureFilter) renderer.setTextureFilter('linear');
    renderer.resize(canvas.width, canvas.height);

    renderer._scale = scale;
    renderer._moveX = moveX;
    renderer._moveY = moveY;

    try {
      await renderer.load('', fileNames);
      console.log('✅ 模型加载成功');
      renderer.setSpeed(0.40);
      renderer.render(0);
    } catch (e) {
      console.error('❌ 模型加载失败:', e);
      return;
    }

    setRenderer(renderer);
    appState.initialized = true;

    if (renderer.startRenderLoop) renderer.startRenderLoop();
    if (renderer.startAutoRandomAnim) renderer.startAutoRandomAnim(300000);

    // 延迟连接 WebSocket，避免 Tauri WebView 初始化未完成导致失败
    setTimeout(() => {
      connectWebSocket();
    }, 800);

    setWindowAlwaysOnTop();

    const enter = () => {
      mouseInWindow = true;
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      if (lockReleaseTimer) { clearTimeout(lockReleaseTimer); lockReleaseTimer = null; }
    };
    const leave = () => {
      mouseInWindow = false;
      if (!chatLocked && !inputFocused) {
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => { showChat = false; }, 2000);
      } else if (chatLocked) {
        scheduleLockRelease();
      }
      showDragBar = false;
    };
    document.body.addEventListener('mouseenter', enter);
    document.body.addEventListener('mouseleave', leave);

    if (document.body.matches(':hover')) {
      mouseInWindow = true;
    }
    updateMouseThrough();

    // 全局首次点击解锁音频自动播放
    document.addEventListener('click', () => {
      unlockAudioAutoplay();
    }, { once: true });

    return () => {
      document.body.removeEventListener('mouseenter', enter);
      document.body.removeEventListener('mouseleave', leave);
      if (lockReleaseTimer) clearTimeout(lockReleaseTimer);
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
    };
  });

  // 对话框显示逻辑
  $effect(() => {
    if (chatLocked || inputFocused) {
      showChat = true;
    } else {
      showChat = mouseInWindow && !showDragBar;
    }
    updateMouseThrough();

    if (showChat && inputEl) {
      tick().then(() => {
        inputEl?.focus();
      });
    }
  });

  $effect(() => {
    updateMouseThrough();
  });

  // ===== WebSocket 连接（优化版） =====
  function connectWebSocket() {
    // 避免重复连接
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }
    // 清理旧连接
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }

    console.log('🔌 正在连接 WebSocket...');
    try {
      ws = new WebSocket('ws://127.0.0.1:8000/ws');

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
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (e) {
          console.error('解析消息失败:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('❌ WebSocket 错误:', e);
        wsConnected = false;
      };

      ws.onclose = (e) => {
        console.log(`🔌 WebSocket 断开 (code: ${e.code})`);
        wsConnected = false;
        ws = null;
        // 5 秒后自动重连
        reconnectTimer = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };
    } catch (e) {
      console.error('创建 WebSocket 失败:', e);
      reconnectTimer = setTimeout(() => {
        connectWebSocket();
      }, 5000);
    }
  }

  // ===== 处理收到的消息 =====
  function handleWebSocketMessage(data) {
    if (data.type === 'audio_chunk') {
      const text = data.payload?.text || '';
      const emotion = data.payload?.expression || 'neutral';

      messages = [...messages, { from: 'lilith', text, emotion }].slice(-100);
      requestEmotion(emotion);

      // 优先使用 audio_url（静态文件路径），其次 base64
      const audioUrl = data.payload?.audio_url;
      const audioBase64 = data.payload?.audio_base64;

      if (audioUrl) {
        const fullAudioUrl = `http://127.0.0.1:8000${audioUrl}`;
        playAudio(fullAudioUrl);
      } else if (audioBase64) {
        playAudio(`data:audio/wav;base64,${audioBase64}`);
      } else {
        console.warn('⚠️ 收到 audio_chunk 但没有音频数据');
      }
    }
  }

  // ===== 安全播放音频 =====
  function playAudio(src) {
    // 停止并清理前一个音频
    if (window.currentAudio) {
      window.currentAudio.pause();
      window.currentAudio.src = '';
      window.currentAudio.load();
      window.currentAudio = null;
    }
    const audio = new Audio(src);
    window.currentAudio = audio;

    audio.onerror = () => {
      console.error('❌ 音频加载失败:', src);
    };

    audio.play()
      .then(() => console.log('▶️ 播放成功'))
      .catch(err => {
        console.warn('⛔ 播放被拦截:', err);
        if (!audioAutoplayUnlocked) {
          console.log('💡 请点击页面任意位置解锁音频自动播放');
        }
      });
  }

  // ===== 发送消息 =====
  function sendMessage() {
    const text = inputText.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) {
      if (!wsConnected) alert('未连接到服务器');
      return;
    }
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
    if (renderer) renderer._scale = scale;
  }

  function handleResize() {
    if (!renderer) return;
    clearTimeout(resizeTimer);
    let resizeTimer;
    resizeTimer = setTimeout(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth * dpr;
      const h = window.innerHeight * dpr;
      renderer.resize(w, h);
      renderer._moveX = 0;
      renderer._moveY = 0;
    }, 150);
  }

  function onTriggerEnter() { showDragBar = true; }
  function onTriggerLeave() { showDragBar = false; }
</script>

<svelte:window onresize={handleResize} onwheel={handleWheel} />

<!-- 顶部触发区 -->
<div id="top-trigger" onmouseenter={onTriggerEnter} onmouseleave={onTriggerLeave}>
  {#if showDragBar}
    <div id="drag-bar" data-tauri-drag-region></div>
  {/if}
</div>

<!-- Spine 画布 -->
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
  .bubble.lilith { align-self: flex-start; }
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