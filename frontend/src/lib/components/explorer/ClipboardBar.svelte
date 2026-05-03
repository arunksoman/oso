<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { FilePasteIcon } from '@hugeicons/core-free-icons';
  import { appState } from '$lib/stores/appState.svelte';

  let {
    onpaste,
    onclear,
  }: {
    onpaste: () => void;
    onclear: () => void;
  } = $props();
</script>

{#if appState.clipboard && appState.selectedKeys.size === 0}
  <div class="flex items-center gap-2 px-4 py-1.5 bg-info/8 border-b border-info/15 text-xs shrink-0">
    <HugeiconsIcon icon={FilePasteIcon} size={13} class="text-info" />
    <span class="text-info/70"
      >{appState.clipboard.keys.length} item(s) ready to {appState.clipboard.operation}</span
    >
    <button class="btn btn-info btn-xs h-5 min-h-0 px-2 ml-2 text-xs" onclick={onpaste}
      >Paste here</button
    >
    <button class="btn btn-ghost btn-xs h-5 min-h-0 px-2 text-xs" onclick={onclear}>Clear</button>
  </div>
{/if}
