<script lang="ts">
  import WindowControls from './WindowControls.svelte';
</script>

<div class="flex items-center justify-between px-3 py-2 border-b sticky top-0 border-base-300/60 bg-base-100 shrink-0" style="--wails-draggable: drag">
  <div class="h-7 flex-1"></div>
  <div style="--wails-draggable: no-drag">
    <WindowControls />
  </div>
</div>