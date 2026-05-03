<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import { FolderAddIcon } from '@hugeicons/core-free-icons';

  let {
    newFolderName = $bindable(''),
    creatingFolder,
    oncreate,
    oncancel,
  }: {
    newFolderName: string;
    creatingFolder: boolean;
    oncreate: () => void;
    oncancel: () => void;
  } = $props();

  function focus(node: HTMLElement) {
    node.focus();
  }
</script>

<div class="flex items-center gap-2 px-4 py-2 bg-base-200 border-b border-base-300 shrink-0">
  <HugeiconsIcon icon={FolderAddIcon} size={14} class="text-base-content/60" />
  <input
    class="input input-bordered input-xs bg-base-100 w-48 font-mono"
    placeholder="folder-name"
    bind:value={newFolderName}
    use:focus
    onkeydown={(e) => {
      if (e.key === 'Enter') oncreate();
      if (e.key === 'Escape') oncancel();
    }}
  />
  <button
    class="btn btn-primary btn-xs px-3"
    onclick={oncreate}
    disabled={creatingFolder || !newFolderName.trim()}
  >
    {#if creatingFolder}
      <span class="loading loading-spinner loading-xs"></span>
    {:else}
      Create
    {/if}
  </button>
  <button class="btn btn-ghost btn-xs" onclick={oncancel}>Cancel</button>
</div>
