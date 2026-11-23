<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import Toggle from './Toggle.svelte';
  import SliderRow from './SliderRow.svelte';
  import { settings, resetSettings, motion } from '$lib/settings.svelte.js';
  import { toast } from '$lib/toast.svelte.js';
  import { BACKEND_WS, BACKEND_HTTP, APP_VERSION, PET_NAME, PET_TITLE } from '../../config.js';

  let {
    modelInfo = null,
    phase = 'closed',
    latency = null,
    retryIn = 0,
    onclose = null,
    onreconnect = null,
  } = $props();

  let tab = $state('look');
  let confirmReset = $state(false);
  let sheetEl = $state(null);
  let returnFocusEl = null;

  const tabs = [
    { id: 'look', label: '形象', icon: 'eye' },
    { id: 'behavior', label: '互动', icon: 'heart' },
    { id: 'system', label: '连接', icon: 'wifi' },
    { id: 'backend', label: '后端', icon: 'settings' },
  ];

  const connectionLabel = $derived(
    phase === 'open' ? '已连接' : phase === 'connecting' ? '连接中…' : '已断开'
  );

  const connectionClass = $derived(
    phase === 'open' ? 'ok' : phase === 'connecting' ? 'warn' : 'bad'
  );

  const qualityOptions = [
    { id: 'auto', label: '自动' },
    { id: 'standard', label: '标准' },
    { id: 'high', label: '高清' },
  ];

  function reset() {
    if (!confirmReset) {
      confirmReset = true;
      setTimeout(() => (confirmReset = false), 4000);
      return;
    }
    resetSettings();
    confirmReset = false;
    toast('已恢复默认设置', 'success');
  }

  async function copyWs() {
    try {
      await navigator.clipboard.writeText(BACKEND_WS);
      toast('地址已复制', 'success');
    } catch {
      toast('复制失败', 'warning');
    }
  }

  let backend = $state({
    loaded: false,
    loading: false,
    error: false,
    saving: false,
  });

  let backendForm = $state({
    LLM_MODEL: '',
    LLM_BASE_URL: '',
    PET_NAME: '',
    TTS_SERVICE_URL: '',
    EMBEDDING_MODEL_PATH: '',
    STT_MODEL: '',
    BOREDOM_THRESHOLD: '',
    BOREDOM_MAX: '',
    LLM_API_KEY: '',
    SILICON_KEY: '',
    ENABLE_VISION: false,
    ALARM_ENABLED: false,
  });

  function selectTab(id) {
    tab = id;
    if (id === 'backend' && !backend.loaded && !backend.loading) {
      loadBackendConfig();
    }
  }

  async function loadBackendConfig() {
    if (backend.loading || backend.loaded) return;
    backend.loading = true;
    backend.error = false;
    try {
      const res = await fetch(`${BACKEND_HTTP}/api/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      backendForm.LLM_MODEL = data.LLM_MODEL ?? '';
      backendForm.LLM_BASE_URL = data.LLM_BASE_URL ?? '';
      backendForm.PET_NAME = data.PET_NAME ?? '';
      backendForm.TTS_SERVICE_URL = data.TTS_SERVICE_URL ?? '';
      backendForm.EMBEDDING_MODEL_PATH = data.EMBEDDING_MODEL_PATH ?? '';
      backendForm.STT_MODEL = data.STT_MODEL ?? '';
      backendForm.BOREDOM_THRESHOLD = data.BOREDOM_THRESHOLD != null ? String(data.BOREDOM_THRESHOLD) : '';
      backendForm.BOREDOM_MAX = data.BOREDOM_MAX != null ? String(data.BOREDOM_MAX) : '';
      backendForm.LLM_API_KEY = data.LLM_API_KEY ?? '';
      backendForm.SILICON_KEY = data.SILICON_KEY ?? '';
      backendForm.ENABLE_VISION = !!data.ENABLE_VISION;
      backendForm.ALARM_ENABLED = !!data.ALARM_ENABLED;
      backend.loaded = true;
    } catch {
      backend.error = true;
    } finally {
      backend.loading = false;
    }
  }

  function stripMask(value) {
    const v = (value ?? '').toString();
    return v.includes('…') ? '' : v.trim();
  }

  async function saveBackendConfig() {
    if (backend.saving) return;
    backend.saving = true;
    try {
      const payload = {
        LLM_MODEL: backendForm.LLM_MODEL,
        LLM_BASE_URL: backendForm.LLM_BASE_URL,
        PET_NAME: backendForm.PET_NAME,
        TTS_SERVICE_URL: backendForm.TTS_SERVICE_URL,
        EMBEDDING_MODEL_PATH: backendForm.EMBEDDING_MODEL_PATH,
        STT_MODEL: backendForm.STT_MODEL,
        BOREDOM_THRESHOLD: backendForm.BOREDOM_THRESHOLD,
        BOREDOM_MAX: backendForm.BOREDOM_MAX,
        LLM_API_KEY: stripMask(backendForm.LLM_API_KEY),
        SILICON_KEY: stripMask(backendForm.SILICON_KEY),
        ENABLE_VISION: backendForm.ENABLE_VISION,
        ALARM_ENABLED: backendForm.ALARM_ENABLED,
      };
      const res = await fetch(`${BACKEND_HTTP}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.ok === false) {
        toast(result.error || '保存失败，请检查后端', 'error');
      } else {
        toast('已保存，重启后端生效', 'success');
      }
    } catch {
      toast('保存失败，无法连接后端', 'error');
    } finally {
      backend.saving = false;
    }
  }

  function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function getFocusables() {
    if (!sheetEl) return [];
    const nodes = sheetEl.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return [...nodes].filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.tabIndex < 0 || el.hidden) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function focusFirst() {
    const list = getFocusables();
    (list[0] || sheetEl)?.focus();
  }

  function onKeydown(event) {
    if (event.key !== 'Tab') return;
    const list = getFocusables();
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetEl)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) returnFocusEl = active;
    focusFirst();
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      if (returnFocusEl && returnFocusEl.isConnected) returnFocusEl.focus();
    };
  });
