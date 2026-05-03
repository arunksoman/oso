<script lang="ts">
  import HugeiconsIcon from '$lib/components/Icon.svelte';
  import {
    Delete02Icon,
    Download01Icon,
    Copy01Icon,
    Scissor01Icon,
    FilePasteIcon,
    Search01Icon,
  } from '@hugeicons/core-free-icons';
  import { appState } from '$lib/stores/appState.svelte';

  let {
    hasSelectedFiles,
    searchBusy,
    oncopy,
    oncut,
    ondownload,
    onpaste,
    ondelete,
  }: {
    hasSelectedFiles: boolean;
    searchBusy: boolean;
    oncopy: () => void;
    oncut: () => void;
    ondownload: () => void;
    onpaste: () => void;
    ondelete: () => void;
  } = $props();
</script>

<div
  class="flex items-center gap-2 px-4 py-1.5 border-b text-xs shrink-0 select-none {appState
    .selectedKeys.size > 0
    ? 'bg-primary/8 border-primary/15'
    : 'border-transparent'}"
>
  {#if appState.selectedKeys.size > 0}
    <span class="text-primary font-semibold">{appState.selectedKeys.size} selected</span>
    <div class="flex items-center gap-1 ml-2">
      <button
        class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs"
        onclick={oncopy}
        title="Copy"
      >
        <HugeiconsIcon icon={Copy01Icon} size={12} />
        Copy
      </button>
      <button
        class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs"
        onclick={oncut}
        title="Cut"
      >
        <HugeiconsIcon icon={Scissor01Icon} size={12} />
        Cut
      </button>
      {#if hasSelectedFiles}
        <button
          class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs"
          onclick={ondownload}
          title="Download"
        >
          <HugeiconsIcon icon={Download01Icon} size={12} />
          Download
        </button>
      {/if}
      {#if appState.clipboard}
        <button
          class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs"
          onclick={onpaste}
          title="Paste"
        >
          <HugeiconsIcon icon={FilePasteIcon} size={12} />
          Paste
        </button>
      {/if}
      <span class="w-px h-3.5 bg-base-300 mx-1"></span>
      <button
        class="btn btn-ghost btn-xs h-5 min-h-0 px-2 gap-1 text-xs text-error hover:bg-error/10"
        onclick={ondelete}
        title="Delete selected"
      >
        <HugeiconsIcon icon={Delete02Icon} size={12} />
        Delete
      </button>
    </div>
    <button
      class="ml-auto text-base-content/30 hover:text-base-content/60 text-xs"
      onclick={() => {
        appState.selectedKeys = new Set();
      }}
    >
      Clear
    </button>
  {:else}
    <label
      class="input input-xs input-ghost bg-base-300/50 h-6 min-h-0 w-64 focus-within:w-80 transition-all gap-1.5 ml-auto"
    >
      <HugeiconsIcon icon={Search01Icon} size={12} />
      <input
        type="text"
        class="grow text-xs"
        placeholder="Filter..."
        bind:value={appState.searchQuery}
      />
      {#if searchBusy}
        <span class="loading loading-spinner loading-xs text-base-content/40"></span>
      {/if}
      {#if appState.searchQuery}
        <button
          class="text-base-content/40 hover:text-base-content/70 text-xs"
          onclick={() => {
            appState.searchQuery = '';
          }}>✕</button
        >
      {/if}
    </label>
  {/if}
</div>
