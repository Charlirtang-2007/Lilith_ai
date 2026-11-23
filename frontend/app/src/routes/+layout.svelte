<script>
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}

<svelte:head>
  <meta name="description" content="Lilith：Live2D 桌面伴侣，大模型对话与本地语音。" />
</svelte:head>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: transparent !important;
    overflow: hidden;
  }
  :global(#svelte) {
    width: 100%;
    height: 100%;
  }
</style>
