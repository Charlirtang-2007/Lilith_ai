<script>
  import { tick } from 'svelte';
  import { settings } from '$lib/settings.svelte.js';
  import Icon from './Icon.svelte';

  let {
    messages = [],
    status = 'idle',
    name = 'Lilith',
    onreplay = null,
    onprompt = null,
  } = $props();

  let listEl = $state(null);
  let stick = true;
  let showJump = $state(false);
  let lastCount = 0;

  const smooth = $derived(settings.reduceMotion ? 'auto' : 'smooth');

  const prompts = [
    { icon: 'heart', text: '陪我聊会儿' },
    { icon: 'moon', text: '今天有点累' },
    { icon: 'sparkles', text: '给我讲个故事' },
  ];

  const showEmpty = $derived(messages.length === 0 && status !== 'thinking');
  const showTyping = $derived(status === 'thinking');

  function scrollToBottom(behavior = smooth) {
    if (!listEl) return;
    listEl.scrollTo({ top: listEl.scrollHeight, behavior });
    stick = true;
    showJump = false;
  }

  function handleScroll() {
    if (!listEl) return;
    const distance = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    stick = distance < 56;
    showJump = !stick;
  }

  function timeOf(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function isFirstOfGroup(index) {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const current = messages[index];
    if (prev.role !== current.role) return true;
    return new Date(current.at || 0).getTime() - new Date(prev.at || 0).getTime() > 120000;
  }

  $effect(() => {
    // Make the component depend on list mutations and typing state.
    const count = messages.length;
    const typing = status === 'thinking';
    void typing;
    if (!listEl) return;
    tick().then(() => {
      if (!listEl) return;
      if (stick && (count > lastCount || typing)) {
        listEl.scrollTo({ top: listEl.scrollHeight, behavior: count - lastCount > 3 ? 'auto' : smooth });
      }
      lastCount = count;
    });
  });

  $effect(() => {
    if (listEl) {
      tick().then(() => scrollToBottom('auto'));
    }
  });
</script>

<div class="wrap">
  <div
    class="message-list"
    bind:this={listEl}
    onscroll={handleScroll}
    role="log"
    aria-live="polite"
    aria-label="对话记录"
  >
    {#if !showEmpty}
      <div class="push" aria-hidden="true"></div>
    {/if}

    {#if showEmpty}
      <div class="empty">
        <div class="empty-orb" aria-hidden="true"><span>L</span></div>
        <p class="empty-eyebrow">LILITH</p>
        <p class="empty-title">我在这里。</p>
        <p class="empty-sub">今天想聊点什么？</p>
        <div class="prompts">
          {#each prompts as prompt}
            <button class="prompt" onclick={() => onprompt?.(prompt.text)}>
              <Icon name={prompt.icon} size={12} />
              {prompt.text}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#each messages as message, index (message.id)}
      {#if message.role === 'system'}
        <div class="system-row">
          <span class="system-pill" class:alarm={message.alarm}>
            <Icon name={message.alarm ? 'clock' : 'info'} size={11} />
            <span>{message.text}</span>
          </span>
        </div>
      {:else if message.role === 'user'}
        <div class="row user">
          <div class="bubble user-bubble">{message.text}</div>
          <div class="meta right">
            <span class="time">{timeOf(message.at)}</span>
          </div>
        </div>
      {:else}
        <div class="row pet" class:grouped={!isFirstOfGroup(index)}>
          {#if isFirstOfGroup(index)}
            <div class="avatar" aria-hidden="true">L</div>
          {:else}
            <div class="avatar-spacer" aria-hidden="true"></div>
          {/if}
          <div class="body">
            {#if isFirstOfGroup(index)}
              <p class="speaker">
                {name}
                {#if message.emotionInfo}
                  <span
                    class="emotion"
                    style:--emotion={message.emotionInfo.color}
                  >{message.emotionInfo.label}</span>
                {/if}
                {#if message.alarm}<span class="alarm-tag"><Icon name="clock" size={9} /> 闹钟</span>{/if}
              </p>
            {/if}
            <div class="bubble pet-bubble" class:alarm={message.alarm}>
              <p>{message.text}</p>
            </div>
            <div class="meta">
              <span class="time">{timeOf(message.at)}</span>
              {#if message.audioUrl && onreplay}
                <button class="replay" onclick={() => onreplay(message)} title="重新播放语音">
                  <Icon name="replay" size={11} />
                  重播
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    {/each}

    {#if showTyping}
      <div class="row pet typing-row">
        <div class="avatar" aria-hidden="true">L</div>
        <div class="body">
          <p class="speaker">{name}<span class="thinking-label">正在思考</span></p>
          <div class="bubble pet-bubble typing">
            <i></i><i></i><i></i>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if showJump}
    <button class="jump" onclick={() => scrollToBottom(smooth)} aria-label="回到底部">
      <Icon name="arrow-down" size={14} />
    </button>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  .message-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 14px 12px;
    scroll-behavior: smooth;
  }
  .push {
    flex: 1 1 0;
    min-height: 0;
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 22px 10px 28px;
    animation: lilith-rise 0.5s var(--ease-out) both;
  }
  .empty-orb {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    margin-bottom: 12px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 30% 22%, rgba(214, 230, 255, 0.5), transparent 46%),
      linear-gradient(150deg, #a9c9ff, #6f8fc9 45%, #241d38);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14) inset, 0 12px 28px -12px rgba(96, 132, 196, 0.8);
  }
  .empty-orb span {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 27px;
    color: #0b1322;
    transform: translateY(1px);
  }
  .empty-eyebrow {
    margin: 0 0 4px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.3em;
    color: var(--ice);
    opacity: 0.7;
  }
  .empty-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 21px;
    letter-spacing: 0.05em;
    color: var(--text-1);
  }
  .empty-sub {
    margin: 5px 0 16px;
    font-size: 12px;
    color: var(--text-3);
  }
  .prompts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
  .prompt {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px;
    border-radius: 99px;
    font-size: 11px;
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast),
      transform var(--dur-fast);
  }
  .prompt:hover {
    color: var(--text-1);
    background: rgba(169, 201, 255, 0.1);
    border-color: rgba(169, 201, 255, 0.24);
  }
  .prompt:active {
    transform: scale(0.97);
    background: rgba(169, 201, 255, 0.16);
  }
  .row {
    display: flex;
    gap: 8px;
    max-width: 100%;
    animation: row-in 0.26s var(--ease-out) both;
  }
  .row.pet {
    align-items: flex-start;
  }
  .row.user {
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    margin-top: 2px;
  }
  .row.grouped {
    margin-top: -4px;
  }
  .avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 26px;
    height: 26px;
    margin-top: 19px;
    border-radius: 50%;
    font-family: var(--font-display);
    font-style: italic;
    font-size: 13px;
    color: #0b1322;
    background: linear-gradient(150deg, #a9c9ff, #6f8fc9 60%, #3c3357);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.13) inset;
  }
  .avatar-spacer {
    width: 26px;
    flex: none;
  }
  .body {
    min-width: 0;
    max-width: calc(100% - 34px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }
  .speaker {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 1px 2px;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--text-3);
  }
  .emotion {
    padding: 0 5px;
    border-radius: 99px;
    font-size: 8.5px;
    letter-spacing: 0.04em;
    font-weight: 500;
    color: var(--emotion);
    /* Solid fallback first: WebKitGTK without color-mix() keeps a neutral chip
       instead of dropping the declaration and rendering an unstyled box. */
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: color-mix(in srgb, var(--emotion) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--emotion) 20%, transparent);
  }
  .alarm-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 5px;
    border-radius: 99px;
    font-size: 8.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--amber);
    background: var(--amber-soft);
    border: 1px solid rgba(255, 212, 121, 0.22);
  }
  .thinking-label {
    color: var(--text-4);
    letter-spacing: 0.04em;
    font-weight: 400;
  }
  .bubble {
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.62;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    -webkit-user-select: text;
    user-select: text;
  }
  .pet-bubble {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.052);
    border: 1px solid rgba(255, 255, 255, 0.065);
    border-top-left-radius: 5px;
  }
  .pet-bubble p {
    margin: 0;
  }
  .pet-bubble.alarm {
    background: rgba(255, 212, 121, 0.07);
    border-color: rgba(255, 212, 121, 0.2);
  }
  .user-bubble {
    color: #0c1424;
    background: linear-gradient(150deg, #d3e4ff, #a9c9ff 60%, #93b7f5);
    border-bottom-right-radius: 5px;
    box-shadow: 0 8px 20px -12px rgba(122, 160, 230, 0.8);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 3px;
    min-height: 14px;
  }
  .meta.right {
    padding-right: 3px;
  }
  .time {
    font-size: 9px;
    color: var(--text-4);
    font-variant-numeric: tabular-nums;
  }
  .replay {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 99px;
    font-size: 9px;
    color: var(--ice);
    background: var(--ice-soft);
    transition: background var(--dur-fast), transform var(--dur-fast);
  }
  .replay:hover {
    background: rgba(169, 201, 255, 0.2);
  }
  .replay:active {
    transform: scale(0.96);
    background: rgba(169, 201, 255, 0.3);
  }
  .system-row {
    display: flex;
    justify-content: center;
    padding: 2px 0;
  }
  .system-pill {
    -webkit-user-select: text;
    user-select: text;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 90%;
    padding: 3px 10px;
    border-radius: 99px;
    font-size: 10px;
    line-height: 1.5;
    color: var(--text-3);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .system-pill.alarm {
    color: var(--amber);
    background: var(--amber-soft);
    border-color: rgba(255, 212, 121, 0.2);
  }
  .typing-row {
    margin-top: 2px;
  }
  .typing {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 12px 14px;
  }
  .typing i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--text-3);
    animation: typing 1.3s ease-in-out infinite;
  }
  .typing i:nth-child(2) {
    animation-delay: 0.16s;
  }
  .typing i:nth-child(3) {
    animation-delay: 0.32s;
  }
  @keyframes typing {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.35;
    }
    30% {
      transform: translateY(-3px);
      opacity: 1;
    }
  }
  @keyframes row-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .jump {
    position: absolute;
    left: 50%;
    bottom: 8px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    transform: translateX(-50%);
    border-radius: 50%;
    color: var(--text-1);
    background: rgba(20, 27, 43, 0.94);
    border: 1px solid var(--line-strong);
    box-shadow: 0 8px 20px -8px rgba(0, 0, 0, 0.8);
    animation: lilith-fade-in 0.2s ease both;
    transition: background var(--dur-fast), transform var(--dur-fast);
  }
  .jump:hover {
    background: rgba(30, 39, 60, 0.96);
  }
  .jump:active {
    transform: translateX(-50%) scale(0.94);
  }
</style>
