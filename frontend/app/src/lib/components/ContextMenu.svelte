<script>
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { motion } from '$lib/settings.svelte.js';
  import Icon from './Icon.svelte';

  let {
    x = 0,
    y = 0,
    dnd = false,
    phase = 'closed',
    tauri = false,
    onclose = null,
    onchat = null,
    onexpressions = null,
    ondnd = null,
    onsettings = null,
    onreconnect = null,
    onquit = null,
  } = $props();

  let menuEl = $state(null);
  let previousFocus = null;

  const width = 196;
  const height = 290;
  const left = $derived(Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)));
  const top = $derived(Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)));

  function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function run(action) {
    action?.();
    onclose?.();
  }

  function onWindowPointerDown(event) {
    if (!menuEl) return;
    if (!menuEl.contains(event.target)) onclose?.();
  }

  function onKeydown(event) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onclose?.();
      return;
    }
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      event.preventDefault();
      const items = getItems();
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement);
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
      else next = current <= 0 ? items.length - 1 : current - 1;
      items[next].focus();
    }
  }

  function getItems() {
    if (!menuEl) return [];
    return [...menuEl.querySelectorAll('[role^="menuitem"]')].filter(
      (el) => el instanceof HTMLElement && !el.hidden
    );
  }

  function focusItem(index) {
    const items = getItems();
    if (items.length === 0) return;
    items[Math.max(0, Math.min(index, items.length - 1))].focus();
  }

  onMount(() => {
    const active = document.activeElement;
    previousFocus = active instanceof HTMLElement && active !== document.body ? active : null;
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', onWindowPointerDown, true);
    }, 0);
    window.addEventListener('keydown', onKeydown);
    focusItem(0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('keydown', onKeydown);
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    };
  });
</script>

<div
  class="context glass grain"
  data-hit
  role="menu"
  aria-label="快捷菜单"
  bind:this={menuEl}
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  in:fly={motion({ y: -4, duration: 140, easing: cubicOut })}
  out:fly={motion({ y: -4, duration: 90 })}
>
  <div class="context-head">
    <span class="orb">L</span>
    <span class="head-copy">
      <span class="head-name">莉莉丝</span>
      <span class="head-state" class:off={phase !== 'open'}>
        {phase === 'open' ? '在线' : phase === 'connecting' ? '连接中' : '离线'}
      </span>
    </span>
  </div>

  <button class="item" role="menuitem" onclick={() => run(onchat)}>
    <Icon name="chat" size={15} />
    <span>开始对话</span>
    <kbd>Ctrl K</kbd>
  </button>
  <button class="item" role="menuitem" onclick={() => run(onexpressions)}>
    <Icon name="sparkles" size={15} />
    <span>切换表情</span>
  </button>
  <button class="item" role="menuitemcheckbox" aria-checked={dnd} onclick={() => run(ondnd)}>
    <Icon name={dnd ? 'bell-off' : 'moon'} size={15} />
    <span>免打扰</span>
    {#if dnd}<Icon name="check" size={12} />{/if}
  </button>
  <button class="item" role="menuitem" onclick={() => run(onsettings)}>
    <Icon name="settings" size={15} />
    <span>设置</span>
    <kbd>Ctrl ,</kbd>
  </button>

  <hr class="hairline" />

  <button class="item" role="menuitem" onclick={() => run(onreconnect)}>
    <Icon name="replay" size={15} />
    <span>重新连接</span>
  </button>
  {#if tauri}
    <button class="item danger" role="menuitem" onclick={() => run(onquit)}>
      <Icon name="power" size={15} />
      <span>关闭桌宠</span>
    </button>
  {/if}
</div>

<style>
  .context {
    position: absolute;
    z-index: 90;
    padding: 5px;
    border-radius: 15px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(165deg, rgba(18, 24, 39, 0.96), rgba(8, 11, 19, 0.97));
    box-shadow: 0 24px 60px -18px rgba(0, 0, 0, 0.9), var(--highlight);
    -webkit-backdrop-filter: blur(22px) saturate(1.2);
    backdrop-filter: blur(22px) saturate(1.2);
    pointer-events: auto;
    overflow: hidden;
  }
  .context > * {
    position: relative;
    z-index: 1;
  }
  .context-head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px 8px;
  }
  .orb {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-family: var(--font-display);
    font-style: italic;
    font-size: 11px;
    color: #0b1322;
    background: linear-gradient(150deg, #a9c9ff, #6f8fc9 60%, #3c3357);
  }
  .head-copy {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .head-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-1);
  }
  .head-state {
    font-size: 9px;
    color: var(--ok);
  }
  .head-state.off {
    color: var(--danger);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 31px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 11.5px;
    color: var(--text-2);
    text-align: left;
    transition: color var(--dur-fast), background var(--dur-fast);
  }
  .item:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.07);
  }
  .item:active {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.12);
  }
  .item :global(svg) {
    color: var(--text-3);
  }
  .item:hover :global(svg) {
    color: var(--ice);
  }
  .item span {
    flex: 1;
  }
  .item kbd {
    font-family: var(--font-mono);
    font-size: 8.5px;
    color: var(--text-4);
    padding: 1px 4px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .item.danger {
    color: var(--danger);
  }
  .item.danger :global(svg) {
    color: var(--danger);
  }
  .item.danger:hover {
    background: rgba(255, 142, 146, 0.1);
  }
  .item.danger:active {
    background: rgba(255, 142, 146, 0.18);
  }
  .context hr {
    margin: 4px 6px;
  }
</style>
