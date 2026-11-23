<script>
  import { fly } from 'svelte/transition';
  import { settings, motion } from '$lib/settings.svelte.js';
  import Icon from './Icon.svelte';

  let {
    options = [],
    activeId = null,
    inline = false,
    onselect = null,
    onclose = null,
  } = $props();

  let railEl = $state(null);
  const activeLabel = $derived(options.find((option) => option.id === activeId)?.label || '');

  $effect(() => {
    void activeId;
    void options.length;
    if (!railEl) return;
    const active = [...railEl.children].find((child) => child.dataset?.lookId === activeId);
    if (!active) return;
    const railRect = railEl.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const target =
      railEl.scrollLeft +
      (activeRect.left - railRect.left) -
      (railRect.width - activeRect.width) / 2;
    railEl.scrollTo({
      left: Math.max(0, target),
      behavior: settings.reduceMotion ? 'auto' : 'smooth',
    });
  });

  function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function getOptions() {
    if (!railEl) return [];
    return [...railEl.querySelectorAll('[role="option"]')].filter(
      (el) => el instanceof HTMLElement && !el.hidden
    );
  }

  function onRailKeydown(event) {
    const options = getOptions();
    if (options.length === 0) return;
    const current = options.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      next = current < 0 ? 0 : (current + 1) % options.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      next = current <= 0 ? options.length - 1 : current - 1;
    } else if (event.key === 'Home') {
      event.preventDefault();
      next = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      next = options.length - 1;
    } else {
      return;
    }
    const target = options[next];
    target.focus();
    target.scrollIntoView({
      behavior: settings.reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }
</script>

<section
  class="shelf glass grain"
  class:inline
  data-hit
  aria-label="表情选择"
  in:fly={motion({ y: 8, duration: 200, easing: cubicOut })}
  out:fly={motion({ y: 6, duration: 140, easing: cubicOut })}
>
  <header>
    <Icon name="sparkles" size={13} />
    <span class="title">表情</span>
    <span class="hint">{activeId ? `手动 · ${activeLabel}` : '跟随情绪'}</span>
    {#if onclose}
      <button class="close" onclick={() => onclose?.()} aria-label="关闭表情面板">
        <Icon name="x" size={12} stroke={2} />
      </button>
    {/if}
  </header>

  <div class="rail-wrap">
    <button
      class="chip auto pinned"
      class:active={!activeId}
      aria-pressed={!activeId}
      onclick={() => onselect?.(null)}
    >
      <Icon name="sparkles" size={12} />
      <span>自动</span>
    </button>
    <div
      class="rail"
      bind:this={railEl}
      role="listbox"
      aria-label="可用表情"
      tabindex="0"
      onkeydown={onRailKeydown}
    >
      {#each options as option}
        <button
          class="chip"
          class:active={activeId === option.id}
          class:custom={option.kind === 'custom'}
          role="option"
          aria-selected={activeId === option.id}
          tabindex="-1"
          data-look-id={option.id}
          onclick={() => onselect?.(option.id)}
        >
          <i class="swatch" style:background={option.color}></i>
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  .shelf {
    position: absolute;
    left: 50%;
    bottom: 80px;
    z-index: 48;
    width: min(92%, 384px);
    padding: 9px 10px 10px;
    transform: translateX(-50%);
    border-radius: 17px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(180deg, rgba(17, 23, 38, 0.92), rgba(9, 13, 22, 0.92));
    box-shadow: 0 22px 60px -20px rgba(0, 0, 0, 0.85), var(--highlight);
    -webkit-backdrop-filter: blur(18px) saturate(1.2);
    backdrop-filter: blur(18px) saturate(1.2);
    pointer-events: auto;
  }
  .shelf.inline {
    position: relative;
    left: auto;
    bottom: auto;
    z-index: 1;
    width: 100%;
    transform: none;
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    padding: 9px 12px 8px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 7px;
    color: var(--ice);
  }
  .title {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--text-2);
  }
  .hint {
    font-size: 9.5px;
    color: var(--text-4);
  }
  .close {
    position: relative;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-left: auto;
    border-radius: 50%;
    color: var(--text-3);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  /* ≥28px hit area; the 4px bleed stays inside the shelf's 9/10px padding. */
  .close::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
  }
  .close:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.08);
  }
  .close:active {
    transform: scale(0.92);
  }
  .rail-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .pinned {
    flex: none;
    background: rgba(255, 255, 255, 0.055);
  }
  .rail {
    display: flex;
    gap: 6px;
    min-width: 0;
    flex: 1;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    padding-bottom: 1px;
    -webkit-mask-image: linear-gradient(90deg, #000 94%, transparent);
    mask-image: linear-gradient(90deg, #000 94%, transparent);
  }
  .rail::-webkit-scrollbar {
    display: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    height: 28px;
    padding: 0 10px;
    border-radius: 99px;
    font-size: 11.5px;
    color: var(--text-2);
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid rgba(255, 255, 255, 0.07);
    transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast),
      transform var(--dur-fast);
  }
  .chip:hover {
    color: var(--text-1);
    background: rgba(255, 255, 255, 0.08);
  }
  .chip:active {
    transform: scale(0.96);
  }
  .chip.auto {
    color: var(--ice);
  }
  .chip.active {
    color: var(--ice-strong);
    background: rgba(169, 201, 255, 0.14);
    border-color: rgba(169, 201, 255, 0.34);
    box-shadow: 0 0 18px -8px rgba(169, 201, 255, 0.9);
  }
  .chip.custom .swatch {
    background: var(--rose) !important;
  }
  .swatch {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    opacity: 0.85;
    flex: none;
  }
</style>
