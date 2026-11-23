<script>
  import { fly, fade } from 'svelte/transition';
  import { motion } from '$lib/settings.svelte.js';
  import Icon from './Icon.svelte';
  import { toasts } from '$lib/toast.svelte.js';

  function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function iconFor(type) {
    if (type === 'success') return 'check';
    if (type === 'warning') return 'alert';
    if (type === 'error') return 'alert';
    return 'info';
  }
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
  {#each toasts as item (item.id)}
    <div
      class="toast glass"
      class:success={item.type === 'success'}
      class:warning={item.type === 'warning'}
      class:error={item.type === 'error'}
      role="status"
      in:fly={motion({ y: -6, duration: 200, easing: cubicOut })}
      out:fade={motion({ duration: 160 })}
    >
      <span class="toast-icon"><Icon name={iconFor(item.type)} size={13} /></span>
      <span class="toast-text">{item.message}</span>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: absolute;
    top: 42px;
    left: 50%;
    z-index: 95;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    width: max-content;
    max-width: 90%;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    padding: 6px 11px 6px 8px;
    border-radius: 99px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-2);
    background: rgba(12, 17, 28, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.8);
    pointer-events: auto;
    animation: toast-in 0.2s var(--ease-out) both;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  .toast-icon {
    display: grid;
    place-items: center;
    width: 19px;
    height: 19px;
    flex: none;
    border-radius: 50%;
    color: var(--ice);
    background: var(--ice-soft);
  }
  .toast-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toast.success .toast-icon {
    color: var(--ok);
    background: rgba(143, 227, 192, 0.12);
  }
  .toast.warning .toast-icon {
    color: var(--amber);
    background: var(--amber-soft);
  }
  .toast.error {
    color: var(--text-1);
    border-color: rgba(255, 142, 146, 0.24);
    background: rgba(40, 14, 18, 0.92);
  }
  .toast.error .toast-icon {
    color: var(--danger);
    background: rgba(255, 142, 146, 0.14);
  }
</style>
