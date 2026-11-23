<script>
  /** Hand-drawn 24px line icons — no runtime dependency, no icon font. */
  let { name = 'dot', size = 18, stroke = 1.7, filled = false } = $props();

  const bubbles = {
    chat: 'M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9 9 0 0 1-3.2-.6L4 21l1.3-4.2A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class={filled ? 'icon-filled' : undefined}
>
  {#if name === 'chat'}
    <path d={bubbles.chat} />
    <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke-width={stroke + 0.5} />
  {:else if name === 'sparkles'}
    <path d="M12 3.5 13.7 8l4.5 1.7-4.5 1.7L12 16l-1.7-4.6L5.8 9.7 10.3 8 12 3.5Z" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
  {:else if name === 'settings'}
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.1" />
    <circle cx="9" cy="17" r="2.1" />
  {:else if name === 'mic'}
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
  {:else if name === 'send'}
    <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
  {:else if name === 'stop'}
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.4" fill="currentColor" stroke="none" />
  {:else if name === 'x'}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === 'chevron-down'}
    <path d="m6 9.5 6 6 6-6" />
  {:else if name === 'chevron-right'}
    <path d="m9.5 6 6 6-6 6" />
  {:else if name === 'volume'}
    <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4Z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
  {:else if name === 'volume-off'}
    <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4Z" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  {:else if name === 'moon'}
    <path d="M20 14.2A8.3 8.3 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
  {:else if name === 'bell'}
    <path d="M18 9.5a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.3 20a2 2 0 0 0 3.4 0" />
  {:else if name === 'bell-off'}
    <path d="M8.7 4.6A6 6 0 0 1 18 9.5c0 2.2.3 3.8.7 4.9M6.2 7.2C6.1 8 6 8.7 6 9.5c0 6-2 7-2 7h13M10.3 20a2 2 0 0 0 3.4 0M3 3l18 18" />
  {:else if name === 'trash'}
    <path d="M4 7h16M9.5 7V5h5v2M6.5 7l.8 12.1A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.9L17.5 7M10 11v6M14 11v6" />
  {:else if name === 'replay'}
    <path d="M4 4v6h6" />
    <path d="M4.6 15a8 8 0 1 0 1.6-7.4L4 10" />
  {:else if name === 'grip'}
    <circle cx="9" cy="7" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="17" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="17" r="1.1" fill="currentColor" stroke="none" />
  {:else if name === 'heart'}
    <path d="M12 20.2S4 15.3 4 9.9A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.9c0 5.4-8 10.3-8 10.3Z" />
  {:else if name === 'alert'}
    <path d="M12 3.5 22 20H2L12 3.5Z" />
    <path d="M12 9v5M12 17.2v.1" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5v.1" />
  {:else if name === 'check'}
    <path d="m4.5 12.5 5 5 10-11" />
  {:else if name === 'copy'}
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.4" />
    <path d="M15.5 8.5V6.8a2.3 2.3 0 0 0-2.3-2.3H6.8a2.3 2.3 0 0 0-2.3 2.3v6.4a2.3 2.3 0 0 0 2.3 2.3h1.7" />
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.4l3.4 2" />
  {:else if name === 'wifi'}
    <path d="M3.5 9a13 13 0 0 1 17 0M6.5 12.4a8.5 8.5 0 0 1 11 0M9.5 15.7a4 4 0 0 1 5 0" />
    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  {:else if name === 'wifi-off'}
    <path d="M3.5 9a13 13 0 0 1 5-2.9M15.5 6.1A13 13 0 0 1 20.5 9M6.5 12.4a8.5 8.5 0 0 1 3-1.8M14.5 10.6a8.5 8.5 0 0 1 3 1.8M9.5 15.7a4 4 0 0 1 3-1M3 3l18 18" />
  {:else if name === 'loader'}
    <circle cx="12" cy="12" r="9" stroke-opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" />
  {:else if name === 'power'}
    <path d="M12 3v9" />
    <path d="M6.3 6.5a8 8 0 1 0 11.4 0" />
  {:else if name === 'dragv'}
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" stroke-width={stroke + 1.2} />
  {:else if name === 'arrow-down'}
    <path d="M12 4v16M6 14l6 6 6-6" />
  {:else if name === 'close-all'}
    <path d="M4 4l16 16M20 4 4 20" />
  {:else if name === 'eye'}
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  {:else}
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  {/if}
</svg>

<style>
  svg {
    flex: none;
    overflow: visible;
  }
</style>
