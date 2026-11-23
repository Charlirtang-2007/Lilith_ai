<script>
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { toast } from '$lib/toast.svelte.js';
  import {
    VoiceRecorder,
    recorderSupported,
    blobToBase64,
  } from '$lib/audio/VoiceRecorder.js';

  let {
    connected = false,
    status = 'idle',
    focusToken = 0,
    exprOpen = false,
    onSend = null,
    onStop = null,
    onVoice = null,
    onToggleExpressions = null,
  } = $props();

  let draft = $state('');
  let textarea = $state(null);
  let recording = $state(false);
  let recordMs = $state(0);
  let voiceSending = $state(false);
  let recorder = null;
  let recordTimer = 0;

  const canUseVoice = recorderSupported();
  const busy = $derived(status === 'thinking');
  const activeSpeech = $derived(status === 'thinking' || status === 'speaking');
  const canSend = $derived(connected && !busy && draft.trim().length > 0);

  $effect(() => {
    // Keep the textarea height in sync with its content.
    void draft;
    tick().then(resize);
  });

  $effect(() => {
    if (focusToken > 0) {
      tick().then(() => textarea?.focus());
    }
  });

  $effect(() => {
    return () => {
      stopRecordTimer();
      recorder?.cancel();
    };
  });

  function resize() {
    if (!textarea) return;
    textarea.style.height = '0px';
    const next = Math.min(112, Math.max(22, textarea.scrollHeight));
    textarea.style.height = `${next}px`;
  }

  function submit() {
    if (!canSend) return;
    const text = draft.trim();
    if (!text) return;
    draft = '';
    tick().then(resize);
    onSend?.(text);
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      submit();
    }
  }

  async function toggleVoice() {
    if (!canUseVoice) {
      toast('当前环境不支持录音', 'warning');
      return;
    }
    if (recording) {
      await finishVoice();
    } else {
      await startVoice();
    }
  }

  async function startVoice() {
    if (!connected || recording) return;
    try {
      recorder = new VoiceRecorder({ onAutoStop: () => finishVoice() });
      await recorder.start(60000);
      recording = true;
      recordMs = 0;
      stopRecordTimer();
      recordTimer = window.setInterval(() => {
        recordMs = recorder?.elapsedMs || 0;
      }, 160);
    } catch (err) {
      recorder = null;
      recording = false;
      console.warn('[voice]', err);
      const name = err?.name;
      if (name === 'NotAllowedError') toast('麦克风权限被拒绝', 'warning');
      else if (name === 'NotFoundError') toast('没有找到麦克风', 'warning');
      else toast('无法开始录音', 'error');
    }
  }

  async function finishVoice() {
    if (!recording || !recorder) return;
    recording = false;
    stopRecordTimer();
    voiceSending = true;
    try {
      const blob = await recorder.stop();
      recorder = null;
      if (!blob || blob.size < 800) {
        toast('录音太短了', 'info');
        return;
      }
      const base64 = await blobToBase64(blob);
      await onVoice?.(base64, blob.type || 'audio/webm');
    } catch (err) {
      console.warn('[voice] stop failed', err);
      toast('录音处理失败', 'error');
      recorder?.cancel();
      recorder = null;
    } finally {
      voiceSending = false;
    }
  }

  function cancelVoice() {
    recording = false;
    stopRecordTimer();
    recorder?.cancel();
    recorder = null;
    recordMs = 0;
  }

  function stopRecordTimer() {
    clearInterval(recordTimer);
    recordTimer = 0;
  }

  function letterbox(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  export function focus() {
    textarea?.focus();
  }

  export function cancelRecording() {
    if (recording) cancelVoice();
  }
</script>

<div class="composer" data-hit>
  <button
    class="tool"
    class:active={exprOpen}
    onclick={() => onToggleExpressions?.()}
    aria-label="表情"
    title="表情"
  >
    <Icon name="sparkles" size={17} />
  </button>

  <div class="field" class:recording>
    {#if recording}
      <div class="recording-strip">
        <span class="rec-dot" aria-hidden="true"></span>
        <span class="rec-time">{letterbox(recordMs)}</span>
        <span class="wave" aria-hidden="true">
          {#each [0, 1, 2, 3, 4, 5, 6, 7] as bar}
            <i style:animation-delay="{-0.12 * bar}s"></i>
          {/each}
        </span>
        <span class="rec-label">正在聆听</span>
        <button class="cancel-rec" onclick={cancelVoice} aria-label="取消录音">
          <Icon name="x" size={13} stroke={2} />
        </button>
      </div>
    {:else}
      <textarea
        bind:this={textarea}
        bind:value={draft}
        onkeydown={handleKeydown}
        placeholder={connected ? '对莉莉丝说点什么…' : '正在连接后端…'}
        rows="1"
        aria-label="输入消息"
        autocomplete="off"
        spellcheck="false"
      ></textarea>
    {/if}
  </div>

  {#if canUseVoice}
    <button
      class="tool mic"
      class:armed={recording}
      onclick={toggleVoice}
      disabled={!connected || voiceSending || busy}
      aria-label={recording ? '结束并发送语音' : '语音输入'}
      title={recording ? '结束并发送' : '语音输入'}
    >
      <Icon name={recording ? 'send' : 'mic'} size={16} />
    </button>
  {/if}

  {#if activeSpeech}
    <button class="primary stop" onclick={() => onStop?.()} aria-label="停止" title={status === 'thinking' ? '打断' : '停止播放'}>
      <Icon name="stop" size={14} />
    </button>
  {:else}
    <button class="primary" onclick={submit} disabled={!canSend} aria-label="发送" title="发送 (Enter)">
      <Icon name="send" size={16} stroke={1.9} />
    </button>
  {/if}
</div>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 5px;
    padding: 9px 10px 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    background: linear-gradient(180deg, rgba(9, 12, 20, 0.12), rgba(9, 12, 20, 0.42));
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }
  .field {
    flex: 1;
    min-width: 0;
    min-height: 38px;
    display: flex;
    align-items: center;
    padding: 7px 11px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.052);
    border: 1px solid rgba(255, 255, 255, 0.075);
    transition: border-color var(--dur), background var(--dur), box-shadow var(--dur);
  }
  .field:focus-within {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(169, 201, 255, 0.34);
    box-shadow: 0 0 0 3px rgba(169, 201, 255, 0.08);
  }
  .field.recording {
    border-color: rgba(255, 142, 146, 0.32);
    background: rgba(255, 142, 146, 0.06);
  }
  textarea {
    width: 100%;
    max-height: 112px;
    min-height: 22px;
    resize: none;
    background: transparent;
    border: 0;
    outline: none;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-1);
    overflow-y: auto;
    padding: 0;
    scrollbar-width: thin;
  }
  textarea::placeholder {
    color: var(--text-3);
  }
  .tool {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-bottom: 2px;
    flex: none;
    border-radius: 11px;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  .tool:hover:not(:disabled) {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.07);
  }
  .tool:active:not(:disabled) {
    transform: scale(0.94);
    background: rgba(255, 255, 255, 0.11);
  }
  .tool.active {
    color: var(--ice);
    background: rgba(169, 201, 255, 0.12);
  }
  .tool.mic.armed {
    color: var(--danger);
    background: rgba(255, 142, 146, 0.14);
  }
  .tool:disabled {
    opacity: 0.35;
  }
  .primary {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 13px;
    color: #0a1120;
    background: linear-gradient(150deg, #d7e7ff, #a9c9ff 55%, #8db2ee);
    box-shadow: 0 8px 20px -10px rgba(120, 160, 230, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    transition: transform var(--dur-fast), filter var(--dur-fast), opacity var(--dur-fast);
  }
  .primary:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }
  .primary:active:not(:disabled) {
    transform: scale(0.95);
  }
  .primary:disabled {
    opacity: 0.32;
    box-shadow: none;
  }
  .primary.stop {
    color: var(--text-1);
    background: linear-gradient(150deg, rgba(255, 142, 146, 0.9), rgba(214, 91, 115, 0.9));
    box-shadow: 0 8px 20px -10px rgba(255, 100, 130, 0.65);
  }
  .recording-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 22px;
  }
  .rec-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--danger);
    box-shadow: 0 0 0 3px rgba(255, 142, 146, 0.14);
    animation: rec-pulse 1.4s ease-in-out infinite;
  }
  @keyframes rec-pulse {
    0%,
    100% {
      opacity: 0.55;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }
  .rec-time {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .wave {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 16px;
    flex: 1;
    overflow: hidden;
  }
  .wave i {
    display: block;
    width: 2px;
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(180deg, var(--rose), rgba(255, 179, 209, 0.2));
    animation: lilith-equalize 1.05s ease-in-out infinite;
  }
  .rec-label {
    font-size: 10.5px;
    color: var(--text-3);
    white-space: nowrap;
  }
  .cancel-rec {
    position: relative;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  /* ≥28px hit area; 4px bleed fits the field's 7/11px padding and the 8px gap
     to the "正在聆听" label. */
  .cancel-rec::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
  }
  .cancel-rec:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.08);
  }
  .cancel-rec:active {
    transform: scale(0.92);
  }
</style>
