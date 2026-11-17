<script>
  import '../global.css';
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    background: transparent !important;
    overflow: hidden;
    width: 100%;
    height: 100%;
  }
</style>