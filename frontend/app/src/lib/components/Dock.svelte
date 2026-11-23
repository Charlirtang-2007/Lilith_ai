<script>
  import Icon from './Icon.svelte';

  let {
    name = 'Lilith',
    phase = 'closed',
    brain = 'idle',
    speaking = false,
    unread = 0,
    dnd = false,
    drawerOpen = false,
    exprOpen = false,
    onchat = null,
    onexpressions = null,
    ondnd = null,
    onsettings = null,
  } = $props();

  const status = $derived.by(() => {
    if (phase === 'connecting') return '连接中';
    if (phase !== 'open') return '已离线';
    if (speaking) return '正在说话';
    if (brain === 'thinking') return '思考中';
    return '待机中';
  });

  const live = $derived(phase === 'open');
  const busy = $derived(speaking || brain === 'thinking');
</script>

<nav class="dock glass grain" data-hit aria-label="莉莉丝控制台">
  <button class="identity" onclick={() => onchat?.()} aria-label="打开对话" title="打开对话（Ctrl K）">
    <span class="orb" class:live class:busy>
      <span class="orb-inner">L</span>
      {#if speaking}
        <span class="equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      {/if}
    </span>
    <span class="identity-copy">
      <span class="name">{name}</span>
      <span class="state" class:dnd class:offline={!live}>
        {#if live}<i class="dot"></i>{/if}
        {status}
        {#if dnd}<span class="dnd-tag">勿扰</span>{/if}
      </span>
    </span>
  </button>

  <span class="sep" aria-hidden="true"></span>

  <div class="actions">
    <button
      class="action"
      class:active={drawerOpen}
      onclick={() => onchat?.()}
      aria-label="对话"
      aria-expanded={drawerOpen}
      title="对话（Ctrl K）"
    >
      <Icon name="chat" size={17} />
      {#if unread > 0}
        <span class="badge">{unread > 9 ? '9+' : unread}</span>
      {/if}
    </button>

    <button
      class="action"
      class:active={exprOpen}
      onclick={() => onexpressions?.()}
      aria-label="表情"
      aria-expanded={exprOpen}
      title="表情"
    >
      <Icon name="sparkles" size={17} />
    </button>

    <button
      class="action"
      class:on={dnd}
      onclick={() => ondnd?.()}
      aria-label={dnd ? '关闭免打扰' : '开启免打扰'}
      aria-pressed={dnd}
      title={dnd ? '关闭免打扰' : '免打扰'}
    >
      <Icon name="moon" size={17} />
    </button>

    <button class="action" onclick={() => onsettings?.()} aria-label="设置" title="设置（Ctrl ,）">
      <Icon name="settings" size={17} />
    </button>
  </div>
</nav>

<style>
  .dock {
    position: absolute;
    left: 50%;
    bottom: 14px;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 2px;
    width: min(94%, 392px);
    height: 56px;
    padding: 6px 8px 6px 7px;
    transform: translateX(-50%);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(21, 28, 45, 0.82), rgba(9, 13, 22, 0.88));
    box-shadow: 0 24px 60px -18px rgba(0, 0, 0, 0.85), var(--highlight);
    -webkit-backdrop-filter: blur(20px) saturate(1.25);
    backdrop-filter: blur(20px) saturate(1.25);
    pointer-events: auto;
    transition: border-color var(--dur), background var(--dur);
  }
  .dock > * {
    position: relative;
    z-index: 1;
  }
  .dock:hover {
    border-color: rgba(169, 201, 255, 0.2);
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    height: 100%;
    padding: 0 8px 0 2px;
    border-radius: 14px;
    text-align: left;
    transition: background var(--dur-fast);
  }
  .identity:hover {
    background: rgba(255, 255, 255, 0.045);
  }
  .orb {
    position: relative;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 50%;
    background:
      radial-gradient(circle at 32% 24%, rgba(214, 230, 255, 0.52), transparent 48%),
      linear-gradient(150deg, #a9c9ff, #6f8fc9 42%, #241d38 100%);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16) inset, 0 6px 18px -6px rgba(96, 132, 196, 0.7);
  }
  .orb::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 1px solid rgba(169, 201, 255, 0.28);
    opacity: 0;
    transition: opacity var(--dur);
  }
  .orb.busy::after {
    opacity: 1;
    animation: orb-pulse 2.4s ease-in-out infinite;
  }
  @keyframes orb-pulse {
    0%,
    100% {
      transform: scale(0.94);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.04);
      opacity: 1;
    }
  }
  .orb-inner {
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    font-style: italic;
    color: #0b1322;
    line-height: 1;
    transform: translateY(1px);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .equalizer {
    position: absolute;
    right: -5px;
    bottom: -2px;
    display: flex;
    align-items: flex-end;
    gap: 1.5px;
    height: 12px;
    padding: 2px 3px;
    border-radius: 5px;
    background: rgba(7, 10, 18, 0.85);
    border: 1px solid rgba(169, 201, 255, 0.28);
  }
  .equalizer i {
    display: block;
    width: 1.5px;
    height: 100%;
    border-radius: 99px;
    background: var(--ice);
    transform-origin: bottom;
    animation: lilith-equalize 0.9s ease-in-out infinite;
  }
  .equalizer i:nth-child(2) {
    animation-delay: -0.32s;
  }
  .equalizer i:nth-child(3) {
    animation-delay: -0.55s;
  }
  .equalizer i:nth-child(4) {
    animation-delay: -0.16s;
  }
  .identity-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }
  .name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-1);
    line-height: 1.2;
    white-space: nowrap;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    line-height: 1.3;
    color: var(--text-3);
    white-space: nowrap;
  }
  .state.dnd {
    color: var(--amber);
  }
  .state.offline {
    color: var(--danger);
    opacity: 0.9;
  }
  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 6px rgba(143, 227, 192, 0.7);
  }
  .dnd-tag {
    padding: 0 5px;
    border-radius: 99px;
    font-size: 8.5px;
    background: var(--amber-soft);
    border: 1px solid rgba(255, 212, 121, 0.24);
  }
  .sep {
    width: 1px;
    height: 22px;
    margin: 0 3px;
    background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.12), transparent);
    flex: none;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: auto;
  }
  .action {
    position: relative;
    display: grid;
    place-items: center;
    width: 35px;
    height: 35px;
    border-radius: 12px;
    color: var(--text-2);
    transition: background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
  }
  .action:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.07);
  }
  .action:active {
    transform: scale(0.94);
  }
  .action.active {
    color: var(--ice-strong);
    background: rgba(169, 201, 255, 0.13);
    box-shadow: inset 0 0 0 1px rgba(169, 201, 255, 0.16);
  }
  .action.on {
    color: var(--amber);
    background: var(--amber-soft);
  }
  .badge {
    position: absolute;
    top: 3px;
    right: 3px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 99px;
    font-size: 8.5px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
    color: #0a0f1a;
    background: var(--rose);
    box-shadow: 0 0 0 1px rgba(10, 15, 26, 0.6);
  }
  @media (max-width: 370px) {
    .identity {
      padding-right: 4px;
    }
    .action {
      width: 32px;
    }
  }
</style>
