<script>
  import Icon from './Icon.svelte';

  let {
    phase = 'closed',
    onclose = null,
    tauri = false,
  } = $props();

  const statusColor = $derived(
    phase === 'open' ? 'var(--ok)' : phase === 'connecting' ? 'var(--amber)' : 'var(--danger)'
  );
</script>

<div class="chrome" data-hit>
  <div
    class="drag"
    data-tauri-drag-region
    role="button"
    tabindex="-1"
    aria-label="拖动窗口"
    title="拖动窗口"
  >
    <Icon name="grip" size={14} stroke={2.1} />
    <span class="dot" style:background={statusColor}></span>
    <span class="label">{phase === 'open' ? 'LILITH' : phase === 'connecting' ? '连接中' : '离线'}</span>
  </div>
  {#if tauri && onclose}
    <button class="close" onclick={onclose} aria-label="关闭桌宠" title="关闭">
      <Icon name="x" size={13} stroke={2} />
    </button>
  {/if}
</div>

<style>
  .chrome {
    position: absolute;
    top: 8px;
    left: 50%;
    z-index: 60;
    display: flex;
    align-items: center;
    transform: translateX(-50%);
    height: 26px;
    padding: 0 3px;
    border-radius: 99px;
    color: var(--text-3);
    background: rgba(8, 11, 18, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.07);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    opacity: 0.82;
    transition: opacity var(--dur) var(--ease-out), background var(--dur);
  }
  .chrome:hover {
    opacity: 1;
    background: rgba(8, 11, 18, 0.82);
  }
  .drag {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 8px;
    cursor: grab;
    user-select: none;
  }
  .drag:active {
    cursor: grabbing;
  }
  .drag :global(svg) {
    opacity: 0.85;
    color: var(--text-2);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
    flex: none;
  }
  .label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: var(--text-2);
    line-height: 1;
    margin-top: 1px;
  }
  .close {
    position: relative;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-left: 1px;
    border-radius: 50%;
    color: var(--text-3);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity var(--dur-fast), background var(--dur-fast), color var(--dur-fast),
      transform var(--dur-fast), visibility 0s linear var(--dur-fast);
  }
  /* ≥28px hit area while the visible chip stays 22px. Only 3px of bleed, and
     the button is hidden/`pointer-events: none` until the chrome is hovered,
     so the chrome bar itself keeps its size. */
  .close::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
  }
  .chrome:hover .close,
  .close:focus-visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition: opacity var(--dur-fast), background var(--dur-fast), color var(--dur-fast),
      transform var(--dur-fast);
  }
  .close:hover {
    color: var(--text-1);
    background: rgba(255, 142, 146, 0.18);
  }
  .close:active {
    transform: scale(0.92);
    background: rgba(255, 142, 146, 0.3);
  }
</style>
