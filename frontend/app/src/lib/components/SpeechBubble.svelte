<script>
  import { fly, fade } from 'svelte/transition';
  import { motion } from '$lib/settings.svelte.js';
  import Icon from './Icon.svelte';

  function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  let {
    message = null,
    onclose = null,
    onreplay = null,
    onopenchat = null,
  } = $props();

  const emotion = $derived(message?.emotionInfo || { label: '平静', color: '#cfd6e6' });
  const time = $derived(
    message?.at
      ? new Date(message.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : ''
  );
  let textEl = $state(null);
  let overflowing = $state(false);

  $effect(() => {
    // Measure the real rendered text instead of guessing by character count.
    void message?.text;
    if (!textEl) return;
    overflowing = textEl.scrollHeight > textEl.clientHeight + 1;
  });
</script>

{#if message}
  <aside
    class="bubble glass grain"
    class:alarm={message.alarm}
    data-hit
    role="status"
    aria-live="polite"
    in:fly={motion({ y: 8, duration: 240, easing: cubicOut })}
    out:fade={motion({ duration: 160 })}
    style:--emotion={emotion.color}
  >
    <div class="head">
      <span class="name">{message.alarm ? '提醒' : 'LILITH'}</span>
      {#if message.alarm}
        <span class="emotion-chip"><Icon name="clock" size={10} /> 闹钟</span>
      {:else}
        <span class="emotion-chip">{emotion.label}</span>
      {/if}
      <button class="dismiss" onclick={() => onclose?.()} aria-label="收起气泡" title="收起">
        <Icon name="x" size={12} stroke={2} />
      </button>
    </div>

    <p class="text" bind:this={textEl}>{message.text}</p>

    <div class="foot">
      <span class="time">{time}</span>
      <div class="foot-actions">
        {#if overflowing && onopenchat}
          <button class="expand" onclick={() => onopenchat?.()} title="在对话中查看全文">
            <span>展开全文</span>
            <Icon name="chevron-right" size={11} />
          </button>
        {/if}
        {#if message.audioUrl && onreplay}
          <button class="replay" onclick={() => onreplay?.(message)} title="重新播放语音">
            <Icon name="replay" size={12} />
            <span>重播</span>
          </button>
        {/if}
      </div>
    </div>
    <span class="tail" aria-hidden="true"></span>
  </aside>
{/if}

<style>
  .bubble {
    position: absolute;
    top: 38px;
    left: 50%;
    z-index: 22;
    width: max-content;
    max-width: min(86%, 360px);
    transform: translateX(-50%);
    padding: 11px 13px 9px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(160deg, rgba(19, 25, 41, 0.9), rgba(10, 14, 24, 0.86));
    box-shadow: 0 18px 50px -16px rgba(0, 0, 0, 0.8), var(--highlight);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    backdrop-filter: blur(16px) saturate(1.2);
    pointer-events: auto;
  }
  .bubble > * {
    position: relative;
    z-index: 1;
  }
  .bubble.alarm {
    border-color: rgba(255, 212, 121, 0.32);
    background: linear-gradient(160deg, rgba(41, 33, 19, 0.92), rgba(16, 14, 10, 0.9));
  }
  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 5px;
  }
  .name {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.24em;
    color: var(--ice);
    opacity: 0.85;
  }
  .emotion-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 99px;
    font-size: 9px;
    line-height: 1.5;
    color: var(--emotion);
    /* Solid fallback first: WebKitGTK without color-mix() keeps a neutral chip
       instead of dropping the declaration and rendering an unstyled box. */
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: color-mix(in srgb, var(--emotion) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--emotion) 22%, transparent);
  }
  .dismiss {
    position: relative;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    margin-left: auto;
    margin-right: -3px;
    border-radius: 50%;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  /* ≥28px hit area around the 18px visual chip (5px stays inside the 11/13px
     bubble padding, so it cannot overlap the emotion chip or leave the panel). */
  .dismiss::after {
    content: "";
    position: absolute;
    inset: -5px;
    border-radius: 50%;
  }
  .dismiss:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.08);
  }
  .dismiss:active {
    transform: scale(0.92);
  }
  .text {
    -webkit-user-select: text;
    user-select: text;
    margin: 0;
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--text-1);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 46px;
    overflow: hidden;
    padding-right: 2px;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 5px;
  }
  .time {
    font-size: 9.5px;
    color: var(--text-4);
    font-variant-numeric: tabular-nums;
  }
  .foot-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .expand,
  .replay {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 7px;
    border-radius: 99px;
    font-size: 10px;
    color: var(--ice);
    background: var(--ice-soft);
    transition: background var(--dur-fast), transform var(--dur-fast);
  }
  .expand:hover,
  .replay:hover {
    background: rgba(169, 201, 255, 0.22);
  }
  .expand:active,
  .replay:active {
    transform: scale(0.96);
  }
  .expand {
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.05);
  }
  .expand:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.09);
  }
  .tail {
    position: absolute;
    left: 50%;
    bottom: -6px;
    z-index: 0;
    width: 12px;
    height: 12px;
    transform: translateX(-50%) rotate(45deg);
    border-radius: 2px;
    background: rgba(12, 16, 27, 0.92);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .alarm .tail {
    background: rgba(24, 20, 13, 0.92);
    border-color: rgba(255, 212, 121, 0.3);
  }
</style>
