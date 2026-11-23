<script>
  let {
    label = '',
    description = '',
    checked = $bindable(false),
    disabled = false,
  } = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
  }
</script>

<button
  class="row"
  class:on={checked}
  class:disabled
  role="switch"
  aria-checked={checked}
  {disabled}
  onclick={toggle}
>
  <span class="copy">
    <span class="label">{label}</span>
    {#if description}<span class="desc">{description}</span>{/if}
  </span>
  <span class="switch" aria-hidden="true">
    <span></span>
  </span>
</button>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    min-height: 42px;
    padding: 5px 0;
    text-align: left;
  }
  .copy {
    display: block;
    min-width: 0;
  }
  .label {
    display: block;
    margin: 0;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--text-1);
  }
  .desc {
    display: block;
    margin: 2px 0 0;
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--text-3);
  }
  .disabled {
    opacity: 0.45;
    cursor: default;
  }
  .switch {
    position: relative;
    width: 38px;
    height: 22px;
    flex: none;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: background var(--dur), border-color var(--dur), box-shadow var(--dur);
  }
  .switch span {
    position: absolute;
    top: 50%;
    left: 3px;
    width: 16px;
    height: 16px;
    transform: translateY(-50%);
    border-radius: 50%;
    background: #c5cee0;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
    transition: transform var(--dur) var(--ease-spring), background var(--dur);
  }
  .row.on .switch {
    background: rgba(169, 201, 255, 0.32);
    border-color: rgba(169, 201, 255, 0.45);
    box-shadow: 0 0 14px -6px rgba(169, 201, 255, 0.8);
  }
  .row.on .switch span {
    transform: translate(16px, -50%);
    background: var(--ice-strong);
  }
</style>