</script>

<div
  class="scrim"
  transition:fade={motion({ duration: 180 })}
  role="presentation"
  onclick={() => onclose?.()}
></div>

<div
  class="sheet glass grain"
  data-hit
  role="dialog"
  aria-modal="true"
  aria-label="设置"
  tabindex="-1"
  bind:this={sheetEl}
  in:fly={motion({ y: 28, duration: 280, easing: cubicOut })}
  out:fly={motion({ y: 18, duration: 160, easing: cubicOut })}
>
  <header class="sheet-head">
    <div>
      <p class="eyebrow">PREFERENCES</p>
      <h2>设置</h2>
    </div>
    <button class="close" onclick={() => onclose?.()} aria-label="关闭设置">
      <Icon name="x" size={16} />
    </button>
  </header>

  <div class="tabs" role="tablist" aria-label="设置分类">
    {#each tabs as item}
      <button
        class="tab"
        class:active={tab === item.id}
        role="tab"
        aria-selected={tab === item.id}
        aria-controls="settings-panel"
        onclick={() => selectTab(item.id)}
      >
        <Icon name={item.icon} size={14} />
        {item.label}
      </button>
    {/each}
  </div>

  <div class="body" id="settings-panel" role="tabpanel">
    {#if tab === 'look'}
      <section class="group">
        <div class="group-head">
          <Icon name="eye" size={13} />
          <h3>构图</h3>
          <span class="group-hint">随窗口自适应</span>
        </div>
        <SliderRow label="角色缩放" hint="整体大小" bind:value={settings.zoom} min={0.6} max={1.8} step={0.01} percent />
        <SliderRow label="水平位置" bind:value={settings.offsetX} min={-30} max={30} step={1} suffix="%" />
        <SliderRow label="垂直位置" bind:value={settings.offsetY} min={-20} max={20} step={1} suffix="%" />
        <SliderRow label="角色不透明度" bind:value={settings.opacity} min={0.3} max={1} step={0.01} percent />
      </section>

      <section class="group">
        <div class="group-head">
          <Icon name="sparkles" size={13} />
          <h3>画质</h3>
        </div>
        <div class="segmented" role="radiogroup" aria-label="渲染画质">
          {#each qualityOptions as option}
            <button
              class:active={settings.quality === option.id}
              role="radio"
              aria-checked={settings.quality === option.id}
              onclick={() => (settings.quality = option.id)}
            >
              {option.label}
            </button>
          {/each}
        </div>
        <p class="note">自动会跟随屏幕缩放；高清适合截图，会占用更多 GPU。</p>
      </section>

      <section class="group">
        <div class="group-head">
          <Icon name="moon" size={13} />
          <h3>氛围</h3>
        </div>
        <Toggle label="地面辉光" description="角色脚下的冷色光晕" bind:checked={settings.ambientGlow} />
        <Toggle label="漂浮微光" description="极慢的光点，关闭可进一步省电" bind:checked={settings.showSparkles} />
        <Toggle label="减少动效" description="停用界面过渡与待机动画" bind:checked={settings.reduceMotion} />
      </section>
    {:else if tab === 'behavior'}
      <section class="group">
        <div class="group-head">
          <Icon name="heart" size={13} />
          <h3>角色表演</h3>
        </div>
        <Toggle label="呼吸起伏" description="使用模型自带的呼吸参数" bind:checked={settings.breath} />
        <Toggle label="自动眨眼" description="使用模型自带的眨眼参数" bind:checked={settings.blink} />
        <Toggle label="目光跟随" description="角色会看向鼠标位置" bind:checked={settings.mouseTracking} />
        <Toggle label="口型同步" description="说话时驱动嘴巴开合" bind:checked={settings.lipSync} />
        <Toggle label="情绪表情" description="根据回复情绪切换表情" bind:checked={settings.autoEmotion} />
      </section>

      <section class="group">
        <div class="group-head">
          <Icon name="chat" size={13} />
          <h3>对话</h3>
        </div>
        <SliderRow label="说话音量" bind:value={settings.volume} min={0} max={1} step={0.01} percent disabled={settings.muted} />
        <Toggle label="静音" description="仍会显示文字与口型" bind:checked={settings.muted} />
        <Toggle label="语音合成（TTS）" description="用本地 GPT-SoVITS 合成语音；关闭时仅文字与口型" bind:checked={settings.tts} />
        <Toggle label="免打扰" description="不再主动搭话，直到关闭" bind:checked={settings.dnd} />
        <SliderRow label="气泡停留" bind:value={settings.bubbleSeconds} min={3} max={30} step={1} suffix="s" />
      </section>

      <section class="group">
        <div class="group-head">
          <Icon name="settings" size={13} />
          <h3>窗口</h3>
        </div>
        <Toggle label="始终置顶" description="角色保持在其它窗口之上" bind:checked={settings.alwaysOnTop} />
        <Toggle
          label="空白处点击穿透"
          description="仅角色与界面接收鼠标；关闭后整个窗口可点击"
          bind:checked={settings.autoClickThrough}
        />
        <p class="note">拖动角色即可移动窗口；右键角色可打开快捷菜单。</p>
      </section>
    {:else if tab === 'system'}
      <section class="group">
        <div class="group-head">
          <Icon name="wifi" size={13} />
          <h3>后端连接</h3>
          <span class="status-dot {connectionClass}">{connectionLabel}</span>
        </div>
        <div class="info-card">
          <div class="info-row">
            <span>WebSocket</span>
            <code>{BACKEND_WS}</code>
            <button class="mini" onclick={copyWs} title="复制地址"><Icon name="copy" size={11} /></button>
          </div>
          <div class="info-row">
            <span>延迟</span>
            <b>{latency != null ? `${latency} ms` : '—'}</b>
          </div>
          {#if phase !== 'open'}
            <div class="info-row">
              <span>重试</span>
              <b>{retryIn ? `${retryIn}s 后` : '准备中'}</b>
            </div>
          {/if}
        </div>
        <button class="wide" onclick={() => onreconnect?.()}>
          <Icon name="replay" size={13} />
          重新连接
        </button>
      </section>

      <section class="group">
        <div class="group-head">
          <Icon name="info" size={13} />
          <h3>模型</h3>
        </div>
        {#if modelInfo}
          <div class="info-card">
            <div class="info-row"><span>名称</span><b>{modelInfo.name}</b></div>
            <div class="info-row"><span>原始尺寸</span><b>{modelInfo.width} × {modelInfo.height}</b></div>
            <div class="info-row"><span>参数</span><b>{modelInfo.parameters}</b></div>
            <div class="info-row"><span>动作</span><b>{modelInfo.motions}</b></div>
            <div class="info-row"><span>表情文件</span><b>{modelInfo.expressions?.length || 0}</b></div>
          </div>
          {#if modelInfo.expressions?.length}
            <div class="expr-list">
              {#each modelInfo.expressions as expr}
                <span class="expr-pill">{expr.label}</span>
              {/each}
            </div>
          {:else}
            <p class="note">未发现额外的 .exp3 表情文件；仍可使用内置的参数化表情。</p>
          {/if}
        {:else}
          <p class="note">模型尚未就绪。</p>
        {/if}
      </section>

      <section class="group">
        <div class="group-head">
          <Icon name="power" size={13} />
          <h3>维护</h3>
        </div>
        <button class="wide danger" class:armed={confirmReset} onclick={reset}>
          <Icon name="replay" size={13} />
          {confirmReset ? '再次点击确认恢复' : '恢复默认设置'}
        </button>
        <div class="about">
          <p>{PET_NAME} · {PET_TITLE}</p>
          <p>v{APP_VERSION} · Live2D Cubism · Svelte · Tauri</p>
        </div>
      </section>
    {:else}
      {#if backend.loading}
        <section class="group">
          <div class="group-head">
            <Icon name="settings" size={13} />
            <h3>后端配置</h3>
          </div>
          <p class="note">正在读取配置…</p>
        </section>
      {:else if backend.error}
        <section class="group">
          <div class="group-head">
            <Icon name="settings" size={13} />
            <h3>后端配置</h3>
          </div>
          <p class="note">无法连接后端。</p>
          <button class="wide" onclick={loadBackendConfig}>
            <Icon name="replay" size={13} />
            重试
          </button>
        </section>
      {:else}
        <section class="group">
          <div class="group-head">
            <Icon name="settings" size={13} />
            <h3>模型与地址</h3>
          </div>
          <label class="field">
            <span class="field-label">LLM 模型</span>
            <input class="text-input" type="text" bind:value={backendForm.LLM_MODEL} placeholder="LLM_MODEL" />
          </label>
          <label class="field">
            <span class="field-label">LLM Base URL</span>
            <input class="text-input" type="text" bind:value={backendForm.LLM_BASE_URL} placeholder="https://…" />
          </label>
          <label class="field">
            <span class="field-label">宠物名</span>
            <input class="text-input" type="text" bind:value={backendForm.PET_NAME} placeholder="PET_NAME" />
          </label>
          <label class="field">
            <span class="field-label">TTS 服务地址</span>
            <input class="text-input" type="text" bind:value={backendForm.TTS_SERVICE_URL} placeholder="http://…" />
          </label>
          <label class="field">
            <span class="field-label">嵌入模型路径</span>
            <input class="text-input" type="text" bind:value={backendForm.EMBEDDING_MODEL_PATH} placeholder="./models/…（可留空）" />
          </label>
          <label class="field">
            <span class="field-label">STT 模型</span>
            <input class="text-input" type="text" bind:value={backendForm.STT_MODEL} placeholder="STT_MODEL" />
          </label>
        </section>

        <section class="group">
          <div class="group-head">
            <Icon name="wifi" size={13} />
            <h3>API 密钥</h3>
          </div>
          <label class="field">
            <span class="field-label">LLM API Key</span>
            <input class="text-input" type="text" bind:value={backendForm.LLM_API_KEY} placeholder="留空=不修改" />
          </label>
          <label class="field">
            <span class="field-label">SiliconFlow API Key</span>
            <input class="text-input" type="text" bind:value={backendForm.SILICON_KEY} placeholder="留空=不修改" />
          </label>
          <p class="note">密钥仅显示脱敏片段；清空输入即保持原值不变。</p>
        </section>

        <section class="group">
          <div class="group-head">
            <Icon name="clock" size={13} />
            <h3>行为与阈值</h3>
          </div>
          <label class="field">
            <span class="field-label">无聊阈值（秒）</span>
            <input class="text-input" type="number" bind:value={backendForm.BOREDOM_THRESHOLD} placeholder="1500" />
          </label>
          <label class="field">
            <span class="field-label">无聊上限（秒）</span>
            <input class="text-input" type="number" bind:value={backendForm.BOREDOM_MAX} placeholder="3600" />
          </label>
          <Toggle label="视觉（截图问答）" description="开启后含“看看/屏幕/截图”等词时自动截图给模型" bind:checked={backendForm.ENABLE_VISION} />
          <Toggle label="闹钟" description="允许角色响应闹钟设置" bind:checked={backendForm.ALARM_ENABLED} />
        </section>

        <section class="group">
          <button class="wide" disabled={backend.saving} onclick={saveBackendConfig}>
            <Icon name="check" size={13} />
            {backend.saving ? '保存中…' : '保存配置'}
          </button>
          <p class="note">保存后需重启后端进程才会生效。</p>
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 79;
    background: rgba(3, 5, 10, 0.5);
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
  }
  .sheet {
    position: absolute;
    inset: 12px;
    z-index: 80;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-xl);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(165deg, rgba(18, 24, 39, 0.96), rgba(7, 10, 17, 0.97));
    box-shadow: var(--shadow-lg);
    -webkit-backdrop-filter: blur(26px) saturate(1.2);
    backdrop-filter: blur(26px) saturate(1.2);
    pointer-events: auto;
    overflow: hidden;
  }
  .sheet > * {
    position: relative;
    z-index: 1;
  }
  .sheet-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18px 16px 10px 18px;
  }
  .eyebrow {
    margin: 0 0 2px;
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 0.32em;
    color: var(--ice);
    opacity: 0.7;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 23px;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--text-1);
  }
  .close {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  .close:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.07);
  }
  .close:active {
    transform: scale(0.94);
  }
  .tabs {
    display: flex;
    gap: 3px;
    margin: 0 16px 4px;
    padding: 3px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.055);
    flex: none;
  }
  .tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: 1;
    height: 30px;
    border-radius: 9px;
    font-size: 11.5px;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast);
  }
  .tab:hover {
    color: var(--text-2);
  }
  .tab:active {
    background: rgba(255, 255, 255, 0.06);
  }
  .tab.active {
    color: var(--text-1);
    background: rgba(169, 201, 255, 0.12);
    box-shadow: inset 0 0 0 1px rgba(169, 201, 255, 0.2);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px 18px 24px;
    scrollbar-gutter: stable;
  }
  .group {
    padding: 14px 0 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  }
  .group:last-child {
    border-bottom: 0;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--ice);
    opacity: 0.9;
  }
  .group-head h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--text-2);
    text-transform: uppercase;
  }
  .group-hint {
    margin-left: auto;
    font-size: 9.5px;
    color: var(--text-4);
  }
  .segmented {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .segmented button {
    flex: 1;
    height: 28px;
    border-radius: 8px;
    font-size: 11.5px;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast);
  }
  .segmented button:hover {
    color: var(--text-2);
  }
  .segmented button:active {
    background: rgba(255, 255, 255, 0.06);
  }
  .segmented button.active {
    color: var(--text-1);
    background: rgba(169, 201, 255, 0.14);
    box-shadow: inset 0 0 0 1px rgba(169, 201, 255, 0.2);
  }
  .note {
    margin: 8px 0 0;
    font-size: 10.5px;
    line-height: 1.55;
    color: var(--text-3);
  }
  .status-dot {
    margin-left: auto;
    padding: 1px 7px;
    border-radius: 99px;
    font-size: 9px;
    border: 1px solid transparent;
  }
  .status-dot.ok {
    color: var(--ok);
    background: rgba(143, 227, 192, 0.1);
    border-color: rgba(143, 227, 192, 0.2);
  }
  .status-dot.warn {
    color: var(--amber);
    background: var(--amber-soft);
    border-color: rgba(255, 212, 121, 0.2);
  }
  .status-dot.bad {
    color: var(--danger);
    background: rgba(255, 142, 146, 0.1);
    border-color: rgba(255, 142, 146, 0.2);
  }
  .info-card {
    border-radius: 11px;
    border: 1px solid rgba(255, 255, 255, 0.065);
    background: rgba(255, 255, 255, 0.028);
    padding: 2px 11px;
    margin-bottom: 8px;
  }
  .info-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 30px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.045);
    font-size: 11px;
  }
  .info-row:last-child {
    border-bottom: 0;
  }
  .info-row > span {
    color: var(--text-3);
    flex: none;
    min-width: 54px;
  }
  .info-row > code,
  .info-row > b {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .info-row > code {
    direction: rtl;
    text-align: left;
  }
  .mini {
    position: relative;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: 6px;
    color: var(--text-3);
    background: rgba(255, 255, 255, 0.05);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  /* ≥28px hit area; the row is 30px tall and the card has 11px side padding. */
  .mini::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 8px;
  }
  .mini:hover {
    color: var(--ice);
  }
  .mini:active {
    transform: scale(0.92);
  }
  .wide {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    border-radius: 10px;
    font-size: 11.5px;
    color: var(--ice);
    background: rgba(169, 201, 255, 0.09);
    border: 1px solid rgba(169, 201, 255, 0.16);
    transition: background var(--dur-fast), border-color var(--dur-fast);
  }
  .wide:hover {
    background: rgba(169, 201, 255, 0.15);
  }
  .wide:active {
    background: rgba(169, 201, 255, 0.22);
  }
  .wide.danger {
    color: var(--danger);
    background: rgba(255, 142, 146, 0.07);
    border-color: rgba(255, 142, 146, 0.16);
  }
  .wide.danger:hover,
  .wide.danger.armed {
    background: rgba(255, 142, 146, 0.15);
  }
  .wide.danger:active {
    background: rgba(255, 142, 146, 0.22);
  }
  .expr-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }
  .expr-pill {
    padding: 2px 7px;
    border-radius: 99px;
    font-size: 9.5px;
    color: var(--rose);
    background: var(--rose-soft);
    border: 1px solid rgba(255, 179, 209, 0.18);
  }
  .about {
    margin-top: 16px;
    text-align: center;
    color: var(--text-4);
  }
  .about p {
    margin: 0;
    font-size: 9.5px;
    line-height: 1.6;
  }
  .field {
    display: block;
    margin: 2px 0 11px;
  }
  .field-label {
    display: block;
    margin: 0 0 5px;
    font-size: 10.5px;
    color: var(--text-3);
    letter-spacing: 0.02em;
  }
  .text-input {
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-1);
    font-size: 11.5px;
    font-family: var(--font-mono);
    outline: none;
    transition: border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast);
  }
  .text-input::placeholder {
    color: var(--text-4);
  }
  .text-input:focus {
    border-color: rgba(169, 201, 255, 0.45);
    background: rgba(255, 255, 255, 0.055);
    box-shadow: 0 0 0 3px rgba(169, 201, 255, 0.12);
  }
  .wide:disabled {
    opacity: 0.55;
    cursor: default;
  }
</style>
