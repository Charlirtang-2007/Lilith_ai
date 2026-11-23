<script>
  import { fly } from 'svelte/transition';
  import { motion } from '$lib/settings.svelte.js';
  import Icon from './Icon.svelte';
  import MessageList from './MessageList.svelte';
  import Composer from './Composer.svelte';
  import ExpressionShelf from './ExpressionShelf.svelte';

  let {
    name = 'Lilith',
    messages = [],
    status = 'idle',
    phase = 'closed',
    latency = null,
    retryIn = 0,
    focusToken = 0,
    exprOpen = false,
    exprOptions = [],
    activeLook = null,
    onclose = null,
    onclear = null,
    onsend = null,
    onstop = null,
    onreplay = null,
    onvoice = null,
    onprompt = null,
    onreconnect = null,
    onselectlook = null,
    ontoggleexpressions = null,
  } = $props();

  let confirmClear = $state(false);

  function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function clear() {
    onclear?.();
    confirmClear = false;
  }

  const stateLabel = $derived(
    phase !== 'open'
      ? phase === 'connecting'
        ? '连接中'
        : '已离线'
      : status === 'thinking'
        ? '正在思考'
        : status === 'speaking'
          ? '正在说话'
          : '在线'
  );
</script>

<section
  class="drawer glass grain"
  data-hit
  aria-label="对话"
  in:fly={motion({ y: 26, duration: 260, easing: cubicOut })}
  out:fly={motion({ y: 18, duration: 180, easing: cubicOut })}
