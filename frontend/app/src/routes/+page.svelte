<script>
  /**
   * Lilith · desktop companion shell.
   *
   * Responsibilities are deliberately narrow: wire the brain (WebSocket), the
   * voice playback, the character stage and the window behaviours together.
   * Visual work lives in `$lib/components/*`; Live2D work lives in
   * `$lib/live2d/Live2DRenderer.js`.
   */
  import { onMount, onDestroy } from 'svelte';
  import Ambient from '$lib/components/Ambient.svelte';
  import CharacterStage from '$lib/components/CharacterStage.svelte';
  import TopChrome from '$lib/components/TopChrome.svelte';
  import SpeechBubble from '$lib/components/SpeechBubble.svelte';
  import Dock from '$lib/components/Dock.svelte';
  import ChatDrawer from '$lib/components/ChatDrawer.svelte';
  import ExpressionShelf from '$lib/components/ExpressionShelf.svelte';
  import SettingsSheet from '$lib/components/SettingsSheet.svelte';
  import ContextMenu from '$lib/components/ContextMenu.svelte';
  import ToastHost from '$lib/components/ToastHost.svelte';
  import { PetSocket } from '$lib/net/PetSocket.svelte.js';
  import { AudioEngine } from '$lib/audio/AudioEngine.js';
  import { settings } from '$lib/settings.svelte.js';
  import { toast, dismissToast } from '$lib/toast.svelte.js';
  import {
    buildShelf,
    emotionToLook,
    getEmotion,
    shelfIdToLook,
    shelfLabel,
  } from '$lib/expressions.js';
  import { IS_TAURI } from '$lib/runtime.js';
  import {
    initWindowBridge,
    disposeWindowBridge,
    setAlwaysOnTop,
    setIgnoreCursorEvents,
    closeWindow,
    focusWindow,
    cursorLocalPosition,
  } from '$lib/tauri/windowBridge.js';
  import { BACKEND_HTTP, PET_NAME } from '../config.js';

  const isTauri = IS_TAURI;
  const audio = new AudioEngine();
  const ONBOARD_KEY = 'lilith.v3.onboarded';

  const POKE_LINES = [
    '呀…别戳啦。',
    '嗯？怎么啦？',
    '再戳就要生气了哦。',
    '我在呢，一直都在。',
    '……有点痒。',
    '今天也辛苦了。',
  ];

  // ----- conversation -----
  let messages = $state([]);
  let unread = $state(0);
  let bubble = $state(null);
  let emotion = $state('neutral');
  let manualLook = $state(null);
  let audioPlaying = $state(false);
  let messageSeq = 0;
  let playbackToken = 0;
  let audioWarned = false;
  let audioUnlocked = false;
  let pseudoTimer = 0;
  let bubbleTimer = 0;
  let emotionTimer = 0;
  let lastPokeLine = '';
  let onboardToastId = null;
  let onboardTimer = 0;

  // ----- stage -----
  let stage = null;
  let stageStatus = $state('loading');
  let modelInfo = $state(null);

  // ----- overlays -----
  let drawerOpen = $state(false);
  let settingsOpen = $state(false);
  let exprOpen = $state(false);
  let menu = $state(null);
  let focusToken = $state(0);

  // ----- window / tauri -----
  let windowReady = $state(false);
  let unlistenBackend = null;
  let interactionTimer = 0;
  let ignoreCursor = false;
  let lastHitAt = 0;
  let checkingPointer = false;
  let offlineHintTimer = 0;
  let connectionCount = 0;
  let destroyed = false;

  const socket = new PetSocket({
    onPacket: handlePacket,
    onOpen: handleSocketOpen,
    onClose: handleSocketClose,
  });

  const uiStatus = $derived(audioPlaying ? 'speaking' : socket.brain);
  const speaking = $derived(audioPlaying || socket.brain === 'speaking');
  const exprOptions = $derived(buildShelf(modelInfo?.expressions || []));
  const activeLook = $derived(manualLook);
  const bubbleVisible = $derived(!!bubble && !drawerOpen && !settingsOpen);

  // ----- lifecycle -----

  onMount(() => {
    if (isTauri) {
      document.addEventListener('contextmenu', suppressNativeMenu);
      initWindowBridge().then((ok) => {
        if (destroyed) return;
        windowReady = ok;
        if (ok) startInteractionLoop();
      });
      setupTauriRelay();
    }

    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);
    window.addEventListener('wheel', handleWheel, { passive: false });
    socket.connect();

    offlineHintTimer = window.setTimeout(() => {
      if (!destroyed && socket.phase !== 'open') {
        toast('后端未连接：请启动 backend/main.py', 'warning', 5200);
      }
    }, 6500);

    return () => {
      destroyed = true;
      clearTimeout(bubbleTimer);
      clearTimeout(emotionTimer);
      clearTimeout(pseudoTimer);
      clearTimeout(offlineHintTimer);
      clearTimeout(onboardTimer);
      clearInterval(interactionTimer);
      socket.dispose();
      audio.dispose();
      unlistenBackend?.();
      window.removeEventListener('wheel', handleWheel);
      document.removeEventListener('contextmenu', suppressNativeMenu);
      if (isTauri && windowReady) setIgnoreCursorEvents(false);
      // Drop the native geometry listeners; `setIgnoreCursorEvents` above has
      // already captured the window handle, so ordering keeps that call valid.
      disposeWindowBridge();
    };
  });

  onDestroy(() => {
    destroyed = true;
  });

  async function setupTauriRelay() {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const un = await listen('backend-message', (event) => {
        if (event?.payload) handlePacket(event.payload);
      });
      if (destroyed) un();
      else unlistenBackend = un;
    } catch (err) {
      // The WS is the primary transport; the Tauri relay is only for dev emit.
      console.info('[tauri] relay unavailable', err);
    }
  }

  function suppressNativeMenu(event) {
    event.preventDefault();
  }

  // ----- socket wiring -----

  function handleSocketOpen() {
    connectionCount += 1;
    if (connectionCount > 1) toast('已重新连接后端', 'success');
  }

  function handleSocketClose() {
    if (audioPlaying) stopPlayback();
  }

  function handlePacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'audio_chunk') {
      handleReply(packet.payload || {});
    } else if (packet.type === 'system_message') {
      handleSystem(packet.payload || {});
    } else if (packet.type === 'text_input') {
      handleRecognizedText(packet.payload || {});
    }
  }

  function handleReply(payload) {
    const text = String(payload.text || '').trim();
    if (!text) return;
    const expression = payload.expression || 'neutral';
    const audioUrl = resolveAudioUrl(payload.audio_url);
    const message = addMessage({
      role: 'pet',
      text,
      emotion: expression,
      emotionInfo: getEmotion(expression),
      audioUrl,
      alarm: !!payload.is_alarm,
    });
    setEmotion(expression, { holdMs: payload.is_alarm ? 9000 : 14000 });
    if (!drawerOpen && !settingsOpen) {
      showBubble(message);
    }
    playReply(message);
  }

  function handleSystem(payload) {
    const text = String(payload.text || '').trim();
    if (!text) return;
    const alarm = text.includes('⏰') || text.includes('闹钟');
    addMessage({ role: 'system', text, alarm });
    toast(text, alarm ? 'warning' : 'info', alarm ? 6000 : 3400);
  }

  function handleRecognizedText(payload) {
    const text = String(payload.text || '').trim();
    if (!text) return;
    addMessage({ role: 'user', text });
    // A voice turn was accepted; make sure the chat is discoverable.
    if (!drawerOpen) unread = Math.max(unread, 0);
  }

  function addMessage(partial) {
    const message = {
      id: ++messageSeq,
      at: Date.now(),
      ...partial,
    };
    messages.push(message);
    if (messages.length > 200) messages.splice(0, messages.length - 200);
    if (message.role === 'pet' && !drawerOpen) unread += 1;
    return message;
  }

  // ----- conversation UI -----

  function openChat() {
    drawerOpen = true;
    settingsOpen = false;
    menu = null;
    bubble = null;
    clearTimeout(bubbleTimer);
    unread = 0;
    focusToken += 1;
    if (isTauri && windowReady) focusWindow();
  }

  function closeChat() {
    drawerOpen = false;
  }

  function sendText(text) {
    const value = String(text || '').trim();
    if (!value) return;
    if (!socket.open) {
      toast('后端尚未连接，消息未发出', 'warning');
      return;
    }
    if (audioPlaying) stopPlayback();
    if (manualLook === null && settings.autoEmotion) setEmotion('calm', { holdMs: 9000 });
    addMessage({ role: 'user', text: value });
    const sent = socket.sendText(value);
    if (!sent) toast('发送失败，请稍后重试', 'error');
    bubble = null;
    clearTimeout(bubbleTimer);
    unread = 0;
  }

  async function sendVoice(base64, mimeType) {
    if (!socket.open) {
      toast('后端尚未连接，语音未发出', 'warning');
      return;
    }
    stopPlayback();
    const sent = socket.sendAudio(base64, mimeType);
    if (sent) toast('已发送语音，正在识别…', 'info', 2600);
    else toast('语音发送失败', 'error');
  }

  function clearMessages() {
    messages.splice(0, messages.length);
    unread = 0;
    toast('对话记录已清空', 'success');
  }

  function replayMessage(message) {
    if (!message?.audioUrl) return;
    stopPlayback();
    setEmotion(message.emotion || 'neutral', { holdMs: 8000 });
    if (!drawerOpen && !settingsOpen) showBubble(message);
    playReply(message);
  }

  function stopCurrent() {
    if (socket.brain === 'thinking') {
      socket.interrupt();
      toast('已发送打断请求', 'info');
    }
    stopPlayback();
  }

  // ----- speech bubble -----

  function showBubble(message) {
    bubble = message;
    if (onboardToastId != null) {
      dismissToast(onboardToastId);
      onboardToastId = null;
    }
    scheduleBubbleHide(Math.max(settings.bubbleSeconds, 5) + 2);
  }

  function scheduleBubbleHide(seconds) {
    clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => {
      bubble = null;
    }, Math.max(1500, seconds * 1000));
  }

  function closeBubble() {
    bubble = null;
    clearTimeout(bubbleTimer);
  }

  // ----- emotions / expressions -----

  function setEmotion(id, { holdMs = 14000 } = {}) {
    emotion = id || 'neutral';
    clearTimeout(emotionTimer);
    if (holdMs > 0) {
      emotionTimer = window.setTimeout(() => {
        if (!manualLook) emotion = 'neutral';
      }, holdMs);
    }
  }

  function selectLook(id) {
    manualLook = id;
    if (id === null) {
      settings.autoEmotion = true;
      toast('表情已恢复跟随情绪', 'info', 2200);
    } else {
      toast(`表情：${shelfLabel(id, modelInfo?.expressions || [])}`, 'success', 2200);
    }
  }

  function toggleExpressions() {
    exprOpen = !exprOpen;
    if (exprOpen) {
      menu = null;
    }
  }

  function handlePoke() {
    let line = POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)];
    if (line === lastPokeLine) line = POKE_LINES[(POKE_LINES.indexOf(line) + 1) % POKE_LINES.length];
    lastPokeLine = line;
    const info = getEmotion('embarrassed');
    bubble = {
      id: `poke-${Date.now()}`,
      at: Date.now(),
      role: 'pet',
      text: line,
      emotion: 'embarrassed',
      emotionInfo: info,
    };
    if (onboardToastId != null) {
      dismissToast(onboardToastId);
      onboardToastId = null;
    }
    scheduleBubbleHide(Math.max(4, settings.bubbleSeconds - 3));
    if (!manualLook && settings.autoEmotion) setEmotion('embarrassed', { holdMs: 4200 });
  }

  // ----- audio -----

  function resolveAudioUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
    return `${BACKEND_HTTP}${value.startsWith('/') ? '' : '/'}${value}`;
  }

  function estimateSpeechMs(text) {
    const length = String(text || '').length;
    return Math.min(12000, Math.max(1800, length * 105 + 700));
  }

  async function unlockAudio() {
    if (audioUnlocked) return;
    const ok = await audio.unlock();
    if (ok) audioUnlocked = true;
  }

  function playReply(message) {
    const token = ++playbackToken;
    clearTimeout(pseudoTimer);
    audioPlaying = true;
    const estimate = estimateSpeechMs(message.text);
    if (message.audioUrl && !settings.muted) {
      audio.play(message.audioUrl, {
        onEnd: () => {
          if (token === playbackToken) finishPlayback();
        },
        onError: () => {
          if (token !== playbackToken) return;
          if (!audioWarned) {
            audioWarned = true;
            toast('语音播放失败，已切换为静音说话', 'warning');
          }
          startFallbackSpeech(estimate);
        },
      });
      // Watchdog: a stalled <audio> must never leave the pet "speaking" forever.
      clearTimeout(pseudoTimer);
      pseudoTimer = window.setTimeout(() => {
        if (token === playbackToken && audioPlaying) finishPlayback();
      }, Math.max(16000, estimate * 2 + 4000));
    } else {
      startFallbackSpeech(estimate);
    }
  }

  function startFallbackSpeech(ms) {
    audio.stop({ silent: true });
    audio.startPseudo(ms);
    clearTimeout(pseudoTimer);
    pseudoTimer = window.setTimeout(() => finishPlayback(), ms);
  }

  function finishPlayback() {
    audioPlaying = false;
    clearTimeout(pseudoTimer);
    audio.stop({ silent: true });
    if (bubble && !drawerOpen && !settingsOpen) {
      scheduleBubbleHide(Math.max(4, settings.bubbleSeconds));
    }
  }

  function stopPlayback() {
    playbackToken += 1;
    clearTimeout(pseudoTimer);
    audioPlaying = false;
    audio.stop({ silent: true });
  }

  // ----- settings / window -----

  function toggleDnd() {
    settings.dnd = !settings.dnd;
    toast(settings.dnd ? '已开启免打扰' : '已关闭免打扰', 'info', 2400);
  }

  async function quit() {
    if (isTauri) {
      await closeWindow();
    } else {
      toast('网页预览不能关闭桌面窗口', 'info');
    }
  }

  function reconnect() {
    socket.reconnectNow();
    toast('正在重新连接后端…', 'info', 2400);
  }

  function openSettings() {
    settingsOpen = true;
    menu = null;
    bubble = null;
    clearTimeout(bubbleTimer);
  }

  function closeSettings() {
    settingsOpen = false;
  }

  function openContext(position) {
    exprOpen = false;
    menu = { x: position?.x ?? 120, y: position?.y ?? 120 };
  }

  function closeMenu() {
    menu = null;
  }

  function handleWheel(event) {
    if (event.ctrlKey || !stage || stageStatus !== 'ready') return;
    if (drawerOpen || settingsOpen || menu || exprOpen) return;
    if (event.target instanceof Element && event.target.closest('[data-hit]')) return;
    if (!stage.hitTest(event.clientX, event.clientY)) return;
    event.preventDefault();
    const step = Math.max(-0.05, Math.min(0.05, -event.deltaY * 0.0009));
    settings.zoom = Math.max(0.6, Math.min(1.8, settings.zoom + step));
  }

  function handleKeydown(event) {
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openChat();
      return;
    }
    if (meta && event.key === ',') {
      event.preventDefault();
      openSettings();
      return;
    }
    // Ignore keydown while an IME is composing, otherwise cancelling a pinyin
    // candidate would also close the top-most panel.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      if (menu) {
        closeMenu();
      } else if (settingsOpen) {
        closeSettings();
      } else if (exprOpen) {
        exprOpen = false;
      } else if (drawerOpen) {
        closeChat();
      } else if (bubble) {
        closeBubble();
      }
    }
  }

  // ----- click-through / hit testing -----

  function isOverUi(x, y) {
    const nodes = document.querySelectorAll('[data-hit]');
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
        continue;
      }
      if (Number(style.opacity) === 0) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
    }
    return false;
  }

  async function applyIgnore(next) {
    if (ignoreCursor === next) return;
    // Only trust the local mirror after the window call succeeded; on failure
    // reset to `null` (unknown) so the next tick retries instead of wedging.
    const ok = await setIgnoreCursorEvents(next);
    ignoreCursor = ok ? next : null;
  }

  function startInteractionLoop() {
    if (!isTauri || interactionTimer) return;
    interactionTimer = window.setInterval(checkPointer, 75);
  }

  async function checkPointer() {
    if (!isTauri || !windowReady || checkingPointer || destroyed) return;
    checkingPointer = true;
    try {
      if (!settings.autoClickThrough || settingsOpen || menu || drawerOpen) {
        lastHitAt = performance.now();
        await applyIgnore(false);
        return;
      }
      const position = await cursorLocalPosition();
      if (!position) {
        await applyIgnore(false);
        return;
      }
      const inside =
        position.x >= 0 &&
        position.y >= 0 &&
        position.x <= window.innerWidth &&
        position.y <= window.innerHeight;
      if (!inside) {
        await applyIgnore(true);
        return;
      }
      const overUi = isOverUi(position.x, position.y);
      const overModel =
        !overUi && stageStatus === 'ready' && stage?.hitTest(position.x, position.y, 6);
      if (overUi || overModel) {
        lastHitAt = performance.now();
        await applyIgnore(false);
      } else if (performance.now() - lastHitAt > 280) {
        await applyIgnore(true);
      }
    } catch (err) {
      console.info('[interaction] pointer check failed', err);
      await applyIgnore(false);
    } finally {
      checkingPointer = false;
    }
  }

  // ----- stage callbacks -----

  function handleStageReady(info) {
    stageStatus = 'ready';
    modelInfo = info;
    if (manualLook?.startsWith('custom:')) {
      const id = manualLook.slice(7);
      if (!info.expressions?.some((expr) => expr.id === id)) manualLook = null;
    }
    const onboarded = (() => {
      try {
        return localStorage.getItem(ONBOARD_KEY) === '1';
      } catch {
        return true;
      }
    })();
    if (!onboarded) {
      try {
        localStorage.setItem(ONBOARD_KEY, '1');
      } catch {
        /* ignore */
      }
      clearTimeout(onboardTimer);
      onboardTimer = window.setTimeout(() => {
        if (bubble) return;
        onboardToastId = toast('左键戳一下 · 双击聊天 · 右键菜单', 'info', 6200);
      }, 700);
    }
  }

  function handleStageError(err) {
    stageStatus = 'error';
    toast(err?.message || '模型加载失败', 'error', 5200);
  }

  function handleStageRestored() {
    stageStatus = 'ready';
    toast('渲染已恢复', 'success', 2600);
  }

  function getMouthLevel() {
    return audio.getLevel();
  }

  // ----- reactive glue -----

  $effect(() => {
    // Apply the current look whenever emotion / manual choice / readiness changes.
    if (stageStatus !== 'ready' || !stage) return;
    if (manualLook) {
      stage.applyLook(shelfIdToLook(manualLook), { immediate: false });
    } else if (settings.autoEmotion) {
      stage.applyLook(emotionToLook(emotion), { immediate: false });
    } else {
      stage.applyLook({ params: {}, custom: {} });
    }
  });

  $effect(() => {
    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);
  });

  $effect(() => {
    if (!windowReady || !isTauri) return;
    setAlwaysOnTop(settings.alwaysOnTop);
  });

  $effect(() => {
    // Keep the backend's DND flag aligned with the UI on every (re)connect.
    const enabled = settings.dnd;
    if (socket.phase === 'open') socket.setDnd(enabled);
  });

  $effect(() => {
    // Keep the backend's TTS switch aligned (off by default until enabled).
    const enabled = settings.tts;
    if (socket.phase === 'open') socket.setTts(enabled);
  });

  $effect(() => {
    if (drawerOpen) {
      unread = 0;
      bubble = null;
      clearTimeout(bubbleTimer);
    }
  });

  $effect(() => {
    if (settingsOpen) {
      bubble = null;
      clearTimeout(bubbleTimer);
    }
  });

  $effect(() => {
    if (!isTauri || !windowReady) return;
    if (!settings.autoClickThrough || settingsOpen || menu || drawerOpen) {
      applyIgnore(false);
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} onpointerdown={unlockAudio} />

<div
  id="pet-app"
  class:browser={!isTauri}
  class:reduce-motion={settings.reduceMotion}
  class:dnd={settings.dnd}
  aria-label={`${PET_NAME} 桌面伴侣`}
>
  <div class="scene" inert={settingsOpen || !!menu}>
    <Ambient glow={settings.ambientGlow} sparkles={settings.showSparkles} />

    <CharacterStage
    bind:this={stage}
    quality={settings.quality}
    zoom={settings.zoom}
    offsetX={settings.offsetX}
    offsetY={settings.offsetY}
    opacity={settings.opacity}
    breath={settings.breath && !settings.reduceMotion}
    blink={settings.blink}
    sway={!settings.reduceMotion}
    mouseTracking={settings.mouseTracking}
    lipSync={settings.lipSync}
    interactive={!settingsOpen && !menu}
    getMouthLevel={getMouthLevel}
    onready={handleStageReady}
    onerror={handleStageError}
    onrestored={handleStageRestored}
    onpoke={handlePoke}
    onopenchat={openChat}
    oncontext={openContext}
  />

  <TopChrome phase={socket.phase} tauri={isTauri} onclose={quit} />

  {#if bubbleVisible}
    <SpeechBubble
      message={bubble}
      onclose={closeBubble}
      onreplay={replayMessage}
      onopenchat={openChat}
    />
  {/if}

  {#if drawerOpen}
    <ChatDrawer
      name={PET_NAME}
      {messages}
      status={uiStatus}
      phase={socket.phase}
      latency={socket.latency}
      retryIn={socket.retryIn}
      {focusToken}
      {exprOpen}
      exprOptions={exprOptions}
      activeLook={activeLook}
      onclose={closeChat}
      onclear={clearMessages}
      onsend={sendText}
      onstop={stopCurrent}
      onreplay={replayMessage}
      onvoice={sendVoice}
      onprompt={sendText}
      onreconnect={reconnect}
      onselectlook={selectLook}
      ontoggleexpressions={toggleExpressions}
    />
  {/if}

  {#if exprOpen && !drawerOpen}
    <ExpressionShelf
      options={exprOptions}
      activeId={activeLook}
      onselect={selectLook}
      onclose={() => (exprOpen = false)}
    />
  {/if}

    <Dock
      name={PET_NAME}
      phase={socket.phase}
      brain={socket.brain}
      {speaking}
      {unread}
      dnd={settings.dnd}
      {drawerOpen}
      {exprOpen}
      onchat={openChat}
      onexpressions={toggleExpressions}
      ondnd={toggleDnd}
      onsettings={openSettings}
    />
  </div>

  {#if settingsOpen}
    <SettingsSheet
      {modelInfo}
      phase={socket.phase}
      latency={socket.latency}
      retryIn={socket.retryIn}
      onclose={closeSettings}
      onreconnect={reconnect}
    />
  {/if}

  {#if menu}
    <ContextMenu
      x={menu.x}
      y={menu.y}
      dnd={settings.dnd}
      phase={socket.phase}
      tauri={isTauri}
      onclose={closeMenu}
      onchat={openChat}
      onexpressions={() => {
        menu = null;
        exprOpen = true;
      }}
      ondnd={toggleDnd}
      onsettings={openSettings}
      onreconnect={reconnect}
      onquit={quit}
    />
  {/if}

  <ToastHost />
</div>

<style>
  #pet-app {
    position: fixed;
    inset: 0;
    overflow: hidden;
    user-select: none;
    isolation: isolate;
    color: var(--text-1);
    font-family: var(--font-ui);
    --dock-bottom: 14px;
  }
  .scene {
    position: absolute;
    inset: 0;
  }
  #pet-app.browser::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -2;
    background:
      radial-gradient(ellipse 70% 55% at 50% 22%, rgba(93, 123, 184, 0.26), transparent 62%),
      radial-gradient(ellipse 60% 40% at 16% 88%, rgba(83, 107, 166, 0.16), transparent 60%),
      radial-gradient(ellipse 55% 40% at 88% 78%, rgba(99, 79, 130, 0.14), transparent 62%),
      linear-gradient(165deg, #0a0d15 0%, #070a11 55%, #05070c 100%);
  }
  #pet-app.browser::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-image: radial-gradient(rgba(255, 255, 255, 0.028) 1px, transparent 1px);
    background-size: 22px 22px;
    -webkit-mask-image: radial-gradient(ellipse at center, #000 0%, transparent 76%);
    mask-image: radial-gradient(ellipse at center, #000 0%, transparent 76%);
  }
  #pet-app.dnd::before {
    filter: saturate(0.72) brightness(0.9);
  }
</style>
