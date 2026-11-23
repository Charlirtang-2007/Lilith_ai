<script>
  /** Ambient atmosphere behind the character: floor light + a few slow motes. */
  let { glow = true, sparkles = true } = $props();

  const motes = [
    { x: 22, y: 34, size: 2.2, delay: -2.4, duration: 9.5, drift: 14 },
    { x: 74, y: 28, size: 1.6, delay: -6.1, duration: 11.2, drift: -10 },
    { x: 62, y: 52, size: 2.8, delay: -1.2, duration: 8.4, drift: 18 },
    { x: 34, y: 62, size: 1.8, delay: -7.8, duration: 12.4, drift: -16 },
    { x: 82, y: 68, size: 1.4, delay: -4.5, duration: 10.1, drift: 8 },
    { x: 16, y: 74, size: 2, delay: -9.2, duration: 13.6, drift: 12 },
    { x: 48, y: 22, size: 1.4, delay: -3.1, duration: 9.9, drift: -9 },
  ];
</script>

<div class="ambient" aria-hidden="true">
  {#if glow}
    <div class="floor-shadow"></div>
    <div class="floor-glow"></div>
    <div class="floor-line"></div>
  {/if}
  {#if sparkles}
    <div class="motes">
      {#each motes as mote}
        <i
          style:left="{mote.x}%"
          style:top="{mote.y}%"
          style:width="{mote.size}px"
          style:height="{mote.size}px"
          style:animation-delay="{mote.delay}s"
          style:animation-duration="{mote.duration}s"
          style:--drift="{mote.drift}px"
        ></i>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ambient {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .floor-shadow {
    position: absolute;
    left: 50%;
    bottom: 18px;
    width: min(56%, 260px);
    height: 30px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.36) 0%, transparent 70%);
    filter: blur(10px);
    opacity: 0.8;
  }
  .floor-glow {
    position: absolute;
    left: 50%;
    bottom: 26px;
    width: min(78%, 360px);
    height: 52px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(
      ellipse at center,
      rgba(169, 201, 255, 0.28) 0%,
      rgba(122, 156, 224, 0.12) 38%,
      transparent 72%
    );
    filter: blur(14px);
    animation: lilith-breathe 7s ease-in-out infinite;
  }
  .floor-line {
    position: absolute;
    left: 50%;
    bottom: 45px;
    width: min(56%, 260px);
    height: 1px;
    transform: translateX(-50%);
    background: linear-gradient(90deg, transparent, rgba(169, 201, 255, 0.35), transparent);
    opacity: 0.55;
  }
  .motes i {
    position: absolute;
    border-radius: 50%;
    background: rgba(214, 230, 255, 0.9);
    box-shadow: 0 0 8px 1px rgba(169, 201, 255, 0.55);
    opacity: 0;
    animation-name: mote-float;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
  }
  @keyframes mote-float {
    0% {
      opacity: 0;
      transform: translate3d(0, 10px, 0) scale(0.5);
    }
    18% {
      opacity: 0.65;
    }
    55% {
      opacity: 0.35;
      transform: translate3d(var(--drift), -26px, 0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate3d(calc(var(--drift) * -0.5), -52px, 0) scale(0.4);
    }
  }
</style>