>
  <div class="drag-handle" data-tauri-drag-region aria-hidden="true"><i></i></div>

  <header class="drawer-head">
    <div class="who">
      <span class="avatar">L</span>
      <div class="who-copy">
        <p class="name">{name}</p>
        <p class="state" class:offline={phase !== 'open'}>
          <i class="dot" class:ok={phase === 'open'} class:warn={phase === 'connecting'}></i>
          {stateLabel}
          {#if phase === 'open' && latency != null}
            <span class="latency">{latency}ms</span>
          {/if}
        </p>
      </div>
    </div>
    <div class="head-actions">
      {#if messages.length > 0}
        <button class="ghost" onclick={() => (confirmClear = !confirmClear)} aria-label="清空对话" title="清空对话">
          <Icon name="trash" size={15} />
        </button>
      {/if}
      <button class="ghost" onclick={() => onclose?.()} aria-label="收起对话" title="收起（Esc）">
        <Icon name="x" size={15} />
      </button>
    </div>
  </header>

  {#if confirmClear}
    <div class="confirm">
      <span>清空全部对话记录？</span>
      <button class="confirm-cancel" onclick={() => (confirmClear = false)}>取消</button>
      <button class="confirm-ok" onclick={clear}>清空</button>
    </div>
  {/if}

  {#if phase !== 'open'}
    <div class="offline">
      <Icon name="wifi-off" size={13} />
      <span>
        {phase === 'connecting' ? '正在连接后端…' : `连接已断开${retryIn ? ` · ${retryIn}s 后重试` : ''}`}
      </span>
      <button onclick={() => onreconnect?.()}>重试</button>
    </div>
  {/if}

  <MessageList
    {messages}
    {status}
    {name}
    {onreplay}
    {onprompt}
  />

  {#if exprOpen}
    <ExpressionShelf
      inline
      options={exprOptions}
      activeId={activeLook}
      onselect={onselectlook}
      onclose={ontoggleexpressions}
    />
  {/if}

  <Composer
    connected={phase === 'open'}
    {status}
    {focusToken}
    {exprOpen}
    onSend={onsend}
    onStop={onstop}
    onVoice={onvoice}
    onToggleExpressions={ontoggleexpressions}
  />
</section>

<style>
  .drawer {
    position: absolute;
    left: 50%;
    bottom: 80px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    width: min(94%, 404px);
    height: min(50%, 420px);
    min-height: min(300px, calc(100% - 150px));
    max-height: calc(100% - 150px);
    transform: translateX(-50%);
    border-radius: var(--radius-xl);
    border: 1px solid rgba(255, 255, 255, 0.115);
    background:
      linear-gradient(180deg, rgba(17, 23, 38, 0.88), rgba(8, 11, 19, 0.94));
    box-shadow: var(--shadow-lg), var(--highlight);
    -webkit-backdrop-filter: blur(24px) saturate(1.25);
    backdrop-filter: blur(24px) saturate(1.25);
    pointer-events: auto;
    overflow: hidden;
  }
  .drawer > * {
    position: relative;
    z-index: 1;
  }
  .drag-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
    display: flex;
    justify-content: center;
    padding: 6px 0 0;
    cursor: grab;
  }
  .drag-handle i {
    width: 34px;
    height: 3px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.16);
  }
  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 17px 13px 8px 14px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 50%;
    font-family: var(--font-display);
    font-style: italic;
    font-size: 16px;
    color: #0b1322;
    background:
      radial-gradient(circle at 30% 22%, rgba(214, 230, 255, 0.5), transparent 46%),
      linear-gradient(150deg, #a9c9ff, #6f8fc9 50%, #241d38);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14) inset;
  }
  .who-copy {
    min-width: 0;
  }
  .name {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--text-1);
    line-height: 1.3;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 1px 0 0;
    font-size: 9.5px;
    color: var(--text-3);
    line-height: 1.3;
    white-space: nowrap;
  }
  .state.offline {
    color: var(--danger);
    opacity: 0.9;
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--danger);
    flex: none;
  }
  .dot.ok {
    background: var(--ok);
    box-shadow: 0 0 6px rgba(143, 227, 192, 0.6);
  }
  .dot.warn {
    background: var(--amber);
    animation: lilith-pulse 1.6s ease-in-out infinite;
  }
  .latency {
    padding: 0 5px;
    border-radius: 99px;
    font-size: 8.5px;
    font-variant-numeric: tabular-nums;
    color: var(--text-3);
    background: rgba(255, 255, 255, 0.05);
  }
  .head-actions {
    display: flex;
    gap: 2px;
  }
  .ghost {
    display: grid;
    place-items: center;
    width: 29px;
    height: 29px;
    border-radius: 9px;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  .ghost:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.07);
  }
  .ghost:active {
    transform: scale(0.93);
    background: rgba(255, 255, 255, 0.11);
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 13px 8px;
    padding: 7px 10px;
    border-radius: 10px;
    font-size: 11px;
    color: var(--text-2);
    background: rgba(255, 142, 146, 0.08);
    border: 1px solid rgba(255, 142, 146, 0.18);
    animation: lilith-rise 0.22s var(--ease-out) both;
  }
  .confirm span {
    flex: 1;
  }
  .confirm button {
    padding: 3px 9px;
    border-radius: 99px;
    font-size: 10.5px;
    transition: filter var(--dur-fast), background var(--dur-fast);
  }
  .confirm button:active {
    filter: brightness(0.9);
  }
  .confirm-cancel {
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.06);
  }
  .confirm-ok {
    color: #1c0b0d;
    background: var(--danger);
  }
  .offline {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 13px 6px;
    padding: 5px 10px;
    border-radius: 9px;
    font-size: 10.5px;
    color: var(--amber);
    background: var(--amber-soft);
    border: 1px solid rgba(255, 212, 121, 0.18);
  }
  .offline span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .offline button {
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 10px;
    color: var(--amber);
    background: rgba(255, 212, 121, 0.14);
  }
  .offline button:hover {
    background: rgba(255, 212, 121, 0.22);
  }
  .offline button:active {
    background: rgba(255, 212, 121, 0.3);
  }
  @media (max-height: 620px) {
    .drawer {
      height: min(58%, 420px);
      bottom: 78px;
    }
  }
</style>
