<script>
  let {
    label = '',
    hint = '',
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    suffix = '',
    percent = false,
    disabled = false,
  } = $props();

  const pct = $derived(((Number(value) - min) / (max - min)) * 100);
  const display = $derived(
    percent ? `${Math.round(Number(value) * 100)}%` : `${Math.round(Number(value) * 10) / 10}${suffix}`
  );
</script>

<label class="slider-row" class:disabled>
  <div class="top">
    <div class="copy">
      <span class="label">{label}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </div>
    <span class="value">{display}</span>
  </div>
  <input
    type="range"
    {min}
    {max}
    {step}
    bind:value
    {disabled}
    aria-label={label}
    style:--pct="{pct}%"
  />
</label>

<style>
  .slider-row {
    display: block;
    padding: 6px 0 7px;
  }
  .top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 5px;
  }
  .copy {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .label {
    font-size: 12.5px;
    color: var(--text-1);
  }
  .hint {
    font-size: 10px;
    color: var(--text-3);
  }
  .value {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--ice);
    font-variant-numeric: tabular-nums;
  }
  .disabled {
    opacity: 0.45;
  }
  input[type="range"] {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 3px;
    border-radius: 99px;
    background: linear-gradient(
      90deg,
      var(--ice) 0%,
      var(--ice) var(--pct),
      rgba(255, 255, 255, 0.1) var(--pct),
      rgba(255, 255, 255, 0.1) 100%
    );
    outline: none;
    cursor: pointer;
  }
  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #e6f0ff;
    border: 2px solid #8fb0e0;
    box-shadow: 0 0 0 3px rgba(169, 201, 255, 0.12), 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: transform var(--dur-fast);
  }
  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.12);
  }
  input[type="range"]::-moz-range-thumb {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #e6f0ff;
    border: 2px solid #8fb0e0;
    box-shadow: 0 0 0 3px rgba(169, 201, 255, 0.12);
  }
  input[type="range"]::-moz-range-track {
    height: 3px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.1);
  }
  input[type="range"]::-moz-range-progress {
    height: 3px;
    border-radius: 99px;
    background: var(--ice);
  }
</style>
